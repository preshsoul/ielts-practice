import React from "react";
import { Link } from "react-router-dom";
import LociCard from "../../components/common/LociCard.jsx";
import { estimateOverallBand } from "../../lib/bandScoreEstimator.js";

const MODULE_LINKS = [
  { to: "/practice/reading", title: "Reading", copy: "Answer one question at a time and keep your reading pace steady." },
  { to: "/practice/listening", title: "Listening", copy: "Catch the correction, then write the answer you can defend." },
  { to: "/practice/writing", title: "Writing", copy: "Plan fast, write clearly, and stay on task from the first sentence." },
  { to: "/practice/speaking", title: "Speaking", copy: "Answer clearly, keep moving, and finish each thought cleanly." },
];

export default function PracticeHub({ sessions, C, PrimaryBtn, profile }) {
  const totalSessions = Array.isArray(sessions) ? sessions.length : 0;
  const estimates = estimateOverallBand(sessions);
  const targetBand = profile?.target_band ?? profile?.targetBand ?? null;
  const showGap = targetBand !== null && estimates.overallBand !== null;

  return (
    <div className="practice-hub">
      <LociCard
        variant="editorial"
        tone="surface"
        eyebrow="Practice"
        title="Choose a module to practice"
        copy="Each module keeps its own prompts, timer logic, and session history."
        className="practice-hub-hero"
      >
        <div className="practice-hub-hero-grid">
          <div className="practice-hub-stats">
            <div className="summary-tile">
              <span>Sessions</span>
              <strong>{totalSessions}</strong>
            </div>
            <div className="summary-tile">
              <span>Est. Band</span>
              <strong>{estimates.overallBand !== null ? estimates.overallBand.toFixed(1) : "-"}</strong>
            </div>
            {showGap && (
              <div className="summary-tile">
                <span>Target → Gap</span>
                <strong style={{ color: estimates.overallBand >= targetBand ? "var(--green, #16a34a)" : "var(--red, #dc2626)" }}>
                  {targetBand.toFixed(1)} → {estimates.overallBand >= targetBand ? "✓" : (targetBand - estimates.overallBand).toFixed(1) + " to go"}
                </strong>
              </div>
            )}
          </div>
          <div className="practice-hub-hero-copy">
            Reading uses the shared question bank. Listening, Writing, and Speaking each use a dedicated practice flow.
            {estimates.confidence === "low" && " Complete more sessions for reliable band estimates."}
          </div>
        </div>
      </LociCard>

      <div className="layout-grid layout-grid--stack">
        {MODULE_LINKS.map((module) => (
          <LociCard
            key={module.to}
            variant="utilitarian"
            eyebrow="Practice module"
            title={module.title}
            copy={module.copy}
            action={<Link className="primary-btn link-button" to={module.to}>Open {module.title}</Link>}
          />
        ))}

        <LociCard
          variant="editorial"
          eyebrow="AI-powered"
          title="Adaptive Reading"
          copy="Generate custom IELTS reading passages at your target band level with auto-generated questions and instant scoring. Pro feature."
          action={<Link className="primary-btn link-button" to="/practice/adaptive-reading" style={{ background: "var(--c-accent, #7c3aed)" }}>Try Adaptive Reading</Link>}
        />

        <LociCard
          variant="editorial"
          eyebrow="Full simulation"
          title="Mock Test"
          copy="Take a full 2h 45m timed IELTS simulation across all 4 modules — Listening, Reading, Writing, and Speaking. Get a complete band score estimate at the end."
          action={<Link className="primary-btn link-button" to="/practice/mock-test" style={{ background: "var(--c-accent, #7c3aed)" }}>Start Mock Test</Link>}
        />
      </div>
    </div>
  );
}
