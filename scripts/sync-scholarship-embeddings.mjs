import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildScholarshipEmbeddingText } from "../src/lib/embeddingText.js";

const PUBLIC_SCHOLARSHIPS_PATH = new URL("../public/data/scholarships.json", import.meta.url);
const ENV_PATH = new URL("../.env", import.meta.url);

function parseEnvFile(text) {
  const output = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

async function loadLocalEnv() {
  try {
    const raw = await readFile(ENV_PATH, "utf8");
    const env = parseEnvFile(raw);
    for (const [key, value] of Object.entries(env)) {
      if (!process.env[key] && value) {
        process.env[key] = value;
      }
    }
  } catch {
    // ignore missing local env file
  }
}

function toText(value) {
  return String(value ?? "").trim();
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeNationalityValues(values = []) {
  return toList(values).map((value) => value.toLowerCase());
}

function buildDatabasePayload(record = {}) {
  const sourceUrl = toText(record.source_url);
  const deadline = record.deadline || null;
  const requiredDocuments = toList(record.documents_required);
  const languageReq = record.language_requirement && typeof record.language_requirement === "object"
    ? record.language_requirement
    : null;
  const coverage = {
    type: record.funding_type || "unknown",
    stipend: Boolean(record.stipend),
    stipendCovered: Boolean(record.stipend),
    livingCovered: Boolean(record.accommodation_covered),
    flightsCovered: Boolean(record.travel_grant),
    visaFees: false,
    numericAmount: record.stipend_amount ?? null,
    amountGBP: record.stipend_amount ?? null,
    amountType: record.stipend_amount ? "stated" : null,
    currency: record.currency || "GBP",
    rawAmountString: record.stipend_amount ? String(record.stipend_amount) : null,
    rawAmount: record.stipend_amount ?? null,
  };

  const eligibility = {
    nationalities: normalizeNationalityValues(record.nationality_requirement),
    degreeClassMin: toText(record.degree_class_requirement),
    disciplines: toList(record.discipline_requirement),
    ageLimitMin: null,
    ageLimitMax: null,
    workExperienceYearsMin: Number.isFinite(Number(record.experience_years_required)) ? Number(record.experience_years_required) : 0,
    employmentStatusAtApplication: null,
    languageReqs: {
      ielts: languageReq?.test === "IELTS" ? Number(languageReq.minimum_overall || null) : null,
      toefl: languageReq?.test === "TOEFL" ? Number(languageReq.minimum_overall || null) : null,
      celpip: languageReq?.test === "CELPIP" ? Number(languageReq.minimum_overall || null) : null,
      exemptions: [],
    },
    refereesRequired: 0,
    refereeCategories: [],
    targetInstitutions: [],
    targetProgrammes: [],
    notes: "",
  };

  const application = {
    url: sourceUrl || null,
    portal: sourceUrl || null,
    applicationOpensAt: null,
    deadline,
    deadlineType: record.deadline_is_approximate ? "approximate" : "fixed",
    requiredDocuments,
    essayPrompts: [],
  };

  const provenance = {
    sourceUrl,
    scrapedAt: record.last_verified_at || null,
    lastVerifiedAt: record.last_verified_at || null,
    verifiedBy: "",
    confidenceScore: Number.isFinite(Number(record.provenance_confidence)) ? Number(record.provenance_confidence) : 0.5,
    confidenceDecayRatePerDay: 0.001,
    flaggedFields: [],
    sourceType: record.source_type || "catalog",
  };

  return {
    slug: record.slug || record.id,
    name: record.name_full || record.name || "Untitled Scholarship",
    awardingBody: record.awarding_body || record.awardingBody || null,
    sourceType: record.source_type || "catalog",
    coverage,
    eligibility,
    application,
    provenance,
    tags: toList(record.semantic_tags),
    source: "catalog",
    verified: true,
    active: true,
    search_text: record.search_text || buildScholarshipEmbeddingText(record),
    semantic_tags: toList(record.semantic_tags),
    content_fingerprint: record.content_fingerprint || null,
  };
}

function chunk(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function main() {
  await loadLocalEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase URL or service role key is missing");
  }

  const raw = await readFile(PUBLIC_SCHOLARSHIPS_PATH, "utf8");
  const payload = JSON.parse(raw);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (!records.length) {
    console.log("No scholarship records found in public/data/scholarships.json");
    return;
  }

  const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const prepared = records.map((record) => {
    const dbRecord = buildDatabasePayload(record);
    return {
      record: dbRecord,
      text: dbRecord.search_text || buildScholarshipEmbeddingText(dbRecord),
    };
  });

  const recordsToSync = prepared.map((item) => ({
    ...item.record,
    embedding_model: null,
    embedding_updated_at: new Date().toISOString(),
  }));

  for (const batch of chunk(recordsToSync, 50)) {
    const { error } = await client
      .from("scholarships")
      .upsert(batch, { onConflict: "slug" });
    if (error) {
      if (
        String(error.message || "").includes("content_embedding") ||
        String(error.message || "").includes("search_text") ||
        String(error.message || "").includes("semantic_tags") ||
        String(error.code || "") === "PGRST204" ||
        String(error.code || "") === "42703"
      ) {
        console.log("scholarships vector columns are not available yet; catalog sync skipped.");
        return;
      }
      throw error;
    }
  }

  console.log(`Synced ${recordsToSync.length} scholarship catalog records to Supabase.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
