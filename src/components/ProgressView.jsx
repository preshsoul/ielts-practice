import React from 'react';

export default function ProgressView({ sessions, C, Chip, EXAM_COLOR }) {
  if (!sessions.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No sessions recorded yet</div>
        <div className="empty-state-copy">
          Complete your first practice session to see score history, section accuracy,
          and recent session trends here.
        </div>
      </div>
    );
  }

  const last10 = sessions.slice(-10);

  const sectionAcc = {};
  sessions.forEach(s =>
    s.results.forEach(r => {
      if (!sectionAcc[r.section]) sectionAcc[r.section] = { c: 0, t: 0 };
      sectionAcc[r.section].t++;
      if (r.correct) sectionAcc[r.section].c++;
    })
  );

  const sectionList = Object.entries(sectionAcc)
    .map(([s, d]) => ({ section: s, acc: Math.round((d.c / d.t) * 100), total: d.t }))
    .sort((a, b) => a.acc - b.acc);

  return (
    <div>
      <div className="score-history-label">Score History (last {last10.length} sessions)</div>
      <div className="score-columns">
        {last10.map((s, i) => {
          const pct = Math.round((s.score / s.total) * 100);
          const col = pct >= 80 ? C.green : pct >= 60 ? C.amber : C.red;
          return (
            <div key={i} className="score-col">
              <div className="pct" style={{ color: col }}>{pct}%</div>
              <div style={{ width: '100%', background: col, height: `${Math.max(pct * 0.6, 4)}px`, minHeight: 4 }} />
              <div style={{ fontSize: 10, color: C.muted, fontFamily: 'var(--font-ui)' }}>
                {new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="score-history-label">Section Accuracy (all sessions)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {sectionList.map(({ section, acc, total }) => {
          const col = acc >= 80 ? C.green : acc >= 60 ? C.amber : C.red;
          return (
            <div key={section} className="section-row">
              <div className="section-title">{section}</div>
              <div className="section-total">{total}q</div>
              <div style={{ width: 100, height: 3, background: C.faint }}>
                <div style={{ width: `${acc}%`, height: '100%', background: col }} />
              </div>
              <div className="section-acc" style={{ color: col }}>{acc}%</div>
            </div>
          );
        })}
      </div>

      <div className="session-log">
        <div className="score-history-label">Session Log</div>
        {[...sessions].reverse().map((s, i) => (
          <div key={i} className="session-item">
            <div className="date">
              {new Date(s.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
            <Chip label={s.exam} color={EXAM_COLOR[s.exam] || C.accent} small />
            <div style={{ fontSize: 12, color: Math.round((s.score / s.total) * 100) >= 70 ? C.green : C.amber }}>
              {s.score}/{s.total} · {Math.round((s.score / s.total) * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
