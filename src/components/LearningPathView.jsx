import React, { useState } from 'react';

export default function LearningPathView(props){
  const { sessions, C, Chip, LEARNING_PATH, computeWeakSections } = props;
  const [open, setOpen] = useState(null);
  const weak = computeWeakSections(sessions);
  const allSections = Object.keys(LEARNING_PATH).filter(s => LEARNING_PATH[s].steps && LEARNING_PATH[s].steps.length > 0);
  const sorted = [...weak, ...allSections.filter(s => !weak.includes(s))];

  return (
    <div>
      {weak.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.red}20`, padding: '14px 16px', marginBottom: 20, borderLeft: `3px solid ${C.red}`, borderRadius: '8px', fontSize: 12, color: C.muted, fontFamily: 'var(--font-ui)', lineHeight: 1.7 }}>
          Your weak sections are shown first. Study these guides before your next session.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(sec => {
          const lp = LEARNING_PATH[sec];
          if (!lp || !lp.steps || !lp.steps.length) return null;
          const isWeak = weak.includes(sec);
          const isOpen = open === sec;
          const iconText = sec.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

          return (
            <div key={sec} style={{ border: `1px solid ${isWeak ? C.red + '30' : C.border}`, borderLeft: `3px solid ${isWeak ? C.red : lp.color}`, background: isWeak ? C.bg2 : C.surface, borderRadius: '10px', boxShadow: 'var(--shadow-xs)' }}>
              <button onClick={() => setOpen(isOpen ? null : sec)} style={{ width: '100%', background: 'none', border: 'none', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: lp.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-ui)' }}>{iconText}</div>
                  <div>
                    <div style={{ fontSize: 14, color: C.text, fontFamily: 'var(--font-ui)', fontWeight: 600 }}>{sec}</div>
                    {isWeak && <div style={{ fontSize: 9, color: C.red, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)', marginTop: 3 }}>Flagged weak - study this first</div>}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: 'var(--font-ui)', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 16px 18px' }}>
                  {lp.summary && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8, marginBottom: 16, fontFamily: 'var(--font-ui)', borderBottom: `1px solid ${C.border}`, paddingBottom: 14 }}>{lp.summary}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {lp.steps.map((step, i) => (
                      <div key={i} style={{ background: C.bg2, padding: '12px 14px', borderLeft: `2px solid ${lp.color}50`, borderRadius: '8px' }}>
                        <div style={{ fontSize: 12, color: lp.color, marginBottom: 6, fontFamily: 'var(--font-ui)', fontWeight: 600 }}>{i + 1}. {step.title}</div>
                        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.85, fontFamily: 'var(--font-ui)' }}>{step.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
