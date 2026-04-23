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

function normalizeDegreeClass(value) {
  const text = toText(value).toLowerCase();
  if (!text) return "";
  return DEGREE_ALIASES[text] || text;
}

function rankDegreeClass(value) {
  return DEGREE_RANK[normalizeDegreeClass(value)] || 0;
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
    },
    applicationCycle: toText(profile.applicationCycle),
    targetDegreeLevel: toText(profile.targetDegreeLevel),
    targetDisciplines: toList(profile.targetDisciplines).join(", "),
    targetCountries: toList(profile.targetCountries).join(", "),
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
    },
    applicationCycle: toText(draft.applicationCycle) || null,
    targetDegreeLevel: toText(draft.targetDegreeLevel) || null,
    targetDisciplines: unique(toList(draft.targetDisciplines)),
    targetCountries: unique(toList(draft.targetCountries)),
    tier: toText(draft.tier || "free") || "free",
  };
}

export function buildProfileKeywords(profile = {}) {
  const normalized = serializeStructuredProfileDraft(createStructuredProfileDraft(profile));
  const keywords = [
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
      toText(application.portal),
      toText(application.url),
      toText(eligibility.notes),
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
    deadline: application.deadline || null,
    deadlineType: application.deadlineType || "unknown",
    coverage,
    application,
    provenance: {
      confidenceScore:
        toMaybeNumber(provenance.confidenceScore) ??
        toMaybeNumber(source.confidence) ??
        0.5,
    },
    keywords: directKeywords,
  };
}

function scoreTextMatch(haystackTokens, needleTokens) {
  if (!needleTokens.length) return 0;
  const haystack = new Set(haystackTokens);
  const overlap = needleTokens.filter((token) => haystack.has(token)).length;
  return overlap / needleTokens.length;
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
  const candidate = serializeStructuredProfileDraft(createStructuredProfileDraft(profile));
  const scholarship = normalizeScholarship(record);
  const criteria = [];
  const blocked = [];
  const scoreParts = [];

  const candidateKeywords = buildProfileKeywords(candidate);
  const scholarshipKeywords = scholarship.keywords;

  const candidateDisciplines = unique([
    candidate.academic.discipline,
    candidate.academic.disciplineCategory,
    ...toList(candidate.targetDisciplines),
  ].flatMap(tokenize));
  const scholarshipDisciplines = unique([
    ...scholarship.researchAreas,
    ...scholarship.targetDisciplines,
    scholarship.title,
  ].flatMap(tokenize));
  const disciplineMatch = scoreTextMatch(scholarshipDisciplines, candidateDisciplines);
  const disciplineScore = Math.round(disciplineMatch * 35);
  pushCriterion(criteria, "discipline", "Discipline fit", disciplineScore, 35, disciplineMatch ? "matches study area signals" : "no direct discipline overlap");
  scoreParts.push(disciplineScore);

  const candidateCountries = unique([
    candidate.identity.nationality,
    candidate.identity.countryOfResidence,
    ...toList(candidate.targetCountries),
  ].flatMap(tokenize));
  const scholarshipCountries = unique([
    scholarship.country,
    ...scholarship.targetCountries,
  ].flatMap(tokenize));
  const geographyMatch = scoreTextMatch(scholarshipCountries, candidateCountries);
  const geographyScore = Math.round(geographyMatch * 15);
  pushCriterion(criteria, "geography", "Geography fit", geographyScore, 15, geographyMatch ? "candidate and opportunity overlap geographically" : "no geography match yet");
  scoreParts.push(geographyScore);

  let degreeScore = 0;
  const degreeRequired = rankDegreeClass(scholarship.degreeClassMin);
  const degreeCandidate = rankDegreeClass(candidate.academic.degreeClass);
  if (degreeRequired && degreeCandidate && degreeCandidate < degreeRequired) {
    blocked.push(`requires at least ${scholarship.degreeClassMin} degree class`);
  }
  if (degreeRequired && degreeCandidate) {
    const gap = degreeCandidate - degreeRequired;
    degreeScore = gap >= 0 ? 10 : 0;
  } else if (degreeRequired && !degreeCandidate) {
    degreeScore = 4;
  } else {
    degreeScore = 6;
  }
  pushCriterion(criteria, "degree", "Degree readiness", degreeScore, 10, degreeRequired ? `minimum degree class is ${scholarship.degreeClassMin}` : "no degree minimum stated");
  scoreParts.push(degreeScore);

  let languageScore = 0;
  const candidateIelts = toMaybeNumber(candidate.languageTests.ielts);
  const requiredIelts = scholarship.languageIelts;
  if (requiredIelts && candidateIelts && candidateIelts < requiredIelts) {
    blocked.push(`IELTS ${requiredIelts} required`);
  }
  if (requiredIelts && candidateIelts) {
    const spread = candidateIelts - requiredIelts;
    languageScore = spread >= 0 ? 10 : 0;
  } else if (requiredIelts && !candidateIelts) {
    languageScore = 3;
  } else {
    languageScore = 7;
  }
  pushCriterion(criteria, "language", "Language readiness", languageScore, 10, requiredIelts ? `IELTS requirement around ${requiredIelts}` : "no language requirement stated");
  scoreParts.push(languageScore);

  let valueScore = 0;
  if (scholarship.coverage?.tuitionCovered || scholarship.coverage?.livingCovered || scholarship.coverage?.flightsCovered) {
    valueScore += 12;
  }
  if (scholarship.coverage?.numericAmount) {
    valueScore += Math.min(8, Math.round(scholarship.coverage.numericAmount / 10000));
  } else if (scholarship.tuition) {
    if (scholarship.tuition <= 10000) valueScore += 8;
    else if (scholarship.tuition <= 20000) valueScore += 5;
    else if (scholarship.tuition <= 30000) valueScore += 3;
    else valueScore += 1;
  }
  pushCriterion(criteria, "value", "Funding value", valueScore, 20, scholarship.coverage?.numericAmount ? "award amount detected" : scholarship.tuition ? "tuition-based value estimate" : "no funding signal yet");
  scoreParts.push(valueScore);

  const confidenceScore = Math.round((scholarship.provenance.confidenceScore || 0) * 10);
  pushCriterion(criteria, "confidence", "Source confidence", confidenceScore, 10, `confidence ${scholarship.provenance.confidenceScore.toFixed ? scholarship.provenance.confidenceScore.toFixed(2) : scholarship.provenance.confidenceScore}`);
  scoreParts.push(confidenceScore);

  let urgencyScore = 0;
  let daysRemaining = null;
  if (scholarship.deadline) {
    const urgency = computeUrgencyScore(scholarship.deadline, scholarship.provenance.confidenceScore || 0.5);
    urgencyScore = urgency.score;
    daysRemaining = urgency.daysRemaining;
    if (Number.isFinite(daysRemaining) && daysRemaining <= 0) {
      blocked.push("deadline has passed");
    }
  }
  pushCriterion(criteria, "urgency", "Deadline urgency", urgencyScore, 10, scholarship.deadline ? `deadline: ${scholarship.deadline}` : "no deadline available");
  scoreParts.push(urgencyScore);

  const keywordMatch = Math.round(scoreTextMatch(scholarshipKeywords, candidateKeywords) * 10);
  pushCriterion(criteria, "signals", "Keyword signals", keywordMatch, 10, candidateKeywords.length ? "structured profile keyword overlap" : "profile keywords not yet available");
  scoreParts.push(keywordMatch);

  const total = Math.max(0, Math.min(100, Math.round(scoreParts.reduce((sum, value) => sum + value, 0))));
  const isBlocked = blocked.length > 0;

  return {
    score: total,
    blocked: isBlocked,
    blockedReasons: blocked,
    criteria,
    keywords: candidateKeywords,
    normalized: scholarship,
    urgency: {
      score: urgencyScore,
      daysRemaining,
    },
  };
}
