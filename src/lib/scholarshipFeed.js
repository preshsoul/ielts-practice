import { toText } from "./textUtils.js";

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toSlug(value) {
  return toText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getHost(value) {
  const text = toText(value);
  if (!text) return "";
  try {
    return new URL(text).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getRecordDate(record = {}) {
  const candidates = [
    record?.promotedAt,
    record?.reviewedAt,
    record?.last_verified_at,
    record?.source?.scrapedAt,
    record?.source?.updatedAt,
    record?.source?.lastVerifiedAt,
    record?.provenance?.scrapedAt,
    record?.provenance?.lastVerifiedAt,
  ];

  for (const value of candidates) {
    const date = toDate(value);
    if (date) return date;
  }

  return null;
}

function getSourceLabel(record = {}) {
  return (
    record?.awardingBody ||
    record?.source?.sourceLabel ||
    record?.sourceLabel ||
    record?.source?.host ||
    "Scholarship"
  );
}

function getTitle(record = {}) {
  return toText(record?.name || record?.title || record?.nameFull || record?.name_full || getSourceLabel(record));
}

function getLocationLabel(record = {}) {
  const pieces = [record?.city, record?.country].map(toText).filter(Boolean);
  return pieces.length ? pieces.join(", ") : "International route";
}

function getRequirementsSummary(record = {}) {
  const requirements = toText(record?.requirements_summary || record?.requirementsSummary);
  if (requirements) return requirements;
  const parts = [];
  const eligibility = record?.eligibility || {};
  const application = record?.application || {};
  const languageReqs = eligibility?.languageReqs || {};

  if (!eligibility?.nationalityIsOpen && Array.isArray(eligibility?.nationalities) && eligibility.nationalities.length) {
    parts.push(`Open to ${eligibility.nationalities.slice(0, 2).join(", ")}`);
  } else {
    parts.push("Open to international applicants");
  }
  if (eligibility?.degreeClassMin) parts.push(`Degree class ${eligibility.degreeClassMin}`);
  if (Array.isArray(eligibility?.disciplines) && eligibility.disciplines.length) parts.push(`Field: ${eligibility.disciplines.slice(0, 2).join(", ")}`);
  if (Number.isFinite(Number(languageReqs?.ielts)) && Number(languageReqs.ielts) > 0) parts.push(`IELTS ${Number(languageReqs.ielts).toFixed(Number.isInteger(Number(languageReqs.ielts)) ? 0 : 1)}`);
  if (eligibility?.workExperienceYearsMin) parts.push(`${eligibility.workExperienceYearsMin}+ years experience`);
  if (Array.isArray(application?.requiredDocuments) && application.requiredDocuments.length) parts.push(`${application.requiredDocuments.slice(0, 2).join(", ")}`);
  return parts.join(" • ") || "Requirements not yet captured";
}

function getKey(record = {}) {
  return [
    record?.id,
    record?.slug,
    record?.source_url,
    record?.sourceUrl,
    record?.website,
    getTitle(record),
  ]
    .map((value) => toText(value).toLowerCase())
    .find(Boolean);
}

const GENERIC_TITLE_FRAGMENTS = [
  "scholarships",
  "scholarship announcements",
  "funding options",
  "scholarships and funding",
  "information for scholarship applicants",
  "students",
  "the cambridge trust",
  "mastercard foundation scholars program",
  "stories of impact",
  "funding for under represented groups",
  "funding for under-represented groups",
];

const ARTICLE_TITLE_FRAGMENTS = [
  "who can apply",
  "eligibility for",
  "a decade of impact",
  "accelerates impact",
  "celebrates",
  "stories of impact",
  "information for",
];

const HARD_REJECT_TITLE_FRAGMENTS = [
  ".pdf",
  "application timeline",
  "application tips",
  "tips series",
  "course fees",
  "course fees and fee liability",
  "fee liability",
  "alumni network",
  "position detail",
  "early careers",
  "stories of impact",
  "current scholars",
  "additional funding form",
  "just a moment",
  "error 404",
  "page not found",
  "how to pay",
  "student loans",
  "financial support",  // too generic without context
  "living costs",
  "tuition fees",
  "accommodation",
];

const OPPORTUNITY_KEYWORDS = [
  "scholarship",
  "scholarships",
  "fellowship",
  "fellowships",
  "grant",
  "grants",
  "bursary",
  "bursaries",
  "fund",
  "funding",
  "studentship",
  "award",
  "awards",
  "programme",
  "program",
  "masters",
];

function isGenericFeedTitle(title, sourceLabel) {
  const text = toSlug(title);
  const source = toSlug(sourceLabel);
  if (!text) return true;
  if (text === source) return true;
  if (text.length < 12) return true;
  return GENERIC_TITLE_FRAGMENTS.some((fragment) => text === fragment || text.includes(fragment));
}

function isEditorialFeedTitle(title) {
  const text = toSlug(title);
  if (!text) return false;
  return ARTICLE_TITLE_FRAGMENTS.some((fragment) => text.includes(fragment))
    || HARD_REJECT_TITLE_FRAGMENTS.some((fragment) => text.includes(toSlug(fragment)));
}

function looksLikeOpportunityTitle(title, sourceLabel) {
  const text = toSlug(title);
  if (!text) return false;
  if (isEditorialFeedTitle(title)) return false;
  if (isGenericFeedTitle(title, sourceLabel)) return false;
  if (OPPORTUNITY_KEYWORDS.some((keyword) => text.includes(keyword))) return true;
  if (text.includes("clarendon")) return true;
  if (text.includes("erasmus mundus")) return true;
  if (text.includes("science leuven")) return true;
  return false;
}

function hasSourceOpportunityCue(sourceLabel) {
  const text = toSlug(sourceLabel);
  return [
    "scholarship",
    "scholarships",
    "fellowship",
    "fellowships",
    "fund",
    "funding",
    "award",
    "awards",
    "grant",
    "grants",
  ].some((keyword) => text.includes(keyword));
}

function isLikelyOpportunityRecord(record = {}) {
  const title = getTitle(record);
  const sourceLabel = getSourceLabel(record);
  const titleSlug = toSlug(title);

  if (HARD_REJECT_TITLE_FRAGMENTS.some((fragment) => titleSlug.includes(toSlug(fragment)))) return false;
  if (looksLikeOpportunityTitle(title, sourceLabel)) return true;
  if (hasSourceOpportunityCue(sourceLabel) && !isGenericFeedTitle(title, sourceLabel) && !isEditorialFeedTitle(title)) return true;
  return false;
}

function scoreFeedQuality(record = {}) {
  const title = getTitle(record);
  const sourceLabel = getSourceLabel(record);
  const website = toText(record?.website || record?.source_url || record?.sourceUrl || record?.application?.url);
  const pathname = toSlug(website);
  let score = 0;

  if (looksLikeOpportunityTitle(title, sourceLabel)) score += 5;
  if (toText(record?.requirements_summary || record?.requirementsSummary).length >= 24) score += 2;
  if (Array.isArray(record?.eligibility?.disciplines) && record.eligibility.disciplines.length) score += 1;
  if (toText(record?.deadline)) score += 1;
  if (pathname.split(" ").length >= 4) score += 1;
  if (isGenericFeedTitle(title, sourceLabel)) score -= 5;
  if (isEditorialFeedTitle(title)) score -= 6;
  if (pathname.includes("story") || pathname.includes("news") || pathname.includes("announcement")) score -= 3;

  return score;
}

function formatReason(reason) {
  const text = toText(reason).toLowerCase();
  if (!text) return "";
  if (text.includes("international or open-to-all signal")) return "Open to international applicants";
  if (text.includes("country signal: uk")) return "UK study destination";
  if (text.includes("country signal:")) return "";
  if (text.includes("discipline signal")) return "Field match captured";
  if (text.includes("deadline soon")) return "Deadline is approaching";
  if (text.includes("high confidence") || text.includes("provenance")) return "Source quality looks strong";
  return "";
}

function getReadableReasons(record = {}) {
  const raw = Array.isArray(record?.priority_reasons) ? record.priority_reasons : Array.isArray(record?.priorityReasons) ? record.priorityReasons : [];
  const unique = [];
  for (const reason of raw) {
    const formatted = formatReason(reason);
    if (!formatted) continue;
    if (!unique.includes(formatted)) unique.push(formatted);
  }
  return unique.slice(0, 2);
}

function buildTitleFingerprint(record = {}) {
  return [getHost(record?.website || record?.source_url || record?.sourceUrl || record?.application?.url), toSlug(getSourceLabel(record)), toSlug(getTitle(record))]
    .filter(Boolean)
    .join("::");
}

function buildProviderFingerprint(record = {}) {
  return [getHost(record?.website || record?.source_url || record?.sourceUrl || record?.application?.url), toSlug(getSourceLabel(record))]
    .filter(Boolean)
    .join("::");
}

function shouldKeepProviderCandidate(candidate, keptForProvider) {
  if (!keptForProvider.length) return true;
  const candidateTitle = toSlug(candidate.title);
  const candidateSpecific = looksLikeOpportunityTitle(candidate.title, candidate.sourceLabel);

  if (!candidateSpecific) return false;
  if (keptForProvider.length >= 2) return false;

  return keptForProvider.every((existing) => {
    const existingTitle = toSlug(existing.title);
    if (candidateTitle === existingTitle) return false;
    if (candidateTitle.includes(existingTitle) || existingTitle.includes(candidateTitle)) return false;
    return true;
  });
}

export function buildScholarshipFeed(records = [], options = {}) {
  const recentDays = Number.isFinite(Number(options.recentDays)) ? Number(options.recentDays) : 7;
  const referenceDate = toDate(options.referenceDate) || new Date();
  const referenceTime = referenceDate.getTime();
  const cutoffTime = referenceTime - recentDays * 24 * 60 * 60 * 1000;

  const exactDedupe = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record) continue;
    const key = getKey(record);
    if (!key) continue;
    const date = getRecordDate(record);
    if (!date) continue;
    if (date.getTime() < cutoffTime) continue;

    const titleFingerprint = buildTitleFingerprint(record) || key;
    const quality = scoreFeedQuality(record);
    const current = exactDedupe.get(titleFingerprint);
    if (!current || quality > current.quality || (quality === current.quality && getRecordDate(current.record) < date)) {
      exactDedupe.set(titleFingerprint, { record, quality });
    }
  }

  const providerBuckets = new Map();
  for (const { record, quality } of exactDedupe.values()) {
    if (quality < 0) continue;
    if (!isLikelyOpportunityRecord(record)) continue;
    const providerKey = buildProviderFingerprint(record) || getKey(record);
    if (!providerBuckets.has(providerKey)) providerBuckets.set(providerKey, []);
    providerBuckets.get(providerKey).push({
      record,
      quality,
      title: getTitle(record),
      sourceLabel: getSourceLabel(record),
    });
  }

  const filtered = [];
  for (const bucket of providerBuckets.values()) {
    bucket.sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      const aPriority = Number(a.record?.priority_score || a.record?.priorityScore || 0);
      const bPriority = Number(b.record?.priority_score || b.record?.priorityScore || 0);
      if (bPriority !== aPriority) return bPriority - aPriority;
      return (getRecordDate(b.record)?.getTime() || 0) - (getRecordDate(a.record)?.getTime() || 0);
    });

    const kept = [];
    for (const candidate of bucket) {
      if (!shouldKeepProviderCandidate(candidate, kept)) continue;
      kept.push(candidate);
    }
    filtered.push(...kept);
  }

  return filtered
    .sort((a, b) => {
      const aDate = getRecordDate(a.record)?.getTime() || 0;
      const bDate = getRecordDate(b.record)?.getTime() || 0;
      if (bDate !== aDate) return bDate - aDate;
      if (b.quality !== a.quality) return b.quality - a.quality;
      return a.title.localeCompare(b.title);
    })
    .map(({ record }) => ({
      id: buildTitleFingerprint(record) || getKey(record),
      title: getTitle(record),
      sourceLabel: getSourceLabel(record),
      locationLabel: getLocationLabel(record),
      requirementsSummary: getRequirementsSummary(record),
      date: getRecordDate(record),
      website: record?.website || record?.source_url || record?.sourceUrl || "",
      audienceScope: record?.audience_scope || record?.audienceScope || "unknown",
      priorityScore: Number(record?.priority_score || record?.priorityScore || 0),
      reasons: getReadableReasons(record),
      record,
    }));
}

export function getLatestScholarshipFeed(records = [], options = {}) {
  const feed = buildScholarshipFeed(records, options);
  return feed.slice(0, Number.isFinite(Number(options.limit)) ? Number(options.limit) : 6);
}
