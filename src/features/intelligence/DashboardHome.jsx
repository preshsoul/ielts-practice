import React, { Component, useEffect, useState } from "react";

/** Tiny error boundary so one new card can't crash the whole dashboard. */
class CardErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return null;
    return this.props.children;
  }
}
import { Link } from "react-router-dom";
import { rankScholarships } from "../../services/scoringEngine.js";
import { buildDashboardSnapshot } from "../../lib/dashboard.js";
import { buildNotificationFeed } from "../../lib/notifications.js";
import { useWorkspace } from "../../components/layout/WorkspaceContext.jsx";
import { getLatestScholarshipFeed } from "../../lib/scholarshipFeed.js";
import { getOnboardingStatus } from "../../lib/onboardingJourney.js";
import DailyChallengeCard from "../practice/DailyChallengeCard.jsx";
import StudyCoachCard from "../coach/StudyCoachCard.jsx";
import ScholarshipBridgeSummary from "../coach/ScholarshipBridgeSummary.jsx";
import TimeToTargetWidget from "../coach/TimeToTargetWidget.jsx";
import { useFeatureGate } from "../../hooks/useFeatureGate.js";
import { analyzeBridge, estimateTimeToTarget } from "../../lib/bridgeService.js";
import { generateDailyActions } from "../../lib/studyCoachEngine.js";
import { estimateOverallBand } from "../../lib/bandScoreEstimator.js";

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

function getScholarshipTitle(scholarship) {
  return scholarship?.name || scholarship?.title || scholarship?.awardingBody || "Scholarship";
}

function getScholarshipProvider(scholarship) {
  return scholarship?.awardingBody || scholarship?.sourceLabel || scholarship?.provider || "Funding body";
}

function getScholarshipDeadline(scholarship) {
  if (!scholarship?.deadline) return "Open";
  const date = new Date(scholarship.deadline);
  if (Number.isNaN(date.getTime())) return "Open";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatScore(skills) {
  const values = ["reading", "listening", "writing", "speaking"]
    .map((key) => Number(skills?.[key]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return "Not added";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return average.toFixed(1);
}

function ReadinessDial({ percent, label, caption }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="dashboard-dial">
      <div
        className="dashboard-dial__ring"
        style={{ background: `conic-gradient(var(--color-interactive-primary) ${safePercent}%, rgba(23, 25, 33, 0.08) ${safePercent}% 100%)` }}
        aria-hidden="true"
      >
        <div className="dashboard-dial__hole">
          <div className="dashboard-dial__value">{safePercent}%</div>
          <div className="dashboard-dial__label">{label}</div>
        </div>
      </div>
      {caption && <div className="dashboard-dial__caption">{caption}</div>}
    </div>
  );
}

export default function DashboardHome({ profile, sessions, contentManifest, notifications, scholarships = [], scholarshipCatalog = [] }) {
  const { openIntelPanel } = useWorkspace();
  const snapshot = buildDashboardSnapshot(profile || {}, sessions || []);
  const feed = buildNotificationFeed({ profile: profile || {}, sessions: sessions || [], contentManifest, contentNotifications: notifications || [] });
  const catalog = Array.isArray(scholarshipCatalog) ? scholarshipCatalog : [];
  const rankedScholarships = rankScholarships(catalog, profile || {}, { limit: 5 });
  const gate = useFeatureGate(profile);

  // Bridge + Coach analysis (Pro/Premium only)
  const bandsForBridge = estimateOverallBand(sessions || []);
  const bridgeAnalysis = gate.isPro && rankedScholarships?.scored?.length
    ? analyzeBridge(rankedScholarships.scored, bandsForBridge, profile || {})
    : null;
  const timeProjection = gate.isPro
    ? estimateTimeToTarget(bandsForBridge, snapshot.targetBand, sessions || [])
    : null;
  const dailyActions = gate.isPro
    ? generateDailyActions(snapshot, bridgeAnalysis, null, profile || {}, sessions || [])
    : [];

  const targetBand = snapshot.targetBand ? Number(snapshot.targetBand).toFixed(1) : "Set one";
  const testDate = profile?.test_date || profile?.testDate || null;
  const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";
  const onboardingStatus = getOnboardingStatus(profile || {});
  const onboardingMissing = onboardingStatus.shouldRedirect;
  const nextTask = onboardingMissing
    ? `Complete onboarding${onboardingStatus.nextLabel ? `: ${onboardingStatus.nextLabel}` : ""}`
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
  const latestScholarships = getLatestScholarshipFeed(Array.isArray(scholarshipCatalog) ? scholarshipCatalog : [], {
    limit: 4,
    referenceDate: contentManifest?.updated_at || new Date(),
    recentDays: 10,
  });
  const topMatch = rankedScholarships.scored.find(({ analysis }) => !analysis.blocked)?.scholarship
    || rankedScholarships.scored[0]?.scholarship
    || latestScholarships[0]
    || null;
  const topMatchAnalysis = rankedScholarships.scored.find(({ scholarship }) => scholarship?.id === topMatch?.id)?.analysis || null;
  const activeSignals = [
    { label: "Profile ready", value: `${completionPercent}%`, note: `${completionFilled} of ${profileFields.length} fields filled` },
    { label: "IELTS", value: formatScore(snapshot.skillBands), note: `${averageText} across current bands` },
    { label: "Next move", value: snapshot.nextTask || "Set a goal", note: countdownText },
  ];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setAnimatedPercent(completionPercent));
    return () => window.cancelAnimationFrame(frame);
  }, [completionPercent]);

  const progressAccent = completionPercent >= 80
    ? "linear-gradient(90deg, var(--color-interactive-primary-hover), var(--color-status-info))"
    : "linear-gradient(90deg, var(--color-interactive-primary-soft), var(--color-interactive-primary))";

  return (
    <section className="dashboard-page">
      <div className="layout-grid dashboard-wireframe-grid" style={{ ["--grid-cols"]: 12, ["--grid-gap"]: "24px" }}>
        <article className="dashboard-readiness-hero dashboard-span-8">
          <div className="dashboard-readiness-hero__top">
            <div>
              <div className="dashboard-readiness-hero__kicker">Quarterly Assessment</div>
              <h1 className="dashboard-readiness-hero__title">Readiness Verdict</h1>
            </div>
            <div className="dashboard-readiness-hero__score-row">
              <span className="dashboard-readiness-hero__score">{completionPercent}</span>
              <span className="dashboard-readiness-hero__score-denom">/100</span>
            </div>
          </div>

          <div className="dashboard-readiness-hero__badges">
            <span className="dashboard-readiness-hero__tier">
              {completionPercent >= 80 ? "Elite standing" : completionPercent >= 60 ? "Progressing" : "Getting started"}
            </span>
            {snapshot.streakDays > 0 && (
              <span className="dashboard-readiness-hero__trend">↑ {snapshot.streakDays}-day streak</span>
            )}
          </div>

          <p className="dashboard-readiness-hero__intro">
            Loci tracks your IELTS trajectory, surfaces relevant scholarships, and sharpens your matching score as your profile grows. The three steps below unlock the full intelligence layer.
          </p>

          <div className="dashboard-readiness-hero__steps">
            <div className={`dashboard-readiness-hero__step${profile?.target_band ? " is-done" : ""}`}>
              <span className="dashboard-readiness-hero__step-num">01</span>
              <div>
                <div className="dashboard-readiness-hero__step-title">Set your target band</div>
                <div className="dashboard-readiness-hero__step-copy">Tell Loci the band score you are working toward so the relevance engine can calibrate every recommendation to your goal.</div>
              </div>
            </div>
            <div className={`dashboard-readiness-hero__step${snapshot.totalSessions > 0 ? " is-done" : ""}`}>
              <span className="dashboard-readiness-hero__step-num">02</span>
              <div>
                <div className="dashboard-readiness-hero__step-title">Complete a practice session</div>
                <div className="dashboard-readiness-hero__step-copy">A single session establishes your baseline across reading, listening, writing, and speaking — giving Loci real data to work with.</div>
              </div>
            </div>
            <div className={`dashboard-readiness-hero__step${scholarships.length > 0 ? " is-done" : ""}`}>
              <span className="dashboard-readiness-hero__step-num">03</span>
              <div>
                <div className="dashboard-readiness-hero__step-title">Review your matched scholarships</div>
                <div className="dashboard-readiness-hero__step-copy">Loci ranks every scholarship by how well it fits your profile, language level, and deadlines — so you spend time on the ones that count.</div>
              </div>
            </div>
          </div>

          <div className="dashboard-readiness-hero__actions">
            <Link className="dashboard-readiness-hero__btn-primary link-button" to={onboardingMissing ? "/onboarding" : "/practice"}>
              {onboardingMissing ? "Continue onboarding" : "Start practice"}
            </Link>
            <Link className="dashboard-readiness-hero__btn-ghost link-button" to={onboardingMissing ? "/onboarding" : "/account"}>
              {onboardingMissing ? "Review setup" : "Complete profile"}
            </Link>
            <Link className="dashboard-readiness-hero__btn-ghost link-button" to="/scholarships">See scholarships</Link>
          </div>
        </article>

        <aside className="dashboard-rail dashboard-span-4">
          <div className="loci-card loci-card--utilitarian dashboard-rail-card">
            <div className="dashboard-kicker">Profile readiness</div>
            <ReadinessDial
              percent={completionPercent}
              label="READINESS SCORE"
              caption={`${completionFilled} of ${profileFields.length} fields complete`}
            />
            <div className="dashboard-progress-track dashboard-progress-track--wireframe" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={profileFields.length} aria-valuenow={completionFilled}>
              <div className="dashboard-progress-fill" style={{ width: `${animatedPercent}%`, background: progressAccent }} />
            </div>
            <div className="dashboard-progress-footer">
              <span>{completionPercent >= 80 ? "Ready for matching" : "Still sharpening"}</span>
              <span>{averageText}</span>
            </div>
          </div>

          <div className="loci-card loci-card--utilitarian dashboard-rail-card dashboard-rail-card--dark">
            <div className="dashboard-kicker">Active signals</div>
            <div className="dashboard-signal-list">
              {activeSignals.map((signal) => (
                <div key={signal.label} className="dashboard-signal-item">
                  <div>
                    <div className="dashboard-signal-label">{signal.label}</div>
                    <div className="dashboard-signal-note">{signal.note}</div>
                  </div>
                  <strong className="dashboard-signal-value">{signal.value}</strong>
                </div>
              ))}
            </div>
            <div className="dashboard-source-list">
              <span>Sources</span>
              <ul>
                <li>CHEVENING_GOV_UK</li>
                <li>BRITISH_COUNCIL_ORG</li>
                <li>COMMONWEALTH TRUST</li>
              </ul>
            </div>
          </div>
        </aside>

        <article className="loci-card loci-card--editorial dashboard-feature-card dashboard-span-6">
          <div className="dashboard-kicker">Top match</div>
          <div className="dashboard-feature-title">{topMatch ? getScholarshipTitle(topMatch) : "No match yet"}</div>
          <div className="dashboard-feature-copy">
            {topMatch
              ? `${getScholarshipProvider(topMatch)} · Deadline ${getScholarshipDeadline(topMatch)}`
              : "Complete your profile to surface the strongest scholarship match."}
          </div>
          {topMatch && (
            <>
              <div className="dashboard-feature-summary">
                {topMatchAnalysis?.score ? `${topMatchAnalysis.score}/100 fit` : "A close match for your current profile"}
              </div>
              <div className="dashboard-feature-actions">
                <Link className="primary-btn link-button" to="/scholarships">Open matches</Link>
                <button
                  type="button"
                  className="ghost-btn link-button"
                  onClick={() => openIntelPanel({
                    eyebrow: "Why this match",
                    title: getScholarshipTitle(topMatch),
                    summary: topMatchAnalysis?.score ? `${topMatchAnalysis.score}/100 fit` : "One of the closest matches in the current catalog.",
                    details: topMatchAnalysis?.analysisText || "This opportunity lines up with your profile and current deadline window.",
                    metrics: [
                      { label: "Provider", value: getScholarshipProvider(topMatch) },
                      { label: "Deadline", value: getScholarshipDeadline(topMatch) },
                      { label: "Confidence", value: `${Math.round((topMatchAnalysis?.provenanceConfidence || 0) * 100)}%` },
                    ],
                  })}
                >
                  Why chosen
                </button>
              </div>
            </>
          )}
        </article>

        <article className="loci-card loci-card--editorial dashboard-feature-card dashboard-span-6">
          <div className="dashboard-kicker">AI Reading Generator</div>
          <div className="dashboard-feature-title">Generate passages at your level</div>
          <div className="dashboard-feature-copy">
            Get custom IELTS reading passages calibrated to your target band with auto-generated questions.
          </div>
          <div className="dashboard-feature-actions">
            <Link className="primary-btn link-button" to="/practice/adaptive-reading" style={{ textDecoration: "none" }}>Open Adaptive Reading</Link>
          </div>
        </article>

        <article className="loci-card loci-card--editorial dashboard-feature-card dashboard-span-6">
          <CardErrorBoundary>
            <DailyChallengeCard sessions={sessions} />
          </CardErrorBoundary>
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-intelligence-card dashboard-span-7">
          <div className="dashboard-kicker">The intelligence layer</div>
          <div className="dashboard-intelligence-grid">
            <div>
              <h2 className="dashboard-intelligence-title">Loci aggregates the signals that matter.</h2>
              <p className="dashboard-intelligence-copy">
                Candidate profile, IELTS performance, deadline urgency, and live scholarship freshness combine into a single ranked view.
              </p>
            </div>
            <div className="dashboard-map-card">
              <div className="dashboard-map-card__frame">
                <div className="dashboard-map-card__dot dashboard-map-card__dot--one" />
                <div className="dashboard-map-card__dot dashboard-map-card__dot--two" />
                <div className="dashboard-map-card__dot dashboard-map-card__dot--three" />
                <div className="dashboard-map-card__glow" />
              </div>
              <div className="dashboard-map-card__meta">
                <span>Confidence</span>
                <strong>High</strong>
                <span>Visibility</span>
                <strong>Global</strong>
              </div>
            </div>
          </div>
          <div className="dashboard-intelligence-metrics">
            <DashboardStat icon={<StatIcon type="target" />} label="Target band" value={targetBand} note="The destination band you are working toward." />
            <DashboardStat icon={<StatIcon type="streak" />} label="Practice streak" value={`${snapshot.streakDays} day${snapshot.streakDays === 1 ? "" : "s"}`} note="Momentum is visible here." />
            <DashboardStat icon={<StatIcon type="baseline" />} label="Baseline status" value={averageText} note="A quick read on current level." />
            <DashboardStat icon={<StatIcon type="balance" />} label="Weakest focus" value={snapshot.weakestSkill} note="The next session should attack this first." />
          </div>
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-intelligence-card dashboard-span-5">
          <CardErrorBoundary>
            <TimeToTargetWidget projection={timeProjection} isPro={gate.isPro} />
          </CardErrorBoundary>
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-mini-grid dashboard-span-5">
          <div className="dashboard-kicker">Band snapshot</div>
          <div className="skills-grid">
            <SkillCard label="Reading" value={snapshot.skillBands.reading} />
            <SkillCard label="Listening" value={snapshot.skillBands.listening} />
            <SkillCard label="Writing" value={snapshot.skillBands.writing} />
            <SkillCard label="Speaking" value={snapshot.skillBands.speaking} />
          </div>
        </article>

        <article className="loci-card loci-card--editorial dashboard-feature-card dashboard-span-5">
          <CardErrorBoundary>
            <StudyCoachCard actions={dailyActions} isPro={gate.isPro} snapshot={snapshot} />
          </CardErrorBoundary>
        </article>

        <article className="loci-card loci-card--editorial dashboard-feature-card dashboard-span-5">
          <CardErrorBoundary>
            <ScholarshipBridgeSummary bridgeAnalysis={bridgeAnalysis} isPro={gate.isPro} />
          </CardErrorBoundary>
        </article>

        <article className="loci-card loci-card--utilitarian dashboard-alerts dashboard-span-full">
          <div className="dashboard-kicker">Alerts</div>
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

        <article className="loci-card loci-card--editorial dashboard-scholarship-feed dashboard-span-full">
          <div className="dashboard-kicker">Latest scholarships</div>
          <div className="dashboard-feature-title">Fresh additions this week</div>
          <div className="dashboard-feature-copy">
            New scholarship opportunities appear here first, while the dedicated scholarship workspace stays focused on your own matches.
          </div>
          <div className="dashboard-scholarship-list">
            {latestScholarships.length ? latestScholarships.map((item) => (
              <div key={item.id} className="dashboard-scholarship-item">
                <div className="dashboard-scholarship-item__body">
                  <div className="dashboard-scholarship-item__source">{item.sourceLabel}</div>
                  <div className="dashboard-scholarship-item__title">{item.title}</div>
                  <div className="dashboard-scholarship-item__meta">{item.locationLabel}</div>
                  <div className="dashboard-scholarship-item__requirements">
                    <strong>Requirements:</strong> {item.requirementsSummary}
                  </div>
                </div>
                <Link className="ghost-btn link-button" to="/scholarships/weekly" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
                  Weekly feed
                </Link>
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
