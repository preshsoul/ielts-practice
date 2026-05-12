import React, { useEffect, useMemo, useRef, useState } from "react";
import { rankScholarships } from "../../services/scoringEngine.js";
import ScholarshipMatchSummary from "./ScholarshipMatchSummary.jsx";
import ScholarshipDocumentImport from "./ScholarshipDocumentImport.jsx";
import {
  getAllowedApplicationTransitions,
  loadApplicationTracking,
  loadShortlistIds,
  removeShortlist,
  saveApplicationTracking,
  saveMatchEvent,
  saveShortlist,
  updateApplicationChecklist,
  updateApplicationTracking,
} from "../../services/supabaseData.js";
import { cleanText, cleanUrl } from "../../lib/security.js";
import { getProfileCompletion } from "../../lib/profileCompletion.js";
import { useWorkspace } from "../../components/layout/WorkspaceContext.jsx";
import { buildPlainMatchReasons, formatIeltsScore } from "../../lib/opportunitySignals.js";

function parseMaxFee(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 999999;
  return Math.min(num, 1000000);
}

function joinReasons(reasons) {
  return Array.isArray(reasons) && reasons.length ? reasons.join(" • ") : "";
}

function safeWebsiteUrl(value) {
  return cleanUrl(value) || "";
}

function formatManifestDate(value) {
  if (!value) return "Not refreshed yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not refreshed yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildContentSignals(contentManifest, notifications) {
  const deadlines = contentManifest?.deadlines || {};
  const sources = contentManifest?.sources || {};
  const notificationCount = Array.isArray(notifications) ? notifications.length : 0;
  const changeCount = Number(deadlines.changes || 0);
  return [
    {
      label: "Content refreshed",
      value: formatManifestDate(contentManifest?.updated_at),
      tone: "neutral",
    },
    {
      label: "Deadline changes",
      value: `${changeCount}`,
      tone: changeCount > 0 ? "warning" : "success",
      note: changeCount > 0 ? "Review flagged items before saving" : "No changes detected",
    },
    {
      label: "Deadline coverage",
      value: `${Number(deadlines.tracked || 0)} tracked`,
      tone: Number(deadlines.unknown || 0) > 0 ? "warning" : "success",
      note: `${Number(deadlines.rolling || 0)} rolling · ${Number(deadlines.unknown || 0)} unknown`,
    },
    {
      label: "Review feed",
      value: `${notificationCount} notice${notificationCount === 1 ? "" : "s"}`,
      tone: notificationCount > 0 ? "neutral" : "success",
      note: Number(sources?.scholarships?.v2 || 0) > 0 ? `${Number(sources.scholarships.v2)} v2 entries` : "No content feed yet",
    },
  ];
}

const STATE_LABELS = {
  saved: "Saved",
  drafting: "Drafting",
  submitted: "Submitted",
  interview: "Interview",
  awarded: "Awarded",
  rejected: "Rejected",
};

function getScholarshipTitle(scholarship) {
  return scholarship?.name || scholarship?.title || scholarship?.awardingBody || "Scholarship";
}

function getScholarshipTuition(scholarship) {
  const tuition = scholarship?.tuition_international_yearly
    ?? scholarship?.tuition
    ?? scholarship?.stipend_amount
    ?? scholarship?.amountGBP
    ?? scholarship?.coverage?.numericAmount
    ?? 0;
  const parsed = Number(tuition);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ScholarshipPage(props) {
  const { C, Chip } = props;
  const {
    profile,
    profileDraft,
    onImportCv,
    cvImportBusy,
    cvImportMessage,
    authUser,
    contentManifest,
    notifications,
    scholarships = [],
    scholarshipCatalog = [],
  } = props;
  const { openIntelPanel } = useWorkspace();

  const [region, setRegion] = useState("All");
  const [maxFee, setMaxFee] = useState(999999);
  const [shortlist, setShortlist] = useState([]);
  const [shortlistBusy, setShortlistBusy] = useState(false);
  const [shortlistMessage, setShortlistMessage] = useState("");
  const [clearShortlistArmed, setClearShortlistArmed] = useState(false);
  const [trackedApplications, setTrackedApplications] = useState({});
  const [refereeInputs, setRefereeInputs] = useState({});
  const clearShortlistTimerRef = useRef(null);
  const loggedImpressionsRef = useRef(new Set());

  const matchingProfile = profileDraft || profile || {};

  const profileCompletion = getProfileCompletion(matchingProfile || {});
  const isEmptyProfile = profileCompletion.filled === 0;

  useEffect(() => {
    let mounted = true;
    async function loadShortlist() {
      if (!profile?.id || !authUser) {
        if (mounted) setShortlist([]);
        return;
      }
      try {
        const ids = await loadShortlistIds(profile.id);
        if (mounted) setShortlist(ids);
      } catch {
        if (mounted) setShortlist([]);
      }
    }
    loadShortlist();
    return () => {
      mounted = false;
    };
  }, [profile?.id, authUser]);

  useEffect(() => {
    let mounted = true;
    async function loadTracking() {
      if (!profile?.id || typeof loadApplicationTracking !== "function") {
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
    return () => {
      mounted = false;
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!clearShortlistArmed) {
      if (clearShortlistTimerRef.current) {
        window.clearTimeout(clearShortlistTimerRef.current);
        clearShortlistTimerRef.current = null;
      }
      return undefined;
    }

    clearShortlistTimerRef.current = window.setTimeout(() => {
      setClearShortlistArmed(false);
      clearShortlistTimerRef.current = null;
    }, 5000);

    return () => {
      if (clearShortlistTimerRef.current) {
        window.clearTimeout(clearShortlistTimerRef.current);
        clearShortlistTimerRef.current = null;
      }
    };
  }, [clearShortlistArmed]);

  const toggleShortlist = (id) => {
    if (!profile?.id || !authUser) return;
    const isSaved = shortlist.includes(id);
    setShortlistBusy(true);
    setShortlist((current) => (isSaved ? current.filter((item) => item !== id) : [...current, id]));
    (isSaved ? removeShortlist(profile.id, id) : saveShortlist(profile.id, id))
      .then(() => {
        void saveMatchEvent(profile.id, {
          eventType: isSaved ? "dismiss" : "shortlist",
          scholarshipId: id,
          contextJson: {
            source: "scholarships",
            action: isSaved ? "removed_from_shortlist" : "added_to_shortlist",
          },
        }).catch(() => {});
      })
      .catch((error) => {
        console.error(error);
        setShortlist((current) => (isSaved ? [...current, id] : current.filter((item) => item !== id)));
      })
      .finally(() => {
        setShortlistBusy(false);
      });
  };

  const clearShortlist = async () => {
    if (!profile?.id || !authUser || !shortlist.length || shortlistBusy) return;
    if (!clearShortlistArmed) {
      setClearShortlistArmed(true);
      setShortlistMessage("Press clear shortlist again to confirm.");
      return;
    }

    setClearShortlistArmed(false);
    setShortlistMessage("");
    const previous = shortlist;
    setShortlistBusy(true);
    setShortlist([]);
    try {
      await Promise.all(previous.map((id) => removeShortlist(profile.id, id)));
      setShortlistMessage("Shortlist cleared from this account.");
    } catch (error) {
      console.error(error);
      setShortlist(previous);
      setShortlistMessage("Unable to clear shortlist right now.");
    } finally {
      setShortlistBusy(false);
    }
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
        void saveMatchEvent(profile.id, {
          eventType: "apply_start",
          scholarshipId: scholarship.id,
          contextJson: {
            source: "scholarships",
            state: saved.state || "saved",
          },
        }).catch(() => {});
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

  const handleOpenWebsite = (scholarship, url) => {
    if (!url) return;
    if (profile?.id && authUser) {
      void saveMatchEvent(profile.id, {
        eventType: "open",
        scholarshipId: scholarship.id,
        contextJson: {
          source: "scholarships",
          url,
        },
      }).catch(() => {});
    }
    window.open(url, "_blank", "noopener,noreferrer");
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
  const catalog = Array.isArray(scholarshipCatalog) && scholarshipCatalog.length ? scholarshipCatalog : scholarships;
  const regionCount = new Set((Array.isArray(catalog) ? catalog : []).map((item) => item?.country).filter(Boolean)).size;

  const scored = useMemo(() => {
    const regionFiltered = (Array.isArray(catalog) ? catalog : [])
      .filter((scholarship) => region === "All" || scholarship?.country === region || scholarship?.city === region)
      .filter((scholarship) => {
        const tuition = getScholarshipTuition(scholarship);
        return !Number.isFinite(tuition) || tuition <= maxFeeNum;
      });

    const ranked = rankScholarships(regionFiltered, matchingProfile, { limit: 150 });
    return ranked.scored
      .filter(({ analysis }) => !analysis.blocked)
      .sort((a, b) => {
        if (b.analysis.score !== a.analysis.score) return b.analysis.score - a.analysis.score;
        if ((b.analysis.semanticScore || 0) !== (a.analysis.semanticScore || 0)) return (b.analysis.semanticScore || 0) - (a.analysis.semanticScore || 0);
        const aDeadline = a.analysis.normalized?.deadline ? new Date(a.analysis.normalized.deadline).getTime() : Number.POSITIVE_INFINITY;
        const bDeadline = b.analysis.normalized?.deadline ? new Date(b.analysis.normalized.deadline).getTime() : Number.POSITIVE_INFINITY;
        if (aDeadline !== bDeadline) return aDeadline - bDeadline;
        if ((b.analysis.provenanceConfidence || 0) !== (a.analysis.provenanceConfidence || 0)) {
          return (b.analysis.provenanceConfidence || 0) - (a.analysis.provenanceConfidence || 0);
        }
        return String(a.scholarship.id || "").localeCompare(String(b.scholarship.id || ""));
      });
  }, [catalog, region, maxFeeNum, matchingProfile]);

  const contentSignals = buildContentSignals(contentManifest, notifications);
  const latestNotification = Array.isArray(notifications) && notifications.length ? notifications[0] : null;

  useEffect(() => {
    if (!profile?.id || !authUser || !scored.length) return;

    const currentImpressions = loggedImpressionsRef.current;
    const topImpressions = scored.slice(0, 3);

    for (const [index, entry] of topImpressions.entries()) {
      const scholarshipId = entry?.scholarship?.id;
      if (!scholarshipId) continue;
      const key = `${profile.id}:${scholarshipId}:impression`;
      if (currentImpressions.has(key)) continue;
      currentImpressions.add(key);
      void saveMatchEvent(profile.id, {
        eventType: "impression",
        scholarshipId,
        contextJson: {
          rank: index + 1,
          finalScore: entry?.analysis?.score ?? null,
          semanticScore: entry?.analysis?.semanticScore ?? null,
          retrievalScore: entry?.analysis?.retrievalScore ?? null,
          source: "scholarships",
        },
      }).catch(() => {});
    }
  }, [profile?.id, authUser, scored]);

  return (
    <div className="scholarship-page">
      <div className="scholarship-signal-strip">
        {contentSignals.map((signal) => (
          <div key={signal.label} className={`scholarship-signal-card scholarship-signal-${signal.tone}`}>
            <span className="scholarship-signal-label">{signal.label}</span>
            <strong className="scholarship-signal-value">{signal.value}</strong>
            {signal.note && <span className="scholarship-signal-note">{signal.note}</span>}
          </div>
        ))}
      </div>

      <div className="scholarship-hero">
        <div className="scholarship-hero-main">
          <div className="scholarship-kicker">Scholarships surface</div>
          <h2 className="scholarship-title">Scholarships ranked against your profile.</h2>
          <p className="scholarship-copy">
            Ranking uses your CV, IELTS score, degree class, discipline, destination goals, and the opportunity details. Upload a document, confirm the extracted fields, and we’ll show the best matches in plain language.
          </p>
          {isEmptyProfile && (
            <div className="scholarship-alert" role="status" aria-live="polite">
              <div className="scholarship-alert-label">Profile incomplete</div>
              <div className="scholarship-alert-title">Add the missing profile fields to see more matches.</div>
              <div className="scholarship-alert-body">This list stays conservative until the matching engine has enough verified data.</div>
            </div>
          )}
          {latestNotification && (
            <div className="scholarship-alert" role="status" aria-live="polite">
              <div className="scholarship-alert-label">{latestNotification.type || "content"}</div>
              <div className="scholarship-alert-title">{latestNotification.title}</div>
              <div className="scholarship-alert-body">{latestNotification.body}</div>
            </div>
          )}
          <div className="scholarship-metrics">
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Matched</span>
              <span className="scholarship-metric-value">{scored.length}</span>
            </div>
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Regions</span>
              <span className="scholarship-metric-value">{regionCount}</span>
            </div>
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Profile mode</span>
              <span className="scholarship-metric-value">{profile?.tier || "free"}</span>
            </div>
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Tracked</span>
              <span className="scholarship-metric-value">{Object.keys(trackedApplications).length}</span>
            </div>
            <div className="scholarship-metric">
              <span className="scholarship-metric-label">Shortlist</span>
              <span className="scholarship-metric-value">{shortlist.length}</span>
            </div>
          </div>
        </div>
        <div className="scholarship-hero-side">
          <ScholarshipMatchSummary profile={matchingProfile} scored={scored} shortlist={shortlist} C={C} Chip={Chip} />
        </div>
      </div>

      <div className="layout-grid" style={{ ["--grid-cols"]: 12, ["--grid-gap"]: "24px" }}>
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
                {["All", "UK", "US", "Canada", "Europe", "Australia"].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="scholarship-control">
              <span>Max tuition (annual)</span>
              <input type="number" value={maxFee} onChange={(e) => setMaxFee(e.target.value)} />
            </label>
            <div className="scholarship-note">Saved shortlist items sync to your account.</div>
            {shortlistMessage && (
              <div className="scholarship-note" role="status" aria-live="polite">
                {shortlistMessage}
              </div>
            )}
            <button type="button" onClick={clearShortlist} className="ghost-btn scholarship-ghost-btn" disabled={shortlistBusy || !shortlist.length}>
              {clearShortlistArmed ? "Confirm clear shortlist" : "Clear shortlist"}
            </button>
          </div>
        </div>

        <div className="scholarship-card scholarship-intro-card">
          <div className="scholarship-card-label">Matching logic</div>
          <div className="scholarship-intro-copy">
            We compare your CV, IELTS score, degree class, target country, field of study, deadline pressure, and how trustworthy the source looks. Deadline changes and content refresh status are shown above so you can judge trust quickly.
          </div>
          <div className="scholarship-intro-chips">
            <Chip label="Explainable" color={C.accent} small />
            <Chip label="Profile-based" color={C.green} small />
            <Chip label="Document-ready" color={C.amber} small />
          </div>
        </div>
      </div>

      <div className="scholarship-results-label">
        {scored.length} scholarships matched
      </div>

      <div className="scholarship-results">
        {scored.length > 0 ? scored.map(({ scholarship, analysis }) => {
          const ihsTotal = Math.round(((scholarship.IHS_per_year || scholarship.ihsPerYear || 0) * Math.ceil((scholarship.typical_program_length_months || 12) / 12)) || 0);
          const initials = String(getScholarshipTitle(scholarship))
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase();
          const topCriteria = analysis.criteria.slice(0, 3);
          const tracked = trackedApplications[scholarship.id];
          const allowedStates = tracked ? getAllowedApplicationTransitions(tracked.state) : [];
          const checklist = tracked?.documents_checklist || {};
          const requiredDocuments = Array.isArray(checklist.requiredDocuments) ? checklist.requiredDocuments : [];
          const completedDocuments = Array.isArray(checklist.completedDocuments) ? checklist.completedDocuments : [];
          const refereesRequired = Number(checklist.refereesRequired || 0);
          const referees = Array.isArray(tracked?.referees) ? tracked.referees : [];
          const refereeCount = referees.length;

          return (
            <article key={scholarship.id} className="loci-card loci-card--editorial">
              <div className="sch-avatar">{initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font-serif)", letterSpacing: "-0.02em" }}>
                      {cleanText(getScholarshipTitle(scholarship), { maxLength: 160 })}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, fontFamily: "var(--font-ui)" }}>
                      {cleanText(scholarship.city, { maxLength: 80 })}, {cleanText(scholarship.country, { maxLength: 80 })}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <Chip label={`Fit ${analysis.score}/100`} color={analysis.fallback ? C.accent : C.green} small />
                    <Chip label={`CV match ${Math.round((analysis.semanticScore || 0) * 100)}/100`} color={C.accent} small />
                    {analysis.fallback && <Chip label="Fallback ranking" color={C.accent} small />}
                    {tracked && <Chip label={`Tracked: ${tracked.state}`} color={C.accent} small />}
                    <div style={{ fontSize: 13, fontFamily: "var(--font-ui)" }}>{scholarship.currency || "GBP"} {getScholarshipTuition(scholarship).toLocaleString()}</div>
                    <div style={{ fontSize: 12, color: C.muted, fontFamily: "var(--font-ui)" }}>IHS est: {scholarship.currency || "GBP"} {ihsTotal}</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {topCriteria.map((criterion) => (
                    <Chip key={criterion.key} label={`${criterion.label}: ${criterion.score}/${criterion.max}`} color={criterion.score > 0 ? C.green : C.amber} small />
                  ))}
                  <Chip label={`Profile match ${Math.round((analysis.retrievalScore || 0) * 100)}/100`} color={C.accent} small />
                  {analysis.semanticExplanation?.source && (
                    <Chip label={`Why it matched: ${analysis.semanticExplanation.source}`} color={C.accent} small />
                  )}
                </div>

                {analysis.blockedReasons.length > 0 && (
                  <div style={{ fontSize: 12, color: C.red, fontFamily: "var(--font-ui)", lineHeight: 1.7, marginBottom: 8 }}>
                    Blocked: {joinReasons(analysis.blockedReasons)}
                  </div>
                )}

                <div style={{ fontSize: 13, color: C.muted, marginBottom: 8, fontFamily: "var(--font-ui)", lineHeight: 1.7 }}>
                  {cleanText(scholarship.notes, { maxLength: 500 })}
                </div>

                {tracked && (
                  <div style={{ display: "grid", gap: 8, marginBottom: 10, padding: "12px", border: "1px solid var(--border)", borderRadius: "14px", background: "var(--color-bg-surface)" }}>
                    <div style={{ fontSize: 12, fontFamily: "var(--font-ui)", color: C.text }}>
                      Checklist: {requiredDocuments.length ? `${completedDocuments.length}/${requiredDocuments.length} complete` : "No checklist loaded"}
                    </div>
                    {requiredDocuments.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {requiredDocuments.map((documentName) => {
                          const done = completedDocuments.includes(documentName);
                          return (
                            <button
                              key={documentName}
                              type="button"
                              onClick={() => toggleRequiredDocument(scholarship.id, documentName)}
                              className="ghost-btn"
                              style={{
                                padding: "7px 10px",
                                borderRadius: "999px",
                                borderColor: done ? C.green : "var(--border)",
                                background: done ? "var(--green-bg)" : "transparent",
                                color: done ? C.text : C.muted,
                              }}
                            >
                              {done ? "[x] " : ""}{documentName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontFamily: "var(--font-ui)", color: C.text }}>
                      Referees: {refereeCount}/{refereesRequired || 0}
                    </div>
                    {referees.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {referees.map((referee, index) => {
                          const name = typeof referee === "string" ? referee : referee?.name || `Referee ${index + 1}`;
                          const status = typeof referee === "object" && referee?.status ? referee.status : "pending";
                          return (
                            <button
                              key={`${name}-${index}`}
                              type="button"
                              onClick={() => removeReferee(scholarship.id, index)}
                              className="ghost-btn"
                              style={{
                                padding: "7px 10px",
                                borderRadius: "999px",
                                borderColor: "var(--border)",
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
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <label className="scholarship-control" style={{ margin: 0, minWidth: "180px" }}>
                        <span>Update state</span>
                        <select value={tracked.state} onChange={(e) => advanceApplication(scholarship.id, e.target.value)}>
                          <option value={tracked.state}>{STATE_LABELS[tracked.state] || tracked.state}</option>
                          {allowedStates.map((state) => (
                            <option key={state} value={state}>{STATE_LABELS[state] || state}</option>
                          ))}
                        </select>
                      </label>
                      <label className="scholarship-control" style={{ margin: 0, minWidth: "220px", flex: 1 }}>
                        <span>Add referee</span>
                        <input
                          value={refereeInputs[scholarship.id] || ""}
                          onChange={(e) => setRefereeInputs((current) => ({ ...current, [scholarship.id]: e.target.value }))}
                          placeholder="Enter referee name"
                        />
                      </label>
                      <button
                        type="button"
                        className="ghost-btn"
                        style={{ padding: "9px 14px" }}
                        onClick={() => addReferee(scholarship.id)}
                      >
                        Add referee
                      </button>
                    </div>
                  </div>
                )}

                <div className="sch-actions">
                  <button type="button" onClick={() => toggleShortlist(scholarship.id)} className="ghost-btn" style={{ padding: "9px 14px" }} disabled={!authUser || shortlistBusy}>
                    {shortlist.includes(scholarship.id) ? "Remove from shortlist" : "Save to shortlist"}
                  </button>
                  <button type="button" onClick={() => trackApplication(scholarship)} className="ghost-btn" style={{ padding: "9px 14px" }} disabled={!authUser || !profile?.id}>
                    {tracked ? "Update tracker" : "Track application"}
                  </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ padding: "9px 14px" }}
                      onClick={() => openIntelPanel({
                        eyebrow: "Why this match",
                        title: getScholarshipTitle(scholarship),
                        summary: `${analysis.score}/100 fit · ${cleanText(scholarship.city, { maxLength: 40 })}, ${cleanText(scholarship.country, { maxLength: 40 })}`,
                        details: [
                          `Why it was chosen: ${buildPlainMatchReasons({ analysis, profile: matchingProfile, scholarship }).join(" ") || "It is one of the closest matches for your current profile."}`,
                          analysis.blockedReasons.length ? `What still needs attention: ${joinReasons(analysis.blockedReasons)}.` : "Nothing critical is blocking this application right now.",
                        ].filter(Boolean).join(" "),
                        metrics: [
                          { label: "Fit", value: `${analysis.score}/100` },
                          { label: "IELTS", value: formatIeltsScore(matchingProfile) || "Not added" },
                          { label: "Profile match", value: `${Math.round((analysis.retrievalScore || 0) * 100)}%` },
                          { label: "Tuition", value: `${scholarship.currency || "GBP"} ${getScholarshipTuition(scholarship).toLocaleString()}` },
                          { label: "Confidence", value: `${Math.round((analysis.provenanceConfidence || 0) * 100)}%` },
                          { label: "Deadline", value: scholarship.deadline ? new Date(scholarship.deadline).toLocaleDateString("en-GB") : "Open" },
                        ],
                        expert: `We compare your CV, IELTS score, degree class, subject area, destination goal, and deadline to choose matches. ${buildPlainMatchReasons({ analysis, profile: matchingProfile, scholarship }).join(" ")} ${analysis.blockedReasons.length ? `One thing still needs attention: ${joinReasons(analysis.blockedReasons)}.` : ""}`,
                        links: safeWebsiteUrl(scholarship.website) ? [{ label: "Open website", href: safeWebsiteUrl(scholarship.website) }] : [],
                      })}
                    >
                    Inspect intel
                  </button>
                  {safeWebsiteUrl(scholarship.website) ? (
                    <a
                      href={safeWebsiteUrl(scholarship.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ghost-btn"
                      style={{ padding: "9px 14px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                      onClick={(event) => {
                        event.preventDefault();
                        handleOpenWebsite(scholarship, safeWebsiteUrl(scholarship.website));
                      }}
                    >
                      Open website
                    </a>
                  ) : (
                    <span className="ghost-btn" style={{ padding: "9px 14px", display: "inline-flex", alignItems: "center", opacity: 0.55, cursor: "not-allowed" }}>
                      Website unavailable
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="empty-state" role="status" aria-live="polite">
            <div className="empty-state-title">No eligible scholarships found</div>
            <div className="empty-state-copy">
              {isEmptyProfile
                ? "Add nationality, degree class, and discipline to compare more scholarships."
                : "No scholarship survived the current filters. Check nationality, discipline, degree class, and deadline constraints."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
