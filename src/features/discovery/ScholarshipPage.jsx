import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildCorpusIdf, rankScholarships } from "../../services/scoringEngine.js";
import ScholarshipMatchSummary from "../../components/ScholarshipMatchSummary.jsx";
import ScholarshipDocumentImport from "../../components/ScholarshipDocumentImport.jsx";
import {
  getAllowedApplicationTransitions,
  loadApplicationTracking,
  loadShortlistIds,
  removeShortlist,
  saveApplicationTracking,
  saveMatchEvent,
  saveShortlist,
  updateApplicationTracking,
} from "../../services/supabaseData.js";
import { cleanText, cleanUrl } from "../../lib/security.js";
import { getProfileCompletion } from "../../lib/profileCompletion.js";
import { useWorkspace } from "../../components/layout/WorkspaceContext.jsx";
import { logAppError } from "../../lib/appErrors.js";
import {
  buildPlainMatchReasons,
  formatIeltsScore,
} from "../../lib/opportunitySignals.js";

function parseMaxFee(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 999999;
  return Math.min(num, 1000000);
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
      note: Number(sources?.scholarships?.v2 || 0) > 0 ? `${Number(sources.scholarships.v2)} v2 entries` : "No content feed yet",
    },
    {
      label: "Deadline changes",
      value: `${changeCount}`,
      tone: changeCount > 0 ? "warning" : "success",
      note: changeCount > 0 ? "Review flagged items before saving" : "No changes detected",
    },
    {
      label: "Coverage",
      value: `${Number(deadlines.tracked || 0)} tracked`,
      tone: Number(deadlines.unknown || 0) > 0 ? "warning" : "success",
      note: `${Number(deadlines.rolling || 0)} rolling · ${Number(deadlines.unknown || 0)} unknown`,
    },
    {
      label: "Review feed",
      value: `${notificationCount} notice${notificationCount === 1 ? "" : "s"}`,
      tone: notificationCount > 0 ? "neutral" : "success",
      note: notificationCount > 0 ? "Newest review is highlighted below" : "No fresh review notices",
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
  const candidates = [
    scholarship?.title,
    scholarship?.name,
    scholarship?.nameFull,
    scholarship?.name_full,
    scholarship?.awardingBody,
    scholarship?.sourceLabel,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const specific = candidates.find((value) => !isGenericScholarshipTitle(value));
  return specific || candidates[0] || "Scholarship";
}

function getScholarshipProvider(scholarship) {
  return scholarship?.awardingBody || scholarship?.sourceLabel || scholarship?.provider || "Funding body";
}

function getScholarshipWebsite(scholarship) {
  return cleanUrl(
    scholarship?.application?.portal ||
    scholarship?.application_portal ||
    scholarship?.application?.url ||
    scholarship?.application_url ||
    scholarship?.website ||
    scholarship?.source_url ||
    scholarship?.sourceUrl
  ) || "";
}

function getScholarshipWebsiteHost(scholarship) {
  const website = getScholarshipWebsite(scholarship);
  if (!website) return "";
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getScholarshipWebsiteActionLabel(scholarship) {
  const applicationUrl = cleanUrl(
    scholarship?.application?.portal ||
    scholarship?.application_portal ||
    scholarship?.application?.url ||
    scholarship?.application_url ||
    ""
  );
  return applicationUrl ? "Open application portal" : "Open source page";
}

function getScholarshipRequirementsSummary(scholarship) {
  return normalizeRequirementsSummary(
    scholarship?.requirementsSummary ||
    scholarship?.requirements_summary ||
    scholarship?.notes ||
    scholarship?.summary,
  );
}

function getScholarshipLocationLabel(scholarship) {
  const city = cleanText(scholarship?.city || "", { maxLength: 40 });
  const country = cleanText(scholarship?.country || "", { maxLength: 40 });
  if (city && country) return `${city}, ${country}`;
  if (country) return country;

  const audienceScope = String(scholarship?.audienceScope || scholarship?.audience_scope || "").toLowerCase();
  if (audienceScope === "international") return "International route";
  if (audienceScope === "outside_country") return "Outside home country";

  const website = getScholarshipWebsite(scholarship);
  if (website) {
    try {
      return new URL(website).hostname.replace(/^www\./, "");
    } catch {
      return "Source page";
    }
  }

  return "Location not listed";
}

const REGION_HINTS = {
  UK: [" uk ", " united kingdom ", " britain ", " british ", " england ", " scotland ", " wales ", " chevening ", " cambridge ", " oxford "],
  US: [" us ", " usa ", " united states ", " american ", " fulbright "],
  Canada: [" canada ", " canadian "],
  Europe: [" europe ", " european ", " germany ", " france ", " netherlands ", " sweden ", " norway ", " denmark ", " ireland ", " daad "],
  Australia: [" australia ", " australian "],
};

function scholarshipMatchesRegion(scholarship, region) {
  if (region === "All") return true;
  const haystack = ` ${[
    scholarship?.country,
    scholarship?.city,
    scholarship?.title,
    scholarship?.name,
    scholarship?.nameFull,
    scholarship?.name_full,
    scholarship?.awardingBody,
    scholarship?.sourceLabel,
    scholarship?.website,
    scholarship?.source_url,
    scholarship?.audienceScope,
    scholarship?.audience_scope,
  ].map((value) => String(value || "").toLowerCase()).join(" ")} `;
  return (REGION_HINTS[region] || []).some((hint) => haystack.includes(hint));
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

function getDaysUntilDeadline(deadline) {
  if (!deadline) return null;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date - Date.now()) / (1000 * 60 * 60 * 24));
}

function getUrgencyInfo(daysLeft) {
  if (daysLeft === null) return { badge: null, tone: "open" };
  if (daysLeft < 0) return { badge: "Deadline passed", tone: "passed" };
  if (daysLeft <= 14) return { badge: `Closing in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, tone: "urgent" };
  if (daysLeft <= 45) return { badge: `Deadline: ${daysLeft} days`, tone: "soon" };
  return { badge: null, tone: "open" };
}

function getCoverageLabel(scholarship) {
  const type = String(scholarship?.coverage?.type || scholarship?.coverage_type || "").toLowerCase();
  if (type.includes("full")) return "Full Funding";
  const amount = scholarship?.coverage?.numericAmount || scholarship?.amountGBP;
  if (amount) return `£${Number(amount).toLocaleString()}`;
  if (scholarship?.coverage?.stipend) return "Includes Stipend";
  return "";
}

function BookmarkIcon({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

function ScholarshipResultCard({
  scholarship,
  analysis,
  tracked,
  shortlistSaved,
  authUser,
  profileId,
  matchingProfile,
  toggleShortlist,
  trackApplication,
  openIntelPanel,
  handleOpenWebsite,
  shortlistBusy,
  advanceApplication,
}) {
  const provider = getScholarshipProvider(scholarship);
  const requirementsSummary = getScholarshipRequirementsSummary(scholarship);
  const applyUrl = getScholarshipWebsite(scholarship);
  const websiteHost = getScholarshipWebsiteHost(scholarship);
  const initials = String(getScholarshipTitle(scholarship))
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const daysLeft = getDaysUntilDeadline(scholarship.deadline);
  const { badge: urgencyBadge, tone: urgencyTone } = getUrgencyInfo(daysLeft);
  const coverageLabel = getCoverageLabel(scholarship);
  const conf = analysis.provenanceConfidence || 0;
  const confLabel = conf >= 0.7 ? "High Confidence" : conf >= 0.5 ? "Moderate Confidence" : "Low Confidence";
  const fitScore = Math.min(100, Math.max(0, Math.round(analysis.score)));

  return (
    <article className="scholarship-result-card">
      {/* Row 1: urgency badge + bookmark */}
      <div className="scholarship-result-card__top">
        {urgencyBadge ? (
          <span className={`scholarship-result-card__urgency scholarship-result-card__urgency--${urgencyTone}`}>
            {urgencyBadge}
          </span>
        ) : (
          <span className="scholarship-result-card__urgency scholarship-result-card__urgency--open">
            Deadline: {formatScholarshipDate(scholarship.deadline)}
          </span>
        )}
        <button
          type="button"
          className={`scholarship-result-card__bookmark${shortlistSaved ? " is-saved" : ""}`}
          onClick={() => toggleShortlist(scholarship.id)}
          disabled={!authUser || shortlistBusy}
          aria-label={shortlistSaved ? "Remove from shortlist" : "Save to shortlist"}
        >
          <BookmarkIcon filled={shortlistSaved} />
        </button>
      </div>

      {/* Row 2: provider + title + location */}
      <div className="scholarship-result-card__body">
        {provider && provider.toLowerCase() !== "funding body" && (
          <div className="scholarship-result-card__provider">{provider}</div>
        )}
        <h3 className="scholarship-result-card__title">{cleanText(getScholarshipTitle(scholarship), { maxLength: 120 })}</h3>
        <div className="scholarship-result-card__meta">
          <span>{getScholarshipLocationLabel(scholarship)}</span>
        </div>
      </div>

      {/* Row 3: fit score bar */}
      <div className="scholarship-result-card__fit">
        <div className="scholarship-result-card__fit-header">
          <span className="scholarship-result-card__fit-label">Profile fit score</span>
          <span className="scholarship-result-card__fit-pct">{fitScore}%</span>
        </div>
        <div className="scholarship-result-card__fit-track">
          <div className="scholarship-result-card__fit-fill" style={{ width: `${fitScore}%` }} />
        </div>
      </div>

      {/* Row 4: confidence dots + coverage */}
      <div className="scholarship-result-card__footer">
        <div className="scholarship-result-card__confidence">
          <span className="scholarship-result-card__dots" aria-hidden="true">
            <span className={conf >= 0.4 ? "is-on" : "is-off"} />
            <span className={conf >= 0.6 ? "is-on" : "is-off"} />
            <span className={conf >= 0.8 ? "is-on" : "is-off"} />
          </span>
          <span>{confLabel}</span>
        </div>
        {coverageLabel && <span className="scholarship-result-card__coverage">{coverageLabel}</span>}
      </div>

      {/* Row 5: actions */}
      <div className="scholarship-result-card__actions">
        <button
          type="button"
          onClick={() => trackApplication(scholarship)}
          className="ghost-btn scholarship-result-card__button"
          disabled={!authUser || !profileId}
        >
          {tracked ? "Open tracker" : "Start tracking"}
        </button>
        <button
          type="button"
          className="ghost-btn scholarship-result-card__button"
          onClick={() => openIntelPanel({
            eyebrow: "Why this match",
            title: getScholarshipTitle(scholarship),
            summary: `${fitScore}/100 fit`,
            details: buildPlainMatchReasons({ analysis, profile: matchingProfile, scholarship }).join(" ") || "It is one of the closest matches for your current profile.",
            metrics: [
              { label: "Deadline", value: formatScholarshipDate(scholarship.deadline) },
              { label: "IELTS", value: formatIeltsScore(matchingProfile) || "Not added" },
              { label: "Confidence", value: `${Math.round(conf * 100)}%` },
            ],
            links: applyUrl ? [{ label: getScholarshipWebsiteActionLabel(scholarship), href: applyUrl }] : [],
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
            {getScholarshipWebsiteActionLabel(scholarship)}
          </button>
        ) : (
          <span className="scholarship-result-card__button scholarship-result-card__button--disabled">No link available</span>
        )}
      </div>

      {tracked && (
        <div className="scholarship-result-card__tracking">
          <div className="scholarship-result-card__tracking-row">
            <span>Tracking</span>
            <strong>{STATE_LABELS[tracked.state] || tracked.state}</strong>
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

function ScholarshipDetailCard({
  scholarship,
  analysis,
  tracked,
  shortlistSaved,
  authUser,
  profileId,
  matchingProfile,
  toggleShortlist,
  trackApplication,
  handleOpenWebsite,
  openIntelPanel,
  shortlistBusy,
}) {
  const provider = getScholarshipProvider(scholarship);
  const applyUrl = getScholarshipWebsite(scholarship);
  const websiteHost = getScholarshipWebsiteHost(scholarship);
  const reasons = buildPlainMatchReasons({
    analysis,
    profile: matchingProfile,
    scholarship,
  }).slice(0, 4);
  const requirementsSummary = getScholarshipRequirementsSummary(scholarship);

  return (
    <section className="scholarship-detail-card">
      <div className="scholarship-detail-head">
        <div>
          <div className="scholarship-detail-kicker">Top match and why it was chosen</div>
          <div className="scholarship-detail-title">{cleanText(getScholarshipTitle(scholarship), { maxLength: 160 })}</div>
          <div className="scholarship-detail-provider">{cleanText(provider, { maxLength: 90 })}</div>
        </div>
        <div className="scholarship-detail-score">
          <strong>{analysis.score}/100</strong>
          <span>Fit score</span>
        </div>
      </div>

      <div className="scholarship-detail-grid">
        <div className="scholarship-detail-main">
          <div className="scholarship-detail-meta">
            <span>{getScholarshipLocationLabel(scholarship)}</span>
            <span>Deadline {formatScholarshipDate(scholarship.deadline)}</span>
            <span>{formatIeltsScore(matchingProfile) || "IELTS not added"}</span>
            {websiteHost && <span>{websiteHost}</span>}
          </div>
          <div className="scholarship-detail-summary">
            <strong>Requirements</strong>
            {cleanText(requirementsSummary, { maxLength: 360 })}
          </div>
          {reasons.length > 0 && (
            <div className="scholarship-detail-reasons">
              {reasons.map((reason) => (
                <span key={reason} className="scholarship-detail-reason">
                  {cleanText(reason, { maxLength: 140 })}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="scholarship-detail-track">
          <div className="scholarship-detail-track-title">Tracking</div>
          <div className="scholarship-detail-track-row">
            <span>Shortlist</span>
            <strong>{shortlistSaved ? "Saved" : "Not yet"}</strong>
          </div>
          <div className="scholarship-detail-track-row">
            <span>Application</span>
            <strong>{tracked ? (STATE_LABELS[tracked.state] || tracked.state) : "Not started"}</strong>
          </div>
          <div className="scholarship-detail-track-row">
            <span>Required docs</span>
            <strong>{Array.isArray(tracked?.documents_checklist?.requiredDocuments) ? tracked.documents_checklist.requiredDocuments.length : "None listed"}</strong>
          </div>
          <div className="scholarship-detail-track-row">
            <span>Completed docs</span>
            <strong>{Array.isArray(tracked?.documents_checklist?.completedDocuments) ? tracked.documents_checklist.completedDocuments.length : 0}</strong>
          </div>

          <div className="scholarship-detail-step-list">
            <div className="scholarship-detail-step">Review the source page</div>
            <div className="scholarship-detail-step">Check the apply link</div>
            <div className="scholarship-detail-step">Confirm the deadline</div>
          </div>
        </div>
      </div>

      <div className="scholarship-detail-actions">
        <button
          type="button"
          onClick={() => toggleShortlist(scholarship.id)}
          className="ghost-btn scholarship-result-card__button"
          disabled={!authUser || shortlistBusy}
        >
          {shortlistSaved ? "Remove from shortlist" : "Save shortlist"}
        </button>
        <button
          type="button"
          onClick={() => trackApplication(scholarship)}
          className="ghost-btn scholarship-result-card__button"
          disabled={!authUser || !profileId}
        >
          {tracked ? "Open tracker" : "Start tracking"}
        </button>
        <button
          type="button"
          className="ghost-btn scholarship-result-card__button"
          onClick={() => openIntelPanel({
            eyebrow: "Why this match",
            title: getScholarshipTitle(scholarship),
            summary: `${analysis.score}/100 fit`,
            details: reasons.join(" ") || "It is one of the closest matches for your current profile.",
            metrics: [
              { label: "Deadline", value: formatScholarshipDate(scholarship.deadline) },
              { label: "IELTS", value: formatIeltsScore(matchingProfile) || "Not added" },
              { label: "Confidence", value: `${Math.round((analysis.provenanceConfidence || 0) * 100)}%` },
            ],
            links: applyUrl ? [{ label: getScholarshipWebsiteActionLabel(scholarship), href: applyUrl }] : [],
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
            {getScholarshipWebsiteActionLabel(scholarship)}
          </button>
        ) : (
          <span className="scholarship-result-card__button scholarship-result-card__button--disabled">Website unavailable</span>
        )}
      </div>
    </section>
  );
}

export default function ScholarshipPage(props) {
  const { C, Chip } = props;
  const {
    authUser,
    profile,
    profileDraft,
    onImportCv,
    cvImportBusy,
    cvImportMessage,
    contentManifest,
    notifications,
    scholarshipCatalog = [],
  } = props;
  const { openIntelPanel } = useWorkspace();

  const [region, setRegion] = useState("All");
  const [maxFee, setMaxFee] = useState(999999);
  const [closingSoonOnly, setClosingSoonOnly] = useState(false);
  const [shortlist, setShortlist] = useState([]);
  const [shortlistBusy, setShortlistBusy] = useState(false);
  const [shortlistMessage, setShortlistMessage] = useState("");
  const [clearShortlistArmed, setClearShortlistArmed] = useState(false);
  const [trackedApplications, setTrackedApplications] = useState({});
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
        logAppError(error, { event: "SHORTLIST_TOGGLE", scholarshipId: id, profileId: profile.id });
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
      logAppError(error, { event: "SHORTLIST_CLEAR", profileId: profile.id, scholarshipCount: previous.length });
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
      logAppError(error, { event: "APPLICATION_TRACK_START", profileId: profile.id, scholarshipId: scholarship?.id });
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
      logAppError(error, { event: "APPLICATION_TRACK_UPDATE", profileId: profile.id, scholarshipId, nextState });
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

  // Build TF-IDF weights from scholarship corpus (offline, no API)
  const idfWeights = useMemo(() => buildCorpusIdf(catalog), [catalog]);

  const scored = useMemo(() => {
    const regionFiltered = catalog
      .filter((scholarship) => scholarshipMatchesRegion(scholarship, region))
      .filter((scholarship) => {
        const tuition = getScholarshipTuition(scholarship);
        return !Number.isFinite(tuition) || tuition <= maxFeeNum;
      });

    const ranked = rankScholarships(regionFiltered, matchingProfile, { limit: 150, idfWeights });
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

  // Closing-soon quick filter — applied post-rank so urgency doesn't distort match scores
  const displayed = useMemo(function () {
    if (!closingSoonOnly) return scored;
    return scored.filter(function (_ref) {
      var s = _ref.scholarship;
      var dl = s && s.application ? s.application.deadline : (s ? s.deadline : null);
      if (!dl) return false;
      var days = getDaysUntilDeadline(dl);
      return days !== null && days >= 0 && days <= 14;
    });
  }, [scored, closingSoonOnly]);

  const rankedMatches = useMemo(() => {
    const matches = closingSoonOnly ? displayed : scored;
    const seen = new Set();
    return matches.filter(({ scholarship }) => {
      const title = String(getScholarshipTitle(scholarship) || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!title || isGenericScholarshipTitle(title)) return false;
      if (seen.has(title)) return false;
      seen.add(title);
      return true;
    }).slice(0, 8);
  }, [scored]);

  const primaryMatch = rankedMatches[0] || null;
  const secondaryMatches = rankedMatches.slice(1);
  const contentSignals = buildContentSignals(contentManifest, notifications);
  const latestNotification = Array.isArray(notifications) && notifications.length ? notifications[0] : null;

  useEffect(() => {
    if (!profile?.id || !authUser || !rankedMatches.length) return;

    const currentImpressions = loggedImpressionsRef.current;
    const topImpressions = rankedMatches.slice(0, 3);

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
  }, [profile?.id, authUser, rankedMatches]);

  return (
    <div className="scholarship-page scholarship-workspace">
      <div className="scholarship-hero">
        <div className="scholarship-hero-main">
          <div className="scholarship-kicker">Scholarship catalog</div>
          <h2 className="scholarship-title">Postgraduate Funding UK</h2>
          <p className="scholarship-copy">
            Refine your search across premium UK and international funding bodies. High-fit opportunities are ranked by eligibility confidence and deadline pressure.
          </p>

          {latestNotification ? (
            <div className="scholarship-alert" role="status" aria-live="polite">
              <div className="scholarship-alert-label">{latestNotification.type || "content"}</div>
              <div className="scholarship-alert-title">{latestNotification.title}</div>
              <div className="scholarship-alert-body">{latestNotification.body}</div>
            </div>
          ) : (
            <div className="scholarship-alert" role="status" aria-live="polite">
              <div className="scholarship-alert-label">Info</div>
              <div className="scholarship-alert-title">{contentSignals[0].label}</div>
              <div className="scholarship-alert-body">
                {contentSignals[0].note ? `${contentSignals[0].note}. ` : ""}
                Deadline coverage and review signals are reflected in the ranking.
              </div>
            </div>
          )}

          {isEmptyProfile && (
            <div className="scholarship-alert" role="status" aria-live="polite">
              <div className="scholarship-alert-label">Profile incomplete</div>
              <div className="scholarship-alert-title">Add the missing profile fields to see sharper matches.</div>
              <div className="scholarship-alert-body">
                This list stays conservative until the matching engine has enough verified data from your profile or CV.
              </div>
            </div>
          )}

          <div className="scholarship-intro-chips">
            <Chip label={`Matched ${rankedMatches.length}`} color={C.green} small />
            <Chip label={`Shortlist ${shortlist.length}`} color={C.accent} small />
            <Chip label={`Tracked ${Object.keys(trackedApplications).length}`} color={C.amber} small />
          </div>
        </div>

        <div className="scholarship-hero-side">
          <ScholarshipMatchSummary
            profile={matchingProfile}
            scored={rankedMatches}
            shortlist={shortlist}
            C={C}
            Chip={Chip}
          />
        </div>
      </div>

      <div className="scholarship-surface-grid scholarship-surface-grid--priority">
        <ScholarshipDocumentImport
          authUser={authUser}
          profile={profile}
          onImport={onImportCv}
          busy={cvImportBusy}
          message={cvImportMessage}
        />

        {primaryMatch && (
          <ScholarshipDetailCard
            scholarship={primaryMatch.scholarship}
            analysis={primaryMatch.analysis}
            tracked={trackedApplications[primaryMatch.scholarship.id]}
            shortlistSaved={shortlist.includes(primaryMatch.scholarship.id)}
            authUser={authUser}
            profileId={profile?.id}
            matchingProfile={matchingProfile}
            toggleShortlist={toggleShortlist}
            trackApplication={trackApplication}
            handleOpenWebsite={handleOpenWebsite}
            openIntelPanel={openIntelPanel}
            shortlistBusy={shortlistBusy}
          />
        )}

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
            <button
              type="button"
              onClick={function () { return setClosingSoonOnly(function (v) { return !v; }); }}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontFamily: "var(--font-ui)",
                cursor: "pointer",
                borderRadius: "8px",
                border: closingSoonOnly ? "2px solid var(--red, #dc2626)" : "1px solid var(--border)",
                background: closingSoonOnly ? "var(--red-bg, #fef2f2)" : "transparent",
                color: closingSoonOnly ? "var(--red, #dc2626)" : "var(--text-2)",
                fontWeight: closingSoonOnly ? 600 : 400,
              }}
            >
              {closingSoonOnly ? "✓ Closing within 14 days" : "Closing soon"}
            </button>
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
        {rankedMatches.length} scholarship{rankedMatches.length === 1 ? "" : "s"} matched
      </div>

      <div className="scholarship-results-grid">
        {secondaryMatches.length > 0 ? secondaryMatches.map(({ scholarship, analysis }) => {
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
              toggleShortlist={toggleShortlist}
              trackApplication={trackApplication}
              openIntelPanel={openIntelPanel}
              handleOpenWebsite={handleOpenWebsite}
              shortlistBusy={shortlistBusy}
              advanceApplication={advanceApplication}
            />
          );
        }) : (
          <div className="empty-state" role="status" aria-live="polite">
            <div className="empty-state-title">{primaryMatch ? "Top match ready" : "No eligible scholarships found"}</div>
            <div className="empty-state-copy">
              {primaryMatch
                ? "The strongest opportunity is featured above. Add more profile detail or widen the filters to surface more alternatives."
                : isEmptyProfile
                  ? "Add nationality, degree class, and discipline to compare more scholarships."
                  : "No scholarship survived the current filters. Check nationality, discipline, degree class, and deadline constraints."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
