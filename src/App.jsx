import React, { Suspense, lazy, useState, useEffect, useRef } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import { Shell } from './components/layout/AppShell.jsx';
import { ProtectedRoute, PracticeRoutes, ScholarshipRoutes } from './components/routes/AppRoutes.jsx';
import './styles.css';
import { supabase, loadPublicContent, loadPracticeContent, ensureProfile, loadLatestCvProfile, loadPracticeSessions, savePracticeSession, saveStructuredProfile, saveCvProfile, saveCandidateProfileSnapshot, saveOnboardingProfile, generateSemanticProfile } from "./services/supabaseData.js";
import { bootstrapAuthSession, signOutThroughBridge } from "./services/authBridge.js";
import { createStructuredProfileDraft, serializeStructuredProfileDraft } from "./services/scoringEngine.js";
import { buildCandidateEmbeddingText } from "./lib/embeddingText.js";
import securityLogger from "./services/securityLogger.js";
import { LEARNING_PATH } from "./data/learningPath.js";
import { buildOnboardingGreeting, createOnboardingDraft, serializeOnboardingDraft } from "./lib/onboarding.js";
import { exportResultsData, mergeSessions } from "./lib/sessionTools.js";
import { getErrorMessage, logAppError } from "./lib/appErrors.js";

const AuthGate = lazy(() => import("./components/AuthGate.jsx"));
const OnboardingForm = lazy(() => import("./components/OnboardingForm.jsx"));
const DashboardHome = lazy(() => import("./features/intelligence/DashboardHome.jsx"));
const AdminContentScreen = lazy(() => import("./components/AdminContentScreen.jsx"));
const AccountPage = lazy(() => import("./features/identity/AccountPage.jsx"));

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const EXAMS = ["All", "IELTS", "CEP (C2)", "CELPIP"];
const DIFF_LABEL = { 1: "Easy", 2: "Medium", 3: "Hard" };
const DIFF_COLOR = { 1: "#1A8C4E", 2: "#B86A0A", 3: "#C93838" };
const EXAM_COLOR = { IELTS: "#C47A00", "CEP (C2)": "#2A7AB0", CELPIP: "#A83030" };
const ADMIN_EMAILS = new Set(
  String(import.meta?.env?.VITE_ADMIN_EMAIL || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const APP_OWNER = import.meta?.env?.VITE_APP_OWNER || "Loci";
const C = {
  bg: "#F4F0E8",
  surface: "#FCFAF6",
  border: "#DDD4C8",
  text: "#171512",
  muted: "#61574F",
  faint: "#F1EBE2",
  accent: "#1F4FD1",
  green: "#146B3E",
  red: "#A72828",
  amber: "#8B5408",
  bg2: "#FCFAF6",
  bg3: "#F1EBE2",
};

function normalizeProfileRecord(record = {}) {
  return {
    ...record,
    applicationCycle: record.applicationCycle || record.applicationcycle || null,
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
/* ═══════════════════════════════════════════════════════
   SMALL UI ATOMS (unchanged)
═══════════════════════════════════════════════════════ */
function Chip({ label, color, small }) {
  return <span className={`chip${small ? ' chip-small' : ''}`} style={{ ['--chip-color']: color }}>{label}</span>;
}
function PrimaryBtn({ children, onClick, disabled }) {
  return <button onClick={!disabled ? onClick : undefined} disabled={disabled} className={`primary-btn${disabled ? ' disabled' : ''}`}>{children}</button>;
}
function GhostBtn({ children, onClick }) {
  return <button onClick={onClick} className="ghost-btn">{children}</button>;
}

function InterfaceIcon({ name }) {
  const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home':
      return (
        <svg {...iconProps}>
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M9 21V12h6v9" />
          <path d="M6 10.5v10" />
          <path d="M18 10.5v10" />
        </svg>
      );
    case 'practice':
      return (
        <svg {...iconProps}>
          <path d="M6 4h12v16H6z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
          <path d="M9 16h4" />
        </svg>
      );
    case 'scholarships':
      return (
        <svg {...iconProps}>
          <path d="M4 7l8-4 8 4v12H4z" />
          <path d="M4 7l8 4 8-4" />
          <path d="M12 11v10" />
          <path d="M9 17h6" />
        </svg>
      );
    case 'account':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="8" r="4" />
          <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a7.96 7.96 0 0 0 .6-3 7.96 7.96 0 0 0-.6-3" />
          <path d="M4.6 9a7.96 7.96 0 0 0-.6 3 7.96 7.96 0 0 0 .6 3" />
          <path d="M9.5 19.4a8 8 0 0 0 5 0" />
          <path d="M9.5 4.6a8 8 0 0 0 5 0" />
        </svg>
      );
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════════════════
   ROUTED APP
═══════════════════════════════════════════════════════ */

export default function App() {
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [content, setContent] = useState({ questions: [], passages: {}, scholarships: [], institutions: [], scholarshipRecords: [], scholarshipCatalog: [], notifications: [], contentManifest: null });
  const [loaded, setLoaded] = useState(false);
  const [practiceLoaded, setPracticeLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileDraft, setProfileDraft] = useState(() => createStructuredProfileDraft());
  const [onboardingDraft, setOnboardingDraft] = useState(() => createOnboardingDraft());
  const [onboardingMessage, setOnboardingMessage] = useState("");
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [cvImportBusy, setCvImportBusy] = useState(false);
  const [cvImportMessage, setCvImportMessage] = useState("");
  const bootstrapStateRef = useRef({ loadingUserId: null, loadedUserId: null });
  const mountedRef = useRef(false);
  const sessionRefreshTimerRef = useRef(null);
  const sessionRefreshPromiseRef = useRef(null);
  const authBootstrappedRef = useRef(false);
  const authUserRef = useRef(null);

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
        const latestCv = await loadLatestCvProfile(user.id);
        if (latestCv) {
          enrichedProfile = {
            ...profileRow,
            semanticText: latestCv.keywords?.length ? latestCv.keywords.join(", ") : latestCv.label || null,
            semanticKeywords: Array.isArray(latestCv.keywords) ? latestCv.keywords : [],
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
    if (sessionRefreshPromiseRef.current) {
      return sessionRefreshPromiseRef.current;
    }

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
    Promise.all([
      loadPublicContent().catch(() => ({ questions: [], passages: {}, scholarships: [], institutions: [], scholarshipRecords: [], scholarshipCatalog: [], notifications: [], contentManifest: null })),
    ]).then(([publicContent]) => {
      setContent(publicContent);
      setLoaded(true);
    }).catch(() => {
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const path = location.pathname;
    if (!path.startsWith("/practice")) return () => { mounted = false; };
    if (practiceLoaded) return () => { mounted = false; };

    loadPracticeContent()
      .then((practiceContent) => {
        if (!mounted) return;
        setContent((current) => ({
          ...current,
          questions: practiceContent.questions,
          passages: practiceContent.passages,
        }));
        setPracticeLoaded(true);
      })
      .catch((error) => {
        logAppError(error, { event: "PRACTICE_CONTENT_LOAD" });
        if (mounted) setPracticeLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, [location.pathname, practiceLoaded]);

  useEffect(() => {
    if (profile) {
      setProfileDraft(createStructuredProfileDraft(profile));
    } else {
      setProfileDraft(createStructuredProfileDraft());
      setProfileMessage("");
    }
  }, [profile]);

  useEffect(() => {
    if (profile) {
      setOnboardingDraft(createOnboardingDraft(profile));
      setOnboardingMessage("");
    } else {
      setOnboardingDraft(createOnboardingDraft());
      setOnboardingMessage("");
    }
  }, [profile]);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  useEffect(() => {
    mountedRef.current = true;

    if (!supabase) {
      const demoUser = {
        id: "demo-user",
        email: "demo@loci.local",
        user_metadata: { full_name: "Demo Candidate" },
      };
      setAuthUser(demoUser);
      setAuthReady(true);
      authBootstrappedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
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

    const refreshOnVisibility = () => {
      if (!mountedRef.current || document.hidden) return;
      void syncAuthSession().catch((error) => {
        logAppError(error, { event: "SESSION_REFRESH" });
      });
    };

    const refreshOnFocus = () => {
      if (!mountedRef.current) return;
      void syncAuthSession().catch((error) => {
        logAppError(error, { event: "SESSION_REFRESH" });
      });
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

  const onSessionComplete = async (sess) => {
    const session = { ...sess, id: sess.id || crypto.randomUUID() };
    const updated = mergeSessions(sessions, [session]);
    setSessions(updated);
    if (authUser?.id && profile?.id) {
      try {
        await savePracticeSession(profile.id, session);
      } catch (error) {
        logAppError(error, { event: "PRACTICE_SESSION_SAVE", profileId: profile.id });
      }
    }
  };

  const refreshSessions = async () => {
    if (!authUser?.id) return;
    try {
      const remoteSessions = await loadPracticeSessions(authUser.id);
      setSessions((current) => mergeSessions(current, remoteSessions));
    } catch (error) {
      logAppError(error, { event: "PRACTICE_SESSION_REFRESH", userId: authUser.id });
    }
  };

  const saveProfileDraft = async () => {
    if (!authUser?.id || !profile?.id) {
      setProfileMessage("Sign in first to save your profile.");
      return;
    }

    setProfileBusy(true);
    setProfileMessage("");
    try {
      const payload = serializeStructuredProfileDraft(profileDraft);
      const updatedProfile = await saveStructuredProfile(profile.id, payload);
      const semanticText = buildCandidateEmbeddingText({
        profile: payload,
        display_name: updatedProfile?.display_name || profile?.display_name || authUser?.email?.split("@")?.[0] || null,
        source: "manual",
      });
      const semanticResult = await generateSemanticProfile(semanticText, {
        model: "claude-3-5-haiku-20241022",
      });
      try {
        await saveCandidateProfileSnapshot(profile.id, {
          sourceType: "manual",
          canonicalJson: payload,
          confidenceJson: {
            source: "manual",
            completeness: updatedProfile ? "saved" : "pending",
            semanticProfile: semanticResult?.confidence ?? null,
          },
          semanticText: semanticResult?.semanticText || semanticText,
          embedding: null,
          embeddingModel: semanticResult?.model || null,
          sourceFingerprint: semanticText || null,
        });
      } catch (candidateError) {
        logAppError(candidateError, { event: "CANDIDATE_PROFILE_SHADOW_SAVE", profileId: profile.id });
      }
      if (semanticResult?.semanticText) {
        setProfileDraft((current) => ({
          ...current,
          semanticText: semanticResult.semanticText,
        }));
      }
      setProfile(normalizeProfileRecord({
        ...updatedProfile,
        semanticText: semanticResult?.semanticText || semanticText,
        semanticKeywords: Array.isArray(semanticResult?.keywords) ? semanticResult.keywords : [],
      }));
      setProfileMessage("Profile saved. Scholarship scoring refreshed.");
    } catch (error) {
      logAppError(error, { event: "PROFILE_SAVE", profileId: profile.id });
      setProfileMessage(getErrorMessage(error, "Unable to save your profile right now."));
    } finally {
      setProfileBusy(false);
    }
  };

  const saveOnboarding = async () => {
    if (!authUser?.id || !profile?.id) {
      setOnboardingMessage("Sign in first to save your onboarding setup.");
      return;
    }

    setOnboardingBusy(true);
    setOnboardingMessage("");
    try {
      const payload = serializeOnboardingDraft(onboardingDraft);
      const updatedProfile = await saveOnboardingProfile(profile.id, payload);
      setProfile(normalizeProfileRecord(updatedProfile));
      setOnboardingMessage("Setup saved. Your dashboard is ready.");
    } catch (error) {
      logAppError(error, { event: "ONBOARDING_SAVE", profileId: profile.id });
      setOnboardingMessage(getErrorMessage(error, "Unable to save onboarding right now."));
    } finally {
      setOnboardingBusy(false);
    }
  };

  const handleCvImport = async ({ intake }) => {
    if (!authUser?.id || !profile?.id) {
      return { ok: false, message: "Sign in first to save the document to your account." };
    }

    if (!intake) {
      return { ok: false, message: "Choose a file to import." };
    }

    setCvImportBusy(true);
    setCvImportMessage("");
    try {
      const savedCv = await saveCvProfile(profile.id, intake);
      let semanticResult = null;
      const mergedDraft = {
        ...profileDraft,
        ...intake.parsedProfile,
        identity: { ...profileDraft.identity, ...intake.parsedProfile?.identity },
        academic: { ...profileDraft.academic, ...intake.parsedProfile?.academic },
        professional: { ...profileDraft.professional, ...intake.parsedProfile?.professional },
        languageTests: { ...profileDraft.languageTests, ...intake.parsedProfile?.languageTests },
        applicationCycle: intake.parsedProfile?.applicationCycle || profileDraft.applicationCycle,
        targetDegreeLevel: intake.parsedProfile?.targetDegreeLevel || profileDraft.targetDegreeLevel,
        targetDisciplines: Array.isArray(intake.parsedProfile?.targetDisciplines) ? intake.parsedProfile.targetDisciplines.join(", ") : profileDraft.targetDisciplines,
        targetCountries: Array.isArray(intake.parsedProfile?.targetCountries) ? intake.parsedProfile.targetCountries.join(", ") : profileDraft.targetCountries,
      };
      try {
        const semanticText = buildCandidateEmbeddingText({
          profile: mergedDraft,
          parsedProfile: intake.parsedProfile,
          intake,
          semanticText: intake.extractedText || intake.extractedExcerpt || intake.label || "",
          display_name: profile?.display_name || authUser?.email?.split("@")?.[0] || null,
          source: "cv",
        });
        semanticResult = await generateSemanticProfile(semanticText, {
          model: "claude-3-5-haiku-20241022",
        });
        await saveCandidateProfileSnapshot(profile.id, {
          sourceType: "cv",
          canonicalJson: serializeStructuredProfileDraft(mergedDraft),
          confidenceJson: {
            source: "cv",
            confidence: intake.confidence ?? null,
            semanticProfile: semanticResult?.confidence ?? null,
          },
          semanticText: semanticResult?.semanticText || semanticText,
          embedding: null,
          embeddingModel: semanticResult?.model || null,
          lastCvProfileId: savedCv?.id || null,
          sourceFingerprint: intake.rawTextHash || null,
        });
      } catch (candidateError) {
        logAppError(candidateError, { event: "CANDIDATE_PROFILE_SHADOW_SAVE", profileId: profile.id });
      }
      const enrichedKeywords = Array.from(new Set([
        ...(Array.isArray(intake.keywords) ? intake.keywords : []),
        ...(Array.isArray(semanticResult?.keywords) ? semanticResult.keywords : []),
      ]));
      try {
        await saveCvProfile(profile.id, {
          label: semanticResult?.summary || intake.label || savedCv?.label || null,
          keywords: enrichedKeywords,
          rawTextHash: intake.rawTextHash || null,
        });
      } catch (cvSemanticError) {
        logAppError(cvSemanticError, { event: "CV_SEMANTIC_SAVE", profileId: profile.id });
      }
      if (intake.parsedProfile) {
        setProfileDraft((current) => ({
          ...current,
          ...intake.parsedProfile,
          identity: { ...current.identity, ...intake.parsedProfile.identity },
          academic: { ...current.academic, ...intake.parsedProfile.academic },
          professional: { ...current.professional, ...intake.parsedProfile.professional },
          languageTests: { ...current.languageTests, ...intake.parsedProfile.languageTests },
          applicationCycle: intake.parsedProfile.applicationCycle || current.applicationCycle,
          targetDegreeLevel: intake.parsedProfile.targetDegreeLevel || current.targetDegreeLevel,
          targetDisciplines: Array.isArray(intake.parsedProfile.targetDisciplines) ? intake.parsedProfile.targetDisciplines.join(", ") : current.targetDisciplines,
          targetCountries: Array.isArray(intake.parsedProfile.targetCountries) ? intake.parsedProfile.targetCountries.join(", ") : current.targetCountries,
          semanticText: semanticResult?.semanticText || semanticText,
        }));
      }
      setProfile((current) => normalizeProfileRecord({
        ...current,
        semanticText: semanticResult?.semanticText || current?.semanticText || null,
        semanticKeywords: enrichedKeywords,
        latestCvProfileId: savedCv?.id || current?.latestCvProfileId || null,
      }));
      setCvImportMessage("Your CV is in. We’re finding your perfect opportunity now.");
      return { ok: true };
    } catch (error) {
      logAppError(error, { event: "CV_IMPORT_SAVE", profileId: profile.id });
      const message = getErrorMessage(error, "Unable to save the document right now.");
      setCvImportMessage(message);
      return { ok: false, message };
    } finally {
      setCvImportBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    securityLogger.log('SECURITY', 'USER_LOGOUT', { userId: authUser?.id });
    await signOutThroughBridge();
    setAuthUser(null);
    setProfile(null);
    setSessions([]);
    bootstrapStateRef.current = { loadingUserId: null, loadedUserId: null };
  };

  const pathname = location.pathname;
  const onboardingGreeting = buildOnboardingGreeting(profile || authUser || {});
  const routeFallback = (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "var(--font-ui)", fontSize: 12 }}>
      Loading the next screen…
    </div>
  );

  if (!loaded || !authReady) {
    return routeFallback;
  }

  if (!authUser) {
    return (
      <Suspense fallback={routeFallback}>
        <AuthGate />
      </Suspense>
    );
  }

  if (pathname === "/onboarding") {
    return (
      <Suspense fallback={routeFallback}>
        <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>
          <OnboardingForm
            profile={profile}
            draft={onboardingDraft}
            setDraft={setOnboardingDraft}
            onSave={saveOnboarding}
            saving={onboardingBusy}
            message={onboardingMessage}
            greeting={onboardingGreeting}
          />
        </div>
      </Suspense>
    );
  }

  const isAdmin = authUser?.email ? ADMIN_EMAILS.has(authUser.email.toLowerCase()) : false;
  const exportAction = () => exportResultsData(sessions, authUser?.id || profile?.id || 'anonymous');
  const QB = content.questions;
  const PASSAGES = content.passages;

  return (
    <Shell sessions={sessions} onRefresh={refreshSessions} authUser={authUser} profile={profile} isAdmin={isAdmin}>
      <Suspense fallback={routeFallback}>
        <Routes>
          <Route path="/" element={<DashboardHome profile={profile} sessions={sessions} contentManifest={content.contentManifest} notifications={content.notifications} />} />
          <Route path="/practice/*" element={<PracticeRoutes sessions={sessions} onSessionComplete={onSessionComplete} exportAction={exportAction} qb={QB} passages={PASSAGES} learningPath={LEARNING_PATH} practiceLoaded={practiceLoaded} C={C} PrimaryBtn={PrimaryBtn} GhostBtn={GhostBtn} Chip={Chip} EXAMS={EXAMS} EXAM_COLOR={EXAM_COLOR} DIFF_LABEL={DIFF_LABEL} DIFF_COLOR={DIFF_COLOR} />} />
          <Route
            path="/scholarships/*"
            element={
              <ScholarshipRoutes
                sessions={sessions}
                authUser={authUser}
                profile={profile}
                profileDraft={profileDraft}
                cvImportBusy={cvImportBusy}
                cvImportMessage={cvImportMessage}
                onImportCv={handleCvImport}
                contentManifest={content.contentManifest}
                notifications={content.notifications}
                scholarships={content.scholarships}
                scholarshipCatalog={content.scholarshipCatalog || content.scholarshipRecords || content.scholarships}
                C={C}
                Chip={Chip}
                PrimaryBtn={PrimaryBtn}
              />
            }
          />
          <Route
            path="/account"
            element={
              <AccountPage
                sessions={sessions}
                authUser={authUser}
                profile={profile}
                profileDraft={profileDraft}
                setProfileDraft={setProfileDraft}
                profileBusy={profileBusy}
                profileMessage={profileMessage}
                saveProfileDraft={saveProfileDraft}
                onSignOut={signOut}
              />
            }
          />
          <Route path="/admin" element={<ProtectedRoute component={AdminContentScreen} authUser={authUser} isAdmin={isAdmin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

