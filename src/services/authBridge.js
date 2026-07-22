import { supabase } from "./supabaseClient.js";

/**
 * Thin wrappers around Supabase Auth — no custom bridge, no cookies, no API calls.
 * The SDK handles session storage, PKCE exchange, token refresh, and tab sync.
 */

export async function signInWithPassword(email, password) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || ""),
  });

  if (error) throw error;
  return data.session;
}

export async function signUpWithPassword(email, password, name) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.auth.signUp({
    email: String(email || "").trim(),
    password: String(password || ""),
    options: {
      data: { full_name: String(name || "").trim() },
    },
  });

  if (error) {
    const msg = error.message || "Could not create account.";
    if (msg.includes("already registered")) {
      throw new Error("An account with this email already exists.");
    }
    throw error;
  }

  // If email confirmation is enabled, there's no session yet
  if (!data.session) {
    return { message: "Account created! Check your email for a confirmation link before signing in." };
  }

  // Session is auto-stored by the SDK
  return data.session;
}

export async function startGoogleSignIn() {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) throw error;

  // SDK may auto-redirect; fallback manual redirect if not
  if (data?.url) {
    window.location.href = data.url;
  }
}

export async function requestPasswordReset(email) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.auth.resetPasswordForEmail(
    String(email || "").trim(),
    { redirectTo: `${window.location.origin}/auth/callback?next=/account` }
  );

  // Always return success to prevent email enumeration
  if (error) {
    console.error("Password reset error:", error.message);
  }

  return { message: "If an account with that email exists, a reset link has been sent." };
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
