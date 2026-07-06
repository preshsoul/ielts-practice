import { createClaudeMessage, DEFAULT_ANTHROPIC_MODEL } from "../_shared/anthropic.ts";
import { buildHardenedPrompt, validateLLMOutput } from "../_shared/prompt-guard.ts";
import {
  corsHeaders,
  enforceRateLimit,
  ensureObject,
  getAllowedOrigins,
  jsonResponse,
  readSupabaseAnonKey,
  readSupabaseUrl,
  readOptionalString,
  readString,
  readStringArray,
  readNumber,
  rejectUnexpectedFields,
  rememberJson,
  runtimeHealthResponse,
} from "../_shared/security.ts";
import {
  BAND_TO_CEFR,
  buildSystemPrompt,
  buildInstructions,
} from "./prompts.ts";
import {
  validateGeneratedReading,
  normalizeGeneratedReading,
  type GeneratedReading,
} from "./validator.ts";

const allowedOrigins = getAllowedOrigins();
const DEEPSEEK_API_BASE = "https://api.deepseek.com/v1/chat/completions";

const ALLOWED_ANTHROPIC_MODELS = new Set([
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
]);

const ALLOWED_DEEPSEEK_MODELS = new Set([
  "deepseek-chat",
  "deepseek-reasoner",
]);

const VALID_QUESTION_TYPES = new Set(["tfng", "mcq", "summary", "matching"]);

const MAX_GENERATION_ATTEMPTS = 2;

// ── Auth ────────────────────────────────────────────────────────────────────

async function requireAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Response("Missing authorization header", { status: 401 });
  }

  const supabaseUrl = readSupabaseUrl();
  const supabaseAnonKey = readSupabaseAnonKey();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Response("Supabase auth is not configured", { status: 500 });
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: supabaseAnonKey,
    },
  });

  if (!response.ok) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return response.json();
}

// ── JSON extraction ─────────────────────────────────────────────────────────

function extractJsonPayload(text: string) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

// ── Error response ──────────────────────────────────────────────────────────

function errorResponse(error: unknown, origin: string | null = null) {
  if (error instanceof Response) {
    const status = error.status;
    const message = status === 401 ? "Unauthorized"
      : status === 400 ? "Bad request"
      : status === 429 ? "Rate limited"
      : "Service temporarily unavailable";
    return jsonResponse(
      { ok: false, error: { name: "IeltsReadingGenError", message } },
      status >= 400 && status < 500 ? status : 500,
      { origin, methods: "POST, OPTIONS", allowedOrigins },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected reading generation failure";
  return jsonResponse({
    ok: false,
    error: {
      name: "IeltsReadingGenError",
      message,
    },
  }, 500, { origin, methods: "POST, OPTIONS", allowedOrigins });
}

// ── DeepSeek fallback ───────────────────────────────────────────────────────

async function callDeepseek(userMessage: string, systemMessage: string) {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY") || "";
  const model = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat";
  if (!apiKey) throw new Response("Deepseek API key is not configured", { status: 500 });

  const response = await fetch(DEEPSEEK_API_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Response(message || "Deepseek reading generation request failed", { status: response.status });
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : "";

  return {
    model: String(payload?.model || model),
    text,
    usage: payload?.usage || null,
  };
}

// ── Optional DB persistence ─────────────────────────────────────────────────

async function saveToDatabase(
  passage: GeneratedReading["passage"],
  questions: GeneratedReading["questions"],
) {
  const supabaseUrl = Deno.env.get("LOCI_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("LOCI_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("generate-ielts-reading: database config missing, skipping persistence");
    return null;
  }

  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const passageSlug = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Insert passage
  const passageRes = await fetch(`${baseUrl}/rest/v1/passages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug: passageSlug,
      title: passage.title,
      body: passage.body,
      topic: passage.topic || null,
      source: "ai-generated",
      generated: true,
      active: true,
    }),
  });

  if (!passageRes.ok) {
    const errBody = await passageRes.text().catch(() => "");
    console.error(`Failed to insert passage: ${passageRes.status} ${errBody}`);
    return null;
  }

  const savedPassage = await passageRes.json();
  const passageId = Array.isArray(savedPassage) ? savedPassage[0]?.id : savedPassage?.id;
  if (!passageId) return null;

  // Insert each question
  let insertedCount = 0;
  for (const q of questions) {
    const qRes = await fetch(`${baseUrl}/rest/v1/questions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        external_id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        exam: "IELTS",
        section: q.section || `Reading - ${q.type.toUpperCase()}`,
        passage_id: passageId,
        difficulty: q.difficulty,
        question_text: q.questionText,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        source: "ai-generated",
        verified: false,
        active: true,
        component: "Reading",
        taskType: q.type,
      }),
    });

    if (qRes.ok) insertedCount++;
  }

  return { passageId, passageSlug, questionsInserted: insertedCount };
}

// ── Core generation logic ────────────────────────────────────────────────────

async function generateReading(
  targetBand: number,
  topic: string | null,
  passageType: string,
  questionTypes: string[],
  userId: string | null,
): Promise<{ result: GeneratedReading; model: string; usage: unknown }> {
  const bandKey = String(targetBand);
  const cefrLevel = BAND_TO_CEFR[bandKey] || "B2";

  const systemPrompt = buildSystemPrompt(targetBand, passageType, questionTypes, cefrLevel);
  const instructions = buildInstructions(targetBand, passageType, questionTypes, topic);

  // Build injection-hardened prompt — user topic text is delimited and sanitized
  const { system, userMessage } = buildHardenedPrompt(instructions, topic || "No specific topic.");

  // Determine provider
  const providerEnv = String(Deno.env.get("LLM_PROVIDER") || "").toLowerCase();
  const hasDeepseek = Boolean(Deno.env.get("DEEPSEEK_API_KEY"));
  const hasAnthropic = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
  const provider = providerEnv === "deepseek" ? "deepseek"
    : providerEnv === "anthropic" ? "anthropic"
    : hasDeepseek && !hasAnthropic ? "deepseek"
    : "anthropic";

  let llmResult: { model: string; text: string; usage: unknown };

  if (provider === "deepseek") {
    const deepseekModel = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat";
    llmResult = await rememberJson(
      "ielts-reading",
      { provider: "deepseek", model: deepseekModel, targetBand, topic: topic || "__none__", passageType, questionTypes: [...questionTypes].sort(), userId: userId || null },
      60 * 60,
      async () => callDeepseek(userMessage, system),
    );
  } else {
    const anthropicModel = DEFAULT_ANTHROPIC_MODEL;
    const rawResult = await rememberJson(
      "ielts-reading",
      { provider: "anthropic", model: anthropicModel, targetBand, topic: topic || "__none__", passageType, questionTypes: [...questionTypes].sort(), userId: userId || null },
      60 * 60,
      async () => createClaudeMessage(userMessage, {
        model: anthropicModel,
        maxTokens: 4096,
        temperature: 0.7,
        system,
      }),
    );
    llmResult = {
      model: rawResult.model || anthropicModel,
      text: rawResult.text,
      usage: rawResult.usage || null,
    };
  }

  // Parse and normalize the LLM output
  const parsed = extractJsonPayload(llmResult.text);
  if (!parsed) {
    throw new Error("Failed to extract valid JSON from LLM response");
  }

  const normalized = normalizeGeneratedReading(parsed);

  // Post-processing guard: validate LLM output doesn't contain injection artifacts
  const outputCheck = validateLLMOutput(
    normalized.passage.title + " " + normalized.passage.body + " " +
    normalized.questions.map((q) => q.questionText + " " + q.explanation).join(" "),
  );
  if (!outputCheck.ok) {
    console.warn("generate-ielts-reading output flagged:", outputCheck.warnings);
  }

  return { result: normalized, model: llmResult.model, usage: llmResult.usage };
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (!allowedOrigins.length) {
    return new Response("Server misconfiguration: APP_ORIGIN is not set", { status: 500 });
  }
  if (origin && !allowedOrigins.includes(origin)) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
    return runtimeHealthResponse({
      functionSlug: "generate-ielts-reading",
      requiredEnv: [
        "LOCI_SUPABASE_URL",
        "LOCI_SUPABASE_ANON_KEY",
        "APP_ORIGIN",
        "ANTHROPIC_API_KEY",
      ],
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: { message: "Method not allowed" } },
      405,
      { origin, methods: "POST, OPTIONS", allowedOrigins },
    );
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const rateLimit = await enforceRateLimit(req, {
      namespace: "ielts-reading-gen",
      subject: String(user?.id || "anonymous"),
      maxRequests: 20,
      windowSeconds: 5 * 60,
      origin,
      methods: "POST, OPTIONS",
      allowedOrigins,
    });
    if (rateLimit instanceof Response) return rateLimit;

    // Content-Length guard before reading the body
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 16_000) {
      return jsonResponse(
        { ok: false, error: { message: "Request body too large" } },
        413,
        { origin, methods: "POST, OPTIONS", allowedOrigins },
      );
    }

    const body = ensureObject(await req.json().catch(() => ({})));
    rejectUnexpectedFields(
      body,
      ["targetBand", "topic", "passageType", "questionTypes", "saveToDb"],
      "IELTS reading generation request",
    );

    const targetBand = readNumber(body.targetBand, {
      fieldName: "targetBand",
      min: 4.0,
      max: 9.0,
    });

    const topic = readOptionalString(body.topic, {
      fieldName: "topic",
      maxLength: 200,
    });

    const passageType = readString(body.passageType, {
      fieldName: "passageType",
      pattern: /^(academic|general)$/,
    });

    const questionTypes = readStringArray(body.questionTypes, {
      fieldName: "questionTypes",
      maxItems: 4,
      maxLength: 20,
    });

    if (questionTypes.length === 0) {
      return jsonResponse(
        { ok: false, error: { name: "ValidationError", message: "At least one question type is required" } },
        400,
        { origin, methods: "POST, OPTIONS", allowedOrigins },
      );
    }

    for (const qt of questionTypes) {
      if (!VALID_QUESTION_TYPES.has(qt)) {
        return jsonResponse(
          { ok: false, error: { name: "ValidationError", message: `Invalid question type: "${qt}". Valid types: tfng, mcq, summary, matching` } },
          400,
          { origin, methods: "POST, OPTIONS", allowedOrigins },
        );
      }
    }

    // Optional: persist to database (defaults to false)
    const saveToDb = body.saveToDb === true;

    // Generate with retry-on-validation-failure
    let lastResult: GeneratedReading | null = null;
    let lastModel = "";
    let lastUsage: unknown = null;
    let lastError = "";

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const { result, model, usage } = await generateReading(
          targetBand,
          topic,
          passageType,
          questionTypes,
          user?.id || null,
        );

        const validation = validateGeneratedReading(result);

        if (validation.warnings.length > 0) {
          console.warn(`generate-ielts-reading validation warnings (attempt ${attempt}):`, validation.warnings);
        }

        if (validation.valid) {
          lastResult = result;
          lastModel = model;
          lastUsage = usage;
          lastError = "";
          break;
        }

        // Store the validation errors for potential retry
        lastError = validation.errors.join("; ");
        console.warn(`generate-ielts-reading validation failed (attempt ${attempt}):`, validation.errors);

        // On first failure, we'll retry; the cache key will be different
        // because we don't cache validation failures
        if (attempt < MAX_GENERATION_ATTEMPTS) {
          // Brief delay before retry to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (genError) {
        lastError = genError instanceof Error ? genError.message : "Generation failed";
        if (attempt >= MAX_GENERATION_ATTEMPTS) throw genError;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!lastResult) {
      return jsonResponse({
        ok: false,
        error: {
          name: "IeltsReadingGenError",
          message: "Generation failed after multiple attempts",
          details: lastError,
        },
      }, 502, { origin, methods: "POST, OPTIONS", allowedOrigins });
    }

    // Optional DB persistence
    let dbResult = null;
    if (saveToDb) {
      dbResult = await saveToDatabase(lastResult.passage, lastResult.questions);
    }

    return jsonResponse({
      ok: true,
      model: lastModel,
      passage: lastResult.passage,
      questions: lastResult.questions,
      usage: lastUsage,
      saved: dbResult,
    }, 200, {
      origin,
      methods: "POST, OPTIONS",
      headers: rateLimit,
      allowedOrigins,
    });
  } catch (error) {
    return errorResponse(error, origin);
  }
});
