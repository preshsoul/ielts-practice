import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { MOCK_TEST_PHASES, selectMockQuestions, computeMockResults } from "../../lib/mockTestEngine.js";

/**
 * MockTestSimulator — Full IELTS Mock Test at /practice/mock-test
 *
 * State machine: idle → listening → reading → writing → speaking → done
 * Each phase has a countdown timer based on the real IELTS exam durations.
 * Uses existing question bank for Reading, and structured prompts for other modules.
 *
 * Props:
 *   sessions          - existing practice sessions
 *   onSessionComplete  - callback from App.jsx
 *   qb, passages       - question bank and passages
 *   C, Chip, PrimaryBtn - UI atoms
 */
export default function MockTestSimulator({
  sessions = [],
  onSessionComplete = null,
  qb = [],
  passages = [],
  C = {},
  Chip = null,
  PrimaryBtn = null,
}) {
  const [phase, setPhase] = useState("idle"); // idle | listening | reading | writing | speaking | done
  const [phaseIndex, setPhaseIndex] = useState(-1);
  const [timeLeft, setTimeLeft] = useState(0);
  const [sectionResults, setSectionResults] = useState([]);
  const [currentResponses, setCurrentResponses] = useState({});
  const [results, setResults] = useState(null);
  const timerRef = useRef(null);

  // Load questions for the reading section
  const mockQuestions = selectMockQuestions(qb);

  // Start the mock test
  const startTest = useCallback(() => {
    setPhaseIndex(0);
    setPhase("listening");
    setTimeLeft(MOCK_TEST_PHASES[0].durationMin * 60);
    setSectionResults([]);
    setCurrentResponses({});
    setResults(null);
  }, []);

  // Timer
  useEffect(() => {
    if (phase === "idle" || phase === "done") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSectionTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, phaseIndex]);

  // Handle section timer expiry
  const handleSectionTimeUp = useCallback(() => {
    const currentPhase = MOCK_TEST_PHASES[phaseIndex];
    if (!currentPhase) return;

    // Record section result
    const response = currentResponses[currentPhase.key] || "";
    const score = currentPhase.key === "reading"
      ? Math.min(currentResponses.readingScore || 0, mockQuestions.reading.length)
      : Math.min(response.length > 40 ? 8 : response.length > 10 ? 5 : 0, mockQuestions.reading.length || 20);

    setSectionResults((prev) => [...prev, {
      module: currentPhase.key,
      score,
      total: currentPhase.key === "reading" ? mockQuestions.reading.length : 20,
    }]);

    // Move to next phase or finish
    const nextIndex = phaseIndex + 1;
    if (nextIndex >= MOCK_TEST_PHASES.length) {
      finishTest();
    } else {
      setPhaseIndex(nextIndex);
      setPhase(MOCK_TEST_PHASES[nextIndex].key);
      setTimeLeft(MOCK_TEST_PHASES[nextIndex].durationMin * 60);
      setCurrentResponses({});
    }
  }, [phaseIndex, currentResponses, mockQuestions]);

  // Submit current section manually
  const submitSection = useCallback(() => {
    handleSectionTimeUp();
  }, [handleSectionTimeUp]);

  // Finish the mock test
  const finishTest = useCallback(() => {
    const computed = computeMockResults(sectionResults, sessions);
    setResults(computed);
    setPhase("done");

    if (onSessionComplete) {
      onSessionComplete({
        date: new Date().toISOString(),
        score: computed.totalScore,
        total: computed.totalMax,
        module: "mock_test",
        mode: "mock_test",
        component: "Full mock test",
        durationSecs: computed.durationMinutes * 60,
        results: computed.sections.map((s) => ({
          id: s.module,
          section: s.label,
          correct: s.score,
          total: s.total,
          chosen: s.percentage,
        })),
        summary: `Mock test: ${computed.overallBand ? `Estimated band ${computed.overallBand.toFixed(1)}` : `${computed.totalPercentage}% overall`}`,
      });
    }
  }, [sectionResults, sessions, onSessionComplete]);

  // Format timer display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Rendering phases
  if (phase === "idle") {
    return (
      <div className="mock-test">
        <div className="mock-test__hero">
          <h1>IELTS Mock Test</h1>
          <p className="mock-test__subtitle">
            Full-length timed simulation — {MOCK_TEST_PHASES.reduce((s, p) => s + p.durationMin, 0)} minutes total
          </p>
        </div>

        <div className="mock-test__phases">
          {MOCK_TEST_PHASES.map((p) => (
            <div key={p.key} className="mock-test__phase-card">
              <span className="mock-test__phase-icon">
                {p.key === "listening" ? "🎧" : p.key === "reading" ? "📖" : p.key === "writing" ? "✍️" : "🎤"}
              </span>
              <div>
                <h3>{p.label}</h3>
                <p>{p.description}</p>
                <span className="mock-test__phase-time">{p.durationMin} minutes</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mock-test__start">
          <p>Once you start, the timer runs continuously through all 4 sections. Find a quiet space and set aside 2 hours 45 minutes.</p>
          <button className="mock-test__start-btn" onClick={startTest}>
            Start Full Mock Test
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done" && results) {
    return (
      <div className="mock-test mock-test--done">
        <div className="mock-test__hero">
          <h1>Mock Test Complete</h1>
          {results.overallBand && (
            <p className="mock-test__band">
              Estimated Band: <strong>{results.overallBand.toFixed(1)}</strong>
            </p>
          )}
        </div>

        <div className="mock-test__results">
          {results.sections.map((s) => (
            <div key={s.module} className="mock-test__result-card">
              <h3>{s.label}</h3>
              <span className="mock-test__result-score">{s.percentage}%</span>
              <span className="mock-test__result-raw">{s.score}/{s.total}</span>
            </div>
          ))}
        </div>

        <div className="mock-test__summary">
          <span>Total: {results.totalScore}/{results.totalMax} ({results.totalPercentage}%)</span>
          <span>Duration: {results.durationMinutes} minutes</span>
          {results.confidence && <span>Confidence: {results.confidence}</span>}
        </div>

        <div className="mock-test__actions">
          <Link to="/practice" className="mock-test__link">Back to practice</Link>
          <button className="mock-test__start-btn" onClick={startTest}>Retake mock test</button>
        </div>
      </div>
    );
  }

  // Active test phase
  const currentPhase = MOCK_TEST_PHASES[phaseIndex];
  const response = currentResponses[currentPhase?.key] || "";

  return (
    <div className="mock-test mock-test--active">
      <div className="mock-test__active-header">
        <div className="mock-test__active-phase">
          <span className="mock-test__active-label">{currentPhase?.label}</span>
          <span className="mock-test__active-progress">
            Section {phaseIndex + 1} of {MOCK_TEST_PHASES.length}
          </span>
        </div>
        <div className={`mock-test__timer ${timeLeft < 300 ? "mock-test__timer--warning" : ""}`}>
          {formatTime(timeLeft)}
        </div>
      </div>

      {currentPhase?.key === "reading" && (
        <div className="mock-test__reading">
          <p className="mock-test__instructions">
            Answer the following questions based on the passages. You have {currentPhase.durationMin} minutes.
          </p>
          <div className="mock-test__question-list">
            {mockQuestions.reading.slice(0, 10).map((q, i) => (
              <div key={q.id || i} className="mock-test__question">
                <span className="mock-test__question-num">Q{i + 1}.</span>
                <span className="mock-test__question-text">{q.question}</span>
                <div className="mock-test__question-options">
                  {(q.options || []).map((opt, j) => (
                    <label key={j} className="mock-test__option">
                      <input
                        type="radio"
                        name={`q-${q.id || i}`}
                        value={opt}
                        checked={currentResponses[`q-${q.id || i}`] === opt}
                        onChange={(e) => setCurrentResponses((prev) => ({
                          ...prev,
                          [`q-${q.id || i}`]: e.target.value,
                          readingScore: Object.values({ ...prev, [`q-${q.id || i}`]: e.target.value })
                            .filter((v, idx) => typeof v === "string" && mockQuestions.reading[idx]?.answer === v).length,
                        }))}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentPhase?.key !== "reading" && (
        <div className="mock-test__writing">
          <p className="mock-test__instructions">
            {currentPhase?.key === "listening"
              ? "Listen carefully and answer the questions. Write your responses below."
              : currentPhase?.key === "writing"
                ? "Complete both Task 1 and Task 2. Organize your time: 20 minutes for Task 1, 40 minutes for Task 2."
                : "Respond to the speaking prompts. Record yourself speaking if possible, or write your responses."}
          </p>
          <textarea
            className="mock-test__response"
            value={response}
            onChange={(e) => setCurrentResponses((prev) => ({ ...prev, [currentPhase.key]: e.target.value }))}
            placeholder={`Write your ${currentPhase.label.toLowerCase()} responses here...`}
            rows={10}
          />
        </div>
      )}

      <div className="mock-test__active-footer">
        <button className="mock-test__submit-btn" onClick={submitSection}>
          {phaseIndex < MOCK_TEST_PHASES.length - 1 ? "Submit & continue →" : "Finish mock test"}
        </button>
      </div>
    </div>
  );
}
