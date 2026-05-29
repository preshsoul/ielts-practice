import { toText, unique } from "./textUtils.js";

function normalizeSignalText(value) {
  return toText(value)
    .toLowerCase()
    .replace(/&amp;|&#38;|&#038;/g, "&")
    .replace(/['’"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NATO_COUNTRIES = new Set([
  "belgium",
  "bulgaria",
  "canada",
  "croatia",
  "czech republic",
  "czechia",
  "denmark",
  "estonia",
  "finland",
  "france",
  "germany",
  "greece",
  "hungary",
  "iceland",
  "italy",
  "latvia",
  "lithuania",
  "luxembourg",
  "montenegro",
  "netherlands",
  "north macedonia",
  "norway",
  "poland",
  "portugal",
  "romania",
  "slovakia",
  "slovenia",
  "spain",
  "sweden",
  "turkey",
  "united kingdom",
  "uk",
  "usa",
  "united states",
]);

function collectOpportunityText(record = {}) {
  const parts = [
    record?.name,
    record?.title,
    record?.nameFull,
    record?.name_full,
    record?.awardingBody,
    record?.country,
    record?.region,
    record?.city,
    record?.source_url,
    record?.sourceUrl,
    record?.source?.sourceUrl,
    record?.application?.url,
    record?.application?.portal,
    record?.search_text,
    record?.description,
    record?.notes,
    record?.provenance?.sourceUrl,
    record?.source?.sourceLabel,
    record?.source?.rawText,
  ];

  return normalizeSignalText(parts.map(toText).join(" "));
}

function hasAnySignal(text, patterns = []) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return list.some((pattern) => pattern.test(text));
}

const INTERNATIONAL_PATTERNS = [
  /\binternational\b/i,
  /\bglobal\b/i,
  /\boverseas\b/i,
  /\babroad\b/i,
  /\boutside\s+country\b/i,
  /\bworldwide\b/i,
  /\bopen\s+to\s+all\b/i,
  /\bany\s+nationalit(?:y|ies)\b/i,
  /\bforeign\b/i,
  /\brelocat(?:e|ion)\b/i,
  /\bremote\b/i,
];

const GRADUATE_TRAINEE_PATTERNS = [
  /\bgraduate trainee\b/i,
  /\bgraduate program(?:me)?\b/i,
  /\bgraduate scheme\b/i,
  /\bmanagement trainee\b/i,
  /\btrainee program(?:me)?\b/i,
  /\bearly career\b/i,
  /\bentry[-\s]?level\b/i,
  /\byoung professional\b/i,
  /\binternship\b/i,
  /\bplacement\b/i,
];

const SCHOLARSHIP_PATTERNS = [
  /\bscholarship\b/i,
  /\bfellowship\b/i,
  /\bstudentship\b/i,
  /\bgrant\b/i,
  /\baward\b/i,
  /\bfunding\b/i,
];

const NIGERIA_ONLY_PATTERNS = [
  /\bfor nigerians?\b/i,
  /\bnigeria only\b/i,
  /\bnigerian students? only\b/i,
  /\bresiding in nigeria\b/i,
  /\bwithin nigeria\b/i,
  /\bin nigeria\b/i,
];

function detectOpportunityType(text, record = {}) {
  if (hasAnySignal(text, GRADUATE_TRAINEE_PATTERNS)) return "graduate_trainee";
  if (hasAnySignal(text, /\bphd\b/i)) return "scholarship_phd";
  if (hasAnySignal(text, /\bmasters?\b/i)) return "scholarship_masters";
  if (hasAnySignal(text, SCHOLARSHIP_PATTERNS)) return "scholarship";
  if (hasAnySignal(text, /\bposition\b/i)) return "position";
  return record?.opportunity_type || record?.opportunityType || "opportunity";
}

function detectAudienceScope(text, record = {}) {
  if (hasAnySignal(text, INTERNATIONAL_PATTERNS)) return "international";
  if (hasAnySignal(text, NIGERIA_ONLY_PATTERNS)) return "nigeria_only";

  const country = normalizeSignalText(record?.country || record?.eligibility?.country || record?.location || "");
  if (country && !/\bnigeria\b/i.test(country)) {
    return "outside_country";
  }

  return "local";
}

export function classifyOpportunityFocus(record = {}) {
  const text = collectOpportunityText(record);
  const opportunityType = detectOpportunityType(text, record);
  const audienceScope = detectAudienceScope(text, record);
  const internationalSignal = audienceScope === "international" || audienceScope === "outside_country";
  const graduateTraineeSignal = opportunityType === "graduate_trainee";
  const nigeriaOnlySignal = audienceScope === "nigeria_only";
  const country = normalizeSignalText(record?.country || record?.eligibility?.country || record?.location || "");

  let priorityScore = 0;
  const reasons = [];

  if (internationalSignal) {
    priorityScore += 0.45;
    reasons.push("international or open-to-all signal");
  }

  if (graduateTraineeSignal) {
    priorityScore += 0.35;
    reasons.push("graduate trainee or early-career signal");
  }

  if (country && !/\bnigeria\b/i.test(country)) {
    priorityScore += 0.1;
    reasons.push(`country signal: ${country}`);
  }

  if (nigeriaOnlySignal) {
    priorityScore -= 0.35;
    reasons.push("nigeria-only signal");
  }

  if (hasAnySignal(text, /\bapply\b|\bapplication\b|\bdeadline\b|\bportal\b/i)) {
    priorityScore += 0.05;
  }

  priorityScore = Math.max(0, Math.min(1, priorityScore));

  return {
    opportunityType,
    audienceScope,
    internationalSignal,
    graduateTraineeSignal,
    nigeriaOnlySignal,
    priorityScore,
    priorityTier: priorityScore >= 0.7 ? "high" : priorityScore >= 0.35 ? "medium" : "low",
    priorityReasons: unique(reasons),
  };
}

export function isNatoCountry(value = "") {
  const text = normalizeSignalText(value);
  return NATO_COUNTRIES.has(text);
}

export function isUniversityOpportunity(record = {}) {
  const sourceUrl = normalizeSignalText(record?.source_url || record?.sourceUrl || record?.source?.sourceUrl || "");
  const title = normalizeSignalText(record?.name || record?.title || record?.name_full || "");
  const body = normalizeSignalText(record?.awardingBody || record?.source?.sourceLabel || "");
  const hostSignals = [
    /\.ac\.uk\b/i,
    /\.edu\b/i,
    /cambridgetrust\.org/i,
    /ox\.ac\.uk/i,
    /ed\.ac\.uk/i,
    /kuleuven\.be/i,
    /kth\.se/i,
    /university/i,
    /college/i,
    /school of/i,
  ];
  return hostSignals.some((pattern) => pattern.test(sourceUrl)) || /\buniversity\b|\bcollege\b|\binstitute\b/i.test(`${title} ${body}`);
}

export function formatIeltsScore(profile = {}) {
  const raw = Number(profile?.languageTests?.ielts ?? profile?.languageTests?.IELTS ?? profile?.ielts);
  if (!Number.isFinite(raw) || raw <= 0) return "";
  return `IELTS ${Number.isInteger(raw) ? raw.toFixed(0) : raw.toFixed(1)}`;
}

export function formatIeltsBands(profile = {}) {
  const bands = profile?.languageTests?.ieltsBands || {};
  const values = [
    ["L", bands.listening],
    ["R", bands.reading],
    ["W", bands.writing],
    ["S", bands.speaking],
  ]
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0)
    .map(([label, value]) => `${label} ${Number(value).toFixed(Number.isInteger(Number(value)) ? 0 : 1)}`);

  return values.length ? values.join(" · ") : "";
}

export function buildPlainMatchReasons({ analysis = {}, profile = {}, scholarship = {} } = {}) {
  const reasons = [];
  const focus = classifyOpportunityFocus(scholarship);
  const criteria = Array.isArray(analysis?.criteria) ? analysis.criteria : [];
  const hasLanguageFit = criteria.some((criterion) => criterion?.key === "language" && Number(criterion?.score || 0) > 0);
  const hasDisciplineFit = criteria.some((criterion) => criterion?.key === "discipline" && Number(criterion?.score || 0) > 0);
  const hasDegreeFit = criteria.some((criterion) => criterion?.key === "degree" && Number(criterion?.score || 0) > 0);
  const hasDeadlineFit = criteria.some((criterion) => criterion?.key === "deadline" && Number(criterion?.score || 0) > 0);
  const hasCoverageFit = criteria.some((criterion) => criterion?.key === "coverage" && Number(criterion?.score || 0) > 0);
  const ielts = formatIeltsScore(profile);
  const ieltsBands = formatIeltsBands(profile);

  if (focus.internationalSignal) {
    reasons.push("It is open to international applicants.");
  }
  if (focus.graduateTraineeSignal) {
    reasons.push("It looks like a graduate trainee or early-career role.");
  }
  if (hasDisciplineFit) {
    reasons.push("Your field of study lines up with the opportunity.");
  }
  if (hasDegreeFit) {
    reasons.push("Your degree level and class fit the requirement.");
  }
  if (ielts) {
    reasons.push(ieltsBands
      ? `${ielts}${ieltsBands ? ` (${ieltsBands})` : ""} helps this match.`
      : hasLanguageFit
        ? `${ielts} looks strong enough for this opportunity.`
        : `${ielts} is visible, but the language requirement is tighter.`);
  }
  if (hasDeadlineFit) {
    reasons.push("The deadline still gives you room to apply.");
  }
  if (hasCoverageFit) {
    reasons.push("The funding looks worthwhile.");
  }
  if (!reasons.length && Array.isArray(analysis?.semanticExplanation?.overlap) && analysis.semanticExplanation.overlap.length > 0) {
    reasons.push(`Your CV overlaps on ${analysis.semanticExplanation.overlap.slice(0, 2).join(" and ")}.`);
  }

  return unique(reasons).slice(0, 4);
}
