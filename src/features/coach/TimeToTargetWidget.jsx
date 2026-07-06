import React from "react";
import { Link } from "react-router-dom";
import LociCard from "../../components/common/LociCard.jsx";

export default function TimeToTargetWidget({ projection = null, isLoading = false, isPro = false }) {
  // ── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <LociCard variant="utilitarian" eyebrow="Time to Target">
        <div style={{ padding: "8px 0" }}>
          <div style={{ height: 8, background: "var(--color-surface-2, #e5e1d9)", borderRadius: "4px", width: "100%", marginBottom: 8 }} />
          <div style={{ height: 6, background: "var(--color-surface-2, #e5e1d9)", borderRadius: "3px", width: "60%" }} />
        </div>
      </LociCard>
    );
  }

  // ── Pro gate ──────────────────────────────────────────────────────────
  if (!isPro) {
    return (
      <LociCard variant="utilitarian" eyebrow="Time to Target" title="See your projection">
        <div style={{ fontSize: 12, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", marginBottom: 8 }}>
          Upgrade to Pro to see when you'll reach your target band.
        </div>
      </LociCard>
    );
  }

  // ── No data state ─────────────────────────────────────────────────────
  if (!projection || projection.currentBand === null) {
    return (
      <LociCard variant="utilitarian" eyebrow="Time to Target" title="No projection yet">
        <div style={{ fontSize: 12, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)" }}>
          Complete practice sessions to estimate time to your target band.
        </div>
      </LociCard>
    );
  }

  // ── At target ─────────────────────────────────────────────────────────
  if (projection.atTarget) {
    return (
      <LociCard variant="utilitarian" eyebrow="Time to Target">
        <div style={{ fontSize: 24, fontFamily: "var(--font-serif, monospace)", color: "var(--green, #16a34a)", marginBottom: 4 }}>
          ✓ At Target
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", lineHeight: 1.6 }}>
          You've reached Band {projection.currentBand?.toFixed(1)}. Maintain with weekly review sessions.
        </div>
      </LociCard>
    );
  }

  // ── Projection available ──────────────────────────────────────────────
  const pct = projection.targetBand
    ? Math.min(95, Math.round((projection.currentBand / projection.targetBand) * 100))
    : 0;

  const barColor = projection.isOnTrack
    ? "var(--green, #16a34a)"
    : projection.confidence === "low"
      ? "var(--color-status-warning, #d97706)"
      : "var(--color-accent, #7c3aed)";

  return (
    <LociCard variant="utilitarian" eyebrow="Time to Target">
      {/* Progress bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          fontFamily: "var(--font-ui)",
          marginBottom: 4,
        }}>
          <span style={{ color: "var(--color-text-muted, #78756c)" }}>Band {projection.currentBand?.toFixed(1)}</span>
          <span style={{ color: "var(--color-text-muted, #78756c)" }}>Band {projection.targetBand?.toFixed(1)}</span>
        </div>
        <div style={{
          height: 8,
          background: "var(--color-surface-2, #e5e1d9)",
          borderRadius: "4px",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            background: barColor,
            borderRadius: "4px",
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>

      {/* Projection text */}
      <div style={{ fontSize: 12, color: "var(--color-text, #171512)", fontFamily: "var(--font-ui)", lineHeight: 1.6, marginBottom: 8 }}>
        {projection.weeksAtCurrentPace !== null
          ? projection.isOnTrack
            ? `On track: ~${projection.weeksAtCurrentPace} week${projection.weeksAtCurrentPace > 1 ? "s" : ""} at current pace`
            : `Needs focus: ~${projection.weeksAtCurrentPace} weeks at current pace`
          : "Complete more sessions for a time estimate"}
      </div>

      {/* Per-module mini breakdown */}
      {projection.moduleProjections && Object.keys(projection.moduleProjections).length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {Object.entries(projection.moduleProjections).slice(0, 4).map(([mod, mp]) => (
            <span key={mod} style={{
              fontSize: 9,
              padding: "2px 6px",
              borderRadius: "3px",
              fontFamily: "var(--font-ui)",
              background: mp?.atTarget
                ? "var(--green-bg, #f0fdf4)"
                : mp?.confidence === "low"
                  ? "var(--color-status-warning-soft, #fffbeb)"
                  : "var(--color-surface-2, #e5e1d9)",
              color: mp?.atTarget
                ? "var(--green, #16a34a)"
                : "var(--color-text-muted, #78756c)",
            }}>
              {mod.slice(0, 1).toUpperCase() + mod.slice(1, 3)}: {mp?.atTarget ? "✓" : mp?.current?.toFixed(1) || "—"}
            </span>
          ))}
        </div>
      )}

      {projection.sessionsPerWeek > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)" }}>
          {projection.sessionsPerWeek.toFixed(1)} sessions/week · {projection.confidence} confidence
        </div>
      )}
    </LociCard>
  );
}
