import { useState } from "react";
import { formatCriterionStatus, buildFixSuggestion, getCriterionDisplayName } from "../../lib/matchBreakdownFormatter.js";
import SvgIcon from "../../components/SvgIcon.jsx";

/**
 * MatchBreakdownPanel
 *
 * Collapsible panel showing per-criterion match analysis from the scoring engine.
 * Displays each criterion with status icon (passed/partial/failed), score bar,
 * reason text, and actionable fix suggestions for failed criteria.
 *
 * Props:
 *   analysis   - the full return object from scoreScholarship()
 *   profile    - the user's normalized profile
 *   compact    - if true, render a condensed version for result cards
 */
export default function MatchBreakdownPanel({ analysis = null, profile = null, compact = false }) {
  const [expanded, setExpanded] = useState(false);

  if (!analysis || !Array.isArray(analysis.criteria) || analysis.criteria.length === 0) {
    return null;
  }

  const { criteria, blocked, blockedReasons = [], matchStatus, score } = analysis;
  const earnedCount = criteria.filter((c) => c.max > 0 && c.score / c.max >= 0.8).length;
  const totalCount = criteria.length;

  const statusBadge = blocked
    ? { text: "Blocked", color: "var(--c-red)" }
    : matchStatus === "eligible"
      ? { text: "Eligible", color: "var(--c-green)" }
      : matchStatus === "provisional"
        ? { text: "Provisional", color: "var(--c-amber)" }
        : { text: "Possible", color: "var(--c-muted)" };

  const displayCriteria = filterDisplayCriteria(criteria);

  if (compact && !expanded) {
    return (
      <div className="match-breakdown match-breakdown--compact">
        <button
          className="match-breakdown__toggle"
          onClick={() => setExpanded(true)}
          aria-expanded="false"
        >
          <span className="match-breakdown__toggle-icon"><SvgIcon name="clipboard" size={14} /></span>
          <span className="match-breakdown__toggle-label">
            Match breakdown ({earnedCount}/{totalCount} criteria met)
          </span>
          <span
            className="match-breakdown__status-badge"
            style={{ background: statusBadge.color }}
          >
            {statusBadge.text}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`match-breakdown ${compact ? "match-breakdown--compact" : ""}`}>
      <div className="match-breakdown__header">
        <h4 className="match-breakdown__title">
          Match Breakdown — {earnedCount}/{totalCount} criteria met
        </h4>
        <span
          className="match-breakdown__status-badge"
          style={{ background: statusBadge.color }}
        >
          {statusBadge.text}
        </span>
        {compact && (
          <button
            className="match-breakdown__close"
            onClick={() => setExpanded(false)}
            aria-label="Collapse breakdown"
          >
            ▲
          </button>
        )}
      </div>

      {blocked && blockedReasons.length > 0 && (
        <div className="match-breakdown__blocked">
          <strong><SvgIcon name="warn" size={14} color="var(--c-red)" /> Blocked:</strong> {blockedReasons.join("; ")}
        </div>
      )}

      <ul className="match-breakdown__criteria-list">
        {displayCriteria.map((criterion) => {
          const status = formatCriterionStatus(criterion);
          const ratio = criterion.max > 0 ? Math.round((criterion.score / criterion.max) * 100) : 0;
          const fixSuggestion = !blocked && ratio < 50 ? buildFixSuggestion(criterion, profile) : null;
          const displayName = getCriterionDisplayName(criterion.key);

          return (
            <li
              key={criterion.key}
              className={`match-breakdown__criterion match-breakdown__criterion--${status.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="match-breakdown__criterion-row">
                <span className="match-breakdown__criterion-icon" style={{ color: status.color }}>
                  <SvgIcon name={status.icon} size={14} color={status.color} />
                </span>
                <span className="match-breakdown__criterion-label">{displayName}</span>
                <span className="match-breakdown__criterion-score" style={{ color: status.color }}>
                  {ratio}%
                </span>
                <div className="match-breakdown__criterion-bar">
                  <div
                    className="match-breakdown__criterion-bar-fill"
                    style={{ width: `${ratio}%`, background: status.color }}
                  />
                </div>
              </div>
              {criterion.reason && (
                <p className="match-breakdown__criterion-reason">{criterion.reason}</p>
              )}
              {fixSuggestion && (
                <p className="match-breakdown__criterion-fix">{fixSuggestion}</p>
              )}
            </li>
          );
        })}
      </ul>

      {analysis.eligibilityExplanation && (
        <div className="match-breakdown__summary">
          <p className="match-breakdown__summary-text">{analysis.eligibilityExplanation.summary || analysis.eligibilityExplanation}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Filter and deduplicate the criteria list for display.
 * Removes engagement criteria when score is zero (no engagement).
 * Sorts: failed first, then partial, then passed.
 */
function filterDisplayCriteria(criteria) {
  const filtered = criteria.filter((c) => {
    // Hide engagement with zero score
    if (c.key === "engagement" && c.score === 0) return false;
    // Keep semantic even with low score — it's informative
    return true;
  });

  // Sort: failed (lowest ratio) first
  return [...filtered].sort((a, b) => {
    const ratioA = a.max > 0 ? a.score / a.max : 0;
    const ratioB = b.max > 0 ? b.score / b.max : 0;
    return ratioA - ratioB;
  });
}
