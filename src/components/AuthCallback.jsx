import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabaseClient.js";

/**
 * OAuth callback route — /auth/callback
 *
 * Supabase PKCE flow redirects here with ?code=... after OAuth.
 * The SDK's built-in PKCE handler exchanges the code automatically
 * when this component renders — no custom bridge, no cookies, no API calls.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    let cancelled = false;

    (async () => {
      // exchangeCodeForSession reads the ?code= from the URL,
      // retrieves the PKCE verifier from localStorage, and
      // exchanges them for a session — all handled by the SDK.
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        window.location.search
      );

      if (cancelled) return;

      if (exchangeError) {
        console.error("OAuth callback error:", exchangeError);
        setError(exchangeError.message || "Could not complete sign-in.");
        // Redirect to login after showing the error briefly
        setTimeout(() => navigate("/", { replace: true }), 3000);
        return;
      }

      // Session is now stored in localStorage by the SDK.
      // onAuthStateChange in useAuthSession will pick it up.
      // Navigate to the app — useAuthSession handles the rest.
      navigate("/", { replace: true });
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0f172a",
      color: "#fff",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ textAlign: "center" }}>
        {error ? (
          <>
            <p style={{ color: "#ef4444", fontSize: 16, marginBottom: 8 }}>{error}</p>
            <p style={{ color: "#94a3b8", fontSize: 13 }}>Redirecting to sign-in…</p>
          </>
        ) : (
          <>
            <div style={{
              width: 40, height: 40, margin: "0 auto 16px",
              border: "3px solid rgba(255,255,255,0.15)",
              borderTopColor: "#38bdf8", borderRadius: "50%",
              animation: "spin .7s linear infinite",
            }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>Completing sign-in</p>
            <p style={{ color: "#94a3b8", fontSize: 13 }}>Please wait…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  );
}
