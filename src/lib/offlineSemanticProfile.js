// Offline semantic profile builder — replaces Claude/LLM generate-semantic-profile
// Uses regex extraction + ontology normalizer + synonym expansion
// Zero external API calls, runs entirely in-browser

import { expandKeywordList } from "./disciplineSynonyms.js";
import { normalizeDisciplineValue, normalizeNationalityValue, normalizeCountryValue } from "./ontologyNormalizer.js";
import { toText, toList, unique } from "./textUtils.js";

const DEGREE_CLASS_RE = /\b(first class|1st class|2:1|2\.1|upper second|2:2|2\.2|lower second|third class|distinction|merit|pass|cgpa)\b/i;
const DEGREE_LEVEL_RE = /\b(ph\.?d|doctorate|doctoral|master'?s|msc|ma\b|mba|postgraduate|undergraduate|bachelor'?s|bsc|ba\b)\b/i;
const DISCIPLINE_RE = /\b(computer science|software engineering|data science|artificial intelligence|machine learning|engineering|mechanical engineering|electrical engineering|civil engineering|chemical engineering|public health|health sciences|nursing|medicine|pharmacy|business|management|finance|accounting|economics|law|legal studies|psychology|education|teaching|linguistics|environmental science|agriculture|biotechnology|biomedical science|political science|international relations|sociology|marketing|project management|supply chain|entrepreneurship)\b/i;
const COUNTRY_RE = /\b(nigeria(?:n)?|ghana(?:ian)?|kenya(?:n)?|south\s+africa(?:n)?|uk|united\s+kingdom|england|canada|canadian|usa|united\s+states|america(?:n)?|australia(?:n)?|india(?:n)?)\b/i;
const LANGUAGE_SCORE_RE = /\b(?:ielts|toefl|celpip)\b[^0-9]{0,30}(\d+(?:\.\d)?)\b/i;
const WORK_YEARS_RE = /\b(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:work\s*)?experience\b/i;
const GRADUATION_YEAR_RE = /\b(?:graduated|graduation|class of|completed)\b[^0-9]{0,20}(20\d{2})\b/i;

function extractFirst(re, text) {
  const match = String(text || "").match(re);
  return match ? match[1].toLowerCase().trim() : null;
}

function extractAll(re, text) {
  const results = [];
  const source = String(text || "").toLowerCase();
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const matcher = new RegExp(re.source, flags);
  let m;
  while ((m = matcher.exec(source)) !== null) {
    results.push(m[1].toLowerCase().trim());
  }
  return unique(results);
}

export function buildOfflineSemanticProfile(profile = {}, options = {}) {
  const {
    rawText = "",
    keywords = [],
    notes = "",
  } = options;

  const sourceText = [rawText, notes, ...(Array.isArray(keywords) ? keywords : [])].filter(Boolean).join(" ");
  const lowered = sourceText.toLowerCase();

  // ── Academic ────────────────────────────────────
  const degreeClassRaw = extractFirst(DEGREE_CLASS_RE, lowered);
  const degreeLevelRaw = extractFirst(DEGREE_LEVEL_RE, lowered);
  const disciplineRaw = extractFirst(DISCIPLINE_RE, lowered);
  const graduationYear = extractFirst(GRADUATION_YEAR_RE, lowered);

  // Normalize through ontology
  const discipline = normalizeDisciplineValue(disciplineRaw || profile?.academic?.discipline || profile?.targetDisciplines?.[0]);

  // ── Identity ────────────────────────────────────
  const countryRaw = extractFirst(COUNTRY_RE, lowered);
  const countryNormalized = normalizeCountryValue(countryRaw || profile?.identity?.countryOfResidence);
  const nationalityNormalized = normalizeNationalityValue(countryRaw || profile?.identity?.nationality);

  // ── Language ────────────────────────────────────
  const languageScoreRaw = extractFirst(LANGUAGE_SCORE_RE, lowered);

  // ── Professional ────────────────────────────────
  const workYears = extractFirst(WORK_YEARS_RE, lowered);

  // ── Build semantic text (replaces Claude output) ─
  const parts = [];
  if (degreeLevelRaw) parts.push(degreeLevelRaw);
  if (discipline?.resolved) parts.push(discipline.resolved);
  if (nationalityNormalized?.resolved) parts.push(nationalityNormalized.resolved);
  if (languageScoreRaw) parts.push(`IELTS ${languageScoreRaw}`);
  if (workYears) parts.push(`${workYears} years experience`);

  const semanticText = parts.length
    ? `${parts.join(", ")} candidate${graduationYear ? ` (graduated ${graduationYear})` : ""}.`
    : toText(profile?.semanticText || profile?.semantic_text || sourceText.slice(0, 300));

  // ── Build keywords with synonym expansion ───────
  const rawKeywords = [
    disciplineRaw,
    discipline?.resolved,
    discipline?.category,
    degreeLevelRaw,
    degreeClassRaw,
    countryRaw,
    countryNormalized?.resolved,
    nationalityNormalized?.resolved,
    ...extractAll(DISCIPLINE_RE, lowered).slice(1),
    ...toList(profile?.targetDisciplines),
    ...toList(profile?.keywords),
    ...(Array.isArray(keywords) ? keywords : []),
  ].filter(Boolean);

  const expandedKeywords = expandKeywordList(rawKeywords);
  const dedupedKeywords = unique(expandedKeywords).slice(0, 40);

  return {
    semanticText,
    keywords: dedupedKeywords,
    summary: semanticText,
    confidence: sourceText.length >= 200 ? 0.78 : sourceText.length >= 80 ? 0.65 : 0.45,
    model: "offline-regex-v1",
    usage: null,
    // Expose extracted fields for profile resolution
    extracted: {
      degreeClass: degreeClassRaw || null,
      degreeLevel: degreeLevelRaw || null,
      discipline: discipline?.resolved || disciplineRaw || null,
      disciplineCategory: discipline?.category || null,
      countryOfResidence: countryNormalized?.resolved || countryRaw || null,
      nationality: nationalityNormalized?.resolved || null,
      languageScore: languageScoreRaw ? Number.parseFloat(languageScoreRaw) : null,
      workExperienceYears: workYears ? Number.parseInt(workYears, 10) : null,
      graduationYear: graduationYear ? Number.parseInt(graduationYear, 10) : null,
      targetDisciplines: unique([
        ...(discipline?.resolved ? [discipline.resolved] : []),
        ...toList(profile?.targetDisciplines),
      ]),
    },
  };
}

export default buildOfflineSemanticProfile;
