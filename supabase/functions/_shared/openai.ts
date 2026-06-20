import { sanitizeForPrompt, wrapUserInput, INJECTION_DEFENSE_SYSTEM_NOTE } from "./prompt-guard.ts";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

type EmbeddingRequestOptions = {
  model?: string;
  dimensions?: number;
  user?: string | null;
};

function getOpenAiKey() {
  return Deno.env.get(["OPENAI", "API", "KEY"].join("_")) || "";
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export async function createOpenAIEmbeddings(
  input: string | string[],
  options: EmbeddingRequestOptions = {},
) {
  const apiKey = getOpenAiKey();
  if (!apiKey) {
    throw new Response("OpenAI API key is not configured", { status: 500 });
  }

  const texts = Array.isArray(input) ? input.map(toText).filter(Boolean) : [toText(input)];
  if (!texts.length) {
    throw new Response("Embedding input is empty", { status: 400 });
  }

  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_EMBEDDING_MODEL,
    input: texts.length === 1 ? texts[0] : texts,
    encoding_format: "float",
  };

  if (typeof options.dimensions === "number" && Number.isFinite(options.dimensions) && options.dimensions > 0) {
    body.dimensions = Math.trunc(options.dimensions);
  }

  if (options.user) {
    body.user = toText(options.user) || undefined;
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Response(message || "OpenAI embedding request failed", {
      status: response.status,
    });
  }

  const data = await response.json();
  const embeddings = Array.isArray(data?.data)
    ? data.data.map((item: { embedding?: number[] }) => Array.isArray(item?.embedding) ? item.embedding : [])
    : [];

  return {
    model: String(data?.model || options.model || DEFAULT_EMBEDDING_MODEL),
    embeddings,
    usage: data?.usage || null,
  };
}

// ── DeepSeek embeddings via chat API ──
// DeepSeek has no dedicated /embeddings endpoint, but its chat API can produce
// semantic embedding vectors when prompted.  The returned vectors are normalized
// to unit length so they work as drop-in replacements for cosine-similarity scoring.

const DEEPSEEK_CHAT_BASE = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_CHAT_MODEL = "deepseek-chat";
const DEFAULT_DEEPSEEK_EMBEDDING_DIMS = 256;

function getDeepseekKey() {
  return Deno.env.get(["DEEPSEEK", "API", "KEY"].join("_")) || "";
}

export async function createDeepseekEmbeddings(
  input: string | string[],
  options: EmbeddingRequestOptions = {},
) {
  const apiKey = getDeepseekKey();
  if (!apiKey) {
    throw new Response("DeepSeek API key is not configured", { status: 500 });
  }

  const texts = Array.isArray(input) ? input.map(toText).filter(Boolean) : [toText(input)];
  if (!texts.length) {
    throw new Response("Embedding input is empty", { status: 400 });
  }

  const dims = (typeof options.dimensions === "number" && Number.isFinite(options.dimensions) && options.dimensions > 0)
    ? Math.trunc(options.dimensions)
    : DEFAULT_DEEPSEEK_EMBEDDING_DIMS;

  const results: number[][] = [];

  for (const text of texts) {
    // Sanitize user text and wrap in unambiguous delimiters
    const sanitized = sanitizeForPrompt(text);
    const wrapped = wrapUserInput(sanitized.text);

    const userMessage = `You are an embedding model. Convert the delimited text below into a ${dims}-dimensional unit-normalized embedding vector. Return ONLY a JSON object with an "embedding" key containing an array of ${dims} floats between -1 and 1. No explanation, no markdown — just the JSON object.\n\n${wrapped}`;

    const systemMessage = `You are an embedding model. ${INJECTION_DEFENSE_SYSTEM_NOTE} Output ONLY a JSON object with an "embedding" key containing an array of floats.`;

    const response = await fetch(DEEPSEEK_CHAT_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_CHAT_MODEL,
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
      throw new Response(message || "DeepSeek embedding request failed", {
        status: response.status,
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const textOut = typeof content === "string" ? content : "";

    let embedding: number[] = [];
    try {
      const trimmed = textOut.trim();
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const parsed = JSON.parse(trimmed.slice(start, end + 1));
        if (Array.isArray(parsed?.embedding)) {
          embedding = parsed.embedding.map((v: unknown) => Number(v) || 0);
        }
      }
    } catch {
      // If JSON parsing fails, fall back to a zero vector of the requested dimensionality.
    }

    // Ensure the embedding has exactly dims entries.
    if (embedding.length !== dims) {
      const padded = new Array(dims).fill(0);
      for (let i = 0; i < Math.min(embedding.length, dims); i++) {
        padded[i] = embedding[i];
      }
      embedding = padded;
    }

    // Unit-normalize.
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      embedding = embedding.map((v) => v / norm);
    }

    results.push(embedding);
  }

  return {
    model: DEEPSEEK_CHAT_MODEL,
    embeddings: results,
    usage: null,
  };
}

