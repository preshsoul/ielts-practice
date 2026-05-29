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
let currentAccessToken = null;

function isLocalBrowser() {
  const host = String(globalThis?.location?.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase environment variables are not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file."
  );
}

export let supabase = null;

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

export function getSupabaseAccessToken() {
  return currentAccessToken;
}

function createSupabaseClient(accessToken = null) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : {},
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function configureSupabaseSession(accessToken = null) {
  const normalizedToken = accessToken ? String(accessToken) : null;
  if (normalizedToken === currentAccessToken && supabase) {
    return supabase;
  }

  currentAccessToken = normalizedToken;
  supabase = createSupabaseClient(currentAccessToken);
  return supabase;
}

configureSupabaseSession();
