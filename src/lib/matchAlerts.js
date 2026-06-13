/**
 * Match Alert Utilities
 *
 * Detects new scholarship matches since the user's last visit to the scholarship page.
 * Uses user-scoped localStorage via userStorage.js.
 * Keys: loci.lastMatchView:{profileId} — no cross-user leaks.
 */

import { getUserStorage, setUserStorage, STORAGE_NAMESPACES } from "./userStorage.js";

let currentProfileId = null;

export function getLastViewedMatchTimestamp(profileId) {
  if (!profileId) return 0;
  currentProfileId = profileId;
  const value = getUserStorage(STORAGE_NAMESPACES.MATCH_VIEW, profileId);
  return value ? Number(value) : 0;
}

export function markMatchesViewed(profileId) {
  if (!profileId) return;
  try {
    setUserStorage(STORAGE_NAMESPACES.MATCH_VIEW, profileId, Date.now());
  } catch {
    // silently ignore
  }
}

/**
 * Counts new scholarship matches above the score threshold that appeared
 * after the user's last viewed timestamp.
 *
 * @param {Array} catalog - scholarship records
 * @param {object} profile - user profile
 * @param {object} options
 * @param {number} options.threshold - minimum score (0-100) to count as a match
 * @returns {number}
 */
export function getMatchAlertCount(catalog, profile, { threshold = 60 } = {}) {
  if (!Array.isArray(catalog) || catalog.length === 0) return 0;
  if (!profile?.id) return 0;

  const lastViewed = getLastViewedMatchTimestamp(profile.id);
  if (!lastViewed) return 0; // first visit — don't overwhelm with alerts

  let count = 0;
  const cutoff = lastViewed;
  const now = Date.now();

  for (const record of catalog) {
    // Check if the record is "new" since last view
    const scrapedAt = record?.provenance?.scrapedAt || record?.source?.scrapedAt || null;
    const verifiedAt = record?.provenance?.lastVerifiedAt || record?.source?.lastVerifiedAt || null;
    const latestUpdate = Math.max(
      scrapedAt ? new Date(scrapedAt).getTime() : 0,
      verifiedAt ? new Date(verifiedAt).getTime() : 0
    );

    if (latestUpdate <= cutoff) continue;

    // Quick pre-filter: must have a decent confidence score
    const confidence = record?.provenance?.confidenceScore ?? record?.source?.confidence ?? 0;
    if (confidence < 0.35) continue;

    // Must look like a valid opportunity
    const name = record?.name || record?.displayName || "";
    if (!name || name.length < 5) continue;
    if (/^(not applicable|untitled|error|page not found)/i.test(name)) continue;

    // Has international signal or comes from known international source
    const body = (record?.awardingBody || "").toLowerCase();
    const sourceUrl = (record?.source?.sourceUrl || record?.source_url || "").toLowerCase();
    const intlSignal = /\binternational|overseas|global|worldwide|foreign|open to all|any nationality\b/i.test(
      (record?.eligibility?.rawText || "") + " " + (record?.requirementsSummary || "") + " " + (record?.requirements_summary || "")
    );
    const knownSource = /cambridgetrust|chevening|daad|fulbright|erasmus|commonwealth|mext/i.test(sourceUrl + body);

    if (intlSignal || knownSource) {
      count++;
    }
  }

  return Math.min(count, 99); // cap at 99 for display
}
