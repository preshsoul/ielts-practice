import React, { useEffect, useMemo, useState } from "react";
import { getPracticeModule } from "../data/practiceModules.js";

function WordCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function ProgressLabel({ value, max, C }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  const color = pct >= 80 ? C.green : pct >= 60 ? C.amber : C.red;
  return <span style={{ color, fontFamily: "var(--font-ui)", fontSize: 12, fontWeight: 600 }}>{pct}%</span>;
}

export default function ModulePracticeScreen({ module, sessions, onSessionComplete, C, PrimaryBtn, GhostBtn, Chip }) {
  const config = getPracticeModule(module);
  const [phase, setPhase] = useState("setup");
  const [timed, setTimed] = useState(true);
  const [idx, setIdx] = useState(0);
  const [response, setResponse] = useState("");
  const [rating, setRating] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState("");

  const prompts = config.prompts;
  const current = prompts[idx] || prompts[0];
  const maxTime = config.timerSeconds;
  const currentWordCount = module === "writing" ? WordCount(response) : 0;

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

  const submitCurrent = (force = false) => {
    const prompt = prompts[idx];
    const notes = String(response || "").trim();
    const pass = force ? Boolean(notes) : module === "writing" ? notes.length >= 40 : notes.length > 0;
    const nextResults = [
      ...results,
      {
        id: prompt.id,
        prompt: prompt.title,
        correct: pass,
        response: notes,
        rating,
      },
    ];
    setResults(nextResults);
    setResponse("");
    setRating(3);
    setElapsed(0);
    if (idx + 1 >= prompts.length) {
      const score = nextResults.filter((item) => item.correct).length;
      const nextSummary = `${score}/${prompts.length} completed in ${module} practice.`;
      setSummary(nextSummary);
      onSessionComplete({
        date: new Date().toISOString(),
        score,
        total: prompts.length,
        exam: "IELTS",
        module,
        mode: timed ? "timed" : "practice",
        component: config.title,
        summary: nextSummary,
        promptCount: prompts.length,
        results: nextResults,
      });
      setPhase("done");
      return;
    }
    setIdx((currentIndex) => currentIndex + 1);
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
        {module === "speaking" && (
          <div className="module-rating-row">
            <span>Self-rating</span>
            <div className="module-rating-buttons">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} className={`seg-btn${rating === value ? " active" : ""}`} onClick={() => setRating(value)}>
                  {value}
                </button>
              ))}
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
