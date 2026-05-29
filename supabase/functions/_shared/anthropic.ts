export const DEFAULT_ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-haiku-20241022";
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
    await response.body?.cancel();
    throw new Response("Anthropic request failed", { status: response.status });
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

type ClaudeToolDefinition = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type ClaudeToolChoice =
  | { type: "auto" | "any" | "none" }
  | { type: "tool"; name: string };

export async function createClaudeToolMessage(
  prompt: string,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    system?: string;
    tools: ClaudeToolDefinition[];
    toolChoice: ClaudeToolChoice;
  },
) {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    throw new Response("Anthropic API key is not configured", { status: 500 });
  }

  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: options.maxTokens || 1024,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    tools: options.tools,
    tool_choice: options.toolChoice,
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
    const detail = await response.text().catch(() => "");
    throw new Response(detail || "Anthropic tool request failed", { status: response.status });
  }

  const data = await response.json();
  const toolUse = Array.isArray(data?.content)
    ? data.content.find((part: { type?: string; name?: string; input?: unknown }) => part?.type === "tool_use")
    : null;

  if (!toolUse || typeof toolUse !== "object") {
    throw new Response("Anthropic response did not contain a tool_use block", { status: 502 });
  }

  return {
    model: String(data?.model || options.model || DEFAULT_ANTHROPIC_MODEL),
    usage: data?.usage || null,
    toolName: String((toolUse as { name?: string }).name || ""),
    toolInput: ((toolUse as { input?: unknown }).input && typeof (toolUse as { input?: unknown }).input === "object")
      ? (toolUse as { input: Record<string, unknown> }).input
      : {},
    rawResponse: data,
  };
}
