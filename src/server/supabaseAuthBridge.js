import { createClient } from "@supabase/supabase-js";
import {
  appendSecurityHeaders,
  enforceRateLimit,
  ensureObject,
  getClientIp,
  jsonResponse,
  readJsonBody,
  readString,
  rejectUnexpectedFields,
} from "./security.js";

const ACCESS_COOKIE = "loci-sb-access-token";
const LEGACY_REFRESH_COOKIE = "loci-sb-refresh-token";
const REFRESH_COOKIE = "__Host-loci-refresh-token";
const OAUTH_NONCE_COOKIE = "loci-oauth-nonce";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
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
      process.env.VITE_SUPABASE_URL ||
      "",
    supabaseAnonKey:
      config.supabaseAnonKey ||
      config.supabasePublishableKey ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
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

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeNonce(value) {
  const nonce = String(value || "").trim();
  return UUID_V4_RE.test(nonce) ? nonce : "";
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
  const ip = getClientIp(request);

  async function applyRateLimit(label, subject, maxRequests, windowSeconds) {
    const state = await enforceRateLimit({
      namespace: `auth:${label}`,
      key: `${ip}:${subject || "anonymous"}`,
      maxRequests,
      windowSeconds,
    });
    if (!state.allowed) {
      return jsonResponse(
        {
          error: "Too many requests. Please slow down and try again shortly.",
          code: "RATE_LIMITED",
        },
        429,
        { headers: state.headers }
      );
    }
    return state.headers;
  }

  if (action === "login") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    assertSameOrigin(request);

    const body = ensureObject(await readJsonBody(request));
    rejectUnexpectedFields(body, ["email", "password"], "login request");
    const email = readString(body.email || "", {
      fieldName: "email",
      minLength: 3,
      maxLength: 254,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    }).toLowerCase();
    const password = readString(body.password || "", {
      fieldName: "password",
      minLength: 1,
      maxLength: 512,
      allowEmpty: false,
    });

    const loginRateLimit = await applyRateLimit("login", email, 8, 10 * 60);
    if (loginRateLimit instanceof Response) return loginRateLimit;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data?.session) {
      return jsonResponse({ error: "Invalid email or password." }, 401, {
        headers: loginRateLimit,
      });
    }

    const headers = appendSecurityHeaders(new Headers(loginRateLimit));
    headers.set("Content-Type", "application/json; charset=utf-8");
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
    const callbackRateLimit = await applyRateLimit("callback", callbackNonce || "missing", 20, 10 * 60);
    if (callbackRateLimit instanceof Response) return callbackRateLimit;

    if (!code) {
      return new Response("Missing authorization code.", {
        status: 400,
        headers: appendSecurityHeaders({
          "Content-Type": "text/plain; charset=utf-8",
        }),
      });
    }

    if (!callbackNonce || !cookieNonce || callbackNonce !== cookieNonce) {
      const headers = appendSecurityHeaders(new Headers(callbackRateLimit));
      headers.set("Content-Type", "text/plain; charset=utf-8");
      clearAuthCookies(headers);
      headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0, sameSite: "Lax" }));
      return new Response("Invalid sign-in state.", {
        status: 400,
        headers,
      });
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data?.session) {
      const headers = appendSecurityHeaders(new Headers(callbackRateLimit));
      headers.set("Content-Type", "text/plain; charset=utf-8");
      headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0, sameSite: "Lax" }));
      return new Response("Unable to complete sign in.", {
        status: 401,
        headers,
      });
    }

    const headers = appendSecurityHeaders(new Headers(callbackRateLimit));
    headers.set("Location", next);
    setAuthCookies(headers, data.session);
    headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0, sameSite: "Lax" }));

    return new Response(null, {
      status: 302,
      headers,
    });
  }

  if (action === "logout") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    assertSameOrigin(request);
    const logoutRateLimit = await applyRateLimit("logout", cookies[REFRESH_COOKIE] || ip, 30, 5 * 60);
    if (logoutRateLimit instanceof Response) return logoutRateLimit;

    const headers = appendSecurityHeaders(new Headers(logoutRateLimit));
    headers.set("Content-Type", "application/json; charset=utf-8");
    clearAuthCookies(headers);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  if (action === "session") {
    const sessionRateLimit = await applyRateLimit("session", cookies[REFRESH_COOKIE] || ip, 120, 60);
    if (sessionRateLimit instanceof Response) return sessionRateLimit;
    const session = await getVerifiedSession(
      supabase,
      cookies[ACCESS_COOKIE] || "",
      cookies[REFRESH_COOKIE] || ""
    );

    if (!session) {
      const headers = appendSecurityHeaders(new Headers(sessionRateLimit));
      headers.set("Content-Type", "application/json; charset=utf-8");
      clearAuthCookies(headers);
      return new Response(JSON.stringify({ session: null, user: null }), { status: 200, headers });
    }

    const headers = appendSecurityHeaders(new Headers(sessionRateLimit));
    headers.set("Content-Type", "application/json; charset=utf-8");

    if (session.refresh_token) {
      setAuthCookies(headers, {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in || 3600,
      });
    }

    return new Response(JSON.stringify(buildSessionResponse(session)), { status: 200, headers });
  }

  return jsonResponse({ error: "Not found" }, 404);
}

export function withAuthBridge(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      const message = error?.message || "Auth bridge failed";
      const status = /required|invalid|unexpected field|must be/i.test(message) ? 400 : 500;
      return jsonResponse({ error: message }, status);
    }
  };
}

export function createAuthBridgeResponse(request, config = {}) {
  return handleAuthBridge(request, config);
}

export { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies, safeNextPath, serializeCookie };
