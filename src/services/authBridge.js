import { configureSupabaseSession, supabase } from "./supabaseClient.js";

const AUTH_BRIDGE_PATH = "/api/auth";
const OAUTH_NONCE_COOKIE = "loci-oauth-nonce";
const OAUTH_NONCE_MAX_AGE = 10 * 60;

function buildBridgeUrl(action, params = {}) {
  const url = new URL(AUTH_BRIDGE_PATH, window.location.origin);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function requestAuthBridge(action, { method = "GET", body, signal } = {}) {
  const response = await fetch(buildBridgeUrl(action), {
    method,
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body,
    signal,
  });

  if (!response.ok) {
    let message = "Authentication request failed.";
    try {
      const payload = await response.json();
      if (payload?.error) message = String(payload.error);
    } catch {
      try {
        const text = await response.text();
        if (text) message = text;
      } catch {
        // Ignore parse failures and keep the generic message.
      }
    }
    throw new Error(message);
  }

  return response.json();
}

function broadcastSession(session) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("loci-auth-session", {
      detail: session ? { session } : { session: null },
    })
  );
}

function applyClientSession(session, { broadcast = false } = {}) {
  configureSupabaseSession(session?.access_token || null);
  if (broadcast) {
    broadcastSession(session || null);
  }
  return session || null;
}

function getRedirectPath(nextPath = window.location.pathname + window.location.search + window.location.hash) {
  const value = String(nextPath || "/").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/";
  }
  return value;
}

function generateOauthNonce() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
    ? crypto.getRandomValues(new Uint8Array(16))
    : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setClientCookie(name, value, maxAgeSeconds) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}; SameSite=Lax${secure}`;
}

function clearClientCookie(name) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export async function bootstrapAuthSession(signal) {
  const payload = await requestAuthBridge("session", { signal });
  return applyClientSession(payload?.session || null);
}

export async function signInWithPassword(email, password) {
  const payload = await requestAuthBridge("login", {
    method: "POST",
    body: JSON.stringify({
      email: String(email || "").trim(),
      password: String(password || ""),
    }),
  });

  return applyClientSession(payload?.session || null, { broadcast: true });
}

export async function startGoogleSignIn(nextPath) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const nonce = generateOauthNonce();
  setClientCookie(OAUTH_NONCE_COOKIE, nonce, OAUTH_NONCE_MAX_AGE);
  // OAuth tokens arrive in the URL hash — we need a client-side page to extract them.
  // The callback.html page reads tokens from the hash, calls /api/auth?action=exchange
  // to set HttpOnly cookies, then redirects to the app.
  const callbackUrl = new URL("/auth/callback.html", window.location.origin);
  callbackUrl.searchParams.set("next", getRedirectPath(nextPath));
  callbackUrl.searchParams.set("nonce", nonce);
  const redirectTo = callbackUrl.toString();

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    clearClientCookie(OAUTH_NONCE_COOKIE);
    throw error;
  }
}

export async function signOutThroughBridge() {
  try {
    await requestAuthBridge("logout", { method: "POST" });
  } finally {
    clearClientCookie(OAUTH_NONCE_COOKIE);
    applyClientSession(null, { broadcast: true });
  }
}
