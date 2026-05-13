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
import {
  buildPlainMatchReasons,
  formatIeltsScore,
} from "../../lib/opportunitySignals.js";

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

function formatScholarshipDate(value) {
  if (!value) return "Open";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Open";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function isGenericScholarshipTitle(value) {
  const title = String(value || "").toLowerCase();
  if (!title) return true;
  const noiseFragments = [
    "faq",
    "funding body",
    "scholarships",
    "scholarship region",
    "scholarship announcements",
    "scholarship applicants",
    "information for scholarship",
    "funding options",
    "student",
    "application form",
  ];
  if (noiseFragments.some((fragment) => title === fragment || title.includes(fragment))) return true;
  if (title.length < 18) return true;
  return false;
}

function normalizeRequirementsSummary(value) {
  const text = String(value || "").trim();
  if (!text) return "Requirements are listed on the source page.";
  if (/eligibility details were extracted/i.test(text)) return "Requirements are listed on the source page.";
  if (text.length < 32) return "Requirements are listed on the source page.";
  return text;
}

function ScholarshipResultCard({
  scholarship,
  analysis,
  tracked,
  shortlistSaved,
  authUser,
  profileId,
  matchingProfile,
  C,
  toggleShortlist,
  trackApplication,
  openIntelPanel,
  handleOpenWebsite,
  shortlistBusy,
  toggleRequiredDocument,
  removeReferee,
  advanceApplication,
  addReferee,
  refereeInputs,
  setRefereeInputs,
  onRefereeInputChange,
  getScholarshipTitle,
  getScholarshipTuition,
  getScholarshipProvider,
}) {
  const topCriteria = analysis.criteria.slice(0, 2);
  const checklist = tracked?.documents_checklist || {};
  const requiredDocuments = Array.isArray(checklist.requiredDocuments) ? checklist.requiredDocuments : [];
  const completedDocuments = Array.isArray(checklist.completedDocuments) ? checklist.completedDocuments : [];
  const referees = Array.isArray(tracked?.referees) ? tracked.referees : [];
  const refereeCount = referees.length;
  const refereesRequired = Number(checklist.refereesRequired || 0);
  const initials = String(getScholarshipTitle(scholarship))
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const requirementsSummary = normalizeRequirementsSummary(scholarship.requirementsSummary || scholarship.notes || scholarship.summary);
  const provider = getScholarshipProvider(scholarship);
  const applyUrl = cleanUrl(scholarship?.application?.url || scholarship?.website);

  return (
    <article className="scholarship-result-card">
      <div className="scholarship-result-card__top">
        <div className="scholarship-result-card__mark">{initials}</div>
        <div className="scholarship-result-card__status">
          <span className="scholarship-result-card__flag">{analysis.score >= 80 ? "Urgent" : analysis.score >= 60 ? "Open" : "Soon"}</span>
          <span className="scholarship-result-card__dots" aria-hidden="true">
            <span className={analysis.provenanceConfidence >= 0.8 ? "is-on" : "is-off"} />
            <span className={analysis.provenanceConfidence >= 0.6 ? "is-on" : "is-off"} />
            <span className={analysis.provenanceConfidence >= 0.4 ? "is-on" : "is-off"} />
          </span>
        </div>
      </div>
      <div className="scholarship-result-card__body">
        {provider && provider.toLowerCase() !== "funding body" && (
          <div className="scholarship-result-card__label">{provider}</div>
        )}
        <h3 className="scholarship-result-card__title">{cleanText(getScholarshipTitle(scholarship), { maxLength: 140 })}</h3>
        <div className="scholarship-result-card__meta">
          <span>{cleanText(scholarship.city, { maxLength: 40 })}, {cleanText(scholarship.country, { maxLength: 40 })}</span>
          <span>Deadline {formatScholarshipDate(scholarship.deadline)}</span>
        </div>
        <div className="scholarship-result-card__summary">
          <strong>Requirements</strong> {cleanText(requirementsSummary, { maxLength: 220 })}
        </div>
        <div className="scholarship-result-card__criteria">
          <span className="scholarship-result-card__chip scholarship-result-card__chip--accent">Fit {analysis.score}/100</span>
          <span className="scholarship-result-card__chip">Profile {Math.round((analysis.retrievalScore || 0) * 100)}%</span>
        </div>
      </div>

      <div className="scholarship-result-card__footer">
        <button type="button" onClick={() => toggleShortlist(scholarship.id)} className="ghost-btn scholarship-result-card__button" disabled={!authUser || shortlistBusy}>
          {shortlistSaved ? "Remove" : "Shortlist"}
        </button>
        <button type="button" onClick={() => trackApplication(scholarship)} className="ghost-btn scholarship-result-card__button" disabled={!authUser || !profileId}>
          {tracked ? "Track" : "Apply tracker"}
        </button>
        <button
          type="button"
          className="ghost-btn scholarship-result-card__button"
          onClick={() => openIntelPanel({
            eyebrow: "Why this match",
            title: getScholarshipTitle(scholarship),
            summary: `${analysis.score}/100 fit`,
            details: buildPlainMatchReasons({ analysis, profile: matchingProfile, scholarship }).join(" ") || "It is one of the closest matches for your current profile.",
            metrics: [
              { label: "Deadline", value: formatScholarshipDate(scholarship.deadline) },
              { label: "IELTS", value: formatIeltsScore(matchingProfile) || "Not added" },
              { label: "Confidence", value: `${Math.round((analysis.provenanceConfidence || 0) * 100)}%` },
            ],
            links: scholarship.website ? [{ label: "Open website", href: cleanUrl(scholarship.website) }] : [],
          })}
        >
          Why chosen
        </button>
        {applyUrl ? (
          <button
            type="button"
            className="ghost-btn scholarship-result-card__button scholarship-result-card__button--primary"
            onClick={() => handleOpenWebsite(scholarship, applyUrl)}
          >
            Open apply link
          </button>
        ) : (
          <span className="scholarship-result-card__button scholarship-result-card__button--disabled">Website unavailable</span>
        )}
      </div>

      {tracked && (
        <div className="scholarship-result-card__tracking">
          <div className="scholarship-result-card__tracking-row">
            <span>Tracking</span>
            <strong>{tracked.state}</strong>
          </div>
          <div className="scholarship-result-card__tracking-row">
            <span>Update state</span>
            <label className="scholarship-control scholarship-control--compact">
              <select value={tracked.state} onChange={(e) => advanceApplication(scholarship.id, e.target.value)}>
                <option value={tracked.state}>{STATE_LABELS[tracked.state] || tracked.state}</option>
                {getAllowedApplicationTransitions(tracked.state).map((state) => (
                  <option key={state} value={state}>{STATE_LABELS[state] || state}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </article>
  );
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

  const handleRefereeInputChange = (scholarshipId, value) => {
    setRefereeInputs((current) => ({ ...current, [scholarshipId]: value }));
  };

  const maxFeeNum = parseMaxFee(maxFee);
  const catalog = useMemo(() => {
    const map = new Map();
    for (const record of Array.isArray(scholarshipCatalog) ? scholarshipCatalog : []) {
      if (!record) continue;
      const key = record.id || record.slug || record.source_url || record.website || record.name || record.title;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, record);
      }
    }
    return [...map.values()];
  }, [scholarshipCatalog]);
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
  const visibleScored = useMemo(() => {
    const seen = new Set();
    return scored
      .filter(({ scholarship, analysis }) => {
        if (analysis?.blocked) return false;
        const title = String(getScholarshipTitle(scholarship) || "").trim().toLowerCase().replace(/\s+/g, " ");
        if (!title || isGenericScholarshipTitle(title)) return false;
        const applyUrl = cleanUrl(scholarship?.application?.url || scholarship?.website);
        if (!applyUrl) return false;
        if (seen.has(title)) return false;
        seen.add(title);
        return true;
      })
      .slice(0, 8);
  }, [scored]);

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
    <div className="scholarship-page scholarship-workspace">
      <div className="scholarship-hero">
        <div className="scholarship-hero-main">
          <div className="scholarship-kicker">Scholarship catalog</div>
          <h2 className="scholarship-title">Postgraduate Funding UK</h2>
          <p className="scholarship-copy">
            Refine your search across premium UK and international funding bodies. High-fit opportunities are ranked by eligibility confidence and deadline pressure.
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
          <div className="scholarship-intro-chips">
            <Chip label={`Matched ${scored.length}`} color={C.green} small />
            <Chip label={`Shortlist ${shortlist.length}`} color={C.accent} small />
            <Chip label={`Tracked ${Object.keys(trackedApplications).length}`} color={C.amber} small />
          </div>
        </div>
        <div className="scholarship-hero-side">
          <ScholarshipMatchSummary profile={matchingProfile} scored={visibleScored} shortlist={shortlist} C={C} Chip={Chip} />
        </div>
      </div>

      <div className="scholarship-surface-grid">
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
        {visibleScored.length} scholarships matched
      </div>

      <div className="scholarship-results-grid">
        {visibleScored.length > 0 ? visibleScored.map(({ scholarship, analysis }) => {
          const tracked = trackedApplications[scholarship.id];
          return (
            <ScholarshipResultCard
              key={scholarship.id}
              scholarship={scholarship}
              analysis={analysis}
              tracked={tracked}
              shortlistSaved={shortlist.includes(scholarship.id)}
              authUser={authUser}
              profileId={profile?.id}
              matchingProfile={matchingProfile}
              C={C}
              toggleShortlist={toggleShortlist}
              trackApplication={trackApplication}
              openIntelPanel={openIntelPanel}
              handleOpenWebsite={handleOpenWebsite}
              shortlistBusy={shortlistBusy}
              advanceApplication={advanceApplication}
              removeReferee={removeReferee}
              addReferee={addReferee}
              refereeInputs={refereeInputs}
              setRefereeInputs={setRefereeInputs}
              onRefereeInputChange={handleRefereeInputChange}
              getScholarshipTitle={getScholarshipTitle}
              getScholarshipTuition={getScholarshipTuition}
              getScholarshipProvider={(item) => item?.awardingBody || item?.sourceLabel || item?.provider || "Funding body"}
            />
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
