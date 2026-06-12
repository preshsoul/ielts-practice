import { getProfileCompletion } from "../lib/profileCompletion.js";
import { classifyOpportunityFocus } from "../lib/opportunitySignals.js";
import { getResolvedFieldValue, resolveCandidateProfile } from "../lib/candidateProfile.js";
import {
  cgpaToDegreeClass,
  normalizeCountryValue,
  normalizeDegreeClassValue,
  normalizeDisciplineValue,
  normalizeLanguageScore,
  normalizeNationalityValue,
} from "../lib/ontologyNormalizer.js";
const DEGREE_RANK = {
  first: 4,
  "2:1": 3,
  "2:2": 2,
  third: 1,
};

const DOCUMENT_BURDEN_WEIGHTS = {
  "research proposal": 1,
  portfolio: 0.9,
  interview: 0.8,
  "personal statement": 0.7,
  "statement of purpose": 0.7,
  "academic references": 0.5,
  "reference letter": 0.5,
  transcript: 0.2,
  "ielts certificate": 0.2,
  "pte certificate": 0.2,
  cv: 0.1,
  resume: 0.1,
};

const PROVISIONAL_FIELD_WEIGHTS = {
  nationality: 1,
  discipline: 0.6,
  degree: 0.75,
  language: 0.9,
  experience: 0.4,
};

const GAP_PENALTY_UNIT = 0.12;
const MAX_TOTAL_PROVISIONAL_PENALTY = 0.45;

const DEFAULT_COVERAGE_WEIGHTS = {
  funding: 0.6,
  stipend: 0.15,
  travel: 0.15,
  accommodation: 0.1,
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function cosineSimilarity(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0 || left.length !== right.length) {
    return null;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index]);
    const b = Number(right[index]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return null;
    }
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }

  if (!leftNorm || !rightNorm) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

import { toText, toList, unique } from "../lib/textUtils.js";
import { expandKeywordList } from "../lib/disciplineSynonyms.js";

function toMaybeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBooleanInput(value) {
  if (value === true || value === false) return value;
  const text = toText(value).toLowerCase();
  if (!text) return null;
  if (["true", "yes", "y", "1", "current", "currently"].includes(text)) return true;
  if (["false", "no", "n", "0", "none"].includes(text)) return false;
  return null;
}

function normalizeNationality(value) {
  return normalizeNationalityValue(value)?.resolved || toText(value);
}

function normalizeDisciplineCategory(value) {
  return normalizeDisciplineValue(value)?.resolved || toText(value);
}

function normalizeDegreeClass(value, options = {}) {
  return normalizeDegreeClassValue(value, options)?.resolved || "";
}

function rankDegreeClass(value) {
  return DEGREE_RANK[normalizeDegreeClass(value)] || 0;
}

function normalizeLanguageTest(value, test = "IELTS") {
  const normalized = normalizeLanguageScore(test, value);
  return normalized ? normalized.score : null;
}

function tokenize(value) {
  return toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function createStructuredProfileDraft(profile = {}) {
  return {
    identity: {
      nationality: toText(profile.identity?.nationality),
      countryOfResidence: toText(profile.identity?.countryOfResidence),
      ageAtApplicationCycle: toText(profile.identity?.ageAtApplicationCycle),
    },
    academic: {
      degreeClass: toText(profile.academic?.degreeClass),
      institution: toText(profile.academic?.institution),
      institutionCountry: toText(profile.academic?.institutionCountry),
      discipline: toText(profile.academic?.discipline),
      disciplineCategory: toText(profile.academic?.disciplineCategory),
      graduationYear: toText(profile.academic?.graduationYear),
      cgpa: toText(profile.academic?.cgpa),
      cgpaScale: toText(profile.academic?.cgpaScale || "5"),
    },
    professional: {
      workExperienceYears: toText(profile.professional?.workExperienceYears),
      currentlyEmployed: profile.professional?.currentlyEmployed === null || profile.professional?.currentlyEmployed === undefined
        ? ""
        : profile.professional.currentlyEmployed
          ? "yes"
          : "no",
      sector: toText(profile.professional?.sector),
    },
    languageTests: {
      ielts: toText(profile.languageTests?.ielts),
      toefl: toText(profile.languageTests?.toefl),
      celpip: toText(profile.languageTests?.celpip),
      ieltsBands: {
        listening: toText(profile.languageTests?.ieltsBands?.listening),
        reading: toText(profile.languageTests?.ieltsBands?.reading),
        writing: toText(profile.languageTests?.ieltsBands?.writing),
        speaking: toText(profile.languageTests?.ieltsBands?.speaking),
      },
    },
    applicationCycle: toText(profile.applicationCycle),
    targetDegreeLevel: toText(profile.targetDegreeLevel),
    targetDisciplines: toList(profile.targetDisciplines).join(", "),
    targetCountries: toList(profile.targetCountries).join(", "),
    tier: toText(profile.tier || "free") || "free",
  };
}

export function normalizeStructuredProfile(profile = {}) {
  return {
    identity: {
      nationality: normalizeNationality(profile.identity?.nationality) || null,
      countryOfResidence: normalizeCountryValue(profile.identity?.countryOfResidence)?.resolved || toText(profile.identity?.countryOfResidence) || null,
      ageAtApplicationCycle: toMaybeNumber(profile.identity?.ageAtApplicationCycle),
    },
    academic: {
      degreeClass: normalizeDegreeClass(profile.academic?.degreeClass, { cgpa: profile.academic?.cgpa, cgpaScale: profile.academic?.cgpaScale }) || normalizeDegreeClass(cgpaToDegreeClass(profile.academic?.cgpa, profile.academic?.cgpaScale)) || null,
      institution: toText(profile.academic?.institution) || null,
      institutionCountry: toText(profile.academic?.institutionCountry) || null,
      discipline: toText(profile.academic?.discipline) || null,
      disciplineCategory: normalizeDisciplineCategory(profile.academic?.disciplineCategory || profile.academic?.discipline) || null,
      graduationYear: toMaybeNumber(profile.academic?.graduationYear),
      cgpa: toMaybeNumber(profile.academic?.cgpa),
      cgpaScale: toMaybeNumber(profile.academic?.cgpaScale) || 5,
    },
    professional: {
      workExperienceYears: toMaybeNumber(profile.professional?.workExperienceYears),
      currentlyEmployed: normalizeBooleanInput(profile.professional?.currentlyEmployed),
      sector: toText(profile.professional?.sector) || null,
    },
    languageTests: {
      ielts: normalizeLanguageTest(profile.languageTests?.ielts, "IELTS"),
      toefl: normalizeLanguageTest(profile.languageTests?.toefl, "TOEFL"),
      celpip: normalizeLanguageTest(profile.languageTests?.celpip, "CELPIP"),
      ieltsBands: profile.languageTests?.ieltsBands && typeof profile.languageTests.ieltsBands === "object"
        ? {
            listening: toMaybeNumber(profile.languageTests.ieltsBands.listening),
            reading: toMaybeNumber(profile.languageTests.ieltsBands.reading),
            writing: toMaybeNumber(profile.languageTests.ieltsBands.writing),
            speaking: toMaybeNumber(profile.languageTests.ieltsBands.speaking),
          }
        : null,
    },
    applicationCycle: toMaybeNumber(profile.applicationCycle) ?? (toText(profile.applicationCycle) || null),
    targetDegreeLevel: toText(profile.targetDegreeLevel) || null,
    targetDisciplines: unique(toList(profile.targetDisciplines)),
    targetCountries: unique(toList(profile.targetCountries)),
    tier: toText(profile.tier || "free") || "free",
  };
}

export function serializeStructuredProfileDraft(draft = {}) {
  return {
    identity: {
      nationality: toText(draft.identity?.nationality) || null,
      countryOfResidence: toText(draft.identity?.countryOfResidence) || null,
      ageAtApplicationCycle: toMaybeNumber(draft.identity?.ageAtApplicationCycle),
    },
    academic: {
      degreeClass: normalizeDegreeClass(draft.academic?.degreeClass, { cgpa: draft.academic?.cgpa, cgpaScale: draft.academic?.cgpaScale }) || null,
      institution: toText(draft.academic?.institution) || null,
      institutionCountry: toText(draft.academic?.institutionCountry) || null,
      discipline: toText(draft.academic?.discipline) || null,
      disciplineCategory: toText(draft.academic?.disciplineCategory) || null,
      graduationYear: toMaybeNumber(draft.academic?.graduationYear),
      cgpa: toMaybeNumber(draft.academic?.cgpa),
      cgpaScale: toMaybeNumber(draft.academic?.cgpaScale) || 5,
    },
    professional: {
      workExperienceYears: toMaybeNumber(draft.professional?.workExperienceYears) || 0,
      currentlyEmployed: normalizeBooleanInput(draft.professional?.currentlyEmployed),
      sector: toText(draft.professional?.sector) || null,
    },
    languageTests: {
      ielts: normalizeLanguageTest(draft.languageTests?.ielts, "IELTS"),
      toefl: normalizeLanguageTest(draft.languageTests?.toefl, "TOEFL"),
      celpip: normalizeLanguageTest(draft.languageTests?.celpip, "CELPIP"),
      ieltsBands: draft.languageTests?.ieltsBands && typeof draft.languageTests.ieltsBands === "object"
        ? {
            listening: toMaybeNumber(draft.languageTests.ieltsBands.listening),
            reading: toMaybeNumber(draft.languageTests.ieltsBands.reading),
            writing: toMaybeNumber(draft.languageTests.ieltsBands.writing),
            speaking: toMaybeNumber(draft.languageTests.ieltsBands.speaking),
          }
        : {
            listening: null,
            reading: null,
            writing: null,
            speaking: null,
          },
    },
    applicationCycle: toText(draft.applicationCycle) || null,
    targetDegreeLevel: toText(draft.targetDegreeLevel) || null,
    targetDisciplines: unique(toList(draft.targetDisciplines)),
    targetCountries: unique(toList(draft.targetCountries)),
    tier: toText(draft.tier || "free") || "free",
  };
}

export function buildProfileKeywords(profile = {}) {
  const normalized = normalizeStructuredProfile(profile);
  const candidateProfile = resolveCandidateProfile(profile);
  const keywords = [
    toText(profile.semanticText),
    toText(profile.semantic_text),
    ...toList(profile.semanticKeywords),
    ...toList(profile.semantic_keywords),
    normalized.identity.nationality,
    normalized.identity.countryOfResidence,
    normalized.academic.institution,
    normalized.academic.institutionCountry,
    normalized.academic.discipline,
    normalized.academic.disciplineCategory,
    normalized.professional.sector,
    normalized.targetDegreeLevel,
    ...normalized.targetDisciplines,
    ...normalized.targetCountries,
    ...(Array.isArray(candidateProfile?.resolved?.profileKeywords) ? candidateProfile.resolved.profileKeywords : []),
  ];
  return unique(keywords.flatMap(tokenize));
}

function normalizeScholarshipNationalityList(values = []) {
  return unique(toList(values).map(normalizeNationality));
}

function normalizeScholarshipDisciplines(values = []) {
  const output = [];
  for (const value of toList(values)) {
    output.push(value);
    const result = normalizeDisciplineValue(value);
    if (result.resolved && result.resolved !== value) output.push(result.resolved);
  }
  return unique(output);
}

function isOpenNationalityRequirement(values = [], scholarship = {}) {
  if (!values.length) return true;
  const lowered = values.map((value) => normalizeNationality(value).toLowerCase());
  return lowered.includes("any") || lowered.includes("international") || lowered.includes("open");
}

function getCandidateNationality(profile = {}) {
  return normalizeNationality(profile.identity?.nationality || profile.identity?.countryOfResidence || "");
}

function getCandidateDisciplineSignals(profile = {}) {
  const signals = unique([
    profile.academic?.discipline,
    profile.academic?.disciplineCategory,
    ...(Array.isArray(profile.targetDisciplines) ? profile.targetDisciplines : []),
  ]);
  const taxonomized = [];
  for (const value of signals) {
    const raw = toText(value);
    if (raw) taxonomized.push(raw);
    const category = normalizeDisciplineCategory(value);
    if (category) taxonomized.push(category);
  }
  return unique(taxonomized);
}

function getResolvedCandidateSignals(profile = {}) {
  const candidateProfile = resolveCandidateProfile(profile);
  const resolved = candidateProfile?.resolved || null;
  if (!resolved) return null;

  return {
    resolved,
    nationality: getResolvedFieldValue(resolved.nationality),
    discipline: getResolvedFieldValue(resolved.discipline),
    degreeClass: getResolvedFieldValue(resolved.degreeClass),
    languageTests: getResolvedFieldValue(resolved.languageTests),
    workExpYears: getResolvedFieldValue(resolved.workExpYears),
  };
}

function getRequiredDocumentsWeight(documents = []) {
  const list = Array.isArray(documents) ? documents : [];
  if (!list.length) return 0.35;

  const total = list.reduce((sum, documentName) => {
    const normalized = toText(documentName).toLowerCase();
    const match = Object.entries(DOCUMENT_BURDEN_WEIGHTS).find(([key]) => normalized.includes(key));
    return sum + (match ? match[1] : 0.4);
  }, 0);

  return Math.max(0.05, Math.min(1, total / list.length));
}

function computeDeadlinePressure(deadline, { now = Date.now() } = {}) {
  if (!deadline) {
    return { pressure: 0.5, daysRemaining: null, blocked: false };
  }

  const deadlineDate = new Date(deadline);
  const daysRemaining = (deadlineDate.getTime() - now) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(daysRemaining)) {
    return { pressure: 0.5, daysRemaining: null, blocked: false };
  }

  if (daysRemaining < 0) {
    return { pressure: 0, daysRemaining, blocked: true };
  }
  if (daysRemaining < 14) return { pressure: 1, daysRemaining, blocked: false };
  if (daysRemaining < 30) return { pressure: 0.8, daysRemaining, blocked: false };
  if (daysRemaining < 90) return { pressure: 0.6, daysRemaining, blocked: false };
  return { pressure: 0.3, daysRemaining, blocked: false };
}

function computeProvenanceConfidence(scholarship = {}, { now = Date.now() } = {}) {
  const provenance = scholarship.provenance || {};
  const source = scholarship.source || {};
  const sourceType = toText(provenance.sourceType || source.sourceType).toLowerCase();
  const base = clamp01(
    toMaybeNumber(provenance.confidenceScore) ??
      toMaybeNumber(source.confidence) ??
      0.5
  );
  const decay = clamp01(toMaybeNumber(provenance.confidenceDecayRatePerDay) ?? 0.001);
  const verifiedAt = provenance.lastVerifiedAt || provenance.scrapedAt || source.scrapedAt || null;
  const daysSinceVerified = verifiedAt ? Math.max(0, (now - new Date(verifiedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const decayed = base * Math.exp(-daysSinceVerified * decay);
  const ceiling = sourceType === "scraped" ? 0.95 : 1;
  return {
    raw: base,
    value: Math.max(0.2, Math.min(ceiling, clamp01(decayed))),
    daysSinceVerified,
  };
}

function computeCoverageScore(scholarship = {}) {
  const coverage = scholarship.coverage || {};
  const type = toText(coverage.type).toLowerCase();
  const funding =
    type === "full" ? 1
      : type === "partial" ? 0.6
        : type === "tuition" || coverage.tuitionCovered ? 0.35
          : 0.2;
  const stipend = clamp01(toMaybeNumber(coverage.stipendAmount) ? 1 : coverage.stipend === true || coverage.stipendCovered === true ? 1 : 0);
  const travel = clamp01(coverage.flightsCovered || coverage.travelGrant || coverage.travelCovered ? 1 : 0);
  const accommodation = clamp01(coverage.livingCovered || coverage.accommodationCovered ? 1 : 0);
  const numericBonus = coverage.numericAmount ? Math.min(0.2, Math.max(0, Number(coverage.numericAmount) / 250000)) : 0;
  const coverageScore = clamp01(
    funding * DEFAULT_COVERAGE_WEIGHTS.funding +
    stipend * DEFAULT_COVERAGE_WEIGHTS.stipend +
    travel * DEFAULT_COVERAGE_WEIGHTS.travel +
    accommodation * DEFAULT_COVERAGE_WEIGHTS.accommodation +
    numericBonus
  );
  return { score: coverageScore, funding, stipend, travel, accommodation };
}

function computeOpportunityPriority(scholarship = {}) {
  const focus = classifyOpportunityFocus(scholarship);
  const signals = {
    international: focus.internationalSignal ? 1 : 0,
    graduateTrainee: focus.graduateTraineeSignal ? 1 : 0,
    nigeriaOnly: focus.nigeriaOnlySignal ? 1 : 0,
  };
  const score = clamp01(focus.priorityScore ?? 0);
  return { ...focus, score, signals };
}

function computeEligibilityScore(candidate = {}, scholarship = {}, resolvedSignals = null) {
  const blockedReasons = [];
  const criteria = [];
  const provisionalGaps = [];
  let provisionalPenalty = 0;

  const scholarshipEligibility = scholarship.eligibility || {};
  const addGap = (field, detail, confidence = null, multiplier = 1) => {
    provisionalGaps.push(detail);
    provisionalPenalty += GAP_PENALTY_UNIT * (PROVISIONAL_FIELD_WEIGHTS[field] || 0.5) * multiplier;
    return confidence;
  };
  const conflictFields = Object.entries({
    nationality: resolvedSignals?.nationality,
    discipline: resolvedSignals?.discipline,
    degree: resolvedSignals?.degreeClass,
    language: resolvedSignals?.languageTests,
    experience: resolvedSignals?.workExpYears,
  }).filter(([, signal]) => signal?.reason === "conflict");

  if (conflictFields.length) {
    return {
      score: 0,
      blockedReasons: conflictFields.map(([field]) => `${field} needs verification before matching can continue`),
      criteria,
      blocked: true,
      provisionalGaps,
      provisionalPenalty: 0,
    };
  }

  const candidateNationality = resolvedSignals?.nationality?.available
    ? normalizeNationality(resolvedSignals.nationality.value)
    : getCandidateNationality(candidate);
  const scholarshipNationalities = normalizeScholarshipNationalityList(scholarship.eligibility?.nationalities);
  const candidateCountry = normalizeNationality(candidate.identity?.countryOfResidence || "");
  const nationalityOpen = isOpenNationalityRequirement(scholarshipNationalities, scholarshipEligibility);
  const allowedNationalities = scholarshipNationalities.map((value) => normalizeNationality(value).toLowerCase()).filter(Boolean);
  const candidateNationalityKey = candidateNationality.toLowerCase();
  const candidateCountryKey = candidateCountry.toLowerCase();
  const onlyNigerianEligible = scholarshipEligibility.nigerianEligible === true && allowedNationalities.length === 0;
  const nationalityMatch = nationalityOpen ||
    (onlyNigerianEligible ? candidateNationalityKey === "nigerian" : false) ||
    (candidateNationalityKey && allowedNationalities.includes(candidateNationalityKey)) ||
    (candidateCountryKey && allowedNationalities.includes(candidateCountryKey));
  const nationalityFromExtraction = resolvedSignals?.nationality?.source === "extracted";
  const nationalityScore = nationalityMatch ? 1 : 0;

  if (resolvedSignals?.nationality && !resolvedSignals.nationality.available && !nationalityOpen && (allowedNationalities.length > 0 || onlyNigerianEligible)) {
    addGap(
      "nationality",
      resolvedSignals.nationality.reason === "low_confidence"
        ? "Nationality was detected from the CV at low confidence."
        : "Nationality is missing and should be verified.",
      resolvedSignals.nationality.confidence,
      resolvedSignals.nationality.reason === "low_confidence" ? 0.5 : 1,
    );
  } else if (scholarshipEligibility.nigerianEligible === false && candidateNationalityKey === "nigerian" && !nationalityFromExtraction) {
    blockedReasons.push("scholarship excludes Nigerian candidates");
  } else if (onlyNigerianEligible && !candidateNationalityKey && !resolvedSignals) {
    blockedReasons.push("nationality missing");
  } else if (onlyNigerianEligible && candidateNationalityKey !== "nigerian" && !nationalityFromExtraction) {
    blockedReasons.push("scholarship requires Nigerian nationality");
  }

  if (!candidateNationality && !nationalityOpen && (allowedNationalities.length > 0 || onlyNigerianEligible) && !resolvedSignals) {
    blockedReasons.push("nationality missing");
  } else if (!nationalityMatch && nationalityFromExtraction) {
    addGap("nationality", "The CV-detected nationality may not meet this scholarship's requirement.", resolvedSignals?.nationality?.confidence);
  } else if (!nationalityMatch) {
    blockedReasons.push("nationality requirement not met");
  }
  criteria.push({ key: "nationality", label: "Nationality fit", score: nationalityScore, max: 1, reason: nationalityMatch ? "open or matched" : nationalityFromExtraction ? "cv-detected nationality needs verification" : "candidate nationality does not match scholarship" });

  const candidateDisciplines = resolvedSignals?.discipline?.available
    ? unique([resolvedSignals.discipline.value, normalizeDisciplineCategory(resolvedSignals.discipline.value)])
    : getCandidateDisciplineSignals(candidate);
  const scholarshipDisciplines = normalizeScholarshipDisciplines([
    ...(scholarshipEligibility.disciplines || []),
    ...(scholarshipEligibility.targetProgrammes || []),
    ...(scholarshipEligibility.disciplineCategories || []),
    scholarshipEligibility.disciplineCategory || "",
  ]);
  const disciplineOpen = scholarshipDisciplines.length === 0;
  const disciplineMatch = disciplineOpen || scholarshipDisciplines.some((discipline) => {
    const scholarshipNormalized = toText(discipline).toLowerCase();
    return candidateDisciplines.some((candidateValue) => {
      const candidateNormalized = toText(candidateValue).toLowerCase();
      return candidateNormalized === scholarshipNormalized || normalizeDisciplineCategory(candidateValue).toLowerCase() === normalizeDisciplineCategory(discipline).toLowerCase();
    });
  });
  const disciplineFromExtraction = resolvedSignals?.discipline?.source === "extracted";
  if (resolvedSignals?.discipline && !resolvedSignals.discipline.available && !disciplineOpen) {
    addGap(
      "discipline",
      resolvedSignals.discipline.reason === "low_confidence"
        ? "Discipline was detected from the CV at low confidence."
        : "Discipline is missing and should be verified.",
      resolvedSignals.discipline.confidence,
      resolvedSignals.discipline.reason === "low_confidence" ? 0.5 : 1,
    );
  } else if (!candidateDisciplines.length && !disciplineOpen && !resolvedSignals) {
    blockedReasons.push("discipline missing");
  }
  if (!disciplineMatch && disciplineFromExtraction) {
    addGap("discipline", "The CV-detected discipline may not align with the scholarship taxonomy.", resolvedSignals?.discipline?.confidence);
  } else if (!disciplineMatch) {
    blockedReasons.push("discipline requirement not met");
  }
  criteria.push({ key: "discipline", label: "Discipline fit", score: disciplineMatch ? 1 : 0, max: 1, reason: disciplineOpen ? "open discipline" : disciplineMatch ? "matches taxonomy" : disciplineFromExtraction ? "cv-detected discipline needs verification" : "no taxonomy overlap" });

  const degreeRequired = rankDegreeClass(scholarship.degreeClassMin || scholarshipEligibility.degreeClassMin || scholarshipEligibility.degreeClassRequired);
  const candidateDegreeClass = resolvedSignals?.degreeClass?.available
    ? normalizeDegreeClass(resolvedSignals.degreeClass.value)
    : candidate.academic?.degreeClass || cgpaToDegreeClass(candidate.academic?.cgpa, candidate.academic?.cgpaScale);
  const degreeCandidate = rankDegreeClass(candidateDegreeClass);
  const degreeOpen = !degreeRequired;
  const degreeMatch = degreeOpen || (degreeCandidate && degreeCandidate >= degreeRequired);
  const degreeFromExtraction = resolvedSignals?.degreeClass?.source === "extracted";
  if (resolvedSignals?.degreeClass && !resolvedSignals.degreeClass.available && degreeRequired) {
    addGap(
      "degree",
      resolvedSignals.degreeClass.reason === "low_confidence"
        ? "Degree class was detected from the CV at low confidence."
        : "Degree class is missing and should be verified.",
      resolvedSignals.degreeClass.confidence,
      resolvedSignals.degreeClass.reason === "low_confidence" ? 0.5 : 1,
    );
  } else if (degreeRequired && !candidateDegreeClass && !resolvedSignals) {
    blockedReasons.push("degree class missing");
  } else if (degreeRequired && degreeCandidate < degreeRequired && degreeFromExtraction) {
    addGap("degree", `CV-detected degree class may be below ${scholarship.degreeClassMin || scholarshipEligibility.degreeClassMin || scholarshipEligibility.degreeClassRequired}.`, resolvedSignals?.degreeClass?.confidence);
  } else if (degreeRequired && degreeCandidate < degreeRequired) {
    blockedReasons.push(`requires at least ${scholarship.degreeClassMin || scholarshipEligibility.degreeClassMin || scholarshipEligibility.degreeClassRequired} degree class`);
  }
  criteria.push({ key: "degree", label: "Degree readiness", score: degreeMatch ? 1 : 0, max: 1, reason: degreeOpen ? "no minimum stated" : degreeMatch ? "meets minimum" : degreeFromExtraction ? "cv-detected degree class needs verification" : "below minimum" });

  const candidateLanguageTests = resolvedSignals?.languageTests?.available ? resolvedSignals.languageTests.value || {} : candidate.languageTests || {};
  const candidateIelts = toMaybeNumber(candidateLanguageTests?.ielts);
  const candidateToefl = toMaybeNumber(candidateLanguageTests?.toefl);
  const candidateCelpip = toMaybeNumber(candidateLanguageTests?.celpip);
  const requiredIelts = toMaybeNumber(scholarship.languageIelts || scholarshipEligibility.languageReqs?.ielts);
  const requiredToefl = toMaybeNumber(scholarship.languageToefl || scholarshipEligibility.languageReqs?.toefl);
  const requiredCelpip = toMaybeNumber(scholarship.languageCelpip || scholarshipEligibility.languageReqs?.celpip);
  let languageMatch = true;
  let languageScore = 1;
  const languageFromExtraction = resolvedSignals?.languageTests?.source === "extracted";
  if (requiredIelts !== null) {
    if (resolvedSignals?.languageTests && !resolvedSignals.languageTests.available) {
      languageMatch = false;
      addGap("language", resolvedSignals.languageTests.reason === "low_confidence" ? "IELTS was detected from the CV at low confidence." : "IELTS score is missing and should be verified.", resolvedSignals.languageTests.confidence, resolvedSignals.languageTests.reason === "low_confidence" ? 0.5 : 1);
    } else if (candidateIelts === null) {
      languageMatch = false;
      blockedReasons.push("IELTS score missing");
    } else if (candidateIelts < requiredIelts && languageFromExtraction) {
      languageMatch = false;
      addGap("language", `CV-detected IELTS score may be below the required ${requiredIelts}.`, resolvedSignals?.languageTests?.confidence);
    } else if (candidateIelts < requiredIelts) {
      languageMatch = false;
      blockedReasons.push(`IELTS ${requiredIelts} required`);
    }
    languageScore = candidateIelts !== null ? Math.min(1, candidateIelts / Math.max(requiredIelts || 1, 1)) : 0;
  } else if (requiredToefl !== null) {
    if (resolvedSignals?.languageTests && !resolvedSignals.languageTests.available) {
      languageMatch = false;
      addGap("language", resolvedSignals.languageTests.reason === "low_confidence" ? "TOEFL was detected from the CV at low confidence." : "TOEFL score is missing and should be verified.", resolvedSignals.languageTests.confidence, resolvedSignals.languageTests.reason === "low_confidence" ? 0.5 : 1);
    } else if (candidateToefl === null) {
      languageMatch = false;
      blockedReasons.push(`TOEFL ${requiredToefl} required`);
    } else if (candidateToefl < requiredToefl && languageFromExtraction) {
      languageMatch = false;
      addGap("language", `CV-detected TOEFL score may be below the required ${requiredToefl}.`, resolvedSignals?.languageTests?.confidence);
    } else if (candidateToefl < requiredToefl) {
      languageMatch = false;
      blockedReasons.push(`TOEFL ${requiredToefl} required`);
    }
    languageScore = candidateToefl !== null ? Math.min(1, candidateToefl / Math.max(requiredToefl || 1, 1)) : 0;
  } else if (requiredCelpip !== null) {
    if (resolvedSignals?.languageTests && !resolvedSignals.languageTests.available) {
      languageMatch = false;
      addGap("language", resolvedSignals.languageTests.reason === "low_confidence" ? "CELPIP was detected from the CV at low confidence." : "CELPIP score is missing and should be verified.", resolvedSignals.languageTests.confidence, resolvedSignals.languageTests.reason === "low_confidence" ? 0.5 : 1);
    } else if (candidateCelpip === null) {
      languageMatch = false;
      blockedReasons.push(`CELPIP ${requiredCelpip} required`);
    } else if (candidateCelpip < requiredCelpip && languageFromExtraction) {
      languageMatch = false;
      addGap("language", `CV-detected CELPIP score may be below the required ${requiredCelpip}.`, resolvedSignals?.languageTests?.confidence);
    } else if (candidateCelpip < requiredCelpip) {
      languageMatch = false;
      blockedReasons.push(`CELPIP ${requiredCelpip} required`);
    }
    languageScore = candidateCelpip !== null ? Math.min(1, candidateCelpip / Math.max(requiredCelpip || 1, 1)) : 0;
  } else {
    languageScore = 1;
  }
  criteria.push({ key: "language", label: "Language readiness", score: languageScore, max: 1, reason: languageMatch ? "meets or exceeds requirement" : languageFromExtraction ? "cv-detected language score needs verification" : "language requirement missing or unmet" });

  const requiredExperience = toMaybeNumber(scholarship.eligibility?.workExperienceYearsMin);
  const candidateExperience = resolvedSignals?.workExpYears?.available
    ? toMaybeNumber(resolvedSignals.workExpYears.value)
    : toMaybeNumber(candidate.professional?.workExperienceYears);
  const experienceOpen = requiredExperience === null || requiredExperience === undefined;
  const experienceMatch = experienceOpen || (candidateExperience !== null && candidateExperience >= requiredExperience);
  const experienceFromExtraction = resolvedSignals?.workExpYears?.source === "extracted";
  if (resolvedSignals?.workExpYears && !resolvedSignals.workExpYears.available && !experienceOpen) {
    addGap("experience", resolvedSignals.workExpYears.reason === "low_confidence" ? "Work experience was detected from the CV at low confidence." : "Work experience is missing and should be verified.", resolvedSignals.workExpYears.confidence, resolvedSignals.workExpYears.reason === "low_confidence" ? 0.5 : 1);
  } else if (!experienceMatch && !experienceOpen && experienceFromExtraction) {
    addGap("experience", "CV-detected work experience may be below the requirement.", resolvedSignals?.workExpYears?.confidence);
  } else if (!experienceMatch && !experienceOpen) {
    blockedReasons.push("work experience requirement not met");
  }
  criteria.push({ key: "experience", label: "Experience fit", score: experienceMatch ? 1 : 0, max: 1, reason: experienceOpen ? "no minimum stated" : experienceMatch ? "meets minimum" : experienceFromExtraction ? "cv-detected work experience needs verification" : "below minimum" });

  const eligibilityScore = (
    nationalityScore * 0.25 +
    criteria.find((item) => item.key === "discipline").score * 0.3 +
    criteria.find((item) => item.key === "degree").score * 0.15 +
    criteria.find((item) => item.key === "language").score * 0.15 +
    criteria.find((item) => item.key === "experience").score * 0.15
  );

  return {
    score: clamp01(eligibilityScore),
    blockedReasons,
    criteria,
    blocked: blockedReasons.length > 0,
    provisionalGaps,
    provisionalPenalty: Math.min(provisionalPenalty, MAX_TOTAL_PROVISIONAL_PENALTY),
  };
}

function toRecordList(record, keys) {
  return unique(
    keys.flatMap((key) => {
      const value = record?.[key];
      return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    })
  );
}

function humanizeSlug(value) {
  return toText(value)
    .replace(/[-_]+/g, " ")
    .replace(/\bhtml?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractTitleFromUrl(value) {
  const url = toText(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const candidate = humanizeSlug(segments[index]);
      if (candidate && candidate.length > 8) {
        return candidate;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function isGenericScholarshipLabel(value, provider = "") {
  const text = toText(value).toLowerCase();
  const providerText = toText(provider).toLowerCase();
  if (!text) return true;
  if (text === providerText) return true;
  if (text.length < 12) return true;
  return [
    "scholarship region",
    "funding options",
    "scholarship",
    "current scholars",
    "who can apply",
    "students",
  ].some((fragment) => text === fragment || text.includes(fragment));
}

function normalizeScholarship(record = {}) {
  const eligibility = record.eligibility || {};
  const application = record.application || {};
  const provenance = record.provenance || {};
  const source = record.source || {};
  const coverage = record.coverage || {};
  const focus = classifyOpportunityFocus(record);
  const country = toText(record.country || application.country || record.institutionCountry);
  const website = toText(
    record.application_portal ||
    record.application_url ||
    application.portal ||
    application.url ||
    record.website ||
    record.source_url ||
    record.sourceUrl
  );
  const sourceUrl = toText(record.source_url || record.sourceUrl || application.sourceUrl || application.url);
  const providerLabel = toText(record.awardingBody || source.sourceLabel);
  const rawTitle = toText(record.name || record.title || record.name_full || record.nameFull || providerLabel);
  const recoveredTitle = extractTitleFromUrl(website);
  const title = isGenericScholarshipLabel(rawTitle, providerLabel)
    ? (recoveredTitle || rawTitle || providerLabel)
    : rawTitle;
  const requirementsSummary = toText(record.requirementsSummary || record.requirements_summary || record.summary || record.notes);
  const normalizedApplication = {
    ...application,
    url: toText(application.url || record.application_url || website) || null,
    portal: toText(application.portal || record.application_portal || record.application_url) || null,
    sourceUrl: sourceUrl || null,
    deadline: application.deadline || record.deadline || null,
    deadlineType: application.deadlineType || (record.deadline ? "exact" : "unknown"),
    requiredDocuments: Array.isArray(application.requiredDocuments) && application.requiredDocuments.length
      ? application.requiredDocuments.slice()
      : Array.isArray(record.documents_required)
        ? record.documents_required.slice()
        : [],
  };
  const normalizedEligibility = {
    ...eligibility,
    nationalities: normalizeScholarshipNationalityList(eligibility.nationalities || record.nationality_requirement || []),
    disciplines: normalizeScholarshipDisciplines(eligibility.disciplines || record.discipline_requirement || []),
    targetProgrammes: normalizeScholarshipDisciplines(eligibility.targetProgrammes || []),
    disciplineCategories: normalizeScholarshipDisciplines(eligibility.disciplineCategories || [eligibility.disciplineCategory].filter(Boolean)),
    degreeClassMin: normalizeDegreeClass(eligibility.degreeClassMin || eligibility.degreeClassRequired),
    degreeClassRequired: normalizeDegreeClass(eligibility.degreeClassRequired || eligibility.degreeClassMin),
    languageReqs: {
      ielts: toMaybeNumber(eligibility.languageReqs?.ielts) ?? toMaybeNumber(toText(eligibility.languageReqs?.ielts).match(/\d(?:\.\d)?/)?.[0]) ?? toMaybeNumber(toText(eligibility.englishTestRequired).match(/\d(?:\.\d)?/)?.[0]),
      toefl: toMaybeNumber(eligibility.languageReqs?.toefl),
      celpip: toMaybeNumber(eligibility.languageReqs?.celpip),
      exemptions: Array.isArray(eligibility.languageReqs?.exemptions) ? eligibility.languageReqs.exemptions.slice() : [],
    },
    workExperienceYearsMin: toMaybeNumber(eligibility.workExperienceYearsMin ?? record.experience_years_required),
    nigerianEligible: eligibility.nigerianEligible === true ? true : eligibility.nigerianEligible === false ? false : null,
    nationalityIsOpen: record.nationality_is_open === true || eligibility.nationalityIsOpen === true,
    disciplineIsOpen: record.discipline_is_open === true || eligibility.disciplineIsOpen === true,
  };
  const normalizedCoverage = {
    ...coverage,
    type: toText(coverage.type || record.funding_type) || "",
    stipend: coverage.stipend === true || coverage.stipendCovered === true || record.stipend === true,
    stipendAmount: toMaybeNumber(coverage.stipendAmount ?? record.stipend_amount),
    travelGrant: coverage.travelGrant === true || coverage.travelCovered === true || record.travel_grant === true,
    accommodationCovered: coverage.accommodationCovered === true || coverage.livingCovered === true || record.accommodation_covered === true,
    numericAmount: toMaybeNumber(coverage.numericAmount ?? record.amountGBP ?? record.tuition_international_yearly),
    currency: toText(coverage.currency || record.currency || "GBP") || "GBP",
  };
  const researchAreas = toRecordList(record, ["research_areas"]);
  const targetCountries = toRecordList(normalizedEligibility, ["targetCountries", "nationalities"]);
  const targetDisciplines = toRecordList(normalizedEligibility, ["disciplines", "targetProgrammes"]);
  const directKeywords = unique(
    [
      title,
      toText(record.name_full),
      toText(record.awardingBody),
      toText(record.notes),
      website,
      requirementsSummary,
      toText(record.search_text),
      toText(normalizedApplication.portal),
      toText(normalizedApplication.url),
      toText(normalizedEligibility.notes),
      ...toList(record.semantic_tags || []),
      ...researchAreas,
      ...targetCountries,
      ...targetDisciplines,
    ]
      .flatMap(tokenize)
  );

  return {
    id: record.id || title,
    title,
    name: toText(record.name) || title,
    nameFull: toText(record.name_full || record.nameFull) || null,
    awardingBody: providerLabel || null,
    sourceLabel: toText(source.sourceLabel || record.awardingBody) || null,
    country,
    city: toText(record.city),
    website,
    source_url: toText(record.source_url || record.sourceUrl || website) || null,
    requirementsSummary,
    audienceScope: toText(record.audience_scope || record.audienceScope) || "unknown",
    priorityScore: clamp01(toMaybeNumber(record.priority_score ?? record.priorityScore) ?? 0),
    priorityReasons: Array.isArray(record.priority_reasons) ? record.priority_reasons.slice() : [],
    eligibility: normalizedEligibility,
    tuition: toMaybeNumber(record.tuition_international_yearly ?? normalizedCoverage.numericAmount),
    currency: toText(record.currency || normalizedCoverage.currency || "GBP") || "GBP",
    researchAreas,
    targetCountries,
    targetDisciplines,
    degreeClassMin: normalizeDegreeClass(normalizedEligibility.degreeClassMin || normalizedEligibility.degreeClassRequired),
    languageIelts:
      toMaybeNumber(normalizedEligibility.languageReqs?.ielts) ??
      toMaybeNumber(toText(normalizedEligibility.languageReqs?.ielts).match(/\d(?:\.\d)?/)?.[0]) ??
      toMaybeNumber(toText(normalizedEligibility.englishTestRequired).match(/\d(?:\.\d)?/)?.[0]),
    languageToefl: toMaybeNumber(normalizedEligibility.languageReqs?.toefl),
    languageCelpip: toMaybeNumber(normalizedEligibility.languageReqs?.celpip),
    deadline: normalizedApplication.deadline || null,
    deadlineType: normalizedApplication.deadlineType || "unknown",
    coverage: normalizedCoverage,
    focus,
    application: normalizedApplication,
    provenance: {
      confidenceScore:
        toMaybeNumber(provenance.confidenceScore) ??
        toMaybeNumber(record.provenance_confidence) ??
        toMaybeNumber(source.confidence) ??
        0.5,
      sourceType: toText(provenance.sourceType || source.sourceType || record.source || "scraped") || "scraped",
      lastVerifiedAt: provenance.lastVerifiedAt || record.last_verified_at || null,
      scrapedAt: provenance.scrapedAt || source.scrapedAt || null,
    },
    keywords: directKeywords,
    contentEmbedding: Array.isArray(record.content_embedding) ? record.content_embedding : null,
  };
}

export function buildScholarshipKeywords(record = {}) {
  return normalizeScholarship(record).keywords;
}

// ── TF-IDF (offline semantic matching — replaces embedding API calls) ──

// Build inverse document frequency weights from a corpus of scholarship keyword sets.
// Terms that appear in many scholarships get low weight; rare terms get boosted.
export function buildCorpusIdf(scholarships) {
  const docCount = scholarships.length;
  if (!docCount) return {};

  const docFrequency = {};
  for (const record of scholarships) {
    const keywords = unique(expandKeywordList(
      toList(record?.keywords || record?.semantic_tags || [])
    ));
    const seen = new Set();
    for (const kw of keywords) {
      if (!seen.has(kw)) {
        docFrequency[kw] = (docFrequency[kw] || 0) + 1;
        seen.add(kw);
      }
    }
  }

  const idf = {};
  for (const [term, freq] of Object.entries(docFrequency)) {
    idf[term] = Math.log((docCount + 1) / (freq + 1)) + 1; // +1 smoothing
  }
  return idf;
}

// IDF-weighted token overlap score. Returns 0-1.
function scoreTfIdfMatch(haystackTokens, needleTokens, idfWeights = {}) {
  if (!needleTokens.length || !haystackTokens.length) return 0;

  const haystack = new Set(haystackTokens);
  let weightedOverlap = 0;
  let weightedTotal = 0;

  for (const token of needleTokens) {
    const weight = idfWeights[token] || 0.5; // default weight for OOV terms
    weightedTotal += weight;
    if (haystack.has(token)) {
      weightedOverlap += weight;
    }
  }

  if (!weightedTotal) return 0;
  return Math.min(1, weightedOverlap / weightedTotal);
}

function scoreTextMatch(haystackTokens, needleTokens) {
  if (!needleTokens.length) return 0;
  const haystack = new Set(haystackTokens);
  const overlap = needleTokens.filter((token) => haystack.has(token)).length;
  return overlap / needleTokens.length;
}

function collectOverlap(leftTokens = [], rightTokens = [], limit = 5) {
  const right = new Set(rightTokens);
  const overlap = [];
  for (const token of leftTokens) {
    if (right.has(token) && !overlap.includes(token)) {
      overlap.push(token);
    }
    if (overlap.length >= limit) break;
  }
  return overlap;
}

function formatPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function buildSemanticExplanation({
  semanticScore,
  vectorSemanticScore,
  textSemanticScore,
  candidateKeywords = [],
  scholarshipKeywords = [],
  profile = {},
  scholarship = {},
}) {
  const overlap = collectOverlap(candidateKeywords, scholarshipKeywords, 4);
  const semanticSource = vectorSemanticScore !== null
    ? "vector similarity"
    : textSemanticScore > 0
      ? "keyword overlap"
      : "fallback signals";
  const profileHints = [
    toText(profile.semanticText || profile.semantic_text),
    ...toList(profile.semanticKeywords || profile.semantic_keywords),
  ].filter(Boolean);
  const scholarshipHints = [
    toText(scholarship.search_text),
    ...toList(scholarship.semantic_tags),
  ].filter(Boolean);

  return {
    source: semanticSource,
    score: semanticScore,
    overlap,
    profileHints: profileHints.slice(0, 4),
    scholarshipHints: scholarshipHints.slice(0, 4),
    summary: semanticScore > 0
      ? overlap.length > 0
        ? `Semantic match from ${semanticSource} around ${overlap.join(", ")}.`
        : `Semantic match from ${semanticSource}, even though no direct token overlap was strong.`
      : `Semantic match is weak, so ranking leans on eligibility and freshness.`,
  };
}

function buildEligibilityExplanation(criteria = [], blockedReasons = []) {
  const semanticCriteria = criteria.filter((criterion) => criterion?.key !== "semantic");
  const strongest = semanticCriteria
    .filter((criterion) => Number(criterion?.score || 0) > 0)
    .sort((a, b) => (Number(b.score || 0) - Number(a.score || 0)))
    .slice(0, 3)
    .map((criterion) => criterion.label.toLowerCase());
  return {
    strongest,
    blockedReasons,
    summary: blockedReasons.length
      ? `Blocking constraint: ${blockedReasons[0]}.`
      : strongest.length
        ? `Eligibility is strongest on ${strongest.join(", ")}.`
        : `Eligibility is still uncertain, so the rank is more tentative.`,
  };
}

function buildMatchNarrative({
  semanticExplanation,
  eligibilityExplanation,
  retrievalScore,
  provenance,
  fallback = false,
  matchStatus = "possible",
}) {
  const parts = [];
  parts.push(semanticExplanation.summary);
  if (!fallback) {
    parts.push(eligibilityExplanation.summary);
  }
  if (Number.isFinite(retrievalScore)) {
    parts.push(`Retrieval strength is ${formatPercent(retrievalScore)}.`);
  }
  parts.push(`Source confidence is ${formatPercent(provenance?.value ?? 0)}.`);
  if (matchStatus === "blocked") {
    parts.push("This result is blocked until the profile constraints change.");
  }
  return parts.filter(Boolean).join(" ");
}

function pushCriterion(criteria, key, label, score, max, reason) {
  criteria.push({ key, label, score: Math.max(0, Math.min(score, max)), max, reason });
}

function computeUrgencyScore(deadline, confidence = 0.5) {
  if (!deadline) {
    return { score: 0, daysRemaining: null };
  }

  const deadlineDate = new Date(deadline);
  const daysRemaining = (deadlineDate - new Date()) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(daysRemaining)) {
    return { score: 0, daysRemaining: null };
  }

  if (daysRemaining <= 0) {
    return { score: 0, daysRemaining };
  }

  const effectiveConfidence = Math.max(0.15, Math.min(1, confidence || 0.5));
  const raw = (1 / (daysRemaining + 1)) * effectiveConfidence * 120;
  return { score: Math.max(1, Math.min(10, Math.round(raw))), daysRemaining };
}

export function scoreScholarship(record, profile, { idfWeights = null, engagementMap = null } = {}) {
  const candidate = normalizeStructuredProfile(profile);
  const resolvedSignals = getResolvedCandidateSignals(profile);
  const scholarship = normalizeScholarship(record);
  const candidateKeywords = expandKeywordList(buildProfileKeywords(candidate));
  const scholarshipKeywords = expandKeywordList(scholarship.keywords || []);
  const profileCompletion = getProfileCompletion(profile || {});
  const isEmptyProfile = profileCompletion.filled === 0;

  // Use TF-IDF weighted match when available (offline), fall back to raw token overlap
  const textSemanticScore = idfWeights
    ? clamp01(scoreTfIdfMatch(scholarshipKeywords, candidateKeywords, idfWeights))
    : clamp01(scoreTextMatch(scholarshipKeywords, candidateKeywords));

  const candidateEmbedding = Array.isArray(profile?.embedding) ? profile.embedding : Array.isArray(profile?.candidate_embedding) ? profile.candidate_embedding : null;
  const vectorSimilarity = cosineSimilarity(candidateEmbedding, scholarship.contentEmbedding || []);
  const vectorSemanticScore = vectorSimilarity === null ? null : clamp01((vectorSimilarity + 1) / 2);
  const semanticScore = vectorSemanticScore === null ? textSemanticScore : Math.max(textSemanticScore, vectorSemanticScore);
  const semanticExplanation = buildSemanticExplanation({
    semanticScore,
    vectorSemanticScore,
    textSemanticScore,
    candidateKeywords,
    scholarshipKeywords,
    profile,
    scholarship,
  });

  const coverage = computeCoverageScore(scholarship);
  const opportunityPriority = computeOpportunityPriority(scholarship);
  const documentBurden = getRequiredDocumentsWeight(scholarship.application?.requiredDocuments || []);
  const provenance = computeProvenanceConfidence(scholarship);
  const deadline = computeDeadlinePressure(scholarship.deadline);

  if (isEmptyProfile) {
    const qualityScore = clamp01(
      coverage.score * 0.55 +
      deadline.pressure * 0.3 +
      provenance.value * 0.1 +
      opportunityPriority.score * 0.15
    );
    return {
      score: Math.round(qualityScore * 100),
      blocked: false,
      blockedReasons: [],
      criteria: [
        { key: "semantic", label: "Semantic fit", score: Math.round(semanticScore * 100), max: 100, reason: "fallback ranking" },
        { key: "coverage", label: "Coverage", score: Math.round(coverage.score * 100), max: 100, reason: "fallback ranking" },
        { key: "deadline", label: "Deadline pressure", score: Math.round(deadline.pressure * 100), max: 100, reason: "fallback ranking" },
        { key: "provenance", label: "Source confidence", score: Math.round(provenance.value * 100), max: 100, reason: "fallback ranking" },
        { key: "priority", label: "Opportunity priority", score: Math.round(opportunityPriority.score * 100), max: 100, reason: opportunityPriority.priorityTier },
      ],
      keywords: candidateKeywords,
      semanticScore,
      normalized: scholarship,
      urgency: {
        score: Math.round(deadline.pressure * 10),
        daysRemaining: deadline.daysRemaining,
      },
      scoreComponents: {
        eligibility: 0,
        coverage: coverage.score,
        deadline_pressure: deadline.pressure,
        document_burden: documentBurden,
        opportunity_priority: opportunityPriority.score,
        provisional_penalty: 0,
      },
      provenanceConfidence: provenance.value,
      fallback: true,
      matchStatus: "possible",
      semanticExplanation,
      eligibilityExplanation: null,
      whyThisMatched: buildMatchNarrative({
        semanticExplanation,
        eligibilityExplanation: { summary: "Eligibility is not fully scored because the profile is incomplete." },
        retrievalScore: null,
        provenance,
        fallback: true,
        matchStatus: "possible",
      }),
    };
  }

  const eligibility = computeEligibilityScore(candidate, scholarship, resolvedSignals);
  const blockedReasons = [...eligibility.blockedReasons];
  if (deadline.blocked) {
    blockedReasons.push("deadline has passed");
  }
  if (eligibility.blocked || deadline.blocked) {
    return {
      score: 0,
      blocked: true,
      blockedReasons,
      criteria: eligibility.criteria,
      keywords: candidateKeywords,
      normalized: scholarship,
      urgency: {
        score: 0,
        daysRemaining: deadline.daysRemaining,
      },
      scoreComponents: {
        eligibility: eligibility.score,
        coverage: coverage.score,
        deadline_pressure: deadline.pressure,
        document_burden: documentBurden,
        opportunity_priority: opportunityPriority.score,
        provisional_penalty: eligibility.provisionalPenalty || 0,
      },
      provenanceConfidence: provenance.value,
      fallback: false,
      semanticScore,
      matchStatus: "blocked",
      semanticExplanation,
      eligibilityExplanation: buildEligibilityExplanation(eligibility.criteria, blockedReasons),
      whyThisMatched: buildMatchNarrative({
        semanticExplanation,
        eligibilityExplanation: buildEligibilityExplanation(eligibility.criteria, blockedReasons),
        retrievalScore: null,
        provenance,
        fallback: false,
        matchStatus: "blocked",
      }),
    };
  }

  // Engagement bonus: mild boost for scholarships the user engaged with.
  // +5% shortlisted, +8% applied, -5% dismissed. Kept small to avoid filter bubble.
  var engagementScore = 0;
  var engagementReason = null;
  if (engagementMap) {
    var key = (scholarship.id || scholarship.slug || "").toString();
    var entry = engagementMap[key];
    if (entry) {
      if (entry === "applied" || entry === "apply_start") { engagementScore = 0.08; engagementReason = "previously applied"; }
      else if (entry === "shortlisted") { engagementScore = 0.05; engagementReason = "shortlisted"; }
      else if (entry === "dismissed") { engagementScore = -0.05; engagementReason = "previously dismissed"; }
    }
  }

  const compositeBase = clamp01(
    semanticScore * 0.33 +
    eligibility.score * 0.28 +
    coverage.score * 0.13 +
    deadline.pressure * 0.09 +
    provenance.value * 0.05 +
    (1 - documentBurden) * 0.04 +
    opportunityPriority.score * 0.13 +
    Math.max(-0.08, engagementScore)
  ) * provenance.value;
  const composite = Math.max(0, compositeBase - (eligibility.provisionalPenalty || 0));
  const total = Math.round(composite * 100);
  const criteria = [
    {
      key: "semantic",
      label: "Semantic fit",
      score: Math.round(semanticScore * 100),
      max: 100,
      reason: semanticExplanation.overlap.length > 0
        ? `overlap: ${semanticExplanation.overlap.join(", ")}`
        : semanticExplanation.source,
    },
    ...eligibility.criteria,
    { key: "coverage", label: "Coverage fit", score: Math.round(coverage.score * 100), max: 100, reason: `funding=${Math.round(coverage.funding * 100)}%` },
    { key: "deadline", label: "Deadline pressure", score: Math.round(deadline.pressure * 100), max: 100, reason: deadline.daysRemaining === null ? "no deadline available" : `${Math.max(0, Math.round(deadline.daysRemaining))} days remaining` },
    { key: "burden", label: "Document burden", score: Math.round((1 - documentBurden) * 100), max: 100, reason: "lower is better" },
    { key: "provenance", label: "Source confidence", score: Math.round(provenance.value * 100), max: 100, reason: `confidence ${provenance.value.toFixed(2)}` },
    { key: "priority", label: "Opportunity priority", score: Math.round(opportunityPriority.score * 100), max: 100, reason: opportunityPriority.priorityReasons.join(", ") || opportunityPriority.priorityTier },
    ...(engagementReason ? [{ key: "engagement", label: "Your engagement", score: Math.round(engagementScore * 100), max: 100, reason: engagementReason }] : []),
  ];

  return {
    score: total,
    blocked: false,
    blockedReasons: [],
    criteria,
    keywords: candidateKeywords,
    normalized: scholarship,
    urgency: {
      score: Math.round(deadline.pressure * 10),
      daysRemaining: deadline.daysRemaining,
    },
    scoreComponents: {
      eligibility: eligibility.score,
      coverage: coverage.score,
      deadline_pressure: deadline.pressure,
      document_burden: documentBurden,
      opportunity_priority: opportunityPriority.score,
      provisional_penalty: eligibility.provisionalPenalty || 0,
    },
    provenanceConfidence: provenance.value,
    fallback: false,
    semanticScore,
    matchStatus: eligibility.provisionalGaps?.length ? "provisional" : eligibility.score >= 0.75 ? "eligible" : "possible",
    semanticExplanation,
    eligibilityExplanation: buildEligibilityExplanation(eligibility.criteria, []),
    whyThisMatched: buildMatchNarrative({
      semanticExplanation,
      eligibilityExplanation: buildEligibilityExplanation(eligibility.criteria, []),
      retrievalScore: null,
      provenance,
      fallback: false,
      matchStatus: eligibility.provisionalGaps?.length ? "provisional" : eligibility.score >= 0.75 ? "eligible" : "possible",
    }),
  };
}

export function rankScholarships(records = [], profile = {}, { limit = 150, idfWeights = null } = {}) {
  const profileKeywords = expandKeywordList(buildProfileKeywords(profile || {}));
  const retrievalSet = [];

  for (const record of Array.isArray(records) ? records : []) {
    const normalized = normalizeScholarship(record);
    const scholarshipKeywords = expandKeywordList(normalized.keywords || []);
    // Use TF-IDF in retrieval pass when available
    const retrievalTextScore = idfWeights
      ? scoreTfIdfMatch(scholarshipKeywords, profileKeywords, idfWeights)
      : scoreTextMatch(scholarshipKeywords, profileKeywords);
    const titleTokens = scoreTextMatch(tokenize(normalized.title || normalized.name || ""), profileKeywords);
    const embeddingSimilarity = cosineSimilarity(Array.isArray(profile?.embedding) ? profile.embedding : null, normalized.contentEmbedding || []);
    const vectorRetrieval = embeddingSimilarity === null ? retrievalTextScore : clamp01((embeddingSimilarity + 1) / 2);
    const opportunityPriority = computeOpportunityPriority(normalized);
    const retrievalScore = clamp01(Math.max(vectorRetrieval, retrievalTextScore) * 0.6 + titleTokens * 0.2 + opportunityPriority.score * 0.2);
    retrievalSet.push({
      record,
      normalized,
      retrievalScore,
    });
  }

  retrievalSet.sort((a, b) => {
    if (b.retrievalScore !== a.retrievalScore) return b.retrievalScore - a.retrievalScore;
    return String(a.normalized?.title || a.normalized?.name || "").localeCompare(String(b.normalized?.title || b.normalized?.name || ""));
  });

  const retrieved = profileKeywords.length > 0
    ? retrievalSet.slice(0, Math.max(1, limit))
    : retrievalSet;
  const scored = retrieved.map(({ record, normalized, retrievalScore }) => {
    const analysis = scoreScholarship(record, profile || {}, { idfWeights });
    return {
      scholarship: analysis.normalized || normalized || record,
      analysis: {
        ...analysis,
        retrievalScore,
        whyThisMatched: buildMatchNarrative({
          semanticExplanation: analysis.semanticExplanation || buildSemanticExplanation({
            semanticScore: analysis.semanticScore || 0,
            vectorSemanticScore: null,
            textSemanticScore: analysis.semanticScore || 0,
            candidateKeywords: analysis.keywords || [],
            scholarshipKeywords: normalized?.keywords || [],
            profile: profile || {},
            scholarship: normalized || record || {},
          }),
          eligibilityExplanation: analysis.eligibilityExplanation || buildEligibilityExplanation(analysis.criteria || [], analysis.blockedReasons || []),
          retrievalScore,
          provenance: { value: analysis.provenanceConfidence || 0 },
          fallback: analysis.fallback,
          matchStatus: analysis.matchStatus,
        }),
      },
    };
  });

  scored.sort((a, b) => {
    if (b.analysis.score !== a.analysis.score) return b.analysis.score - a.analysis.score;
    if ((b.analysis.semanticScore || 0) !== (a.analysis.semanticScore || 0)) return (b.analysis.semanticScore || 0) - (a.analysis.semanticScore || 0);
    if ((b.analysis.retrievalScore || 0) !== (a.analysis.retrievalScore || 0)) return (b.analysis.retrievalScore || 0) - (a.analysis.retrievalScore || 0);
    return String(a.scholarship.id || "").localeCompare(String(b.scholarship.id || ""));
  });

  return {
    retrieved,
    scored,
    profileKeywords,
  };
}
