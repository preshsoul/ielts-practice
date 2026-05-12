function toText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  if (Array.isArray(eligibility?.disciplines) && eligibility.disciplines.length) parts.push(eligibility.disciplines.slice(0, 2).join(", "));
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

export function buildScholarshipFeed(records = [], options = {}) {
  const recentDays = Number.isFinite(Number(options.recentDays)) ? Number(options.recentDays) : 7;
  const referenceDate = toDate(options.referenceDate) || new Date();
  const referenceTime = referenceDate.getTime();
  const cutoffTime = referenceTime - recentDays * 24 * 60 * 60 * 1000;

  const dedupe = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record) continue;
    const key = getKey(record);
    if (!key) continue;
    const date = getRecordDate(record);
    if (!date) continue;
    const time = date.getTime();
    if (time < cutoffTime) continue;

    if (!dedupe.has(key) || getRecordDate(dedupe.get(key)) < date) {
      dedupe.set(key, record);
    }
  }

  return [...dedupe.values()]
    .sort((a, b) => {
      const aDate = getRecordDate(a)?.getTime() || 0;
      const bDate = getRecordDate(b)?.getTime() || 0;
      if (bDate !== aDate) return bDate - aDate;
      return getTitle(a).localeCompare(getTitle(b));
    })
    .map((record) => ({
      id: getKey(record),
      title: getTitle(record),
      sourceLabel: getSourceLabel(record),
      locationLabel: getLocationLabel(record),
      requirementsSummary: getRequirementsSummary(record),
      date: getRecordDate(record),
      website: record?.website || record?.source_url || record?.sourceUrl || "",
      audienceScope: record?.audience_scope || record?.audienceScope || "unknown",
      priorityScore: Number(record?.priority_score || 0),
      reasons: Array.isArray(record?.priority_reasons) ? record.priority_reasons : [],
      record,
    }));
}

export function getLatestScholarshipFeed(records = [], options = {}) {
  const feed = buildScholarshipFeed(records, options);
  return feed.slice(0, Number.isFinite(Number(options.limit)) ? Number(options.limit) : 6);
}
