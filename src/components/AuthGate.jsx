import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithPassword, signUpWithPassword, startGoogleSignIn, requestPasswordReset } from "../services/authBridge.js";
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
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "reset"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const isSignUp = mode === "signup";
  const isReset = mode === "reset";

  const validation = {
    name: isSignUp && !name.trim() ? "Enter your full name." : "",
    email: !email.trim() || !isEmail(email) ? "Enter a valid email address." : "",
    password: !isReset
      ? !password
        ? "Enter your password."
        : isSignUp && password.length < 8
          ? "Password must be at least 8 characters."
          : isSignUp && password.length > 128
            ? "Password must be 128 characters or fewer."
            : ""
      : "",
    confirm: isSignUp && password !== confirmPassword ? "Passwords do not match." : "",
  };

  const showError = (field) => submitted || touched[field];

  const switchMode = (nextMode) => {
    setMode(nextMode || (isSignUp ? "signin" : "signup"));
    setName("");
    setMessage("");
    setSubmitted(false);
    setTouched({});
    setConfirmPassword("");
  };

  const submitPasswordFlow = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setMessage("");

    if (validation.name || validation.email || validation.password || validation.confirm) {
      return;
    }

    setBusy(true);
    try {
      if (isSignUp) {
        const result = await signUpWithPassword(email, password, name);
        if (result?.message) {
          // Email confirmation required — show message instead of navigating
          setMessage(result.message);
        } else {
          navigate("/", { replace: true });
        }
      } else {
        await signInWithPassword(email, password);
        navigate("/", { replace: true });
      }
    } catch (error) {
      setMessage(error?.message || (isSignUp ? "Could not create account." : "Invalid email or password."));
    } finally {
      setBusy(false);
    }
  };

  const submitResetFlow = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setMessage("");

    if (validation.email) return;

    setBusy(true);
    try {
      const result = await requestPasswordReset(email);
      setMessage(result?.message || "If an account with that email exists, a reset link has been sent.");
    } catch (error) {
      setMessage(error?.message || "Could not send reset link. Please try again.");
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

  const authCopy = isSignUp
    ? "Create an account to start practising and discovering scholarships."
    : "Sign in with Google or your email password to continue.";

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
            <h2 className="auth-title">{isSignUp ? "Create your account" : "Welcome back"}</h2>
            <p className="auth-subtitle">
              Use the same account across practice, onboarding, and scholarship matching.
            </p>
          </div>

          <form className="auth-form" onSubmit={isReset ? submitResetFlow : submitPasswordFlow}>
            {isSignUp && (
              <label className="auth-field">
                <span>Full name</span>
                <input
                  className={`auth-input${showError("name") && validation.name ? " error" : ""}`}
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, name: true }))}
                  placeholder="Your full name"
                  autoComplete="name"
                  disabled={busy}
                />
                <FieldError error={showError("name") ? validation.name : ""} />
              </label>
            )}

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

            {!isReset && (
              <>
                <label className="auth-field">
                  <span>Password{isSignUp ? " (min. 8 characters)" : ""}</span>
                  <div className={`auth-password-wrap${showError("password") && validation.password ? " error" : ""}`}>
                    <input
                      className="auth-input auth-password-input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                      placeholder="Password"
                      autoComplete={isSignUp ? "new-password" : "current-password"}
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

                {isSignUp && (
                  <label className="auth-field">
                    <span>Confirm password</span>
                    <div className={`auth-password-wrap${showError("confirm") && validation.confirm ? " error" : ""}`}>
                      <input
                        className="auth-input auth-password-input"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        onBlur={() => setTouched((current) => ({ ...current, confirm: true }))}
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                        disabled={busy}
                      />
                    </div>
                    <FieldError error={showError("confirm") ? validation.confirm : ""} />
                  </label>
                )}
              </>
            )}

            <button className="auth-primary" type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              <span>{isSignUp ? "Create account" : isReset ? "Send reset link" : "Sign in"}</span>
            </button>

            {message && <div className={`auth-banner${message.startsWith("Account created") || message.startsWith("If an account") ? " success" : ""}`}>{message}</div>}
          </form>

          <div className="auth-footer">
            <button type="button" className="auth-secondary-link" onClick={sendGoogleSignIn} disabled={busy || !supabase}>
              Continue with Google
            </button>
            {!isReset && (
              <p className="auth-mode-toggle">
                {isSignUp ? "Already have an account?" : "No account yet?"}{" "}
                <button type="button" onClick={() => switchMode()} disabled={busy}>
                  {isSignUp ? "Sign in" : "Create one"}
                </button>
              </p>
            )}
            {!isSignUp && !isReset && (
              <p className="auth-mode-toggle">
                <button type="button" onClick={() => switchMode("reset")} disabled={busy} className="auth-text-link">
                  Forgot your password?
                </button>
              </p>
            )}
            {isReset && (
              <p className="auth-mode-toggle">
                <button type="button" onClick={() => switchMode("signin")} disabled={busy}>
                  Back to sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
