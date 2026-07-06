import React from "react";
import { Link } from "react-router-dom";
import LociCard from "../../components/common/LociCard.jsx";

export default function StudyCoachCard({ actions = [], isLoading = false, isPro = false, snapshot = null }) {
  // ── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <LociCard variant="editorial" eyebrow="AI Study Coach" title="Today's Focus">
        <div style={{ padding: "12px 0" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
              <div style={{ width: 32, height: 32, background: "var(--color-surface-2, #e5e1d9)", borderRadius: "8px", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, background: "var(--color-surface-2, #e5e1d9)", borderRadius: "4px", width: "80%", marginBottom: 6 }} />
                <div style={{ height: 10, background: "var(--color-surface-2, #e5e1d9)", borderRadius: "4px", width: "55%" }} />
              </div>
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
        eyebrow="AI Study Coach"
        title="Upgrade to Pro"
        copy="Get personalized daily recommendations, weekly study plans, and time-to-target projections based on your scholarship goals."
        action={
          <Link className="primary-btn link-button" to="/account" style={{ textDecoration: "none" }}>
            Upgrade to Pro
          </Link>
        }
      />
    );
  }

  // ── No data state ─────────────────────────────────────────────────────
  if (!actions || actions.length === 0) {
    return (
      <LociCard variant="editorial" eyebrow="AI Study Coach" title="Today's Focus">
        <div style={{ fontSize: 13, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", padding: "12px 0" }}>
          Set your target band and complete a practice session to get personalized coaching recommendations.
        </div>
        <div style={{ marginTop: 8 }}>
          <Link className="primary-btn link-button" to="/practice/reading" style={{ textDecoration: "none" }}>
            Start a session
          </Link>
        </div>
      </LociCard>
    );
  }

  // ── Populated state ───────────────────────────────────────────────────
  const topActions = actions.slice(0, 3);

  return (
    <LociCard variant="editorial" eyebrow="AI Study Coach" title="Today's Focus">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {topActions.map((action) => (
          <Link
            key={action.id}
            to={action.route}
            style={{
              textDecoration: "none",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "12px 14px",
              background: "var(--color-surface-1, #f8f6f0)",
              border: "1px solid var(--color-border, #e0dcd3)",
              borderRadius: "8px",
              transition: "border-color 0.15s ease",
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--color-accent, #7c3aed)"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--color-border, #e0dcd3)"}
          >
            <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{action.icon || "📝"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text, #171512)", fontFamily: "var(--font-ui)", marginBottom: 3 }}>
                {action.action}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", lineHeight: 1.5 }}>
                {action.reason}
              </div>
            </div>
            <span style={{
              fontSize: 10,
              color: "var(--color-text-muted, #78756c)",
              fontFamily: "var(--font-ui)",
              background: "var(--color-surface-2, #e5e1d9)",
              padding: "2px 8px",
              borderRadius: "4px",
              whiteSpace: "nowrap",
              flexShrink: 0,
              marginTop: 2,
            }}>
              {action.duration}
            </span>
          </Link>
        ))}
      </div>

      {actions.length > 3 && (
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)" }}>
          +{actions.length - 3} more actions available
        </div>
      )}

      {/* Progress note */}
      {snapshot && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--color-border, #e0dcd3)" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", lineHeight: 1.6 }}>
            {snapshot.totalSessions > 0
              ? `${snapshot.totalSessions} practice session${snapshot.totalSessions > 1 ? "s" : ""} completed. `
              : "No practice sessions yet. "}
            <Link to="/practice/weekly-plan" style={{ color: "var(--color-accent, #7c3aed)", fontWeight: 500 }}>
              View weekly plan →
            </Link>
          </div>
        </div>
      )}
    </LociCard>
  );
}
