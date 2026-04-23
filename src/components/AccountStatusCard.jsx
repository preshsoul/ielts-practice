import React from "react";

export default function AccountStatusCard({
  authUser,
  authEmail,
  setAuthEmail,
  authMessage,
  authBusy,
  onSignIn,
  onSignOut,
}) {
  return (
    <div className="account-card">
      <div className="empty-state-title">{authUser ? "Signed in" : "Sign in with email"}</div>
      <div className="empty-state-copy">
        {authUser
          ? `You are signed in as ${authUser.email || "your account"}. We can now sync practice sessions and shortlist data through Supabase.`
          : "Send yourself a magic link and we’ll use Supabase Auth to keep your sessions and shortlist in sync."}
      </div>
      {!authUser ? (
        <div className="auth-form">
          <input className="input auth-input" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" />
          <button className="primary-btn" onClick={onSignIn} disabled={authBusy || !authEmail.trim()}>
            {authBusy ? "Sending..." : "Send magic link"}
          </button>
        </div>
      ) : (
        <button className="ghost-btn" onClick={onSignOut}>Sign out</button>
      )}
      {authMessage && <div className="empty-state-meta" style={{ textTransform: "none", letterSpacing: 0 }}>{authMessage}</div>}
    </div>
  );
}
