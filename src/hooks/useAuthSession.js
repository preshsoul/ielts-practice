import { useState, useEffect, useRef } from "react";
import { supabase } from "../services/supabaseClient.js";
import {
  ensureProfile,
  loadLatestCandidateProfileSnapshot,
  loadLatestCvProfile,
  loadPracticeSessions,
} from "../services/supabaseData.js";
import { mergeSessions } from "../lib/sessionTools.js";
import { logAppError } from "../lib/appErrors.js";

function normalizeProfileRecord(record = {}) {
  return {
    ...record,
    applicationCycle: record.applicationCycle || record.applicationcycle || null,
    targetDegreeLevel: record.targetDegreeLevel || record.targetdegreelevel || null,
    targetDisciplines: Array.isArray(record.targetDisciplines)
      ? record.targetDisciplines
      : Array.isArray(record.targetdisciplines)
        ? record.targetdisciplines
        : [],
    targetCountries: Array.isArray(record.targetCountries)
      ? record.targetCountries
      : Array.isArray(record.targetcountries)
        ? record.targetcountries
        : [],
    semanticText: record.semanticText || record.semantic_text || null,
    semanticKeywords: Array.isArray(record.semanticKeywords)
      ? record.semanticKeywords
      : Array.isArray(record.semantic_keywords)
        ? record.semantic_keywords
        : [],
  };
}

export { normalizeProfileRecord };

export function useAuthSession() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);

  const mountedRef = useRef(false);
  const bootstrapStateRef = useRef({ loadingUserId: null, loadedUserId: null });

  const bootstrapUser = async (user) => {
    if (!user) return;
    const bootstrapState = bootstrapStateRef.current;
    if (bootstrapState.loadingUserId === user.id || bootstrapState.loadedUserId === user.id) return;
    bootstrapState.loadingUserId = user.id;
    try {
      const [profileRow, remoteSessions] = await Promise.all([
        ensureProfile(user),
        loadPracticeSessions(user.id),
      ]);
      let enrichedProfile = profileRow;
      try {
        const [latestCv, latestCandidate] = await Promise.all([
          loadLatestCvProfile(user.id),
          loadLatestCandidateProfileSnapshot(user.id),
        ]);
        const canonicalProfile = latestCandidate?.canonical_json && typeof latestCandidate.canonical_json === "object"
          ? latestCandidate.canonical_json
          : null;
        if (canonicalProfile) {
          enrichedProfile = {
            ...profileRow,
            ...canonicalProfile,
            semanticText: latestCandidate?.semantic_text || canonicalProfile?.semanticText || null,
            semanticKeywords: Array.isArray(latestCandidate?.confidence_json?.semanticKeywords)
              ? latestCandidate.confidence_json.semanticKeywords
              : Array.isArray(canonicalProfile?.semanticKeywords)
                ? canonicalProfile.semanticKeywords
                : [],
            latestCandidateProfileId: latestCandidate?.id || null,
          };
        }
        if (latestCv) {
          enrichedProfile = {
            ...enrichedProfile,
            semanticText: enrichedProfile?.semanticText || (latestCv.keywords?.length ? latestCv.keywords.join(", ") : latestCv.label || null),
            semanticKeywords: Array.isArray(enrichedProfile?.semanticKeywords) && enrichedProfile.semanticKeywords.length
              ? enrichedProfile.semanticKeywords
              : Array.isArray(latestCv.keywords)
                ? latestCv.keywords
                : [],
            latestCvProfileId: latestCv.id || null,
          };
        }
      } catch (error) {
        logAppError(error, { event: "LATEST_CV_LOAD", userId: user.id });
      }
      if (mountedRef.current) setProfile(normalizeProfileRecord(enrichedProfile));
      if (mountedRef.current && remoteSessions.length) {
        setSessions((current) => mergeSessions(current, remoteSessions));
      }
      bootstrapState.loadedUserId = user.id;
    } catch (error) {
      logAppError(error, { event: "AUTH_BOOTSTRAP", userId: user.id });
    } finally {
      if (bootstrapState.loadingUserId === user.id) {
        bootstrapState.loadingUserId = null;
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    if (!supabase) {
      setAuthReady(true);
      return;
    }

    // 1. Get initial session (may be in localStorage from previous visit)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return;
      const user = session?.user || null;
      setAuthUser(user);
      if (user) bootstrapUser(user);
      setAuthReady(true);
    }).catch(() => {
      if (mountedRef.current) setAuthReady(true);
    });

    // 2. Subscribe to auth state changes (login, logout, token refresh, tab sync)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return;
      const user = session?.user || null;
      setAuthUser(user);
      if (!user) {
        setProfile(null);
        setSessions([]);
        bootstrapStateRef.current = { loadingUserId: null, loadedUserId: null };
      } else {
        bootstrapUser(user);
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase?.auth.signOut();
    setAuthUser(null);
    setProfile(null);
    setSessions([]);
    bootstrapStateRef.current = { loadingUserId: null, loadedUserId: null };
  };

  return { authReady, authUser, profile, setProfile, sessions, setSessions, signOut };
}
