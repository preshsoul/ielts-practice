import React, { useEffect, useMemo, useState } from "react";
import { getPracticeModule } from "../data/practiceModules.js";

// Simplified IELTS Writing/Speaking rubric criteria (1 = Limited, 3 = Adequate, 5 = Strong)
const WRITING_RUBRIC = [
  { key: "task", label: "Task Achievement", hint: "Did I fully answer the prompt?" },
  { key: "coherence", label: "Coherence", hint: "Is my response logically organised?" },
  { key: "lexical", label: "Lexical Resource", hint: "Is my vocabulary varied and precise?" },
  { key: "grammar", label: "Grammar", hint: "Are my sentences accurate and varied?" },
];

const SPEAKING_RUBRIC = [
  { key: "fluency", label: "Fluency", hint: "Did I speak smoothly without long pauses?" },
  { key: "lexical", label: "Lexical Resource", hint: "Did I use varied, appropriate vocabulary?" },
  { key: "grammar", label: "Grammar", hint: "Were my sentences accurate and varied?" },
  { key: "pronunciation", label: "Pronunciation", hint: "Was my pronunciation clear?" },
];

function defaultRubric() {
  return { task: 3, coherence: 3, lexical: 3, grammar: 3 };
}

function rubricAverage(rubric) {
  var vals = Object.values(rubric).filter(function (v) { return typeof v === "number"; });
  return vals.length ? vals.reduce(function (s, v) { return s + v; }, 0) / vals.length : 0;
}

function WordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

export default function ModulePracticeScreen({ module, sessions, onSessionComplete, C, PrimaryBtn, GhostBtn, Chip }) {
  var config = getPracticeModule(module);
  var isWriting = module === "writing";
  var isSpeaking = module === "speaking";
  var useRubric = isWriting || isSpeaking;
  var rubricCriteria = isWriting ? WRITING_RUBRIC : SPEAKING_RUBRIC;

  var _useState = useState("setup"), phase = _useState[0], setPhase = _useState[1];
  var _useState2 = useState(true), timed = _useState2[0], setTimed = _useState2[1];
  var _useState3 = useState(0), idx = _useState3[0], setIdx = _useState3[1];
  var _useState4 = useState(""), response = _useState4[0], setResponse = _useState4[1];
  var _useState5 = useState(defaultRubric()), rubric = _useState5[0], setRubric = _useState5[1];
  var _useState7 = useState(0), elapsed = _useState7[0], setElapsed = _useState7[1];
  var _useState8 = useState([]), results = _useState8[0], setResults = _useState8[1];
  var _useState9 = useState(""), summary = _useState9[0], setSummary = _useState9[1];

  var prompts = config.prompts;
  var current = prompts[idx] || prompts[0];
  var maxTime = config.timerSeconds;
  var currentWordCount = isWriting ? WordCount(response) : 0;

  useEffect(() => {
    if (phase !== "active" || !timed) return undefined;
    const timer = setInterval(() => {
      setElapsed((currentElapsed) => {
        if (currentElapsed + 1 >= maxTime) {
          return maxTime;
        }
        return currentElapsed + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [maxTime, phase, timed]);

  useEffect(() => {
    if (phase !== "active" || !timed) return;
    if (elapsed < maxTime) return;
    submitCurrent(true);
  }, [elapsed, maxTime, phase, timed]);

  const moduleStats = useMemo(() => {
    const relevant = Array.isArray(sessions) ? sessions.filter((session) => session.module === module) : [];
    const latest = relevant[relevant.length - 1] || null;
    return {
      attempts: relevant.length,
      latestScore: latest?.total ? Math.round((latest.score / latest.total) * 100) : null,
      latestDate: latest?.date || null,
    };
  }, [module, sessions]);

  const startSession = () => {
    setPhase("active");
    setIdx(0);
    setResponse("");
    setRating(3);
    setElapsed(0);
    setResults([]);
    setSummary("");
  };

  var submitCurrent = function (force) {
    if (force === undefined) force = false;
    var prompt = prompts[idx];
    var notes = String(response || "").trim();

    // For Writing/Speaking: use rubric self-assessment instead of pass/fail-by-length
    var avgRubric = useRubric ? rubricAverage(rubric) : null;
    var pass = useRubric
      ? avgRubric >= 3 // adequate or better across criteria
      : force ? Boolean(notes) : notes.length >= 40;

    var nextResults = results.concat([{
      id: prompt.id,
      prompt: prompt.title,
      correct: pass,
      response: notes,
      rubric: useRubric ? Object.assign({}, rubric) : undefined,
      rubricAvg: avgRubric,
    }]);
    setResults(nextResults);
    setResponse("");
    setRubric(defaultRubric());
    setElapsed(0);

    if (idx + 1 >= prompts.length) {
      var score = nextResults.filter(function (item) { return item.correct; }).length;
      // For rubric modules, score is based on average rubric quality, not binary pass/fail
      var rubricScores = nextResults
        .filter(function (item) { return item.rubricAvg !== null && item.rubricAvg !== undefined; })
        .map(function (item) { return item.rubricAvg; });
      var avgRubricScore = rubricScores.length
        ? rubricScores.reduce(function (s, v) { return s + v; }, 0) / rubricScores.length
        : null;
      var nextSummary = useRubric
        ? (score + "/" + prompts.length + " prompts adequate. Avg rubric: " + (avgRubricScore ? avgRubricScore.toFixed(1) : "-") + "/5")
        : (score + "/" + prompts.length + " completed in " + module + " practice.");
      setSummary(nextSummary);
      onSessionComplete({
        date: new Date().toISOString(),
        score: score,
        total: prompts.length,
        rubricAvg: avgRubricScore,
        exam: "IELTS",
        module: module,
        mode: timed ? "timed" : "practice",
        component: config.title,
        summary: nextSummary,
        promptCount: prompts.length,
        results: nextResults,
      });
      setPhase("done");
      return;
    }
    setIdx(function (i) { return i + 1; });
  };

  if (phase === "setup") {
    return (
      <div className="module-practice">
        <div className="module-practice-hero">
          <div>
            <div className="section-kicker">Practice</div>
            <h2 className="page-title" style={{ marginBottom: 10 }}>{config.title}</h2>
            <p className="page-subtitle" style={{ marginBottom: 0 }}>{config.summary}</p>
          </div>
          <div className="practice-module-metrics">
            <div className="summary-tile">
              <span>Prompts</span>
              <strong>{prompts.length}</strong>
            </div>
            <div className="summary-tile">
              <span>Timer</span>
              <strong>{maxTime}s</strong>
            </div>
            <div className="summary-tile">
              <span>Attempts</span>
              <strong>{moduleStats.attempts}</strong>
            </div>
          </div>
        </div>

        <div className="practice-mode-row">
          <button className={`seg-btn${timed ? " active" : ""}`} onClick={() => setTimed(true)} style={{ ["--seg-color"]: C.accent }}>
            Timed
          </button>
          <button className={`seg-btn${!timed ? " active" : ""}`} onClick={() => setTimed(false)} style={{ ["--seg-color"]: C.green }}>
            Practice
          </button>
        </div>

        <div className="module-prompt-list">
          {prompts.map((prompt) => (
            <article key={prompt.id} className="module-prompt-card">
              <div className="module-prompt-title">{prompt.title}</div>
              <div className="module-prompt-copy">{prompt.prompt}</div>
            </article>
          ))}
        </div>

        <div className="onboarding-actions">
          <PrimaryBtn onClick={startSession}>Start session</PrimaryBtn>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="module-practice">
        <div className="empty-state">
          <div className="empty-state-title">{config.title} session complete</div>
          <div className="empty-state-copy">{summary}</div>
          <div className="empty-state-meta">
            Latest attempt: {moduleStats.latestScore ?? "n/a"}% · {moduleStats.latestDate ? new Date(moduleStats.latestDate).toLocaleDateString("en-GB") : "no prior sessions"}
          </div>
        </div>
        <div className="module-done-summary">
          {results.map((result) => (
            <div key={result.id} className="module-done-row">
              <span>{result.prompt}</span>
              <strong>{result.correct ? "Complete" : "Needs work"}</strong>
            </div>
          ))}
        </div>
        <div className="onboarding-actions">
          <GhostBtn onClick={() => setPhase("setup")}>Back to setup</GhostBtn>
          <PrimaryBtn onClick={startSession}>Run again</PrimaryBtn>
        </div>
      </div>
    );
  }

  return (
    <div className="module-practice">
      <div className="module-practice-topbar">
        <div className="module-practice-topline">
          <Chip label={config.title} color={C.accent} />
          <Chip label={timed ? "Timed" : "Practice"} color={timed ? C.amber : C.green} small />
        </div>
        <div className="module-practice-meta">
          <span>{idx + 1}/{prompts.length}</span>
          <span>{elapsed}s / {maxTime}s</span>
          <ProgressLabel value={idx + 1} max={prompts.length} C={C} />
        </div>
      </div>

      <div className="module-task-card">
        <div className="module-task-title">{current.title}</div>
        <div className="module-task-prompt">{current.prompt}</div>
        <div className="module-task-feedback">{current.feedback}</div>
      </div>

      <div className="module-response-area">
        <label className="module-response-label">
          {module === "writing" ? "Response" : module === "speaking" ? "Speaking outline" : "Notes"}
          {module === "writing" && <span className="module-wordcount">{currentWordCount} words</span>}
        </label>
        <textarea
          className="sch-textarea"
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          placeholder={
            module === "writing"
              ? "Draft your answer here..."
              : module === "speaking"
                ? "Write the points you would say out loud..."
                : "Write the answer type, key cue, or final response..."
          }
          rows={module === "writing" ? 10 : 7}
        />
        {useRubric && (
          <div className="module-rubric-stack" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 8, fontFamily: "var(--font-ui)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Self-assessment rubric (1=Needs work, 3=Adequate, 5=Strong)
            </div>
            {rubricCriteria.map(function (criterion) {
              return (
                <div key={criterion.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-ui)", fontWeight: 500 }}>{criterion.label}</span>
                    <span style={{ fontSize: 10, color: "var(--text-3)", display: "block" }}>{criterion.hint}</span>
                  </div>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    {[1, 2, 3, 4, 5].map(function (value) {
                      var active = rubric[criterion.key] === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={function () {
                            setRubric(function (prev) { var next = Object.assign({}, prev); next[criterion.key] = value; return next; });
                          }}
                          style={{
                            width: 28, height: 28, borderRadius: 6, border: active ? "2px solid var(--accent)" : "1px solid var(--border)",
                            background: active ? "var(--accent-bg)" : "transparent", cursor: "pointer",
                            fontSize: 11, fontWeight: active ? 700 : 400,
                            color: active ? "var(--accent)" : "var(--text-2)", fontFamily: "var(--font-ui)",
                          }}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4, fontFamily: "var(--font-ui)" }}>
              Avg: {rubricAverage(rubric).toFixed(1)}/5 — {rubricAverage(rubric) >= 4 ? "Strong" : rubricAverage(rubric) >= 3 ? "Adequate" : "Needs work"}
            </div>
          </div>
        )}
        {module === "speaking" && !useRubric && (
          <div className="module-rating-row">
            <span>Self-rating</span>
            <div className="module-rating-buttons">
              {[1, 2, 3, 4, 5].map(function (value) {
                return <button key={value} className={"seg-btn" + (rubric.fluency === value ? " active" : "")} onClick={function () { setRubric(function (prev) { var next = Object.assign({}, prev); next.fluency = value; return next; }); }}>{value}</button>;
              })}
            </div>
          </div>
        )}
      </div>

      <div className="onboarding-actions">
        <PrimaryBtn onClick={() => submitCurrent(false)} disabled={!response.trim()}>
          {idx + 1 >= prompts.length ? "Finish session" : "Submit and continue"}
        </PrimaryBtn>
      </div>
    </div>
  );
}
