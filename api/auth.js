/**
 * Vercel Serverless Function — Auth Bridge
 *
 * Handles /api/auth?action=session|login|callback|logout|health
 * Proxies Supabase Auth operations server-side so tokens stay in
 * HttpOnly cookies (no localStorage exposure).
 */

import { createClient } from "@supabase/supabase-js";

// Cookie constants (not env-dependent)
const ACCESS_COOKIE = "loci-sb-access-token";
const REFRESH_COOKIE = "__Host-loci-refresh-token";
const OAUTH_NONCE_COOKIE = "loci-oauth-nonce";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/* ── Helpers ─────────────────────────────────────────────── */

function isProd() {
  return /^prod/i.test(process.env.VERCEL_ENV || process.env.NODE_ENV || "");
}

function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "",
  };
}

function safeNextPath(value) {
  const next = String(value || "/").trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) return "/";
  return next;
}

function parseCookies(cookieHeader = "") {
  return String(cookieHeader)
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const idx = entry.indexOf("=");
      if (idx === -1) return acc;
      acc[decodeURIComponent(entry.slice(0, idx).trim())] = decodeURIComponent(
        entry.slice(idx + 1).trim(),
      );
      return acc;
    }, {});
}

function serializeCookie(name, value, opts = {}) {
  const {
    maxAge,
    httpOnly = true,
    sameSite = "Lax",
    secure = isProd() || String(name).startsWith("__Host-"),
    path = "/",
  } = opts;
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

function setAuthCookies(headers, session) {
  headers.append(
    "Set-Cookie",
    serializeCookie(REFRESH_COOKIE, session.refresh_token, { maxAge: COOKIE_MAX_AGE }),
  );
  headers.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
}

function clearAuthCookies(headers) {
  headers.append("Set-Cookie", clearCookie(ACCESS_COOKIE));
  headers.append("Set-Cookie", clearCookie(REFRESH_COOKIE));
  headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0 }));
}

/**
 * Build a Response from a Headers object, preserving multiple Set-Cookie.
 * Vercel's runtime supports Headers.getSetCookie() for multi-cookie responses.
 */
function buildResponse(body, status, headers) {
  return new Response(body, { status, headers });
}

function jsonResponse(data, status, headers) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return buildResponse(JSON.stringify(data), status, headers);
}

function createSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    throw new Error("Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel environment variables.");
  }
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function getVerifiedSession(supabase, accessToken, refreshToken) {
  if (!accessToken && !refreshToken) return null;

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data?.user) {
      return { access_token: accessToken, refresh_token: refreshToken || null, user: data.user };
    }
  }

  if (refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data?.session) return data.session;
  }

  return null;
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  let allowedOrigin = "";
  try {
    const requestUrl = new URL(request.url);
    allowedOrigin = !origin || origin === requestUrl.origin ? origin || "*" : "";
  } catch {
    // If URL parsing fails, allow no origin
  }
  const h = new Headers();
  if (allowedOrigin) {
    h.set("Access-Control-Allow-Origin", allowedOrigin);
    h.set("Access-Control-Allow-Credentials", "true");
  }
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return h;
}

/* ── Handler ─────────────────────────────────────────────── */

export default async function handler(request) {
  const headers = corsHeaders(request);

  // Preflight
  if (request.method === "OPTIONS") {
    return buildResponse(null, 204, headers);
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return jsonResponse({ error: "Invalid request URL" }, 400, headers);
  }

  const action = url.searchParams.get("action") || "session";

  /* ── Health check ───────────────────────────────────── */

  if (action === "health") {
    try {
      const config = getSupabaseConfig();
      return jsonResponse({
        ok: true,
        supabase: {
          configured: Boolean(config.url && config.anonKey),
          urlPrefix: config.url ? config.url.slice(0, 30) + "..." : "not set",
        },
        production: isProd(),
        region: process.env.VERCEL_REGION || "unknown",
      }, 200, headers);
    } catch (e) {
      return jsonResponse({ ok: false, error: e.message }, 500, headers);
    }
  }

  try {
    const supabase = createSupabaseClient();
    const cookies = parseCookies(request.headers.get("cookie") || "");

    /* ── Session ──────────────────────────────────────── */

    if (action === "session") {
      const session = await getVerifiedSession(
        supabase,
        cookies[ACCESS_COOKIE] || "",
        cookies[REFRESH_COOKIE] || "",
      );

      if (!session) {
        const h = new Headers(headers);
        clearAuthCookies(h);
        return jsonResponse({ session: null, user: null }, 200, h);
      }

      const h = new Headers(headers);
      if (session.refresh_token) setAuthCookies(h, session);
      return jsonResponse(
        {
          session: {
            access_token: session.access_token,
            expires_at: session.expires_at || null,
            expires_in: session.expires_in || null,
            token_type: session.token_type || "bearer",
            user: session.user,
          },
        },
        200,
        h,
      );
    }

    /* ── Login ────────────────────────────────────────── */

    if (action === "login") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, headers);
      }

      let origin;
      try {
        origin = request.headers.get("origin") || "";
      } catch { origin = ""; }

      if (origin) {
        try {
          if (origin !== new URL(request.url).origin) {
            return jsonResponse({ error: "Origin mismatch" }, 403, headers);
          }
        } catch { /* proceed */ }
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400, headers);
      }

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!email || !password) {
        return jsonResponse({ error: "Email and password are required." }, 400, headers);
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data?.session) {
        return jsonResponse({ error: "Invalid email or password." }, 401, headers);
      }

      const h = new Headers(headers);
      setAuthCookies(h, data.session);
      return jsonResponse(
        {
          session: {
            access_token: data.session.access_token,
            expires_at: data.session.expires_at || null,
            expires_in: data.session.expires_in || null,
            token_type: data.session.token_type || "bearer",
            user: data.session.user,
          },
        },
        200,
        h,
      );
    }

    /* ── OAuth Callback ───────────────────────────────── */

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const next = safeNextPath(url.searchParams.get("next"));

      if (!code) {
        const h = new Headers(headers);
        h.set("Content-Type", "text/plain; charset=utf-8");
        return buildResponse("Missing authorization code.", 400, h);
      }

      const callbackNonce = String(url.searchParams.get("nonce") || "").trim();
      const cookieNonce = String(cookies[OAUTH_NONCE_COOKIE] || "").trim();
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!uuidRe.test(callbackNonce) || callbackNonce !== cookieNonce) {
        const h = new Headers(headers);
        h.set("Content-Type", "text/plain; charset=utf-8");
        clearAuthCookies(h);
        return buildResponse("Invalid sign-in state. Please try again.", 400, h);
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data?.session) {
        const h = new Headers(headers);
        h.set("Content-Type", "text/plain; charset=utf-8");
        h.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0 }));
        return buildResponse("Unable to complete sign in. Please try again.", 401, h);
      }

      const h = new Headers(headers);
      h.set("Location", next);
      setAuthCookies(h, data.session);
      h.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0 }));
      return buildResponse(null, 302, h);
    }

    /* ── Logout ───────────────────────────────────────── */

    if (action === "logout") {
      if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, headers);
      }
      const h = new Headers(headers);
      clearAuthCookies(h);
      return jsonResponse({ ok: true }, 200, h);
    }

    return jsonResponse({ error: "Not found" }, 404, headers);
  } catch (error) {
    const message = error?.message || "Auth bridge failed";
    const status = /required|invalid|unexpected|must be/i.test(message) ? 400 : 500;
    return jsonResponse({ error: message }, status, headers);
  }
}
