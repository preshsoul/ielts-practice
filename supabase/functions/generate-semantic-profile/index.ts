import { createClaudeMessage, DEFAULT_ANTHROPIC_MODEL } from "../_shared/anthropic.ts";

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
    return new Response(error.body, {
      status: error.status,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected semantic-profile failure";
  return jsonResponse({
    ok: false,
    error: {
      name: "SemanticProfileError",
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
    const text = String(body?.text || "").trim();
    const model = String(body?.model || DEFAULT_ANTHROPIC_MODEL).trim() || DEFAULT_ANTHROPIC_MODEL;

    if (!text) {
      return jsonResponse({ ok: false, error: { message: "Empty semantic input" } }, 400, origin);
    }

    const prompt = `
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
`.trim();

    const result = await createClaudeMessage(prompt, {
      model,
      maxTokens: 512,
      temperature: 0,
      system: "You are a strict JSON-only normalization engine.",
    });

    const parsed = extractJsonPayload(result.text);
    const semanticText = String(parsed?.semantic_text || "").trim() || text;
    const keywords = Array.isArray(parsed?.keywords) ? parsed.keywords.map((item: unknown) => String(item ?? "").trim()).filter(Boolean) : [];
    const summary = String(parsed?.summary || "").trim() || semanticText;
    const confidence = Number.isFinite(Number(parsed?.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0.5;

    return jsonResponse({
      ok: true,
      model: result.model,
      semantic_text: semanticText,
      keywords,
      summary,
      confidence,
      usage: result.usage,
      userId: user?.id || null,
    }, 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
});

