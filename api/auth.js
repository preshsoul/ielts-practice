/**
 * Vercel Serverless Function — Auth Bridge
 *
 * Handles /api/auth?action=session|login|callback|logout
 * Proxies Supabase Auth operations server-side so tokens stay in
 * HttpOnly cookies (no localStorage exposure).
 *
 * Deployed automatically by Vercel from the /api directory.
 */

import { createClient } from "@supabase/supabase-js";

/* ── Config ──────────────────────────────────────────────── */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

const ACCESS_COOKIE = "loci-sb-access-token";
const REFRESH_COOKIE = "__Host-loci-refresh-token";
const OAUTH_NONCE_COOKIE = "loci-oauth-nonce";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const IS_PROD = /^prod/i.test(process.env.VERCEL_ENV || process.env.NODE_ENV || "");

/* ── Helpers ─────────────────────────────────────────────── */

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
    secure = IS_PROD || String(name).startsWith("__Host-"),
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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured.");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

/* ── CORS ────────────────────────────────────────────────── */

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowed = !origin || origin === new URL(request.url).origin;
  return allowed
    ? {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      }
    : {};
}

/* ── Handler ─────────────────────────────────────────────── */

export default async function handler(request) {
  const cors = corsHeaders(request);

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "session";

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
        const headers = new Headers(cors);
        clearAuthCookies(headers);
        return json({ session: null, user: null }, 200, Object.fromEntries(headers));
      }

      const headers = new Headers(cors);
      if (session.refresh_token) setAuthCookies(headers, session);
      return json(
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
        Object.fromEntries(headers),
      );
    }

    /* ── Login ────────────────────────────────────────── */

    if (action === "login") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

      const origin = request.headers.get("origin") || "";
      if (origin && origin !== new URL(request.url).origin) {
        return json({ error: "Origin mismatch" }, 403, cors);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400, cors);
      }

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!email || !password) {
        return json({ error: "Email and password are required." }, 400, cors);
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data?.session) {
        return json({ error: "Invalid email or password." }, 401, cors);
      }

      const headers = new Headers(cors);
      setAuthCookies(headers, data.session);
      return json(
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
        Object.fromEntries(headers),
      );
    }

    /* ── OAuth Callback ───────────────────────────────── */

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const next = safeNextPath(url.searchParams.get("next"));

      if (!code) {
        return new Response("Missing authorization code.", {
          status: 400,
          headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      // Validate OAuth nonce to prevent CSRF
      const callbackNonce = String(url.searchParams.get("nonce") || "").trim();
      const cookieNonce = String(cookies[OAUTH_NONCE_COOKIE] || "").trim();
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!uuidRe.test(callbackNonce) || callbackNonce !== cookieNonce) {
        const headers = new Headers(cors);
        headers.set("Content-Type", "text/plain; charset=utf-8");
        clearAuthCookies(headers);
        return new Response("Invalid sign-in state. Please try again.", { status: 400, headers: Object.fromEntries(headers) });
      }

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data?.session) {
        const headers = new Headers(cors);
        headers.set("Content-Type", "text/plain; charset=utf-8");
        headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0 }));
        return new Response("Unable to complete sign in. Please try again.", {
          status: 401,
          headers: Object.fromEntries(headers),
        });
      }

      const headers = new Headers(cors);
      headers.set("Location", next);
      setAuthCookies(headers, data.session);
      headers.append("Set-Cookie", serializeCookie(OAUTH_NONCE_COOKIE, "", { maxAge: 0 }));
      return new Response(null, { status: 302, headers: Object.fromEntries(headers) });
    }

    /* ── Logout ───────────────────────────────────────── */

    if (action === "logout") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

      const headers = new Headers(cors);
      clearAuthCookies(headers);
      return json({ ok: true }, 200, Object.fromEntries(headers));
    }

    return json({ error: "Not found" }, 404, cors);
  } catch (error) {
    const message = error?.message || "Auth bridge failed";
    const status = /required|invalid|unexpected|must be/i.test(message) ? 400 : 500;
    return json({ error: message }, status, cors);
  }
}
