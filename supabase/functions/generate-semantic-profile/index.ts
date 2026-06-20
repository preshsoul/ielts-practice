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
  rejectUnexpectedFields,
  rememberJson,
  runtimeHealthResponse,
} from "../_shared/security.ts";

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

function errorResponse(error: unknown, origin: string | null = null) {
  if (error instanceof Response) {
    const status = error.status;
    const message = status === 401 ? "Unauthorized"
      : status === 400 ? "Bad request"
      : "Service temporarily unavailable";
    return jsonResponse({ ok: false, error: { name: "SemanticProfileError", message } }, status >= 400 && status < 500 ? status : 500, { origin, methods: "POST, OPTIONS", allowedOrigins });
  }

  const message = error instanceof Error ? error.message : "Unexpected semantic-profile failure";
  return jsonResponse({
    ok: false,
    error: {
      name: "SemanticProfileError",
      message,
    },
  }, 500, { origin, methods: "POST, OPTIONS", allowedOrigins });
}

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
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Response(message || "Deepseek semantic profile request failed", { status: response.status });
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
      functionSlug: "generate-semantic-profile",
      requiredEnv: ["LOCI_SUPABASE_URL", "LOCI_SUPABASE_ANON_KEY", "APP_ORIGIN", "DEEPSEEK_API_KEY"],
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: { message: "Method not allowed" } }, 405, { origin, methods: "POST, OPTIONS", allowedOrigins });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const rateLimit = await enforceRateLimit(req, {
      namespace: "semantic-profile",
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
    if (contentLength > 256_000) {
      return jsonResponse({ ok: false, error: { message: "Request body too large" } }, 413, { origin, methods: "POST, OPTIONS", allowedOrigins });
    }

    const body = ensureObject(await req.json().catch(() => ({})));
    rejectUnexpectedFields(body, ["text", "model"], "semantic profile request");
    const text = readString(body.text || "", {
      fieldName: "text",
      minLength: 1,
      maxLength: 12_000,
    });
    const requestedModel = readOptionalString(body.model, {
      fieldName: "model",
      maxLength: 120,
    }) || "";

    // Determine provider from requested model or env
    const providerEnv = String(Deno.env.get("LLM_PROVIDER") || "").toLowerCase();
    const hasDeepseek = Boolean(Deno.env.get("DEEPSEEK_API_KEY"));
    const hasAnthropic = Boolean(Deno.env.get("ANTHROPIC_API_KEY"));
    const provider = ALLOWED_DEEPSEEK_MODELS.has(requestedModel) ? "deepseek"
      : ALLOWED_ANTHROPIC_MODELS.has(requestedModel) ? "anthropic"
      : providerEnv === "deepseek" ? "deepseek"
      : providerEnv === "anthropic" ? "anthropic"
      : hasDeepseek && !hasAnthropic ? "deepseek"
      : "anthropic";

    // Build injection-hardened prompt — user text is delimited and sanitized
    const instructions = `You normalize scholarship candidate information for a recommendation engine.
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
- Do not include markdown or commentary.`;

    const { system, userMessage } = buildHardenedPrompt(instructions, text);

    let result: { model: string; text: string; usage: unknown };

    if (provider === "deepseek") {
      const deepseekModel = ALLOWED_DEEPSEEK_MODELS.has(requestedModel) ? requestedModel : (Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat");
      result = await rememberJson(
        "semantic-profile",
        { provider: "deepseek", model: deepseekModel, text, userId: user?.id || null },
        60 * 60,
        async () => callDeepseek(userMessage, system),
      );
    } else {
      const anthropicModel = ALLOWED_ANTHROPIC_MODELS.has(requestedModel) ? requestedModel : DEFAULT_ANTHROPIC_MODEL;
      const rawResult = await rememberJson(
        "semantic-profile",
        { provider: "anthropic", model: anthropicModel, text, userId: user?.id || null },
        60 * 60,
        async () => createClaudeMessage(userMessage, {
          model: anthropicModel,
          maxTokens: 512,
          temperature: 0,
          system,
        }),
      );
      result = {
        model: rawResult.model || anthropicModel,
        text: rawResult.text,
        usage: rawResult.usage || null,
      };
    }

    const parsed = extractJsonPayload(result.text);
    const semanticText = String(parsed?.semantic_text || "").trim() || text;
    const keywords = Array.isArray(parsed?.keywords) ? parsed.keywords.map((item: unknown) => String(item ?? "").trim()).filter(Boolean) : [];
    const summary = String(parsed?.summary || "").trim() || semanticText;
    const confidence = Number.isFinite(Number(parsed?.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0.5;

    // Post-processing guard: validate LLM output doesn't contain injection artifacts
    const outputCheck = validateLLMOutput(semanticText + " " + summary);
    if (!outputCheck.ok) {
      console.warn("semantic-profile output flagged:", outputCheck.warnings);
    }

    return jsonResponse({
      ok: true,
      model: result.model,
      semantic_text: semanticText,
      keywords,
      summary,
      confidence,
      usage: result.usage,
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
