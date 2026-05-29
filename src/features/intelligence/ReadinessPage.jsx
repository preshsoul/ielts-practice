import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { rankScholarships } from "../../services/scoringEngine.js";
import { getProfileCompletion } from "../../lib/profileCompletion.js";

const MODULES = ["reading", "listening", "writing", "speaking"];

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function getBand(profile, module) {
  return profile?.languageTests?.ieltsBands?.[module] ?? profile?.self_assessment?.[module] ?? profile?.selfAssessment?.[module] ?? "";
}

function getReadiness(profile = {}, ranked = []) {
  const completion = getProfileCompletion(profile);
  const bands = MODULES.map((module) => Number(getBand(profile, module))).filter((value) => Number.isFinite(value) && value > 0);
  const bandScore = bands.length ? (bands.reduce((sum, value) => sum + value, 0) / bands.length / 9) * 100 : 0;
  const matchScore = ranked.length ? Math.max(...ranked.slice(0, 5).map(({ analysis }) => Number(analysis?.score || 0))) : 0;
  return Math.round(Math.min(96, completion.percent * 0.42 + bandScore * 0.28 + matchScore * 0.3));
}

function buildBlockers(profile = {}, ranked = []) {
  const blockers = [];
  const add = (key, title, detail, impact, to) => blockers.push({ key, title, detail, impact, to });

  if (!hasValue(profile?.identity?.nationality)) {
    add("nationality", "Nationality is missing", "Blocks country-specific eligibility checks and weakens scholarship filtering.", 86, "/account");
  }
  if (!hasValue(profile?.academic?.degreeClass)) {
    add("degree", "Degree class is not verified", "Many UK funding bodies require a First Class or 2:1 baseline.", 82, "/account");
  }
  if (!hasValue(profile?.academic?.discipline)) {
    add("discipline", "Academic discipline is missing", "Loci cannot compare your field against target programmes confidently.", 74, "/account");
  }
  if (!hasValue(profile?.targetDegreeLevel)) {
    add("level", "Target degree level is not selected", "Master's and PhD funding routes rank differently.", 64, "/onboarding");
  }

  const missingBands = MODULES.filter((module) => !hasValue(getBand(profile, module)));
  if (missingBands.length) {
    add("ielts", "IELTS band profile is incomplete", `${missingBands.map((item) => item[0].toUpperCase() + item.slice(1)).join(", ")} still needs a baseline.`, 78, "/practice");
  }

  const topGaps = ranked
    .flatMap(({ analysis }) => Array.isArray(analysis?.blockedReasons) ? analysis.blockedReasons : [])
    .slice(0, 2);
  topGaps.forEach((gap, index) => {
    add(`match-gap-${index}`, "Top-match blocker detected", gap, 70 - index * 8, "/scholarships");
  });

  return blockers.sort((a, b) => b.impact - a.impact).slice(0, 7);
}

function getTopTitle(item) {
  return item?.scholarship?.name || item?.scholarship?.title || item?.scholarship?.awardingBody || "Scholarship";
}

export default function ReadinessPage({ profile, sessions, scholarshipCatalog = [] }) {
  const ranked = useMemo(() => {
    const catalog = Array.isArray(scholarshipCatalog) ? scholarshipCatalog : [];
    return rankScholarships(catalog, profile || {}, { limit: 8 }).scored || [];
  }, [profile, scholarshipCatalog]);
  const blockers = useMemo(() => buildBlockers(profile || {}, ranked), [profile, ranked]);
  const readiness = getReadiness(profile || {}, ranked);
  const sessionCount = Array.isArray(sessions) ? sessions.length : 0;

  return (
    <div className="readiness-page">
      <section className="readiness-hero">
        <div>
          <p className="readiness-kicker">Readiness Diagnostic</p>
          <h1>What stands between you and a credible application?</h1>
          <span>{blockers.length ? "Resolve these in order; each item is ranked by likely scoring impact." : "No major blocker detected. Keep sharpening your match evidence."}</span>
        </div>
        <div className="readiness-score-card">
          <strong>{readiness}%</strong>
          <span>Application readiness</span>
        </div>
      </section>

      <section className="readiness-grid">
        <div className="readiness-main-list">
          <div className="readiness-section-title">Priority Blockers</div>
          {blockers.length ? blockers.map((blocker, index) => (
            <article key={blocker.key} className="readiness-blocker">
              <div className="readiness-blocker-rank">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <h2>{blocker.title}</h2>
                <p>{blocker.detail}</p>
              </div>
              <div className="readiness-impact">{blocker.impact}</div>
              <Link to={blocker.to}>Resolve</Link>
            </article>
          )) : (
            <article className="readiness-blocker">
              <div className="readiness-blocker-rank">OK</div>
              <div>
                <h2>No critical blocker detected</h2>
                <p>Your core profile is strong enough for matching. Review top opportunities and keep evidence current.</p>
              </div>
              <Link to="/scholarships">Review matches</Link>
            </article>
          )}
        </div>

        <aside className="readiness-side">
          <div className="readiness-section-title">Live Signals</div>
          <div className="readiness-signal">
            <span>Practice sessions</span>
            <strong>{sessionCount}</strong>
          </div>
          <div className="readiness-signal">
            <span>Top match</span>
            <strong>{ranked[0] ? `${Math.round(ranked[0].analysis?.score || 0)}%` : "Pending"}</strong>
            <p>{ranked[0] ? getTopTitle(ranked[0]) : "Load scholarship catalog to score matches."}</p>
          </div>
          <div className="readiness-signal is-dark">
            <span>Next system action</span>
            <strong>{blockers[0] ? "Clear blocker" : "Shortlist"}</strong>
            <p>{blockers[0]?.title || "Move your strongest matches into the application tracker."}</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
