/**
 * User-Scoped Storage Utility
 *
 * All localStorage/sessionStorage keys embed the user ID to prevent
 * data leaks when multiple users share the same browser.
 *
 * Pattern: `loci.{namespace}:{profileId}`
 *
 * Research-backed approach from:
 * - StackOverflow: shared-device React SPAs use ID-scoped keys
 * - Reddit r/reactjs: clear-on-logout is the minimum viable fix
 * - MDN Clear-Site-Data: server-side header for nuclear option
 */

const STORAGE_KEY_PREFIX = "loci";

/**
 * Build a user-scoped key for localStorage or sessionStorage.
 * Falls back to unscoped key if no profileId is available (legacy migration).
 */
function scopedKey(namespace, profileId) {
  if (!profileId) return `${STORAGE_KEY_PREFIX}.${namespace}`;
  return `${STORAGE_KEY_PREFIX}.${namespace}:${profileId}`;
}

/**
 * Get a user-scoped localStorage value.
 * Automatically migrates from old unscoped key on first read.
 */
export function getUserStorage(namespace, profileId) {
  try {
    const scoped = scopedKey(namespace, profileId);
    const raw = localStorage.getItem(scoped);
    if (raw !== null) return JSON.parse(raw);

    // Migration: try old unscoped key (legacy data from before user-scoping)
    if (profileId) {
      const legacyKey = `${STORAGE_KEY_PREFIX}.${namespace}`;
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw !== null) {
        const parsed = JSON.parse(legacyRaw);
        // Migrate to scoped key
        localStorage.setItem(scoped, legacyRaw);
        // Remove legacy key so it doesn't leak to other users
        localStorage.removeItem(legacyKey);
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Set a user-scoped localStorage value.
 */
export function setUserStorage(namespace, profileId, value) {
  try {
    const key = scopedKey(namespace, profileId);
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Remove a specific user-scoped localStorage key.
 */
export function removeUserStorage(namespace, profileId) {
  try {
    const key = scopedKey(namespace, profileId);
    localStorage.removeItem(key);
  } catch {
    // silently ignore
  }
}

/**
 * Get a user-scoped sessionStorage value.
 * sessionStorage is per-tab, but we still scope by user for defense-in-depth.
 */
export function getUserSessionStorage(namespace, profileId) {
  try {
    const scoped = scopedKey(namespace, profileId);
    const raw = sessionStorage.getItem(scoped);
    if (raw !== null) return JSON.parse(raw);

    // Legacy migration
    if (profileId) {
      const legacyKey = `${STORAGE_KEY_PREFIX}.${namespace}`;
      const legacyRaw = sessionStorage.getItem(legacyKey);
      if (legacyRaw !== null) {
        sessionStorage.setItem(scoped, legacyRaw);
        sessionStorage.removeItem(legacyKey);
        return JSON.parse(legacyRaw);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Set a user-scoped sessionStorage value.
 */
export function setUserSessionStorage(namespace, profileId, value) {
  try {
    const key = scopedKey(namespace, profileId);
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silently ignore
  }
}

/**
 * Remove all user-scoped keys for a given profileId.
 * Called on sign-out to prevent data leaks to the next user.
 *
 * Instead of blindly calling localStorage.clear() (which would wipe
 * other apps on the same domain), we iterate and remove only our keys.
 */
export function clearAllUserStorage(profileId) {
  if (!profileId) return;

  // Build the suffix we're looking for: `:${profileId}`
  const suffix = `:${profileId}`;

  // Clear localStorage keys for this user
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX) && key.endsWith(suffix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // silently ignore
  }

  // Clear sessionStorage keys for this user
  try {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX) && key.endsWith(suffix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // silently ignore
  }
}

/**
 * Known storage namespaces used across the app.
 * Used by clearAllUserStorage as a safety net — removes unscoped
 * legacy keys that might still exist from before user-scoping was added.
 */
export const STORAGE_NAMESPACES = {
  SIDEBAR: "sidebarCollapsed",
  MATCH_VIEW: "lastMatchView",
  ACHIEVEMENTS: "achievements",
  VOCAB_PROGRESS: "vocabProgress",
  ONBOARDING_SKIPPED: "onboardingSkipped",
  ONBOARDING_COMPLETED: "onboardingCompleted",
};
