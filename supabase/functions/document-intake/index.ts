import { parseAndValidateDocumentIntake, StrictJsonError } from "../_shared/json-parser.js";

const allowedOrigins = String(Deno.env.get("APP_ORIGIN") || Deno.env.get("SITE_URL") || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    ...(origin && (!allowedOrigins.length || allowedOrigins.includes(origin))
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
  };
}

function jsonResponse(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

async function requireAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    throw new Response("Missing authorization header", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
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
    }, 400, origin);
  }

  const message = error instanceof Error ? error.message : "Unexpected parser failure";
  return jsonResponse({
    ok: false,
    error: {
      name: "ParserError",
      message,
    },
  }, 500, origin);
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
    return jsonResponse({ ok: false, error: { message: "Method not allowed" } }, 405, origin);
  }

  try {
    await requireAuthenticatedUser(req);
  } catch (error) {
    return errorResponse(error, origin);
  }

  const raw = await req.text();
  if (!raw.trim()) {
    return jsonResponse({ ok: false, error: { message: "Empty request body" } }, 400, origin);
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
    }, 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
});
