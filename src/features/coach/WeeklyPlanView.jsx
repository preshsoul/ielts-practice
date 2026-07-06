import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import LociCard from "../../components/common/LociCard.jsx";
import { generateWeeklyPlan } from "../../lib/studyCoachEngine.js";
import { analyzeBridge } from "../../lib/bridgeService.js";
import { estimateOverallBand } from "../../lib/bandScoreEstimator.js";
import { computeWeakSections } from "../../lib/sessionTools.js";
import { buildDashboardSnapshot } from "../../lib/dashboard.js";
import { useFeatureGate } from "../../hooks/useFeatureGate.js";

function getVocabularyStats() {
  // Lightweight: just check if vocabulary data exists in localStorage
  // The full engine is in vocabularyEngine.js but we only need stats here
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("loci.vocabProgress:"));
    if (keys.length === 0) return { dueCount: 0, total: 0 };
    const raw = localStorage.getItem(keys[0]);
    if (!raw) return { dueCount: 0, total: 0 };
    const progress = JSON.parse(raw);
    const due = (progress?.boxes?.[1]?.length || 0) + (progress?.boxes?.[2]?.length || 0);
    const total = Object.values(progress?.boxes || {}).reduce((sum, box) => sum + (box?.length || 0), 0);
    return { dueCount: due, total };
  } catch {
    return { dueCount: 0, total: 0 };
  }
}

export default function WeeklyPlanView({ sessions = [], profile = {}, scholarshipCatalog = [], rankedScholarships = null, C, PrimaryBtn }) {
  const gate = useFeatureGate(profile);

  const { plan, bridgeAnalysis } = useMemo(() => {
    if (!gate.isPro) return { plan: null, bridgeAnalysis: null };
    const bands = estimateOverallBand(sessions);
    const bridge = rankedScholarships?.scored?.length
      ? analyzeBridge(rankedScholarships.scored, bands, profile)
      : null;
    const weakSections = computeWeakSections(sessions);
    const snapshot = buildDashboardSnapshot(profile, sessions);
    const vocabStats = getVocabularyStats();
    const weeklyPlan = generateWeeklyPlan(bridge, weakSections, vocabStats, snapshot, sessions, profile);
    return { plan: weeklyPlan, bridgeAnalysis: bridge };
  }, [rankedScholarships, sessions, profile, gate.isPro]);

  // ── Pro gate ──────────────────────────────────────────────────────────
  if (!gate.isPro) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
        <LociCard
          variant="editorial"
          eyebrow="Pro Feature"
          title="Weekly Study Plan"
          copy="Get a personalized 7-day study plan that prioritizes the skills unlocking the most scholarships."
          action={<Link className="primary-btn link-button" to="/account" style={{ textDecoration: "none" }}>Upgrade to Pro</Link>}
        />
      </div>
    );
  }

  // ── No data ───────────────────────────────────────────────────────────
  if (!plan) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
        <LociCard variant="editorial" eyebrow="Weekly Plan" title="No plan yet">
          <div style={{ fontSize: 13, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)" }}>
            Complete a practice session to generate your personalized weekly study plan.
          </div>
        </LociCard>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 0" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-muted, #78756c)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 8 }}>Workspace</div>
        <div className="page-title" style={{ marginBottom: 8 }}>Weekly Study Plan</div>
        <div className="page-subtitle">
          {plan.weekStart} → {plan.weekEnd}
          {plan.summary?.scholarshipImpact > 0 && ` · ${plan.summary.scholarshipImpact} scholarships in reach`}
        </div>
      </div>

      {/* Week summary */}
      <LociCard variant="editorial" tone="surface" eyebrow="This Week" title="Focus areas" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Practice Sessions", value: plan.summary?.totalPracticeSessions || 0 },
            { label: "Vocab Reviews", value: plan.summary?.totalVocabSessions || 0 },
            { label: "Focus Modules", value: (plan.summary?.focusModules || []).map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(", ") || "—" },
          ].map((stat, i) => (
            <div key={i} style={{ padding: "10px 16px", background: "var(--color-surface-1, #f8f6f0)", borderRadius: "8px", border: "1px solid var(--color-border, #e0dcd3)", minWidth: 140 }}>
              <div style={{ fontSize: 10, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text, #171512)", fontFamily: "var(--font-ui)" }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </LociCard>

      {/* 7-day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {plan.days.map((day) => (
          <LociCard
            key={day.date}
            variant={day.isPracticeDay ? "editorial" : "utilitarian"}
            tone={day.isPracticeDay ? "default" : "surface"}
            eyebrow={day.dayName}
            title={day.isPracticeDay ? `${day.sessions.length} session${day.sessions.length > 1 ? "s" : ""}` : "Rest day"}
            copy={day.date}
          >
            {day.sessions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {day.sessions.map((session, si) => (
                  <div key={si} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    background: session.type === "rest" ? "var(--green-bg, #f0fdf4)" : "var(--color-surface-1, #f8f6f0)",
                    border: `1px solid ${session.type === "rest" ? "var(--green, #16a34a)22" : "var(--color-border, #e0dcd3)"}`,
                    borderRadius: "6px",
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>
                      {session.type === "practice" ? (session.module === "reading" ? "📖" : session.module === "listening" ? "🎧" : session.module === "writing" ? "✍️" : session.module === "speaking" ? "🗣️" : "📝")
                        : session.type === "vocabulary" ? "📚"
                        : "😴"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text, #171512)", fontFamily: "var(--font-ui)" }}>{session.label}</div>
                      {session.focus && <div style={{ fontSize: 10, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", marginTop: 1 }}>{session.focus}</div>}
                    </div>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", whiteSpace: "nowrap" }}>{session.duration}</span>
                  </div>
                ))}
              </div>
            )}
            {day.sessions.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", fontStyle: "italic" }}>
                No sessions scheduled — enjoy your rest day.
              </div>
            )}
          </LociCard>
        ))}
      </div>
    </div>
  );
}
