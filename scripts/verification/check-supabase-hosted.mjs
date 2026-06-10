import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseEnvFile(text) {
  const env = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

async function readEnv(pathname) {
  try {
    const text = await readFile(pathname, "utf8");
    return parseEnvFile(text);
  } catch {
    return {};
  }
}

function readConfigValue(...values) {
  for (const value of values) {
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function requestJson(url, { label, expectOk = true, ...options } = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (expectOk && !response.ok) {
    const message = json?.msg
      || json?.message
      || json?.error_description
      || json?.error?.message
      || text
      || `${label || "request"} failed`;
    throw new Error(`${label || "request"} failed with ${response.status}: ${message}`);
  }

  return {
    ok: response.ok,
    status: response.status,
    text,
    json,
  };
}

function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

function userHeaders(accessToken, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

const frontendEnv = await readEnv(resolve(".env.local"));
const functionEnv = await readEnv(resolve("supabase", "functions", ".env.local"));

const supabaseUrl = readConfigValue(
  process.env.LOCI_SUPABASE_URL,
  process.env.VITE_SUPABASE_URL,
  frontendEnv.VITE_SUPABASE_URL,
  functionEnv.LOCI_SUPABASE_URL,
);
const anonKey = readConfigValue(
  process.env.LOCI_SUPABASE_ANON_KEY,
  process.env.VITE_SUPABASE_ANON_KEY,
  frontendEnv.VITE_SUPABASE_ANON_KEY,
  functionEnv.LOCI_SUPABASE_ANON_KEY,
);
const serviceRoleKey = readConfigValue(
  process.env.LOCI_SUPABASE_SERVICE_ROLE_KEY,
  functionEnv.LOCI_SUPABASE_SERVICE_ROLE_KEY,
);

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Hosted Supabase verification requires URL, anon key, and service role key.");
}

const functionsBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
const verificationEmail = `codex.verify.${Date.now()}@gmail.com`;
const verificationPassword = `Codex!${Date.now()}Aa1`;

let userId = null;
let accessToken = null;
let parserJobId = null;
let parserDraftId = null;
let insertedProfile = false;

const checks = [];

async function runCheck(id, label, fn, { safety = "controlled-live-write", evidence = "smoke" } = {}) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    checks.push({
      id,
      label,
      safety,
      evidence,
      ok: true,
      ms: Date.now() - startedAt,
      detail,
    });
  } catch (error) {
    checks.push({
      id,
      label,
      safety,
      evidence,
      ok: false,
      ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

await runCheck("host-rest-reachable", "Hosted Supabase REST reachable", async () => {
  const response = await requestJson(`${supabaseUrl}/rest/v1/`, {
    label: "rest root",
    expectOk: false,
  });
  return { status: response.status };
}, {
  safety: "read-only",
  evidence: "connectivity",
});

await runCheck("auth-admin-create-user", "Create temporary verification user", async () => {
  const response = await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
    label: "admin create user",
    method: "POST",
    headers: serviceHeaders(serviceRoleKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      email: verificationEmail,
      password: verificationPassword,
      email_confirm: true,
      user_metadata: { source: "codex-verification" },
    }),
  });
  userId = response.json?.id || null;
  if (!userId) {
    throw new Error("Temporary auth user was created without a user id.");
  }
  return { userIdPresent: true };
});

await runCheck("auth-password-login", "Sign in as temporary verification user", async () => {
  const response = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    label: "password login",
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: verificationEmail,
      password: verificationPassword,
    }),
  });
  accessToken = response.json?.access_token || null;
  if (!accessToken) {
    throw new Error("Password login did not return an access token.");
  }
  return { accessTokenPresent: true };
});

await runCheck("profiles-bootstrap", "New auth users receive a profiles row", async () => {
  const response = await requestJson(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=id`, {
    label: "profile lookup",
    headers: serviceHeaders(serviceRoleKey),
  });
  const rows = Array.isArray(response.json) ? response.json.length : 0;
  if (!rows) {
    throw new Error("No profile row exists for a freshly created auth user.");
  }
  return { rows };
});

await runCheck("profiles-manual-bootstrap", "Insert verification profile row when bootstrap is missing", async () => {
  const existing = await requestJson(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=id`, {
    label: "profile re-check",
    headers: serviceHeaders(serviceRoleKey),
  });
  const rows = Array.isArray(existing.json) ? existing.json.length : 0;
  if (rows) {
    return { inserted: false, reason: "profile already exists" };
  }

  await requestJson(`${supabaseUrl}/rest/v1/profiles`, {
    label: "insert verification profile",
    method: "POST",
    headers: serviceHeaders(serviceRoleKey, {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify({
      id: userId,
      is_anonymous: false,
      consent_sync: true,
    }),
  });
  insertedProfile = true;
  return { inserted: true };
}, {
  safety: "controlled-live-write",
  evidence: "setup",
});

await runCheck("function-document-intake", "Hosted document-intake function", async () => {
  const payload = {
    label: "Verification intake",
    sourceFilename: "candidate-cv.txt",
    mimeType: "text/plain",
    documentType: "text",
    rawTextHash: "verify-123",
    extractedExcerpt: "Nigerian candidate with MSc and IELTS 7.5.",
    extractedText: "Nigerian candidate with MSc in Computer Science. IELTS 7.5. Two years experience in AI research.",
    keywords: ["nigeria", "computer science", "ielts"],
    confidence: 0.88,
    parsedProfile: {
      identity: { nationality: "Nigerian", countryOfResidence: "Nigeria" },
      academic: {
        degreeClass: "2:1",
        institution: "University of Lagos",
        discipline: "Computer Science",
        graduationYear: 2023,
        degreeLevel: "Master's",
      },
      professional: {
        workExperienceYears: 2,
        currentlyEmployed: true,
        sector: "Technology",
      },
      languageTests: { ielts: 7.5 },
      applicationCycle: "2026",
      targetDegreeLevel: "Master's",
      targetDisciplines: ["Computer Science"],
      targetCountries: ["UK"],
    },
  };

  const response = await requestJson(`${functionsBase}/document-intake`, {
    label: "document-intake",
    method: "POST",
    headers: userHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!response.json?.ok) {
    throw new Error("document-intake returned ok=false");
  }
  return {
    status: response.status,
    normalizedKeys: response.json?.metrics?.normalizedKeys ?? null,
  };
});

await runCheck("function-generate-semantic-profile", "Hosted generate-semantic-profile function", async () => {
  const response = await requestJson(`${functionsBase}/generate-semantic-profile`, {
    label: "generate-semantic-profile",
    method: "POST",
    headers: userHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      text: "Nigerian MSc computer science graduate with IELTS 7.5 and two years AI experience seeking UK scholarships.",
    }),
  });
  if (!response.json?.ok) {
    throw new Error("generate-semantic-profile returned ok=false");
  }
  return {
    status: response.status,
    confidence: response.json?.confidence ?? response.json?.data?.confidence ?? null,
  };
});

await runCheck("function-generate-embedding", "Hosted generate-embedding function", async () => {
  const response = await requestJson(`${functionsBase}/generate-embedding`, {
    label: "generate-embedding",
    method: "POST",
    headers: userHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      text: "Scholarship candidate profile for AI and computer science in the UK.",
      dimensions: 256,
    }),
  });
  if (!response.json?.ok) {
    throw new Error("generate-embedding returned ok=false");
  }
  const embedding = Array.isArray(response.json?.embedding) ? response.json.embedding : [];
  return {
    status: response.status,
    dimensions: embedding.length || response.json?.dimensions || null,
  };
});

await runCheck("function-cv-parser-parse", "Hosted cv-parser parse route", async () => {
  const response = await requestJson(`${functionsBase}/cv-parser/parse`, {
    label: "cv-parser/parse",
    expectOk: false,
    method: "POST",
    headers: userHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      rawText: "Jane Doe is a Nigerian candidate with a Master's degree in Computer Science from the University of Lagos, graduating in 2023 with a 2:1 equivalent. She scored IELTS 7.5 and has two years of AI research experience. She is targeting UK scholarships for MSc or PhD progression.",
      sourceFilename: "jane-doe-cv.txt",
      mimeType: "text/plain",
      documentType: "text",
      rawTextHash: `hash-${Date.now()}`,
    }),
  });
  parserJobId = response.json?.job_id || null;
  parserDraftId = response.json?.draft_id || null;
  if (!parserJobId) {
    throw new Error("cv-parser/parse did not return a job id.");
  }
  if (!response.ok || !response.json?.ok) {
    const errorMessage = response.json?.error?.message || response.json?.message || `HTTP ${response.status}`;
    throw new Error(`cv-parser/parse produced a failed job: ${errorMessage}`);
  }
  return {
    status: response.json?.status || null,
    jobIdPresent: Boolean(parserJobId),
    draftIdPresent: Boolean(parserDraftId),
  };
});

await runCheck("function-cv-parser-job", "Hosted cv-parser job polling route", async () => {
  if (!parserJobId) {
    throw new Error("No parser job id is available for job polling.");
  }
  const response = await requestJson(`${functionsBase}/cv-parser/jobs/${parserJobId}`, {
    label: "cv-parser/jobs",
    headers: userHeaders(accessToken),
  });
  if (!response.json?.ok) {
    throw new Error("cv-parser/jobs returned ok=false");
  }
  return {
    status: response.json?.status || null,
    phase: response.json?.phase || null,
  };
});

await runCheck("function-cv-parser-draft", "Hosted cv-parser draft route", async () => {
  if (!parserDraftId) {
    throw new Error("No parser draft id is available for draft lookup.");
  }
  const response = await requestJson(`${functionsBase}/cv-parser/drafts/${parserDraftId}`, {
    label: "cv-parser/drafts",
    headers: userHeaders(accessToken),
  });
  if (!response.json?.ok) {
    throw new Error("cv-parser/drafts returned ok=false");
  }
  return { draftIdPresent: Boolean(response.json?.draft?.id) };
});

await runCheck("function-cv-parser-draft-patch", "Hosted cv-parser draft patch route", async () => {
  if (!parserDraftId) {
    throw new Error("No parser draft id is available for draft patch.");
  }
  const response = await requestJson(`${functionsBase}/cv-parser/drafts/${parserDraftId}`, {
    label: "cv-parser draft patch",
    method: "PATCH",
    headers: userHeaders(accessToken, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      metadata_json: { verification_note: "codex smoke test" },
      low_confidence_fields: ["identity.nationality"],
    }),
  });
  if (!response.json?.ok) {
    throw new Error("cv-parser draft patch returned ok=false");
  }
  return { updated: Boolean(response.json?.draft?.updated_at) };
});

await runCheck("function-cv-parser-upload", "Hosted cv-parser upload route", async () => {
  const form = new FormData();
  form.append("file", new Blob(["John Doe from Nigeria earned a BSc in Computer Science in 2022, IELTS 8.0, and wants UK scholarships."], {
    type: "text/plain",
  }), "john-doe-cv.txt");
  form.append("notes", "verification upload path");

  const response = await requestJson(`${functionsBase}/cv-parser/upload`, {
    label: "cv-parser/upload",
    method: "POST",
    headers: userHeaders(accessToken),
    body: form,
  });
  if (!response.json?.ok) {
    throw new Error("cv-parser/upload returned ok=false");
  }
  return {
    status: response.json?.status || null,
    jobIdPresent: Boolean(response.json?.job_id),
    draftIdPresent: Boolean(response.json?.draft_id),
  };
});

await runCheck("db-sanities", "Hosted tables are queryable with service role", async () => {
  const tables = [
    "profiles",
    "cv_parse_jobs",
    "cv_profile_drafts",
    "candidate_profiles",
    "application_tracking",
  ];
  const summary = {};

  for (const table of tables) {
    const response = await requestJson(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
      label: `${table} sample`,
      headers: serviceHeaders(serviceRoleKey),
    });
    summary[table] = Array.isArray(response.json);
  }

  return summary;
}, {
  safety: "read-only",
  evidence: "database",
});

await runCheck("cleanup-parser-draft", "Delete temporary parser draft", async () => {
  if (!parserDraftId) return { skipped: true };
  await requestJson(`${supabaseUrl}/rest/v1/cv_profile_drafts?id=eq.${parserDraftId}`, {
    label: "draft cleanup",
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey),
  });
  return { deleted: true };
});

await runCheck("cleanup-parser-job", "Delete temporary parser job", async () => {
  if (!parserJobId) return { skipped: true };
  await requestJson(`${supabaseUrl}/rest/v1/cv_parse_jobs?id=eq.${parserJobId}`, {
    label: "job cleanup",
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey),
  });
  return { deleted: true };
});

// IMPORTANT: Delete profiles row BEFORE auth user.
// The bootstrap trigger creates a profiles row with FK to auth.users,
// so deleting the auth user first would violate the FK constraint.
await runCheck("cleanup-profile", "Delete temporary verification profile", async () => {
  if (!userId) return { skipped: true };
  await requestJson(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    label: "profile cleanup",
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey),
  });
  return { deleted: true };
});

await runCheck("cleanup-auth-user", "Delete temporary verification auth user", async () => {
  if (!userId) return { skipped: true };
  await requestJson(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    label: "user cleanup",
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey),
  });
  return { deleted: true };
});

const failedChecks = checks.filter((item) => !item.ok).map((item) => item.id);

console.log(JSON.stringify({
  projectHost: new URL(supabaseUrl).host,
  functionsBase,
  checks,
  passed: failedChecks.length === 0,
  failedChecks,
}, null, 2));

if (failedChecks.length) {
  process.exit(1);
}
