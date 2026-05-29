import { parseAndValidateDocumentIntake, StrictJsonError } from "../_shared/json-parser.js";
import { corsHeaders, enforceRateLimit, getAllowedOrigins, jsonResponse, readSupabaseAnonKey, readSupabaseUrl } from "../_shared/security.ts";

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

  if (error instanceof StrictJsonError) {
    return jsonResponse({
      ok: false,
      error: {
        name: error.name,
        message: error.message,
        line: error.line,
        column: error.column,
        path: error.path,
      },
    }, 400, { origin, methods: "POST, OPTIONS", allowedOrigins });
  }

  const message = error instanceof Error ? error.message : "Unexpected parser failure";
  return jsonResponse({
    ok: false,
    error: {
      name: "ParserError",
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

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: { message: "Method not allowed" } }, 405, { origin, methods: "POST, OPTIONS", allowedOrigins });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const rateLimit = await enforceRateLimit(req, {
      namespace: "document-intake",
      subject: String(user?.id || "anonymous"),
      maxRequests: 30,
      windowSeconds: 5 * 60,
      origin,
      methods: "POST, OPTIONS",
      allowedOrigins,
    });
    if (rateLimit instanceof Response) return rateLimit;
  } catch (error) {
    return errorResponse(error, origin);
  }

  // Content-Length guard before reading the body (OWASP: prevent memory exhaustion)
  const maxBodyBytes = 512_000; // 512 KB — document intake JSON payload limit
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > maxBodyBytes) {
    return jsonResponse({ ok: false, error: { message: "Request body too large" } }, 413, { origin, methods: "POST, OPTIONS", allowedOrigins });
  }

  const raw = await req.text();
  if (!raw.trim()) {
    return jsonResponse({ ok: false, error: { message: "Empty request body" } }, 400, { origin, methods: "POST, OPTIONS", allowedOrigins });
  }

  try {
    const intake = parseAndValidateDocumentIntake(raw, {
      maxBytes: 256_000,
      maxDepth: 32,
      maxObjectKeys: 128,
      maxArrayItems: 256,
    });

    return jsonResponse({
      ok: true,
      intake,
      metrics: {
        normalizedKeys: Object.keys(intake).length,
        nestedDepthLimit: 32,
        maxBytes: 256_000,
      },
    }, 200, { origin, methods: "POST, OPTIONS", allowedOrigins });
  } catch (error) {
    return errorResponse(error, origin);
  }
});
