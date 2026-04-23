import { parseAndValidateDocumentIntake, StrictJsonError } from "../_shared/json-parser.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(error: unknown) {
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
    }, 400);
  }

  const message = error instanceof Error ? error.message : "Unexpected parser failure";
  return jsonResponse({
    ok: false,
    error: {
      name: "ParserError",
      message,
    },
  }, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: { message: "Method not allowed" } }, 405);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return jsonResponse({ ok: false, error: { message: "Missing authorization header" } }, 401);
  }

  const raw = await req.text();
  if (!raw.trim()) {
    return jsonResponse({ ok: false, error: { message: "Empty request body" } }, 400);
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
    });
  } catch (error) {
    return errorResponse(error);
  }
});
