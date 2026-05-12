import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildCandidateEmbeddingText } from "../src/lib/embeddingText.js";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";
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
    // ignore missing env file
  }
}

function extractJsonPayload(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function mapProfileRow(profile = {}) {
  return {
    id: profile.id,
    display_name: profile.display_name || null,
    identity: profile.identity || {},
    academic: profile.academic || {},
    professional: profile.professional || {},
    languageTests: profile.languageTests || {},
    applicationCycle: profile.applicationcycle || null,
    applicationcycle: profile.applicationcycle || null,
    targetDegreeLevel: profile.targetDegreeLevel || null,
    targetDisciplines: profile.targetdisciplines || [],
    targetdisciplines: profile.targetdisciplines || [],
    targetCountries: profile.targetcountries || [],
    targetcountries: profile.targetcountries || [],
    tier: profile.tier || "free",
    last_seen_at: profile.last_seen_at || null,
    updated_at: profile.updated_at || null,
  };
}

async function fetchSemanticProfile(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 512,
      temperature: 0,
      system: "You are a strict JSON-only normalization engine.",
      messages: [
        {
          role: "user",
          content: `
You normalize scholarship candidate information for a recommendation engine.
Return JSON only, with these keys:
{
  "semantic_text": string,
  "keywords": string[],
  "summary": string,
  "confidence": number
}

Rules:
- Keep semantic_text concise, factual, and normalized.
- Use canonical terms for degree level, discipline, nationality, country, and experience.
- keywords should be 8 to 20 short, high-signal tokens.
- confidence must be between 0 and 1.
- Do not include markdown or commentary.

Input:
${text}
`.trim(),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const textOut = Array.isArray(data?.content)
    ? data.content
        .filter((part) => part?.type === "text")
        .map((part) => part?.text || "")
        .join("\n")
        .trim()
    : "";
  const parsed = extractJsonPayload(textOut);
  return {
    semanticText: String(parsed?.semantic_text || "").trim() || text,
    keywords: Array.isArray(parsed?.keywords) ? parsed.keywords.map((item) => String(item ?? "").trim()).filter(Boolean) : [],
    summary: String(parsed?.summary || "").trim() || text,
    confidence: Number.isFinite(Number(parsed?.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0.5,
    model: data?.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    usage: data?.usage || null,
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

  const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [profilesResult, cvProfilesResult] = await Promise.all([
    client.from("profiles").select("id, display_name, identity, academic, professional, languageTests, applicationcycle, targetDegreeLevel, targetdisciplines, targetcountries, tier, last_seen_at, updated_at").order("last_seen_at", { ascending: false }),
    client.from("cv_profiles").select("id, profile_id, label, keywords, raw_text_hash, created_at, updated_at").order("created_at", { ascending: false }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (cvProfilesResult.error) throw cvProfilesResult.error;

  const latestCvByProfile = new Map();
  for (const row of cvProfilesResult.data || []) {
    if (row?.profile_id && !latestCvByProfile.has(row.profile_id)) {
      latestCvByProfile.set(row.profile_id, row);
    }
  }

  const prepared = [];
  for (const profile of profilesResult.data || []) {
    const normalizedProfile = mapProfileRow(profile);
    const cv = latestCvByProfile.get(profile.id) || null;
    if (!cv) continue;

    const semanticText = buildCandidateEmbeddingText({
      profile: normalizedProfile,
      intake: {
        label: cv.label,
        keywords: cv.keywords || [],
      },
      semanticText: [cv.label, ...(Array.isArray(cv.keywords) ? cv.keywords : [])].filter(Boolean).join(", "),
      display_name: normalizedProfile.display_name || null,
      source: "cv",
    });

    const semantic = await fetchSemanticProfile(semanticText);
    const mergedKeywords = Array.from(new Set([
      ...(Array.isArray(cv.keywords) ? cv.keywords : []),
      ...semantic.keywords,
    ]));

    prepared.push({
      profile_id: profile.id,
      label: cv.label || semantic.summary || normalizedProfile.display_name || null,
      keywords: mergedKeywords,
      raw_text_hash: cv.raw_text_hash || null,
    });
    console.log(`Prepared semantic CV profile for ${profile.id}`);
  }

  if (!prepared.length) {
    console.log("No CV profiles found for semantic backfill.");
    return;
  }

  for (const batch of chunk(prepared, 50)) {
    const { error } = await client
      .from("cv_profiles")
      .upsert(batch, { onConflict: "profile_id,raw_text_hash" });
    if (error) throw error;
  }

  console.log(`Backfilled ${prepared.length} CV semantic profiles.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
