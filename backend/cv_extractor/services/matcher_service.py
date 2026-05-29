from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from backend.cv_extractor.schemas import CvMatchCriteria, CvMatchExtractedMetadata, CvMatchResponse
from backend.cv_extractor.services.text_processing import repair_extracted_layout, split_sections


COMMON_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "for", "from", "in", "into", "is", "it", "of", "on",
    "or", "our", "the", "their", "this", "to", "with", "will", "your", "you", "we", "by", "that",
    "must", "should", "have", "has", "had", "who", "seeking", "looking", "candidate", "candidates",
    "strong", "background", "role", "position", "opportunity",
}
SECTION_WEIGHTS = {
    "education": 2.2,
    "skills": 2.0,
    "experience": 1.8,
    "projects": 1.5,
    "research": 1.3,
    "summary": 1.1,
    "general": 1.0,
}
DISCIPLINE_KEYWORDS = {
    "computer science",
    "software engineering",
    "information technology",
    "data science",
    "statistics",
    "mathematics",
    "economics",
    "finance",
    "public health",
    "medicine",
    "law",
    "business administration",
    "electrical engineering",
    "mechanical engineering",
    "civil engineering",
    "agriculture",
}
KNOWN_SKILL_PHRASES = {
    "python", "react", "fastapi", "postgresql", "docker", "javascript", "typescript", "node.js",
    "node", "sql", "rest api", "rest apis", "machine learning", "data analysis", "software engineering",
    "computer science", "monitoring", "evaluation", "public health", "research", "leadership",
}
EXAM_PATTERNS = {
    "IELTS": re.compile(r"\bielts\b(?:\s*(?:score|band)?\s*[:\-]?\s*(\d(?:\.\d)?))?", re.I),
    "TOEFL": re.compile(r"\btoefl\b(?:\s*(?:score)?\s*[:\-]?\s*(\d{2,3}))?", re.I),
    "GRE": re.compile(r"\bgre\b(?:\s*(?:score)?\s*[:\-]?\s*([\d/ ]+))?", re.I),
    "GMAT": re.compile(r"\bgmat\b(?:\s*(?:score)?\s*[:\-]?\s*(\d{2,3}))?", re.I),
}


@dataclass(slots=True)
class CandidateSignals:
    graduation_year: int | None = None
    degree_classification: str = "None"
    disciplines: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    exams: list[str] = field(default_factory=list)
    sections: dict[str, str] = field(default_factory=dict)
    weighted_text: str = ""


class DeterministicCvMatcher:
    def __init__(self) -> None:
        self.degree_patterns: dict[str, list[str]] = {
            "First Class": [r"\bfirst class\b", r"\b1st class\b", r"\bfirst-class\b"],
            "Second Class Upper": [r"\bsecond class upper\b", r"\b2:1\b", r"\b2\.1\b", r"\bupper second\b"],
            "Second Class Lower": [r"\bsecond class lower\b", r"\b2:2\b", r"\b2\.2\b", r"\blower second\b"],
            "Third Class": [r"\bthird class\b", r"\b3rd class\b", r"\bthird-class\b"],
            "Distinction": [r"\bdistinction\b"],
            "Merit": [r"\bmerit\b"],
            "Pass": [r"\bpass\b"],
        }
        self.degree_rank = {
            "First Class": 7,
            "Distinction": 6,
            "Second Class Upper": 5,
            "Merit": 4,
            "Second Class Lower": 3,
            "Pass": 2,
            "Third Class": 1,
            "None": 0,
        }

    def evaluate_candidate(self, raw_cv_text: str, schema_criteria: CvMatchCriteria) -> CvMatchResponse:
        candidate = self._extract_candidate_signals(raw_cv_text)
        requirements = self._extract_requirement_signals(schema_criteria.job_or_scholarship_description)

        compliance_flags: list[str] = []
        matched_signals: list[str] = []
        missing_signals: list[str] = []
        scoring_breakdown: dict[str, float] = {}

        is_eligible = True
        min_year = schema_criteria.min_graduation_year
        if min_year and candidate.graduation_year is not None and candidate.graduation_year < min_year:
            is_eligible = False
            compliance_flags.append(f"Graduation year {candidate.graduation_year} precedes required {min_year}.")

        normalized_allowed = self._normalize_allowed_degree_classes(schema_criteria.acceptable_degree_classes)
        if normalized_allowed:
            candidate_rank = self.degree_rank.get(candidate.degree_classification, 0)
            allowed_rank = max(self.degree_rank.get(value, 0) for value in normalized_allowed)
            if candidate_rank < allowed_rank:
                is_eligible = False
                compliance_flags.append(
                    f"Degree tier '{candidate.degree_classification}' is below the required threshold.",
                )

        text_similarity = self._compute_similarity_score(candidate.weighted_text, requirements["weighted_text"]) * 100
        keyword_overlap = self._ratio_overlap(candidate.skills + candidate.disciplines, requirements["keywords"]) * 100
        discipline_overlap = self._ratio_overlap(candidate.disciplines, requirements["disciplines"]) * 100
        exam_overlap = self._ratio_overlap(candidate.exams, requirements["exams"]) * 100 if requirements["exams"] else 100.0

        scoring_breakdown["text_similarity"] = round(text_similarity, 2)
        scoring_breakdown["keyword_overlap"] = round(keyword_overlap, 2)
        scoring_breakdown["discipline_overlap"] = round(discipline_overlap, 2)
        scoring_breakdown["exam_overlap"] = round(exam_overlap, 2)

        for keyword in requirements["keywords"][:10]:
            if self._contains_phrase(candidate.weighted_text, keyword):
                matched_signals.append(keyword)
            else:
                missing_signals.append(keyword)

        for exam in requirements["exams"]:
            if exam in candidate.exams:
                matched_signals.append(exam)
            else:
                compliance_flags.append(f"Requirement mentions {exam}, but the CV has no clear {exam} evidence.")
                missing_signals.append(exam)

        if requirements["disciplines"] and not candidate.disciplines:
            compliance_flags.append("No academic discipline could be confidently recovered from the CV text.")

        if keyword_overlap < 15:
            compliance_flags.append("The CV has low overlap with the requirement keywords after section-aware parsing.")

        if not is_eligible:
            match_percentage = 0.0
        else:
            composite_score = (
                (0.45 * text_similarity)
                + (0.30 * keyword_overlap)
                + (0.15 * discipline_overlap)
                + (0.10 * exam_overlap)
            )
            match_percentage = round(max(0.0, min(composite_score, 100.0)), 2)

        return CvMatchResponse(
            is_eligible=is_eligible,
            match_confidence_score=match_percentage,
            extracted_metadata=CvMatchExtractedMetadata(
                graduation_year=candidate.graduation_year,
                degree_classification=candidate.degree_classification,
                detected_disciplines=candidate.disciplines,
                detected_skills=candidate.skills[:20],
                detected_exams=candidate.exams,
                parser_strategy="section_weighted",
            ),
            compliance_flags=self._unique(compliance_flags),
            matched_signals=self._unique(matched_signals)[:20],
            missing_signals=self._unique(missing_signals)[:20],
            scoring_breakdown=scoring_breakdown,
        )

    def _extract_candidate_signals(self, raw_text: str) -> CandidateSignals:
        normalized = repair_extracted_layout(raw_text)
        sections = split_sections(normalized)
        education_text = sections.get("education") or normalized
        skills_text = "\n".join(filter(None, [
            sections.get("skills"),
            sections.get("projects"),
            sections.get("experience"),
            sections.get("summary"),
            sections.get("general"),
        ]))

        years = [int(year) for year in re.findall(r"\b(19[89]\d|199\d|20[0-3]\d)\b", education_text)]
        graduation_year = max(years) if years else None

        degree_classification = "None"
        for degree_class, patterns in self.degree_patterns.items():
            if any(re.search(pattern, education_text, re.I) for pattern in patterns):
                degree_classification = degree_class
                break

        disciplines = [
            discipline for discipline in sorted(DISCIPLINE_KEYWORDS)
            if self._contains_phrase(education_text, discipline)
        ]
        skill_candidates = self._extract_keywords(skills_text, limit=30)
        if {"python", "react", "fastapi", "postgresql"} & set(skill_candidates):
            skill_candidates.append("software engineering")
        exams = [
            exam for exam, pattern in EXAM_PATTERNS.items()
            if pattern.search(normalized)
        ]

        return CandidateSignals(
            graduation_year=graduation_year,
            degree_classification=degree_classification,
            disciplines=disciplines,
            skills=skill_candidates,
            exams=exams,
            sections=sections,
            weighted_text=self._build_weighted_text(sections),
        )

    def _extract_requirement_signals(self, description: str) -> dict[str, list[str] | str]:
        normalized = repair_extracted_layout(description)
        disciplines = [
            discipline for discipline in sorted(DISCIPLINE_KEYWORDS)
            if self._contains_phrase(normalized, discipline)
        ]
        exams = [
            exam for exam, pattern in EXAM_PATTERNS.items()
            if pattern.search(normalized)
        ]
        keywords = self._extract_keywords(normalized, limit=20)
        weighted_text = normalized
        return {
            "disciplines": disciplines,
            "exams": exams,
            "keywords": keywords,
            "weighted_text": weighted_text,
        }

    def _build_weighted_text(self, sections: dict[str, str]) -> str:
        parts: list[str] = []
        for section_name, text in sections.items():
            if not text:
                continue
            weight = max(1, int(math.ceil(SECTION_WEIGHTS.get(section_name, 1.0))))
            parts.extend([text] * weight)
        return "\n".join(parts)

    def _compute_similarity_score(self, candidate_text: str, requirement_text: str) -> float:
        if not candidate_text.strip() or not requirement_text.strip():
            return 0.0

        word_vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
        char_vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5))

        word_matrix = word_vectorizer.fit_transform([requirement_text, candidate_text])
        char_matrix = char_vectorizer.fit_transform([requirement_text, candidate_text])

        word_similarity = float(cosine_similarity(word_matrix[0:1], word_matrix[1:2])[0][0])
        char_similarity = float(cosine_similarity(char_matrix[0:1], char_matrix[1:2])[0][0])
        return max(0.0, min(((0.7 * word_similarity) + (0.3 * char_similarity)), 1.0))

    def _extract_keywords(self, text: str, limit: int) -> list[str]:
        unique: list[str] = []
        lowered = text.lower()
        blocked_tokens: set[str] = set()

        for phrase in sorted(KNOWN_SKILL_PHRASES | DISCIPLINE_KEYWORDS, key=len, reverse=True):
            if phrase in lowered and phrase not in unique:
                unique.append(phrase)
                blocked_tokens.update(re.findall(r"[a-z0-9+#./-]+", phrase))
                if len(unique) >= limit:
                    return unique

        tokens = re.findall(r"[A-Za-z][A-Za-z0-9+#./-]{2,}", lowered)
        for token in tokens:
            if token in COMMON_STOPWORDS or token.isdigit() or token in blocked_tokens:
                continue
            if token not in unique:
                unique.append(token)
            if len(unique) >= limit:
                break
        return unique

    def _normalize_allowed_degree_classes(self, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            lookup = value.strip().lower()
            for degree_class, patterns in self.degree_patterns.items():
                if lookup == degree_class.lower() or any(re.search(pattern, lookup, re.I) for pattern in patterns):
                    normalized.append(degree_class)
                    break
        return normalized

    def _ratio_overlap(self, candidate_values: list[str], requirement_values: list[str]) -> float:
        if not requirement_values:
            return 1.0
        candidate_set = {value.lower() for value in candidate_values}
        requirement_set = {value.lower() for value in requirement_values}
        matches = len(candidate_set & requirement_set)
        return matches / max(1, len(requirement_set))

    def _contains_phrase(self, text: str, phrase: str) -> bool:
        return phrase.lower() in text.lower()

    def _unique(self, values: list[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for value in values:
            if value and value not in seen:
                seen.add(value)
                ordered.append(value)
        return ordered


matcher = DeterministicCvMatcher()
