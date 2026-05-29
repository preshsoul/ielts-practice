import { parseCvRawText } from "../_shared/cv-parser.ts";
import { extractDocumentIntakeFromFile } from "../_shared/document-extract.ts";
import {
  corsHeaders,
  enforceRateLimit,
  ensureObject,
  getAllowedOrigins,
  jsonResponse,
  readSupabaseAnonKey,
  readSupabaseServiceRoleKey,
  readSupabaseUrl,
  readOptionalString,
  readString,
  rejectUnexpectedFields,
} from "../_shared/security.ts";

const allowedOrigins = getAllowedOrigins();

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB — Supabase Edge Function body limit
const MAX_TEXT_BYTES = 200_000;
const DRAFT_TTL_HOURS = 24;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildError(code: string, message: string, userAction: string, retryable = false, detail: string | null = null) {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
      user_action: userAction,
      detail,
    },
  };
}

function getSupabaseConfig() {
  const url = readSupabaseUrl();
  const anonKey = readSupabaseAnonKey();
  const serviceRoleKey = readSupabaseServiceRoleKey();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Response("Supabase function secrets are not fully configured", { status: 500 });
  }
  return { url: url.replace(/\/$/, ""), anonKey, serviceRoleKey };
}

async function requireAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Response("Missing authorization header", { status: 401 });
  }

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  });

  if (!response.ok) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return response.json();
}

async function restSelect(table: string, query: string, single = false) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(single ? { Accept: "application/vnd.pgrst.object+json" } : {}),
    },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    if (response.status === 404 || response.status === 406) {
      throw new Response(message || `${table} not found`, { status: 404 });
    }
    throw new Response(message || `Failed to read ${table}`, { status: 500 });
  }
  return response.json();
}

async function restInsert(table: string, payload: Record<string, unknown>) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Response(message || `Failed to insert into ${table}`, { status: 500 });
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function restUpdate(table: string, query: string, payload: Record<string, unknown>) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    if (response.status === 404 || response.status === 406) {
      throw new Response(message || `${table} not found`, { status: 404 });
    }
    throw new Response(message || `Failed to update ${table}`, { status: 500 });
  }
  const rows = await response.json();
  if (Array.isArray(rows) && rows.length === 0) {
    throw new Response(`${table} not found`, { status: 404 });
  }
  return Array.isArray(rows) ? rows[0] : rows;
}

function parseFunctionSubpath(url: URL) {
  const marker = "/cv-parser";
  const index = url.pathname.lastIndexOf(marker);
  if (index === -1) return "/";
  const rest = url.pathname.slice(index + marker.length);
  return rest || "/";
}

function futureExpiryIso() {
  return new Date(Date.now() + DRAFT_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

function sanitizeDraftPatch(body: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  if (body.profile_json && typeof body.profile_json === "object") payload.profile_json = body.profile_json;
  if (Array.isArray(body.missing_fields)) payload.missing_fields = body.missing_fields;
  if (Array.isArray(body.low_confidence_fields)) payload.low_confidence_fields = body.low_confidence_fields;
  if (body.metadata_json && typeof body.metadata_json === "object") payload.metadata_json = body.metadata_json;
  payload.updated_at = new Date().toISOString();
  payload.expires_at = futureExpiryIso();
  return payload;
}

function requireUuid(value: string, fieldName: string) {
  const normalized = readString(value, {
    fieldName,
    minLength: 36,
    maxLength: 36,
  });
  if (!UUID_RE.test(normalized)) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }
  return normalized;
}

function validateDraftPatchInput(body: unknown) {
  const payload = ensureObject(body);
  rejectUnexpectedFields(payload, [
    "profile_json",
    "missing_fields",
    "low_confidence_fields",
    "metadata_json",
  ], "draft patch");
  return sanitizeDraftPatch(payload);
}

function validateParseRequestBody(body: unknown) {
  const payload = ensureObject(body);
  rejectUnexpectedFields(payload, [
    "rawText",
    "sourceFilename",
    "mimeType",
    "documentType",
    "rawTextHash",
    "sourceDocumentHash",
  ], "parse request");
  const rawText = readString(payload.rawText || "", {
    fieldName: "rawText",
    minLength: 1,
    maxLength: MAX_TEXT_BYTES,
  });
  return {
    rawText,
    sourceFilename: readOptionalString(payload.sourceFilename, {
      fieldName: "sourceFilename",
      maxLength: 180,
    }),
    mimeType: readOptionalString(payload.mimeType, {
      fieldName: "mimeType",
      maxLength: 120,
    }),
    documentType: readOptionalString(payload.documentType, {
      fieldName: "documentType",
      maxLength: 40,
    }) || "text",
    sourceDocumentHash: readOptionalString(payload.rawTextHash ?? payload.sourceDocumentHash, {
      fieldName: "rawTextHash",
      maxLength: 128,
    }),
  };
}

function shapeJobResponse(job: Record<string, unknown>, draft: Record<string, unknown> | null = null) {
  const metadata = job.metadata && typeof job.metadata === "object"
    ? job.metadata as Record<string, unknown>
    : {};
  return {
    job_id: job.id,
    draft_id: draft?.id || null,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    message: job.message,
    profile: job.parsed_profile || {},
    parsed_candidate_profile: job.parsed_candidate_profile || draft?.parsed_candidate_profile || null,
    missing_fields: job.missing_fields || [],
    low_confidence_fields: job.low_confidence_fields || [],
    metadata: metadata,
    mapping_issues: Array.isArray(metadata.mapping_issues) ? metadata.mapping_issues : [],
    confidence_score: Number.isFinite(Number(metadata.overall_confidence)) ? Number(metadata.overall_confidence) : 0,
    provenance: {
      parser_version: String(job.parser_version || "cv-parser-v2"),
      method: String(job.parser_method || metadata.provider || "llm_parse"),
      model: String(job.parser_model || metadata.model || ""),
      parsed_at: job.completed_at || job.updated_at || new Date().toISOString(),
    },
    error: job.error || null,
    expires_at: job.expires_at,
  };
}

function buildSuccessMetadata(
  parsed: Awaited<ReturnType<typeof parseCvRawText>>,
  sourceFilename: string | null,
  mimeType: string | null,
  extractedCharacters: number,
) {
  return {
    ...parsed.metadata,
    source_filename: sourceFilename,
    source_mime_type: mimeType,
    extracted_characters: extractedCharacters,
    mapping_issues: Array.isArray(parsed.metadata?.mapping_issues) ? parsed.metadata.mapping_issues : [],
    confidence_score: Number.isFinite(Number(parsed.metadata?.overall_confidence)) ? Number(parsed.metadata.overall_confidence) : 0,
    // Provenance — always reflects the actual LLM / method used
    provider: parsed.metadata?.provider || null,
    model: parsed.metadata?.model || null,
    parser_version: "cv-parser-v2",
  };
}

function buildCanonicalProfile(parsed: Awaited<ReturnType<typeof parseCvRawText>>) {
  const profile = parsed.profile;
  const academicHistory = Array.isArray(profile.academic_history) ? profile.academic_history : [];
  const primaryAcademic = academicHistory[0] || {};
  const degreeClass = primaryAcademic.degree_class || null;

  // Extract CGPA evidence from metadata or degree_class label
  const gradeRaw = typeof degreeClass === "object" ? (degreeClass.raw_text || degreeClass.label || null) : null;
  const gradeNormalized = typeof degreeClass === "object" ? (degreeClass.label || null) : null;

  return {
    personal_details: {
      full_legal_name: profile.personal_details?.full_legal_name || null,
      email: profile.personal_details?.email || null,
      phone: profile.personal_details?.phone || null,
      nationality: profile.personal_details?.nationality || null,
      country_of_residence: profile.personal_details?.nationality || null,
    },
    academic_history: academicHistory.map((entry) => ({
      institution: entry.institution || null,
      institution_country: null,
      degree_type: entry.degree_type || null,
      academic_discipline: entry.academic_discipline || null,
      degree_class: entry.degree_class || null,
      graduation_date: null, // Parser currently only extracts year — date would need LLM prompt update
      graduation_year: entry.graduation_year || null,
      cgpa: null,
      cgpa_scale: null,
    })),
    professional_experience_years: null,
    international_exams: {
      ielts_band_score: profile.international_exams?.ielts_band_score || null,
      toefl_score: null,
      celpip_score: null,
    },
    grade: {
      scheme: "degree_class",
      normalized: gradeNormalized,
      raw: gradeRaw,
      cgpa: null,
      scale: null,
    },
    keywords: [],
    raw_text_snippet: null,
  };
}

async function createDraftForJob(profileId: string, jobId: string, payload: {
  sourceFilename: string | null;
  mimeType: string | null;
  documentType: string | null;
  sourceDocumentHash: string | null;
  profile: Record<string, unknown>;
  parsedCandidateProfile: Record<string, unknown>;
  missingFields: unknown[];
  lowConfidenceFields: unknown[];
  metadata: Record<string, unknown>;
  extractedPreview?: string | null;
}) {
  return restInsert("cv_profile_drafts", {
    profile_id: profileId,
    cv_parse_job_id: jobId,
    source_filename: payload.sourceFilename,
    mime_type: payload.mimeType,
    document_type: payload.documentType,
    source_document_hash: payload.sourceDocumentHash,
    profile_json: payload.profile,
    parsed_candidate_profile: payload.parsedCandidateProfile,
    missing_fields: payload.missingFields,
    low_confidence_fields: payload.lowConfidenceFields,
    metadata_json: {
      ...payload.metadata,
      ...(payload.extractedPreview ? { extracted_text_preview: payload.extractedPreview } : {}),
    },
    expires_at: futureExpiryIso(),
  });
}

async function finalizeParsedJob(profileId: string, jobId: string, payload: {
  sourceFilename: string | null;
  mimeType: string | null;
  documentType: string | null;
  sourceDocumentHash: string | null;
  rawText: string;
  parsed: Awaited<ReturnType<typeof parseCvRawText>>;
}) {
  const metadata = buildSuccessMetadata(
    payload.parsed,
    payload.sourceFilename,
    payload.mimeType,
    payload.rawText.length,
  );

  const canonicalProfile = buildCanonicalProfile(payload.parsed);

  const completedJob = await restUpdate("cv_parse_jobs", `id=eq.${jobId}&profile_id=eq.${profileId}`, {
    status: "complete",
    phase: "complete",
    progress: 100,
    message: "CV parsing complete. Review the highlighted fields before saving.",
    parsed_profile: payload.parsed.profile,
    parsed_candidate_profile: canonicalProfile,
    missing_fields: payload.parsed.missing_fields,
    low_confidence_fields: payload.parsed.low_confidence_fields,
    metadata,
    parser_version: "cv-parser-v2",
    parser_model: metadata.model || null,
    parser_method: metadata.provider || "llm_parse",
    error: null,
    expires_at: futureExpiryIso(),
  });

  const draft = await createDraftForJob(profileId, jobId, {
    sourceFilename: payload.sourceFilename,
    mimeType: payload.mimeType,
    documentType: payload.documentType,
    sourceDocumentHash: payload.sourceDocumentHash,
    profile: payload.parsed.profile as Record<string, unknown>,
    parsedCandidateProfile: canonicalProfile,
    missingFields: payload.parsed.missing_fields,
    lowConfidenceFields: payload.parsed.low_confidence_fields,
    metadata,
    extractedPreview: payload.rawText.slice(0, 1500),
  });

  return { completedJob, draft, metadata };
}

async function failJob(profileId: string, jobId: string, payload: {
  message: string;
  code: string;
  userAction: string;
  detail: string;
  retryable?: boolean;
}) {
  return restUpdate("cv_parse_jobs", `id=eq.${jobId}&profile_id=eq.${profileId}`, {
    status: "failed",
    phase: "failed",
    progress: 100,
    message: payload.message,
    error: {
      code: payload.code,
      message: payload.message,
      retryable: payload.retryable ?? false,
      user_action: payload.userAction,
      detail: payload.detail,
    },
    expires_at: futureExpiryIso(),
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  let user: { id?: string } | null = null;
  try {
    user = await requireAuthenticatedUser(req);
  } catch (error) {
    return error instanceof Response
      ? jsonResponse(buildError("ERR_UNAUTHORIZED", "You need to sign in before importing a CV.", "Authenticate again and retry the upload."), error.status, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", allowedOrigins })
      : jsonResponse(buildError("ERR_UNAUTHORIZED", "You need to sign in before importing a CV.", "Authenticate again and retry the upload."), 401, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", allowedOrigins });
  }

  const profileId = String(user?.id || "");
  const subpath = parseFunctionSubpath(new URL(req.url));

  try {
    if (req.method === "POST" && subpath === "/upload") {
      const rateLimit = await enforceRateLimit(req, {
        namespace: "cv-parser-upload",
        subject: profileId,
        maxRequests: 10,
        windowSeconds: 10 * 60,
        origin,
        methods: "GET, POST, PUT, PATCH, OPTIONS",
        allowedOrigins,
      });
      if (rateLimit instanceof Response) return rateLimit;

      // Content-Length guard before reading the body (OWASP: prevent memory exhaustion)
      const contentLength = Number(req.headers.get("content-length") || 0);
      if (contentLength > MAX_UPLOAD_BYTES) {
        return jsonResponse(buildError("ERR_FILE_TOO_LARGE", "The uploaded file exceeds the maximum allowed size.", "Compress or reduce the file to under 6 MB."), 413, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", headers: rateLimit, allowedOrigins });
      }

      const form = await req.formData();
      const file = form.get("file");
      const notes = readOptionalString(form.get("notes"), {
        fieldName: "notes",
        maxLength: 2_000,
      }) || "";

      if (!(file instanceof File)) {
        return jsonResponse(buildError("ERR_EMPTY_UPLOAD", "No upload file was attached to this request.", "Attach a CV file and try again."), 400, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", allowedOrigins });
      }

      let extracted;
      try {
        extracted = await extractDocumentIntakeFromFile(file, notes);
      } catch (error) {
        const detail = error instanceof Response
          ? await error.text().catch(() => "")
          : error instanceof Error
            ? error.message
            : "Document extraction failed";
        return jsonResponse({
          ok: false,
          status: "FAILED",
          error_code: "DOCUMENT_TEXT_UNREADABLE",
          message: "Could not read text layout streams from the uploaded file structure.",
          detail,
          mapping_issues: [],
          confidence_score: 0,
        }, 200, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", allowedOrigins });
      }

      const shellJob = await restInsert("cv_parse_jobs", {
        profile_id: profileId,
        status: "processing",
        phase: "extracting_text",
        progress: 20,
        source_filename: extracted.sourceFilename,
        mime_type: extracted.mimeType,
        document_type: extracted.documentType,
        source_document_hash: extracted.rawTextHash,
        message: "Readable text extracted. Starting academic and language analysis.",
        metadata: {
          source_filename: extracted.sourceFilename,
          source_mime_type: extracted.mimeType,
          extracted_characters: extracted.rawText.length,
        },
        expires_at: futureExpiryIso(),
      });

      try {
        const parsed = await parseCvRawText(extracted.rawText, {
          sourceFilename: extracted.sourceFilename,
          sourceMimeType: extracted.mimeType,
        });
        const { completedJob, draft, metadata } = await finalizeParsedJob(profileId, String(shellJob.id), {
          sourceFilename: extracted.sourceFilename,
          mimeType: extracted.mimeType,
          documentType: extracted.documentType,
          sourceDocumentHash: extracted.rawTextHash,
          rawText: extracted.rawText,
          parsed,
        });

        return jsonResponse({
          ok: true,
          status: "SUCCESS",
          intake: {
            sourceFilename: extracted.sourceFilename,
            mimeType: extracted.mimeType,
            documentType: extracted.documentType,
            rawTextHash: extracted.rawTextHash,
            extractedText: extracted.rawText,
            extractedExcerpt: extracted.rawText.slice(0, 1200),
          },
          data: {
            normalizedProfile: metadata.normalized_candidate_profile || null,
            mappingIssues: Array.isArray(metadata.mapping_issues) ? metadata.mapping_issues : [],
            overallConfidenceScore: Number.isFinite(Number(metadata.overall_confidence)) ? Number(metadata.overall_confidence) : 0,
          },
          ...shapeJobResponse(completedJob, draft),
          draft,
        }, 200, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", headers: rateLimit, allowedOrigins });
      } catch (error) {
        const detail = error instanceof Response ? await error.text().catch(() => "") : error instanceof Error ? error.message : "Unexpected parser failure";
        const failedJob = await failJob(profileId, String(shellJob.id), {
          message: "The CV parsing model is temporarily unavailable or returned an invalid draft.",
          code: "ERR_LLM_UNAVAILABLE",
          userAction: "Retry once. If it persists, upload a cleaner CV or switch providers.",
          detail,
          retryable: true,
        });

        return jsonResponse({
          ok: false,
          status: "FAILED",
          ...shapeJobResponse(failedJob, null),
        }, error instanceof Response ? Math.max(400, error.status) : 502, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", headers: rateLimit, allowedOrigins });
      }
    }

    if (req.method === "POST" && subpath === "/parse") {
      const rateLimit = await enforceRateLimit(req, {
        namespace: "cv-parser-parse",
        subject: profileId,
        maxRequests: 12,
        windowSeconds: 10 * 60,
        origin,
        methods: "GET, POST, PUT, PATCH, OPTIONS",
        allowedOrigins,
      });
      if (rateLimit instanceof Response) return rateLimit;

      const body = validateParseRequestBody(await req.json().catch(() => ({})));
      const { rawText, sourceFilename, mimeType, documentType, sourceDocumentHash } = body;

      if (new TextEncoder().encode(rawText).length > MAX_TEXT_BYTES) {
        return jsonResponse(buildError("ERR_FILE_TOO_LARGE", "The extracted CV text is too large for the current parser limit.", "Trim the document or upload a shorter CV version under 200 KB of text."), 413, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", allowedOrigins });
      }

      const shellJob = await restInsert("cv_parse_jobs", {
        profile_id: profileId,
        status: "processing",
        phase: "analyzing_academics",
        progress: 25,
        source_filename: sourceFilename,
        mime_type: mimeType,
        document_type: documentType,
        source_document_hash: sourceDocumentHash,
        message: "Reading academic, identity, and language signals from the CV.",
        metadata: {
          source_filename: sourceFilename,
          source_mime_type: mimeType,
          extracted_characters: rawText.length,
        },
        expires_at: futureExpiryIso(),
      });

      try {
        const parsed = await parseCvRawText(rawText, {
          sourceFilename,
          sourceMimeType: mimeType,
        });
        const { completedJob, draft, metadata } = await finalizeParsedJob(profileId, String(shellJob.id), {
          sourceFilename,
          mimeType,
          documentType,
          sourceDocumentHash,
          rawText,
          parsed,
        });

        return jsonResponse({
          ok: true,
          status: "SUCCESS",
          data: {
            normalizedProfile: metadata.normalized_candidate_profile || null,
            mappingIssues: Array.isArray(metadata.mapping_issues) ? metadata.mapping_issues : [],
            overallConfidenceScore: Number.isFinite(Number(metadata.overall_confidence)) ? Number(metadata.overall_confidence) : 0,
          },
          ...shapeJobResponse(completedJob, draft),
          draft,
        }, 200, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", headers: rateLimit, allowedOrigins });
      } catch (error) {
        const detail = error instanceof Response ? await error.text().catch(() => "") : error instanceof Error ? error.message : "Unexpected parser failure";
        const failedJob = await failJob(profileId, String(shellJob.id), {
          message: "The CV parsing model is temporarily unavailable or returned an invalid draft.",
          code: "ERR_LLM_UNAVAILABLE",
          userAction: "Retry once. If it persists, upload a cleaner CV or switch providers.",
          detail,
          retryable: true,
        });

        return jsonResponse({
          ok: false,
          status: "FAILED",
          ...shapeJobResponse(failedJob, null),
        }, error instanceof Response ? Math.max(400, error.status) : 502, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", headers: rateLimit, allowedOrigins });
      }
    }

    if (req.method === "GET" && /^\/jobs\/[^/]+$/.test(subpath)) {
      const rateLimit = await enforceRateLimit(req, {
        namespace: "cv-parser-jobs",
        subject: profileId,
        maxRequests: 120,
        windowSeconds: 60,
        origin,
        methods: "GET, POST, PUT, PATCH, OPTIONS",
        allowedOrigins,
      });
      if (rateLimit instanceof Response) return rateLimit;
      const jobId = requireUuid(subpath.split("/")[2], "job id");
      const job = await restSelect("cv_parse_jobs", `id=eq.${jobId}&profile_id=eq.${profileId}&select=*`, true);
      const draftRows = await restSelect("cv_profile_drafts", `cv_parse_job_id=eq.${jobId}&profile_id=eq.${profileId}&select=*`);
      return jsonResponse({ ok: true, ...shapeJobResponse(job, Array.isArray(draftRows) ? draftRows[0] || null : null) }, 200, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", headers: rateLimit, allowedOrigins });
    }

    if (req.method === "GET" && /^\/drafts\/[^/]+$/.test(subpath)) {
      const rateLimit = await enforceRateLimit(req, {
        namespace: "cv-parser-drafts-read",
        subject: profileId,
        maxRequests: 120,
        windowSeconds: 60,
        origin,
        methods: "GET, POST, PUT, PATCH, OPTIONS",
        allowedOrigins,
      });
      if (rateLimit instanceof Response) return rateLimit;
      const draftId = requireUuid(subpath.split("/")[2], "draft id");
      const draft = await restSelect("cv_profile_drafts", `id=eq.${draftId}&profile_id=eq.${profileId}&select=*`, true);
      return jsonResponse({ ok: true, draft }, 200, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", headers: rateLimit, allowedOrigins });
    }

    if ((req.method === "PUT" || req.method === "PATCH") && /^\/drafts\/[^/]+$/.test(subpath)) {
      const rateLimit = await enforceRateLimit(req, {
        namespace: "cv-parser-drafts-write",
        subject: profileId,
        maxRequests: 30,
        windowSeconds: 5 * 60,
        origin,
        methods: "GET, POST, PUT, PATCH, OPTIONS",
        allowedOrigins,
      });
      if (rateLimit instanceof Response) return rateLimit;
      const draftId = requireUuid(subpath.split("/")[2], "draft id");
      const payload = validateDraftPatchInput(await req.json().catch(() => ({})));
      const draft = await restUpdate("cv_profile_drafts", `id=eq.${draftId}&profile_id=eq.${profileId}`, payload);
      return jsonResponse({ ok: true, draft }, 200, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", headers: rateLimit, allowedOrigins });
    }

    return jsonResponse(buildError("ERR_METHOD_NOT_ALLOWED", "That CV parser route does not exist.", "Use /parse, /jobs/{id}, or /drafts/{id}."), 404, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", allowedOrigins });
  } catch (error) {
    const message = error instanceof Response ? await error.text().catch(() => "") : error instanceof Error ? error.message : "Unexpected parser failure";
    return jsonResponse(buildError("ERR_INTERNAL", "The CV parser function failed unexpectedly.", "Retry once. If it keeps failing, check Supabase function logs.", true, message), error instanceof Response ? Math.max(400, error.status) : 500, { origin, methods: "GET, POST, PUT, PATCH, OPTIONS", allowedOrigins });
  }
});
