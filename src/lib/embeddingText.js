import { classifyOpportunityFocus } from "./opportunitySignals.js";

function toText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pushSection(parts, label, value) {
  const text = toText(value);
  if (!text) return;
  parts.push(`${label}: ${text}`);
}

function normalizeBoolean(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  const text = toText(value).toLowerCase();
  if (!text) return "";
  if (["yes", "true", "1", "currently", "current"].includes(text)) return "yes";
  if (["no", "false", "0", "none"].includes(text)) return "no";
  return toText(value);
}

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

export function buildCandidateEmbeddingText(source = {}) {
  const profile = source?.canonicalJson || source?.canonical_json || source?.profile || source;
  const parsed = source?.parsedProfile || source?.parsed_profile || {};
  const intake = source?.intake || {};
  const semanticText = toText(source?.semanticText || source?.semantic_text || source?.extractedText || source?.extracted_text);

  const parts = [];
  pushSection(parts, "Candidate", source?.display_name || source?.name || profile?.display_name);
  pushSection(parts, "Nationality", profile?.identity?.nationality || parsed?.identity?.nationality);
  pushSection(parts, "Residence", profile?.identity?.countryOfResidence || parsed?.identity?.countryOfResidence);
  pushSection(parts, "Age", profile?.identity?.ageAtApplicationCycle || parsed?.identity?.ageAtApplicationCycle);
  pushSection(parts, "Degree class", profile?.academic?.degreeClass || parsed?.academic?.degreeClass);
  pushSection(parts, "Institution", profile?.academic?.institution || parsed?.academic?.institution);
  pushSection(parts, "Institution country", profile?.academic?.institutionCountry || parsed?.academic?.institutionCountry);
  pushSection(parts, "Discipline", profile?.academic?.discipline || parsed?.academic?.discipline);
  pushSection(parts, "Discipline category", profile?.academic?.disciplineCategory || parsed?.academic?.disciplineCategory);
  pushSection(parts, "Graduation year", profile?.academic?.graduationYear || parsed?.academic?.graduationYear);
  pushSection(parts, "CGPA", profile?.academic?.cgpa || parsed?.academic?.cgpa);
  pushSection(parts, "Work experience years", profile?.professional?.workExperienceYears || parsed?.professional?.workExperienceYears);
  pushSection(parts, "Currently employed", normalizeBoolean(profile?.professional?.currentlyEmployed || parsed?.professional?.currentlyEmployed));
  pushSection(parts, "Sector", profile?.professional?.sector || parsed?.professional?.sector);
  pushSection(parts, "IELTS", profile?.languageTests?.ielts || parsed?.languageTests?.ielts);
  pushSection(parts, "TOEFL", profile?.languageTests?.toefl || parsed?.languageTests?.toefl);
  pushSection(parts, "CELPIP", profile?.languageTests?.celpip || parsed?.languageTests?.celpip);
  pushSection(parts, "Target degree level", pick(profile?.targetDegreeLevel, profile?.targetdegreelevel, parsed?.targetDegreeLevel));
  pushSection(parts, "Target disciplines", unique([
    ...toList(profile?.targetDisciplines),
    ...toList(profile?.targetdisciplines),
    ...toList(parsed?.targetDisciplines),
    ...toList(parsed?.targetdisciplines),
  ]).join(", "));
  pushSection(parts, "Target countries", unique([
    ...toList(profile?.targetCountries),
    ...toList(profile?.targetcountries),
    ...toList(parsed?.targetCountries),
    ...toList(parsed?.targetcountries),
  ]).join(", "));
  pushSection(parts, "Application cycle", pick(profile?.applicationCycle, profile?.applicationcycle, parsed?.applicationCycle, parsed?.applicationcycle));
  pushSection(parts, "Keywords", unique([
    ...toList(source?.keywords),
    ...toList(intake?.keywords),
  ]).join(", "));
  pushSection(parts, "Summary", source?.summary || intake?.label || source?.label);
  pushSection(parts, "Document text", semanticText);

  return parts.join(". ");
}

export function buildScholarshipSemanticTags(record = {}) {
  const eligibility = record?.eligibility || {};
  const coverage = record?.coverage || {};
  const application = record?.application || {};
  return unique([
    toText(record?.name),
    toText(record?.awardingBody),
    toText(record?.country),
    toText(record?.region),
    ...toList(record?.tags),
    ...toList(record?.semantic_tags),
    ...toList(eligibility.nationalities),
    ...toList(eligibility.disciplines),
    ...toList(eligibility.targetProgrammes),
    ...toList(eligibility.disciplineCategories),
    toText(eligibility.degreeClassMin),
    toText(eligibility.degreeClassRequired),
    toText(coverage.type),
    toText(coverage.currency),
    toText(application.deadlineType),
  ]);
}

export function buildScholarshipEmbeddingText(record = {}) {
  const eligibility = record?.eligibility || {};
  const coverage = record?.coverage || {};
  const application = record?.application || {};
  const provenance = record?.provenance || {};
  const focus = classifyOpportunityFocus(record);
  const parts = [];

  pushSection(parts, "Scholarship", record?.name || record?.title);
  pushSection(parts, "Awarding body", record?.awardingBody);
  pushSection(parts, "Country", record?.country);
  pushSection(parts, "Region", record?.region);
  pushSection(parts, "Source type", record?.sourceType || provenance.sourceType);
  pushSection(parts, "Nationalities", unique(toList(eligibility.nationalities)).join(", "));
  pushSection(parts, "Disciplines", unique([
    ...toList(eligibility.disciplines),
    ...toList(eligibility.targetProgrammes),
    ...toList(eligibility.disciplineCategories),
  ]).join(", "));
  pushSection(parts, "Degree class", eligibility.degreeClassMin || eligibility.degreeClassRequired);
  pushSection(parts, "Language requirements", [
    eligibility.languageReqs?.ielts ? `IELTS ${eligibility.languageReqs.ielts}` : "",
    eligibility.languageReqs?.toefl ? `TOEFL ${eligibility.languageReqs.toefl}` : "",
    eligibility.languageReqs?.celpip ? `CELPIP ${eligibility.languageReqs.celpip}` : "",
  ].filter(Boolean).join(", "));
  pushSection(parts, "Work experience", eligibility.workExperienceYearsMin);
  pushSection(parts, "Coverage", [
    coverage.type,
    coverage.stipend ? "stipend" : "",
    coverage.travelGrant || coverage.travelCovered || coverage.flightsCovered ? "travel" : "",
    coverage.livingCovered || coverage.accommodationCovered ? "accommodation" : "",
    coverage.currency ? `currency ${coverage.currency}` : "",
  ].filter(Boolean).join(", "));
  pushSection(parts, "Deadline", application.deadline || application.deadlineType);
  pushSection(parts, "Required documents", unique(toList(application.requiredDocuments)).join(", "));
  pushSection(parts, "Opportunity type", focus.opportunityType);
  pushSection(parts, "Audience scope", focus.audienceScope);
  pushSection(parts, "Priority signal", focus.priorityTier);
  pushSection(parts, "Search text", record?.search_text);
  pushSection(parts, "Semantic tags", unique(buildScholarshipSemanticTags(record)).join(", "));
  pushSection(parts, "Provenance confidence", provenance.confidenceScore);

  return parts.join(". ");
}
