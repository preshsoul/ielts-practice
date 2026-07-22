import { createClient } from "@supabase/supabase-js";

function readPublicEnv(key) {
  const runtimeValue = globalThis?.__LOCI_ENV__?.[key];
  const viteValue = import.meta?.env?.[key];
  const normalizedRuntimeValue = /^%[A-Z0-9_]+%$/i.test(String(runtimeValue || ""))
    ? ""
    : runtimeValue;
  const normalizedViteValue = /^%[A-Z0-9_]+%$/i.test(String(viteValue || ""))
    ? ""
    : viteValue;
  return normalizedRuntimeValue || normalizedViteValue || "";
}

const supabaseUrl = readPublicEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = readPublicEnv("VITE_SUPABASE_ANON_KEY");
const supabaseFunctionsUrl = readPublicEnv("VITE_SUPABASE_FUNCTIONS_URL");
const cvExtractorUrl = readPublicEnv("VITE_CV_EXTRACTOR_URL");

function isLocalBrowser() {
  const host = String(globalThis?.location?.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

if (!supabaseUrl || !supabaseAnonKey) {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.warn(
      "Supabase environment variables are not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file."
    );
  }
}

/**
 * Single Supabase client instance.
 * PKCE flow enabled — the standard for SPAs in 2025.
 * Session auto-stored in localStorage, auto-refreshed, and
 * synchronized across tabs by the Supabase SDK.
 *
 * detectSessionInUrl is explicitly disabled: AuthCallback.jsx is the single
 * dedicated route that exchanges the ?code= param. Leaving this at its
 * default (true) makes the SDK *also* auto-exchange the same one-time-use
 * PKCE code the moment this client is constructed, racing the manual
 * exchange in AuthCallback.jsx — whichever runs second fails (commonly
 * "both auth code and code verifier should be non-empty").
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    })
  : null;

export function getSupabaseUrl() {
  return supabaseUrl;
}

export function getSupabaseFunctionsUrl() {
  return supabaseFunctionsUrl || supabaseUrl;
}

export function getCvExtractorUrl() {
  if (cvExtractorUrl) return cvExtractorUrl;
  if (isLocalBrowser()) return "http://127.0.0.1:8000";
  return "";
}
