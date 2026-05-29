import {
  normalizeDegreeClassValue,
  normalizeDisciplineValue,
  normalizeLanguageScore,
  normalizeNationalityValue,
} from "./ontologyNormalizer.js";
import { toText, toList, unique } from "./textUtils.js";

export const CONFIDENCE_THRESHOLD = 0.65;

function toMaybeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(toText(value));
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some((item) => hasValue(item));
  if (typeof value === "object") return Object.values(value).some((item) => hasValue(item));
  return true;
}

function normalizeBooleanText(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  const text = toText(value).toLowerCase();
  if (!text) return "";
  if (["yes", "true", "1", "current", "currently"].includes(text)) return "yes";
  if (["no", "false", "0", "none"].includes(text)) return "no";
  return text;
}

function normalizeComparable(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return toText(value).toLowerCase();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeComparable(item))
      .filter((item) => item !== null)
      .sort();
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, normalizeComparable(item)])
        .filter(([, item]) => item !== null),
    );
  }
  return value;
}

function valuesEqual(left, right) {
  return JSON.stringify(normalizeComparable(left)) === JSON.stringify(normalizeComparable(right));
}

function createExtractedField(value, { confidence = 0, evidence = "", method = "heuristic_parse" } = {}) {
  if (!hasValue(value)) return null;
  return {
    value,
    confidence: Number.isFinite(Number(confidence)) ? Math.max(0, Math.min(1, Number(confidence))) : 0,
    evidence: toText(evidence) || JSON.stringify(value),
    method,
  };
}

function getLanguageTests(source = {}) {
  const languageTests = {
    ielts: toMaybeNumber(source?.languageTests?.ielts),
    toefl: toMaybeNumber(source?.languageTests?.toefl),
    celpip: toMaybeNumber(source?.languageTests?.celpip),
  };
  return hasValue(languageTests) ? languageTests : null;
}

export function createAssertedCandidateProfile(profile = {}) {
  const nationality = normalizeNationalityValue(profile?.identity?.nationality)?.resolved || toText(profile?.identity?.nationality) || null;
  const discipline = normalizeDisciplineValue(profile?.academic?.disciplineCategory || profile?.academic?.discipline)?.resolved || toText(profile?.academic?.disciplineCategory || profile?.academic?.discipline) || null;
  const degreeClass = normalizeDegreeClassValue(profile?.academic?.degreeClass, {
    cgpa: profile?.academic?.cgpa,
    cgpaScale: profile?.academic?.cgpaScale,
  })?.resolved || toText(profile?.academic?.degreeClass) || null;
  const ielts = normalizeLanguageScore("IELTS", profile?.languageTests?.ielts)?.score ?? toMaybeNumber(profile?.languageTests?.ielts);
  const toefl = normalizeLanguageScore("TOEFL", profile?.languageTests?.toefl)?.score ?? toMaybeNumber(profile?.languageTests?.toefl);
  const celpip = normalizeLanguageScore("CELPIP", profile?.languageTests?.celpip)?.score ?? toMaybeNumber(profile?.languageTests?.celpip);
  return {
    _track: "asserted",
    createdAt: profile?.candidateProfile?.asserted?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nationality,
    discipline,
    degreeClass,
    languageTests: hasValue({ ielts, toefl, celpip }) ? { ielts, toefl, celpip } : null,
    workExpYears: toMaybeNumber(profile?.professional?.workExperienceYears),
    targetCountries: unique(toList(profile?.targetCountries)),
    careerStatement: toText(profile?.semanticText || profile?.semantic_text) || null,
    researchInterests: unique([
      ...toList(profile?.targetDisciplines),
      ...toList(profile?.semanticKeywords),
      ...toList(profile?.semantic_keywords),
    ]),
  };
}

export function createExtractedCandidateProfile(intake = {}) {
  const parsed = intake?.parsedProfile || {};
  const provenance = intake?.provenance || {};
  const evidence = intake?.extractedExcerpt || intake?.label || intake?.sourceFilename || "";
  const confidence = Number.isFinite(Number(intake?.confidence)) ? Number(intake.confidence) : 0;
  const parserVersion = provenance.parser_version || provenance.parserVersion || "heuristic-v1";
  const parserMethod = provenance.method || "heuristic_parse";
  const nationality = normalizeNationalityValue(parsed?.identity?.nationality || parsed?.identity?.countryOfResidence)?.resolved || toText(parsed?.identity?.nationality || parsed?.identity?.countryOfResidence) || null;
  const discipline = normalizeDisciplineValue(parsed?.academic?.disciplineCategory || parsed?.academic?.discipline)?.resolved || toText(parsed?.academic?.disciplineCategory || parsed?.academic?.discipline) || null;
  const degreeClass = normalizeDegreeClassValue(parsed?.academic?.degreeClass, {
    cgpa: parsed?.academic?.cgpa,
    cgpaScale: parsed?.academic?.cgpaScale,
  })?.resolved || toText(parsed?.academic?.degreeClass) || null;
  const ielts = normalizeLanguageScore("IELTS", parsed?.languageTests?.ielts)?.score ?? toMaybeNumber(parsed?.languageTests?.ielts);
  const toefl = normalizeLanguageScore("TOEFL", parsed?.languageTests?.toefl)?.score ?? toMaybeNumber(parsed?.languageTests?.toefl);
  const celpip = normalizeLanguageScore("CELPIP", parsed?.languageTests?.celpip)?.score ?? toMaybeNumber(parsed?.languageTests?.celpip);

  return {
    _track: "extracted",
    sourceDocumentId: toText(intake?.rawTextHash || intake?.sourceFilename) || `cv-${Date.now()}`,
    extractedAt: new Date().toISOString(),
    parserVersion,
    nationality: createExtractedField(
      nationality,
      { confidence, evidence, method: parserMethod },
    ),
    discipline: createExtractedField(
      discipline,
      { confidence, evidence, method: parserMethod },
    ),
    degreeClass: createExtractedField(
      degreeClass,
      { confidence, evidence, method: parserMethod },
    ),
    languageTests: createExtractedField(hasValue({ ielts, toefl, celpip }) ? { ielts, toefl, celpip } : null, {
      confidence,
      evidence,
      method: parserMethod,
    }),
    workExpYears: createExtractedField(toMaybeNumber(parsed?.professional?.workExperienceYears), {
      confidence,
      evidence,
      method: parserMethod,
    }),
    rawKeywords: unique(toList(intake?.keywords)),
    rawSummary: toText(intake?.label || intake?.extractedExcerpt) || null,
  };
}

function resolveField(assertedValue, extractedField, fallbackReason) {
  if (hasValue(assertedValue) && extractedField?.value !== undefined && extractedField?.value !== null) {
    if (valuesEqual(assertedValue, extractedField.value)) {
      return { state: "confirmed", value: assertedValue, source: "both" };
    }
    return { state: "conflict", asserted: assertedValue, extracted: extractedField };
  }

  if (hasValue(assertedValue)) {
    return { state: "confirmed", value: assertedValue, source: "asserted" };
  }

  if (extractedField?.value !== undefined && extractedField?.value !== null) {
    if (Number(extractedField.confidence || 0) >= CONFIDENCE_THRESHOLD) {
      return { state: "extracted_only", extracted: extractedField };
    }
    return { state: "needs_verification", reason: `${fallbackReason} was detected from the CV at low confidence.` };
  }

  return { state: "needs_verification", reason: fallbackReason };
}

export function buildResolvedCandidateProfile({
  candidateId = "anonymous",
  assertedProfile = {},
  extractedProfile = null,
  semanticContext = null,
  profileKeywords = [],
  embedding = null,
  embeddingHash = null,
  embeddingModel = null,
} = {}) {
  const resolved = {
    _track: "resolved",
    candidateId,
    resolvedAt: new Date().toISOString(),
    nationality: resolveField(assertedProfile?.nationality, extractedProfile?.nationality, "Nationality is missing."),
    discipline: resolveField(assertedProfile?.discipline, extractedProfile?.discipline, "Discipline is missing."),
    degreeClass: resolveField(assertedProfile?.degreeClass, extractedProfile?.degreeClass, "Degree class is missing."),
    languageTests: resolveField(assertedProfile?.languageTests, extractedProfile?.languageTests, "Language test scores are missing."),
    workExpYears: resolveField(assertedProfile?.workExpYears, extractedProfile?.workExpYears, "Work experience is missing."),
    targetCountries: unique(assertedProfile?.targetCountries || []),
    semanticContext: toText(semanticContext) || null,
    profileKeywords: unique(profileKeywords),
    embedding: Array.isArray(embedding) ? embedding : null,
    embeddingHash: toText(embeddingHash) || null,
    embeddingModel: toText(embeddingModel) || null,
    unresolvedConflicts: [],
    verificationGaps: [],
  };

  for (const [field, value] of Object.entries({
    nationality: resolved.nationality,
    discipline: resolved.discipline,
    degreeClass: resolved.degreeClass,
    languageTests: resolved.languageTests,
    workExpYears: resolved.workExpYears,
  })) {
    if (value?.state === "conflict") {
      resolved.unresolvedConflicts.push({
        field,
        assertedValue: value.asserted,
        extractedValue: value.extracted?.value ?? null,
        extractedConfidence: Number(value.extracted?.confidence || 0),
      });
    }
    if (value?.state === "needs_verification") {
      resolved.verificationGaps.push({
        field,
        reason: value.reason,
      });
    }
  }

  return resolved;
}

export function resolveCandidateProfile(profile = {}, { candidateId = null } = {}) {
  const extractedProfile = profile?.candidateProfile?.extracted || profile?.candidate_profile?.extracted || null;
  const assertedProfile = createAssertedCandidateProfile(profile);
  return {
    asserted: assertedProfile,
    extracted: extractedProfile,
    resolved: buildResolvedCandidateProfile({
      candidateId: candidateId || profile?.id || profile?.candidateId || "anonymous",
      assertedProfile,
      extractedProfile,
      semanticContext: profile?.semanticText || profile?.semantic_text || extractedProfile?.rawSummary || null,
      profileKeywords: unique([
        ...toList(profile?.semanticKeywords),
        ...toList(profile?.semantic_keywords),
        ...(Array.isArray(extractedProfile?.rawKeywords) ? extractedProfile.rawKeywords : []),
        ...assertedProfile.researchInterests,
      ]),
      embedding: Array.isArray(profile?.embedding) ? profile.embedding : Array.isArray(profile?.candidate_embedding) ? profile.candidate_embedding : null,
      embeddingHash: profile?.embeddingHash || profile?.embedding_hash || null,
      embeddingModel: profile?.embeddingModel || profile?.embedding_model || null,
    }),
  };
}

export function getResolvedFieldValue(field, { allowLowConfidence = false } = {}) {
  if (!field || typeof field !== "object") return { available: false, reason: "missing", confidence: null, value: null };
  if (field.state === "confirmed") {
    return { available: true, value: field.value, confidence: null, source: field.source };
  }
  if (field.state === "extracted_only") {
    const confidence = Number(field.extracted?.confidence || 0);
    if (confidence >= CONFIDENCE_THRESHOLD || allowLowConfidence) {
      return { available: true, value: field.extracted?.value ?? null, confidence, source: "extracted" };
    }
    return { available: false, reason: "low_confidence", confidence, value: null };
  }
  if (field.state === "conflict") {
    return { available: false, reason: "conflict", confidence: Number(field.extracted?.confidence || 0), value: null };
  }
  return { available: false, reason: "missing", confidence: null, value: null };
}
