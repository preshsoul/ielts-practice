const memoryRateLimitStore = new Map<string, { count: number; expiresAt: number }>();
const memoryCacheStore = new Map<string, { value: unknown; expiresAt: number }>();

export function readSupabaseUrl() {
  return String(
    Deno.env.get("LOCI_SUPABASE_URL")
      || Deno.env.get("SUPABASE_URL")
      || "",
  ).trim();
}

export function readSupabaseAnonKey() {
  return String(
    Deno.env.get("LOCI_SUPABASE_ANON_KEY")
      || Deno.env.get("LOCI_SUPABASE_PUBLISHABLE_KEY")
      || Deno.env.get("SUPABASE_ANON_KEY")
      || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
      || "",
  ).trim();
}

export function readSupabaseServiceRoleKey() {
  return String(
    Deno.env.get("LOCI_SUPABASE_SERVICE_ROLE_KEY")
      || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      || "",
  ).trim();
}

const DEFAULT_SECURITY_HEADERS = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export function getAllowedOrigins() {
  return String(Deno.env.get("APP_ORIGIN") || Deno.env.get("SITE_URL") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function corsHeaders(origin: string | null, methods: string, allowedOrigins = getAllowedOrigins()) {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
    Vary: "Origin",
    ...(origin && (!allowedOrigins.length || allowedOrigins.includes(origin))
      ? { "Access-Control-Allow-Origin": origin }
      : {}),
  };
}

export function withSecurityHeaders(
  headers: HeadersInit = {},
  { cacheControl = "no-store", origin = null, methods = "GET, POST, PUT, PATCH, OPTIONS", allowedOrigins = getAllowedOrigins() } = {},
) {
  const resolved = new Headers({
    ...corsHeaders(origin, methods, allowedOrigins),
    ...headers,
  });
  for (const [key, value] of Object.entries(DEFAULT_SECURITY_HEADERS)) {
    if (!resolved.has(key)) resolved.set(key, value);
  }
  if (cacheControl && !resolved.has("Cache-Control")) {
    resolved.set("Cache-Control", cacheControl);
  }
  return resolved;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  { origin = null, methods = "GET, POST, PUT, PATCH, OPTIONS", headers, cacheControl = "no-store", allowedOrigins = getAllowedOrigins() } = {},
) {
  const resolved = withSecurityHeaders(headers, { cacheControl, origin, methods, allowedOrigins });
  if (!resolved.has("Content-Type")) {
    resolved.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), { status, headers: resolved });
}

export function textResponse(
  body: string,
  status = 200,
  { origin = null, methods = "GET, POST, PUT, PATCH, OPTIONS", headers, cacheControl = "no-store", allowedOrigins = getAllowedOrigins() } = {},
) {
  const resolved = withSecurityHeaders(headers, { cacheControl, origin, methods, allowedOrigins });
  if (!resolved.has("Content-Type")) {
    resolved.set("Content-Type", "text/plain; charset=utf-8");
  }
  return new Response(body, { status, headers: resolved });
}

export function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwarded.split(",").map((entry) => entry.trim()).filter(Boolean)[0];
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    firstForwarded ||
    "unknown"
  );
}

export function ensureObject(value: unknown, path = "$") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function rejectUnexpectedFields(value: Record<string, unknown>, allowedFields: string[], label = "$") {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unexpected field '${key}' in ${label}.`);
    }
  }
}

export function readString(
  value: unknown,
  { fieldName = "value", minLength = 0, maxLength = 256, allowEmpty = false, pattern }: {
    fieldName?: string;
    minLength?: number;
    maxLength?: number;
    allowEmpty?: boolean;
    pattern?: RegExp;
  } = {},
) {
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

export function readOptionalString(
  value: unknown,
  options: {
    fieldName?: string;
    maxLength?: number;
    pattern?: RegExp;
  } = {},
) {
  if (value === null || value === undefined || value === "") return null;
  return readString(value, {
    minLength: 0,
    allowEmpty: true,
    ...options,
  }) || null;
}

export function readNumber(
  value: unknown,
  { fieldName = "value", min = -Infinity, max = Infinity, integer = false }: {
    fieldName?: string;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {},
) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a number.`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer.`);
  }
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}.`);
  }
  return value;
}

export function readStringArray(
  value: unknown,
  { fieldName = "value", maxItems = 25, maxLength = 1000 }: {
    fieldName?: string;
    maxItems?: number;
    maxLength?: number;
  } = {},
) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  if (value.length > maxItems) {
    throw new Error(`${fieldName} must contain at most ${maxItems} items.`);
  }
  return value.map((item, index) => readString(item, {
    fieldName: `${fieldName}[${index}]`,
    minLength: 1,
    maxLength,
  }));
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function upstashConfig() {
  const url = String(Deno.env.get("UPSTASH_REDIS_REST_URL") || "").trim().replace(/\/$/, "");
  const token = String(Deno.env.get("UPSTASH_REDIS_REST_TOKEN") || "").trim();
  if (!url || !token) return null;
  return { url, token };
}

async function upstashRequest(path: string, payload: unknown) {
  const config = upstashConfig();
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

function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}

export async function enforceRateLimit(
  req: Request,
  {
    namespace,
    subject,
    maxRequests,
    windowSeconds,
    origin = null,
    methods = "GET, POST, PUT, PATCH, OPTIONS",
    allowedOrigins = getAllowedOrigins(),
  }: {
    namespace: string;
    subject?: string | null;
    maxRequests: number;
    windowSeconds: number;
    origin?: string | null;
    methods?: string;
    allowedOrigins?: string[];
  },
) {
  const safeNamespace = readString(namespace, { fieldName: "namespace", minLength: 1, maxLength: 80 });
  const rawKey = `${getClientIp(req)}:${subject || "anonymous"}`;
  const keyHash = await sha256Hex(rawKey);
  const redisKey = `ratelimit:${safeNamespace}:${keyHash}`;

  const remote = await upstashRequest("/pipeline", [
    ["INCR", redisKey],
    ["EXPIRE", redisKey, windowSeconds],
    ["TTL", redisKey],
  ]);

  let count = Number(remote?.[0]?.result);
  let ttl = Number(remote?.[2]?.result);
  if (!Number.isFinite(count) || count <= 0) {
    const current = memoryRateLimitStore.get(redisKey);
    const now = epochSeconds();
    if (!current || current.expiresAt <= now) {
      count = 1;
      ttl = windowSeconds;
      memoryRateLimitStore.set(redisKey, { count, expiresAt: now + windowSeconds });
    } else {
      current.count += 1;
      count = current.count;
      ttl = Math.max(1, current.expiresAt - now);
      memoryRateLimitStore.set(redisKey, current);
    }
  } else {
    ttl = Number.isFinite(ttl) && ttl > 0 ? ttl : windowSeconds;
  }

  const remaining = Math.max(0, maxRequests - count);
  const headers = {
    "Retry-After": String(ttl),
    "X-RateLimit-Limit": String(maxRequests),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(epochSeconds() + ttl),
  };

  if (count > maxRequests) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down and try again shortly.",
        },
      },
      429,
      { origin, methods, headers, allowedOrigins },
    );
  }

  return headers;
}

export async function rememberJson<T>(
  namespace: string,
  payload: unknown,
  ttlSeconds: number,
  loader: () => Promise<T>,
) {
  const safeNamespace = readString(namespace, { fieldName: "cache namespace", minLength: 1, maxLength: 80 });
  const cacheKey = `cache:${safeNamespace}:${await sha256Hex(JSON.stringify(payload))}`;
  const now = epochSeconds();
  const inMemory = memoryCacheStore.get(cacheKey);
  if (inMemory && inMemory.expiresAt > now) {
    return inMemory.value as T;
  }

  const remote = await upstashRequest("/get", [cacheKey]);
  if (typeof remote?.result === "string") {
    try {
      const parsed = JSON.parse(remote.result);
      memoryCacheStore.set(cacheKey, { value: parsed, expiresAt: now + ttlSeconds });
      return parsed as T;
    } catch {
      // Ignore malformed cache entries and recompute below.
    }
  }

  const value = await loader();
  memoryCacheStore.set(cacheKey, { value, expiresAt: now + ttlSeconds });
  await upstashRequest("/set", [cacheKey, JSON.stringify(value), { ex: ttlSeconds }]);
  return value;
}
