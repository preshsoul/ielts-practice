import { createClient } from "@supabase/supabase-js";

const ACCESS_COOKIE = "loci-sb-access-token";
const LEGACY_REFRESH_COOKIE = "loci-sb-refresh-token";
const REFRESH_COOKIE = "__Host-loci-refresh-token";
const OAUTH_NONCE_COOKIE = "loci-oauth-nonce";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();

function isProduction() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function parseCookies(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const index = entry.indexOf("=");
      if (index === -1) return acc;
      const key = decodeURIComponent(entry.slice(0, index).trim());
      const value = decodeURIComponent(entry.slice(index + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function serializeCookie(name, value, { maxAge, httpOnly = true, sameSite = "Strict", secure = isProduction() || String(name).startsWith("__Host-"), path = "/" } = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value ?? "")}`];
  if (typeof maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.trunc(maxAge))}`);
  parts.push(`Path=${path}`);
  parts.push(`SameSite=${sameSite}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name) {
  return serializeCookie(name, "", { maxAge: 0 });
}

function decodeJwtExpiresAt(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;

  try {
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const decoded = typeof atob === "function"
      ? atob(raw)
      : Buffer.from(raw, "base64").toString("utf8");
    const payload = JSON.parse(decoded);
    const exp = Number(payload?.exp);
    return Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

function resolveAuthConfig(config = {}) {
  return {
    supabaseUrl:
      config.supabaseUrl ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "",
    supabaseAnonKey:
      config.supabaseAnonKey ||
      config.supabasePublishableKey ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "",
  };
}

function createAuthClient(config = {}) {
  const { supabaseUrl, supabaseAnonKey } = resolveAuthConfig(config);
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase auth bridge is not configured.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function safeNextPath(value) {
  const next = String(value || "/").trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return "/";
  return next;
}

function safeNonce(value) {
  const nonce = String(value || "").trim();
  return /^[a-f0-9-]{16,128}$/i.test(nonce) ? nonce : "";
}

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwarded.split(",").map((entry) => entry.trim()).filter(Boolean)[0];
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    firstForwarded ||
    "unknown"
  );
}

function getRateLimitKey(request, email) {
  return `${getClientIp(request)}:${String(email || "").toLowerCase()}`;
}

function pruneLoginAttempts(now = Date.now()) {
  for (const [key, record] of loginAttempts.entries()) {
    if (!record || now - record.updatedAt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}

function getLoginRateLimitState(key, now = Date.now()) {
  pruneLoginAttempts(now);
  const record = loginAttempts.get(key);
  if (!record) return { attempts: 0, blocked: false, retryAfter: 0 };

  const elapsed = now - record.updatedAt;
  if (elapsed > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { attempts: 0, blocked: false, retryAfter: 0 };
  }

  const blocked = record.attempts >= LOGIN_MAX_ATTEMPTS;
  const retryAfter = blocked ? Math.max(1, Math.ceil((LOGIN_WINDOW_MS - elapsed) / 1000)) : 0;
  return { attempts: record.attempts, blocked, retryAfter };
}

function recordLoginFailure(key, now = Date.now()) {
  const current = loginAttempts.get(key);
  const nextAttempts = current && now - current.updatedAt <= LOGIN_WINDOW_MS ? current.attempts + 1 : 1;
  loginAttempts.set(key, { attempts: nextAttempts, updatedAt: now });
  return getLoginRateLimitState(key, now);
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Error("Origin mismatch");
  }
}

function buildSessionResponse(session) {
  if (!session?.access_token || !session?.user) {
    return null;
  }

  return {
    session: {
      access_token: session.access_token,
      expires_at: session.expires_at || null,
      expires_in: session.expires_in || null,
      token_type: session.token_type || "bearer",
      user: session.user,
    },
    user: session.user,
  };
}

function setAuthCookies(responseHeaders, session) {
  responseHeaders.append(
    "Set-Cookie",
    serializeCookie(REFRESH_COOKIE, session.refresh_token, {
      maxAge: COOKIE_MAX_AGE,
    })
  );
  responseHeaders.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
  responseHeaders.append("Set-Cookie", clearCookie(LEGACY_REFRESH_COOKIE));
}

function clearAuthCookies(responseHeaders) {
  responseHeaders.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
  responseHeaders.append("Set-Cookie", clearCookie(LEGACY_REFRESH_COOKIE));
  responseHeaders.append("Set-Cookie", clearCookie(REFRESH_COOKIE));
  responseHeaders.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0, sameSite: "Lax" }));
}

async function refreshWithTokens(supabase, refreshToken) {
  if (!refreshToken) return null;
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) return null;
  return data.session;
}

async function getVerifiedSession(supabase, accessToken, refreshToken) {
  if (!accessToken && !refreshToken) return null;

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data?.user) {
      return {
        access_token: accessToken,
        refresh_token: refreshToken || null,
        expires_at: decodeJwtExpiresAt(accessToken),
        user: data.user,
      };
    }
  }

  const refreshed = await refreshWithTokens(supabase, refreshToken);
  if (!refreshed) return null;

  return {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || refreshToken || null,
    expires_at: refreshed.expires_at || null,
    expires_in: refreshed.expires_in || null,
    token_type: refreshed.token_type || "bearer",
    user: refreshed.user,
  };
}

export async function handleAuthBridge(request, config = {}) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "session";
  const supabase = createAuthClient(config);
  const cookies = parseCookies(request.headers.get("cookie") || "");

  if (action === "login") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    assertSameOrigin(request);

    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const rateLimitKey = getRateLimitKey(request, email || "missing");
    const rateState = getLoginRateLimitState(rateLimitKey);

    if (rateState.blocked) {
      return new Response(JSON.stringify({ error: "Too many login attempts. Please try again later." }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Retry-After": String(rateState.retryAfter || 60),
        },
      });
    }

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      const updatedState = recordLoginFailure(rateLimitKey);
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...(updatedState.blocked ? { "Retry-After": String(updatedState.retryAfter || 60) } : {}),
        },
      });
    }

    clearLoginAttempts(rateLimitKey);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    setAuthCookies(headers, data.session);

    return new Response(JSON.stringify(buildSessionResponse(data.session)), {
      status: 200,
      headers,
    });
  }

  if (action === "callback") {
    const code = url.searchParams.get("code");
    const next = safeNextPath(url.searchParams.get("next"));
    const callbackNonce = safeNonce(url.searchParams.get("nonce"));
    const cookieNonce = safeNonce(cookies[OAUTH_NONCE_COOKIE] || "");

    if (!code) {
      return new Response("Missing authorization code.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    if (!callbackNonce || !cookieNonce || callbackNonce !== cookieNonce) {
      const headers = new Headers({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      clearAuthCookies(headers);
      headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0, sameSite: "Lax" }));
      return new Response("Invalid sign-in state.", {
        status: 400,
        headers,
      });
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data?.session) {
      const headers = new Headers({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0, sameSite: "Lax" }));
      return new Response("Unable to complete sign in.", {
        status: 401,
        headers,
      });
    }

    const headers = new Headers({
      Location: next,
      "Cache-Control": "no-store",
    });
    setAuthCookies(headers, data.session);
    headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0, sameSite: "Lax" }));

    return new Response(null, {
      status: 302,
      headers,
    });
  }

  if (action === "logout") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    assertSameOrigin(request);

    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    clearAuthCookies(headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  if (action === "session") {
    const session = await getVerifiedSession(
      supabase,
      cookies[ACCESS_COOKIE] || "",
      cookies[REFRESH_COOKIE] || ""
    );

    if (!session) {
      const headers = new Headers({
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      clearAuthCookies(headers);
      return new Response(JSON.stringify({ session: null, user: null }), { status: 200, headers });
    }

    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });

    if (session.refresh_token) {
      setAuthCookies(headers, {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in || 3600,
      });
    }

    return new Response(JSON.stringify(buildSessionResponse(session)), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function withAuthBridge(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      return new Response(JSON.stringify({ error: error?.message || "Auth bridge failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
  };
}

export function createAuthBridgeResponse(request, config = {}) {
  return handleAuthBridge(request, config);
}

export { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies, safeNextPath, serializeCookie };
