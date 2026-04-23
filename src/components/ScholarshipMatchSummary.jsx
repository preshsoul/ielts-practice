import React from "react";
import { buildProfileKeywords } from "../services/scoringEngine.js";

export default function ScholarshipMatchSummary({ profile, scored = [], shortlist = [], C, Chip }) {
  const profileKeywords = buildProfileKeywords(profile || {});
  const topFit = scored[0];
  const urgentCount = scored.filter(({ analysis }) => analysis.criteria.some((criterion) => criterion.key === "urgency" && criterion.score >= 8)).length;
  const savedCount = shortlist.length;

  return (
    <div className="scholarship-sidebar">
      <div className="scholarship-sidebar-card scholarship-sidebar-primary">
        <div className="scholarship-card-label">Profile-scored matching</div>
        <div className="scholarship-sidebar-title">Structured data drives ranking.</div>
        <div className="scholarship-sidebar-copy">
          The model scores discipline fit, geography, degree class, language readiness, value, urgency, and source confidence.
        </div>
        <div className="scholarship-sidebar-chips">
          {profileKeywords.length > 0
            ? profileKeywords.slice(0, 6).map((keyword) => <Chip key={keyword} label={keyword} color={C.accent} small />)
            : <span className="scholarship-sidebar-muted">Complete your profile to unlock stronger matching signals.</span>}
        </div>
      </div>

      <div className="scholarship-sidebar-card scholarship-sidebar-stats">
        <div className="scholarship-sidebar-stat">
          <span className="scholarship-sidebar-stat-label">Top fit</span>
          <span className="scholarship-sidebar-stat-value">
            {topFit ? `${topFit.inst.name} · ${topFit.analysis.score}/100` : "No matches yet"}
          </span>
        </div>
        <div className="scholarship-sidebar-stat">
          <span className="scholarship-sidebar-stat-label">Urgent</span>
          <span className="scholarship-sidebar-stat-value">{urgentCount}</span>
        </div>
        <div className="scholarship-sidebar-stat">
          <span className="scholarship-sidebar-stat-label">Saved</span>
          <span className="scholarship-sidebar-stat-value">{savedCount}</span>
        </div>
      </div>

      <div className="scholarship-sidebar-card scholarship-sidebar-footer">
        <div className="scholarship-card-label">Why this matters</div>
        <div className="scholarship-sidebar-copy">
          We can explain fit instead of hiding behind a black box, and document parsing can slot into the same profile structure later.
        </div>
      </div>
    </div>
  );
}
