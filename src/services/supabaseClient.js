import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta?.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta?.env?.VITE_SUPABASE_ANON_KEY;
let currentAccessToken = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase environment variables are not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file."
  );
}

export let supabase = null;

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
