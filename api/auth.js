/**
 * Vercel Serverless Function — Auth Bridge
 *
 * Handles /api/auth?action=session|login|callback|logout|health
 * Uses traditional (req, res) pattern — the stable Vercel Node.js runtime API.
 * Tokens stay in HttpOnly cookies, never exposed to client JS.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

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

/* ── Rate Limiter (in-memory) ──────────────────────────── */
// Vercel serverless functions are short-lived, so an in-memory
// Map is sufficient. Each action has its own window + max count.

const rateStore = new Map();

const RATE_LIMITS = {
  login:     { max: 8,   windowMs: 10 * 60_000 },  //  8 per 10 min
  signup:    { max: 5,   windowMs: 10 * 60_000 },  //  5 per 10 min
  exchange:  { max: 10,  windowMs: 10 * 60_000 },  // 10 per 10 min
  session:   { max: 120, windowMs: 60_000     },  // 120 per min
  "reset-password": { max: 3, windowMs: 10 * 60_000 },  //  3 per 10 min
};

function getClientIp(req) {
  return String(
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    (req.headers["x-forwarded-for"] || "").split(",")[0] ||
    req.socket?.remoteAddress ||
    "127.0.0.1"
  ).trim();
}

function hashKey(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function checkRateLimit(action, req) {
  const limit = RATE_LIMITS[action];
  if (!limit) return null; // no limit configured

  const ip = getClientIp(req);
  const key = hashKey(`${action}:${ip}`);
  const now = Date.now();

  let entry = rateStore.get(key);
  if (!entry || now > entry.windowEnd) {
    entry = { count: 1, windowEnd: now + limit.windowMs };
    rateStore.set(key, entry);
  } else {
    entry.count += 1;
  }

  // Periodic cleanup (every ~100 requests)
  if (Math.random() < 0.01) {
    for (const [k, v] of rateStore) {
      if (now > v.windowEnd) rateStore.delete(k);
    }
  }

  if (entry.count > limit.max) {
    const retryAfter = Math.ceil((entry.windowEnd - now) / 1000);
    return {
      status: 429,
      body: {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down and try again shortly.",
        },
      },
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(limit.max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(entry.windowEnd / 1000)),
      },
    };
  }

  return null; // allowed
}

// Cookie model — `__Host-` prefix on HTTPS (enforces Secure + origin binding).
// Falls back to unprefixed names on HTTP dev (browsers reject __Host- without HTTPS).
function accessCookieName(isHttps) { return isHttps ? "__Host-loci-access-token" : "loci-sb-access-token"; }
function refreshCookieName(isHttps) { return isHttps ? "__Host-loci-refresh-token" : "loci-sb-refresh-token"; }
const OAUTH_NONCE_COOKIE = "loci-oauth-nonce"; // client-readable, not __Host-
const ACCESS_MAX_AGE = 60 * 60;        // 1 hour
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/* ── Helpers ─────────────────────────────────────────────── */

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
  const isHttps = opts.isHttps === true;
  const isHostPrefixed = String(name).startsWith("__Host-");
  const {
    maxAge,
    httpOnly = true,
    sameSite = isHostPrefixed ? "Strict" : "Lax",
    secure = isHttps || isHostPrefixed,
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

function clearCookie(name, opts = {}) {
  return setCookie(name, "", { ...opts, maxAge: 0 });
}

function makeCookieHeader(cookies) {
  return cookies.join(", ");
}

function setAuthCookies(res, session, opts = {}) {
  const isHttps = opts.isHttps === true;
  const accessName = accessCookieName(isHttps);
  const refreshName = refreshCookieName(isHttps);
  const cookies = [];
  if (session.access_token) {
    cookies.push(setCookie(accessName, session.access_token, { maxAge: ACCESS_MAX_AGE, isHttps }));
  }
  if (session.refresh_token) {
    cookies.push(setCookie(refreshName, session.refresh_token, { maxAge: REFRESH_MAX_AGE, isHttps }));
  }
  if (cookies.length) res.setHeader("Set-Cookie", makeCookieHeader(cookies));
}

function clearAuthCookies(res, opts = {}) {
  const isHttps = opts.isHttps === true;
  const accessName = accessCookieName(isHttps);
  const refreshName = refreshCookieName(isHttps);
  res.setHeader("Set-Cookie", makeCookieHeader([
    clearCookie(accessName, { isHttps }),
    clearCookie(refreshName, { isHttps }),
  ]));
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

  // 1. Try access token first (fast — no API call to refresh)
  if (accessToken) {
    try {
      const { data, error } = await sbCall(() => supabase.auth.getUser(accessToken), "getUser");
      if (!error && data?.user) {
        return { access_token: accessToken, refresh_token: refreshToken || null, user: data.user };
      }
    } catch { /* fall through to refresh */ }
  }

  // 2. Access token invalid/expired — try refresh
  if (refreshToken) {
    try {
      const { data, error } = await sbCall(
        () => supabase.auth.refreshSession({ refresh_token: refreshToken }),
        "refreshSession"
      );
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
  const isHttps = proto.startsWith("https");
  const url = new URL(req.url, `${proto}://${host}`);
  const action = url.searchParams.get("action") || "session";

  /* ── Health ────────────────────────────────────────── */

  // Parse cookies early — needed by exchange handler (which must stay
  // outside the try block to avoid the slow supabase.auth.getUser call).
  const cookies = parseCookies(req.headers.cookie || "");

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
    const rateLimit = checkRateLimit("exchange", req);
    if (rateLimit) {
      Object.entries(rateLimit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
      return res.status(429).json(rateLimit.body);
    }
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

    // Store both tokens in HttpOnly cookies.
    // The access token lets the session check skip the refresh call on next page load.
    // Nonce cookie is cleared after successful exchange (one-time use).
    const cookiesToSet = [
      setCookie(accessCookieName(isHttps), accessToken, { maxAge: ACCESS_MAX_AGE, isHttps }),
      setCookie(refreshCookieName(isHttps), refreshToken, { maxAge: REFRESH_MAX_AGE, isHttps }),
      clearCookie(OAUTH_NONCE_COOKIE, { isHttps }),
    ];
    res.setHeader("Set-Cookie", makeCookieHeader(cookiesToSet));
    return res.status(200).json({ ok: true });
  }

  /* ── Session / Login / Callback / Logout ───────────── */

  try {
    const supabase = createSupabase();

    /* ── Session ──────────────────────────────────── */

    if (action === "session") {
      // Try access token cookie first (fast path), then refresh token
      const accessName = accessCookieName(isHttps);
      const refreshName = refreshCookieName(isHttps);
      const accessTok = cookies[accessName] || "";
      const refreshTok = cookies[refreshName] || "";
      const session = await verifySession(supabase, accessTok, refreshTok);
      if (!session) {
        clearAuthCookies(res, { isHttps });
        return res.status(200).json({ session: null, user: null });
      }
      // If we refreshed, the session has new tokens — update cookies
      if (session.refresh_token && session.refresh_token !== refreshTok) {
        setAuthCookies(res, session, { isHttps });
      }
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
      const rateLimit = checkRateLimit("login", req);
      if (rateLimit) {
        Object.entries(rateLimit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(429).json(rateLimit.body);
      }
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

      setAuthCookies(res, data.session, { isHttps });
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
      const rateLimit = checkRateLimit("signup", req);
      if (rateLimit) {
        Object.entries(rateLimit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(429).json(rateLimit.body);
      }
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const origin = (req.headers.origin || "").trim();
      const base = `${proto}://${host}`;
      if (origin && origin !== base) return res.status(403).json({ error: "Origin mismatch" });

      const body = await readBody(req);
      if (!body || typeof body !== "object") return res.status(400).json({ error: "Invalid JSON body" });

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const name = String(body.name || "").trim();

      if (!name) return res.status(400).json({ error: "Full name is required." });
      if (!email || !isEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
      if (password.length > 128) return res.status(400).json({ error: "Password must be 128 characters or fewer." });

      const { data, error } = await sbCall(
        () => supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
          },
        }),
        "signUp"
      );
      if (error) {
        const msg = error.message || "Could not create account.";
        return res.status(400).json({ error: msg.includes("already registered") ? "An account with this email already exists." : msg });
      }

      // If session is available, email confirmation is disabled — log them in immediately
      if (data?.session) {
        setAuthCookies(res, data.session, { isHttps });
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
        clearAuthCookies(res, { isHttps });
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        return res.status(400).send("Invalid sign-in state. Please try again.");
      }

      const { data, error } = await sbCall(() => supabase.auth.exchangeCodeForSession(code), "exchangeCode");
      if (error || !data?.session) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        clearAuthCookies(res, { isHttps });
        return res.status(401).send("Unable to complete sign in. Please try again.");
      }

      // Store both tokens + clear the nonce cookie
      res.setHeader("Set-Cookie", makeCookieHeader([
        setCookie(accessCookieName(isHttps), data.session.access_token, { maxAge: ACCESS_MAX_AGE, isHttps }),
        setCookie(refreshCookieName(isHttps), data.session.refresh_token, { maxAge: REFRESH_MAX_AGE, isHttps }),
        clearCookie(OAUTH_NONCE_COOKIE, { isHttps }),
      ]));
      res.setHeader("Location", next);
      return res.status(302).end();
    }

    /* ── Reset Password ──────────────────────────── */

    if (action === "reset-password") {
      const rateLimit = checkRateLimit("reset-password", req);
      if (rateLimit) {
        Object.entries(rateLimit.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(429).json(rateLimit.body);
      }
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !isEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });

      // Always return success to prevent email enumeration
      await sbCall(
        () => supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${proto}://${host}/auth/callback.html?next=/account`,
        }),
        "resetPassword"
      ).catch(() => {});

      return res.status(200).json({
        ok: true,
        message: "If an account with that email exists, a reset link has been sent.",
      });
    }

    /* ── Logout ───────────────────────────────────── */

    if (action === "logout") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      clearAuthCookies(res, { isHttps });
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    const message = error?.message || "Auth bridge failed";
    const status = /required|invalid|unexpected|must be/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
