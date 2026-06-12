import React, { Suspense, lazy, useState, useEffect, useMemo } from "react";
import { Navigate, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Shell } from './components/layout/AppShell.jsx';
import { PracticeRoutes, ScholarshipRoutes } from './components/routes/AppRoutes.jsx';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
import { ensureProfile, loadPublicContent, loadPracticeContent, loadScholarshipContent, savePracticeSession, saveOnboardingProfile, loadPracticeSessions } from "./services/supabaseData.js";
import { createStructuredProfileDraft } from "./services/scoringEngine.js";
import { useAuthSession, normalizeProfileRecord } from "./hooks/useAuthSession.js";
import { useCvImport } from "./hooks/useCvImport.js";
import { useProfileSave } from "./hooks/useProfileSave.js";
import { LEARNING_PATH } from "./data/learningPath.js";
import { buildOnboardingGreeting } from "./lib/onboarding.js";
import {
  createOnboardingResolutionDraft,
  serializeOnboardingResolutionDraft,
  syncOnboardingResolutionDraft,
} from "./lib/onboardingResolution.js";
import { getOnboardingStatus } from "./lib/onboardingJourney.js";
import { exportResultsData, mergeSessions } from "./lib/sessionTools.js";
import { estimateOverallBand, getLanguageProof } from "./lib/bandScoreEstimator.js";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { getErrorMessage, logAppError } from "./lib/appErrors.js";
import { C, EXAMS, EXAM_COLOR, DIFF_LABEL, DIFF_COLOR } from "./lib/tokens.js";

const AuthGate = lazy(() => import("./components/AuthGate.jsx"));
const OnboardingForm = lazy(() => import("./components/OnboardingForm.jsx"));
const DashboardHome = lazy(() => import("./features/intelligence/DashboardHome.jsx"));
const ReadinessPage = lazy(() => import("./features/intelligence/ReadinessPage.jsx"));
const AccountPage = lazy(() => import("./features/identity/AccountPage.jsx"));

/* ═══════════════════════════════════════════════════════
   UI TOKENS — imported from src/lib/tokens.js
═══════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════
   SMALL UI ATOMS
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

/* ═══════════════════════════════════════════════════════
   ROUTED APP
═══════════════════════════════════════════════════════ */
export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // ── Auth + session ────────────────────────────────────
  const { authReady, authUser, profile, setProfile, sessions, setSessions, signOut } = useAuthSession();

  // ── Public content ────────────────────────────────────
  const [content, setContent] = useState({
    questions: [], passages: {}, scholarships: [], institutions: [],
    scholarshipRecords: [], scholarshipCatalog: [], notifications: [], contentManifest: null,
  });
  const [loaded, setLoaded] = useState(false);
  const [practiceLoaded, setPracticeLoaded] = useState(false);
  const [scholarshipsLoaded, setScholarshipsLoaded] = useState(false);

  // ── Profile form state ────────────────────────────────
  const [profileDraft, setProfileDraft] = useState(() => createStructuredProfileDraft());
  const [onboardingResolutionDraft, setOnboardingResolutionDraft] = useState(() => createOnboardingResolutionDraft());
  const [onboardingMessage, setOnboardingMessage] = useState("");
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  // Gate is dismissed if the user explicitly skipped OR previously completed onboarding.
  // Persisted to sessionStorage so HMR and page reloads don't bounce completed users.
  const [onboardingGateDismissed, setOnboardingGateDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("loci.onboardingSkipped") === "true"
      || window.sessionStorage.getItem("loci.onboardingCompleted") === "true";
  });

  // ── Derived hooks ─────────────────────────────────────
  const { profileBusy, profileMessage, saveProfileDraft } = useProfileSave({
    authUser, profile, profileDraft, setProfile, setProfileDraft,
  });
  const { cvImportBusy, cvImportMessage, handleCvImport } = useCvImport({
    authUser, profile, profileDraft, setProfile, setProfileDraft,
  });

  // ── Content loading ───────────────────────────────────
  useEffect(() => {
    loadPublicContent()
      .catch(() => ({
        questions: [], passages: {}, scholarships: [], institutions: [],
        scholarshipRecords: [], scholarshipCatalog: [], notifications: [], contentManifest: null,
      }))
      .then((publicContent) => {
        setContent(publicContent);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
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

    return () => { mounted = false; };
  }, [location.pathname, practiceLoaded]);

  useEffect(() => {
    let mounted = true;
    if (!location.pathname.startsWith("/scholarships") && location.pathname !== "/onboarding" && location.pathname !== "/readiness") return () => { mounted = false; };
    if (scholarshipsLoaded) return () => { mounted = false; };

    loadScholarshipContent()
      .then((scholarshipContent) => {
        if (!mounted) return;
        setContent((current) => ({ ...current, ...scholarshipContent }));
        setScholarshipsLoaded(true);
      })
      .catch((error) => {
        logAppError(error, { event: "SCHOLARSHIP_CONTENT_LOAD" });
        if (mounted) setScholarshipsLoaded(true);
      });

    return () => { mounted = false; };
  }, [location.pathname, scholarshipsLoaded]);

  // ── Sync drafts when profile changes ──────────────────
  useEffect(() => {
    setProfileDraft(profile ? createStructuredProfileDraft(profile) : createStructuredProfileDraft());
  }, [profile]);

  useEffect(() => {
    setOnboardingResolutionDraft(profile ? createOnboardingResolutionDraft(profile) : createOnboardingResolutionDraft());
    setOnboardingMessage("");
  }, [profile]);

  // ── Onboarding save ───────────────────────────────────
  const saveOnboarding = async () => {
    if (!authUser?.id) {
      setOnboardingMessage("Sign in first to save your onboarding setup.");
      return;
    }
    setOnboardingBusy(true);
    setOnboardingMessage("");
    try {
      const activeProfile = profile?.id ? profile : normalizeProfileRecord(await ensureProfile(authUser));
      const payload = serializeOnboardingResolutionDraft(onboardingResolutionDraft);
      const updatedProfile = await saveOnboardingProfile(activeProfile.id, payload);
      setProfile(normalizeProfileRecord(updatedProfile));
      if (onboardingResolutionDraft?.extraction?.intake?.rawTextHash) {
        await handleCvImport({ intake: onboardingResolutionDraft.extraction.intake });
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("loci.onboardingSkipped");
        // Persist completion so the gate stays dismissed across HMR and page reloads.
        window.sessionStorage.setItem("loci.onboardingCompleted", "true");
      }
      // Dismiss the onboarding gate so the user stays at the workspace.
      setOnboardingGateDismissed(true);
      setOnboardingMessage("Setup saved. Your dashboard is ready.");
      const returnPath = location.state?.from?.pathname;
      navigate(returnPath && returnPath !== "/onboarding" ? returnPath : "/", { replace: true });
    } catch (error) {
      logAppError(error, { event: "ONBOARDING_SAVE", profileId: profile?.id || authUser?.id });
      const detail = error instanceof Error ? error.message : (typeof error === "object" && error ? JSON.stringify(error).slice(0, 200) : String(error || ""));
      setOnboardingMessage(detail || getErrorMessage(error, "Unable to save onboarding right now."));
    } finally {
      setOnboardingBusy(false);
    }
  };

  const onboardingDraft = onboardingResolutionDraft?.legacyDraft || {};
  const onboardingStatus = useMemo(() => getOnboardingStatus(profile || onboardingDraft), [profile, onboardingDraft]);
  const skipOnboardingEntry = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("loci.onboardingSkipped", "true");
    }
    setOnboardingGateDismissed(true);
    navigate("/", { replace: true });
  };
  const setOnboardingDraft = (updater) => {
    setOnboardingResolutionDraft((current) => {
      const baseLegacyDraft = current?.legacyDraft || {};
      const nextLegacyDraft = typeof updater === "function" ? updater(baseLegacyDraft) : updater;
      return syncOnboardingResolutionDraft(current, nextLegacyDraft);
    });
  };

  // ── Practice session handlers ─────────────────────────
  const onSessionComplete = async (sess) => {
    const session = { ...sess, id: sess.id || crypto.randomUUID() };
    const updatedList = mergeSessions(sessions, [session]);
    setSessions(updatedList);

    // Feed practice scores into profile language proof so the
    // readiness engine and scholarship matcher see live band estimates.
    try {
      const allSessions = Array.isArray(updatedList) ? updatedList
        : typeof updatedList === "object" && updatedList ? Object.values(updatedList).flat().filter(Boolean) : [];
      const estimates = estimateOverallBand(allSessions);
      if (estimates.overallBand !== null && profile?.id) {
        const bandUpdates = {};
        for (const [mod, est] of Object.entries(estimates.moduleEstimates)) {
          if (est.estimatedBand !== null) bandUpdates[mod] = est.estimatedBand;
        }
        if (Object.keys(bandUpdates).length) {
          setProfile((current) => ({
            ...(current || {}),
            selfAssessment: { ...(current?.selfAssessment || {}), ...bandUpdates },
            languageTests: {
              ...(current?.languageTests || {}),
              ieltsBands: { ...(current?.languageTests?.ieltsBands || {}), ...bandUpdates },
            },
            estimatedIelts: estimates.overallBand,
            estimatedIeltsConfidence: estimates.confidence,
            estimatedIeltsUpdatedAt: new Date().toISOString(),
          }));
        }
      }
    } catch { /* band estimation is best-effort, never block the session save */ }

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

  // ── Render ────────────────────────────────────────────
  const routeFallback = (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "var(--font-ui)", fontSize: 12 }}>
      Loading the next screen…
    </div>
  );

  if (!loaded || !authReady) return routeFallback;

  if (!authUser) {
    return (
      <Suspense fallback={routeFallback}>
        <AuthGate />
      </Suspense>
    );
  }

  // Only redirect to onboarding if:
  // 1. The gate hasn't been dismissed (user hasn't completed or skipped onboarding)
  // 2. Auth is ready and profile object exists (don't redirect during initial load/HMR
  //    when profile is still null — wait for Supabase to return the profile first)
  // 3. The profile is genuinely incomplete AND not marked complete server-side
  if (
    location.pathname !== "/onboarding" &&
    !onboardingGateDismissed &&
    authReady &&
    profile != null &&
    !profile.onboarding_completed &&  // server-side truth: onboarding was completed
    onboardingStatus.shouldRedirect
  ) {
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  if (location.pathname === "/onboarding") {
    return (
      <Suspense fallback={routeFallback}>
        <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>
          <OnboardingForm
            profile={profile}
            draft={onboardingDraft}
            resolutionDraft={onboardingResolutionDraft}
            setDraft={setOnboardingDraft}
            onSave={saveOnboarding}
            saving={onboardingBusy}
            message={onboardingMessage}
            greeting={buildOnboardingGreeting(profile || authUser || {})}
            scholarshipCatalog={content.scholarshipCatalog || content.scholarshipRecords || content.scholarships}
            onSkipUpload={skipOnboardingEntry}
          />
        </div>
      </Suspense>
    );
  }

  const exportAction = () => exportResultsData(sessions, authUser?.id || profile?.id || "anonymous");

  return (
    <QueryClientProvider client={queryClient}>
    <Shell sessions={sessions} onRefresh={refreshSessions} authUser={authUser} profile={profile}>
      <ErrorBoundary>
      <Suspense fallback={routeFallback}>
        <Routes>
          <Route
            path="/"
            element={
              <ErrorBoundary>
              <DashboardHome
                profile={profile}
                sessions={sessions}
                contentManifest={content.contentManifest}
                notifications={content.notifications}
                scholarships={content.scholarships}
                scholarshipCatalog={content.scholarshipCatalog || content.scholarshipRecords || content.scholarships}
              />
              </ErrorBoundary>
            }
          />
          <Route
            path="/practice/*"
            element={
              <ErrorBoundary>
              <PracticeRoutes
                sessions={sessions}
                profile={profile}
                onSessionComplete={onSessionComplete}
                exportAction={exportAction}
                qb={content.questions}
                passages={content.passages}
                learningPath={LEARNING_PATH}
                practiceLoaded={practiceLoaded}
                C={C}
                PrimaryBtn={PrimaryBtn}
                GhostBtn={GhostBtn}
                Chip={Chip}
                EXAMS={EXAMS}
                EXAM_COLOR={EXAM_COLOR}
                DIFF_LABEL={DIFF_LABEL}
                DIFF_COLOR={DIFF_COLOR}
              />
              </ErrorBoundary>
            }
          />
          <Route
            path="/scholarships/*"
            element={
              <ErrorBoundary>
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
              </ErrorBoundary>
            }
          />
          <Route
            path="/account"
            element={
              <ErrorBoundary>
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
              </ErrorBoundary>
            }
          />
          <Route
            path="/readiness"
            element={
              <ErrorBoundary>
              <ReadinessPage
                profile={profile}
                sessions={sessions}
                scholarshipCatalog={content.scholarshipCatalog || content.scholarshipRecords || content.scholarships}
              />
              </ErrorBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </Shell>
    </QueryClientProvider>
  );
}
