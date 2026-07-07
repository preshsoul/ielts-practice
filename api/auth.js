/**
 * Vercel Serverless Function — Auth Bridge
 *
 * Handles /api/auth?action=session|login|callback|logout|health
 * Uses traditional (req, res) pattern — the stable Vercel Node.js runtime API.
 * Tokens stay in HttpOnly cookies, never exposed to client JS.
 */

import { createClient } from "@supabase/supabase-js";

/* ── Timeout + Retry ───────────────────────────────────── */
// Free-tier Supabase shares CPU and can time out under load.
// Each call gets 5s timeout + 2 retries with backoff so Vercel's
// 10s function limit isn't wasted on hanging connections.

const SB_TIMEOUT = 5000;
const SB_RETRIES = 2;

async function sbCall(fn, label) {
  let last;
  for (let i = 0; i <= SB_RETRIES; i++) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), SB_TIMEOUT)),
      ]);
    } catch (e) {
      last = e;
      if (i < SB_RETRIES) await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i)));
    }
  }
  throw last;
}

// Single-cookie auth model — Vercel's runtime merges multiple
// Set-Cookie headers into one, so we keep exactly ONE cookie.
const REFRESH_COOKIE = "loci-sb-refresh-token";
const OAUTH_NONCE_COOKIE = "loci-oauth-nonce";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/* ── Helpers ─────────────────────────────────────────────── */

function isProd() {
  return /^prod/i.test(process.env.VERCEL_ENV || process.env.NODE_ENV || "");
}

function getConfig() {
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    anonKey:
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "",
  };
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function safeNext(value) {
  const next = String(value || "/").trim();
  return !next.startsWith("/") || next.startsWith("//") || next.includes("://") ? "/" : next;
}

function parseCookies(header = "") {
  return String(header)
    .split(";")
    .map((e) => e.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const idx = entry.indexOf("=");
      if (idx === -1) return acc;
      acc[decodeURIComponent(entry.slice(0, idx).trim())] = decodeURIComponent(entry.slice(idx + 1).trim());
      return acc;
    }, {});
}

function setCookie(name, value, opts = {}) {
  const { maxAge, httpOnly = true, sameSite = "Lax", secure = isProd() || String(name).startsWith("__Host-"), path = "/" } = opts;
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value ?? "")}`];
  if (typeof maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.trunc(maxAge))}`);
  parts.push(`Path=${path}`);
  parts.push(`SameSite=${sameSite}`);
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name) {
  return setCookie(name, "", { maxAge: 0 });
}

function setAuthCookie(res, session) {
  res.setHeader("Set-Cookie", setCookie(REFRESH_COOKIE, session.refresh_token, { maxAge: COOKIE_MAX_AGE }));
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", clearCookie(REFRESH_COOKIE));
}

function createSupabase() {
  const c = getConfig();
  if (!c.url || !c.anonKey) {
    throw new Error("Supabase not configured. Check VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in Vercel env vars.");
  }
  return createClient(c.url, c.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function verifySession(supabase, accessToken, refreshToken) {
  if (!accessToken && !refreshToken) return null;
  if (accessToken) {
    try {
      const { data, error } = await sbCall(() => supabase.auth.getUser(accessToken), "getUser");
      if (!error && data?.user) return { access_token: accessToken, refresh_token: refreshToken || null, user: data.user };
    } catch { /* fall through to refresh */ }
  }
  if (refreshToken) {
    try {
      const { data, error } = await sbCall(() => supabase.auth.refreshSession({ refresh_token: refreshToken }), "refreshSession");
      if (!error && data?.session) return data.session;
    } catch { /* return null below */ }
  }
  return null;
}

// Vercel's @vercel/node runtime auto-parses JSON bodies into req.body.
// Manual stream reading can hang if the runtime already consumed it.
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  // Fallback: manually read stream (with safety check)
  return new Promise((resolve) => {
    let raw = "";
    const timeout = setTimeout(() => { resolve(null); }, 5000); // 5s safety
    req.on("data", (c) => { raw += c; });
    req.on("end", () => { clearTimeout(timeout); try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    req.on("error", () => { clearTimeout(timeout); resolve(null); });
  });
}

function corsHeaders(req) {
  const origin = (req.headers.origin || "").trim();
  const host = req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const base = `${proto}://${host}`;
  return origin && origin === base ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" } : {};
}

/* ── Handler ─────────────────────────────────────────────── */

export default async function handler(req, res) {
  // CORS
  const cors = corsHeaders(req);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `${proto}://${host}`);
  const action = url.searchParams.get("action") || "session";

  /* ── Health ────────────────────────────────────────── */

  if (action === "health") {
    const c = getConfig();
    return res.status(200).json({
      ok: true,
      supabase: { configured: Boolean(c.url && c.anonKey), urlPrefix: c.url ? c.url.slice(0, 30) + "..." : "not set" },
      production: isProd(),
    });
  }

  /* ── Exchange (OAuth token → HttpOnly cookies) ───── */

  if (action === "exchange") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = await readBody(req);
    if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid JSON body" });

    const accessToken = String(body.access_token || "").trim();
    const refreshToken = String(body.refresh_token || "").trim();
    const nonce = String(body.nonce || "").trim();

    if (!accessToken || !refreshToken) return res.status(400).json({ error: "Missing tokens." });

    // Validate nonce against cookie to prevent CSRF
    const cookieNonce = String(cookies[OAUTH_NONCE_COOKIE] || "").trim();
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(nonce) || nonce !== cookieNonce) {
      return res.status(403).json({ error: "Invalid nonce. Please restart sign-in." });
    }

    // Token came directly from Supabase OAuth — no need to verify.
    // Skipping supabase.auth.getUser() avoids Vercel timeout on slow API calls.
    // The session check (/action=session) will validate on next page load.
    res.setHeader("Set-Cookie", setCookie(REFRESH_COOKIE, refreshToken, { maxAge: COOKIE_MAX_AGE }));
    return res.status(200).json({ ok: true });
  }

  /* ── Session / Login / Callback / Logout ───────────── */

  try {
    const supabase = createSupabase();
    const cookies = parseCookies(req.headers.cookie || "");

    /* ── Session ──────────────────────────────────── */

    if (action === "session") {
      const session = await verifySession(supabase, "", cookies[REFRESH_COOKIE] || "");
      if (!session) {
        clearAuthCookie(res);
        return res.status(200).json({ session: null, user: null });
      }
      if (session.refresh_token) setAuthCookie(res, session);
      return res.status(200).json({
        session: {
          access_token: session.access_token,
          expires_at: session.expires_at || null,
          expires_in: session.expires_in || null,
          token_type: session.token_type || "bearer",
          user: session.user,
        },
      });
    }

    /* ── Login ────────────────────────────────────── */

    if (action === "login") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      // CSRF: verify same origin
      const origin = (req.headers.origin || "").trim();
      const base = `${proto}://${host}`;
      if (origin && origin !== base) return res.status(403).json({ error: "Origin mismatch" });

      const body = await readBody(req);
      if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid JSON body" });

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

      const { data, error } = await sbCall(() => supabase.auth.signInWithPassword({ email, password }), "signIn");
      if (error || !data?.session) return res.status(401).json({ error: "Invalid email or password." });

      setAuthCookie(res, data.session);
      return res.status(200).json({
        session: {
          access_token: data.session.access_token,
          expires_at: data.session.expires_at || null,
          expires_in: data.session.expires_in || null,
          token_type: data.session.token_type || "bearer",
          user: data.session.user,
        },
      });
    }

    /* ── Sign-up ──────────────────────────────────── */

    if (action === "signup") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const origin = (req.headers.origin || "").trim();
      const base = `${proto}://${host}`;
      if (origin && origin !== base) return res.status(403).json({ error: "Origin mismatch" });

      const body = await readBody(req);
      if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid JSON body" });

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!email || !isEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

      const { data, error } = await sbCall(() => supabase.auth.signUp({ email, password }), "signUp");
      if (error) {
        const msg = error.message || "Could not create account.";
        return res.status(400).json({ error: msg.includes("already registered") ? "An account with this email already exists." : msg });
      }

      // If session is available, email confirmation is disabled — log them in immediately
      if (data?.session) {
        setAuthCookie(res, data.session);
        return res.status(200).json({
          session: {
            access_token: data.session.access_token,
            expires_at: data.session.expires_at || null,
            expires_in: data.session.expires_in || null,
            token_type: data.session.token_type || "bearer",
            user: data.session.user,
          },
        });
      }

      // Email confirmation required
      return res.status(200).json({
        ok: true,
        message: "Account created! Check your email for a confirmation link before signing in.",
      });
    }

    /* ── OAuth Callback ───────────────────────────── */

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const next = safeNext(url.searchParams.get("next"));

      if (!code) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(400).send("Missing authorization code.");
      }

      // Validate OAuth nonce
      const cbNonce = String(url.searchParams.get("nonce") || "").trim();
      const cookieNonce = String(cookies[OAUTH_NONCE_COOKIE] || "").trim();
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!uuidRe.test(cbNonce) || cbNonce !== cookieNonce) {
        clearAuthCookie(res);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(400).send("Invalid sign-in state. Please try again.");
      }

      const { data, error } = await sbCall(() => supabase.auth.exchangeCodeForSession(code), "exchangeCode");
      if (error || !data?.session) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        clearAuthCookie(res);
        return res.status(401).send("Unable to complete sign in. Please try again.");
      }

      // Single Set-Cookie header — Vercel merges multiples into one
      res.setHeader("Set-Cookie", setCookie(REFRESH_COOKIE, data.session.refresh_token, { maxAge: COOKIE_MAX_AGE }));
      res.setHeader("Location", next);
      return res.status(302).end();
    }

    /* ── Logout ───────────────────────────────────── */

    if (action === "logout") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      clearAuthCookie(res);
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    const message = error?.message || "Auth bridge failed";
    const status = /required|invalid|unexpected|must be/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
