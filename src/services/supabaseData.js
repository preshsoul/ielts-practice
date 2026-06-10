import { supabase } from "./supabaseClient.js";
import {
  cleanCandidateProfile,
  cleanApplicationTracking,
  cleanCvProfile,
  cleanProfilePatch,
  cleanText,
} from "../lib/security.js";
import { cachedFetch } from "./dataCache.js";

const CONTENT_BASE = "/data";

// Static JSON assets cached with TTL (in-memory); cache busted on redeploy
const STATIC_TTL_SECONDS = 3600; // 1 hour

async function fetchJson(path) {
  const response = await fetch(`${CONTENT_BASE}/${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

async function fetchJsonCached(path) {
  return cachedFetch(`${CONTENT_BASE}/${path}`, { ttlSeconds: STATIC_TTL_SECONDS });
}

async function fetchJsonOptional(path) {
  try {
    return await fetchJson(path);
  } catch {
    return null;
  }
}

function isMissingRelationError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || (message.includes("relation") && message.includes("does not exist"));
}

async function updateProfileRecord(profileId, payload) {
  if (!supabase || !profileId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...cleanProfilePatch(payload),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", profileId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadPublicContent() {
  const [contentManifestData, notificationsData] = await Promise.all([
    fetchJsonOptional("content-manifest.json"),
    fetchJsonOptional("notifications.json"),
  ]);

  return {
    contentManifest: contentManifestData || null,
    notifications: Array.isArray(notificationsData?.notifications) ? notificationsData.notifications : [],
    scholarships: [],
    institutions: [],
    scholarshipRecords: [],
    scholarshipCatalog: [],
    questions: [],
    passages: {},
  };
}

export async function loadScholarshipContent() {
  const scholarshipsData = await fetchJsonCached("scholarships.json");
  const legacyScholarships = Array.isArray(scholarshipsData?.institutions) ? scholarshipsData.institutions : [];
  const normalizedScholarships = Array.isArray(scholarshipsData?.records) ? scholarshipsData.records : [];
  return {
    scholarships: legacyScholarships,
    institutions: legacyScholarships,
    scholarshipRecords: normalizedScholarships,
    scholarshipCatalog: normalizedScholarships.length ? normalizedScholarships : legacyScholarships,
  };
}

export async function loadPracticeContent() {
  const [questionsData, passagesData] = await Promise.all([
    fetchJsonCached("questions.json"),
    fetchJsonCached("passages.json"),
  ]);

  return {
    questions: Array.isArray(questionsData?.questions) ? questionsData.questions : [],
    passages: passagesData?.passages || {},
  };
}

export async function ensureProfile(user) {
  if (!supabase || !user) return null;

  const emailHash = user.email ? await hashText(user.email.toLowerCase()) : null;

  const profile = {
    id: user.id,
    display_name: cleanText(
      user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")?.[0] ||
        null,
      { maxLength: 120 }
    ) || null,
    email_hash: emailHash,
    is_anonymous: false,
    last_seen_at: new Date().toISOString(),
  };

  // The database trigger owns profile bootstrap; this upsert only repairs drift and refreshes last_seen_at.
  const { data, error } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "id", ignoreDuplicates: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveStructuredProfile(profileId, structuredProfile) {
  return updateProfileRecord(profileId, structuredProfile);
}

export async function saveOnboardingProfile(profileId, onboardingProfile) {
  return updateProfileRecord(profileId, onboardingProfile);
}

export async function saveCvProfile(profileId, cvProfile) {
  if (!supabase || !profileId) return null;

  const payload = cleanCvProfile({
    profile_id: profileId,
    label: cvProfile?.label || null,
    source_filename: cvProfile?.source_filename || cvProfile?.sourceFilename || null,
    mime_type: cvProfile?.mime_type || cvProfile?.mimeType || null,
    document_type: cvProfile?.document_type || cvProfile?.documentType || null,
    keywords: Array.isArray(cvProfile?.keywords) ? cvProfile.keywords : [],
    raw_text_hash: cvProfile?.raw_text_hash || cvProfile?.rawTextHash || null,
    extracted_excerpt: cvProfile?.extracted_excerpt || cvProfile?.extractedExcerpt || null,
    extracted_text: cvProfile?.extracted_text || cvProfile?.extractedText || null,
    parsed_profile: cvProfile?.parsed_profile || cvProfile?.parsedProfile || {},
    parsed_candidate_profile: cvProfile?.parsed_candidate_profile || cvProfile?.parsedCandidateProfile || {},
    provenance: cvProfile?.provenance || null,
    confidence: cvProfile?.confidence ?? null,
  });

  const { data, error } = await supabase
    .from("cv_profiles")
    .upsert(payload, { onConflict: "profile_id,raw_text_hash" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCvProfileMetadata(profileId, rawTextHash, patch = {}) {
  if (!supabase || !profileId || !rawTextHash) return null;

  const updatePayload = {};
  if (patch.label !== undefined) {
    updatePayload.label = cleanText(patch.label, { maxLength: 120 }) || null;
  }
  if (Array.isArray(patch.keywords)) {
    updatePayload.keywords = cleanList(patch.keywords, { maxItems: 40, maxLength: 64 });
  }
  updatePayload.updated_at = new Date().toISOString();

  if (!Object.keys(updatePayload).filter((k) => k !== "updated_at").length) {
    return null;
  }

  const { data, error } = await supabase
    .from("cv_profiles")
    .update(updatePayload)
    .eq("profile_id", profileId)
    .eq("raw_text_hash", rawTextHash)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function loadLatestCvProfile(profileId) {
  if (!supabase || !profileId) return null;

  const { data, error } = await supabase
    .from("cv_profiles")
    .select("id, profile_id, label, keywords, raw_text_hash, created_at, updated_at")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function loadLatestCandidateProfileSnapshot(profileId) {
  if (!supabase || !profileId) return null;

  const { data, error } = await supabase
    .from("candidate_profiles")
    .select("id, profile_id, semantic_text, canonical_json, confidence_json, embedding, embedding_model, last_cv_profile_id, source_fingerprint, created_at, updated_at")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  return data || null;
}

export async function saveCandidateProfileSnapshot(profileId, snapshot = {}) {
  if (!supabase || !profileId) return null;

  const payload = cleanCandidateProfile({
    profile_id: profileId,
    source_type: snapshot.sourceType || snapshot.source_type || "merged",
    semantic_text: snapshot.semanticText || snapshot.semantic_text || null,
    canonical_json: snapshot.canonicalJson || snapshot.canonical_json || {},
    confidence_json: snapshot.confidenceJson || snapshot.confidence_json || {},
    embedding_model: snapshot.embeddingModel || snapshot.embedding_model || null,
    embedding: Array.isArray(snapshot.embedding) ? snapshot.embedding : null,
    last_cv_profile_id: snapshot.lastCvProfileId || snapshot.last_cv_profile_id || null,
    source_fingerprint: snapshot.sourceFingerprint || snapshot.source_fingerprint || null,
  });

  const { data, error } = await supabase
    .from("candidate_profiles")
    .upsert(payload, { onConflict: "profile_id" })
    .select()
    .single();

  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  return data;
}

export async function generateSemanticProfile(text, options = {}) {
  if (!supabase?.functions?.invoke) return null;
  const normalizedText = cleanText(text, { maxLength: 12000, allowNewlines: true }) || "";
  const requestedModel = cleanText(options.model || null, { maxLength: 120 }) || null;
  const payload = {
    text: normalizedText,
    ...(requestedModel ? { model: requestedModel } : {}),
  };

  if (!payload.text) return null;

  const { data, error } = await supabase.functions.invoke("generate-semantic-profile", {
    body: payload,
  });

  if (error) {
    return null;
  }

  return {
    semanticText: cleanText(data?.semantic_text || data?.summary || payload.text, { maxLength: 12000, allowNewlines: true }) || payload.text,
    keywords: Array.isArray(data?.keywords) ? data.keywords.map((value) => cleanText(value, { maxLength: 64 })).filter(Boolean) : [],
    summary: cleanText(data?.summary || null, { maxLength: 1200, allowNewlines: true }) || null,
    confidence: Number.isFinite(Number(data?.confidence)) ? Number(data.confidence) : null,
    model: data?.model || requestedModel,
    usage: data?.usage || null,
  };
}

export async function saveMatchEvent(profileId, event = {}) {
  if (!supabase || !profileId) return null;

  const payload = {
    profile_id: profileId,
    candidate_profile_id: event.candidateProfileId || event.candidate_profile_id || null,
    scholarship_id: event.scholarshipId || event.scholarship_id || null,
    match_id: event.matchId || event.match_id || null,
    event_type: cleanText(event.eventType || event.event_type || "impression", { maxLength: 40 }) || "impression",
    context_json: event.contextJson && typeof event.contextJson === "object" ? event.contextJson : (event.context_json && typeof event.context_json === "object" ? event.context_json : {}),
  };

  const { data, error } = await supabase
    .from("match_events")
    .insert(payload)
    .select()
    .single();

  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
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
    .select("state, state_history, documents_checklist, referees, notes")
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
    .upsert(cleanApplicationTracking(payload), { onConflict: "candidate_id,scholarship_id" })
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
    .update(cleanApplicationTracking({
      state: normalizedNextState,
      state_history: stateHistory,
      state_updated_at: new Date().toISOString(),
    }))
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
    .update(cleanApplicationTracking({
      documents_checklist: documents,
      referees,
      state_updated_at: new Date().toISOString(),
    }))
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
    module: row.session_data?.module || "reading",
    mode: row.session_data?.mode || "practice",
    component: row.session_data?.component || (row.session_data?.module || "reading"),
    score: row.score,
    total: row.total,
    durationSecs: row.duration_secs || null,
    results: row.session_data?.results || [],
    sessionData: row.session_data || {},
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
    session_data: {
      results: session.results || [],
      module: session.module || session.exam || "reading",
      mode: session.mode || "practice",
      component: cleanText(session.component || session.module || session.exam || "reading", { maxLength: 64 }) || "reading",
      summary: cleanText(session.summary || null, { maxLength: 1200, allowNewlines: true }) || null,
      promptCount: Number(session.promptCount) || null,
    },
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
