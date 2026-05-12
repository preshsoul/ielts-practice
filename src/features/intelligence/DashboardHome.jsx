import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildDashboardSnapshot } from "../../lib/dashboard.js";
import { buildNotificationFeed } from "../../lib/notifications.js";
import { useWorkspace } from "../../components/layout/WorkspaceContext.jsx";
import { getLatestScholarshipFeed } from "../../lib/scholarshipFeed.js";

function SkillCard({ label, value }) {
  const numeric = Number(value);
  const display = Number.isFinite(numeric) ? numeric.toFixed(1) : "-";
  const filled = Number.isFinite(numeric) ? Math.max(0, Math.min(100, (numeric / 9) * 100)) : 0;

  return (
    <div className="metric-card">
      <div className="metric-card-title">
        <span className="dashboard-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <circle cx="10" cy="10" r="4" />
            <path d="M10 2v3" />
            <path d="M10 15v3" />
            <path d="M2 10h3" />
            <path d="M15 10h3" />
          </svg>
        </span>
        <span>{label}</span>
      </div>
      <div className="metric-value">{display}</div>
      <div className="metric-bar">
        <div className="metric-fill" style={{ width: `${filled}%` }} />
      </div>
    </div>
  );
}

function StatIcon({ type }) {
  const props = { viewBox: "0 0 20 20", width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (type) {
    case "target":
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="5" />
          <path d="M10 5v5h5" />
        </svg>
      );
    case "streak":
      return (
        <svg {...props}>
          <path d="M6 13c1-3 4-5 4-8 0 0 2.5 2 2 5-0.3 1.7-1.8 3.2-3.5 3.7" />
          <path d="M10 17c1.66 0 3-1.34 3-3" />
        </svg>
      );
    case "baseline":
      return (
        <svg {...props}>
          <path d="M4 14l4-4 3 3 5-5" />
          <path d="M4 18h12" />
        </svg>
      );
    case "balance":
      return (
        <svg {...props}>
          <path d="M10 4v12" />
          <path d="M4 10h12" />
          <path d="M7 7l-3 3 3 3" />
          <path d="M13 7l3 3-3 3" />
        </svg>
      );
    default:
      return null;
  }
}

function RadarChart({ skills }) {
  const items = ["reading", "listening", "writing", "speaking"];
  const values = items.map((key) => Math.max(0, Math.min(100, (Number(skills[key] ?? 0) / 9) * 100)));
  const center = 100;
  const radius = 78;
  const angleStep = (Math.PI * 2) / items.length;

  const ringPolygons = [0.25, 0.5, 0.75, 1].map((scale) => {
    const points = items
      .map((_, index) => {
        const angle = Math.PI / 2 + index * angleStep;
        const x = center + Math.cos(angle) * radius * scale;
        const y = center - Math.sin(angle) * radius * scale;
        return `${x},${y}`;
      })
      .join(" ");
    return <polygon key={scale} points={points} className="radar-grid-ring" fill="none" />;
  });

  const axisLines = items.map((_, index) => {
    const angle = Math.PI / 2 + index * angleStep;
    const x = center + Math.cos(angle) * radius;
    const y = center - Math.sin(angle) * radius;
    return <line key={index} x1={center} y1={center} x2={x} y2={y} className="radar-axis-line" />;
  });

  const filledPoints = values
    .map((value, index) => {
      const angle = Math.PI / 2 + index * angleStep;
      const x = center + Math.cos(angle) * radius * (value / 100);
      const y = center - Math.sin(angle) * radius * (value / 100);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="radar-card dashboard-radar-card">
      <svg viewBox="0 0 200 200" className="radar-chart" aria-label="Skill radar chart">
        <defs>
          <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-status-info)" />
            <stop offset="100%" stopColor="var(--color-text-secondary)" />
          </linearGradient>
        </defs>
        {ringPolygons}
        {axisLines}
        <polygon points={filledPoints} className="radar-fill" />
        {items.map((key, index) => {
          const angle = Math.PI / 2 + index * angleStep;
          const x = center + Math.cos(angle) * (radius + 18);
          const y = center - Math.sin(angle) * (radius + 18) + 3;
          return (
            <text key={key} x={x} y={y} textAnchor={Math.abs(Math.cos(angle)) < 0.2 ? "middle" : x > center ? "start" : "end"} className="radar-label">
              {key}
            </text>
          );
        })}
      </svg>
      <div className="radar-legend">
        <span>Radar shows live skill balance</span>
        <span>0-9 band scale</span>
      </div>
    </div>
  );
}

function DashboardStat({ icon, label, value, note }) {
  return (
    <div className="dashboard-stat">
      <div className="dashboard-stat-head">
        <span className="dashboard-stat-icon">{icon}</span>
        <span className="dashboard-stat-label">{label}</span>
      </div>
      <div className="dashboard-stat-value">{value}</div>
      {note && <div className="dashboard-stat-note">{note}</div>}
    </div>
  );
}

export default function DashboardHome({ profile, sessions, contentManifest, notifications, scholarships = [], scholarshipCatalog = [] }) {
  const { openIntelPanel } = useWorkspace();
  const snapshot = buildDashboardSnapshot(profile || {}, sessions || []);
  const feed = buildNotificationFeed({ profile: profile || {}, sessions: sessions || [], contentManifest, contentNotifications: notifications || [] });
  const targetBand = snapshot.targetBand ? Number(snapshot.targetBand).toFixed(1) : "Set one";
  const testDate = profile?.test_date || profile?.testDate || null;
  const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";
  const onboardingMissing = !hasValue(profile?.target_band) || !hasValue(testDate) || !hasValue(snapshot.skillBands.reading) || !hasValue(snapshot.skillBands.listening) || !hasValue(snapshot.skillBands.writing) || !hasValue(snapshot.skillBands.speaking);
  const nextTask = onboardingMissing
    ? "Complete onboarding so we can build your first study plan"
    : snapshot.nextTask;
  const countdownText = snapshot.daysUntilTest === null
    ? "Add your test date"
    : snapshot.daysUntilTest < 0
      ? "Test date passed"
      : `${snapshot.daysUntilTest} day${snapshot.daysUntilTest === 1 ? "" : "s"} left`;
  const skillValues = [snapshot.skillBands.reading, snapshot.skillBands.listening, snapshot.skillBands.writing, snapshot.skillBands.speaking]
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number);
  const averageSkill = skillValues.length ? skillValues.reduce((sum, value) => sum + value, 0) / skillValues.length : 0;
  const averageText = averageSkill >= 7 ? "Strong baseline" : averageSkill >= 5 ? "Steady improvement" : "Focus on consistency";
  const profileFields = [
    profile?.target_band,
    testDate,
    snapshot.skillBands.reading,
    snapshot.skillBands.listening,
    snapshot.skillBands.writing,
    snapshot.skillBands.speaking,
    profile?.targetDegreeLevel,
    profile?.targetCountries,
  ];
  const completionFilled = profileFields.filter((value) => hasValue(value)).length;
  const completionPercent = Math.round((completionFilled / profileFields.length) * 100);
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const latestScholarships = getLatestScholarshipFeed([
    ...(Array.isArray(scholarshipCatalog) ? scholarshipCatalog : []),
    ...(Array.isArray(scholarships) ? scholarships : []),
  ], {
    limit: 4,
    referenceDate: contentManifest?.updated_at || new Date(),
    recentDays: 10,
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnimatedPercent(completionPercent));
    return () => window.cancelAnimationFrame(frame);
  }, [completionPercent]);

  const progressAccent = completionPercent >= 80
    ? "linear-gradient(90deg, var(--color-interactive-primary-hover), var(--color-status-info))"
    : "linear-gradient(90deg, var(--color-interactive-primary-soft), var(--color-interactive-primary))";

  return (
    <section className="dashboard-layout">
      <div className="layout-grid" style={{ ["--grid-cols"]: 12, ["--grid-gap"]: "24px" }}>
        <article className="loci-card loci-card--editorial dashboard-hero" style={{ gridColumn: "span 7" }}>
          <div className="loci-card__eyebrow">Dashboard</div>
          <h1 className="loci-card__title dashboard-hero-title">Your IELTS readiness at a glance.</h1>
          <p className="loci-card__copy dashboard-hero-copy">
            The most important signals are visible first, and the supporting detail stays grouped where you can read it quickly.
          </p>
          {onboardingMissing && <div className="dashboard-onboarding-note">Your profile is incomplete. Add your test date and self-assessment to unlock sharper recommendations.</div>}
          <div className="hero-pill-row">
            <span className="hero-pill">Target band {targetBand}</span>
            <span className="hero-pill hero-pill-accent">{countdownText}</span>
          </div>
          <div className="dashboard-cta-row">
            <Link className="primary-btn link-button" to="/practice">Start a practice session</Link>
            <Link className="ghost-btn link-button" to="/account">Update profile</Link>
            <button
              type="button"
              className="ghost-btn link-button"
              onClick={() => openIntelPanel({
                eyebrow: "Dashboard intelligence",
                title: "Readiness snapshot",
                summary: "A compact view of the signals driving ranking and next-step guidance.",
                details: `Target band: ${targetBand}. Completion: ${completionPercent}%. Weakest focus: ${snapshot.weakestSkill}.`,
                metrics: [
                  { label: "Sessions", value: String(snapshot.totalSessions) },
                  { label: "Streak", value: `${snapshot.streakDays}d` },
                  { label: "Focus", value: snapshot.weakestSkill },
                  { label: "Countdown", value: countdownText },
                ],
                expert: "This panel will later hold raw readiness history, profile completeness breakdowns, and internal scoring traces."
              })}
            >
              Inspect intelligence
            </button>
          </div>
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-progress-card" style={{ gridColumn: "span 5" }}>
          <div className="loci-card__eyebrow">Profile readiness</div>
          <div className="loci-card__title dashboard-card-title">Loading progress</div>
          <div className="loci-card__copy">A clear read on how much useful data is already available.</div>
          <div className="dashboard-progress-head">
            <div className="dashboard-progress-value">{completionPercent}%</div>
            <div className="dashboard-progress-caption">{completionFilled} of {profileFields.length} fields</div>
          </div>
          <div className="dashboard-progress-track" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={profileFields.length} aria-valuenow={completionFilled}>
            <div className="dashboard-progress-fill" style={{ width: `${animatedPercent}%`, background: progressAccent }} />
          </div>
          <div className="dashboard-progress-footer">
            <span>{completionPercent >= 80 ? "Ready for matching" : "Still sharpening"}</span>
            <span>{averageText}</span>
          </div>
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-radar-card" style={{ gridColumn: "span 5" }}>
          <div className="loci-card__eyebrow">Skill balance</div>
          <RadarChart skills={snapshot.skillBands} />
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-stats-shell" style={{ gridColumn: "span 7" }}>
          <div className="loci-card__eyebrow">At a glance</div>
          <div className="dashboard-stats-grid">
            <DashboardStat icon={<StatIcon type="target" />} label="Target band" value={targetBand} note="The destination band you are working toward." />
            <DashboardStat icon={<StatIcon type="streak" />} label="Practice streak" value={`${snapshot.streakDays} day${snapshot.streakDays === 1 ? "" : "s"}`} note="Momentum is visible here." />
            <DashboardStat icon={<StatIcon type="baseline" />} label="Baseline status" value={averageText} note="A quick read on current level." />
            <DashboardStat icon={<StatIcon type="balance" />} label="Weakest focus" value={snapshot.weakestSkill} note="The next session should attack this first." />
          </div>
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-skills-shell" style={{ gridColumn: "span 7" }}>
          <div className="loci-card__eyebrow">Band snapshot</div>
          <div className="skills-grid">
            <SkillCard label="Reading" value={snapshot.skillBands.reading} />
            <SkillCard label="Listening" value={snapshot.skillBands.listening} />
            <SkillCard label="Writing" value={snapshot.skillBands.writing} />
            <SkillCard label="Speaking" value={snapshot.skillBands.speaking} />
          </div>
        </article>

        <article className="loci-card loci-card--editorial dashboard-next-task" style={{ gridColumn: "span 5" }}>
          <div className="loci-card__eyebrow">Next move</div>
          <div className="loci-card__title next-task">{nextTask}</div>
          <div className="loci-card__copy">
            {snapshot.recentSession?.module
              ? `Latest test: ${snapshot.recentSession.module} · ${Number(snapshot.recentSession.score ?? 0)}/${Number(snapshot.recentSession.total ?? 0)}`
              : "No session yet. A first run will unlock smarter recommendations."}
          </div>
          <div className="dashboard-meta">
            <div>Sessions completed: {snapshot.totalSessions}</div>
            <div>Weakest focus: {snapshot.weakestSkill}</div>
            {testDate && <div>Test date: {new Date(testDate).toLocaleDateString("en-GB")}</div>}
          </div>
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-alerts" style={{ gridColumn: "1 / -1" }}>
          <div className="loci-card__eyebrow">Alerts</div>
          <div className="notification-list">
            {feed.length ? feed.map((item) => (
              <Link key={item.id} to={item.target || "/"} className="notification-item">
                <div className={`notification-badge notification-${item.type}`}>{item.type}</div>
                <div className="notification-copy">
                  <div className="notification-title">{item.title}</div>
                  <div className="notification-body">{item.body}</div>
                </div>
              </Link>
            )) : (
              <div className="empty-state-meta">No new notifications. The workspace is quiet.</div>
            )}
          </div>
        </article>

        <article className="loci-card loci-card--editorial dashboard-scholarship-feed" style={{ gridColumn: "1 / -1" }}>
          <div className="loci-card__eyebrow">Latest scholarships</div>
          <div className="loci-card__title dashboard-card-title">Fresh additions this week</div>
          <div className="loci-card__copy">
            New scholarship opportunities appear here first, while the dedicated scholarship workspace stays focused on your own matches.
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {latestScholarships.length ? latestScholarships.map((item) => (
              <div key={item.id} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 14, background: "var(--color-bg-surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-secondary)", fontFamily: "var(--font-ui)", marginBottom: 4 }}>{item.sourceLabel}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-ui)", marginTop: 4 }}>{item.locationLabel}</div>
                  </div>
                  <Link className="ghost-btn link-button" to="/scholarships/weekly" style={{ alignSelf: "flex-start", textDecoration: "none", padding: "8px 12px" }}>
                    Weekly feed
                  </Link>
                </div>
              </div>
            )) : (
              <div className="empty-state-meta">No fresh scholarship additions available yet.</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
