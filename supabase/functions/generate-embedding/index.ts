import { createOpenAIEmbeddings, DEFAULT_EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_MODEL } from "../_shared/openai.ts";

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

  const message = error instanceof Error ? error.message : "Unexpected embedding failure";
  return jsonResponse({
    ok: false,
    error: {
      name: "EmbeddingError",
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
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const texts = Array.isArray(body?.texts)
      ? body.texts.map((item: unknown) => String(item ?? "").trim()).filter(Boolean)
      : [];
    const text = String(body?.text ?? "").trim();
    const model = String(body?.model || DEFAULT_EMBEDDING_MODEL).trim() || DEFAULT_EMBEDDING_MODEL;
    const dimensions = Number.isFinite(Number(body?.dimensions)) ? Number(body?.dimensions) : DEFAULT_EMBEDDING_DIMENSIONS;
    const input = texts.length ? texts : text;

    if (!input || (Array.isArray(input) && !input.length)) {
      return jsonResponse({ ok: false, error: { message: "Empty embedding input" } }, 400, origin);
    }

    const result = await createOpenAIEmbeddings(input as string | string[], {
      model,
      dimensions,
      user: user?.id ? String(user.id) : undefined,
    });

    return jsonResponse({
      ok: true,
      model: result.model,
      embeddings: result.embeddings,
      embedding: result.embeddings[0] || null,
      usage: result.usage,
      dimensions,
    }, 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
});

