import React from "react";

export default function AccountStatusCard({
  authUser,
  onSignOut,
}) {
  return (
    <div className="loci-card loci-card--utilitarian account-card account-status-card">
      <div className="account-status-head">
        <div>
          <div className="account-status-kicker">Session</div>
          <div className="account-status-title">{authUser ? "Signed in" : "Not signed in"}</div>
        </div>
        <span className="account-status-chip">{authUser ? "Synced" : "Offline"}</span>
      </div>
      <div className="account-status-copy">
        {authUser
          ? `Signed in as ${authUser.email || "your account"}.`
          : "Sign in to sync profile data, shortlist state, and practice sessions."}
      </div>
      <div className="account-status-footer">
        <div className="account-status-email">
          {authUser?.email || "No account connected"}
        </div>
        {authUser && <button type="button" className="ghost-btn" onClick={onSignOut}>Sign out</button>}
      </div>
    </div>
  );
}
