import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeText, normalizeUrl } from "../../../src/lib/scholarshipContract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

async function readJsonIfExists(path, fallback) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(path, data) {
  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  try {
    await rename(tempPath, path);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EXDEV") {
      await writeFile(path, JSON.stringify(data, null, 2), "utf8");
      try {
        await unlink(tempPath);
      } catch {
        // ignore temp cleanup failures
      }
      return;
    }
    throw error;
  }
}

function scholarshipFingerprint(scholarship = {}) {
  const name = normalizeText(scholarship.name).toLowerCase();
  const body = normalizeText(scholarship.awardingBody).toLowerCase();
  const portal = normalizeUrl(
    scholarship?.application?.portal ||
      scholarship?.application?.url ||
      scholarship?.provenance?.sourceUrl ||
      scholarship?.source?.sourceUrl ||
      scholarship?.website ||
      scholarship?.scraped_from
  );
  return [name, body, portal].filter(Boolean).join("::");
}

function completenessScore(scholarship = {}) {
  let score = 0;
  if (scholarship?.id) score += 1;
  if (scholarship?.name) score += 2;
  if (scholarship?.awardingBody) score += 1;
  if (scholarship?.application?.url) score += 2;
  if (scholarship?.application?.portal) score += 2;
  if (scholarship?.application?.deadline || scholarship?.application?.deadlineType === "rolling") score += 1;
  if (scholarship?.coverage?.type && scholarship.coverage.type !== "unknown") score += 1;
  if (typeof scholarship?.provenance?.confidenceScore === "number") score += scholarship.provenance.confidenceScore;
  if (Array.isArray(scholarship?.source?.needsVerification)) score -= scholarship.source.needsVerification.length * 0.25;
  return score;
}

function mergeScholarships(existing = {}, incoming = {}) {
  const merged = {
    ...existing,
    ...incoming,
    coverage: {
      ...(existing.coverage || {}),
      ...(incoming.coverage || {}),
    },
    eligibility: {
      ...(existing.eligibility || {}),
      ...(incoming.eligibility || {}),
      languageReqs: {
        ...(existing.eligibility?.languageReqs || {}),
        ...(incoming.eligibility?.languageReqs || {}),
      },
    },
    application: {
      ...(existing.application || {}),
      ...(incoming.application || {}),
    },
    provenance: {
      ...(existing.provenance || {}),
      ...(incoming.provenance || {}),
      flaggedFields: Array.from(new Set([...(existing.provenance?.flaggedFields || []), ...(incoming.provenance?.flaggedFields || [])])),
    },
    source: {
      ...(existing.source || {}),
      ...(incoming.source || {}),
      needsVerification: Array.from(new Set([...(existing.source?.needsVerification || []), ...(incoming.source?.needsVerification || [])])),
    },
    tags: Array.from(new Set([...(Array.isArray(existing.tags) ? existing.tags : []), ...(Array.isArray(incoming.tags) ? incoming.tags : [])])),
    awardeeContributions: Array.isArray(existing.awardeeContributions) || Array.isArray(incoming.awardeeContributions)
      ? Array.from(new Set([...(existing.awardeeContributions || []), ...(incoming.awardeeContributions || [])]))
      : [],
  };

  if (completenessScore(incoming) > completenessScore(existing)) {
    merged.source = {
      ...(existing.source || {}),
      ...(incoming.source || {}),
      needsVerification: Array.from(new Set([...(existing.source?.needsVerification || []), ...(incoming.source?.needsVerification || [])])),
    };
  }

  return merged;
}

function dedupeScholarships(scholarships = []) {
  const byId = new Map();
  const byFingerprint = new Map();
  for (const scholarship of scholarships) {
    if (!scholarship?.id) continue;
    const fingerprint = scholarshipFingerprint(scholarship);
    const current = byId.get(scholarship.id) || (fingerprint ? byFingerprint.get(fingerprint) : null);
    if (!current) {
      byId.set(scholarship.id, scholarship);
      if (fingerprint) byFingerprint.set(fingerprint, scholarship);
      continue;
    }
    const merged = mergeScholarships(current, scholarship);
    const chosenId = completenessScore(scholarship) >= completenessScore(current) ? scholarship.id : current.id;
    if (current.id && current.id !== chosenId) byId.delete(current.id);
    if (scholarship.id && scholarship.id !== chosenId) byId.delete(scholarship.id);
    merged.id = chosenId;
    byId.set(chosenId, merged);
    if (fingerprint) byFingerprint.set(fingerprint, merged);
  }
  return [...new Map([...byId.entries()]).values()].sort((a, b) => {
    const aScore = completenessScore(a);
    const bScore = completenessScore(b);
    if (bScore !== aScore) return bScore - aScore;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

export async function readScholarshipStores() {
  const reviewScholarshipsPath = join(ROOT, "content", "scholarships.review.json");
  const reviewManifestPath = join(ROOT, "content", "scholarships.review.manifest.json");
  const approvedScholarshipsPath = join(ROOT, "content", "scholarships.scraped.v2.json");
  const legacyScholarshipsPath = join(ROOT, "content", "scholarships.scraped.json");

  const [reviewScholarships, reviewManifest, approvedScholarships, legacyScholarships] = await Promise.all([
    readJsonIfExists(reviewScholarshipsPath, { scholarships: [] }),
    readJsonIfExists(reviewManifestPath, {}),
    readJsonIfExists(approvedScholarshipsPath, { scholarships: [] }),
    readJsonIfExists(legacyScholarshipsPath, { scholarships: [] }),
  ]);

  return {
    reviewScholarshipsPath,
    reviewManifestPath,
    approvedScholarshipsPath,
    legacyScholarshipsPath,
    reviewScholarships: Array.isArray(reviewScholarships?.scholarships) ? reviewScholarships.scholarships : [],
    reviewManifest,
    approvedScholarships: Array.isArray(approvedScholarships?.scholarships) ? approvedScholarships.scholarships : [],
    legacyScholarships: Array.isArray(legacyScholarships?.scholarships) ? legacyScholarships.scholarships : [],
  };
}

export async function writeScholarshipReviewQueue(incoming, options = {}) {
  const stores = await readScholarshipStores();
  const incomingScholarships = dedupeScholarships(Array.isArray(incoming?.scholarships) ? incoming.scholarships : []).map((scholarship) => ({
    ...scholarship,
    reviewStatus: "pending",
    reviewNotes: scholarship.reviewNotes || "",
    reviewedAt: null,
    promotedAt: null,
    reviewChecks: {
      valid: true,
      flaggedFields: Array.isArray(scholarship?.source?.needsVerification) ? scholarship.source.needsVerification : [],
      confidence: scholarship?.provenance?.confidenceScore ?? scholarship?.source?.confidence ?? null,
      duplicateKey: scholarshipFingerprint(scholarship),
    },
  }));

  const reviewMap = new Map();
  for (const scholarship of stores.reviewScholarships) {
    if (scholarship?.id) reviewMap.set(scholarship.id, scholarship);
  }
  for (const scholarship of incomingScholarships) {
    if (scholarship?.id) reviewMap.set(scholarship.id, scholarship);
  }

  const reviewScholarships = dedupeScholarships([...reviewMap.values()]);
  const payload = {
    version: options.version || "1.0.0",
    updated_at: new Date().toISOString(),
    total: reviewScholarships.length,
    scholarships: reviewScholarships,
  };

  await mkdir(join(ROOT, "content"), { recursive: true });
  await atomicWriteJson(stores.reviewScholarshipsPath, payload);
  return payload;
}

export async function promoteReviewedScholarships({ ids = [] } = {}) {
  const stores = await readScholarshipStores();
  const selectedIds = new Set(ids.filter(Boolean));
  const approved = stores.reviewScholarships.filter((scholarship) => selectedIds.has(scholarship.id));
  const remaining = stores.reviewScholarships.filter((scholarship) => !selectedIds.has(scholarship.id));
  if (!approved.length) {
    return { promoted: [], remaining, promotedCount: 0, remainingCount: remaining.length, approvedScholarships: stores.approvedScholarships };
  }

  const promotedAt = new Date().toISOString();
  const nextApproved = dedupeScholarships([
    ...stores.approvedScholarships,
    ...approved.map((scholarship) => ({
      ...scholarship,
      reviewStatus: "approved",
      reviewedAt: promotedAt,
      promotedAt,
      reviewChecks: {
        ...(scholarship.reviewChecks || {}),
        valid: true,
      },
    })),
  ]);

  const nextReviewPayload = {
    version: "1.0.0",
    updated_at: promotedAt,
    total: remaining.length,
    scholarships: remaining,
  };
  const nextApprovedPayload = {
    version: "2.0.0",
    updated_at: promotedAt,
    total: nextApproved.length,
    scholarships: nextApproved,
  };

  await atomicWriteJson(stores.approvedScholarshipsPath, nextApprovedPayload);
  await atomicWriteJson(stores.reviewScholarshipsPath, nextReviewPayload);

  return {
    promoted: approved,
    promotedCount: approved.length,
    remaining,
    remainingCount: remaining.length,
    approvedScholarships: nextApproved,
  };
}

export { dedupeScholarships, scholarshipFingerprint, completenessScore, normalizeText, normalizeUrl };
