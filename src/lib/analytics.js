const isEnabled = typeof window !== "undefined" && Boolean(import.meta.env?.VITE_POSTHOG_KEY);

function getPostHog() {
  if (!isEnabled) return null;
  return window.posthog ?? null;
}

function track(event, properties = {}) {
  const ph = getPostHog();
  if (!ph) return;
  try {
    ph.capture(event, { ...properties, _source: "loci" });
  } catch {
    // analytics must never throw
  }
}

function identify(userId, traits = {}) {
  const ph = getPostHog();
  if (!ph || !userId) return;
  try {
    ph.identify(userId, traits);
  } catch {
    // analytics must never throw
  }
}

function reset() {
  const ph = getPostHog();
  if (!ph) return;
  try { ph.reset(); } catch { /* noop */ }
}

// ── Typed event helpers ───────────────────────────────────────────────────────

export const analytics = {
  // Auth
  signedIn: (userId) => track("signed_in", { userId }),
  signedOut: (userId) => track("signed_out", { userId }),

  // Onboarding
  onboardingStarted: () => track("onboarding_started"),
  onboardingCompleted: (profileId) => track("onboarding_completed", { profileId }),

  // Profile
  profileSaved: (profileId) => track("profile_saved", { profileId }),
  cvImported: (profileId, docType) => track("cv_imported", { profileId, docType }),

  // Scholarships
  scholarshipOpened: (scholarshipId, title) => track("scholarship_opened", { scholarshipId, title }),
  scholarshipShortlisted: (scholarshipId, title) => track("scholarship_shortlisted", { scholarshipId, title }),
  scholarshipDismissed: (scholarshipId) => track("scholarship_dismissed", { scholarshipId }),
  applicationStarted: (scholarshipId) => track("application_started", { scholarshipId }),

  // Practice
  practiceSessionCompleted: (component, score, durationMs) =>
    track("practice_session_completed", { component, score, durationMs }),
  resultsExported: () => track("results_exported"),

  // Identify
  identify,
  reset,
};

export default analytics;
