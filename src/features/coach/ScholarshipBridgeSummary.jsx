import React from "react";
import { Link } from "react-router-dom";
import LociCard from "../../components/common/LociCard.jsx";

export default function ScholarshipBridgeSummary({ bridgeAnalysis = null, isLoading = false, isPro = false }) {
  // ── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <LociCard variant="editorial" eyebrow="IELTS → Scholarship Bridge" title="Connecting your score to opportunities">
        <div style={{ padding: "8px 0" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <div style={{ width: 40, height: 14, background: "var(--color-surface-2, #e5e1d9)", borderRadius: "4px" }} />
              <div style={{ flex: 1, height: 10, background: "var(--color-surface-2, #e5e1d9)", borderRadius: "4px" }} />
            </div>
          ))}
        </div>
      </LociCard>
    );
  }

  // ── Pro gate ──────────────────────────────────────────────────────────
  if (!isPro) {
    return (
      <LociCard
        variant="editorial"
        eyebrow="IELTS → Scholarship Bridge"
        title="Unlock scholarship matching"
        copy="See how your IELTS practice connects to scholarship eligibility. Pro feature."
        action={
          <Link className="primary-btn link-button" to="/account" style={{ textDecoration: "none" }}>
            Upgrade to Pro
          </Link>
        }
      />
    );
  }

  // ── No data state ─────────────────────────────────────────────────────
  if (!bridgeAnalysis || bridgeAnalysis.totalScholarships === 0) {
    return (
      <LociCard variant="editorial" eyebrow="IELTS → Scholarship Bridge" title="Connecting your score to opportunities">
        <div style={{ fontSize: 13, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", padding: "12px 0" }}>
          Complete practice sessions to see how your IELTS score connects to scholarship eligibility.
        </div>
        <Link className="primary-btn link-button" to="/practice" style={{ textDecoration: "none", marginTop: 8, display: "inline-block" }}>
          Start practicing
        </Link>
      </LociCard>
    );
  }

  // ── Populated state ───────────────────────────────────────────────────
  const { eligibleNowCount, nearMissCount, eligibleWithImprovement, totalScholarships, currentOverallBand, targetBand, biggestGapModule } = bridgeAnalysis;

  return (
    <LociCard variant="editorial" eyebrow="IELTS → Scholarship Bridge" title="Your score unlocks opportunities">
      {/* Main stat */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 48,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          fontFamily: "var(--font-serif, monospace)",
          color: "var(--color-accent, #7c3aed)",
        }}>
          {eligibleNowCount}
          <span style={{ fontSize: 18, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)" }}>
            {" "}/{" "}{totalScholarships}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", marginTop: 4 }}>
          scholarships you're currently eligible for
          {currentOverallBand !== null && ` at Band ${currentOverallBand.toFixed(1)}`}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        {targetBand !== null && eligibleWithImprovement > eligibleNowCount && (
          <div style={{
            padding: "10px 12px",
            background: "var(--green-bg, #f0fdf4)",
            border: "1px solid var(--green, #16a34a)22",
            borderRadius: "8px",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--green, #16a34a)", fontFamily: "var(--font-serif, monospace)" }}>
              +{eligibleWithImprovement - eligibleNowCount}
            </div>
            <div style={{ fontSize: 10, color: "var(--green, #16a34a)", fontFamily: "var(--font-ui)", lineHeight: 1.4 }}>
              unlock at Band {targetBand.toFixed(1)}
            </div>
          </div>
        )}

        {nearMissCount > 0 && (
          <div style={{
            padding: "10px 12px",
            background: "var(--color-status-warning-soft, #fffbeb)",
            border: "1px solid var(--color-status-warning, #d97706)22",
            borderRadius: "8px",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-status-warning, #d97706)", fontFamily: "var(--font-serif, monospace)" }}>
              {nearMissCount}
            </div>
            <div style={{ fontSize: 10, color: "var(--color-status-warning, #d97706)", fontFamily: "var(--font-ui)", lineHeight: 1.4 }}>
              near miss (&lt;0.5 band away)
            </div>
          </div>
        )}

        {biggestGapModule && (
          <div style={{
            padding: "10px 12px",
            background: "var(--color-surface-1, #f8f6f0)",
            border: "1px solid var(--color-border, #e0dcd3)",
            borderRadius: "8px",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text, #171512)", fontFamily: "var(--font-serif, monospace)", textTransform: "capitalize" }}>
              {biggestGapModule}
            </div>
            <div style={{ fontSize: 10, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", lineHeight: 1.4 }}>
              biggest gap to close
            </div>
          </div>
        )}
      </div>

      <Link to="/scholarships/ielts-bridge" style={{
        fontSize: 13,
        color: "var(--color-accent, #7c3aed)",
        fontFamily: "var(--font-ui)",
        fontWeight: 500,
        textDecoration: "none",
      }}>
        View full bridge analysis →
      </Link>
    </LociCard>
  );
}
