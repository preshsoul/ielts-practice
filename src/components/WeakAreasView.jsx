import React from 'react';
import { collectSectionStats } from "../lib/sessionStats.js";

export default function WeakAreasView({ sessions, C, Chip, computeWeakSections }) {
  const weak = computeWeakSections(sessions);
  const sectionAcc = collectSectionStats(sessions);

  if (!sessions.length || Object.keys(sectionAcc).length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No weak areas yet</div>
        <div className="empty-state-copy">
          Complete at least one practice session and the sections that need the most attention will appear here.
        </div>
      </div>
    );
  }

  return (
    <div>
      {weak.length > 0 && (
        <div className="weak-banner" style={{ ['--red']: C.red }}>
          <div className="muted" style={{ color: C.red }}>
            Flagged as weak (below 55% across 3+ questions)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {weak.map(s => <Chip key={s} label={s} color={C.red} />)}
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            These sections are weighted higher in your next practice session. Open the learning path tab
            to study targeted guidance for each one.
          </div>
        </div>
      )}

      <div className="weak-list">
        {Object.entries(sectionAcc)
          .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
          .map(([sec, d]) => {
            const acc = Math.round((d.correct / d.total) * 100);
            const col = acc >= 80 ? C.green : acc >= 60 ? C.amber : C.red;
            const isWeak = weak.includes(sec);
            return (
              <div key={sec} className="weak-card" style={{ ['--left-border-color']: col }}>
                <div className="weak-card-header">
                  <div className="weak-card-title">{sec}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isWeak && <Chip label="WEAK" color={C.red} small />}
                    <div className="weak-acc" style={{ color: col }}>{acc}%</div>
                  </div>
                </div>
                <div className="accuracy-bar">
                  <div className="accuracy-fill" style={{ width: `${acc}%`, ['--fill-color']: col }} />
                </div>
                <div className="small-muted">{d.correct} correct of {d.total} questions attempted</div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
