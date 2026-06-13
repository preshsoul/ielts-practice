import { useState, useEffect, useRef } from "react";
import { supabase } from "../services/supabaseClient.js";
import { bootstrapAuthSession, signOutThroughBridge } from "../services/authBridge.js";
import {
  ensureProfile,
  loadLatestCandidateProfileSnapshot,
  loadLatestCvProfile,
  loadPracticeSessions,
} from "../services/supabaseData.js";
import { mergeSessions } from "../lib/sessionTools.js";
import securityLogger from "../services/securityLogger.js";
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
  const sessionRefreshTimerRef = useRef(null);
  const sessionRefreshPromiseRef = useRef(null);
  const authBootstrappedRef = useRef(false);
  const authUserRef = useRef(null);
  const lastSessionRefreshRef = useRef(0);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  const clearSessionRefreshTimer = () => {
    if (sessionRefreshTimerRef.current) {
      window.clearTimeout(sessionRefreshTimerRef.current);
      sessionRefreshTimerRef.current = null;
    }
  };

  const scheduleSessionRefresh = (expiresAt) => {
    if (typeof window === "undefined") return;
    clearSessionRefreshTimer();
    const expiryMs = Number(expiresAt) * 1000;
    if (!Number.isFinite(expiryMs) || expiryMs <= 0) return;
    const delay = Math.max(30_000, expiryMs - Date.now() - 60_000);
    sessionRefreshTimerRef.current = window.setTimeout(() => {
      void syncAuthSession().catch((error) => {
        logAppError(error, { event: "SESSION_REFRESH" });
      });
    }, delay);
  };

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
        const candidateConfidence = latestCandidate?.confidence_json && typeof latestCandidate.confidence_json === "object"
          ? latestCandidate.confidence_json
          : null;
        if (canonicalProfile) {
          enrichedProfile = {
            ...profileRow,
            ...canonicalProfile,
            semanticText: latestCandidate?.semantic_text || canonicalProfile?.semanticText || null,
            semanticKeywords: Array.isArray(candidateConfidence?.semanticKeywords)
              ? candidateConfidence.semanticKeywords
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

  const syncAuthSession = async () => {
    if (sessionRefreshPromiseRef.current) return sessionRefreshPromiseRef.current;

    const task = (async () => {
      const session = await bootstrapAuthSession();
      if (!mountedRef.current) return session;

      const user = session?.user || null;
      setAuthUser(user);

      if (!user) {
        setProfile(null);
        setSessions([]);
        bootstrapStateRef.current = { loadingUserId: null, loadedUserId: null };
        clearSessionRefreshTimer();
        return session;
      }

      await bootstrapUser(user);
      scheduleSessionRefresh(session?.expires_at || null);
      return session;
    })()
      .catch((error) => {
        logAppError(error, { event: "SESSION_CHECK" });
        if (mountedRef.current) {
          setAuthUser(null);
          setProfile(null);
          setSessions([]);
          bootstrapStateRef.current = { loadingUserId: null, loadedUserId: null };
          clearSessionRefreshTimer();
          setAuthReady(true);
          authBootstrappedRef.current = true;
        }
        return null;
      })
      .finally(() => {
        sessionRefreshPromiseRef.current = null;
        if (mountedRef.current && !authBootstrappedRef.current) {
          setAuthReady(true);
          authBootstrappedRef.current = true;
        }
      });

    sessionRefreshPromiseRef.current = task;
    return task;
  };

  useEffect(() => {
    mountedRef.current = true;
    if (!supabase) {
      securityLogger.log("SECURITY", "AUTH_DEGRADED", { reason: "supabase_client_not_configured" });
    }

    const handleAuthSession = (event) => {
      const session = event?.detail?.session || null;
      if (!mountedRef.current) return;
      if (!session?.user) {
        securityLogger.log("SECURITY", "USER_SESSION_END", { previousUserId: authUserRef.current?.id });
        setAuthUser(null);
        setProfile(null);
        setSessions([]);
        bootstrapStateRef.current = { loadingUserId: null, loadedUserId: null };
        clearSessionRefreshTimer();
        setAuthReady(true);
        authBootstrappedRef.current = true;
        return;
      }
      securityLogger.logAuthSuccess(session.user.id, session.user.email);
      setAuthUser(session.user);
      clearSessionRefreshTimer();
      scheduleSessionRefresh(session.expires_at || null);
      void bootstrapUser(session.user);
    };

    const _throttledRefresh = () => {
      const now = Date.now();
      if (now - lastSessionRefreshRef.current < 30_000) return;
      lastSessionRefreshRef.current = now;
      void syncAuthSession().catch((error) => logAppError(error, { event: "SESSION_REFRESH" }));
    };

    const refreshOnVisibility = () => {
      if (!mountedRef.current || document.hidden) return;
      _throttledRefresh();
    };

    const refreshOnFocus = () => {
      if (!mountedRef.current) return;
      _throttledRefresh();
    };

    void syncAuthSession();
    window.addEventListener("loci-auth-session", handleAuthSession);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      mountedRef.current = false;
      clearSessionRefreshTimer();
      window.removeEventListener("loci-auth-session", handleAuthSession);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  const signOut = async () => {
    securityLogger.log("SECURITY", "USER_LOGOUT", { userId: authUserRef.current?.id });
    await signOutThroughBridge();
    setAuthUser(null);
    setProfile(null);
    setSessions([]);
    bootstrapStateRef.current = { loadingUserId: null, loadedUserId: null };
  };

  return { authReady, authUser, profile, setProfile, sessions, setSessions, signOut };
}
