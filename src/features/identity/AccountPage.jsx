import React from "react";
import AccountProfileForm from "../../components/AccountProfileForm.jsx";
import AccountStatusCard from "../../components/AccountStatusCard.jsx";
import { getProfileCompletion, getProfileCompletionLabel } from "../../lib/profileCompletion.js";

function AccountSummaryCard({ completion, sessions, profile }) {
  const remaining = Math.max(completion.total - completion.filled, 0);

  return (
    <div className="account-summary-card">
      <div className="account-summary-kicker">Profile readiness</div>
      <div className="account-summary-title">{getProfileCompletionLabel(completion.percent)}</div>
      <div className="account-summary-copy">
        {remaining > 0
          ? `${remaining} field${remaining === 1 ? "" : "s"} still need attention before the matcher can compare more scholarships.`
          : "Your profile is complete enough for strong matching and cleaner explanations."}
      </div>
      <div className="account-summary-metrics">
        <div>
          <strong>{completion.percent}%</strong>
          <span>complete</span>
        </div>
        <div>
          <strong>{completion.filled}</strong>
          <span>filled fields</span>
        </div>
        <div>
          <strong>{sessions.length}</strong>
          <span>synced sessions</span>
        </div>
      </div>
      <div className="account-summary-footer">
        <span className="chip chip-small" style={{ ["--chip-color"]: "var(--pacific-blue)" }}>
          {profile?.tier || "free"}
        </span>
        <span className="account-summary-note">Section-by-section status is shown below.</span>
      </div>
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
  const completion = getProfileCompletion(profileDraft);

  return (
    <section className="account-page account-workspace">
      <div className="account-hero">
        <div className="account-hero-copy panel-card account-hero-main">
          <div className="page-kicker">Account verification</div>
          <div className="page-title">Your IELTS readiness at a glance.</div>
          <div className="page-copy">
            This is the mirror for the candidate profile. The facts here feed the scholarship matcher, the shortlist, and the readiness diagnostics.
          </div>
          <div className="account-hero-tags">
            <span className="chip chip-small" style={{ ["--chip-color"]: "var(--pacific-blue)" }}>
              {sessions.length} synced sessions
            </span>
            <span className="chip chip-small" style={{ ["--chip-color"]: "var(--charcoal-blue)" }}>
              {profile ? "Profile saved" : "Draft mode"}
            </span>
            <span className="chip chip-small" style={{ ["--chip-color"]: "var(--carbon-black)" }}>
              {completion.percent}% ready
            </span>
          </div>
        </div>

        <div className="account-hero-stack">
          <AccountStatusCard authUser={authUser} onSignOut={onSignOut} />
          <AccountSummaryCard completion={completion} sessions={sessions} profile={profile} />
        </div>
      </div>

      <AccountProfileForm
        profile={profile}
        profileDraft={profileDraft}
        setProfileDraft={setProfileDraft}
        profileBusy={profileBusy}
        profileMessage={profileMessage}
        saveProfileDraft={saveProfileDraft}
        authUser={authUser}
      />
    </section>
  );
}
