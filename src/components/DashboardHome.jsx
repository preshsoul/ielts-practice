import React from "react";
import { Link } from "react-router-dom";
import { buildDashboardSnapshot } from "../lib/dashboard.js";
import { buildNotificationFeed } from "../lib/notifications.js";

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
  const props = { viewBox: '0 0 20 20', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (type) {
    case 'target':
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="5" />
          <path d="M10 5v5h5" />
        </svg>
      );
    case 'streak':
      return (
        <svg {...props}>
          <path d="M6 13c1-3 4-5 4-8 0 0 2.5 2 2 5-0.3 1.7-1.8 3.2-3.5 3.7" />
          <path d="M10 17c1.66 0 3-1.34 3-3" />
        </svg>
      );
    case 'baseline':
      return (
        <svg {...props}>
          <path d="M4 14l4-4 3 3 5-5" />
          <path d="M4 18h12" />
        </svg>
      );
    case 'balance':
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
    <div className="radar-card">
      <svg viewBox="0 0 200 200" className="radar-chart" aria-label="Skill radar chart">
        <defs>
          <linearGradient id="radarGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(5,150,105,0.36)" />
            <stop offset="100%" stopColor="rgba(30,58,138,0.24)" />
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
        <span>0–9 band scale</span>
      </div>
    </div>
  );
}

export default function DashboardHome({ profile, sessions, contentManifest, notifications }) {
  const snapshot = buildDashboardSnapshot(profile || {}, sessions || []);
  const feed = buildNotificationFeed({ profile: profile || {}, sessions: sessions || [], contentManifest, contentNotifications: notifications || [] });
  const targetBand = snapshot.targetBand ? Number(snapshot.targetBand).toFixed(1) : "Set one";
  const testDate = profile?.test_date || profile?.testDate || null;
  const onboardingMissing = !profile?.target_band || !testDate || !snapshot.skillBands.reading || !snapshot.skillBands.listening || !snapshot.skillBands.writing || !snapshot.skillBands.speaking;
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

  return (
    <section className="dashboard-layout">
      <div className="dashboard-hero panel-card">
        <div className="dashboard-hero-top">
          <div>
            <div className="page-kicker">Dashboard</div>
            <h1 className="page-title">Flight plan for your IELTS journey</h1>
            <p className="page-copy">
              Track target band, momentum, and the smartest next session from one polished command screen.
            </p>
            {onboardingMissing && (
              <div className="dashboard-onboarding-note">
                Your profile is not complete yet. Add your test date and self-assessment to unlock sharper recommendations.
              </div>
            )}
          </div>

          <div className="hero-callout-card">
            <div className="hero-callout-label">Mission briefing</div>
            <div className="hero-callout-title">{snapshot.nextTask}</div>
            <div className="hero-callout-copy">Today’s priority is {snapshot.weakestSkill}. Run a focused session to convert momentum into progress.</div>
            <div className="hero-pill-row">
              <span className="hero-pill">Target band {targetBand}</span>
              <span className="hero-pill hero-pill-accent">{countdownText}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-hero-grid">
          <div className="hero-summary-card">
            <div className="summary-tile summary-tile-strong">
              <div className="summary-tile-heading"><StatIcon type="target" /><span>Target band</span></div>
              <strong>{targetBand}</strong>
            </div>
            <div className="summary-tile">
              <div className="summary-tile-heading"><StatIcon type="streak" /><span>Practice streak</span></div>
              <strong>{snapshot.streakDays} day{snapshot.streakDays === 1 ? "" : "s"}</strong>
            </div>
            <div className="summary-tile">
              <div className="summary-tile-heading"><StatIcon type="baseline" /><span>Baseline status</span></div>
              <strong>{averageText}</strong>
            </div>
            <div className="summary-tile">
              <div className="summary-tile-heading"><StatIcon type="balance" /><span>Skill balance</span></div>
              <strong>{snapshot.weakestSkill}</strong>
            </div>
          </div>

          <RadarChart skills={snapshot.skillBands} />
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel-card">
          <div className="section-label">Skill baseline</div>
          <div className="skills-grid">
            <SkillCard label="Reading" value={snapshot.skillBands.reading} />
            <SkillCard label="Listening" value={snapshot.skillBands.listening} />
            <SkillCard label="Writing" value={snapshot.skillBands.writing} />
            <SkillCard label="Speaking" value={snapshot.skillBands.speaking} />
          </div>
        </div>

        <div className="panel-card">
          <div className="section-label">Next recommended task</div>
          <div className="next-task">{snapshot.nextTask}</div>
          {snapshot.recentSession?.module && (
            <div className="dashboard-meta">
              Latest test: {snapshot.recentSession.module} · {Number(snapshot.recentSession.score ?? 0)}/{Number(snapshot.recentSession.total ?? 0)}
            </div>
          )}
          <div className="dashboard-meta">
            <div>Sessions completed: {snapshot.totalSessions}</div>
            <div>Weakest focus: {snapshot.weakestSkill}</div>
            {testDate && <div>Test date: {new Date(testDate).toLocaleDateString("en-GB")}</div>}
          </div>
          <div className="dashboard-actions">
            <Link className="primary-btn link-button" to="/practice">Start practice</Link>
            <Link className="ghost-btn link-button" to="/account">Update profile</Link>
          </div>
        </div>

        <div className="panel-card dashboard-notifications">
          <div className="section-label">Alerts</div>
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
        </div>
      </div>
    </section>
  );
}
