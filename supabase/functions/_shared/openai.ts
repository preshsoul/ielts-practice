export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

type EmbeddingRequestOptions = {
  model?: string;
  dimensions?: number;
  user?: string | null;
};

function getOpenAiKey() {
  return Deno.env.get("OPENAI_API_KEY") || "";
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

