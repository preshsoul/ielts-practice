export const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";
export const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

function getAnthropicKey() {
  return Deno.env.get("ANTHROPIC_API_KEY") || "";
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export async function createClaudeMessage(
  prompt: string,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    system?: string;
  } = {},
) {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    throw new Response("Anthropic API key is not configured", { status: 500 });
  }

  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: options.maxTokens || 512,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  if (typeof options.temperature === "number") {
    body.temperature = options.temperature;
  }

  if (options.system) {
    body.system = toText(options.system) || undefined;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": DEFAULT_ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Response(message || "Anthropic request failed", {
      status: response.status,
    });
  }

  const data = await response.json();
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((part: { type?: string; text?: string }) => part?.type === "text")
        .map((part: { text?: string }) => part?.text || "")
        .join("\n")
        .trim()
    : "";

  return {
    model: String(data?.model || options.model || DEFAULT_ANTHROPIC_MODEL),
    text,
    usage: data?.usage || null,
  };
}

