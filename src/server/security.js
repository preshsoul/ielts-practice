import { createHash } from "node:crypto";

const memoryRateLimitStore = new Map();

const DEFAULT_SECURITY_HEADERS = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function getUpstashConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url, token };
}

async function upstashRequest(path, payload) {
  const config = getUpstashConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function parseForwardedFor(value = "") {
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)[0] || "";
}

export function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    parseForwardedFor(request.headers.get("x-forwarded-for")) ||
    "unknown"
  );
}

export function hashValue(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

export function appendSecurityHeaders(headers, { cacheControl = "no-store" } = {}) {
  const resolved = headers instanceof Headers ? headers : new Headers(headers || {});
  Object.entries(DEFAULT_SECURITY_HEADERS).forEach(([key, value]) => {
    if (!resolved.has(key)) resolved.set(key, value);
  });
  if (cacheControl && !resolved.has("Cache-Control")) {
    resolved.set("Cache-Control", cacheControl);
  }
  return resolved;
}

export function jsonResponse(body, status = 200, { headers, cacheControl = "no-store" } = {}) {
  const resolvedHeaders = appendSecurityHeaders(headers, { cacheControl });
  if (!resolvedHeaders.has("Content-Type")) {
    resolvedHeaders.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), { status, headers: resolvedHeaders });
}

export async function readJsonBody(request, { maxBytes = 16_384 } = {}) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new Error(`Request body exceeds ${maxBytes} bytes.`);
  }
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function ensureObject(value, message = "Expected a JSON object.") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

export function rejectUnexpectedFields(value, allowedFields, label = "request body") {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(ensureObject(value))) {
    if (!allowed.has(key)) {
      throw new Error(`Unexpected field '${key}' in ${label}.`);
    }
  }
}

export function readString(value, {
  fieldName = "value",
  minLength = 0,
  maxLength = 256,
  allowEmpty = false,
  pattern = null,
} = {}) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }
  const normalized = value.trim();
  if (!allowEmpty && normalized.length < minLength) {
    throw new Error(`${fieldName} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters.`);
  }
  if (pattern && normalized && !pattern.test(normalized)) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return normalized;
}

export async function enforceRateLimit({
  namespace,
  key,
  maxRequests,
  windowSeconds,
}) {
  const safeNamespace = readString(namespace, {
    fieldName: "rate limit namespace",
    minLength: 1,
    maxLength: 80,
  });
  const safeKey = hashValue(readString(key, {
    fieldName: "rate limit key",
    minLength: 1,
    maxLength: 512,
  }));
  const redisKey = `ratelimit:${safeNamespace}:${safeKey}`;

  const remote = await upstashRequest("/pipeline", [
    ["INCR", redisKey],
    ["EXPIRE", redisKey, windowSeconds],
    ["TTL", redisKey],
  ]);

  let count = Number(remote?.[0]?.result);
  let ttl = Number(remote?.[2]?.result);

  if (!Number.isFinite(count) || count <= 0) {
    const expiresAt = nowSeconds() + windowSeconds;
    const current = memoryRateLimitStore.get(redisKey);
    if (!current || current.expiresAt <= nowSeconds()) {
      count = 1;
      ttl = windowSeconds;
      memoryRateLimitStore.set(redisKey, { count, expiresAt });
    } else {
      current.count += 1;
      count = current.count;
      ttl = Math.max(1, current.expiresAt - nowSeconds());
      memoryRateLimitStore.set(redisKey, current);
    }
  } else {
    ttl = Number.isFinite(ttl) && ttl > 0 ? ttl : windowSeconds;
  }

  const remaining = Math.max(0, maxRequests - count);
  return {
    allowed: count <= maxRequests,
    limit: maxRequests,
    remaining,
    retryAfter: ttl,
    headers: {
      "Retry-After": String(ttl),
      "X-RateLimit-Limit": String(maxRequests),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(nowSeconds() + ttl),
    },
  };
}
