/**
 * IELTS ↔ Scholarship Bridge Service
 *
 * Connects IELTS band estimates to scholarship eligibility.
 * Computes unlock thresholds, near-miss detection, per-scholarship
 * gap breakdowns, and time-to-target projections.
 *
 * All client-side — no API calls. Data comes from the scoring engine,
 * band estimator, and session history.
 */

import { estimateOverallBand } from "./bandScoreEstimator.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function toMaybeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundBand(band) {
  return Math.round(band * 2) / 2; // Round to nearest 0.5
}

function clampBand(band) {
  return Math.max(4.0, Math.min(9.0, roundBand(band)));
}

// ── Per-band minimum checking ───────────────────────────────────────────────

/**
 * Check individual IELTS bands against scholarship requirements.
 * Mirrors the logic added to scoringEngine.js for frontend gap analysis.
 */
export function checkIeltsBandMinimums(candidateBands, scholarshipEligibility) {
  const reqs = scholarshipEligibility?.languageReqs || {};
  const bandReqs = {
    listening: toMaybeNumber(reqs.listening),
    reading: toMaybeNumber(reqs.reading),
    writing: toMaybeNumber(reqs.writing),
    speaking: toMaybeNumber(reqs.speaking),
  };

  const activeReqs = Object.entries(bandReqs).filter(([, v]) => v !== null);

  if (activeReqs.length === 0) {
    return { passed: true, failures: [], maxGap: 0 };
  }

  const failures = [];
  for (const [band, required] of activeReqs) {
    const actual = toMaybeNumber(candidateBands?.[band]) ?? 0;
    if (actual < required) {
      failures.push({ band, required, actual, gap: required - actual });
    }
  }

  const maxGap = failures.length > 0
    ? Math.max(...failures.map((f) => f.gap))
    : 0;

  return { passed: failures.length === 0, failures, maxGap };
}

// ── Band snapshot (for detecting material changes) ──────────────────────────

const SNAPSHOT_KEY = "loci.bandSnapshot";

export function loadBandSnapshot(profileId) {
  if (!profileId) return null;
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_KEY}:${profileId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveBandSnapshot(profileId, snapshot) {
  if (!profileId) return;
  try {
    localStorage.setItem(`${SNAPSHOT_KEY}:${profileId}`, JSON.stringify({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    }));
  } catch { /* storage full — non-critical */ }
}

/**
 * Detect material band changes (0.5 threshold crossed).
 */
export function detectBandChange(currentEstimates, previousSnapshot) {
  if (!previousSnapshot) {
    return { changed: false, changes: [], hasMaterialChange: false };
  }

  const changes = [];
  const prevBands = previousSnapshot.moduleEstimates || {};
  const currBands = currentEstimates?.moduleEstimates || {};

  for (const module of ["reading", "listening", "writing", "speaking"]) {
    const prev = toMaybeNumber(prevBands[module]?.estimatedBand ?? prevBands[module]);
    const curr = toMaybeNumber(currBands[module]?.estimatedBand ?? currBands[module]);
    if (prev !== null && curr !== null && Math.abs(curr - prev) >= 0.5) {
      changes.push({ module, from: prev, to: curr });
    }
  }

  // Also check overall band
  const prevOverall = toMaybeNumber(previousSnapshot.overallBand);
  const currOverall = toMaybeNumber(currentEstimates?.overallBand);
  if (prevOverall !== null && currOverall !== null && Math.abs(currOverall - prevOverall) >= 0.5) {
    changes.push({ module: "overall", from: prevOverall, to: currOverall });
  }

  return {
    changed: changes.length > 0,
    changes,
    hasMaterialChange: changes.length > 0,
  };
}

// ── Bridge Analysis ─────────────────────────────────────────────────────────

/**
 * @param {Array} scoredScholarships — output of rankScholarships().scored
 * @param {object} currentBands — from estimateOverallBand(sessions)
 * @param {object} profile — user profile
 * @param {Array|null} shortlistIds — array of shortlisted scholarship IDs
 * @returns {object} BridgeAnalysis
 */
export function analyzeBridge(scoredScholarships, currentBands, profile, shortlistIds = null) {
  if (!Array.isArray(scoredScholarships) || scoredScholarships.length === 0) {
    return createEmptyAnalysis();
  }

  const currentOverallBand = currentBands?.overallBand ?? null;
  const targetBand = toMaybeNumber(profile?.target_band ?? profile?.targetBand);
  const moduleEstimates = currentBands?.moduleEstimates || {};

  // Build candidate bands for per-band checking
  const candidateBands = {};
  for (const [mod, est] of Object.entries(moduleEstimates)) {
    candidateBands[mod] = est?.estimatedBand ?? toMaybeNumber(est) ?? null;
  }

  const eligibleNow = [];
  const nearMiss = [];
  const blocked = [];
  const shortlistGaps = [];
  const shortlistSet = shortlistIds ? new Set(shortlistIds) : null;

  for (const item of scoredScholarships) {
    const analysis = item.analysis || item;
    const scholarship = item.record || item.scholarship || item;

    const matchStatus = analysis?.matchStatus || "possible";
    const score = analysis?.score ?? 0;
    const blockedReasons = analysis?.blockedReasons || [];

    // Check if the blocking reason is language-related
    const hasLanguageBlock = blockedReasons.some(
      (r) => typeof r === "string" && /IELTS|TOEFL|CELPIP|language/i.test(r),
    );

    if (matchStatus === "eligible") {
      eligibleNow.push({ scholarship, analysis, score });
    } else if (matchStatus === "blocked" && hasLanguageBlock && currentOverallBand !== null) {
      // It's blocked specifically by language — could be a near-miss
      const requiredIelts = toMaybeNumber(
        scholarship?.languageIelts
        || scholarship?.eligibility?.languageReqs?.ielts,
      );
      if (requiredIelts !== null && currentOverallBand >= requiredIelts - 0.5) {
        nearMiss.push({
          scholarship,
          analysis,
          score,
          gap: requiredIelts - currentOverallBand,
          requiredIelts,
          blockedReasons,
          perBandFailures: checkIeltsBandMinimums(candidateBands, scholarship?.eligibility || {}),
        });
      } else {
        blocked.push({ scholarship, analysis, score, blockedReasons });
      }
    } else {
      blocked.push({ scholarship, analysis, score, blockedReasons });
    }

    // Per-shortlist gap breakdown
    if (shortlistSet && scholarship?.id && shortlistSet.has(scholarship.id)) {
      const requiredIelts = toMaybeNumber(
        scholarship?.languageIelts
        || scholarship?.eligibility?.languageReqs?.ielts,
      );
      const requiredWriting = toMaybeNumber(
        scholarship?.eligibility?.languageReqs?.writing,
      );
      const gap = requiredIelts !== null && currentOverallBand !== null
        ? currentOverallBand - requiredIelts
        : null;

      shortlistGaps.push({
        scholarshipId: scholarship.id,
        scholarshipTitle: scholarship?.name || scholarship?.title || "Unknown",
        overallGap: gap,
        meetsOverall: gap !== null ? gap >= 0 : null,
        bandGaps: {
          listening: getBandGap(candidateBands, scholarship?.eligibility, "listening"),
          reading: getBandGap(candidateBands, scholarship?.eligibility, "reading"),
          writing: getBandGap(candidateBands, scholarship?.eligibility, "writing"),
          speaking: getBandGap(candidateBands, scholarship?.eligibility, "speaking"),
        },
        requiredIelts,
        perBandCheck: checkIeltsBandMinimums(candidateBands, scholarship?.eligibility || {}),
      });
    }
  }

  // Compute unlock thresholds
  const unlockThresholds = computeUnlockThresholds(
    scoredScholarships,
    currentOverallBand,
    targetBand,
    candidateBands,
  );

  // Find biggest gap module
  const biggestGapModule = findBiggestGapModule(shortlistGaps, candidateBands);

  // Count eligible at target
  const eligibleWithImprovement = unlockThresholds.length > 0
    ? (unlockThresholds.find((t) => t.band === targetBand)?.cumulativeCount ?? eligibleNow.length)
    : eligibleNow.length;

  return {
    eligibleNow,
    eligibleNowCount: eligibleNow.length,
    nearMissScholarships: nearMiss,
    nearMissCount: nearMiss.length,
    blocked,
    blockedCount: blocked.length,
    shortlistGaps,
    unlockThresholds,
    totalScholarships: scoredScholarships.length,
    eligibleWithImprovement,
    biggestGapModule,
    currentOverallBand,
    targetBand,
    candidateBands,
  };
}

function createEmptyAnalysis() {
  return {
    eligibleNow: [],
    eligibleNowCount: 0,
    nearMissScholarships: [],
    nearMissCount: 0,
    blocked: [],
    blockedCount: 0,
    shortlistGaps: [],
    unlockThresholds: [],
    totalScholarships: 0,
    eligibleWithImprovement: 0,
    biggestGapModule: null,
    currentOverallBand: null,
    targetBand: null,
    candidateBands: {},
  };
}

function getBandGap(candidateBands, eligibility, bandName) {
  const required = toMaybeNumber(eligibility?.languageReqs?.[bandName]);
  const actual = toMaybeNumber(candidateBands?.[bandName]);
  if (required === null) return null;
  if (actual === null) return { required, current: null, gap: null, label: `${bandName}: ${required} required (no data)` };
  return {
    required,
    current: actual,
    gap: actual - required,
    label: actual >= required
      ? `${bandName}: ${actual} (meets ${required})`
      : `${bandName}: ${actual} (needs ${required}, gap ${required - actual})`,
  };
}

function computeUnlockThresholds(scoredScholarships, currentBand, targetBand, candidateBands) {
  if (currentBand === null || targetBand === null || currentBand >= targetBand) return [];

  const thresholds = [];
  let cumulative = 0;

  for (let band = roundBand(currentBand + 0.5); band <= targetBand; band = roundBand(band + 0.5)) {
    // Count scholarships that require this band or lower
    const unlockCount = scoredScholarships.filter((item) => {
      const analysis = item.analysis || item;
      const scholarship = item.record || item.scholarship || item;
      const matchStatus = analysis?.matchStatus || "possible";
      const required = toMaybeNumber(
        scholarship?.languageIelts
        || scholarship?.eligibility?.languageReqs?.ielts,
      );
      // Only count those that were blocked or provisional and have a language requirement
      return matchStatus !== "eligible"
        && required !== null
        && band >= required
        && (matchStatus === "blocked" || matchStatus === "provisional" || matchStatus === "possible");
    }).length;

    cumulative += unlockCount;
    thresholds.push({
      band,
      unlockCount,
      cumulativeCount: cumulative,
    });
  }

  return thresholds;
}

function findBiggestGapModule(shortlistGaps, candidateBands) {
  let biggestModule = null;
  let biggestGap = 0;

  for (const gap of shortlistGaps) {
    if (!gap.bandGaps) continue;
    for (const [mod, bg] of Object.entries(gap.bandGaps)) {
      if (bg && bg.gap !== null && bg.gap < 0 && Math.abs(bg.gap) > biggestGap) {
        biggestGap = Math.abs(bg.gap);
        biggestModule = mod;
      }
    }
  }

  return biggestModule;
}

// ── Time-to-Target Projection ───────────────────────────────────────────────

/**
 * Estimate weeks to reach target band based on session history and trends.
 */
export function estimateTimeToTarget(currentBands, targetBand, sessions = []) {
  const currentOverall = currentBands?.overallBand ?? null;

  if (currentOverall === null) {
    return { currentBand: null, targetBand, gap: null, weeksAtCurrentPace: null, confidence: "none", isOnTrack: false };
  }

  const gap = targetBand !== null ? Math.max(0, targetBand - currentOverall) : 0;

  if (gap <= 0) {
    return {
      currentBand: currentOverall,
      targetBand,
      gap: 0,
      weeksAtCurrentPace: 0,
      sessionsAtCurrentPace: 0,
      confidence: currentBands?.confidence || "medium",
      trend: "at_target",
      isOnTrack: true,
      moduleProjections: {},
      atTarget: true,
    };
  }

  // Session frequency (last 28 days)
  const now = Date.now();
  const recentSessions = (sessions || []).filter((s) => {
    const date = new Date(s.completed_at || s.date).getTime();
    return !Number.isNaN(date) && (now - date) < 28 * 24 * 60 * 60 * 1000;
  });
  const sessionsPerWeek = recentSessions.length > 0
    ? Math.round((recentSessions.length / Math.max(1, recentSessions.length > 0 ? 4 : 4)) * 10) / 10
    : 0;

  // Rough heuristic: ~7 practice sessions per 0.5 band improvement
  const sessionsPerIncrement = 7;
  const incrementsNeeded = Math.ceil(gap / 0.5);
  const sessionsNeeded = incrementsNeeded * sessionsPerIncrement;
  const weeksAtCurrentPace = sessionsPerWeek > 0
    ? Math.ceil(sessionsNeeded / sessionsPerWeek)
    : null;

  // Per-module projections
  const moduleProjections = {};
  const moduleEstimates = currentBands?.moduleEstimates || {};
  const modules = ["reading", "listening", "writing", "speaking"];

  for (const mod of modules) {
    const est = moduleEstimates[mod];
    const currentMod = est?.estimatedBand ?? toMaybeNumber(est) ?? null;
    const trend = est?.trend || "insufficient_data";

    if (currentMod === null) {
      moduleProjections[mod] = { current: null, weeks: null, confidence: "none" };
      continue;
    }

    if (currentMod >= targetBand) {
      moduleProjections[mod] = { current: currentMod, weeks: 0, confidence: "high", atTarget: true };
      continue;
    }

    const modGap = targetBand - currentMod;
    const modIncrements = Math.ceil(modGap / 0.5);
    const modSessions = modIncrements * sessionsPerIncrement;
    const modWeeks = sessionsPerWeek > 0 ? Math.ceil(modSessions / sessionsPerWeek) : null;

    // Adjust for trend
    let adjustedWeeks = modWeeks;
    if (trend === "improving" && modWeeks !== null) adjustedWeeks = Math.max(1, modWeeks - 1);
    if (trend === "declining" && modWeeks !== null) adjustedWeeks = modWeeks + Math.ceil(modWeeks * 0.5);

    moduleProjections[mod] = {
      current: currentMod,
      gap: modGap,
      weeks: adjustedWeeks,
      sessionsNeeded: modSessions,
      confidence: est?.confidence || "medium",
      trend,
    };
  }

  // Overall confidence
  const confidence = currentBands?.confidence || "medium";
  const isOnTrack = weeksAtCurrentPace !== null && weeksAtCurrentPace <= 12;

  return {
    currentBand: currentOverall,
    targetBand,
    gap,
    weeksAtCurrentPace,
    sessionsAtCurrentPace: sessionsNeeded,
    sessionsPerWeek,
    confidence,
    trend: detectOverallTrend(moduleProjections),
    isOnTrack,
    atTarget: false,
    moduleProjections,
  };
}

function detectOverallTrend(moduleProjections) {
  const trends = Object.values(moduleProjections)
    .map((p) => p.trend)
    .filter(Boolean);
  const improving = trends.filter((t) => t === "improving").length;
  const declining = trends.filter((t) => t === "declining").length;
  if (improving > declining) return "improving";
  if (declining > improving) return "declining";
  return "stable";
}

// ── Scholarship-Gated Coaching ───────────────────────────────────────────────

/**
 * Rank IELTS skills by how many shortlisted scholarships they unlock.
 */
export function rankSkillsByUnlockImpact(shortlistGaps) {
  if (!Array.isArray(shortlistGaps) || shortlistGaps.length === 0) return [];

  const moduleImpact = {
    writing: { scholarshipsUnlocked: 0, scholarshipNames: [], totalGap: 0, count: 0 },
    reading: { scholarshipsUnlocked: 0, scholarshipNames: [], totalGap: 0, count: 0 },
    listening: { scholarshipsUnlocked: 0, scholarshipNames: [], totalGap: 0, count: 0 },
    speaking: { scholarshipsUnlocked: 0, scholarshipNames: [], totalGap: 0, count: 0 },
  };

  for (const gap of shortlistGaps) {
    if (!gap.bandGaps) continue;
    for (const [mod, bg] of Object.entries(gap.bandGaps)) {
      if (bg && bg.gap !== null && bg.gap < 0) {
        moduleImpact[mod].scholarshipsUnlocked += 1;
        moduleImpact[mod].scholarshipNames.push(gap.scholarshipTitle);
        moduleImpact[mod].totalGap += Math.abs(bg.gap);
        moduleImpact[mod].count += 1;
      }
    }
  }

  // Also count overall band gaps
  for (const gap of shortlistGaps) {
    if (gap.overallGap !== null && gap.overallGap < 0) {
      // Find which module gap is biggest and attribute the overall gap to it
      let biggestMod = null;
      let biggestModGap = 0;
      for (const [mod, bg] of Object.entries(gap.bandGaps || {})) {
        if (bg && bg.gap !== null && bg.gap < 0 && Math.abs(bg.gap) > biggestModGap) {
          biggestModGap = Math.abs(bg.gap);
          biggestMod = mod;
        }
      }
      if (biggestMod) {
        moduleImpact[biggestMod].scholarshipsUnlocked += 1;
        if (!moduleImpact[biggestMod].scholarshipNames.includes(gap.scholarshipTitle)) {
          moduleImpact[biggestMod].scholarshipNames.push(gap.scholarshipTitle);
        }
      }
    }
  }

  // Sort by scholarships unlocked (desc)
  return Object.entries(moduleImpact)
    .map(([module, impact]) => ({
      module,
      ...impact,
      scholarshipNames: impact.scholarshipNames.slice(0, 5), // Top 5 names only
    }))
    .filter((m) => m.scholarshipsUnlocked > 0)
    .sort((a, b) => b.scholarshipsUnlocked - a.scholarshipsUnlocked);
}
