import { createOpenAIEmbeddings, DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL } from "../_shared/openai.ts";
import {
  corsHeaders,
  enforceRateLimit,
  ensureObject,
  getAllowedOrigins,
  jsonResponse,
  readSupabaseAnonKey,
  readSupabaseUrl,
  readNumber,
  readOptionalString,
  readString,
  readStringArray,
  rejectUnexpectedFields,
  rememberJson,
  runtimeHealthResponse,
} from "../_shared/security.ts";

const allowedOrigins = getAllowedOrigins();

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

function errorResponse(error: unknown, origin: string | null = null) {
  if (error instanceof Response) {
    return new Response(error.body, {
      status: error.status,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected embedding failure";
  return jsonResponse({
    ok: false,
    error: {
      name: "EmbeddingError",
      message,
    },
  }, 500, { origin, methods: "POST, OPTIONS", allowedOrigins });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && (!allowedOrigins.length || !allowedOrigins.includes(origin))) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
    return runtimeHealthResponse({
      functionSlug: "generate-embedding",
      requiredEnv: ["LOCI_SUPABASE_URL", "LOCI_SUPABASE_ANON_KEY", "APP_ORIGIN", "OPENAI_API_KEY"],
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: { message: "Method not allowed" } }, 405, { origin, methods: "POST, OPTIONS", allowedOrigins });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const rateLimit = await enforceRateLimit(req, {
      namespace: "embedding",
      subject: String(user?.id || "anonymous"),
      maxRequests: 30,
      windowSeconds: 5 * 60,
      origin,
      methods: "POST, OPTIONS",
      allowedOrigins,
    });
    if (rateLimit instanceof Response) return rateLimit;

    // Content-Length guard before reading the body (OWASP: prevent memory exhaustion)
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 256_000) {
      return jsonResponse({ ok: false, error: { message: "Request body too large" } }, 413, { origin, methods: "POST, OPTIONS", allowedOrigins });
    }

    const body = ensureObject(await req.json().catch(() => ({})));
    rejectUnexpectedFields(body, ["text", "texts", "model", "dimensions"], "embedding request");
    const texts = body.texts ? readStringArray(body.texts, {
      fieldName: "texts",
      maxItems: 16,
      maxLength: 8_000,
    }) : [];
    const text = body.text ? readString(body.text, {
      fieldName: "text",
      minLength: 1,
      maxLength: 8_000,
    }) : "";
    const model = readOptionalString(body.model, {
      fieldName: "model",
      maxLength: 120,
    }) || DEFAULT_EMBEDDING_MODEL;
    const dimensions = body.dimensions === undefined
      ? DEFAULT_EMBEDDING_DIMENSIONS
      : readNumber(body.dimensions, {
          fieldName: "dimensions",
          integer: true,
          min: 1,
          max: 3072,
        });
    const input = texts.length ? texts : text;

    if (!input || (Array.isArray(input) && !input.length)) {
      return jsonResponse({ ok: false, error: { message: "Empty embedding input" } }, 400, { origin, methods: "POST, OPTIONS", allowedOrigins });
    }

    const result = await rememberJson(
      "embeddings",
      { input, model, dimensions, userId: user?.id || null },
      6 * 60 * 60,
      async () => createOpenAIEmbeddings(input as string | string[], {
        model,
        dimensions,
        user: user?.id ? String(user.id) : undefined,
      }),
    );

    return jsonResponse({
      ok: true,
      model: result.model,
      embeddings: result.embeddings,
      embedding: result.embeddings[0] || null,
      usage: result.usage,
      dimensions,
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
