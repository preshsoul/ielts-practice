import React, { useMemo, useRef } from "react";
import {
  getProfileCompletion,
  getProfileCompletionLabel,
  getProfileSectionCompletion,
} from "../lib/profileCompletion.js";
import { resolveCandidateProfile } from "../lib/candidateProfile.js";

const NATIONALITY_OPTIONS = [
  "Nigerian",
  "Ghanaian",
  "Kenyan",
  "Ugandan",
  "Cameroonian",
  "South African",
  "Rwandan",
  "Zambian",
  "Tanzanian",
  "United Kingdom",
  "Canada",
  "Australia",
  "International",
];

const DEGREE_CLASS_OPTIONS = [
  { value: "", label: "Select degree class" },
  { value: "first", label: "First class" },
  { value: "2:1", label: "2:1" },
  { value: "2:2", label: "2:2" },
  { value: "third", label: "Third class" },
];

const CGPA_SCALE_OPTIONS = [
  { value: "", label: "Select scale" },
  { value: "4", label: "4.0 scale" },
  { value: "5", label: "5.0 scale" },
  { value: "7", label: "7.0 scale" },
  { value: "100", label: "Percentage" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "", label: "Select status" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const DEGREE_LEVEL_OPTIONS = [
  { value: "", label: "Select level" },
  { value: "Master's", label: "Master's" },
  { value: "PhD", label: "PhD" },
  { value: "MBA", label: "MBA" },
  { value: "Postgraduate", label: "Postgraduate" },
];

const RESOLVED_FIELD_SECTION = {
  nationality: "identity",
  discipline: "academic",
  degreeClass: "academic",
  languageTests: "language",
  workExpYears: "professional",
};

const RESOLVED_FIELD_LABEL = {
  nationality: "Nationality",
  discipline: "Discipline",
  degreeClass: "Degree class",
  languageTests: "Language scores",
  workExpYears: "Work experience",
};

function getValueAtPath(source, path) {
  return path.reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), source);
}

function setValueAtPath(source, path, nextValue) {
  if (!path.length) return source;
  const [head, ...rest] = path;

  if (!rest.length) {
    return { ...source, [head]: nextValue };
  }

  return {
    ...source,
    [head]: setValueAtPath(source?.[head] || {}, rest, nextValue),
  };
}

function formatFieldValue(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildFieldId(sectionKey, field) {
  return `profile-${sectionKey}-${field.path.join("-")}`;
}

function renderOptions(options, includeBlank = true) {
  const list = Array.isArray(options) ? options : [];
  return includeBlank ? list : list.slice(1);
}

function SectionField({
  sectionKey,
  field,
  value,
  onChange,
  onFieldFocus,
}) {
  const fieldId = buildFieldId(sectionKey, field);
  const commonProps = {
    id: fieldId,
    value: formatFieldValue(value),
    onChange,
    onFocus: onFieldFocus,
    className: "profile-field-control",
  };

  return (
    <label className={`profile-field profile-field-${field.type === "textarea" ? "textarea" : "input"}`} htmlFor={fieldId}>
      <span className="profile-field-label">{field.label}</span>
      {field.type === "select" ? (
        <select {...commonProps}>
          {(Array.isArray(field.options) && field.options.some((option) => (typeof option === "string" ? option === "" : option.value === "")))
            ? null
            : <option value="">{`Select ${field.label.toLowerCase()}`}</option>}
          {renderOptions(field.options).map((option) => {
            const optionValue = typeof option === "string" ? option : option.value;
            const optionLabel = typeof option === "string" ? option : option.label;
            return (
              <option key={optionValue || optionLabel} value={optionValue}>
                {optionLabel}
              </option>
            );
          })}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={fieldId}
          value={formatFieldValue(value)}
          onChange={onChange}
          onFocus={onFieldFocus}
          rows={field.rows || 3}
          placeholder={field.placeholder}
          className="profile-field-control profile-field-textarea"
        />
      ) : (
        <input
          {...commonProps}
          type={field.type === "number" ? "number" : "text"}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          inputMode={field.type === "number" ? "decimal" : undefined}
        />
      )}
      <span className="profile-field-hint">{field.hint}</span>
    </label>
  );
}

export default function AccountProfileForm({
  profile,
  profileDraft,
  setProfileDraft,
  profileBusy,
  profileMessage,
  saveProfileDraft,
  authUser,
}) {
  const currentProfile = useMemo(() => ({
    ...(profile || {}),
    ...(profileDraft || {}),
    candidateProfile: profileDraft?.candidateProfile || profile?.candidateProfile || null,
  }), [profile, profileDraft]);
  const completion = getProfileCompletion(profileDraft);
  const sections = useMemo(() => getProfileSectionCompletion(profileDraft), [profileDraft]);
  const candidateResolution = useMemo(() => resolveCandidateProfile(currentProfile, {
    candidateId: profile?.id || authUser?.id || "anonymous",
  }), [authUser?.id, currentProfile, profile?.id]);
  const verificationGaps = candidateResolution?.resolved?.verificationGaps || [];
  const unresolvedConflicts = candidateResolution?.resolved?.unresolvedConflicts || [];
  const sectionRefs = useRef({});

  const updateDraftField = (path, value) => {
    setProfileDraft((current) => setValueAtPath(current, path, value));
  };

  const focusField = (sectionKey, field) => {
    const fieldId = buildFieldId(sectionKey, field);
    const element = document.getElementById(fieldId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    window.requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
    });
  };

  const jumpToSection = (sectionKey) => {
    const element = sectionRefs.current[sectionKey];
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveSection = async () => {
    await saveProfileDraft();
  };

  return (
    <div className="profile-workspace">
      <aside className="profile-workspace-sidebar">
        <div className="profile-readiness-card">
          <div className="profile-readiness-kicker">Profile readiness</div>
          <div className="profile-readiness-title">{getProfileCompletionLabel(completion.percent)}</div>
          <div className="profile-readiness-copy">
            Section-by-section readiness shows what the matching engine can use right now.
          </div>
          <div
            className="profile-readiness-track"
            role="progressbar"
            aria-label="Profile readiness"
            aria-valuemin={0}
            aria-valuemax={completion.total}
            aria-valuenow={completion.filled}
          >
            <div className="profile-readiness-fill" style={{ width: `${completion.percent}%` }} />
          </div>
          <div className="profile-readiness-meta">
            <strong>{completion.percent}%</strong>
            <span>{completion.filled} of {completion.total} fields complete</span>
          </div>
        </div>

        <div className="profile-section-nav-card">
          <div className="profile-section-nav-title">Sections</div>
          <div className="profile-section-nav">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                className="profile-section-nav-item"
                onClick={() => jumpToSection(section.key)}
              >
                <span>{section.title}</span>
                <strong>{section.percent}%</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="profile-session-card">
          <div className="profile-section-nav-title">Account</div>
          <div className="profile-session-copy">
            {profile?.tier ? `Plan: ${profile.tier}` : "Plan: free"}
          </div>
          <div className="profile-session-copy">
            {authUser ? `Signed in as ${authUser.email || "your account"}.` : "Sign in to save your profile."}
          </div>
        </div>

        <div className="profile-verification-card">
          <div className="profile-section-nav-title">Verification Signals</div>
          <div className="profile-verification-copy">
            CV-derived fields are treated as provisional until they agree with your profile or you confirm them here.
          </div>
          <div className="profile-verification-stats">
            <div className="profile-verification-stat">
              <strong>{unresolvedConflicts.length}</strong>
              <span>Conflicts</span>
            </div>
            <div className="profile-verification-stat">
              <strong>{verificationGaps.length}</strong>
              <span>Needs verification</span>
            </div>
          </div>
          {unresolvedConflicts.length > 0 && (
            <div className="profile-verification-list">
              {unresolvedConflicts.map((item) => (
                <button
                  key={`conflict-${item.field}`}
                  type="button"
                  className="profile-verification-item is-conflict"
                  onClick={() => jumpToSection(RESOLVED_FIELD_SECTION[item.field] || "identity")}
                >
                  <span>{RESOLVED_FIELD_LABEL[item.field] || item.field}</span>
                  <strong>Conflict</strong>
                </button>
              ))}
            </div>
          )}
          {verificationGaps.length > 0 && (
            <div className="profile-verification-list">
              {verificationGaps.map((item) => (
                <button
                  key={`gap-${item.field}`}
                  type="button"
                  className="profile-verification-item"
                  onClick={() => jumpToSection(RESOLVED_FIELD_SECTION[item.field] || "identity")}
                >
                  <span>{RESOLVED_FIELD_LABEL[item.field] || item.field}</span>
                  <strong>Review</strong>
                </button>
              ))}
            </div>
          )}
          {!unresolvedConflicts.length && !verificationGaps.length && (
            <div className="profile-verification-ok">
              Your confirmed profile and latest CV extraction are aligned on the fields the matcher is using.
            </div>
          )}
        </div>
      </aside>

      <div className="profile-workspace-main">
        {sections.map((section) => (
          <section
            key={section.key}
            ref={(node) => {
              if (node) {
                sectionRefs.current[section.key] = node;
              }
            }}
            className="loci-card loci-card--utilitarian profile-section-card"
            id={`profile-section-${section.key}`}
          >
            <div className="profile-section-head">
              <div>
                <div className="profile-section-title">{section.title}</div>
                <div className="profile-section-copy">{section.description}</div>
              </div>
              <div className="profile-section-actions">
                <span className={`profile-section-state profile-section-state-${section.percent === 100 ? "complete" : section.percent > 0 ? "partial" : "missing"}`}>
                  {section.percent === 100 ? "Complete" : section.percent > 0 ? "Partial" : "Missing"}
                </span>
                <button type="button" className="ghost-btn" onClick={saveSection} disabled={profileBusy || !authUser}>
                  {profileBusy ? "Saving..." : section.saveLabel}
                </button>
              </div>
            </div>

            <div className="profile-field-grid">
              {section.fields.map((field) => {
                const value = getValueAtPath(profileDraft, field.path);
                return (
                  <SectionField
                    key={field.path.join(".")}
                    sectionKey={section.key}
                    field={field}
                    value={value}
                    onChange={(event) => updateDraftField(field.path, event.target.value)}
                    onFieldFocus={() => {}}
                  />
                );
              })}
            </div>

            <div className="profile-section-footer">
              <div className="profile-section-missing-title">
                {section.missing.length ? "Still missing" : "Ready"}
              </div>
              <div className="profile-section-missing-list">
                {section.missing.length ? section.missing.map((field) => (
                  <button
                    key={field.path.join(".")}
                    type="button"
                    className="profile-missing-chip"
                    onClick={() => focusField(section.key, field)}
                  >
                    {field.label}
                  </button>
                )) : (
                  <span className="profile-section-ready-copy">This section is complete and ready for matching.</span>
                )}
              </div>
            </div>
          </section>
        ))}

        <div className="profile-actions">
          <button className="primary-btn" onClick={saveProfileDraft} disabled={profileBusy || !authUser}>
            {profileBusy ? "Saving..." : "Save profile"}
          </button>
          {profile?.tier && <div className="profile-pill">Plan: {profile.tier}</div>}
        </div>

        {profileMessage && <div className="profile-message" role="status" aria-live="polite">{profileMessage}</div>}
        <div className="profile-note">
          Document intake stays on the Scholarships page. Confirmed values from a document can flow back into these fields after review.
        </div>
      </div>
    </div>
  );
}
