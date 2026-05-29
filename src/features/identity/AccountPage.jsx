import React, { useMemo, useState } from "react";
import AccountProfileForm from "../../components/AccountProfileForm.jsx";
import { getProfileCompletion, getProfileSectionCompletion } from "../../lib/profileCompletion.js";
import { formatIeltsScore } from "../../lib/opportunitySignals.js";

const ACCOUNT_TABS = ["Verification", "Settings", "Security", "Billing"];

function formatValue(value, fallback = "Not added") {
  if (Array.isArray(value)) {
    const list = value.map((item) => String(item || "").trim()).filter(Boolean);
    return list.length ? list.join(" · ") : fallback;
  }

  const text = String(value ?? "").trim();
  return text || fallback;
}

function toBandValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return "—";
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function formatDegreeClass(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Degree class not added";
  if (normalized === "first") return "First class";
  if (normalized === "2:1") return "Second class upper (2:1)";
  if (normalized === "2:2") return "Second class lower (2:2)";
  if (normalized === "third") return "Third class";
  return value;
}

function getDisplayName(profile = {}, authUser = null) {
  return formatValue(
    profile?.display_name ||
    profile?.displayName ||
    profile?.full_name ||
    profile?.fullName ||
    profile?.name ||
    authUser?.user_metadata?.full_name ||
    authUser?.email?.split("@")?.[0],
    "Candidate name not added",
  );
}

function getConfidenceDots(percent) {
  if (percent >= 85) return 3;
  if (percent >= 55) return 2;
  if (percent >= 20) return 1;
  return 0;
}

function ConfidenceRow({ label, value, tone = "green" }) {
  return (
    <div className="account-verify-confidence-row">
      <span>{label}</span>
      <div className="account-verify-confidence-dots">
        {[0, 1, 2].map((index) => (
          <span
            key={`${label}-${index}`}
            className={`account-verify-dot ${index < value ? `is-on is-${tone}` : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

function VerificationSurface({
  sessions,
  authUser,
  profile,
  profileDraft,
  completion,
}) {
  const current = profileDraft || profile || {};
  const sections = useMemo(() => getProfileSectionCompletion(current), [current]);

  const identitySection = sections.find((section) => section.key === "identity");
  const academicSection = sections.find((section) => section.key === "academic");
  const professionalSection = sections.find((section) => section.key === "professional");
  const languageSection = sections.find((section) => section.key === "language");
  const targetsSection = sections.find((section) => section.key === "targets");

  const ieltsBands = current?.languageTests?.ieltsBands || {};
  const ieltsOverall = formatIeltsScore(current) || "IELTS not added";
  const dossierItems = [
    {
      title: "Identity and location",
      note: `${formatValue(current?.identity?.nationality, "Nationality missing")} · ${formatValue(current?.identity?.countryOfResidence, "Residence missing")}`,
      action: identitySection?.percent === 100 ? "Verified" : "Update fields",
      tone: identitySection?.percent === 100 ? "green" : identitySection?.percent > 0 ? "amber" : "muted",
    },
    {
      title: "Academic transcripts",
      note: `${formatValue(current?.academic?.institution, "Institution missing")} · ${formatValue(current?.academic?.graduationYear, "Graduation year missing")}`,
      action: academicSection?.percent >= 75 ? "Ready" : "Resolve gaps",
      tone: academicSection?.percent >= 75 ? "amber" : "muted",
    },
    {
      title: "Language proof",
      note: `${ieltsOverall}${current?.languageTests?.toefl ? ` · TOEFL ${current.languageTests.toefl}` : ""}`,
      action: languageSection?.percent >= 70 ? "Track score" : "Add scores",
      tone: languageSection?.percent >= 70 ? "green" : "muted",
    },
  ];

  return (
    <div className="account-verify-layout">
      <div className="account-verify-main">
        <div className="account-verify-grid">
          <section className="account-verify-card account-verify-card-identity">
            <div className="account-verify-card-head">
              <div className="account-verify-card-title">Identity Profile</div>
            </div>
            <div className="account-verify-manual-grid">
              <div className="account-verify-field account-verify-field-wide">
                <div className="account-verify-field-label">Full legal name</div>
                <div className="account-verify-field-value">{getDisplayName(current, authUser)}</div>
              </div>
              <div className="account-verify-field">
                <div className="account-verify-field-label">Degree class</div>
                <div className="account-verify-field-value">{formatDegreeClass(current?.academic?.degreeClass)}</div>
              </div>
              <div className="account-verify-field">
                <div className="account-verify-field-label">Nationality</div>
                <div className="account-verify-field-value">{formatValue(current?.identity?.nationality, "Nationality not added")}</div>
              </div>
            </div>
          </section>

          <section className="account-verify-card account-verify-card-academic">
            <div className="account-verify-card-head">
              <div className="account-verify-card-title">Academic Background</div>
              <div className="account-verify-card-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="account-verify-inference-list">
              <div className="account-verify-inference">
                <div className="account-verify-field-label">Inferred discipline</div>
                <div className="account-verify-inference-value">{formatValue(current?.academic?.discipline, "Discipline not added")}</div>
                <div className="account-verify-inference-note">
                  {formatValue(current?.academic?.institution, "Awaiting CV or manual confirmation")}
                </div>
              </div>
              <div className="account-verify-inference">
                <div className="account-verify-field-label">Graduation date</div>
                <div className="account-verify-inference-value">{formatValue(current?.academic?.graduationYear, "Graduation year not added")}</div>
                <div className="account-verify-inference-note">
                  {formatValue(current?.academic?.institutionCountry, "Institution country not added")}
                </div>
              </div>
            </div>
          </section>

          <section className="account-verify-card account-verify-card-ielts">
            <div className="account-verify-card-head">
              <div className="account-verify-card-title">IELTS Intelligence</div>
              <div className="account-verify-source-pill">Sourced: practice sessions ({sessions.length})</div>
            </div>
            <div className="account-verify-score-grid">
              {[
                { label: "Listening", value: toBandValue(ieltsBands.listening) },
                { label: "Reading", value: toBandValue(ieltsBands.reading) },
                { label: "Writing", value: toBandValue(ieltsBands.writing) },
                { label: "Speaking", value: toBandValue(ieltsBands.speaking) },
              ].map((item) => (
                <div key={item.label} className="account-verify-score-box">
                  <div className="account-verify-score-label">{item.label}</div>
                  <div className="account-verify-score-value">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="account-verify-alert">
              {Number(ieltsBands.reading || 0) > 0 && Number(ieltsBands.reading) < 7
                ? `Reading score is below common scholarship thresholds (7.0+). Recommended practice: academic passage analysis.`
                : `Current overall status: ${ieltsOverall}. Add band scores or more practice history to sharpen the recommendation layer.`}
            </div>
          </section>

          <section className="account-verify-card account-verify-card-cv">
            <div className="account-verify-card-head">
              <div className="account-verify-card-title">Core CV</div>
            </div>
            <div className="account-verify-upload-box">
              <div className="account-verify-upload-title">Update curriculum vitae</div>
              <div className="account-verify-upload-copy">PDF, DOCX up to 10MB</div>
            </div>
            <div className="account-verify-file-row">
              <div>
                <div className="account-verify-file-name">{formatValue(current?.documents?.cvFileName, "CV sync lives on the scholarships page")}</div>
                <div className="account-verify-file-note">
                  {current?.documents?.cvFileName ? "Parsed recently" : "Upload flow is linked from the scholarship workspace"}
                </div>
              </div>
              <span className={`account-verify-live-pill ${current?.documents?.cvFileName ? "is-live" : ""}`}>
                {current?.documents?.cvFileName ? "Live" : "Pending"}
              </span>
            </div>
          </section>

          <section className="account-verify-card account-verify-card-dossier">
            <div className="account-verify-card-head">
              <div className="account-verify-card-title">Application Dossier Checklist</div>
            </div>
            <div className="account-verify-dossier-grid">
              {dossierItems.map((item) => (
                <div key={item.title} className={`account-verify-dossier-item is-${item.tone}`}>
                  <div className="account-verify-dossier-title">{item.title}</div>
                  <div className="account-verify-dossier-note">{item.note}</div>
                  <div className="account-verify-dossier-action">{item.action}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <aside className="account-verify-rail">
        <div className="account-verify-rail-title">Intelligence Feed</div>

        <div className="account-verify-feed-item is-primary">
          <div className="account-verify-feed-label">Provenance: profile_matcher_v2</div>
          <div className="account-verify-feed-copy">
            {academicSection?.percent >= 70
              ? "Academic background is strong enough for reliable discipline and degree-class filtering."
              : "Academic background is still sparse, so scholarship ranking is relying on partial academic signals."}
          </div>
        </div>

        <div className="account-verify-feed-item is-tertiary">
          <div className="account-verify-feed-label">Score analysis</div>
          <div className="account-verify-feed-copy">
            {Number(ieltsBands.reading || 0) > 0 && Number(ieltsBands.reading) < 7
              ? "IELTS Reading is the main blocker for stricter UK scholarship and admissions thresholds right now."
              : "Language readiness is not the main blocker yet; missing profile fields are still the bigger ranking constraint."}
          </div>
        </div>

        <div className="account-verify-rail-card">
          <div className="account-verify-rail-card-title">Verification Confidence</div>
          <ConfidenceRow label="Academic" value={getConfidenceDots(academicSection?.percent || 0)} tone="green" />
          <ConfidenceRow label="Financial" value={getConfidenceDots(targetsSection?.percent || 0)} tone="amber" />
          <ConfidenceRow label="Experience" value={getConfidenceDots(professionalSection?.percent || 0)} tone="green" />
        </div>

        <div className="account-verify-rail-card is-accent">
          <div className="account-verify-rail-card-title">System Action</div>
          <div className="account-verify-rail-copy">
            Loci is currently using {completion.filled} verified profile signals across scholarships, shortlist ranking, and deadline tracking.
          </div>
        </div>

        <div className="account-verify-rail-card">
          <div className="account-verify-rail-card-title">Session</div>
          <div className="account-verify-rail-copy">
            {authUser ? `Signed in as ${authUser.email || "your account"}.` : "Sign in to sync profile data, shortlist state, and practice sessions."}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function AccountPage({
  sessions,
  authUser,
  profile,
  profileDraft,
  setProfileDraft,
  profileBusy,
  profileMessage,
  saveProfileDraft,
  onSignOut,
}) {
  const current = profileDraft || profile || {};
  const completion = getProfileCompletion(current);
  const [activeTab, setActiveTab] = useState("Verification");

  return (
    <section className="account-page account-page-design">
      <div className="account-verify-shell">
        <div className="account-verify-header">
          <h2 className="account-verify-page-title">Account Verification</h2>
          <p className="account-verify-page-copy">
            Review and validate your candidate profile. The system has inferred several data points from your activity.
          </p>
        </div>

        <div className="account-verify-tabs" role="tablist" aria-label="Account sections">
          {ACCOUNT_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`account-verify-tab ${activeTab === tab ? "is-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Verification" ? (
          <VerificationSurface
            sessions={sessions}
            authUser={authUser}
            profile={profile}
            profileDraft={current}
            completion={completion}
          />
        ) : activeTab === "Settings" ? (
          <div className="account-tab-panel">
            <AccountProfileForm
              profile={profile}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              profileBusy={profileBusy}
              profileMessage={profileMessage}
              saveProfileDraft={saveProfileDraft}
              authUser={authUser}
            />
          </div>
        ) : activeTab === "Security" ? (
          <div className="account-tab-panel account-tab-panel-simple">
            <div className="account-verify-card">
              <div className="account-verify-card-title">Security</div>
              <div className="account-verify-page-copy">
                Session access, sign-in state, and account protection controls stay here. Sign out below if you want to disconnect this browser session.
              </div>
              <div className="account-tab-actions">
                <div className="account-verify-field-value">{authUser?.email || "No active session"}</div>
                {authUser && <button type="button" className="ghost-btn" onClick={onSignOut}>Sign out</button>}
              </div>
            </div>
          </div>
        ) : (
          <div className="account-tab-panel account-tab-panel-simple">
            <div className="account-verify-card">
              <div className="account-verify-card-title">Billing</div>
              <div className="account-verify-page-copy">
                Plan controls are not fully expanded yet, but your current tier is already reflected in the wider workspace.
              </div>
              <div className="account-verify-field-value">{formatValue(profile?.tier, "free")}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
