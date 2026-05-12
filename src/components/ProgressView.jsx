import React from 'react';
import { collectModuleStats, collectSectionStats } from "../lib/sessionStats.js";

function safePercent(score, total) {
  const safeTotal = Number(total);
  const safeScore = Number(score);
  if (!Number.isFinite(safeTotal) || safeTotal <= 0 || !Number.isFinite(safeScore)) return 0;
  return Math.round((safeScore / safeTotal) * 100);
}

export default function ProgressView({ sessions, C, Chip, EXAM_COLOR }) {
  if (!sessions.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No sessions recorded yet</div>
        <div className="empty-state-copy">
          Start a practice session to see score history, section accuracy, and recent trends here.
        </div>
      </div>
    );
  }

  const last10 = sessions.slice(-10);
  const moduleStats = collectModuleStats(sessions);
  const sectionAcc = collectSectionStats(sessions);

  const sectionList = Object.entries(sectionAcc)
    .map(([section, data]) => ({ section, acc: Math.round((data.correct / data.total) * 100), total: data.total }))
    .sort((a, b) => a.acc - b.acc);

  return (
    <div>
      <div className="score-history-label">Score History (last {last10.length} sessions)</div>
      <div className="score-columns">
        {last10.map((s, i) => {
          const pct = safePercent(s.score, s.total);
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

      <div className="score-history-label">Module coverage</div>
      <div className="module-coverage-grid">
        {Object.entries(moduleStats).map(([module, stats]) => {
          const accuracy = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
          const latest = stats.latest;
          const col = accuracy >= 80 ? C.green : accuracy >= 60 ? C.amber : C.red;
          return (
            <div key={module} className="module-coverage-card">
              <div className="module-coverage-label">{module}</div>
              <div className="module-coverage-value" style={{ color: col }}>{stats.attempts} sessions</div>
              <div className="module-coverage-meta">{latest ? `Latest: ${new Date(latest.date).toLocaleDateString('en-GB')}` : "No attempts yet"}</div>
              <div className="module-coverage-bar">
                <div className="module-coverage-fill" style={{ width: `${accuracy}%`, background: col }} />
              </div>
              <div className="module-coverage-meta">{accuracy}% accuracy proxy</div>
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
            <Chip label={String(s.module || "reading")} color={EXAM_COLOR[s.exam] || C.accent} small />
            <Chip label={s.exam} color={EXAM_COLOR[s.exam] || C.accent} small />
            <div style={{ fontSize: 12, color: safePercent(s.score, s.total) >= 70 ? C.green : C.amber }}>
              {Number(s.score) || 0}/{Number(s.total) || 0} · {safePercent(s.score, s.total)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
