import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import LociCard from "../../components/common/LociCard.jsx";
import { analyzeBridge } from "../../lib/bridgeService.js";
import { estimateOverallBand } from "../../lib/bandScoreEstimator.js";
import { useFeatureGate } from "../../hooks/useFeatureGate.js";

export default function IeltsBridgePage({ sessions = [], profile = {}, scholarshipCatalog = [], rankedScholarships = null, C, Chip, PrimaryBtn }) {
  const gate = useFeatureGate(profile);

  const bridgeAnalysis = useMemo(() => {
    if (!gate.isPro || !rankedScholarships?.scored?.length) return null;
    const bands = estimateOverallBand(sessions);
    return analyzeBridge(rankedScholarships.scored, bands, profile);
  }, [rankedScholarships, sessions, profile, gate.isPro]);

  // ── Pro gate ──────────────────────────────────────────────────────────
  if (!gate.isPro) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
        <LociCard
          variant="editorial"
          eyebrow="Pro Feature"
          title="IELTS → Scholarship Bridge"
          copy="See exactly how your IELTS practice performance connects to scholarship eligibility. Discover which band improvements unlock the most opportunities."
          action={<Link className="primary-btn link-button" to="/account" style={{ textDecoration: "none" }}>Upgrade to Pro</Link>}
        />
      </div>
    );
  }

  // ── No data ───────────────────────────────────────────────────────────
  if (!bridgeAnalysis || bridgeAnalysis.totalScholarships === 0) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
        <LociCard variant="editorial" eyebrow="IELTS → Scholarship Bridge" title="No data yet">
          <div style={{ fontSize: 13, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)" }}>
            Complete a practice session and set your target band to activate the bridge.
          </div>
        </LociCard>
      </div>
    );
  }

  const { eligibleNowCount, nearMissCount, unlockThresholds, totalScholarships, currentOverallBand, targetBand, eligibleWithImprovement, shortlistGaps, biggestGapModule, eligibleNow, nearMissScholarships } = bridgeAnalysis;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 0" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-muted, #78756c)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 8 }}>Workspace</div>
        <div className="page-title" style={{ marginBottom: 8 }}>IELTS → Scholarship Bridge</div>
        <div className="page-subtitle">
          See how your IELTS band connects to scholarship eligibility. Each 0.5 band improvement unlocks new opportunities.
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Eligible Now", value: eligibleNowCount, total: totalScholarships, band: currentOverallBand, color: "var(--green, #16a34a)" },
          { label: "Near Misses", value: nearMissCount, detail: "within 0.5 band", color: "var(--color-status-warning, #d97706)" },
          targetBand ? { label: `At Band ${targetBand.toFixed(1)}`, value: eligibleWithImprovement, total: totalScholarships, color: "var(--color-accent, #7c3aed)" } : null,
          biggestGapModule ? { label: "Biggest Gap", value: biggestGapModule, detail: "to improve", color: "var(--color-text, #171512)" } : null,
        ].filter(Boolean).map((stat, i) => (
          <LociCard key={i} variant="utilitarian" tone="surface">
            <div style={{ fontSize: 10, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontFamily: "var(--font-serif, monospace)", color: stat.color, lineHeight: 1.2 }}>
              {stat.value}
              {stat.total ? <span style={{ fontSize: 14, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)" }}>/{stat.total}</span> : null}
            </div>
            {stat.band ? <div style={{ fontSize: 10, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", marginTop: 2 }}>at Band {stat.band.toFixed(1)}</div> : null}
            {stat.detail ? <div style={{ fontSize: 10, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", marginTop: 2, textTransform: "capitalize" }}>{stat.detail}</div> : null}
          </LociCard>
        ))}
      </div>

      {/* Unlock thresholds */}
      {unlockThresholds.length > 0 && (
        <LociCard variant="editorial" eyebrow="Unlock Potential" title="What each band unlocks" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {unlockThresholds.map((t) => (
              <div key={t.band} style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: t.band === targetBand ? "var(--color-accent, #7c3aed)10" : "var(--color-surface-1, #f8f6f0)",
                border: `1px solid ${t.band === targetBand ? "var(--color-accent, #7c3aed)30" : "var(--color-border, #e0dcd3)"}`,
                borderRadius: "8px",
              }}>
                <span style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "var(--font-serif, monospace)",
                  color: t.band === targetBand ? "var(--color-accent, #7c3aed)" : "var(--color-text, #171512)",
                  minWidth: 50,
                }}>
                  Band {t.band.toFixed(1)}
                </span>
                <div style={{ flex: 1, height: 8, background: "var(--color-surface-2, #e5e1d9)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, (t.cumulativeCount / totalScholarships) * 100)}%`,
                    background: t.band === targetBand ? "var(--color-accent, #7c3aed)" : "var(--green, #16a34a)",
                    borderRadius: "4px",
                    transition: "width 0.4s ease",
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-ui)", color: "var(--color-text, #171512)", minWidth: 40, textAlign: "right" }}>
                  +{t.unlockCount}
                </span>
              </div>
            ))}
          </div>
        </LociCard>
      )}

      {/* Near misses */}
      {nearMissScholarships.length > 0 && (
        <LociCard variant="editorial" eyebrow="Near Misses" title={`${nearMissCount} scholarship${nearMissCount > 1 ? "s" : ""} just out of reach`} copy="These are within 0.5 band of eligibility. Focus on the gap module to unlock them." style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {nearMissScholarships.slice(0, 8).map((item, i) => {
              const s = item.scholarship;
              const name = s?.name || s?.title || "Unknown";
              return (
                <div key={i} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--color-surface-1, #f8f6f0)",
                  border: "1px solid var(--color-border, #e0dcd3)",
                  borderRadius: "8px",
                  gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text, #171512)", fontFamily: "var(--font-ui)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted, #78756c)", fontFamily: "var(--font-ui)", marginTop: 2 }}>
                      {item.blockedReasons?.slice(0, 2).join(" · ") || `Gap: ${item.gap?.toFixed(1)} band`}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11,
                    color: "var(--color-status-warning, #d97706)",
                    fontFamily: "var(--font-ui)",
                    background: "var(--color-status-warning-soft, #fffbeb)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                  }}>
                    {item.gap?.toFixed(1) || item.requiredIelts} band gap
                  </span>
                </div>
              );
            })}
          </div>
        </LociCard>
      )}

      {/* Shortlist gaps */}
      {shortlistGaps.length > 0 && (
        <LociCard variant="editorial" eyebrow="Shortlist Analysis" title="Your shortlisted scholarships" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shortlistGaps.map((gap) => (
              <div key={gap.scholarshipId} style={{
                padding: "14px 16px",
                background: "var(--color-surface-1, #f8f6f0)",
                border: "1px solid var(--color-border, #e0dcd3)",
                borderRadius: "8px",
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text, #171512)", fontFamily: "var(--font-ui)", marginBottom: 8 }}>
                  {gap.scholarshipTitle}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {gap.meetsOverall !== null && (
                    <span style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: "3px",
                      fontFamily: "var(--font-ui)",
                      background: gap.meetsOverall ? "var(--green-bg, #f0fdf4)" : "var(--red-bg, #fef2f2)",
                      color: gap.meetsOverall ? "var(--green, #16a34a)" : "var(--red, #dc2626)",
                    }}>
                      Overall: {gap.meetsOverall ? "✓" : "✗"} {gap.requiredIelts ? `(${gap.requiredIelts})` : ""}
                    </span>
                  )}
                  {Object.entries(gap.bandGaps || {}).map(([mod, bg]) => {
                    if (!bg) return null;
                    return (
                      <span key={mod} style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: "3px",
                        fontFamily: "var(--font-ui)",
                        background: bg.gap !== null && bg.gap >= 0 ? "var(--green-bg, #f0fdf4)" : "var(--red-bg, #fef2f2)",
                        color: bg.gap !== null && bg.gap >= 0 ? "var(--green, #16a34a)" : "var(--red, #dc2626)",
                      }}>
                        {mod.slice(0, 1).toUpperCase() + mod.slice(1)}: {bg.current !== null ? bg.current.toFixed(1) : "—"}
                        {bg.required ? ` (needs ${bg.required})` : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </LociCard>
      )}
    </div>
  );
}
