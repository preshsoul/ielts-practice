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

export async function saveStructuredProfile(profileId, structuredProfile) {
  if (!supabase || !profileId) return null;

  const payload = {
    ...structuredProfile,
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", profileId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveCvProfile(profileId, cvProfile) {
  if (!supabase || !profileId) return null;

  const payload = {
    profile_id: profileId,
    label: cvProfile?.label || null,
    source_filename: cvProfile?.sourceFilename || null,
    mime_type: cvProfile?.mimeType || null,
    document_type: cvProfile?.documentType || null,
    keywords: Array.isArray(cvProfile?.keywords) ? cvProfile.keywords : [],
    raw_text_hash: cvProfile?.raw_text_hash || null,
    extracted_excerpt: cvProfile?.extractedExcerpt || null,
    extracted_text: cvProfile?.extractedText || null,
    parsed_profile: cvProfile?.parsedProfile || {},
    confidence: cvProfile?.confidence ?? null,
  };

  const { data, error } = await supabase
    .from("cv_profiles")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

function buildApplicationChecklist(scholarship = {}) {
  const application = scholarship.application || {};
  const eligibility = scholarship.eligibility || {};
  const requiredDocuments = Array.isArray(application.requiredDocuments) && application.requiredDocuments.length
    ? application.requiredDocuments
    : ["CV", "Transcript", "Two references"];
  return {
    requiredDocuments,
    completedDocuments: [],
    refereesRequired: eligibility.refereesRequired || application.refereesRequired || 2,
  };
}

function buildApplicationHistory(state, previousHistory = []) {
  return [
    ...previousHistory,
    {
      state,
      at: new Date().toISOString(),
      source: "client",
    },
  ];
}

const APPLICATION_STATE_TRANSITIONS = {
  saved: ["drafting", "submitted", "rejected"],
  drafting: ["saved", "submitted", "rejected"],
  submitted: ["drafting", "interview", "awarded", "rejected"],
  interview: ["submitted", "awarded", "rejected"],
  awarded: [],
  rejected: [],
};

function normalizeApplicationState(state) {
  const normalized = String(state || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(APPLICATION_STATE_TRANSITIONS, normalized) ? normalized : "saved";
}

export function getAllowedApplicationTransitions(state) {
  const normalized = normalizeApplicationState(state);
  return APPLICATION_STATE_TRANSITIONS[normalized] || [];
}

export async function loadApplicationTracking(profileId) {
  if (!supabase || !profileId) return [];
  const { data, error } = await supabase
    .from("application_tracking")
    .select("scholarship_id, state, state_history, documents_checklist, referees, notes, state_updated_at")
    .eq("candidate_id", profileId)
    .order("state_updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function saveApplicationTracking(profileId, scholarship, state = "saved") {
  if (!supabase || !profileId || !scholarship?.id) return null;

  const checklist = buildApplicationChecklist(scholarship);
  const { data: existing, error: fetchError } = await supabase
    .from("application_tracking")
    .select("state_history")
    .eq("candidate_id", profileId)
    .eq("scholarship_id", scholarship.id)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const currentState = normalizeApplicationState(existing?.state || "saved");
  const nextState = normalizeApplicationState(state || currentState);
  const allowed = existing ? getAllowedApplicationTransitions(currentState) : ["saved", "drafting"];

  if (existing && nextState !== currentState && !allowed.includes(nextState)) {
    throw new Error(`Invalid application transition from ${currentState} to ${nextState}`);
  }

  const stateHistory = nextState === currentState && existing?.state_history?.length
    ? existing.state_history
    : buildApplicationHistory(nextState, existing?.state_history || []);
  const payload = {
    candidate_id: profileId,
    scholarship_id: scholarship.id,
    state: nextState,
    state_history: stateHistory,
    documents_checklist: checklist,
    referees: existing?.referees || [],
    notes: scholarship.notes || null,
    state_updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("application_tracking")
    .upsert(payload, { onConflict: "candidate_id,scholarship_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateApplicationTracking(profileId, scholarshipId, nextState) {
  if (!supabase || !profileId || !scholarshipId) return null;

  const { data: existing, error: fetchError } = await supabase
    .from("application_tracking")
    .select("state, state_history, documents_checklist, referees, notes")
    .eq("candidate_id", profileId)
    .eq("scholarship_id", scholarshipId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Tracking entry not found");

  const currentState = normalizeApplicationState(existing.state);
  const normalizedNextState = normalizeApplicationState(nextState);
  if (normalizedNextState !== currentState && !getAllowedApplicationTransitions(currentState).includes(normalizedNextState)) {
    throw new Error(`Invalid application transition from ${currentState} to ${normalizedNextState}`);
  }

  const stateHistory = normalizedNextState === currentState && existing?.state_history?.length
    ? existing.state_history
    : buildApplicationHistory(normalizedNextState, existing.state_history || []);

  const { data, error } = await supabase
    .from("application_tracking")
    .update({
      state: normalizedNextState,
      state_history: stateHistory,
      state_updated_at: new Date().toISOString(),
    })
    .eq("candidate_id", profileId)
    .eq("scholarship_id", scholarshipId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateApplicationChecklist(profileId, scholarshipId, checklistPatch) {
  if (!supabase || !profileId || !scholarshipId) return null;

  const { data: existing, error: fetchError } = await supabase
    .from("application_tracking")
    .select("documents_checklist, referees")
    .eq("candidate_id", profileId)
    .eq("scholarship_id", scholarshipId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Tracking entry not found");

  const documents = {
    ...(existing.documents_checklist || {}),
    ...(checklistPatch?.documents_checklist || {}),
  };
  if (Array.isArray(checklistPatch?.completedDocuments)) {
    documents.completedDocuments = checklistPatch.completedDocuments;
  }
  if (!Array.isArray(documents.completedDocuments)) {
    documents.completedDocuments = [];
  }
  const referees = Array.isArray(checklistPatch?.referees) ? checklistPatch.referees : existing.referees || [];

  const { data, error } = await supabase
    .from("application_tracking")
    .update({
      documents_checklist: documents,
      referees,
      state_updated_at: new Date().toISOString(),
    })
    .eq("candidate_id", profileId)
    .eq("scholarship_id", scholarshipId)
    .select()
    .single();

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
