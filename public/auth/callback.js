/**
 * Loci OAuth Callback Handler
 *
 * Handles two OAuth return flows from Supabase:
 *   1. PKCE:  reads ?code=... from query params, exchanges via Supabase token endpoint
 *   2. Implicit: reads #access_token=... from the hash fragment
 * Both flows POST to /api/auth?action=exchange to set HttpOnly cookies.
 *
 * This is an external script (not inline) because the CSP blocks inline scripts.
 * Loaded by /auth/callback.html via <script src="/auth/callback.js" defer></script>.
 */
(function () {
  "use strict";

  var el = function (id) { return document.getElementById(id); };

  var S = {
    status: function (msg, color) {
      var s = el("status");
      if (s) { s.textContent = msg; if (color) s.style.color = color; }
    },
    title: function (msg) {
      var t = el("title");
      if (t) t.textContent = msg;
    },
    log: function (msg) {
      var d = el("log");
      if (!d) return;
      d.classList.add("visible");
      d.innerHTML += msg + "\n";
    },
    error: function (msg) {
      S.title("Sign-in issue");
      S.status(msg, "#ef4444");
      var spin = el("spinner");
      if (spin) spin.style.display = "none";
      var actions = el("errorActions");
      if (actions) actions.classList.add("visible");
    },
    fatal: function (msg) {
      S.error(msg);
      S.log("Redirecting to sign-in in 5 seconds…");
      setTimeout(function () { window.location.replace("/"); }, 5000);
    },
    success: function (next) {
      S.title("Signed in");
      S.status("Done — redirecting…", "#4ade80");
      var spin = el("spinner");
      if (spin) spin.style.display = "none";
      window.location.replace(next);
    },
  };

  /* ── Parse URL ──────────────────────────────────── */
  var url = new URL(window.location.href);
  var queryCode = url.searchParams.get("code") || "";
  var queryNonce = url.searchParams.get("nonce") || "";
  var queryNext = url.searchParams.get("next") || "/";
  var hash = window.location.hash.slice(1);
  var hashParams = new URLSearchParams(hash);
  var hashAccessToken = hashParams.get("access_token");
  var hashRefreshToken = hashParams.get("refresh_token");

  S.log("url: " + window.location.href.slice(0, 120));
  S.log("hash len: " + hash.length + " | code: " + (queryCode ? "present" : "none"));

  /* ── Validate next path ─────────────────────────── */
  function safeNext(v) {
    var n = String(v || "/").trim();
    if (!n.startsWith("/") || n.startsWith("//") || n.includes("://")) return "/";
    return n;
  }
  var next = safeNext(queryNext);

  /* ── Helper: Supabase config from runtime env ────── */
  function getSupabaseConfig() {
    var env = (window.__LOCI_ENV__) || {};
    return {
      url: env.VITE_SUPABASE_URL || "",
      anonKey: env.VITE_SUPABASE_ANON_KEY || "",
    };
  }

  /* ── Helper: Exchange via API bridge ─────────────── */
  function exchangeViaApi(accessToken, refreshToken, nonce) {
    S.status("Exchanging tokens via API…");
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 8000);

    return fetch("/api/auth?action=exchange", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        nonce: nonce,
      }),
      signal: ctrl.signal,
    }).then(function (res) {
      clearTimeout(timer);
      S.log("exchange HTTP " + res.status);
      if (!res.ok) {
        return res.json().then(function (j) {
          throw new Error("Exchange API returned " + res.status + ": " + (j.error || JSON.stringify(j)));
        }).catch(function (e) {
          if (e.message && e.message.indexOf("Exchange API") === 0) throw e;
          return res.text().then(function (t) {
            throw new Error("Exchange API returned " + res.status + ": " + t);
          });
        });
      }
      return res.json();
    });
  }

  /* ═══════════════════════════════════════════════════
     FLOW 1 — PKCE: code in query params
  ═══════════════════════════════════════════════════ */
  function handlePKCEFlow() {
    if (!queryCode) return Promise.resolve(false);

    S.title("Completing sign-in");
    S.status("Exchanging authorization code…");
    S.log("PKCE flow detected — exchanging code for session");

    var config = getSupabaseConfig();
    if (!config.url || !config.anonKey) {
      S.log("PKCE SKIP: Supabase config not available");
      return Promise.resolve(false);
    }

    // Read PKCE code_verifier from localStorage
    // Supabase auth-js stores it at: supabase.auth.token-code-verifier
    var STORAGE_KEY = "supabase.auth.token";
    var verifierRaw = null;
    try {
      verifierRaw = localStorage.getItem(STORAGE_KEY + "-code-verifier");
    } catch (e) {
      S.log("PKCE SKIP: localStorage not accessible");
      return Promise.resolve(false);
    }

    if (!verifierRaw) {
      S.log("PKCE SKIP: no code_verifier in localStorage");
      return Promise.resolve(false);
    }

    var codeVerifier = verifierRaw.split("/")[0];
    S.log("code_verifier found (len=" + codeVerifier.length + ")");

    // Exchange code + verifier for session
    var tokenUrl = config.url.replace(/\/$/, "") + "/auth/v1/token?grant_type=pkce";
    S.log("POST " + tokenUrl.slice(0, 80) + "...");

    var tokenCtrl = new AbortController();
    var tokenTimer = setTimeout(function () { tokenCtrl.abort(); }, 10000);

    return fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.anonKey,
      },
      body: JSON.stringify({
        auth_code: queryCode,
        code_verifier: codeVerifier,
      }),
      signal: tokenCtrl.signal,
    }).then(function (tokenRes) {
      clearTimeout(tokenTimer);
      S.log("token endpoint HTTP " + tokenRes.status);

      if (!tokenRes.ok) {
        return tokenRes.json().catch(function () { return {}; }).then(function (errBody) {
          throw new Error(
            "Token exchange failed: " + (errBody.error_description || errBody.error || errBody.msg || "HTTP " + tokenRes.status)
          );
        });
      }

      return tokenRes.json();
    }).then(function (tokenData) {
      S.log("token exchange OK");

      if (!tokenData.access_token || !tokenData.refresh_token) {
        throw new Error("Token exchange succeeded but returned no session tokens.");
      }

      // Set HttpOnly cookies via API bridge
      return exchangeViaApi(tokenData.access_token, tokenData.refresh_token, queryNonce).then(function () {
        // Clean up verifier
        try { localStorage.removeItem(STORAGE_KEY + "-code-verifier"); } catch (e) { /* ignore */ }
        S.success(next);
        return true;
      });
    }).catch(function (e) {
      S.log("PKCE ERROR: " + e.message);
      return false; // fall through to hash flow
    });
  }

  /* ═══════════════════════════════════════════════════
     FLOW 2 — Implicit: tokens in URL hash fragment
  ═══════════════════════════════════════════════════ */
  function handleImplicitFlow() {
    if (!hashAccessToken || !hashRefreshToken) return Promise.resolve(false);

    S.title("Completing sign-in");
    S.log("Implicit flow — tokens found in hash");
    S.log("access_token: " + hashAccessToken.slice(0, 15) + "...");
    S.log("refresh_token: " + hashRefreshToken.slice(0, 10) + "...");

    return exchangeViaApi(hashAccessToken, hashRefreshToken, queryNonce).then(function () {
      S.success(next);
      return true;
    }).catch(function (e) {
      S.log("EXCHANGE ERROR: " + e.message);
      S.fatal(e.name === "AbortError"
        ? "The server took too long to respond. Please check your connection and try again."
        : "Could not complete sign-in: " + e.message);
      return true; // handled (fatal redirect)
    });
  }

  /* ═══════════════════════════════════════════════════
     FLOW 3 — Nothing found
  ═══════════════════════════════════════════════════ */
  function handleNoTokens() {
    S.log("No auth code or tokens found in URL.");
    S.log("Query params: " + url.search.slice(0, 100));
    S.log("Hash: " + (hash ? hash.slice(0, 100) : "(empty)"));

    var hashError = hashParams.get("error") || hashParams.get("error_description");
    if (hashError) {
      S.log("Supabase reported error: " + hashError);
      S.fatal("Authentication provider error: " + hashError);
    } else {
      S.fatal(
        "No authentication data was received from the login provider. " +
        "This may happen if the sign-in was cancelled or the provider had an issue."
      );
    }
    return Promise.resolve(true);
  }

  /* ── Main ────────────────────────────────────────── */
  handlePKCEFlow().then(function (handled) {
    if (handled) return;
    return handleImplicitFlow().then(function (handled2) {
      if (handled2) return;
      return handleNoTokens();
    });
  }).catch(function (e) {
    S.log("UNEXPECTED ERROR: " + (e.message || String(e)));
    S.fatal("An unexpected error occurred during sign-in.");
  });
})();
