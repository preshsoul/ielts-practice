from __future__ import annotations

import re


SECTION_HEADING_ALIASES: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "profile", "professional summary", "career objective", "objective"),
    "education": ("education", "academic background", "academic history", "qualifications"),
    "experience": ("experience", "work experience", "employment history", "professional experience", "career history"),
    "skills": ("skills", "technical skills", "core competencies", "competencies", "stack"),
    "projects": ("projects", "project experience", "selected projects"),
    "certifications": ("certifications", "certificates", "licenses"),
    "research": ("research", "publications"),
    "awards": ("awards", "honors", "honours", "achievements"),
    "leadership": ("leadership", "volunteering", "community service", "activities"),
    "contact": ("contact", "personal details"),
}

_HEADING_LOOKUP = {
    alias.lower(): canonical
    for canonical, aliases in SECTION_HEADING_ALIASES.items()
    for alias in aliases
}
_BULLET_PREFIX = re.compile(r"^\s*[-*•▪‣]\s*")


def normalize_whitespace(raw_text: str) -> str:
    text = raw_text.replace("\x00", " ").replace("\u00ad", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"[ ]*\n[ ]*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def repair_extracted_layout(raw_text: str) -> str:
    text = normalize_whitespace(raw_text)
    if not text:
        return text

    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    lines = [line.strip() for line in text.split("\n")]
    repaired: list[str] = []

    for line in lines:
        if not line:
            if repaired and repaired[-1] != "":
                repaired.append("")
            continue

        if repaired and repaired[-1] and _should_join_lines(repaired[-1], line):
            repaired[-1] = f"{repaired[-1]} {line}"
        else:
            repaired.append(line)

    rebuilt = "\n".join(repaired)
    rebuilt = re.sub(r"\n{3,}", "\n\n", rebuilt)
    return rebuilt.strip()


def split_sections(raw_text: str) -> dict[str, str]:
    text = repair_extracted_layout(raw_text)
    if not text:
        return {}

    sections: dict[str, list[str]] = {"general": []}
    current = "general"

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            if sections[current] and sections[current][-1] != "":
                sections[current].append("")
            continue

        heading = _canonicalize_heading(stripped)
        if heading:
            current = heading
            sections.setdefault(current, [])
            continue

        sections.setdefault(current, []).append(stripped)

    return {
        name: "\n".join(part for part in lines if part is not None).strip()
        for name, lines in sections.items()
        if any(part.strip() for part in lines)
    }


def _canonicalize_heading(line: str) -> str | None:
    cleaned = re.sub(r"[:\-–|]+$", "", line.strip()).lower()
    cleaned = _BULLET_PREFIX.sub("", cleaned)
    if cleaned in _HEADING_LOOKUP:
        return _HEADING_LOOKUP[cleaned]

    if len(cleaned.split()) <= 4 and cleaned.isupper():
        return _HEADING_LOOKUP.get(cleaned.lower())
    return None


def _should_join_lines(previous_line: str, current_line: str) -> bool:
    prev = previous_line.strip()
    curr = current_line.strip()
    if not prev or not curr:
        return False
    if _canonicalize_heading(prev):
        return False
    if prev.endswith((".", ":", ";", "?", "!", "|")):
        return False
    if _canonicalize_heading(curr):
        return False
    if _BULLET_PREFIX.match(curr):
        return False
    if re.match(r"^[A-Z][A-Z\s/&-]{2,}$", curr):
        return False
    if prev[-1].islower() and curr[0].islower():
        return True
    if prev[-1].isdigit() and curr[0].islower():
        return True
    if len(prev.split()) <= 3 and len(curr.split()) <= 3:
        return True
    return False
