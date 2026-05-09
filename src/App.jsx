import React, { useState, useEffect } from "react";
import { Link, NavLink, Navigate, Routes, Route, useLocation } from "react-router-dom";
import PracticeView from './components/PracticeView.jsx';
import PracticeHub from './components/PracticeHub.jsx';
import ModulePracticeScreen from './components/ModulePracticeScreen.jsx';
import ProgressView from './components/ProgressView.jsx';
import WeakAreasView from './components/WeakAreasView.jsx';
import LearningPathView from './components/LearningPathView.jsx';
import ScholarshipPage from './components/ScholarshipPage.jsx';
import AccountProfileForm from './components/AccountProfileForm.jsx';
import AccountStatusCard from './components/AccountStatusCard.jsx';
import AdminContentScreen from './components/AdminContentScreen.jsx';
import AuthGate from './components/AuthGate.jsx';
import OnboardingForm from './components/OnboardingForm.jsx';
import DashboardHome from './components/DashboardHome.jsx';
import './styles.css';
import { supabase, loadPublicContent, ensureProfile, loadPracticeSessions, savePracticeSession, saveStructuredProfile, saveCvProfile, saveOnboardingProfile } from "./services/supabaseData.js";
import { createStructuredProfileDraft, serializeStructuredProfileDraft } from "./services/scoringEngine.js";
import securityLogger from "./services/securityLogger.js";
import InputSanitizer from "./services/inputSanitizer.js";
import SecureErrorHandler from "./services/secureErrorHandler.js";
import { LEARNING_PATH } from "./data/learningPath.js";
import { createOnboardingDraft, serializeOnboardingDraft } from "./lib/onboarding.js";

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const EXAMS = ["All", "IELTS", "CEP (C2)", "CELPIP"];
const DIFF_LABEL = { 1: "Easy", 2: "Medium", 3: "Hard" };
const DIFF_COLOR = { 1: "#1A8C4E", 2: "#B86A0A", 3: "#C93838" };
const EXAM_COLOR = { IELTS: "#C47A00", "CEP (C2)": "#2A7AB0", CELPIP: "#A83030" };
const ADMIN_EMAILS = new Set(
  String(import.meta.env.VITE_ADMIN_EMAIL || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const APP_OWNER = import.meta.env.VITE_APP_OWNER || "Loci: Your Source for Direction";
const C = {
  bg: "#F9F7F4",
  surface: "#FFFFFF",
  border: "#E0DAD2",
  text: "#1A1814",
  muted: "#7A7570",
  faint: "#EAE6DF",
  accent: "#2D5BE3",
  green: "#1A8C4E",
  red: "#C93838",
  amber: "#B86A0A",
  bg2: "#F2EFE9",
  bg3: "#EAE6DF",
};


function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* Weighted question selector — boosts weak sections */
function selectQueue(allQ, weakSections, exam, count = 20) {
  let pool = exam === "All" ? allQ : allQ.filter(q => q.exam === exam);
  if (!pool.length) return [];
  if (weakSections.length === 0) return shuffle(pool).slice(0, count);
  const weak = pool.filter(q => weakSections.includes(q.section));
  const other = pool.filter(q => !weakSections.includes(q.section));
  const weakCount = Math.min(Math.round(count * 0.6), weak.length);
  const otherCount = Math.min(count - weakCount, other.length);
  return shuffle([...shuffle(weak).slice(0, weakCount), ...shuffle(other).slice(0, otherCount)]);
}

/* Compute section accuracy from all sessions (session-aware)
   Flags a section as weak when it has appeared in at least 3 distinct sessions
   and the overall accuracy for that section is below the threshold (default 60%). */
function computeWeakSections(sessions, threshold = 0.6) {
  const sectionData = {};
  sessions.forEach((s, idx) => {
    const sessionId = s.date || idx;
    s.results.forEach(r => {
      if (!sectionData[r.section]) sectionData[r.section] = { correct: 0, total: 0, sessions: new Set() };
      sectionData[r.section].total++;
      if (r.correct) sectionData[r.section].correct++;
      sectionData[r.section].sessions.add(sessionId);
    });
  });
  return Object.entries(sectionData)
    .filter(([, d]) => d.sessions.size >= 3 && d.correct / d.total < threshold)
    .map(([s]) => s);
}

/* ═══════════════════════════════════════════════════════
   STORAGE — use window.storage if available, otherwise fallback to localStorage
═══════════════════════════════════════════════════════ */
async function loadSessions() {
  try {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function') {
      const r = await window.storage.get("precious_sessions");
      return safeLoadSessions(r ? r.value : null);
    } else if (typeof localStorage !== 'undefined') {
      const s = localStorage.getItem('precious_sessions');
      return safeLoadSessions(s);
    }
    return [];
  } catch { return []; }
}

function safeLoadSessions(rawData) {
  try {
    if (!rawData) return [];
    const data = JSON.parse(rawData);
    if (!Array.isArray(data)) return [];

    return data.filter(session =>
      typeof session === 'object' &&
      session !== null &&
      !Object.prototype.hasOwnProperty.call(session, '__proto__') &&
      !Object.prototype.hasOwnProperty.call(session, 'constructor')
    ).map(session => ({
      id: String(session.id || ''),
      date: String(session.date || new Date().toISOString()),
      score: Number(session.score) || 0,
      total: Number(session.total) || 0,
      exam: String(session.exam || 'IELTS'),
      module: String(session.module || 'reading'),
      mode: String(session.mode || 'practice'),
      component: String(session.component || 'Reading quiz'),
      results: Array.isArray(session.results) ? session.results : []
    }));
  } catch {
    return [];
  }
}
async function saveSessions(sessions) {
  try {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.set === 'function') {
      await window.storage.set("precious_sessions", JSON.stringify(sessions));
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('precious_sessions', JSON.stringify(sessions));
    }
  } catch { }
}

function normalizeSessions(list) {
  return (Array.isArray(list) ? list : []).map((session) => ({
    ...session,
    id: session.id || session.date || crypto.randomUUID(),
    module: session.module || "reading",
    mode: session.mode || "practice",
    component: session.component || "Reading quiz",
  }));
}

function mergeSessions(existing, incoming) {
  const map = new Map();
  [...normalizeSessions(existing), ...normalizeSessions(incoming)].forEach((session) => {
    map.set(session.id, session);
  });
  return [...map.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildResultsExport(sessions) {
  const totalQuestions = sessions.reduce((sum, session) => sum + (Array.isArray(session.results) ? session.results.length : 0), 0);
  const correctAnswers = sessions.reduce(
    (sum, session) => sum + (Array.isArray(session.results) ? session.results.filter((result) => result.correct).length : 0),
    0
  );

  return {
    exported_at: new Date().toISOString(),
    summary: {
      total_sessions: sessions.length,
      total_questions_answered: totalQuestions,
      total_correct_answers: correctAnswers,
      accuracy_pct: totalQuestions ? Math.round((correctAnswers / totalQuestions) * 1000) / 10 : 0,
    },
    sessions: sessions.map((session) => ({
      id: session.id,
      date: session.date,
      exam: session.exam,
      module: session.module || session.exam,
      mode: session.mode || "practice",
      score: session.score,
      total: session.total,
      durationSecs: session.durationSecs || null,
      results: Array.isArray(session.results)
        ? session.results.map((result) => ({
            section: result.section,
            correct: Boolean(result.correct),
          }))
        : [],
    })),
  };
}

function exportResultsData(sessions, userId = 'anonymous') {
  securityLogger.logDataExport(userId, 'practice_results', sessions.length);
  downloadJson(`ielts-results-${new Date().toISOString().slice(0, 10)}.json`, buildResultsExport(sessions));
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

const PRACTICE_NAV = [
  { to: "/practice", label: "Hub", end: true },
  { to: "/practice/reading", label: "Reading" },
  { to: "/practice/listening", label: "Listening" },
  { to: "/practice/writing", label: "Writing" },
  { to: "/practice/speaking", label: "Speaking" },
  { to: "/practice/progress", label: "Progress" },
  { to: "/practice/weak-areas", label: "Weak Areas" },
  { to: "/practice/learning-path", label: "Learning Path" },
];

function Shell({ sessions, onReset, children, authUser, profile }) {
  const isAdmin = authUser?.email ? ADMIN_EMAILS.has(authUser.email.toLowerCase()) : false;
  const navItems = [
    { to: "/", label: "Home", icon: "home", end: true },
    { to: "/practice", label: "Practice", icon: "practice" },
    { to: "/scholarships", label: "Scholarships", icon: "scholarships" },
    { to: "/account", label: "Profile", icon: "account" },
  ];

  if (isAdmin) {
    navItems.push({ to: "/admin", label: "Admin", icon: "admin" });
  }

  const targetBand = profile?.target_band || "Set goal";

  return (
    <div className="flight-deck-grid">
      {/* Flight Deck Sidebar */}
      <aside className="glass-sidebar flight-deck-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">LOCI</div>
            <div className="sidebar-title">Academic Co-Pilot</div>
            <div className="sidebar-subtitle">Research, prep, scholarship flow</div>
          </div>

          {/* Mini Profile */}
          <div className="mini-profile">
            <div className="mini-profile-avatar">
              {authUser?.email?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="mini-profile-info">
              <div className="mini-profile-band">Goal: {targetBand}</div>
              <div className="mini-profile-status">Live guidance</div>
            </div>
          </div>

          {/* System Status */}
          <div className="system-status">
            <div className="status-indicator active"></div>
            <span>Relevance engine running</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-nav-item${isActive ? " active" : ""}`}
            >
              <span className="nav-icon"><InterfaceIcon name={item.icon} /></span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Session Info */}
        <div className="sidebar-footer">
          <div className="session-info">
            <div className="session-count">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</div>
            <button onClick={onReset} className="sidebar-reset-btn">Reset</button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flight-deck-main">
        {children}
      </main>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mobile-nav-btn${isActive ? " active" : ""}`}
          >
            <InterfaceIcon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="topbar">
      <div>
        <div style={{ font: "600 11px/1.4 var(--font-ui)", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase" }}>Workspace</div>
        <div className="page-title" style={{ marginBottom: 8 }}>{title}</div>
        <div className="page-subtitle">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}

function PracticeShell({ title, subtitle, weakCount, exportAction, children }) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={exportAction ? <button onClick={exportAction} className="ghost-btn">Export results</button> : null}
      />
      <div className="module-subnav" aria-label="Practice navigation">
        {PRACTICE_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `module-subnav-link${isActive ? " active" : ""}`}
          >
            {item.label}
            {item.to === "/practice/weak-areas" && weakCount > 0 && <span className="module-subnav-badge">{weakCount}</span>}
          </NavLink>
        ))}
      </div>
      <section className="panel-card">{children}</section>
    </>
  );
}


function AccountPage({
  sessions,
  authUser,
  profile,
  profileDraft,
  setProfileDraft,
  profileBusy,
  profileMessage,
  saveProfileDraft,
  authEmail,
  setAuthEmail,
  authMessage,
  authBusy,
  onSignIn,
  onSignOut,
}) {
  return (
    <section className="panel-card route-card">
      <PageHeader
        title="Account"
        subtitle="Keep your candidate profile structured so scholarships can be scored against real criteria, not pasted prose."
      />
      <div className="account-grid">
        <AccountStatusCard
          authUser={authUser}
          authEmail={authEmail}
          setAuthEmail={setAuthEmail}
          authMessage={authMessage}
          authBusy={authBusy}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
        />
        <div className="account-card">
          <div className="empty-state-title">Structured profile</div>
          <div className="empty-state-copy">
            This replaces the old CV paste flow with explicit fields the scoring engine can use reliably. Document intake now lives on the Scholarships page and feeds this profile after backend confirmation.
          </div>
          <div className="empty-state-meta">
            {profile ? "Profile row synced in Supabase." : "Sign in first to save profile data."}
          </div>
          <div className="empty-state-meta">{sessions.length} locally stored session{sessions.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      <AccountProfileForm
        profile={profile}
        profileDraft={profileDraft}
        setProfileDraft={setProfileDraft}
        profileBusy={profileBusy}
        profileMessage={profileMessage}
        saveProfileDraft={saveProfileDraft}
        authUser={authUser}
        sessions={sessions}
      />
    </section>
  );
}

function ProtectedRoute({ component: Component, authUser, isAdmin, ...rest }) {
  if (!authUser || !isAdmin) return <Navigate to="/account" replace />;
  return <Component authUser={authUser} {...rest} />;
}

function PracticeRoutes({ sessions, onSessionComplete, exportAction, qb, passages, LEARNING_PATH }) {
  const weak = computeWeakSections(sessions);
  const location = useLocation();
  const pathname = location.pathname;

  let content = (
    <PracticeHub sessions={sessions} C={C} PrimaryBtn={PrimaryBtn} />
  );

  if (pathname === "/practice/reading") {
    content = (
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
    );
  } else if (pathname === "/practice/listening") {
    content = (
      <ModulePracticeScreen
        module="listening"
        sessions={sessions}
        onSessionComplete={onSessionComplete}
        C={C}
        PrimaryBtn={PrimaryBtn}
        GhostBtn={GhostBtn}
        Chip={Chip}
      />
    );
  } else if (pathname === "/practice/writing") {
    content = (
      <ModulePracticeScreen
        module="writing"
        sessions={sessions}
        onSessionComplete={onSessionComplete}
        C={C}
        PrimaryBtn={PrimaryBtn}
        GhostBtn={GhostBtn}
        Chip={Chip}
      />
    );
  } else if (pathname === "/practice/speaking") {
    content = (
      <ModulePracticeScreen
        module="speaking"
        sessions={sessions}
        onSessionComplete={onSessionComplete}
        C={C}
        PrimaryBtn={PrimaryBtn}
        GhostBtn={GhostBtn}
        Chip={Chip}
      />
    );
  } else if (pathname === "/practice/progress") {
    content = <ProgressView sessions={sessions} C={C} Chip={Chip} EXAM_COLOR={EXAM_COLOR} />;
  } else if (pathname === "/practice/weak-areas") {
    content = <WeakAreasView sessions={sessions} C={C} Chip={Chip} computeWeakSections={computeWeakSections} />;
  } else if (pathname === "/practice/learning-path") {
    content = <LearningPathView sessions={sessions} C={C} Chip={Chip} LEARNING_PATH={LEARNING_PATH} computeWeakSections={computeWeakSections} />;
  }

  return (
    <PracticeShell
      title="Practice"
      subtitle="Work through adaptive exam practice with answer feedback and passage context."
      weakCount={weak.length}
      exportAction={exportAction}
    >
      {content}
    </PracticeShell>
  );
}

function ScholarshipRoutes({ sessions, institutions, authUser, profile, onImportCv, cvImportBusy, cvImportMessage, contentManifest, notifications }) {
  const { pathname } = useLocation();
  const freshness = contentManifest?.updated_at ? new Date(contentManifest.updated_at).toLocaleDateString("en-GB") : "No recent content manifest";
  return (
    <>
      <PageHeader
        title="Scholarships"
        subtitle={pathname === "/scholarships/shortlist"
          ? "Your shortlist is tracked in the scholarship workspace for now."
          : `${freshness}. Match your profile to institutions and keep a shortlist of viable options.`}
      />
      <section className="panel-card">
        <ScholarshipPage
          sessions={sessions}
          institutions={institutions}
          authUser={authUser}
          profile={profile}
          onImportCv={onImportCv}
          cvImportBusy={cvImportBusy}
          cvImportMessage={cvImportMessage}
          contentManifest={contentManifest}
          notifications={notifications}
          C={C}
          Chip={Chip}
          PrimaryBtn={PrimaryBtn}
        />
      </section>
    </>
  );
}

export default function App() {
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [content, setContent] = useState({ questions: [], passages: {}, institutions: [], notifications: [], contentManifest: null });
  const [loaded, setLoaded] = useState(false);
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
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [otpAttempts, setOtpAttempts] = useState(() => {
    const stored = localStorage.getItem('otp_attempts');
    return stored ? JSON.parse(stored) : {};
  });

  useEffect(() => {
    Promise.all([
      loadSessions(),
      loadPublicContent().catch(() => ({ questions: [], passages: {}, institutions: [], notifications: [], contentManifest: null })),
    ]).then(([storedSessions, publicContent]) => {
      setSessions(storedSessions);
      setContent(publicContent);
      setLoaded(true);
    });
  }, []);

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
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const user = data.session?.user || null;
      setAuthUser(user);
      if (user) {
        try {
          const profileRow = await ensureProfile(user);
          if (mounted) setProfile(profileRow);
          const remoteSessions = await loadPracticeSessions(user.id);
          if (mounted && remoteSessions.length) {
            setSessions((current) => mergeSessions(current, remoteSessions));
          }
        } catch (error) {
          console.error(error);
        }
      } else {
        setProfile(null);
      }
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user || null;
      setAuthUser(user);
      if (!user) {
        securityLogger.log('SECURITY', 'USER_SESSION_END', { previousUserId: authUser?.id });
        setProfile(null);
        return;
      }
      securityLogger.logAuthSuccess(user.id, user.email);
      try {
        const profileRow = await ensureProfile(user);
        if (mounted) setProfile(profileRow);
        const remoteSessions = await loadPracticeSessions(user.id);
        if (mounted && remoteSessions.length) {
          setSessions((current) => mergeSessions(current, remoteSessions));
        }
      } catch (error) {
        console.error(error);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const onSessionComplete = async (sess) => {
    const session = { ...sess, id: sess.id || crypto.randomUUID() };
    const updated = mergeSessions(sessions, [session]);
    setSessions(updated);
    await saveSessions(updated);
    if (authUser?.id && profile?.id) {
      try {
        await savePracticeSession(profile.id, session);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const resetData = async () => {
    if (!window.confirm("Reset all session data? This cannot be undone.")) return;
    setSessions([]);
    await saveSessions([]);
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
      setProfile(updatedProfile);
      setProfileMessage("Profile saved. Scholarship scoring refreshed.");
    } catch (error) {
      console.error(error);
      setProfileMessage("Unable to save your profile right now.");
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
      setProfile(updatedProfile);
      setOnboardingMessage("Setup saved. Your dashboard is ready.");
    } catch (error) {
      console.error(error);
      setOnboardingMessage("Unable to save onboarding right now.");
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
      await saveCvProfile(profile.id, intake);
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
        }));
      }
      setCvImportMessage("Document intake saved. Review the suggested fields in Account before saving the profile.");
      return { ok: true };
    } catch (error) {
      console.error(error);
      const message = "Unable to save the document right now.";
      setCvImportMessage(message);
      return { ok: false, message };
    } finally {
      setCvImportBusy(false);
    }
  };

  // Rate limiting functions for OTP
  function canSendOTP(email) {
    const now = Date.now();
    const attempts = otpAttempts[email] || [];
    const recent = attempts.filter(time => now - time < 3600000); // 1 hour
    return recent.length < 3; // Max 3 per hour
  }

  function recordOTPAttempt(email) {
    const now = Date.now();
    setOtpAttempts(prev => {
      const updated = {
        ...prev,
        [email]: [...(prev[email] || []).filter(time => now - time < 3600000), now]
      };
      localStorage.setItem('otp_attempts', JSON.stringify(updated));
      return updated;
    });
  }

  const signInWithEmail = async () => {
    if (!supabase || !authEmail.trim()) return;

    // Sanitize and validate email
    const sanitizedEmail = InputSanitizer.sanitizeEmail(authEmail.trim());
    if (!sanitizedEmail) {
      securityLogger.logSuspiciousActivity('INVALID_EMAIL_FORMAT', { input: authEmail });
      setAuthMessage("Please enter a valid email address.");
      return;
    }

    if (!canSendOTP(sanitizedEmail)) {
      securityLogger.logRateLimitExceeded(sanitizedEmail, 'otp_attempts');
      setAuthMessage("Too many attempts. Please wait before trying again.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      securityLogger.logAuthAttempt(sanitizedEmail, false, 'otp');
      const { error } = await supabase.auth.signInWithOtp({
        email: sanitizedEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setAuthMessage("Magic link sent. Check your email to finish sign-in.");
      recordOTPAttempt(sanitizedEmail);
      securityLogger.logAuthAttempt(sanitizedEmail, true, 'otp');
    } catch (error) {
      SecureErrorHandler.logError(error, { action: 'signInWithEmail', email: sanitizedEmail });
      securityLogger.logAuthFailure(sanitizedEmail, error.message);
      setAuthMessage(SecureErrorHandler.getSafeErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    securityLogger.log('SECURITY', 'USER_LOGOUT', { userId: authUser?.id });
    await supabase.auth.signOut();
    setAuthUser(null);
    setProfile(null);
    setAuthEmail("");
    setAuthMessage("");
    setOtpAttempts({});
    // Clear persisted data for security and consistency
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.remove === "function") {
        await window.storage.remove("precious_sessions");
      }
    } catch {
      // Ignore storage cleanup failures and continue clearing local storage.
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem('precious_sessions');
      localStorage.removeItem('otp_attempts');
      localStorage.removeItem('scholarship_shortlist');
      localStorage.removeItem('scholarship_keywords');
      localStorage.removeItem('scholarship_cv');
      localStorage.removeItem('scholarship_consent');
    }
  };

  const pathname = location.pathname;
  const publicMode = pathname === "/signup"
    ? "signup"
    : pathname === "/verify"
      ? "verify"
      : "login";

  if (!loaded || !authReady) {
    return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "var(--font-ui)", fontSize: 12 }}>Loading your data…</div>;
  }

  if (pathname === "/reset-password") {
    return <AuthGate mode="reset" />;
  }

  if (!authUser) {
    return <AuthGate mode={publicMode} />;
  }

  if (pathname === "/onboarding") {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>
        <OnboardingForm
          profile={profile}
          draft={onboardingDraft}
          setDraft={setOnboardingDraft}
          onSave={saveOnboarding}
          saving={onboardingBusy}
          message={onboardingMessage}
        />
      </div>
    );
  }

  const isAdmin = authUser?.email ? ADMIN_EMAILS.has(authUser.email.toLowerCase()) : false;
  const exportAction = () => exportResultsData(sessions, authUser?.id || profile?.id || 'anonymous');
  const QB = content.questions;
  const PASSAGES = content.passages;
  const institutions = content.institutions;

  return (
    <Shell sessions={sessions} onReset={resetData} authUser={authUser} profile={profile}>
      <Routes>
        <Route path="/" element={<DashboardHome profile={profile} sessions={sessions} contentManifest={content.contentManifest} notifications={content.notifications} />} />
        <Route path="/practice/*" element={<PracticeRoutes sessions={sessions} onSessionComplete={onSessionComplete} exportAction={exportAction} qb={QB} passages={PASSAGES} LEARNING_PATH={LEARNING_PATH} />} />
        <Route
          path="/scholarships/*"
          element={
            <ScholarshipRoutes
              sessions={sessions}
              institutions={institutions}
              authUser={authUser}
              profile={profile}
              cvImportBusy={cvImportBusy}
              cvImportMessage={cvImportMessage}
              onImportCv={handleCvImport}
              contentManifest={content.contentManifest}
              notifications={content.notifications}
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
              authEmail={authEmail}
              setAuthEmail={setAuthEmail}
              authMessage={authMessage}
              authBusy={authBusy}
              onSignIn={signInWithEmail}
              onSignOut={signOut}
            />
          }
        />
        <Route path="/admin" element={<ProtectedRoute component={AdminContentScreen} authUser={authUser} isAdmin={isAdmin} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

