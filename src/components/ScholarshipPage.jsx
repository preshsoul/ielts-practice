import React, { useState, useEffect } from 'react';
import { INSTITUTIONS } from '../data/institutions.js';
import InputSanitizer from '../services/inputSanitizer.js';
import securityLogger from '../services/securityLogger.js';

export default function ScholarshipPage(props) {
  const { C, Chip, PrimaryBtn } = props;
  const [cvText, setCvText] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [region, setRegion] = useState('All');
  const [maxFee, setMaxFee] = useState(999999);
  const [shortlist, setShortlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('scholarship_shortlist') || '[]'); } catch { return []; }
  });
  const [consentGiven, setConsentGiven] = useState(() => {
    try { return JSON.parse(localStorage.getItem('scholarship_consent') || 'false'); } catch { return false; }
  });
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingShortlistId, setPendingShortlistId] = useState(null);

  useEffect(() => { localStorage.setItem('scholarship_shortlist', JSON.stringify(shortlist)); }, [shortlist]);
  useEffect(() => { localStorage.setItem('scholarship_consent', JSON.stringify(consentGiven)); }, [consentGiven]);

  function parseKeywords(text) {
    // Sanitize input first
    const sanitizedText = InputSanitizer.sanitizeText(text);
    if (!sanitizedText) return [];

    // Check for suspicious patterns
    if (InputSanitizer.containsSuspiciousPatterns(text)) {
      securityLogger.logSuspiciousActivity('SUSPICIOUS_KEYWORD_INPUT', {
        originalLength: text.length,
        sanitizedLength: sanitizedText.length
      });
    }

    // Very small client-side extractor: split, remove short/stopwords, count
    const stop = new Set(['and','the','of','in','to','a','for','with','on','by','is','are','that','this','as','an','be','from','it','its']);
    const toks = sanitizedText.toLowerCase().replace(/[\W_]+/g,' ').split(/\s+/).filter(t=>t && t.length>2 && !stop.has(t));
    const freq = {};
    toks.forEach(t=>freq[t]=(freq[t]||0)+1);
    return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,20).map(e=>e[0]);
  }

  const onExtract = () => {
    setKeywords(parseKeywords(cvText));
  };

  function parseMaxFee(value) {
    const sanitizedValue = InputSanitizer.sanitizeText(value);
    const num = InputSanitizer.sanitizeNumber(sanitizedValue, 0, 1000000); // Max 1M for reasonable limits
    return num !== null ? num : 999999;
  }

  const regions = ['All', 'UK', 'US', 'Canada', 'Europe', 'Australia'];

  const filtered = INSTITUTIONS.filter(inst => {
    const maxFeeNum = parseMaxFee(maxFee);
    return (region === 'All' || inst.country === region || inst.city === region) &&
           inst.tuition_international_yearly <= maxFeeNum &&
           (keywords.length === 0 || keywords.some(k =>
             inst.research_areas.join(' ').toLowerCase().includes(k.toLowerCase()) ||
             inst.name.toLowerCase().includes(k.toLowerCase())
           ));
  });

  function exportData(){
    const payload = {shortlist, keywords, cvText, consentGiven, timestamp: new Date().toISOString()};
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'scholarship-data.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      alert('Exported scholarship data.');
    } catch(e){ console.error(e); alert('Export failed.'); }
  }

  function deleteData(){
    if(!window.confirm('Delete all scholarship data (shortlist, CV text, keywords) from this browser?')) return;
    setShortlist([]); setCvText(''); setKeywords([]); setConsentGiven(false);
    localStorage.removeItem('scholarship_shortlist'); localStorage.removeItem('scholarship_consent');
    alert('Local scholarship data deleted.');
  }

  function acceptConsentForPending(give){
    if(give){
      setConsentGiven(true);
      if(pendingShortlistId){
        setShortlist(s => s.includes(pendingShortlistId) ? s.filter(x=>x!==pendingShortlistId) : [...s, pendingShortlistId]);
      }
    }
    setPendingShortlistId(null);
    setShowConsentModal(false);
  }

  const toggleShortlist = (id) => {
    if(!consentGiven){
      setPendingShortlistId(id);
      setShowConsentModal(true);
      return;
    }
    setShortlist(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id]);
  };

  return (
    <div>
      <div style={{display:'flex',gap:12,marginBottom:16}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8,fontFamily:'var(--font-ui)',letterSpacing:'0.12em',textTransform:'uppercase'}}>Paste or drop your CV / profile text</div>
          <textarea value={cvText} onChange={e=>setCvText(e.target.value)} style={{width:'100%',height:140,padding:14,fontFamily:'var(--font-ui)',borderRadius:'8px'}} placeholder="Paste CV text here (no upload in prototype)" />
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <PrimaryBtn onClick={onExtract}>Extract keywords</PrimaryBtn>
            <button onClick={()=>{setCvText(''); setKeywords([]);}} className="ghost-btn" style={{padding:'9px 14px'}}>Clear</button>
          </div>
          {keywords.length>0 && <div style={{marginTop:12}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:6,fontFamily:'var(--font-ui)',letterSpacing:'0.12em',textTransform:'uppercase'}}>Extracted keywords</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{keywords.map(k=><Chip key={k} label={k} color={C.accent} />)}</div>
          </div>}
        </div>
        <div style={{width:320}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:8,fontFamily:'var(--font-ui)',letterSpacing:'0.12em',textTransform:'uppercase'}}>Filters</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <select value={region} onChange={e=>setRegion(e.target.value)} style={{padding:10,borderRadius:'8px'}}>
              {regions.map(r=> <option key={r} value={r}>{r}</option>)}
            </select>
            <div>
              <div style={{fontSize:12,marginBottom:6,fontFamily:'var(--font-ui)',color:C.muted}}>Max tuition (annual)</div>
              <input type="number" value={maxFee} onChange={e=>setMaxFee(e.target.value)} style={{width:'100%',padding:10,borderRadius:'8px'}} />
            </div>
            <div>
              <div style={{fontSize:12,marginBottom:6,fontFamily:'var(--font-ui)',color:C.muted}}>Shortlist</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {shortlist.length===0 && <div style={{color:C.muted}}>No items saved</div>}
                {shortlist.map(id=>{
                  const it = INSTITUTIONS.find(x=>x.id===id); if(!it) return null;
                  return <div key={id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontSize:13}}>{it.name}</div>
                    <button onClick={()=>toggleShortlist(id)} className="ghost-btn" style={{padding:'6px 10px'}}>Remove</button>
                  </div>;
                })}
              </div>
            </div>
            <div style={{fontSize:12,color:C.muted,fontFamily:'var(--font-ui)',lineHeight:1.7}}>Server sync: placeholder — will ask consent before any server-side storage.</div>
            <div style={{marginTop:10,display:'flex',gap:8,flexDirection:'column'}}>
              <label style={{fontSize:12,fontFamily:'var(--font-ui)',color:C.text}}>Consent to server storage (placeholder)</label>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input id="consent" type="checkbox" checked={consentGiven} onChange={e=>setConsentGiven(e.target.checked)} />
                <label htmlFor="consent" style={{fontSize:12,color:C.muted,fontFamily:'var(--font-ui)',lineHeight:1.6}}>I consent to storing my CV keywords and shortlist on the server (will ask again before any real upload)</label>
              </div>
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button onClick={exportData} className="ghost-btn" style={{padding:'8px 12px'}}>Export data</button>
                <button onClick={deleteData} className="ghost-btn" style={{padding:'8px 12px'}}>Delete local data</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{fontSize:11,color:C.muted,marginBottom:8,fontFamily:'var(--font-ui)',letterSpacing:'0.12em',textTransform:'uppercase'}}>{filtered.length} institutions matched</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:12}}>
        {filtered.map(inst=>{
          const ihsTotal = Math.round((inst.IHS_per_year * Math.ceil(inst.typical_program_length_months/12)) || 0);
          const initials = inst.name.split(' ').slice(0,2).map(s=>s[0]).join('').toUpperCase();
          return (
            <div key={inst.id} className="sch-card">
              <div className="sch-avatar">{initials}</div>
              <div style={{flex:1}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <div>
                    <div style={{fontSize:17,fontWeight:700,fontFamily:'var(--font-serif)',letterSpacing:'-0.02em'}}>{inst.name}</div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:'var(--font-ui)'}}>{inst.city}, {inst.country}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
                    <div style={{fontSize:13,fontFamily:'var(--font-ui)'}}>{inst.currency} {inst.tuition_international_yearly.toLocaleString()}</div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:'var(--font-ui)'}}>Living: {inst.living_cost_monthly_by_city['London'] ? `From ${inst.currency} ${inst.living_cost_monthly_by_city[inst.city]||inst.living_cost_monthly_by_city['London']}/mo` : ''}</div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:'var(--font-ui)'}}>IHS est: {inst.currency} {ihsTotal}</div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:'var(--font-ui)'}}>CAS speed: {inst.CAS_issuance_speed}</div>
                  </div>
                </div>
                <div style={{fontSize:13,color:C.muted,marginBottom:8,fontFamily:'var(--font-ui)',lineHeight:1.7}}>{inst.notes}</div>
                <div className="sch-actions">
                  <button onClick={()=>toggleShortlist(inst.id)} className="ghost-btn" style={{padding:'9px 14px'}}>{shortlist.includes(inst.id)?'Remove from shortlist':'Save to shortlist'}</button>
                  <a href={inst.website} target="_blank" rel="noreferrer" className="ghost-btn" style={{padding:'9px 14px',textDecoration:'none',display:'inline-flex',alignItems:'center'}}>Open website</a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showConsentModal && (
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.4)'}}>
        <div role="dialog" aria-modal="true" className="modal">
            <div className="title">Consent required</div>
            <div className="body">To save items to shortlist you must consent to storing minimal metadata locally and (optionally) on a server. No data will be uploaded without explicit confirmation.</div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button onClick={()=>{ setShowConsentModal(false); setPendingShortlistId(null); }} className="ghost-btn" style={{padding:'8px 12px'}}>Cancel</button>
              <button onClick={()=>{ acceptConsentForPending(true); }} className="primary-btn" style={{padding:'8px 12px'}}>Give consent & save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
