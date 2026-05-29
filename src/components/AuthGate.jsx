import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithPassword, startGoogleSignIn } from "../services/authBridge.js";
import { supabase } from "../services/supabaseClient.js";

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function FieldError({ error }) {
  if (!error) return null;
  return <div className="auth-field-error">{error}</div>;
}

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

export default function AuthGate() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const validation = {
    email: !email.trim() || !isEmail(email) ? "Enter a valid email address." : "",
    password: !password ? "Enter your password." : "",
  };

  const showError = (field) => submitted || touched[field];

  const submitPasswordFlow = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setMessage("");

    if (validation.email || validation.password) {
      return;
    }

    setBusy(true);
    try {
      await signInWithPassword(email, password);
      navigate("/", { replace: true });
    } catch (error) {
      setMessage(error?.message || "Invalid email or password.");
    } finally {
      setBusy(false);
    }
  };

  const sendGoogleSignIn = async () => {
    if (!supabase) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await startGoogleSignIn(window.location.pathname + window.location.search + window.location.hash);
    } catch (error) {
      const nextMessage = error?.message || "Google sign-in is unavailable right now.";
      if (nextMessage.includes("provider is not enabled") || nextMessage.includes("Unsupported provider")) {
        setMessage("Google sign-in is not enabled in Supabase. Enable the provider and add this app origin to redirect URLs.");
      } else {
        setMessage(nextMessage);
      }
    } finally {
      setBusy(false);
    }
  };

  const authCopy = "Sign in with Google or your email password to continue.";

  return (
    <div className="auth-shell">
      <aside className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-brand">
            <div className="auth-brand-mark">LOCI</div>
          </div>
          <h1 className="auth-hero-title">One workspace for practice and scholarships.</h1>
          <p className="auth-hero-copy">{authCopy}</p>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card" role="presentation">
          <div className="auth-card-head">
            <div className="auth-kicker">Candidate workspace</div>
            <h2 className="auth-title">Welcome back</h2>
            <p className="auth-subtitle">
              Use the same account across practice, onboarding, and scholarship matching.
            </p>
          </div>

          <form className="auth-form" onSubmit={submitPasswordFlow}>
            <label className="auth-field">
              <span>Email</span>
              <input
                className={`auth-input${showError("email") && validation.email ? " error" : ""}`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched((current) => ({ ...current, email: true }))}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={busy}
              />
              <FieldError error={showError("email") ? validation.email : ""} />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className={`auth-password-wrap${showError("password") && validation.password ? " error" : ""}`}>
                <input
                  className="auth-input auth-password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                  placeholder="Password"
                  autoComplete="current-password"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={busy}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <FieldError error={showError("password") ? validation.password : ""} />
            </label>

            <button className="auth-primary" type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              <span>Sign in</span>
            </button>

            {message && <div className="auth-error-banner">{message}</div>}
          </form>

          <div className="auth-footer">
            <button type="button" className="auth-secondary-link" onClick={sendGoogleSignIn} disabled={busy || !supabase}>
              Continue with Google
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
