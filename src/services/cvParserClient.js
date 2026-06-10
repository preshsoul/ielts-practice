import { getCvExtractorUrl, getSupabaseAccessToken, getSupabaseFunctionsUrl, supabase } from "./supabaseClient.js";
import api from "./api.js";

function trimTrailingParserSegments(base) {
  return String(base || "")
    .replace(/\/+$/, "")
    .replace(/\/functions\/v1\/cv-parser(?:\/.*)?$/i, "")
    .replace(/\/cv-parser(?:\/.*)?$/i, "");
}

function buildCvParserUrl(path) {
  const projectUrl = getSupabaseFunctionsUrl();
  if (!projectUrl) {
    throw new Error("Supabase URL is not configured.");
  }

  const rawBase = String(projectUrl || "").replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (/\/functions\/v1\/cv-parser(?:\/[^/]+.*)?$/i.test(rawBase)) {
    return `${trimTrailingParserSegments(rawBase)}/functions/v1/cv-parser${normalizedPath}`;
  }

  if (/\/functions\/v1(?:\/.*)?$/i.test(rawBase)) {
    return `${trimTrailingParserSegments(rawBase)}/functions/v1/cv-parser${normalizedPath}`;
  }

  return `${trimTrailingParserSegments(rawBase)}/functions/v1/cv-parser${normalizedPath}`;
}

function buildBackendExtractorUrl(path) {
  const base = getCvExtractorUrl();
  if (!base) {
    throw new Error("CV extractor backend URL is not configured for this environment.");
  }
  const normalizedBase = base.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function normalizeFunctionError(error, fallbackMessage) {
  const raw = error?.context || error?.message || fallbackMessage;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed?.error || { code: "ERR_FUNCTION", message: fallbackMessage };
  } catch {
    return { code: "ERR_FUNCTION", message: String(raw || fallbackMessage) };
  }
}

async function invokeCvParser(path, { method = "POST", body } = {}) {
  const accessToken = getSupabaseAccessToken();

  if (!accessToken) {
    throw new Error("You need to sign in again before using the CV parser.");
  }

  try {
    const response = await api.request({
      url: buildCvParserUrl(path),
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      data: body,
    });
    return response.data;
  } catch (error) {
    if (error.status && error.code) throw error;
    throw Object.assign(new Error(error.message || "Unable to reach the CV parser."), {
      details: { code: "ERR_FUNCTION", message: error.message },
      status: error.status || 0,
    });
  }
}

async function invokeCvParserUpload(path, formData) {
  const accessToken = getSupabaseAccessToken();

  if (!accessToken) {
    throw new Error("You need to sign in again before using the CV parser.");
  }

  const response = await fetch(buildCvParserUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const text = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const normalized = payload?.error || { code: "ERR_FUNCTION", message: text || "Unable to upload this CV to the parser." };
    throw Object.assign(new Error(normalized.message), { details: normalized, status: response.status });
  }

  return payload;
}

function readParserState(value) {
  const state = String(value || "").trim().toLowerCase();
  if (["complete", "completed", "success"].includes(state)) return "completed";
  if (["failed", "failure", "error"].includes(state)) return "failed";
  if (["pending", "queued", "processing", "progress", "running"].includes(state)) return "processing";
  return "unknown";
}

function firstAcademicRecord(profile) {
  return Array.isArray(profile?.academic_history) && profile.academic_history.length
    ? profile.academic_history[0]
    : null;
}

function mapDegreeTypeToTargetLevel(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (text === "phd") return "PhD";
  if (text === "msc") return "Master's";
  if (text === "bsc") return "Bachelor's";
  if (text === "diploma") return "Diploma";
  return String(value || "").trim();
}

function readControlledLabel(value) {
  if (!value || typeof value !== "object") return "";
  return String(value.raw_text || value.label || value.id || "").trim();
}

function buildLegacyParsedProfile(profile = {}) {
  const academic = firstAcademicRecord(profile);
  return {
    identity: {
      nationality: readControlledLabel(profile?.personal_details?.nationality),
      countryOfResidence: readControlledLabel(profile?.personal_details?.nationality),
    },
    academic: {
      institution: academic?.institution || "",
      discipline: academic?.academic_discipline || "",
      disciplineCategory: academic?.academic_discipline || "",
      graduationYear: academic?.graduation_year ?? null,
      degreeClass: readControlledLabel(academic?.degree_class),
      degreeLevel: mapDegreeTypeToTargetLevel(academic?.degree_type),
    },
    professional: {},
    languageTests: {
      ielts: profile?.international_exams?.ielts_band_score ?? null,
    },
    applicationCycle: "",
    targetDegreeLevel: mapDegreeTypeToTargetLevel(academic?.degree_type),
    targetDisciplines: academic?.academic_discipline ? [academic.academic_discipline] : [],
    targetCountries: readControlledLabel(profile?.personal_details?.nationality)
      ? [readControlledLabel(profile.personal_details.nationality)]
      : [],
  };
}

export function mergeCvParserResultIntoIntake(intake, result) {
  const metadata = result?.metadata || {};
  const profile = result?.profile || {};
  return {
    ...intake,
    parsedProfile: buildLegacyParsedProfile(profile),
    confidence: Number.isFinite(Number(metadata?.overall_confidence))
      ? Number(metadata.overall_confidence)
      : intake?.confidence ?? 0,
    parserJobId: result?.job_id || null,
    parserDraftId: result?.draft_id || null,
    parserMetadata: metadata,
    parserEvidence: metadata?.evidence || null,
    parserValidation: metadata?.validation || null,
    missingFields: Array.isArray(result?.missing_fields) ? result.missing_fields : [],
    lowConfidenceFields: Array.isArray(result?.low_confidence_fields) ? result.low_confidence_fields : [],
    parsedCandidateProfile: profile,
  };
}

export function getCvParserJobSnapshot(result) {
  return {
    jobId: result?.job_id || null,
    draftId: result?.draft_id || null,
    state: readParserState(result?.status || result?.state),
    phase: String(result?.phase || result?.meta?.stage || "").trim(),
    progress: Number.isFinite(Number(result?.progress)) ? Number(result.progress) : null,
    message: String(result?.message || result?.error?.message || "").trim() || null,
    error: result?.error || null,
  };
}

function normalizeBackendJob(result) {
  const job = result?.job || result;
  return {
    ok: true,
    job_id: job?.job_id || null,
    draft_id: job?.draft_id || null,
    status: job?.status || null,
    phase: job?.phase || null,
    progress: job?.progress ?? null,
    message: job?.message || null,
    profile: job?.profile || {},
    missing_fields: Array.isArray(job?.missing_fields) ? job.missing_fields : [],
    low_confidence_fields: Array.isArray(job?.low_confidence_fields) ? job.low_confidence_fields : [],
    metadata: job?.metadata || {},
    error: job?.error || null,
  };
}

export async function waitForCvParseJob(jobId, { intervalMs = 1500, timeoutMs = 45000, onProgress } = {}) {
  if (!jobId) {
    throw new Error("A parser job id is required before waiting for job status.");
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const job = await getCvParseJob(jobId);
    const snapshot = getCvParserJobSnapshot(job);

    if (typeof onProgress === "function") {
      onProgress(snapshot, job);
    }

    if (snapshot.state === "completed") {
      return job;
    }

    if (snapshot.state === "failed") {
      const message = snapshot.error?.message || snapshot.message || "The parser could not finish this document.";
      throw Object.assign(new Error(message), {
        details: snapshot.error || null,
        job,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("The parser is taking longer than expected. Please try again in a moment.");
}

export async function waitForBackendCvParseJob(jobId, { intervalMs = 1500, timeoutMs = 45000, onProgress } = {}) {
  if (!jobId) {
    throw new Error("A backend parser job id is required before waiting for job status.");
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const response = await api.get(buildBackendExtractorUrl(`/api/v1/extractor/parse-cv/${jobId}`), {
      withCredentials: true,
    });
    const payload = response.data;

    const job = normalizeBackendJob(payload);
    const snapshot = getCvParserJobSnapshot(job);

    if (typeof onProgress === "function") {
      onProgress(snapshot, job);
    }

    if (snapshot.state === "completed") {
      return job;
    }

    if (snapshot.state === "failed") {
      const message = job?.error?.message || snapshot.message || "The backend extractor could not finish this document.";
      throw Object.assign(new Error(message), {
        details: job?.error || null,
        job,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("The backend extractor is taking longer than expected. Please try again in a moment.");
}

export async function parseCvDraftWithEdgeFunction(intake) {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  const payload = {
    rawText: intake?.extractedText || "",
    sourceFilename: intake?.sourceFilename || null,
    mimeType: intake?.mimeType || null,
    documentType: intake?.documentType || null,
    rawTextHash: intake?.rawTextHash || null,
  };

  const data = await invokeCvParser("/parse", { method: "POST", body: payload });

  if (!data?.ok) {
    const normalized = data?.error || { code: "ERR_FUNCTION", message: "Unable to parse the CV right now." };
    throw Object.assign(new Error(normalized.message), { details: normalized });
  }

  return data;
}

export async function parseCvFileWithEdgeFunction(file, notes = "") {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  const formData = new FormData();
  formData.append("file", file);
  if (notes) formData.append("notes", String(notes));

  const data = await invokeCvParserUpload("/upload", formData);
  if (!data?.ok) {
    const normalized = data?.error || { code: "ERR_FUNCTION", message: "Unable to parse the uploaded CV right now." };
    throw Object.assign(new Error(normalized.message), { details: normalized });
  }
  return data;
}

export async function parseCvFileWithBackendExtractor(file, { notes = "", matchCriteria = null } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  if (notes) formData.append("notes", String(notes));
  if (matchCriteria) {
    formData.append("match_criteria", JSON.stringify(matchCriteria));
  }

  const response = await fetch(buildBackendExtractorUrl("/api/v1/extractor/parse-cv"), {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || "The backend CV extractor could not accept this document.";
    throw Object.assign(new Error(message), { details: payload?.error || null, status: response.status });
  }

  return normalizeBackendJob(payload);
}

export async function getCvParseJob(jobId) {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }
  return invokeCvParser(`/jobs/${jobId}`, { method: "GET" });
}

export async function getCvProfileDraft(draftId) {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }
  return invokeCvParser(`/drafts/${draftId}`, { method: "GET" });
}

export async function updateCvProfileDraft(draftId, payload, method = "PATCH") {
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }
  return invokeCvParser(`/drafts/${draftId}`, { method, body: payload });
}
