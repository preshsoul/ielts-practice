import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext.jsx";
import { cleanUrl } from "../../lib/security.js";
import MatchAlertBadge from "../MatchAlertBadge.jsx";
import { getMatchAlertCount, markMatchesViewed } from "../../lib/matchAlerts.js";

const PRACTICE_NAV = [
  { to: "/practice", label: "Hub", end: true },
  { to: "/practice/reading", label: "Reading" },
  { to: "/practice/listening", label: "Listening" },
  { to: "/practice/writing", label: "Writing" },
  { to: "/practice/speaking", label: "Speaking" },
  { to: "/practice/daily", label: "Daily" },
  { to: "/practice/vocabulary", label: "Vocabulary" },
  { to: "/practice/mock-test", label: "Mock test" },
  { to: "/practice/progress", label: "Progress" },
  { to: "/practice/weak-areas", label: "Weak areas" },
  { to: "/practice/learning-path", label: "Learning path" },
];

function InterfaceIcon({ name }) {
  const iconProps = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (name) {
    case "home":
      return (
        <svg {...iconProps}>
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M9 21V12h6v9" />
          <path d="M6 10.5v10" />
          <path d="M18 10.5v10" />
        </svg>
      );
    case "practice":
      return (
        <svg {...iconProps}>
          <path d="M6 4h12v16H6z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
          <path d="M9 16h4" />
        </svg>
      );
    case "scholarships":
      return (
        <svg {...iconProps}>
          <path d="M4 7l8-4 8 4v12H4z" />
          <path d="M4 7l8 4 8-4" />
          <path d="M12 11v10" />
          <path d="M9 17h6" />
        </svg>
      );
    case "readiness":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
          <path d="M16.5 7.5l1-1" />
        </svg>
      );
    case "account":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="8" r="4" />
          <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
      );
    case "achievements":
      return (
        <svg {...iconProps}>
          <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" />
        </svg>
      );
    default:
      return null;
  }
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="topbar">
      <div>
        <div style={{ font: "600 11px/1.4 var(--font-ui)", color: "var(--text-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Workspace</div>
        <div className="page-title" style={{ marginBottom: 8 }}>{title}</div>
        <div className="page-subtitle">{subtitle}</div>
      </div>
      {action}
    </div>
  );
}

export function PracticeShell({ title, subtitle, weakCount, exportAction, children }) {
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

function CommandPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const { commandPaletteOpen, setCommandPaletteOpen } = useWorkspace();
  const [query, setQuery] = useState("");

  const items = useMemo(() => ([
    { label: "Home", description: "Open the dashboard", to: "/" },
    { label: "Onboarding", description: "Open the profile setup flow", to: "/onboarding" },
    { label: "Practice", description: "Jump into IELTS training", to: "/practice" },
    { label: "Scholarships", description: "Open matching and shortlist", to: "/scholarships" },
    { label: "Weekly scholarships", description: "See this week’s new additions", to: "/scholarships/weekly" },
    { label: "Deadlines", description: "Scholarship deadline action plan", to: "/scholarships/deadlines" },
    { label: "Daily challenge", description: "Today's practice challenge", to: "/practice/daily" },
    { label: "Vocabulary", description: "Build your academic vocabulary", to: "/practice/vocabulary" },
    { label: "Mock test", description: "Take a full timed mock test", to: "/practice/mock-test" },
    { label: "Achievements", description: "View your earned badges", to: "/achievements" },
    { label: "Readiness", description: "View your IELTS readiness score", to: "/readiness" },
    { label: "Account", description: "Review your profile", to: "/account" },
  ]), []);

  useEffect(() => {
    if (!commandPaletteOpen) setQuery("");
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setCommandPaletteOpen(false);
        return;
      }
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;
      event.preventDefault();
      setCommandPaletteOpen((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const filtered = items.filter((item) => {
    const haystack = `${item.label} ${item.description}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="command-palette__backdrop" aria-label="Close command palette" onClick={() => setCommandPaletteOpen(false)} />
      <div className="command-palette__panel">
        <div className="command-palette__header">
          <div>
            <div className="command-palette__kicker">Command Center</div>
            <div className="command-palette__title">Jump anywhere</div>
          </div>
          <div className="command-palette__hint">Esc</div>
        </div>
        <input
          className="command-palette__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search surfaces, modes, and actions"
          autoFocus
        />
        <div className="command-palette__list">
          {filtered.length ? filtered.map((item) => (
            <button
              key={item.to}
              type="button"
              className={`command-palette__item${location.pathname === item.to ? " active" : ""}`}
              onClick={() => {
                navigate(item.to);
                setCommandPaletteOpen(false);
              }}
            >
              <span className="command-palette__item-title">{item.label}</span>
              <span className="command-palette__item-copy">{item.description}</span>
            </button>
          )) : (
            <div className="command-palette__empty">No matching surface found.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntelDrawer() {
  const { intelPanel, closeIntelPanel } = useWorkspace();
  const [expertView, setExpertView] = useState(false);

  useEffect(() => {
    if (!intelPanel) setExpertView(false);
  }, [intelPanel]);

  if (!intelPanel) return null;

  const metrics = Array.isArray(intelPanel.metrics) ? intelPanel.metrics : [];
  const links = Array.isArray(intelPanel.links) ? intelPanel.links : [];

  return (
    <div className="intel-drawer" aria-live="polite">
      <button type="button" className="intel-drawer__backdrop" aria-label="Close intelligence drawer" onClick={closeIntelPanel} />
      <aside className="intel-drawer__panel">
        <div className="intel-drawer__header">
          <div>
            <div className="intel-drawer__eyebrow">{intelPanel.eyebrow || "Intelligence"}</div>
            <div className="intel-drawer__title">{intelPanel.title}</div>
          </div>
          <button type="button" className="ghost-btn" onClick={closeIntelPanel}>Close</button>
        </div>
        <p className="intel-drawer__copy">{intelPanel.summary}</p>
        {metrics.length > 0 && (
          <div className="intel-drawer__metrics">
            {metrics.map((metric) => (
              <div key={metric.label} className="intel-drawer__metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        )}
        <label className="intel-drawer__toggle">
          <input type="checkbox" checked={expertView} onChange={(event) => setExpertView(event.target.checked)} />
          <span>Expert View</span>
        </label>
        <div className="intel-drawer__body">
          <p>{expertView ? intelPanel.expert || intelPanel.details || intelPanel.summary : intelPanel.details || intelPanel.summary}</p>
        </div>
        {links.length > 0 && (
          <div className="intel-drawer__links">
            {links.map((link) => {
              const safeHref = cleanUrl(link?.href);
              if (!safeHref) return null;
              return (
                <a key={safeHref} href={safeHref} target={link.external === false ? undefined : "_blank"} rel="noreferrer">
                  {link.label}
                </a>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

function ShellFrame({ sessions, onRefresh, children, authUser, profile, scholarshipCatalog }) {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("loci.sidebarCollapsed") === "true";
  });
  const { setCommandPaletteOpen } = useWorkspace();

  const navItems = useMemo(() => {
    const items = [
      { to: "/", label: "Home", icon: "home", end: true },
      { to: "/practice", label: "Practice", icon: "practice" },
      { to: "/scholarships", label: "Scholarships", icon: "scholarships" },
      { to: "/readiness", label: "Readiness", icon: "readiness" },
      { to: "/achievements", label: "Achievements", icon: "achievements" },
      { to: "/account", label: "Account", icon: "account" },
    ];

    return items;
  }, []);

  const matchAlertCount = useMemo(() => {
    if (!profile?.id || !Array.isArray(scholarshipCatalog)) return 0;
    return getMatchAlertCount(scholarshipCatalog, profile);
  }, [profile, scholarshipCatalog]);

  const handleScholarshipNavClick = () => {
    if (profile?.id) markMatchesViewed(profile.id);
  };

  const targetBand = profile?.target_band || "Set goal";
  const deepWorkMode = location.pathname.startsWith("/practice");
  const isSidebarCollapsed = sidebarCollapsed;
  const sidebarWidth = isSidebarCollapsed ? "64px" : "240px";
  const shellSummary = profile
    ? `${profile.first_name || profile.display_name || "Candidate"} · ${targetBand}`
    : "Candidate intelligence workspace";
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("loci.sidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.dataset.workspaceMode = deepWorkMode ? "practice" : "default";
    return () => {
      if (document.body.dataset.workspaceMode) {
        delete document.body.dataset.workspaceMode;
      }
    };
  }, [deepWorkMode]);

  return (
    <div className={`workspace-shell${deepWorkMode ? " workspace-shell--deep-work" : ""}`} style={{ "--sidebar-width": sidebarWidth }}>
        <aside className={`workspace-sidebar${isSidebarCollapsed ? " collapsed" : ""}`}>
          <div className="sidebar-header">
            <div className="sidebar-brand">
              <div className="sidebar-brand-row">
                <div className="sidebar-logo" aria-label="Loci brand mark">L</div>
                <button
                  type="button"
                  className="sidebar-collapse-btn"
                  onClick={() => setSidebarCollapsed((current) => !current)}
                  aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-expanded={!isSidebarCollapsed}
                >
                  <span aria-hidden="true">{isSidebarCollapsed ? "›" : "‹"}</span>
                </button>
              </div>
              {!isSidebarCollapsed && (
                <>
                  <div className="sidebar-title">Loci</div>
                  <div className="sidebar-subtitle">Candidate intelligence and scholarship flow</div>
                </>
              )}
            </div>

            <div className="system-status">
              <div className="status-indicator active" />
              {!isSidebarCollapsed && <span>Relevance engine running</span>}
            </div>
          </div>

          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `sidebar-nav-item${isActive ? " active" : ""}`}
                title={isSidebarCollapsed ? item.label : undefined}
                onClick={item.to === "/scholarships" ? handleScholarshipNavClick : undefined}
              >
                <span className="nav-icon"><InterfaceIcon name={item.icon} /></span>
                {!isSidebarCollapsed && <span className="nav-label">{item.label}</span>}
                {item.to === "/scholarships" && <MatchAlertBadge count={matchAlertCount} />}
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="session-info">
              {!isSidebarCollapsed && (
                <div className="session-count">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</div>
              )}
              <button onClick={onRefresh} className="sidebar-reset-btn" title="Refresh data" type="button">
                <span aria-hidden="true">↻</span>
                {!isSidebarCollapsed && <span>Sync</span>}
              </button>
            </div>
          </div>
        </aside>

        <div className="workspace-main">
          <header className="workspace-header">
            <div>
              <div className="workspace-header__kicker">Workspace</div>
              <div className="workspace-header__title">{shellSummary}</div>
            </div>
            <div className="shell-actions">
              <button type="button" className="ghost-btn" onClick={() => setCommandPaletteOpen(true)}>
                Cmd+K
              </button>
              <div className="workspace-header__profile">
                <span className="workspace-header__label">Quick profile</span>
                <strong>{profile?.tier || "free"}</strong>
              </div>
            </div>
          </header>

          <main className="workspace-stage" key={location.pathname}>
            {children}
          </main>
        </div>

        <CommandPalette />
        <IntelDrawer />

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

export function Shell(props) {
  return (
    <WorkspaceProvider>
      <ShellFrame {...props} />
    </WorkspaceProvider>
  );
}
