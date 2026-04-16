import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function PracticeView(props) {
  const { sessions, onSessionComplete, QB, PASSAGES, computeWeakSections, selectQueue, EXAMS, EXAM_COLOR, DIFF_LABEL, DIFF_COLOR, PrimaryBtn, GhostBtn, Chip, C } = props;
  const [phase, setPhase] = useState("setup");
  const [selExam, setSelExam] = useState("IELTS");
  const [timed, setTimed] = useState(false);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [timeLeft, setTimeLeft] = useState(40);
  const [timerOn, setTimerOn] = useState(false);
  const topRef = useRef(null);

  const weakSections = computeWeakSections(sessions);

  const check = useCallback(() => {
    if (chosen === null) return;
    setTimerOn(false); setRevealed(true);
    const q = queue[idx]; const ok = chosen === q.answer;
    if (ok) setScore(s => s + 1);
    setResults(r => [...r, { qid: q.id, section: q.section, exam: q.exam, correct: ok, chosen, answer: q.answer }]);
  }, [chosen, queue, idx]);

  useEffect(() => {
    if (!timed || !timerOn || revealed) return;
    if (timeLeft <= 0) { check(); return; }
    const t = setTimeout(() => setTimeLeft(x => x - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, timerOn, revealed, timed, check]);

  const startQuiz = () => {
    const q = selectQueue(QB, weakSections, selExam, 20);
    setQueue(q); setIdx(0); setChosen(null); setRevealed(false);
    setScore(0); setResults([]); setTimeLeft(40); setTimerOn(timed);
    setPhase("quiz");
  };

  const next = () => {
    if (idx + 1 >= queue.length) {
      const sess = { date: new Date().toISOString(), score, total: queue.length, exam: selExam, results };
      onSessionComplete(sess); setPhase("done");
      return;
    }
    setIdx(i => i + 1); setChosen(null); setRevealed(false);
    setTimeLeft(40); setTimerOn(timed);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const q = queue[idx] || {};
  const passage = q.pid ? PASSAGES[q.pid] : null;
  const pct = queue.length ? ((idx) / queue.length) * 100 : 0;

  if (phase === "setup") return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 10 }}>Exam</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {EXAMS.map(e => <button key={e} onClick={() => setSelExam(e)} style={{ background: selExam === e ? `${EXAM_COLOR[e] || C.accent}12` : C.surface, border: `1px solid ${selExam === e ? (EXAM_COLOR[e] || C.accent) : C.border}`, color: selExam === e ? (EXAM_COLOR[e] || C.accent) : C.muted, padding: "10px 18px", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-ui)", borderRadius: "8px" }}>{e}</button>)}
        </div>
      </div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 10 }}>Mode</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[ ["Practice", "No timer"], ["Timed", "40s/question"] ].map(([label, sub], i) => <button key={i} onClick={() => setTimed(i === 1)} style={{ background: timed === (i === 1) ? C.faint : C.surface, border: `1px solid ${timed === (i === 1) ? C.accent + "50" : C.border}`, color: timed === (i === 1) ? C.accent : C.muted, padding: "12px 18px", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-ui)", textAlign: "left", borderRadius: "8px" }}>
            <div>{label}</div><div style={{ fontSize: 10, marginTop: 2, color: C.muted }}>{sub}</div>
          </button>)}
        </div>
      </div>
      {weakSections.length > 0 && <div style={{ background: "#1F0808", border: `1px solid ${C.red}25`, padding: "12px 16px", marginBottom: 24, borderLeft: `3px solid ${C.red}` }}>
        <div style={{ fontSize: 11, color: C.red, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 6 }}>Weak sections detected — boosted in this session</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{weakSections.map(s => <Chip key={s} label={s} color={C.red} small />)}</div>
      </div>}
      <div style={{ fontSize: 13, color: C.muted, fontFamily: "var(--font-ui)", marginBottom: 20 }}>{QB.filter(q => selExam === "All" || q.exam === selExam).length} questions available · 20 per session · {weakSections.length > 0 ? "weighted toward weak areas" : "balanced random"}</div>
      <PrimaryBtn onClick={startQuiz}>Start Session →</PrimaryBtn>
    </div>
  );

  if (phase === "done") return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 8 }}>Session Complete</div>
        <div style={{ fontSize: 64, lineHeight: 1, letterSpacing: "-0.04em", fontFamily: "var(--font-serif)" }}>{score}<span style={{ fontSize: 24, color: C.muted }}>/ {queue.length}</span></div>
        <div style={{ fontSize: 13, color: C.muted, fontFamily: "var(--font-ui)", marginTop: 8 }}>{Math.round(score / queue.length * 100)}% · {score >= queue.length * .85 ? "Strong session." : score >= queue.length * .65 ? "Solid — review the explanation for each wrong answer." : "Study the learning path for your weakest sections before the next session."}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
        {results.map((r, i) => <div key={i} style={{ background: C.surface, padding: "12px 14px", borderLeft: `3px solid ${r.correct ? C.green : C.red}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: `1px solid ${C.border}`, borderRadius: "8px" }}>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: "var(--font-ui)", flex: 1 }}>{queue[i]?.question?.slice(0, 60)}…</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <Chip label={r.section} color={r.correct ? C.green : C.red} small />
            <span style={{ fontSize: 12, color: r.correct ? C.green : C.red, fontFamily: "var(--font-ui)" }}>{r.correct ? "✓" : "✗"}</span>
          </div>
        </div>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}><GhostBtn onClick={() => setPhase("setup")}>New Session</GhostBtn><PrimaryBtn onClick={startQuiz}>Retry Same Exam</PrimaryBtn></div>
    </div>
  );

  return (
    <div ref={topRef}>
      <div className="progress-bar" style={{ marginBottom: 24, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ height: "100%", background: EXAM_COLOR[q.exam] || C.accent, width: `${pct}%`, transition: "width .4s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Chip label={q.exam} color={EXAM_COLOR[q.exam] || C.accent} />
          <Chip label={q.section} color={C.muted} />
          <Chip label={DIFF_LABEL[q.difficulty]} color={DIFF_COLOR[q.difficulty]} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: C.muted, fontFamily: "var(--font-ui)" }}>{idx + 1}/{queue.length}</span>
          {timed && !revealed && <span style={{ fontSize: 12, color: timeLeft <= 8 ? C.red : C.muted, fontFamily: "var(--font-ui)", fontWeight: 600 }}>{timeLeft}s</span>}
        </div>
      </div>
      {passage && <div style={{ background: q.exam === "IELTS" ? "var(--ielts-bg)" : q.exam === "CEP (C2)" ? "var(--cep-bg)" : "var(--celpip-bg)", border: `1px solid ${EXAM_COLOR[q.exam] || C.accent}22`, padding: "20px 24px", marginBottom: 28, borderLeft: `3px solid ${EXAM_COLOR[q.exam] || C.accent}` , borderRadius: "8px" }}>
        <div style={{ fontSize: 11, color: EXAM_COLOR[q.exam] || C.accent, letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 12, fontWeight: 600 }}>Passage</div>
        <div style={{ fontSize: 15, lineHeight: 1.9, color: C.muted, fontStyle: "italic", fontFamily: "var(--font-reading)" }}>{passage}</div>
      </div>}
      <div style={{ fontSize: 17, lineHeight: 1.75, marginBottom: 22, color: C.text, whiteSpace: "pre-line", fontFamily: "var(--font-reading)" }}>{q.question}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 22 }}>
        {q.options?.map(opt => {
          const sel = chosen === opt, ok = opt === q.answer;
          let bg = C.surface, border = C.border, col = C.muted;
          if (revealed) { if (ok) { bg = "var(--green-bg)"; border = C.green; col = C.green; } else if (sel && !ok) { bg = "var(--red-bg)"; border = C.red; col = C.red; } }
          else if (sel) { bg = C.faint; border = EXAM_COLOR[q.exam] || C.accent; col = C.text; }
          return <button key={opt} onClick={() => !revealed && setChosen(opt)} style={{ background: bg, border: `1px solid ${border}`, color: col, padding: "14px 18px", textAlign: "left", fontSize: 15, cursor: revealed ? "default" : "pointer", fontFamily: "var(--font-reading)", lineHeight: 1.75, display: "flex", gap: 10, alignItems: "flex-start", borderRadius: "8px" }}>
            <span style={{ width: 20, height: 20, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, marginTop: 3, fontFamily: "var(--font-ui)", color: revealed ? (ok ? C.green : sel ? C.red : C.muted) : (sel ? EXAM_COLOR[q.exam] || C.accent : C.muted), borderRadius: "4px" }}>
              {revealed ? (ok ? "✓" : sel ? "✗" : "") : (sel ? "●" : "")}
            </span>{opt}
          </button>;
        })}
      </div>
      {revealed && <div style={{ background: "var(--green-bg)", border: `1px solid ${C.green}22`, padding: "16px 20px", marginBottom: 20, borderLeft: `3px solid ${C.green}`, borderRadius: "8px" }}>
        <div style={{ fontSize: 11, color: C.green, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--font-ui)", marginBottom: 6, fontWeight: 600 }}>Explanation</div>
        <div style={{ fontSize: 13, lineHeight: 1.85, color: C.muted }}>{q.explanation}</div>
      </div>}
      <div style={{ display: "flex", gap: 8 }}>
        {!revealed ? <PrimaryBtn disabled={chosen === null} onClick={check}>Check Answer</PrimaryBtn>
          : <PrimaryBtn onClick={next}>{idx + 1 >= queue.length ? "Finish Session →" : "Next →"}</PrimaryBtn>}
      </div>
    </div>
  );
}
