import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildScholarshipEmbeddingText, buildScholarshipSemanticTags } from "../src/lib/embeddingText.js";
import { classifyOpportunityFocus } from "../src/lib/opportunitySignals.js";
import {
  canonicalizeScholarshipName,
  cleanScholarshipName,
  isGenericScholarshipName,
  normalizeText,
  normalizeUrl,
  titleCase,
  truncateName,
} from "../src/lib/scholarshipContract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const questionsPath = join(root, "public", "data", "questions.json");
const passagesPath = join(root, "public", "data", "passages.json");
const scholarshipsPath = join(root, "public", "data", "scholarships.json");
const contentManifestPath = join(root, "public", "data", "content-manifest.json");
const notificationsPath = join(root, "public", "data", "notifications.json");
const baseQuestionsPath = join(root, "content", "questions.base.json");
const extraQuestionsPath = join(root, "content", "questions.extra.json");
const basePassagesPath = join(root, "content", "passages.base.json");
const extraPassagesPath = join(root, "content", "passages.extra.json");
const scrapedScholarshipsPath = join(root, "content", "scholarships.scraped.json");
const scrapedScholarshipsV2Path = join(root, "content", "scholarships.scraped.v2.json");
const deadlineSnapshotPath = join(root, "content", "deadline-snapshot.json");
const deadlineChangesPath = join(root, "content", "deadline-changes.json");

async function readJsonIfExists(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveSourceUrl(item = {}) {
  return normalizeUrl(
    item?.source?.sourceUrl ||
      item?.provenance?.sourceUrl ||
      item?.application?.url ||
      item?.website ||
      item?.scraped_from ||
      ""
  );
}

function inferSourceType(item = {}) {
  const sourceType = String(item?.provenance?.sourceType || item?.sourceType || item?.sourceKind || "").toLowerCase();
  if (sourceType.includes("curated")) return "curated";
  if (sourceType.includes("hybrid")) return "hybrid";
  if (item?.sourceMeta || item?.scraped_from || sourceType.includes("scraped")) return "scraped";
  return "hybrid";
}

function normalizeFundingType(type = "", coverage = {}) {
  const lowered = String(type || coverage?.type || "").toLowerCase();
  if (lowered === "full") return "full";
  if (lowered === "partial" || lowered === "stipend-only" || lowered === "stipend") return "partial";
  if (lowered === "tuition_only" || lowered === "tuition-only" || lowered === "tuition") return "tuition_only";
  return "unknown";
}

function inferLanguageRequirement(eligibility = {}) {
  const reqs = eligibility?.languageReqs || {};
  if (reqs.ielts !== null && reqs.ielts !== undefined) {
    return { test: "IELTS", minimum_overall: Number(reqs.ielts), minimum_band: null };
  }
  if (reqs.toefl !== null && reqs.toefl !== undefined) {
    return { test: "TOEFL", minimum_overall: Number(reqs.toefl), minimum_band: null };
  }
  if (reqs.celpip !== null && reqs.celpip !== undefined) {
    return { test: "any", minimum_overall: Number(reqs.celpip), minimum_band: null };
  }
  return null;
}

function isTrustedPublishedApplicationUrl(candidateUrl, sourceUrl) {
  const href = normalizeUrl(candidateUrl || "");
  const source = normalizeUrl(sourceUrl || "");
  if (!href) return null;
  try {
    const url = new URL(href);
    const sourceParsed = source ? new URL(source) : null;
    const sameUrl = source && href === source;
    const sameHost = sourceParsed ? url.hostname === sourceParsed.hostname : false;
    const signal = `${url.hostname} ${url.pathname}`.toLowerCase();
    const blacklist = /\b(blog|blogs|news|article|articles|timeline|current-scholars|who-can-apply|funding-options|find-a-scholarship)\b/;
    const strongPathSignal = /\b(apply|application|admission|admissions|portal|register|registration|login|signup|sign-up|dreamapply|applynow|enroll)\b/;
    if (sameUrl || blacklist.test(signal)) return null;
    if (strongPathSignal.test(signal)) return href;
    if (!sameHost) return null;
    return null;
  } catch {
    return null;
  }
}

function inferPublishedCountry(item = {}) {
  const values = [
    item?.country,
    item?.city,
    item?.location,
    item?.name,
    item?.nameFull,
    item?.name_full,
    item?.awardingBody,
    item?.source?.sourceLabel,
    item?.source?.sourceUrl,
    item?.application?.sourceUrl,
    item?.application_url,
    item?.application_portal,
    item?.sourceUrl,
    item?.source_url,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

  const mappings = [
    { pattern: /\b(uk|united kingdom|britain|british|england|scotland|wales|oxford|cambridge|chevening)\b/, value: "UK" },
    { pattern: /\b(usa|us|united states|american|fulbright)\b/, value: "US" },
    { pattern: /\bcanada|canadian|ubc|mcgill\b/, value: "Canada" },
    { pattern: /\baustralia|australian\b/, value: "Australia" },
    { pattern: /\beurope|european|germany|france|netherlands|sweden|norway|denmark|ireland|daad\b/, value: "Europe" },
  ];

  const match = mappings.find((entry) => entry.pattern.test(values));
  return match?.value || null;
}

function inferDisciplineRequirements(eligibility = {}) {
  return [...new Set([
    ...(Array.isArray(eligibility.disciplines) ? eligibility.disciplines : []),
    ...(Array.isArray(eligibility.targetProgrammes) ? eligibility.targetProgrammes : []),
    ...(Array.isArray(eligibility.disciplineCategories) ? eligibility.disciplineCategories : []),
    eligibility.disciplineCategory || "",
  ].map((value) => titleCase(value)).filter(Boolean))];
}

function computeCoverageScore(item = {}) {
  const coverage = item?.coverage || {};
  const type = String(coverage.type || "").toLowerCase();
  const funding = type === "full" ? 1 : type === "partial" ? 0.6 : type === "tuition_only" ? 0.35 : 0.2;
  const stipend = coverage.stipend === true || coverage.stipendCovered === true || coverage.livingCovered === true ? 1 : 0;
  const travel = coverage.flightsCovered || coverage.travelGrant || coverage.travelCovered ? 1 : 0;
  const accommodation = coverage.livingCovered || coverage.accommodationCovered ? 1 : 0;
  const numericBonus = coverage.numericAmount ? Math.min(0.2, Math.max(0, Number(coverage.numericAmount) / 250000)) : 0;
  return Math.max(0, Math.min(1, funding * 0.6 + stipend * 0.15 + travel * 0.15 + accommodation * 0.1 + numericBonus));
}

function computeDocumentBurdenScore(item = {}) {
  const docs = Array.isArray(item?.application?.requiredDocuments) ? item.application.requiredDocuments : [];
  if (!docs.length) return 0.1;
  const tokens = docs.map((doc) => normalizeText(doc).toLowerCase());
  const burdenMap = {
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
  const total = tokens.reduce((sum, token) => sum + (burdenMap[token] || 0.4), 0);
  return Math.max(0, Math.min(1, total / Math.max(tokens.length, 1)));
}

function inferScholarshipPageType(item = {}) {
  return String(
    item?.scholarship?.source?.pageType ||
      item?.scholarship?.application?.pageType ||
      item?.source?.pageType ||
      item?.application?.pageType ||
      ""
  ).toLowerCase();
}

function isListingSourceUrl(url = "") {
  const normalized = String(url || "").toLowerCase();
  return (
    /\/positions(?:\/|$|\?)/.test(normalized) ||
    /\/category\/scholarships\//.test(normalized) ||
    /find-scholarships/.test(normalized) ||
    /\/category\//.test(normalized)
  );
}

function isPublishableScholarshipRecord(item = {}) {
  const sourceUrl = resolveSourceUrl(item);
  const pageType = inferScholarshipPageType(item);
  const reviewStatus = String(item?.reviewStatus || item?.scholarship?.reviewStatus || "").toLowerCase();
  const verified = item?.source?.verified === true || item?.scholarship?.source?.verified === true || item?.verified === true;
  const isApproved = reviewStatus === "approved";
  const registrySourceType = String(item?.source?.registrySourceType || item?.scholarship?.source?.registrySourceType || "").toLowerCase();
  const hasDetailSignals = Boolean(
    item?.application?.deadline ||
      item?.application?.portal ||
      item?.scholarship?.application?.deadline ||
      item?.scholarship?.application?.portal
  );

  if (registrySourceType === "discovery_directory" && !isApproved && !verified) return false;
  if (isApproved || verified) return true;
  if (pageType === "detail" && hasDetailSignals && !isListingSourceUrl(sourceUrl)) return true;
  return false;
}

function isPublishablePublicRecord(record = {}) {
  const sourceUrl = String(record?.source_url || "").toLowerCase();
  const title = String(record?.name || record?.name_full || "").toLowerCase();
  const pageType = String(record?.page_type || "").toLowerCase();
  const scholarshipSignal = /\bscholar|fund|funding|award|grant|fellow|fellowship|studentship|bursar|opportunity|position\b/.test(title);
  const genericTitle = /^(position detail|find scholarships in \d{4}|list of scholarships for international students in \d{4}|scholarships cafe|frequently asked questions about scholarships|faq|application timeline|find a course|just a moment|error 404|page not found|course fees|fee liability|student loans|how to pay|financial support|living costs|tuition fees|accommodation|home|stories of impact|current scholars|alumni network)$/i.test(String(record?.name || "").trim());
  const focus = classifyOpportunityFocus(record);
  const audienceScope = String(record?.audience_scope || focus.audienceScope || "").toLowerCase();
  const hasEvidence = Boolean(
    record?.deadline ||
      record?.stipend_amount ||
      record?.discipline_requirement?.length ||
      record?.nationality_requirement?.length ||
      Number(record?.provenance_confidence || 0) >= 0.8
  );
  const hasPriorityFocus = focus.internationalSignal || focus.graduateTraineeSignal || focus.priorityScore >= 0.35;

  if (!sourceUrl) return false;
  if (pageType === "faq" || pageType === "listing" || pageType === "news") return false;
  if (isListingSourceUrl(sourceUrl)) return false;
  if (isGenericScholarshipName(record?.name, record?.awardingBody) || isGenericScholarshipName(record?.name_full, record?.awardingBody)) return false;
  if (genericTitle) return false;
  if (focus.nigeriaOnlySignal || audienceScope === "nigeria_only") return false;
  if (!scholarshipSignal && !hasEvidence && !hasPriorityFocus) return false;

  // Reject UK-only scholarships. Our users are international applicants.
  var scopeCheck = String(record?.audience_scope || focus.audienceScope || "").toLowerCase();
  if (scopeCheck === "local" || scopeCheck === "nigeria_only") return false;

  // Must have international signal or be from known global source
  var knownGlobalSource = /cambridgetrust|chevening|daad|fulbright|erasmus|commonwealth|mext|great scholarship/i.test(sourceUrl);
  var hasInternationalScope = scopeCheck === "international" || scopeCheck === "outside_country" || knownGlobalSource;
  if (!hasInternationalScope && !hasPriorityFocus) return false;

  return true;
}

function toPublicScholarshipRecord(item = {}) {
  const sourceUrl = resolveSourceUrl(item);
  const sourceType = inferSourceType(item);
  const focus = classifyOpportunityFocus(item);
  const eligibility = item?.eligibility || {};
  const application = item?.application || {};
  const coverage = item?.coverage || {};
  const pageType = String(item?.source?.pageType || item?.application?.pageType || item?.pageType || "").toLowerCase();
  const name = cleanScholarshipName(item?.name || item?.scholarship?.name || "", item?.awardingBody || item?.source?.sourceLabel || "");
  const fullName = normalizeText(item?.nameFull || item?.name_full || item?.name || item?.scholarship?.name || name);
  const degree = normalizeText(eligibility.degreeClassMin || eligibility.degreeClassRequired || "");
  const languageRequirement = inferLanguageRequirement(eligibility);
  const disciplineRequirement = inferDisciplineRequirements(eligibility);
  const sourcePageUrl = normalizeUrl(application.sourceUrl || item?.source?.sourceUrl || item?.provenance?.sourceUrl || "");
  const applicationUrl = isTrustedPublishedApplicationUrl(application.url || "", sourcePageUrl);
  const applicationPortal = isTrustedPublishedApplicationUrl(application.portal || application.url || "", sourcePageUrl);
  const country = inferPublishedCountry({
    ...item,
    source_url: sourcePageUrl,
    application_url: applicationUrl,
    application_portal: applicationPortal,
  });
  const city = item?.source?.verified === true ? item?.city || null : null;
  const searchText = buildScholarshipEmbeddingText(item);
  const semanticTags = buildScholarshipSemanticTags(item);
  const contentFingerprint = createHash("sha256").update(searchText).digest("hex");
  const slug = normalizeText(item?.slug || item?.id || fullName || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || item?.id || "";

  return {
    id: item?.id || item?.scholarship?.id || "",
    slug,
    name: truncateName(name || fullName || "Untitled Scholarship"),
    name_full: fullName || null,
    requirements_summary: normalizeText(item?.requirementsSummary || item?.requirements_summary || "") || null,
    awardingBody: item?.awardingBody || item?.scholarship?.awardingBody || null,
    source_url: sourcePageUrl || sourceUrl,
    application_url: applicationUrl || null,
    application_portal: applicationPortal || null,
    source_type: sourceType,
    page_type: pageType || null,
    country: country || null,
    city,
    provenance_confidence: Number(item?.provenance?.confidenceScore ?? item?.source?.confidence ?? 0),
    last_verified_at: item?.provenance?.lastVerifiedAt || item?.source?.scrapedAt || item?.provenance?.scrapedAt || null,
    opportunity_type: focus.opportunityType,
    audience_scope: focus.audienceScope,
    priority_score: Number(focus.priorityScore || 0),
    priority_tier: focus.priorityTier,
    priority_reasons: focus.priorityReasons,
    deadline: application.deadline || null,
    deadline_is_approximate: Boolean(application.deadlineIsApproximate || application.deadlineApproximate || false),
    deadline_approximation_confidence: application.deadlineApproximationConfidence ?? null,
    funding_type: normalizeFundingType(coverage.type, coverage),
    stipend: Boolean(coverage.stipend === true || coverage.stipendCovered === true || coverage.livingCovered === true),
    stipend_amount: coverage.amountGBP ?? coverage.numericAmount ?? null,
    travel_grant: Boolean(coverage.flightsCovered || coverage.travelGrant || coverage.travelCovered),
    accommodation_covered: Boolean(coverage.livingCovered || coverage.accommodationCovered),
    nationality_requirement: Array.isArray(eligibility.nationalities) ? eligibility.nationalities.filter(Boolean) : [],
    nationality_is_open: eligibility.nationalityIsOpen !== false && (!Array.isArray(eligibility.nationalities) || eligibility.nationalities.length === 0 || eligibility.nationalities.includes("international") || eligibility.nationalities.includes("Any")),
    degree_class_requirement: degree || undefined,
    degree_class_minimum_cgpa: eligibility.degreeClassMinimumCgpa ?? undefined,
    discipline_requirement: disciplineRequirement,
    discipline_is_open: disciplineRequirement.length === 0,
    language_test_required: Boolean(languageRequirement),
    language_requirement: languageRequirement || undefined,
    experience_years_required: eligibility.workExperienceYearsMin !== null && eligibility.workExperienceYearsMin !== undefined ? Number(eligibility.workExperienceYearsMin) : undefined,
    documents_required: Array.isArray(application.requiredDocuments) ? application.requiredDocuments.filter(Boolean) : [],
    coverage_score: computeCoverageScore(item),
    document_burden_score: computeDocumentBurdenScore(item),
    search_text: searchText,
    semantic_tags: semanticTags,
    content_fingerprint: contentFingerprint,
  };
}

function mergeById(base = [], extra = []) {
  const map = new Map();
  extra.forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  base.forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  return [...map.values()];
}

function normalizeScholarshipText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/&amp;|&#38;|&#038;/g, "&")
    .replace(/['’"`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeScholarshipUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || key === "fbclid" || key === "gclid") {
        url.searchParams.delete(key);
      }
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function publicScholarshipKey(record = {}) {
  const name = canonicalizeScholarshipName(record?.name || record?.name_full, record?.awardingBody);
  const body = normalizeText(record?.awardingBody).toLowerCase();
  const sourceUrl = normalizeScholarshipUrl(record?.source_url || "");
  let host = "";
  try {
    host = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  return [name, body, host || sourceUrl].filter(Boolean).join("::");
}

function publicRecordCompleteness(record = {}) {
  let score = 0;
  if (record?.name) score += 2;
  if (record?.awardingBody) score += 1;
  if (record?.source_url) score += 2;
  if (record?.deadline) score += 1;
  if (record?.funding_type && record.funding_type !== "unknown") score += 1;
  if (Array.isArray(record?.discipline_requirement) && record.discipline_requirement.length) score += 0.5;
  if (Array.isArray(record?.nationality_requirement) && record.nationality_requirement.length) score += 0.5;
  if (typeof record?.provenance_confidence === "number") score += record.provenance_confidence;
  return score;
}

function dedupePublicScholarshipRecords(records = []) {
  const map = new Map();
  for (const record of records) {
    const key = publicScholarshipKey(record) || record?.id;
    if (!key) continue;
    const current = map.get(key);
    if (!current || publicRecordCompleteness(record) >= publicRecordCompleteness(current)) {
      map.set(key, record);
    }
  }
  return [...map.values()];
}

function scholarshipKey(item = {}) {
  const record = item?.scholarship || item;
  const name = canonicalizeScholarshipName(record?.name || item?.name, record?.awardingBody || item?.awardingBody);
  const body = normalizeText(record?.awardingBody || item?.awardingBody).toLowerCase();
  const portal = normalizeUrl(
    record?.application?.portal ||
      record?.application?.url ||
      item?.website ||
      item?.scraped_from ||
      record?.provenance?.sourceUrl ||
      record?.source?.sourceUrl
  );
  let host = "";
  try {
    host = portal ? new URL(portal).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  return [name, body, host || portal].filter(Boolean).join("::");
}

function scholarshipCompleteness(item = {}) {
  const record = item?.scholarship || item;
  let score = 0;
  if (record?.name) score += 2;
  if (record?.awardingBody) score += 1;
  if (record?.application?.url) score += 2;
  if (record?.application?.portal) score += 2;
  if (record?.application?.deadline || record?.application?.deadlineType === "rolling") score += 1;
  if (record?.coverage?.type && record.coverage.type !== "unknown") score += 1;
  if (typeof record?.provenance?.confidenceScore === "number") score += record.provenance.confidenceScore;
  return score;
}

function mergeScholarshipRecords(existing = {}, incoming = {}) {
  const existingRecord = existing?.scholarship || existing;
  const incomingRecord = incoming?.scholarship || incoming;
  const merged = {
    ...existing,
    ...incoming,
    scholarship: incoming?.scholarship || existing?.scholarship || null,
    coverage: {
      ...(existingRecord?.coverage || existing.coverage || {}),
      ...(incomingRecord?.coverage || incoming.coverage || {}),
    },
    eligibility: {
      ...(existingRecord?.eligibility || existing.eligibility || {}),
      ...(incomingRecord?.eligibility || incoming.eligibility || {}),
      languageReqs: {
        ...(existingRecord?.eligibility?.languageReqs || existing.eligibility?.languageReqs || {}),
        ...(incomingRecord?.eligibility?.languageReqs || incoming.eligibility?.languageReqs || {}),
      },
    },
    application: {
      ...(existingRecord?.application || existing.application || {}),
      ...(incomingRecord?.application || incoming.application || {}),
    },
    provenance: {
      ...(existingRecord?.provenance || existing.provenance || {}),
      ...(incomingRecord?.provenance || incoming.provenance || {}),
      flaggedFields: Array.from(new Set([
        ...((existingRecord?.provenance?.flaggedFields || existing.provenance?.flaggedFields) || []),
        ...((incomingRecord?.provenance?.flaggedFields || incoming.provenance?.flaggedFields) || []),
      ])),
    },
    source: {
      ...(existingRecord?.source || existing.source || {}),
      ...(incomingRecord?.source || incoming.source || {}),
      needsVerification: Array.from(new Set([
        ...((existingRecord?.source?.needsVerification || existing.source?.needsVerification) || []),
        ...((incomingRecord?.source?.needsVerification || incoming.source?.needsVerification) || []),
      ])),
    },
  };

  if (scholarshipCompleteness(incoming) > scholarshipCompleteness(existing)) {
    merged.scholarship = incoming?.scholarship || existing?.scholarship || null;
  }

  return merged;
}

function mergeScholarshipLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      const key = scholarshipKey(item) || item?.id;
      if (!key) continue;
      const current = map.get(key);
      if (!current) {
        map.set(key, item);
      } else {
        map.set(key, mergeScholarshipRecords(current, item));
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const delta = scholarshipCompleteness(b) - scholarshipCompleteness(a);
    if (delta) return delta;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

function getDeadlineRecord(item) {
  return {
    id: item?.id || null,
    name: item?.name || null,
    deadline: item?.application?.deadline || null,
    deadlineRaw: item?.application?.deadlineRaw || null,
    deadlineType: item?.application?.deadlineType || null,
    sourceUrl: item?.source?.sourceUrl || item?.application?.url || null,
    urgency: item?.urgency || null,
  };
}

function stringifyDeadline(record) {
  return [record.deadline || "", record.deadlineRaw || "", record.deadlineType || ""].join("|");
}

function compareDeadlines(previous = {}, current = []) {
  const changes = [];
  const nextSnapshot = {};

  current.forEach((item) => {
    const record = getDeadlineRecord(item);
    if (!record.id) return;
    nextSnapshot[record.id] = record;
    const prior = previous[record.id];
    if (prior && stringifyDeadline(prior) !== stringifyDeadline(record)) {
      changes.push({
        id: record.id,
        name: record.name,
        previous: prior,
        current: record,
        changedAt: new Date().toISOString(),
      });
    }
  });

  return { changes, nextSnapshot };
}

function v2ToLegacy(v2) {
  return {
    id: v2.id,
    name: v2.name,
    awardingBody: v2.awardingBody || null,
    country: v2.country || null,
    city: v2.city || null,
    tuition_international_yearly: 0,
    currency: v2.coverage?.currency || "GBP",
    typical_program_length_months: 12,
    living_cost_monthly_by_city: {},
    IHS_per_year: 0,
    CAS_issuance_speed: "unknown",
    research_areas: ["scholarship", "funding"],
    website: v2.application?.url || v2.application?.sourceUrl || v2.source?.sourceUrl,
    notes: v2.source?.rawText ? v2.source.rawText.slice(0, 260) : "",
    source: "scraped",
    verified: v2.source?.verified ?? false,
    active: true,
    scraped_from: v2.source?.sourceUrl,
    scholarship: v2,
    application: v2.application,
    provenance: v2.provenance,
    sourceMeta: v2.source,
  };
}

export async function refreshContentFiles() {
  const baseQuestions = (await readJsonIfExists(baseQuestionsPath))?.questions || [];
  const extraQuestions = (await readJsonIfExists(extraQuestionsPath))?.questions || [];
  const basePassages = (await readJsonIfExists(basePassagesPath))?.passages || {};
  const extraPassages = (await readJsonIfExists(extraPassagesPath))?.passages || {};
  const scrapedScholarships = (await readJsonIfExists(scrapedScholarshipsPath))?.scholarships || [];
  const scrapedScholarshipsV2 = (await readJsonIfExists(scrapedScholarshipsV2Path))?.scholarships || [];
  const previousDeadlineSnapshot = (await readJsonIfExists(deadlineSnapshotPath))?.items || {};

  await writeFile(
    passagesPath,
    JSON.stringify(
      {
        version: "1.1.0",
        updated_at: new Date().toISOString(),
        passages: { ...basePassages, ...extraPassages },
      },
      null,
      2
    ),
    "utf8"
  );

  const mergedQuestions = mergeById(baseQuestions, extraQuestions);
  await writeFile(
    questionsPath,
    JSON.stringify(
      {
        version: "1.1.0",
        updated_at: new Date().toISOString(),
        total: mergedQuestions.length,
        questions: mergedQuestions,
      },
      null,
      2
    ),
    "utf8"
  );

  const publishableLegacy = scrapedScholarships.filter(isPublishableScholarshipRecord);
  const publishableV2 = scrapedScholarshipsV2.filter(isPublishableScholarshipRecord);
  const scrapedV2AsLegacy = publishableV2.map(v2ToLegacy);
  const allScraped = mergeScholarshipLists(publishableLegacy, scrapedV2AsLegacy);
  const institutions = [];
  const rankPublicRecord = (recordA, recordB) => {
    const priorityDelta = Number(recordB?.priority_score || 0) - Number(recordA?.priority_score || 0);
    if (priorityDelta) return priorityDelta;
    const confidenceDelta = Number(recordB?.provenance_confidence || 0) - Number(recordA?.provenance_confidence || 0);
    if (confidenceDelta) return confidenceDelta;
    return String(recordA?.name || "").localeCompare(String(recordB?.name || ""));
  };
  const records = dedupePublicScholarshipRecords(mergeScholarshipLists(publishableV2, allScraped)
    .map(toPublicScholarshipRecord)
    .filter(isPublishablePublicRecord))
    .sort(rankPublicRecord);
  const deadlineComparison = compareDeadlines(previousDeadlineSnapshot, scrapedScholarshipsV2);
  const deadlineChanges = deadlineComparison.changes;
  const deadlineAware = scrapedScholarshipsV2.filter((item) => item?.application?.deadline || item?.application?.deadlineRaw || String(item?.application?.deadlineType || "").toLowerCase() !== "unknown");
  const rolling = scrapedScholarshipsV2.filter((item) => String(item?.application?.deadlineType || "").toLowerCase() === "rolling");
  const unknown = scrapedScholarshipsV2.filter((item) => !item?.application?.deadline && !item?.application?.deadlineRaw);

  await writeFile(
    deadlineSnapshotPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        items: deadlineComparison.nextSnapshot,
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    deadlineChangesPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        total: deadlineChanges.length,
        changes: deadlineChanges,
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    scholarshipsPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        total: records.length,
        institutions,
        records,
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    contentManifestPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        sources: {
          questions: {
            base: baseQuestions.length,
            extra: extraQuestions.length,
            total: mergedQuestions.length,
          },
          passages: {
            base: Object.keys(basePassages).length,
            extra: Object.keys(extraPassages).length,
            total: Object.keys(basePassages).length + Object.keys(extraPassages).length,
          },
          scholarships: {
            legacy: institutions.length,
            v2: scrapedScholarshipsV2.length,
            records: records.length,
            published: publishableV2.length,
            published_public: records.length,
          },
        },
        deadlines: {
          tracked: deadlineAware.length,
          rolling: rolling.length,
          unknown: unknown.length,
          changes: deadlineChanges.length,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    notificationsPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        notifications: [
          {
            id: "content-refresh",
            type: "info",
            title: "Content refreshed",
            body: `Question bank and scholarship catalogue were refreshed at ${new Date().toLocaleString("en-GB")}.`,
            target: "/admin",
          },
          ...deadlineChanges.slice(0, 5).map((change) => ({
            id: `deadline-${change.id}`,
            type: "warning",
            title: `${change.name} deadline updated`,
            body: `Deadline moved from ${change.previous.deadlineRaw || change.previous.deadlineType || "unknown"} to ${change.current.deadlineRaw || change.current.deadlineType || "unknown"}.`,
            target: "/scholarships",
          })),
        ],
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    questions: mergedQuestions.length,
    passages: Object.keys(basePassages).length + Object.keys(extraPassages).length,
    institutions: institutions.length,
    deadlineChanges: deadlineChanges.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshContentFiles()
    .then(() => console.log("Refreshed public data files."))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
