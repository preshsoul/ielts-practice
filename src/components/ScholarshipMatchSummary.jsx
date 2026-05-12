import React from "react";
import LociCard from "./common/LociCard.jsx";
import { buildProfileKeywords } from "../services/scoringEngine.js";
import { buildPlainMatchReasons, formatIeltsBands, formatIeltsScore } from "../lib/opportunitySignals.js";

export default function ScholarshipMatchSummary({ profile, scored = [], shortlist = [], C, Chip }) {
  const profileKeywords = buildProfileKeywords(profile || {});
  const topFit = scored[0];
  const savedCount = shortlist.length;
  const topScholarship = topFit?.scholarship || topFit?.inst || null;
  const topScore = topFit?.analysis?.score ?? 0;
  const topConfidence = topFit?.analysis?.provenanceConfidence ?? 0;
  const ieltsSummary = formatIeltsScore(profile || {}) || "IELTS not added";
  const ieltsBands = formatIeltsBands(profile || {});
  const topMatchReasons = topFit
    ? buildPlainMatchReasons({
        analysis: topFit.analysis,
        profile,
        scholarship: topScholarship,
      })
    : [];
  const topMatches = scored.slice(0, 3);

  return (
    <div className="scholarship-sidebar">
      <LociCard
        variant="utilitarian"
        tone="surface"
        eyebrow="Top matches"
        title="Top matches and why they were chosen"
        copy="We compare your CV, IELTS score, degree class, discipline, destination goals, deadline pressure, and how trustworthy the source looks."
        className="scholarship-sidebar-card scholarship-sidebar-primary"
      >
        <div className="scholarship-sidebar-chips">
          {profileKeywords.length > 0
            ? profileKeywords.slice(0, 6).map((keyword) => <Chip key={keyword} label={keyword} color={C.accent} small />)
            : <span className="scholarship-sidebar-muted">Add the missing profile fields to compare more scholarships.</span>}
        </div>
      </LociCard>

      <LociCard
        variant="utilitarian"
        tone="default"
        eyebrow="At a glance"
        title={topScholarship ? `${topScholarship.name || topScholarship.title} · ${topScore}/100` : "No matches yet"}
        copy={`Your current IELTS status: ${ieltsSummary}${ieltsBands ? ` (${ieltsBands})` : ""}. Saved items, urgency, and confidence are shown below.`}
        className="scholarship-sidebar-card scholarship-sidebar-stats"
      >
        <div className="scholarship-sidebar-stats-grid">
          <div className="scholarship-sidebar-stat">
            <span className="scholarship-sidebar-stat-label">Best matches</span>
            <span className="scholarship-sidebar-stat-value">{Math.min(3, scored.length)}</span>
          </div>
          <div className="scholarship-sidebar-stat">
            <span className="scholarship-sidebar-stat-label">IELTS</span>
            <span className="scholarship-sidebar-stat-value">{ieltsSummary}</span>
          </div>
          <div className="scholarship-sidebar-stat">
            <span className="scholarship-sidebar-stat-label">Confidence</span>
            <span className="scholarship-sidebar-stat-value">{Math.round(topConfidence * 100)}%</span>
          </div>
          <div className="scholarship-sidebar-stat scholarship-sidebar-stat--wide">
            <span className="scholarship-sidebar-stat-label">Saved</span>
            <span className="scholarship-sidebar-stat-value">{savedCount}</span>
          </div>
          <div className="scholarship-sidebar-stat scholarship-sidebar-stat--wide">
            <span className="scholarship-sidebar-stat-label">CV match</span>
            <span className="scholarship-sidebar-stat-value">CV + IELTS + opportunity details</span>
          </div>
        </div>
      </LociCard>

      <LociCard
        variant="utilitarian"
        tone="surface"
        eyebrow="Why chosen"
        title={topScholarship ? "Why this match is near the top" : "How the shortlist is explained"}
        copy={topMatchReasons.length > 0 ? topMatchReasons.join(" ") : "Add more profile details to get clearer reasons for each match."}
        className="scholarship-sidebar-card scholarship-sidebar-footer"
      />

      {topMatches.length > 0 && (
        <LociCard
          variant="utilitarian"
          tone="default"
          eyebrow="Shortlist"
          title="Your best three matches"
          copy="These are the opportunities that fit your profile most closely right now."
          className="scholarship-sidebar-card scholarship-sidebar-footer"
        >
          <div style={{ display: "grid", gap: 12 }}>
            {topMatches.map(({ scholarship, analysis }) => {
              const reasons = buildPlainMatchReasons({
                analysis,
                profile,
                scholarship,
              });
              return (
                <div key={scholarship.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--color-bg-surface)" }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{scholarship.name || scholarship.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>{analysis.score}/100 fit</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {reasons.slice(0, 3).map((reason) => (
                      <div key={reason} style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>{reason}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </LociCard>
      )}
    </div>
  );
}
