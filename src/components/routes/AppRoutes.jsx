import React, { Suspense, lazy } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PracticeShell } from "../layout/AppShell.jsx";
import { computeWeakSections, selectQueue } from "../../lib/sessionTools.js";

const PracticeView = lazy(() => import("../../features/training/PracticeView.jsx"));
const PracticeHub = lazy(() => import("../../features/training/PracticeHub.jsx"));
const ModulePracticeScreen = lazy(() => import("../../features/training/ModulePracticeScreen.jsx"));
const ProgressView = lazy(() => import("../../features/training/ProgressView.jsx"));
const WeakAreasView = lazy(() => import("../../features/training/WeakAreasView.jsx"));
const LearningPathView = lazy(() => import("../../features/training/LearningPathView.jsx"));
const ScholarshipPage = lazy(() => import("../../features/discovery/ScholarshipPage.jsx"));
const AdminContentScreen = lazy(() => import("../AdminContentScreen.jsx"));

function RouteFallback({ label = "Loading route" }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <div className="empty-state-title">{label}</div>
      <div className="empty-state-copy">Fetching the next screen without loading the entire app bundle.</div>
    </div>
  );
}

export function ProtectedRoute({ component: Component, authUser, isAdmin, ...rest }) {
  if (!authUser || !isAdmin) return <Navigate to="/account" replace />;
  return <Component authUser={authUser} {...rest} />;
}

export function PracticeRoutes({ sessions, onSessionComplete, exportAction, qb, passages, learningPath, practiceLoaded, C, PrimaryBtn, GhostBtn, Chip, EXAMS, EXAM_COLOR, DIFF_LABEL, DIFF_COLOR }) {
  const weak = computeWeakSections(sessions);
  const location = useLocation();
  const pathname = location.pathname;

  if (!practiceLoaded) {
    return (
      <PracticeShell
        title="Practice"
        subtitle="Work through practice sessions with answer feedback and passage context."
        weakCount={weak.length}
        exportAction={exportAction}
      >
        <div className="empty-state">
          <div className="empty-state-title">Loading practice content</div>
          <div className="empty-state-copy">Fetching questions and passages for your next session.</div>
        </div>
      </PracticeShell>
    );
  }

  let content = (
    <Suspense fallback={<RouteFallback label="Loading practice hub" />}>
      <PracticeHub sessions={sessions} C={C} PrimaryBtn={PrimaryBtn} />
    </Suspense>
  );

  if (pathname === "/practice/reading") {
    content = (
      <Suspense fallback={<RouteFallback label="Loading reading practice" />}>
        <PracticeView
          module="reading"
          sessions={sessions}
          onSessionComplete={onSessionComplete}
          QB={qb}
          PASSAGES={passages}
          computeWeakSections={computeWeakSections}
          selectQueue={selectQueue}
          EXAMS={EXAMS}
          EXAM_COLOR={EXAM_COLOR}
          DIFF_LABEL={DIFF_LABEL}
          DIFF_COLOR={DIFF_COLOR}
          PrimaryBtn={PrimaryBtn}
          GhostBtn={GhostBtn}
          Chip={Chip}
          C={C}
        />
      </Suspense>
    );
  } else if (pathname === "/practice/listening") {
    content = <Suspense fallback={<RouteFallback label="Loading listening practice" />}><ModulePracticeScreen module="listening" sessions={sessions} onSessionComplete={onSessionComplete} C={C} PrimaryBtn={PrimaryBtn} GhostBtn={GhostBtn} Chip={Chip} /></Suspense>;
  } else if (pathname === "/practice/writing") {
    content = <Suspense fallback={<RouteFallback label="Loading writing practice" />}><ModulePracticeScreen module="writing" sessions={sessions} onSessionComplete={onSessionComplete} C={C} PrimaryBtn={PrimaryBtn} GhostBtn={GhostBtn} Chip={Chip} /></Suspense>;
  } else if (pathname === "/practice/speaking") {
    content = <Suspense fallback={<RouteFallback label="Loading speaking practice" />}><ModulePracticeScreen module="speaking" sessions={sessions} onSessionComplete={onSessionComplete} C={C} PrimaryBtn={PrimaryBtn} GhostBtn={GhostBtn} Chip={Chip} /></Suspense>;
  } else if (pathname === "/practice/progress") {
    content = <Suspense fallback={<RouteFallback label="Loading progress view" />}><ProgressView sessions={sessions} C={C} Chip={Chip} EXAM_COLOR={EXAM_COLOR} /></Suspense>;
  } else if (pathname === "/practice/weak-areas") {
    content = <Suspense fallback={<RouteFallback label="Loading weak areas" />}><WeakAreasView sessions={sessions} C={C} Chip={Chip} computeWeakSections={computeWeakSections} /></Suspense>;
  } else if (pathname === "/practice/learning-path") {
    content = <Suspense fallback={<RouteFallback label="Loading learning path" />}><LearningPathView sessions={sessions} C={C} Chip={Chip} LEARNING_PATH={learningPath} computeWeakSections={computeWeakSections} /></Suspense>;
  }

  return (
    <PracticeShell
      title="Practice"
      subtitle="Work through practice sessions with answer feedback and passage context."
      weakCount={weak.length}
      exportAction={exportAction}
    >
      {content}
    </PracticeShell>
  );
}

export function ScholarshipRoutes({ sessions, authUser, profile, profileDraft, onImportCv, cvImportBusy, cvImportMessage, contentManifest, notifications, scholarships, scholarshipCatalog, C, Chip, PrimaryBtn }) {
  const { pathname } = useLocation();
  const freshness = contentManifest?.updated_at ? new Date(contentManifest.updated_at).toLocaleDateString("en-GB") : "No recent content manifest";

  return (
    <>
      <div className="topbar">
        <div>
          <div style={{ font: "600 11px/1.4 var(--font-ui)", color: "var(--text-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Workspace</div>
          <div className="page-title" style={{ marginBottom: 8 }}>Scholarships</div>
          <div className="page-subtitle">
            {pathname === "/scholarships/shortlist"
              ? "Your shortlist is tracked in the scholarship workspace for now."
              : `${freshness}. Match your profile to institutions and keep a shortlist of viable options.`}
          </div>
        </div>
      </div>
      <section className="panel-card">
        <Suspense fallback={<RouteFallback label="Loading scholarships" />}>
          <ScholarshipPage
            sessions={sessions}
            authUser={authUser}
            profile={profile}
            profileDraft={profileDraft}
            onImportCv={onImportCv}
            cvImportBusy={cvImportBusy}
            cvImportMessage={cvImportMessage}
            contentManifest={contentManifest}
            notifications={notifications}
            scholarships={scholarships}
            scholarshipCatalog={scholarshipCatalog}
            C={C}
            Chip={Chip}
            PrimaryBtn={PrimaryBtn}
          />
        </Suspense>
      </section>
    </>
  );
}
