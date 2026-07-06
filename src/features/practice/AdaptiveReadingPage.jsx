import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import LociCard from "../../components/common/LociCard.jsx";
import { generateIELTSReading } from "../../services/adaptiveReadingService.js";
import { getTopicsByType } from "../../data/ieltsTopics.js";
import { estimateOverallBand } from "../../lib/bandScoreEstimator.js";
import { useFeatureGate } from "../../hooks/useFeatureGate.js";

// ── Constants ────────────────────────────────────────────────────────────────

const BAND_OPTIONS = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];

const QUESTION_TYPE_LABELS = {
  tfng: "True / False / Not Given",
  mcq: "Multiple Choice",
  summary: "Summary Completion",
  matching: "Matching Headings",
};

const PHASES = {
  CONFIG: "config",
  GENERATING: "generating",
  READY: "ready",
  PRACTICING: "practicing",
  DONE: "done",
};

// ── Band auto-detection helper ───────────────────────────────────────────────

function useDetectedBand(sessions) {
  return useMemo(() => {
    if (!Array.isArray(sessions) || sessions.length === 0) return 6.0;
    const estimates = estimateOverallBand(sessions);
    if (estimates.overallBand !== null && estimates.overallBand !== undefined) {
      return Math.round(estimates.overallBand * 2) / 2; // Round to nearest 0.5
    }
    return 6.0;
  }, [sessions]);
}

// ── Band estimation from raw score ───────────────────────────────────────────

function rawToEstimatedBand(rawScore, total) {
  const scaled = Math.round((rawScore / total) * 40);
  // Simplified band mapping (matches bandScoreEstimator)
  if (scaled >= 39) return 9.0;
  if (scaled >= 37) return 8.5;
  if (scaled >= 35) return 8.0;
  if (scaled >= 33) return 7.5;
  if (scaled >= 30) return 7.0;
  if (scaled >= 27) return 6.5;
  if (scaled >= 23) return 6.0;
  if (scaled >= 19) return 5.5;
  if (scaled >= 15) return 5.0;
  if (scaled >= 13) return 4.5;
  if (scaled >= 10) return 4.0;
  if (scaled >= 8) return 3.5;
  if (scaled >= 5) return 3.0;
  return 2.5;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdaptiveReadingPage(props) {
  const {
    sessions = [],
    profile,
    onSessionComplete,
    C,
    Chip,
    PrimaryBtn,
    GhostBtn,
  } = props;

  const gate = useFeatureGate(profile);
  const detectedBand = useDetectedBand(sessions);
  const topRef = useRef(null);

  // ── Configuration state ────────────────────────────────────────────────
  const [targetBand, setTargetBand] = useState(detectedBand);
  const [passageType, setPassageType] = useState("academic");
  const [topicMode, setTopicMode] = useState("dropdown"); // "dropdown" | "custom"
  const [selectedTopic, setSelectedTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [questionTypes, setQuestionTypes] = useState(new Set(["tfng", "mcq", "summary", "matching"]));

  // ── Flow state ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState(PHASES.CONFIG);
  const [error, setError] = useState(null);
  const [generatedData, setGeneratedData] = useState(null);

  // ── Quiz state (replicates PracticeView quiz pattern) ───────────────────
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);

  // ── Reset quiz state when starting a new session ────────────────────────
  const resetQuiz = useCallback((questions) => {
    setQueue(questions);
    setIdx(0);
    setChosen(null);
    setRevealed(false);
    setScore(0);
    setResults([]);
    setPhase(PHASES.PRACTICING);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ── Generate handler ────────────────────────────────────────────────────
  const handleGenerate = async () => {
    const qtArray = Array.from(questionTypes);
    if (qtArray.length === 0) {
      setError("Please select at least one question type.");
      return;
    }

    const topic = topicMode === "custom" ? customTopic.trim() : selectedTopic;

    setPhase(PHASES.GENERATING);
    setError(null);

    try {
      const data = await generateIELTSReading({
        targetBand,
        topic: topic || null,
        passageType,
        questionTypes: qtArray,
      });
      setGeneratedData(data);
      setPhase(PHASES.READY);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      setError(err?.message || "Failed to generate passage. Please try again.");
      setPhase(PHASES.CONFIG);
    }
  };

  // ── Quiz handlers ───────────────────────────────────────────────────────
  const check = useCallback(() => {
    if (chosen === null) return;
    setRevealed(true);
    const q = queue[idx];
    const ok = chosen === q.answer;
    if (ok) setScore((s) => s + 1);
    setResults((r) => [
      ...r,
      {
        qid: idx,
        section: q.section || "Reading",
        type: q.type,
        correct: ok,
        chosen,
        answer: q.answer,
      },
    ]);
  }, [chosen, queue, idx]);

  const next = () => {
    if (idx + 1 >= queue.length) {
      // Finish the session
      const sessionTotal = queue.length;
      const sessionScore = results.filter((r) => r.correct).length + (revealed ? 0 : 0);
      // Use the actual score from state
      const finalScore = revealed ? score : sessionScore;

      const sess = {
        date: new Date().toISOString(),
        score: finalScore,
        total: sessionTotal,
        exam: "IELTS",
        module: "reading",
        mode: "practice",
        component: "Adaptive Reading",
        results,
        sessionData: {
          isAdaptive: true,
          targetBand,
          passageTitle: generatedData?.passage?.title || "",
          passageType,
          questionTypes: Array.from(questionTypes),
          cefrLevel: generatedData?.passage?.cefrLevel || "",
          generated: true,
        },
      };
      onSessionComplete(sess);
      setPhase(PHASES.DONE);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setIdx((i) => i + 1);
    setChosen(null);
    setRevealed(false);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleRegenerateWithBand = (newBand) => {
    setTargetBand(newBand);
    setPhase(PHASES.CONFIG);
    setGeneratedData(null);
    setError(null);
  };

  const handleNewConfig = () => {
    setPhase(PHASES.CONFIG);
    setGeneratedData(null);
    setError(null);
  };

  const toggleQuestionType = (qt) => {
    setQuestionTypes((prev) => {
      const next = new Set(prev);
      if (next.has(qt)) next.delete(qt);
      else next.add(qt);
      return next;
    });
  };

  const topics = useMemo(() => getTopicsByType(passageType), [passageType]);

  // ── Derived values ──────────────────────────────────────────────────────
  const currentQ = queue[idx] || {};
  const pct = queue.length ? (idx / queue.length) * 100 : 0;
  const finishPct = queue.length ? Math.round((score / queue.length) * 100) : 0;
  const estimatedBand = queue.length ? rawToEstimatedBand(score, queue.length) : null;
  const qTypesArray = Array.from(questionTypes);

  const getNextBandSuggestion = () => {
    if (finishPct >= 80 && targetBand < 9.0) return targetBand + 0.5;
    if (finishPct < 50 && targetBand > 4.0) return targetBand - 0.5;
    return null;
  };

  const suggestedBand = getNextBandSuggestion();

  // ── Tier gate ───────────────────────────────────────────────────────────
  if (!gate.canAccessAdaptiveReading) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 20px" }}>
        <LociCard
          variant="editorial"
          eyebrow="Pro Feature"
          title="Adaptive Reading"
          copy="Upgrade to Pro to access AI-generated IELTS reading passages. Generate custom passages at your target band level with auto-generated questions and instant scoring."
          action={
            <Link className="primary-btn link-button" to="/account" style={{ textDecoration: "none" }}>
              Upgrade to Pro
            </Link>
          }
        />
      </div>
    );
  }

  // ── Phase: Config ───────────────────────────────────────────────────────
  if (phase === PHASES.CONFIG) {
    return (
      <div ref={topRef} style={{ maxWidth: 720, margin: "0 auto", padding: "20px 0" }}>
        <LociCard
          variant="editorial"
          eyebrow="Adaptive Reading"
          title="Generate a custom reading passage"
          copy="AI creates an IELTS-calibrated passage at your target band with auto-generated questions. Pro subscribers can generate unlimited passages."
        >
          {error && (
            <div style={{
              background: "var(--color-status-error-soft, #fef2f2)",
              border: "1px solid var(--color-status-error, #ef4444)",
              padding: "12px 16px",
              marginBottom: 20,
              borderLeft: "3px solid var(--color-status-error, #ef4444)",
              fontSize: 13,
              color: "var(--color-status-error, #dc2626)",
              fontFamily: "var(--font-ui)",
              borderRadius: "8px",
            }}>
              {error}
            </div>
          )}

          {/* Target Band */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 10 }}>
              Target Band
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {BAND_OPTIONS.map((b) => (
                <button
                  key={b}
                  onClick={() => setTargetBand(b)}
                  style={{
                    background: targetBand === b ? `${C.accent}15` : C.surface,
                    border: `1px solid ${targetBand === b ? C.accent : C.border}`,
                    color: targetBand === b ? C.accent : C.muted,
                    padding: "8px 14px",
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                    fontWeight: targetBand === b ? 600 : 400,
                    borderRadius: "8px",
                    minWidth: 48,
                  }}
                >
                  {b.toFixed(1)}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: "var(--font-ui)", marginTop: 6 }}>
              Auto-detected from your practice: ~{detectedBand.toFixed(1)}
            </div>
          </div>

          {/* Passage Type */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 10 }}>
              Passage Type
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { value: "academic", label: "Academic", desc: "Formal, 700-950 words" },
                { value: "general", label: "General Training", desc: "Semi-formal, 600-800 words" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setPassageType(opt.value); setSelectedTopic(""); }}
                  style={{
                    flex: 1,
                    background: passageType === opt.value ? `${C.accent}10` : C.surface,
                    border: `1px solid ${passageType === opt.value ? C.accent : C.border}`,
                    color: passageType === opt.value ? C.accent : C.muted,
                    padding: "14px 16px",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                    textAlign: "left",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: passageType === opt.value ? 600 : 400 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: C.muted }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Topic */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 10 }}>
              Topic
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {[
                { value: "dropdown", label: "Choose a topic" },
                { value: "custom", label: "Custom topic" },
                { value: "random", label: "Random" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTopicMode(opt.value)}
                  style={{
                    background: topicMode === opt.value ? `${C.accent}15` : C.surface,
                    border: `1px solid ${topicMode === opt.value ? C.accent : C.border}`,
                    color: topicMode === opt.value ? C.accent : C.muted,
                    padding: "6px 14px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                    borderRadius: "6px",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {topicMode === "dropdown" && (
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  background: C.surface,
                  fontSize: 14,
                  fontFamily: "var(--font-ui)",
                  borderRadius: "8px",
                }}
              >
                <option value="">— Any topic —</option>
                {topics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            {topicMode === "custom" && (
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Enter a custom topic..."
                maxLength={200}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  background: C.surface,
                  fontSize: 14,
                  fontFamily: "var(--font-ui)",
                  borderRadius: "8px",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* Question Types */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 10 }}>
              Question Types
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(QUESTION_TYPE_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: questionTypes.has(key) ? `${C.accent}08` : C.surface,
                    border: `1px solid ${questionTypes.has(key) ? `${C.accent}40` : C.border}`,
                    cursor: "pointer",
                    fontSize: 13,
                    color: C.text,
                    fontFamily: "var(--font-ui)",
                    borderRadius: "8px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={questionTypes.has(key)}
                    onChange={() => toggleQuestionType(key)}
                    style={{ accentColor: C.accent }}
                  />
                  {label}
                </label>
              ))}
            </div>
            {qTypesArray.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--color-status-error, #ef4444)", fontFamily: "var(--font-ui)", marginTop: 6 }}>
                Select at least one question type
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleGenerate}
              disabled={qTypesArray.length === 0}
              style={{
                background: qTypesArray.length > 0 ? C.accent : `${C.accent}50`,
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                fontSize: 14,
                cursor: qTypesArray.length > 0 ? "pointer" : "not-allowed",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                borderRadius: "8px",
              }}
            >
              Generate Passage
            </button>
          </div>
        </LociCard>
      </div>
    );
  }

  // ── Phase: Generating ───────────────────────────────────────────────────
  if (phase === PHASES.GENERATING) {
    return (
      <div ref={topRef} style={{ maxWidth: 720, margin: "0 auto", padding: "20px 0" }}>
        <LociCard variant="editorial" eyebrow="Generating" title="Creating your passage">
          <div style={{ padding: "20px 0" }}>
            <div style={{
              height: 16,
              background: `${C.accent}15`,
              borderRadius: "8px",
              marginBottom: 12,
              width: "60%",
            }} />
            <div style={{
              height: 12,
              background: `${C.accent}10`,
              borderRadius: "6px",
              marginBottom: 8,
              width: "100%",
            }} />
            <div style={{
              height: 12,
              background: `${C.accent}10`,
              borderRadius: "6px",
              marginBottom: 8,
              width: "95%",
            }} />
            <div style={{
              height: 12,
              background: `${C.accent}10`,
              borderRadius: "6px",
              marginBottom: 8,
              width: "88%",
            }} />
            <div style={{
              height: 12,
              background: `${C.accent}10`,
              borderRadius: "6px",
              marginBottom: 8,
              width: "92%",
            }} />
            <div style={{
              height: 12,
              background: `${C.accent}10`,
              borderRadius: "6px",
              width: "45%",
            }} />
            <p style={{
              fontSize: 13,
              color: C.muted,
              fontFamily: "var(--font-ui)",
              marginTop: 24,
              textAlign: "center",
            }}>
              AI is generating your IELTS-calibrated passage at Band {targetBand.toFixed(1)}…
              <br />
              <span style={{ fontSize: 11 }}>This takes 5–15 seconds.</span>
            </p>
          </div>
        </LociCard>
      </div>
    );
  }

  // ── Phase: Ready ────────────────────────────────────────────────────────
  if (phase === PHASES.READY && generatedData) {
    const { passage, model } = generatedData;

    return (
      <div ref={topRef} style={{ maxWidth: 800, margin: "0 auto", padding: "20px 0" }}>
        <LociCard
          variant="editorial"
          eyebrow="Generated Passage"
          title={passage.title}
        >
          {/* Metadata chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {passage.wordCount && (
              <span style={{
                display: "inline-block",
                padding: "4px 10px",
                background: C.faint,
                color: C.muted,
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                borderRadius: "4px",
              }}>
                {passage.wordCount} words
              </span>
            )}
            {passage.cefrLevel && (
              <span style={{
                display: "inline-block",
                padding: "4px 10px",
                background: `${C.accent}12`,
                color: C.accent,
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                borderRadius: "4px",
              }}>
                CEFR: {passage.cefrLevel}
              </span>
            )}
            <span style={{
              display: "inline-block",
              padding: "4px 10px",
              background: `${C.accent}12`,
              color: C.accent,
              fontSize: 11,
              fontFamily: "var(--font-ui)",
              borderRadius: "4px",
            }}>
              Band {targetBand.toFixed(1)}
            </span>
            {passage.topic && (
              <span style={{
                display: "inline-block",
                padding: "4px 10px",
                background: C.faint,
                color: C.muted,
                fontSize: 11,
                fontFamily: "var(--font-ui)",
                borderRadius: "4px",
              }}>
                {passage.topic}
              </span>
            )}
            {model && (
              <span style={{
                display: "inline-block",
                padding: "4px 10px",
                background: C.faint,
                color: C.muted,
                fontSize: 10,
                fontFamily: "var(--font-mono, monospace)",
                borderRadius: "4px",
              }}>
                {model}
              </span>
            )}
          </div>

          {/* Passage body */}
          <div style={{
            background: "var(--ielts-bg, #faf6ee)",
            border: `1px solid ${C.accent}15`,
            padding: "24px 28px",
            marginBottom: 24,
            borderLeft: `3px solid ${C.accent}`,
            borderRadius: "8px",
            maxHeight: 500,
            overflowY: "auto",
          }}>
            <div style={{
              fontSize: 11,
              color: C.accent,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontFamily: "var(--font-ui)",
              marginBottom: 16,
              fontWeight: 600,
            }}>
              Reading Passage
            </div>
            <div style={{
              fontSize: 16,
              lineHeight: 1.9,
              color: C.text,
              fontFamily: "var(--font-reading)",
              whiteSpace: "pre-wrap",
            }}>
              {passage.body}
            </div>
          </div>

          {/* Question count */}
          <div style={{
            fontSize: 13,
            color: C.muted,
            fontFamily: "var(--font-ui)",
            marginBottom: 20,
          }}>
            {generatedData.questions.length} questions ready —{" "}
            {qTypesArray.map((qt) => QUESTION_TYPE_LABELS[qt] || qt).join(", ")}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => resetQuiz(generatedData.questions)}
              style={{
                background: C.accent,
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                borderRadius: "8px",
              }}
            >
              Start Practice
            </button>
            <button
              onClick={handleNewConfig}
              style={{
                background: "transparent",
                color: C.muted,
                border: `1px solid ${C.border}`,
                padding: "12px 28px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                borderRadius: "8px",
              }}
            >
              Regenerate
            </button>
          </div>
        </LociCard>
      </div>
    );
  }

  // ── Phase: Practicing ───────────────────────────────────────────────────
  if (phase === PHASES.PRACTICING) {
    const passage = generatedData?.passage;

    return (
      <div ref={topRef} style={{ maxWidth: 800, margin: "0 auto", padding: "20px 0" }}>
        {/* Progress bar */}
        <div className="progress-bar" style={{ marginBottom: 24, position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{
            height: "100%",
            background: C.accent,
            width: `${pct}%`,
            transition: "width .4s ease",
          }} />
        </div>

        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 8,
        }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Chip label="IELTS" color={C.accent} />
            <Chip label={currentQ.section || "Reading"} color={C.muted} />
            <Chip
              label={currentQ.difficulty === 1 ? "Easy" : currentQ.difficulty === 3 ? "Hard" : "Medium"}
              color={currentQ.difficulty === 1 ? "var(--green, #16a34a)" : currentQ.difficulty === 3 ? "var(--red, #dc2626)" : "var(--amber, #d97706)"}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: C.muted, fontFamily: "var(--font-ui)" }}>
              {idx + 1}/{queue.length}
            </span>
          </div>
        </div>

        {/* Passage reference (collapsible) */}
        {passage?.body && (
          <details style={{ marginBottom: 24 }}>
            <summary style={{
              fontSize: 11,
              color: C.accent,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontFamily: "var(--font-ui)",
              cursor: "pointer",
              padding: "8px 0",
              fontWeight: 600,
            }}>
              📄 Refer to Passage
            </summary>
            <div style={{
              background: "var(--ielts-bg, #faf6ee)",
              border: `1px solid ${C.accent}15`,
              padding: "20px 24px",
              marginTop: 8,
              borderLeft: `3px solid ${C.accent}`,
              borderRadius: "8px",
              maxHeight: 300,
              overflowY: "auto",
            }}>
              <div style={{
                fontSize: 15,
                lineHeight: 1.85,
                color: C.text,
                fontFamily: "var(--font-reading)",
                whiteSpace: "pre-wrap",
              }}>
                {passage.body}
              </div>
            </div>
          </details>
        )}

        {/* Question text */}
        <div style={{
          fontSize: 17,
          lineHeight: 1.75,
          marginBottom: 22,
          color: C.text,
          whiteSpace: "pre-line",
          fontFamily: "var(--font-reading)",
        }}>
          {currentQ.questionText}
        </div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 22 }}>
          {(currentQ.options || []).map((opt) => {
            const sel = chosen === opt;
            const ok = opt === currentQ.answer;
            let bg = C.surface;
            let border = C.border;
            let col = C.muted;

            if (revealed) {
              if (ok) {
                bg = "var(--green-bg, #f0fdf4)";
                border = "var(--green, #16a34a)";
                col = "var(--green, #16a34a)";
              } else if (sel && !ok) {
                bg = "var(--red-bg, #fef2f2)";
                border = "var(--red, #dc2626)";
                col = "var(--red, #dc2626)";
              }
            } else if (sel) {
              bg = C.faint;
              border = C.accent;
              col = C.text;
            }

            return (
              <button
                key={opt}
                onClick={() => !revealed && setChosen(opt)}
                style={{
                  background: bg,
                  border: `1px solid ${border}`,
                  color: col,
                  padding: "14px 18px",
                  textAlign: "left",
                  fontSize: 15,
                  cursor: revealed ? "default" : "pointer",
                  fontFamily: "var(--font-reading)",
                  lineHeight: 1.75,
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  borderRadius: "8px",
                }}
              >
                <span style={{
                  width: 20,
                  height: 20,
                  border: `1px solid ${border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  flexShrink: 0,
                  marginTop: 3,
                  fontFamily: "var(--font-ui)",
                  color: revealed
                    ? (ok ? "var(--green, #16a34a)" : sel ? "var(--red, #dc2626)" : C.muted)
                    : (sel ? C.accent : C.muted),
                  borderRadius: "4px",
                }}>
                  {revealed ? (ok ? "✓" : sel ? "✗" : "") : (sel ? "●" : "")}
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {/* Explanation (revealed) */}
        {revealed && (
          <div style={{
            background: "var(--green-bg, #f0fdf4)",
            border: `1px solid var(--green, #16a34a)22`,
            padding: "16px 20px",
            marginBottom: 20,
            borderLeft: "3px solid var(--green, #16a34a)",
            borderRadius: "8px",
          }}>
            <div style={{
              fontSize: 11,
              color: "var(--green, #16a34a)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontFamily: "var(--font-ui)",
              marginBottom: 6,
              fontWeight: 600,
            }}>
              Explanation
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.85, color: C.muted }}>
              {currentQ.explanation}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          {!revealed ? (
            <button
              disabled={chosen === null}
              onClick={check}
              style={{
                background: chosen !== null ? C.accent : `${C.accent}50`,
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                fontSize: 14,
                cursor: chosen !== null ? "pointer" : "not-allowed",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                borderRadius: "8px",
              }}
            >
              Check answer
            </button>
          ) : (
            <button
              onClick={next}
              style={{
                background: C.accent,
                color: "#fff",
                border: "none",
                padding: "12px 28px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                fontWeight: 600,
                borderRadius: "8px",
              }}
            >
              {idx + 1 >= queue.length ? "Finish session" : "Next"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: Done ─────────────────────────────────────────────────────────
  if (phase === PHASES.DONE) {
    return (
      <div ref={topRef} style={{ maxWidth: 720, margin: "0 auto", padding: "20px 0" }}>
        <LociCard
          variant="editorial"
          eyebrow="Session Complete"
          title="Adaptive Reading Results"
        >
          {/* Score display */}
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 64,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              fontFamily: "var(--font-serif, monospace)",
            }}>
              {score}
              <span style={{ fontSize: 24, color: C.muted }}>/{queue.length}</span>
            </div>
            <div style={{ fontSize: 14, color: C.muted, fontFamily: "var(--font-ui)", marginTop: 4 }}>
              {finishPct}% · Estimated Band: {estimatedBand !== null ? estimatedBand.toFixed(1) : "—"}
            </div>
            <div style={{ fontSize: 13, color: C.muted, fontFamily: "var(--font-ui)", marginTop: 12 }}>
              {finishPct >= 80
                ? "Strong session. You're ready for a higher band level."
                : finishPct >= 50
                  ? "Solid work. Review the explanations for wrong answers."
                  : "This band level is challenging. Try dropping to an easier level to build confidence."}
            </div>
          </div>

          {/* Per-question results */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
            {results.map((r, i) => {
              const q = queue[i] || {};
              return (
                <div
                  key={i}
                  style={{
                    background: C.surface,
                    padding: "12px 14px",
                    borderLeft: `3px solid ${r.correct ? "var(--green, #16a34a)" : "var(--red, #dc2626)"}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    border: `1px solid ${C.border}`,
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: "var(--font-ui)", flex: 1 }}>
                    {String(q.questionText || "").slice(0, 80)}{String(q.questionText || "").length > 80 ? "…" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <Chip
                      label={QUESTION_TYPE_LABELS[r.type] || r.section || "Reading"}
                      color={r.correct ? "var(--green, #16a34a)" : "var(--red, #dc2626)"}
                      small
                    />
                    <span style={{
                      fontSize: 12,
                      color: r.correct ? "var(--green, #16a34a)" : "var(--red, #dc2626)",
                      fontFamily: "var(--font-ui)",
                    }}>
                      {r.correct ? "✓" : "✗"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Adaptive suggestion */}
          {suggestedBand && (
            <div style={{
              background: `${C.accent}08`,
              border: `1px solid ${C.accent}30`,
              padding: "16px 20px",
              marginBottom: 20,
              borderLeft: `3px solid ${C.accent}`,
              borderRadius: "8px",
            }}>
              <div style={{
                fontSize: 11,
                color: C.accent,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontFamily: "var(--font-ui)",
                marginBottom: 6,
                fontWeight: 600,
              }}>
                Adaptive Suggestion
              </div>
              <div style={{ fontSize: 14, color: C.text, fontFamily: "var(--font-ui)", lineHeight: 1.6 }}>
                {suggestedBand > targetBand
                  ? `Great job! Try the next band level: Band ${suggestedBand.toFixed(1)}.`
                  : `Let's build your skills first. Try Band ${suggestedBand.toFixed(1)} to strengthen your foundation.`}
              </div>
            </div>
          )}

          {!suggestedBand && (
            <div style={{
              background: "var(--green-bg, #f0fdf4)",
              border: `1px solid var(--green, #16a34a)22`,
              padding: "16px 20px",
              marginBottom: 20,
              borderLeft: "3px solid var(--green, #16a34a)",
              borderRadius: "8px",
            }}>
              <div style={{ fontSize: 14, color: C.text, fontFamily: "var(--font-ui)", lineHeight: 1.6 }}>
                You're right at the right level. Keep practicing at Band {targetBand.toFixed(1)} to solidify your skills.
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {suggestedBand && (
              <button
                onClick={() => handleRegenerateWithBand(suggestedBand)}
                style={{
                  background: C.accent,
                  color: "#fff",
                  border: "none",
                  padding: "12px 28px",
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "var(--font-ui)",
                  fontWeight: 600,
                  borderRadius: "8px",
                }}
              >
                Try Band {suggestedBand.toFixed(1)}
              </button>
            )}
            <button
              onClick={() => resetQuiz(generatedData?.questions || queue)}
              style={{
                background: "transparent",
                color: C.accent,
                border: `1px solid ${C.accent}`,
                padding: "12px 28px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                borderRadius: "8px",
              }}
            >
              Retry same passage
            </button>
            <button
              onClick={handleNewConfig}
              style={{
                background: "transparent",
                color: C.muted,
                border: `1px solid ${C.border}`,
                padding: "12px 28px",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                borderRadius: "8px",
              }}
            >
              New configuration
            </button>
          </div>
        </LociCard>
      </div>
    );
  }

  return null;
}
