import React, { useEffect, useState } from 'react';
import { INSTITUTIONS } from '../data/institutions.js';
import { scoreScholarship } from '../services/scoringEngine.js';
import ScholarshipMatchSummary from './ScholarshipMatchSummary.jsx';
import ScholarshipDocumentImport from './ScholarshipDocumentImport.jsx';
import { getAllowedApplicationTransitions, loadApplicationTracking, saveApplicationTracking, updateApplicationChecklist, updateApplicationTracking } from '../services/supabaseData.js';

function parseMaxFee(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 999999;
  return Math.min(num, 1000000);
}

function joinReasons(reasons) {
  return Array.isArray(reasons) && reasons.length ? reasons.join(" • ") : "";
}

const STATE_LABELS = {
  saved: "Saved",
  drafting: "Drafting",
  submitted: "Submitted",
  interview: "Interview",
  awarded: "Awarded",
  rejected: "Rejected",
};

export default function ScholarshipPage(props) {
  const { C, Chip } = props;
  const { profile, onImportCv, cvImportBusy, cvImportMessage, authUser } = props;

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
  const [trackedApplications, setTrackedApplications] = useState({});
  const [refereeInputs, setRefereeInputs] = useState({});

  useEffect(() => { localStorage.setItem('scholarship_shortlist', JSON.stringify(shortlist)); }, [shortlist]);
  useEffect(() => { localStorage.setItem('scholarship_consent', JSON.stringify(consentGiven)); }, [consentGiven]);
  useEffect(() => {
    let mounted = true;
    async function loadTracking() {
      if (!profile?.id || typeof loadApplicationTracking !== 'function') {
        if (mounted) setTrackedApplications({});
        return;
      }
      try {
        const rows = await loadApplicationTracking(profile.id);
        if (!mounted) return;
        const mapped = {};
        for (const row of rows) {
          mapped[row.scholarship_id] = row;
        }
        setTrackedApplications(mapped);
      } catch {
        if (mounted) setTrackedApplications({});
      }
    }
    loadTracking();
    return () => { mounted = false; };
  }, [profile?.id]);

  function deleteData() {
    if (!window.confirm('Delete all scholarship data (shortlist) from this browser?')) return;
    setShortlist([]);
    setConsentGiven(false);
    localStorage.removeItem('scholarship_shortlist');
    localStorage.removeItem('scholarship_consent');
    alert('Local scholarship data deleted.');
  }

  function acceptConsentForPending(give) {
    if (give) {
      setConsentGiven(true);
      if (pendingShortlistId) {
        setShortlist((current) =>
          current.includes(pendingShortlistId)
            ? current.filter((item) => item !== pendingShortlistId)
            : [...current, pendingShortlistId]
        );
      }
    }
    setPendingShortlistId(null);
    setShowConsentModal(false);
  }

  const toggleShortlist = (id) => {
    if (!consentGiven) {
      setPendingShortlistId(id);
      setShowConsentModal(true);
      return;
    }
    setShortlist((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const trackApplication = async (scholarship) => {
    if (!profile?.id || !authUser) return;
    try {
      const saved = await saveApplicationTracking(profile.id, scholarship, trackedApplications[scholarship.id]?.state || "saved");
      if (saved) {
        setTrackedApplications((current) => ({
          ...current,
          [scholarship.id]: saved,
        }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const advanceApplication = async (scholarshipId, nextState) => {
    if (!profile?.id || !authUser) return;
    try {
      const saved = await updateApplicationTracking(profile.id, scholarshipId, nextState);
      if (saved) {
        setTrackedApplications((current) => ({
          ...current,
          [scholarshipId]: saved,
        }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const updateChecklist = async (scholarshipId, nextChecklistPatch) => {
    if (!profile?.id || !authUser) return;
    try {
      const saved = await updateApplicationChecklist(profile.id, scholarshipId, nextChecklistPatch);
      if (saved) {
        setTrackedApplications((current) => ({
          ...current,
          [scholarshipId]: saved,
        }));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const toggleRequiredDocument = async (scholarshipId, documentName) => {
    const tracked = trackedApplications[scholarshipId];
    if (!tracked) return;
    const existingChecklist = tracked.documents_checklist || {};
    const completedDocuments = Array.isArray(existingChecklist.completedDocuments)
      ? existingChecklist.completedDocuments
      : [];
    const normalizedName = String(documentName || "").trim();
    if (!normalizedName) return;
    const nextCompleted = completedDocuments.includes(normalizedName)
      ? completedDocuments.filter((item) => item !== normalizedName)
      : [...completedDocuments, normalizedName];
    await updateChecklist(scholarshipId, {
      documents_checklist: {
        ...existingChecklist,
        completedDocuments: nextCompleted,
      },
    });
  };

  const addReferee = async (scholarshipId) => {
    const nextReferee = String(refereeInputs[scholarshipId] || "").trim();
    if (!nextReferee) return;
    const tracked = trackedApplications[scholarshipId];
    if (!tracked) return;
    const currentReferees = Array.isArray(tracked.referees) ? tracked.referees : [];
    if (currentReferees.some((referee) => String(referee?.name || referee).trim().toLowerCase() === nextReferee.toLowerCase())) {
      setRefereeInputs((current) => ({ ...current, [scholarshipId]: "" }));
      return;
    }
    const nextReferees = [...currentReferees, { name: nextReferee, status: "pending" }];
    await updateChecklist(scholarshipId, { referees: nextReferees });
    setRefereeInputs((current) => ({ ...current, [scholarshipId]: "" }));
  };

  const removeReferee = async (scholarshipId, refereeIndex) => {
    const tracked = trackedApplications[scholarshipId];
    if (!tracked) return;
    const currentReferees = Array.isArray(tracked.referees) ? tracked.referees : [];
    const nextReferees = currentReferees.filter((_, index) => index !== refereeIndex);
    await updateChecklist(scholarshipId, { referees: nextReferees });
  };

  const maxFeeNum = parseMaxFee(maxFee);
  const scored = INSTITUTIONS
    .filter((inst) => region === 'All' || inst.country === region || inst.city === region)
    .filter((inst) => inst.tuition_international_yearly <= maxFeeNum)
    .map((inst) => ({ inst, analysis: scoreScholarship(inst, profile || {}) }))
    .sort((a, b) => {
      if (a.analysis.blocked !== b.analysis.blocked) return a.analysis.blocked ? 1 : -1;
      return b.analysis.score - a.analysis.score;
    });

  return (
    <div className="scholarship-page">
      <div className="scholarship-hero">
        <div className="scholarship-hero-main">
          <div className="scholarship-kicker">Scholarships surface</div>
          <h2 className="scholarship-title">Find, score, and shortlist opportunities against a live candidate profile.</h2>
          <p className="scholarship-copy">
            The ranking model now uses structured profile data instead of pasted CV text. Upload a document, confirm the extracted fields, and the system can explain why each scholarship ranks where it does.
          </p>
          <div className="scholarship-metrics">
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Matched</span>
              <span className="scholarship-metric-value">{scored.length}</span>
            </div>
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Regions</span>
              <span className="scholarship-metric-value">5</span>
            </div>
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Profile mode</span>
              <span className="scholarship-metric-value">{profile?.tier || "free"}</span>
            </div>
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Tracked</span>
              <span className="scholarship-metric-value">{Object.keys(trackedApplications).length}</span>
            </div>
          </div>
        </div>
        <div className="scholarship-hero-side">
          <ScholarshipMatchSummary profile={profile} scored={scored} shortlist={shortlist} C={C} Chip={Chip} />
        </div>
      </div>

      <div className="scholarship-grid">
        <ScholarshipDocumentImport
          authUser={authUser}
          profile={profile}
          onImport={onImportCv}
          busy={cvImportBusy}
          message={cvImportMessage}
        />

        <div className="scholarship-card scholarship-filter-card">
          <div className="scholarship-card-label">Filters</div>
          <div className="scholarship-filter-stack">
            <label className="scholarship-control">
              <span>Region</span>
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                {['All', 'UK', 'US', 'Canada', 'Europe', 'Australia'].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="scholarship-control">
              <span>Max tuition (annual)</span>
              <input type="number" value={maxFee} onChange={(e) => setMaxFee(e.target.value)} />
            </label>
            <div className="scholarship-note">
              Saved shortlist stays local until the server-side flow is ready.
            </div>
            <button onClick={deleteData} className="ghost-btn scholarship-ghost-btn">Delete local shortlist</button>
          </div>
        </div>

        <div className="scholarship-card scholarship-intro-card">
          <div className="scholarship-card-label">Matching logic</div>
          <div className="scholarship-intro-copy">
            Discipline, geography, language readiness, degree class, funding value, urgency, and source confidence all contribute to the final score.
          </div>
          <div className="scholarship-intro-chips">
            <Chip label="Explainable" color={C.accent} small />
            <Chip label="Profile-based" color={C.green} small />
            <Chip label="Document-ready" color={C.amber} small />
          </div>
        </div>
      </div>

      <div className="scholarship-results-label">
        {scored.length} institutions matched
      </div>

      <div className="scholarship-results">
        {scored.map(({ inst, analysis }) => {
          const ihsTotal = Math.round((inst.IHS_per_year * Math.ceil(inst.typical_program_length_months / 12)) || 0);
          const initials = inst.name.split(' ').slice(0,2).map((part) => part[0]).join('').toUpperCase();
          const topCriteria = analysis.criteria.slice(0, 3);
          const tracked = trackedApplications[inst.id];
          const allowedStates = tracked ? getAllowedApplicationTransitions(tracked.state) : [];
          const checklist = tracked?.documents_checklist || {};
          const requiredDocuments = Array.isArray(checklist.requiredDocuments) ? checklist.requiredDocuments : [];
          const completedDocuments = Array.isArray(checklist.completedDocuments) ? checklist.completedDocuments : [];
          const refereesRequired = Number(checklist.refereesRequired || 0);
          const referees = Array.isArray(tracked?.referees) ? tracked.referees : [];
          const refereeCount = referees.length;

          return (
            <div key={inst.id} className="sch-card">
              <div className="sch-avatar">{initials}</div>
              <div style={{flex:1}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8,gap:12,flexWrap:'wrap'}}>
                  <div>
                    <div style={{fontSize:17,fontWeight:700,fontFamily:'var(--font-serif)',letterSpacing:'-0.02em'}}>{inst.name}</div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:'var(--font-ui)'}}>{inst.city}, {inst.country}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
                    <Chip label={`Fit ${analysis.score}/100`} color={analysis.blocked ? C.amber : C.green} small />
                    {analysis.blocked && <Chip label="Needs review" color={C.red} small />}
                    {tracked && <Chip label={`Tracked: ${tracked.state}`} color={C.accent} small />}
                    {tracked && <Chip label={`Urgency ${analysis.urgency?.score || 0}/10`} color={C.amber} small />}
                    <div style={{fontSize:13,fontFamily:'var(--font-ui)'}}>{inst.currency} {inst.tuition_international_yearly.toLocaleString()}</div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:'var(--font-ui)'}}>IHS est: {inst.currency} {ihsTotal}</div>
                  </div>
                </div>

                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                  {topCriteria.map((criterion) => (
                    <Chip key={criterion.key} label={`${criterion.label}: ${criterion.score}/${criterion.max}`} color={criterion.score > 0 ? C.green : C.amber} small />
                  ))}
                </div>

                {analysis.blockedReasons.length > 0 && (
                  <div style={{fontSize:12,color:C.red,fontFamily:'var(--font-ui)',lineHeight:1.7,marginBottom:8}}>
                    Blocked: {joinReasons(analysis.blockedReasons)}
                  </div>
                )}

                <div style={{fontSize:13,color:C.muted,marginBottom:8,fontFamily:'var(--font-ui)',lineHeight:1.7}}>{inst.notes}</div>
                {tracked && (
                  <div style={{display:'grid',gap:8,marginBottom:10,padding:'12px',border:'1px solid var(--border)',borderRadius:'14px',background:'rgba(255,255,255,0.6)'}}>
                    <div style={{fontSize:12,fontFamily:'var(--font-ui)',color:C.text}}>
                      Checklist: {requiredDocuments.length ? `${completedDocuments.length}/${requiredDocuments.length} complete` : "No checklist loaded"}
                    </div>
                    {requiredDocuments.length > 0 && (
                      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                        {requiredDocuments.map((documentName) => {
                          const done = completedDocuments.includes(documentName);
                          return (
                            <button
                              key={documentName}
                              type="button"
                              onClick={() => toggleRequiredDocument(inst.id, documentName)}
                              className="ghost-btn"
                              style={{
                                padding: '7px 10px',
                                borderRadius: '999px',
                                borderColor: done ? C.green : 'var(--border)',
                                background: done ? 'rgba(94, 141, 69, 0.12)' : 'transparent',
                                color: done ? C.text : C.muted,
                              }}
                            >
                              {done ? "[x] " : ""}{documentName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{fontSize:12,fontFamily:'var(--font-ui)',color:C.text}}>
                      Referees: {refereeCount}/{refereesRequired || 0}
                    </div>
                    {referees.length > 0 && (
                      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                        {referees.map((referee, index) => {
                          const name = typeof referee === "string" ? referee : referee?.name || `Referee ${index + 1}`;
                          const status = typeof referee === "object" && referee?.status ? referee.status : "pending";
                          return (
                            <button
                              key={`${name}-${index}`}
                              type="button"
                              onClick={() => removeReferee(inst.id, index)}
                              className="ghost-btn"
                              style={{
                                padding: '7px 10px',
                                borderRadius: '999px',
                                borderColor: 'var(--border)',
                                color: C.text,
                              }}
                              title="Remove referee"
                            >
                              {name} · {status} ×
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                      <label className="scholarship-control" style={{margin:0, minWidth:'180px'}}>
                        <span>Update state</span>
                        <select value={tracked.state} onChange={(e) => advanceApplication(inst.id, e.target.value)}>
                          <option value={tracked.state}>{STATE_LABELS[tracked.state] || tracked.state}</option>
                          {allowedStates.map((state) => (
                            <option key={state} value={state}>{STATE_LABELS[state] || state}</option>
                          ))}
                        </select>
                      </label>
                      <label className="scholarship-control" style={{margin:0, minWidth:'220px', flex:1}}>
                        <span>Add referee</span>
                        <input
                          value={refereeInputs[inst.id] || ""}
                          onChange={(e) => setRefereeInputs((current) => ({ ...current, [inst.id]: e.target.value }))}
                          placeholder="Enter referee name"
                        />
                      </label>
                      <button
                        type="button"
                        className="ghost-btn"
                        style={{ padding: '9px 14px' }}
                        onClick={() => addReferee(inst.id)}
                      >
                        Add referee
                      </button>
                    </div>
                  </div>
                )}
                <div className="sch-actions">
                  <button onClick={() => toggleShortlist(inst.id)} className="ghost-btn" style={{padding:'9px 14px'}}>{shortlist.includes(inst.id) ? 'Remove from shortlist' : 'Save to shortlist'}</button>
                  <button onClick={() => trackApplication(inst)} className="ghost-btn" style={{padding:'9px 14px'}} disabled={!authUser || !profile?.id}>
                    {tracked ? 'Update tracker' : 'Track application'}
                  </button>
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
            <div className="body">To save items to shortlist you must consent to storing minimal metadata locally. No data will be uploaded without explicit confirmation.</div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button onClick={() => { setShowConsentModal(false); setPendingShortlistId(null); }} className="ghost-btn" style={{padding:'8px 12px'}}>Cancel</button>
              <button onClick={() => { acceptConsentForPending(true); }} className="primary-btn" style={{padding:'8px 12px'}}>Give consent & save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
