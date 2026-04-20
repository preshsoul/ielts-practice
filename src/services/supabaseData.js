import { supabase } from "./supabaseClient.js";

const CONTENT_BASE = "/data";

async function fetchJson(path) {
  const response = await fetch(`${CONTENT_BASE}/${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

export async function loadPublicContent() {
  const [questionsData, passagesData, scholarshipsData] = await Promise.all([
    fetchJson("questions.json"),
    fetchJson("passages.json"),
    fetchJson("scholarships.json"),
  ]);

  return {
    questions: Array.isArray(questionsData?.questions) ? questionsData.questions : [],
    passages: passagesData?.passages || {},
    institutions: Array.isArray(scholarshipsData?.institutions) ? scholarshipsData.institutions : [],
  };
}

export async function ensureProfile(user) {
  if (!supabase || !user) return null;

  const emailHash = user.email ? await hashText(user.email.toLowerCase()) : null;

  const profile = {
    id: user.id,
    display_name:
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")?.[0] ||
      null,
    email_hash: emailHash,
    is_anonymous: false,
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("profiles").upsert(profile).select().single();
  if (error) throw error;
  return data;
}

async function hashText(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadPracticeSessions(profileId) {
  if (!supabase || !profileId) return [];
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("client_session_id, exam, score, total, started_at, completed_at, duration_secs, session_data")
    .eq("profile_id", profileId)
    .order("started_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.client_session_id || row.started_at,
    date: row.completed_at || row.started_at,
    exam: row.exam,
    score: row.score,
    total: row.total,
    durationSecs: row.duration_secs || null,
    results: row.session_data?.results || [],
  }));
}

export async function savePracticeSession(profileId, session) {
  if (!supabase || !profileId) return null;
  const payload = {
    client_session_id: session.id,
    profile_id: profileId,
    exam: session.exam,
    score: session.score,
    total: session.total,
    started_at: session.date,
    completed_at: session.date,
    duration_secs: session.durationSecs || null,
    session_data: { results: session.results || [] },
  };

  const { data, error } = await supabase
    .from("practice_sessions")
    .upsert(payload, { onConflict: "client_session_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadShortlistIds(profileId) {
  if (!supabase || !profileId) return [];
  const { data, error } = await supabase
    .from("shortlists")
    .select("scholarship_id")
    .eq("profile_id", profileId)
    .order("saved_at", { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => row.scholarship_id);
}

export async function saveShortlist(profileId, scholarshipId) {
  if (!supabase || !profileId) return null;
  const { error } = await supabase.from("shortlists").upsert({
    profile_id: profileId,
    scholarship_id: scholarshipId,
    saved_at: new Date().toISOString(),
  });
  if (error) throw error;
  return true;
}

export async function removeShortlist(profileId, scholarshipId) {
  if (!supabase || !profileId) return null;
  const { error } = await supabase
    .from("shortlists")
    .delete()
    .eq("profile_id", profileId)
    .eq("scholarship_id", scholarshipId);
  if (error) throw error;
  return true;
}

export { supabase };
