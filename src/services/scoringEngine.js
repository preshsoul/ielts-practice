import { getProfileCompletion } from "../lib/profileCompletion.js";
import { classifyOpportunityFocus } from "../lib/opportunitySignals.js";

const DEGREE_RANK = {
  first: 4,
  "2:1": 3,
  "2:2": 2,
  third: 1,
};

const DEGREE_ALIASES = {
  "1": "first",
  "1st": "first",
  "first class": "first",
  first: "first",
  "2:1": "2:1",
  "2.1": "2:1",
  "upper second": "2:1",
  "upper second class": "2:1",
  "2:2": "2:2",
  "2.2": "2:2",
  "lower second": "2:2",
  "lower second class": "2:2",
  third: "third",
};

const NATIONALITY_ALIASES = {
  nigeria: "Nigerian",
  nigerian: "Nigerian",
  ng: "Nigerian",
  ghana: "Ghanaian",
  ghanaian: "Ghanaian",
  kenya: "Kenyan",
  kenyan: "Kenyan",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  canada: "Canada",
  canadian: "Canadian",
  australia: "Australia",
  australian: "Australian",
  international: "International",
  any: "Any",
  "any nationality": "Any",
  "open to all": "Any",
};

const DISCIPLINE_TAXONOMY = [
  { category: "Education", patterns: [/education/i, /teaching/i, /literacy/i] },
  { category: "Computer Science", patterns: [/computer science/i, /software/i, /data science/i, /\bai\b/i, /machine learning/i, /information systems/i] },
  { category: "Engineering", patterns: [/engineering/i, /mechanical/i, /electrical/i, /civil/i, /chemical/i, /aerospace/i, /material engineering/i] },
  { category: "Health Sciences", patterns: [/public health/i, /nursing/i, /medicine/i, /health/i, /pharmacy/i, /biomedical/i] },
  { category: "Business", patterns: [/business/i, /management/i, /finance/i, /accounting/i, /marketing/i, /supply chain/i, /entrepreneurship/i] },
  { category: "Law", patterns: [/\blaw\b/i, /legal/i] },
  { category: "Economics", patterns: [/economics?/i] },
  { category: "Psychology", patterns: [/psychology/i] },
  { category: "Linguistics", patterns: [/linguistics/i, /language/i, /translation/i] },
  { category: "Sciences", patterns: [/\bscience\b/i, /biology/i, /chemistry/i, /physics/i, /mathematics?/i] },
  { category: "Arts and Humanities", patterns: [/arts?/i, /humanities/i, /history/i, /literature/i, /philosophy/i, /anthropology/i] },
  { category: "Agriculture", patterns: [/agricultur/i, /horticulture/i, /forestry/i, /veterinary/i] },
];

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

function toText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

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
  const text = toText(value).toLowerCase();
  if (!text) return "";
  return NATIONALITY_ALIASES[text] || toText(value);
}

function normalizeDisciplineCategory(value) {
  const text = toText(value);
  if (!text) return "";
  const matched = DISCIPLINE_TAXONOMY.find((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  return matched ? matched.category : text;
}

function normalizeDegreeClass(value) {
  const text = toText(value).toLowerCase();
  if (!text) return "";
  return DEGREE_ALIASES[text] || text;
}

function rankDegreeClass(value) {
  return DEGREE_RANK[normalizeDegreeClass(value)] || 0;
}

function cgpaToDegreeClass(cgpa, scale = 5) {
  const value = toMaybeNumber(cgpa);
  const numericScale = toMaybeNumber(scale) || 5;
  if (value === null || !numericScale || numericScale <= 0) return "";

  if (numericScale >= 5) {
    if (value >= 4.5) return "first";
    if (value >= 3.5) return "2:1";
    if (value >= 2.4) return "2:2";
    if (value >= 1.5) return "third";
    return "";
  }

  const normalized = (value / numericScale) * 5;
  return cgpaToDegreeClass(normalized, 5);
}

function normalizeLanguageTest(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokenize(value) {
  return toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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
      countryOfResidence: normalizeNationality(profile.identity?.countryOfResidence) || toText(profile.identity?.countryOfResidence) || null,
      ageAtApplicationCycle: toMaybeNumber(profile.identity?.ageAtApplicationCycle),
    },
    academic: {
      degreeClass: normalizeDegreeClass(profile.academic?.degreeClass) || normalizeDegreeClass(cgpaToDegreeClass(profile.academic?.cgpa, profile.academic?.cgpaScale)) || null,
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
      ielts: toMaybeNumber(profile.languageTests?.ielts),
      toefl: toMaybeNumber(profile.languageTests?.toefl),
      celpip: toMaybeNumber(profile.languageTests?.celpip),
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
      degreeClass: normalizeDegreeClass(draft.academic?.degreeClass) || null,
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
      ielts: toMaybeNumber(draft.languageTests?.ielts),
      toefl: toMaybeNumber(draft.languageTests?.toefl),
      celpip: toMaybeNumber(draft.languageTests?.celpip),
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
    const matched = DISCIPLINE_TAXONOMY.find((entry) => entry.patterns.some((pattern) => pattern.test(value)));
    if (matched) output.push(matched.category);
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

function computeEligibilityScore(candidate = {}, scholarship = {}) {
  const blockedReasons = [];
  const criteria = [];

  const candidateNationality = getCandidateNationality(candidate);
  const scholarshipNationalities = normalizeScholarshipNationalityList(scholarship.eligibility?.nationalities);
  const candidateCountry = normalizeNationality(candidate.identity?.countryOfResidence || "");
  const scholarshipEligibility = scholarship.eligibility || {};
  const nationalityOpen = isOpenNationalityRequirement(scholarshipNationalities, scholarshipEligibility);
  const allowedNationalities = scholarshipNationalities.map((value) => normalizeNationality(value).toLowerCase()).filter(Boolean);
  const candidateNationalityKey = candidateNationality.toLowerCase();
  const candidateCountryKey = candidateCountry.toLowerCase();
  const onlyNigerianEligible = scholarshipEligibility.nigerianEligible === true && allowedNationalities.length === 0;
  const nationalityMatch = nationalityOpen ||
    (onlyNigerianEligible ? candidateNationalityKey === "nigerian" : false) ||
    (candidateNationalityKey && allowedNationalities.includes(candidateNationalityKey)) ||
    (candidateCountryKey && allowedNationalities.includes(candidateCountryKey));
  const nationalityScore = nationalityOpen ? 1 : nationalityMatch ? 1 : 0;
  if (scholarshipEligibility.nigerianEligible === false && candidateNationalityKey === "nigerian") {
    blockedReasons.push("scholarship excludes Nigerian candidates");
  } else if (onlyNigerianEligible && !candidateNationalityKey) {
    blockedReasons.push("nationality missing");
  } else if (onlyNigerianEligible && candidateNationalityKey !== "nigerian") {
    blockedReasons.push("scholarship requires Nigerian nationality");
  }
  if (!candidateNationality && !nationalityOpen && (allowedNationalities.length > 0 || onlyNigerianEligible)) {
    blockedReasons.push("nationality missing");
  } else if (!nationalityMatch) {
    blockedReasons.push("nationality requirement not met");
  }
  criteria.push({ key: "nationality", label: "Nationality fit", score: nationalityScore, max: 1, reason: nationalityMatch ? "open or matched" : "candidate nationality does not match scholarship" });

  const candidateDisciplines = getCandidateDisciplineSignals(candidate);
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
  if (!candidateDisciplines.length && !disciplineOpen) {
    blockedReasons.push("discipline missing");
  }
  if (!disciplineMatch) {
    blockedReasons.push("discipline requirement not met");
  }
  criteria.push({ key: "discipline", label: "Discipline fit", score: disciplineMatch ? 1 : 0, max: 1, reason: disciplineOpen ? "open discipline" : disciplineMatch ? "matches taxonomy" : "no taxonomy overlap" });

  const degreeRequired = rankDegreeClass(scholarship.degreeClassMin || scholarshipEligibility.degreeClassMin || scholarshipEligibility.degreeClassRequired);
  const candidateDegreeClass = candidate.academic?.degreeClass || cgpaToDegreeClass(candidate.academic?.cgpa, candidate.academic?.cgpaScale);
  const degreeCandidate = rankDegreeClass(candidateDegreeClass);
  const degreeOpen = !degreeRequired;
  const degreeMatch = degreeOpen || (degreeCandidate && degreeCandidate >= degreeRequired);
  if (degreeRequired && !candidateDegreeClass) {
    blockedReasons.push("degree class missing");
  } else if (degreeRequired && degreeCandidate < degreeRequired) {
    blockedReasons.push(`requires at least ${scholarship.degreeClassMin || scholarshipEligibility.degreeClassMin || scholarshipEligibility.degreeClassRequired} degree class`);
  }
  criteria.push({ key: "degree", label: "Degree readiness", score: degreeMatch ? 1 : 0, max: 1, reason: degreeOpen ? "no minimum stated" : degreeMatch ? "meets minimum" : "below minimum" });

  const candidateIelts = toMaybeNumber(candidate.languageTests?.ielts);
  const candidateToefl = toMaybeNumber(candidate.languageTests?.toefl);
  const candidateCelpip = toMaybeNumber(candidate.languageTests?.celpip);
  const requiredIelts = toMaybeNumber(scholarship.languageIelts || scholarshipEligibility.languageReqs?.ielts);
  const requiredToefl = toMaybeNumber(scholarship.languageToefl || scholarshipEligibility.languageReqs?.toefl);
  const requiredCelpip = toMaybeNumber(scholarship.languageCelpip || scholarshipEligibility.languageReqs?.celpip);
  let languageMatch = true;
  let languageScore = 1;
  if (requiredIelts !== null) {
    if (candidateIelts === null) {
      languageMatch = false;
      blockedReasons.push("IELTS score missing");
    } else if (candidateIelts < requiredIelts) {
      languageMatch = false;
      blockedReasons.push(`IELTS ${requiredIelts} required`);
    }
    languageScore = candidateIelts !== null ? Math.min(1, candidateIelts / Math.max(requiredIelts || 1, 1)) : 0;
  } else if (requiredToefl !== null) {
    if (candidateToefl === null || candidateToefl < requiredToefl) {
      languageMatch = false;
      blockedReasons.push(`TOEFL ${requiredToefl} required`);
    }
    languageScore = candidateToefl !== null ? Math.min(1, candidateToefl / Math.max(requiredToefl || 1, 1)) : 0;
  } else if (requiredCelpip !== null) {
    if (candidateCelpip === null || candidateCelpip < requiredCelpip) {
      languageMatch = false;
      blockedReasons.push(`CELPIP ${requiredCelpip} required`);
    }
    languageScore = candidateCelpip !== null ? Math.min(1, candidateCelpip / Math.max(requiredCelpip || 1, 1)) : 0;
  } else {
    languageScore = 1;
  }
  criteria.push({ key: "language", label: "Language readiness", score: languageScore, max: 1, reason: languageMatch ? "meets or exceeds requirement" : "language requirement missing or unmet" });

  const requiredExperience = toMaybeNumber(scholarship.eligibility?.workExperienceYearsMin);
  const candidateExperience = toMaybeNumber(candidate.professional?.workExperienceYears);
  const experienceOpen = requiredExperience === null || requiredExperience === undefined;
  const experienceMatch = experienceOpen || (candidateExperience !== null && candidateExperience >= requiredExperience);
  if (!experienceMatch && !experienceOpen) {
    blockedReasons.push("work experience requirement not met");
  }
  criteria.push({ key: "experience", label: "Experience fit", score: experienceMatch ? 1 : 0, max: 1, reason: experienceOpen ? "no minimum stated" : experienceMatch ? "meets minimum" : "below minimum" });

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

function normalizeScholarship(record = {}) {
  const eligibility = record.eligibility || {};
  const application = record.application || {};
  const provenance = record.provenance || {};
  const source = record.source || {};
  const coverage = record.coverage || {};
  const focus = classifyOpportunityFocus(record);

  const title = toText(record.name);
  const country = toText(record.country || application.country || record.institutionCountry);
  const researchAreas = toRecordList(record, ["research_areas"]);
  const targetCountries = toRecordList(eligibility, ["targetCountries", "nationalities"]);
  const targetDisciplines = toRecordList(eligibility, ["disciplines", "targetProgrammes"]);
  const directKeywords = unique(
    [
      title,
      toText(record.notes),
      toText(record.website),
      toText(record.search_text),
      toText(application.portal),
      toText(application.url),
      toText(eligibility.notes),
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
    country,
    city: toText(record.city),
    eligibility: {
      nationalities: normalizeScholarshipNationalityList(eligibility.nationalities),
      disciplines: normalizeScholarshipDisciplines(eligibility.disciplines || []),
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
      workExperienceYearsMin: toMaybeNumber(eligibility.workExperienceYearsMin),
      nigerianEligible: eligibility.nigerianEligible === true ? true : eligibility.nigerianEligible === false ? false : null,
    },
    tuition: toMaybeNumber(record.tuition_international_yearly ?? coverage.numericAmount),
    currency: toText(record.currency || coverage.currency || "GBP") || "GBP",
    researchAreas,
    targetCountries,
    targetDisciplines,
    degreeClassMin: normalizeDegreeClass(eligibility.degreeClassMin || eligibility.degreeClassRequired),
    languageIelts:
      toMaybeNumber(eligibility.languageReqs?.ielts) ??
      toMaybeNumber(toText(eligibility.languageReqs?.ielts).match(/\d(?:\.\d)?/)?.[0]) ??
      toMaybeNumber(toText(eligibility.englishTestRequired).match(/\d(?:\.\d)?/)?.[0]),
    languageToefl: toMaybeNumber(eligibility.languageReqs?.toefl),
    languageCelpip: toMaybeNumber(eligibility.languageReqs?.celpip),
    deadline: application.deadline || null,
    deadlineType: application.deadlineType || "unknown",
    coverage,
    focus,
    application,
    provenance: {
      confidenceScore:
        toMaybeNumber(provenance.confidenceScore) ??
        toMaybeNumber(source.confidence) ??
        0.5,
      sourceType: toText(provenance.sourceType || source.sourceType || record.source || "scraped") || "scraped",
      lastVerifiedAt: provenance.lastVerifiedAt || null,
      scrapedAt: provenance.scrapedAt || source.scrapedAt || null,
    },
    keywords: directKeywords,
    contentEmbedding: Array.isArray(record.content_embedding) ? record.content_embedding : null,
  };
}

export function buildScholarshipKeywords(record = {}) {
  return normalizeScholarship(record).keywords;
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

export function scoreScholarship(record, profile) {
  const candidate = normalizeStructuredProfile(profile);
  const scholarship = normalizeScholarship(record);
  const candidateKeywords = buildProfileKeywords(candidate);
  const scholarshipKeywords = scholarship.keywords || [];
  const profileCompletion = getProfileCompletion(profile || {});
  const isEmptyProfile = profileCompletion.filled === 0;
  const textSemanticScore = clamp01(scoreTextMatch(scholarshipKeywords, candidateKeywords));
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

  const eligibility = computeEligibilityScore(candidate, scholarship);
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

  const composite = clamp01(
    semanticScore * 0.35 +
    eligibility.score * 0.3 +
    coverage.score * 0.15 +
    deadline.pressure * 0.1 +
    provenance.value * 0.05 +
    (1 - documentBurden) * 0.05 +
    opportunityPriority.score * 0.15
  ) * provenance.value;
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
    },
    provenanceConfidence: provenance.value,
    fallback: false,
    semanticScore,
    matchStatus: eligibility.score >= 0.75 ? "eligible" : "possible",
    semanticExplanation,
    eligibilityExplanation: buildEligibilityExplanation(eligibility.criteria, []),
    whyThisMatched: buildMatchNarrative({
      semanticExplanation,
      eligibilityExplanation: buildEligibilityExplanation(eligibility.criteria, []),
      retrievalScore: null,
      provenance,
      fallback: false,
      matchStatus: eligibility.score >= 0.75 ? "eligible" : "possible",
    }),
  };
}

export function rankScholarships(records = [], profile = {}, { limit = 150 } = {}) {
  const profileKeywords = buildProfileKeywords(profile || {});
  const retrievalSet = [];

  for (const record of Array.isArray(records) ? records : []) {
    const normalized = normalizeScholarship(record);
    const semanticScore = scoreTextMatch(normalized.keywords || [], profileKeywords);
    const titleTokens = scoreTextMatch(tokenize(normalized.title || normalized.name || ""), profileKeywords);
    const embeddingSimilarity = cosineSimilarity(Array.isArray(profile?.embedding) ? profile.embedding : null, normalized.contentEmbedding || []);
    const vectorRetrieval = embeddingSimilarity === null ? semanticScore : clamp01((embeddingSimilarity + 1) / 2);
    const opportunityPriority = computeOpportunityPriority(normalized);
    const retrievalScore = clamp01(Math.max(vectorRetrieval, semanticScore) * 0.6 + titleTokens * 0.2 + opportunityPriority.score * 0.2);
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
    const analysis = scoreScholarship(record, profile || {});
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
