import React, { Suspense, lazy } from "react";
import { Link, useLocation } from "react-router-dom";
import { PracticeShell } from "../layout/AppShell.jsx";
import PageMeta from "../PageMeta.jsx";
import { isAdminUser } from "../../lib/adminAccess.js";
import { computeWeakSections, selectQueue } from "../../lib/sessionTools.js";

const PracticeView = lazy(() => import("../PracticeView.jsx"));
const PracticeHub = lazy(() => import("../../features/training/PracticeHub.jsx"));
const ModulePracticeScreen = lazy(() => import("../ModulePracticeScreen.jsx"));
const ProgressView = lazy(() => import("../ProgressView.jsx"));
const WeakAreasView = lazy(() => import("../WeakAreasView.jsx"));
const DailyChallengePage = lazy(() => import("../../features/practice/DailyChallengePage.jsx"));
const VocabularyPractice = lazy(() => import("../../features/practice/VocabularyPractice.jsx"));
const MockTestSimulator = lazy(() => import("../../features/practice/MockTestSimulator.jsx"));
const LearningPathView = lazy(() => import("../LearningPathView.jsx"));
const AdaptiveReadingPage = lazy(() => import("../../features/practice/AdaptiveReadingPage.jsx"));
const WeeklyPlanView = lazy(() => import("../../features/coach/WeeklyPlanView.jsx"));
const ScholarshipPage = lazy(() => import("../../features/discovery/ScholarshipPage.jsx"));
const ScholarshipFeedPage = lazy(() => import("../../features/discovery/ScholarshipFeedPage.jsx"));
const DeadlineActionPlan = lazy(() => import("../../features/scholarships/DeadlineActionPlan.jsx"));
function RouteFallback({ label = "Loading route" }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <div className="empty-state-title">{label}</div>
      <div className="empty-state-copy">Fetching the next screen without loading the entire app bundle.</div>
    </div>
  );
}

export function PracticeRoutes({ sessions, profile, onSessionComplete, exportAction, qb, passages, learningPath, practiceLoaded, C, PrimaryBtn, GhostBtn, Chip, EXAMS, EXAM_COLOR, DIFF_LABEL, DIFF_COLOR }) {
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
      <PracticeHub sessions={sessions} C={C} PrimaryBtn={PrimaryBtn} profile={profile} />
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
  } else if (pathname === "/practice/daily") {
    content = <Suspense fallback={<RouteFallback label="Loading daily challenge" />}><DailyChallengePage sessions={sessions} C={C} Chip={Chip} PrimaryBtn={PrimaryBtn} /></Suspense>;
  } else if (pathname === "/practice/vocabulary") {
    content = <Suspense fallback={<RouteFallback label="Loading vocabulary practice" />}><VocabularyPractice profile={profile} onSessionComplete={onSessionComplete} C={C} Chip={Chip} PrimaryBtn={PrimaryBtn} /></Suspense>;
  } else if (pathname === "/practice/mock-test") {
    content = <Suspense fallback={<RouteFallback label="Loading mock test" />}><MockTestSimulator sessions={sessions} onSessionComplete={onSessionComplete} qb={qb} passages={passages} C={C} Chip={Chip} PrimaryBtn={PrimaryBtn} /></Suspense>;
  } else if (pathname === "/practice/adaptive-reading") {
    content = (
      <Suspense fallback={<RouteFallback label="Loading adaptive reading" />}>
        <AdaptiveReadingPage
          sessions={sessions}
          profile={profile}
          onSessionComplete={onSessionComplete}
          C={C}
          Chip={Chip}
          PrimaryBtn={PrimaryBtn}
          GhostBtn={GhostBtn}
        />
      </Suspense>
    );
  } else if (pathname === "/practice/weekly-plan") {
    content = (
      <Suspense fallback={<RouteFallback label="Loading weekly plan" />}>
        <WeeklyPlanView
          sessions={sessions}
          profile={profile}
          scholarshipCatalog={[]}
          rankedScholarships={null}
          C={C}
          PrimaryBtn={PrimaryBtn}
        />
      </Suspense>
    );
  }

  const practiceMeta = {
    "/practice/reading":      { title: "Reading Practice",          desc: "IELTS Reading practice with timed passages, answer feedback, and band score tracking.", path: "/practice/reading" },
    "/practice/listening":    { title: "Listening Practice",        desc: "IELTS Listening practice with audio scenarios, question sets, and score analysis.", path: "/practice/listening" },
    "/practice/writing":      { title: "Writing Practice",          desc: "IELTS Writing practice with task prompts, model answers, and band descriptors.", path: "/practice/writing" },
    "/practice/speaking":     { title: "Speaking Practice",         desc: "IELTS Speaking practice with cue cards, timed responses, and fluency feedback.", path: "/practice/speaking" },
    "/practice/progress":     { title: "Progress",                  desc: "Track your IELTS practice progress, band score trends, and section-by-section performance.", path: "/practice/progress" },
    "/practice/weak-areas":   { title: "Weak Areas",                desc: "Identify and strengthen your weakest IELTS sections with targeted practice recommendations.", path: "/practice/weak-areas" },
    "/practice/learning-path":{ title: "Learning Path",             desc: "Your personalized IELTS learning path with sequenced modules and milestone tracking.", path: "/practice/learning-path" },
    "/practice/daily":        { title: "Daily Challenge",           desc: "Today's IELTS daily challenge — a fresh question set to keep your skills sharp.", path: "/practice/daily" },
    "/practice/vocabulary":   { title: "Vocabulary Practice",       desc: "Build your IELTS vocabulary with spaced repetition and contextual word lists.", path: "/practice/vocabulary" },
    "/practice/mock-test":    { title: "Mock Test",                 desc: "Full-length IELTS mock test simulator with timed sections and band score estimation.", path: "/practice/mock-test" },
    "/practice/adaptive-reading": { title: "Adaptive Reading",       desc: "AI-generated IELTS reading passages at calibrated difficulty levels with auto-generated questions and instant scoring.", path: "/practice/adaptive-reading" },
    "/practice/weekly-plan":      { title: "Weekly Study Plan",        desc: "Your personalized 7-day IELTS study plan prioritizing the skills that unlock the most scholarships.", path: "/practice/weekly-plan" },
  };
  const meta = practiceMeta[pathname] || { title: "Practice Hub", desc: "IELTS practice across all four modules — Reading, Listening, Writing, and Speaking.", path: "/practice" };

  return (
    <PracticeShell
      title="Practice"
      subtitle="Work through practice sessions with answer feedback and passage context."
      weakCount={weak.length}
      exportAction={exportAction}
    >
      <PageMeta {...meta} />
      {content}
    </PracticeShell>
  );
}

const ScholarshipReviewPage = lazy(() => import("../../features/admin/ScholarshipReviewPage.jsx"));
const IeltsBridgePage = lazy(() => import("../../features/coach/IeltsBridgePage.jsx"));

export function ScholarshipRoutes({ sessions, authUser, profile, profileDraft, onImportCv, cvImportBusy, cvImportMessage, contentManifest, notifications, scholarships, scholarshipCatalog, C, Chip, PrimaryBtn }) {
  const { pathname } = useLocation();
  const freshness = contentManifest?.updated_at ? new Date(contentManifest.updated_at).toLocaleDateString("en-GB") : "No recent content manifest";
  const isWeeklyFeed = pathname.startsWith("/scholarships/weekly") || pathname.startsWith("/scholarships/latest");
  const isAdminReview = pathname.startsWith("/scholarships/admin/review");
  const canReviewScholarships = isAdminUser(authUser);
  const isDeadlinePlan = pathname.startsWith("/scholarships/deadlines");
  const isBridge = pathname.startsWith("/scholarships/ielts-bridge");

  const scholarshipMeta = isAdminReview
    ? { title: "Admin: Scholarship Review", desc: "Review and approve scholarship entries for the Loci catalog.", path: "/scholarships/admin/review", noIndex: true }
    : isDeadlinePlan
    ? { title: "Deadline Action Plan", desc: "Upcoming scholarship deadlines and a prioritised action plan for your applications.", path: "/scholarships/deadlines" }
    : isBridge
    ? { title: "IELTS → Scholarship Bridge", desc: "See how your IELTS band connects to scholarship eligibility. Each 0.5 band improvement unlocks new opportunities.", path: "/scholarships/ielts-bridge" }
    : isWeeklyFeed
    ? { title: "Weekly Scholarship Feed", desc: "This week's newest scholarship additions — fresh opportunities curated before they appear in matching.", path: "/scholarships/weekly" }
    : pathname === "/scholarships/shortlist"
    ? { title: "Shortlist", desc: "Your saved scholarship shortlist — track, compare, and manage your top opportunities.", path: "/scholarships/shortlist" }
    : { title: "Scholarship Matches", desc: "Discover and match with international scholarships ranked by your profile, discipline, and IELTS score.", path: "/scholarships" };

  return (
    <>
      <PageMeta {...scholarshipMeta} />
      <div className="topbar topbar--scholarships">
        <div>
          <div style={{ font: "600 11px/1.4 var(--font-ui)", color: "var(--text-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Workspace</div>
          <div className="page-title" style={{ marginBottom: 8 }}>Scholarships</div>
          <div className="page-subtitle">
            {pathname === "/scholarships/shortlist"
              ? "Your shortlist is tracked in the scholarship workspace for now."
              : isWeeklyFeed
                ? `${freshness}. This week's scholarship additions are curated here before they appear in matching surfaces.`
                : `${freshness}. Match your profile to scholarships and keep a shortlist of viable options.`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {isDeadlinePlan ? (
            <Link to="/scholarships" className="ghost-btn" style={{ textDecoration: "none" }}>My matches</Link>
          ) : isWeeklyFeed ? (
            <Link to="/scholarships" className="ghost-btn" style={{ textDecoration: "none" }}>My matches</Link>
          ) : (
            <>
              <Link to="/scholarships/deadlines" className="ghost-btn" style={{ textDecoration: "none" }}>Deadlines</Link>
              <Link to="/scholarships/ielts-bridge" className="ghost-btn" style={{ textDecoration: "none" }}>IELTS Bridge</Link>
              <Link to="/scholarships/weekly" className="ghost-btn" style={{ textDecoration: "none" }}>Weekly feed</Link>
            </>
          )}
        </div>
      </div>
      <Suspense fallback={<RouteFallback label="Loading scholarships" />}>
        {isDeadlinePlan ? (
          <DeadlineActionPlan
            profile={profile}
            scholarshipCatalog={scholarshipCatalog}
            C={C}
            Chip={Chip}
            PrimaryBtn={PrimaryBtn}
          />
        ) : isAdminReview ? (
          canReviewScholarships ? (
            <ScholarshipReviewPage C={C} Chip={Chip} />
          ) : (
            <div className="empty-state" role="status">
              <div className="empty-state-title">Admin access required</div>
              <div className="empty-state-copy">Your account needs an admin role before it can access the scholarship review panel.</div>
            </div>
          )
        ) : isBridge ? (
          <IeltsBridgePage
            sessions={sessions}
            profile={profile}
            scholarshipCatalog={scholarshipCatalog}
            rankedScholarships={null}
            C={C}
            Chip={Chip}
            PrimaryBtn={PrimaryBtn}
          />
        ) : isWeeklyFeed ? (
          <ScholarshipFeedPage
            scholarships={scholarships}
            scholarshipCatalog={scholarshipCatalog}
            contentManifest={contentManifest}
            C={C}
            Chip={Chip}
          />
        ) : (
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
        )}
      </Suspense>
    </>
  );
}
