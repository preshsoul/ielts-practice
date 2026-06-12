// =========================================================================
// IELTS Band Score Estimator
// =========================================================================
// Maps raw practice scores to approximate IELTS band scores.
//
// IELTS Academic Reading/Listening: 40 questions -> band score 0-9
// Our sessions: 20 questions -> scaled to 40 for band estimation
// =========================================================================

const READING_ACADEMIC_TABLE = {
  39: 9.0, 38: 8.5, 37: 8.5,
  36: 8.0, 35: 8.0,
  34: 7.5, 33: 7.5,
  32: 7.0, 31: 7.0, 30: 7.0,
  29: 6.5, 28: 6.5, 27: 6.5,
  26: 6.0, 25: 6.0, 24: 6.0, 23: 6.0,
  22: 5.5, 21: 5.5, 20: 5.5, 19: 5.5,
  18: 5.0, 17: 5.0, 16: 5.0, 15: 5.0,
  14: 4.5, 13: 4.5,
  12: 4.0, 11: 4.0, 10: 4.0,
  9: 3.5, 8: 3.5,
  7: 3.0, 6: 3.0, 5: 3.0,
  4: 2.5, 3: 2.5, 2: 2.0, 1: 1.5, 0: 1.0,
};

const LISTENING_TABLE = {
  39: 9.0, 38: 8.5, 37: 8.5,
  36: 8.0, 35: 8.0,
  34: 7.5, 33: 7.5,
  32: 7.0, 31: 7.0, 30: 7.0,
  29: 6.5, 28: 6.5, 27: 6.5,
  26: 6.0, 25: 6.0, 24: 6.0, 23: 6.0,
  22: 5.5, 21: 5.5, 20: 5.5, 19: 5.5,
  18: 5.0, 17: 5.0, 16: 5.0, 15: 5.0,
  14: 4.5, 13: 4.5,
  12: 4.0, 11: 4.0, 10: 4.0,
  9: 3.5, 8: 3.5,
  7: 3.0, 6: 3.0, 5: 3.0,
  4: 2.5, 3: 2.5, 2: 2.0, 1: 1.5, 0: 1.0,
};

const MODULES = ["reading", "listening", "writing", "speaking"];

// =========================================================================
// Core functions
// =========================================================================

function scaleTo40(rawScore, total) {
  if (total <= 0) return 0;
  return Math.round((rawScore / total) * 40);
}

function rawToBand(rawOutOf40, isListening) {
  const table = isListening ? LISTENING_TABLE : READING_ACADEMIC_TABLE;
  let bestBand = 1.0;
  for (const [rawThreshold, band] of Object.entries(table)) {
    if (rawOutOf40 >= Number(rawThreshold)) {
      bestBand = Math.max(bestBand, band);
    }
  }
  return bestBand;
}

function computeTrend(scores) {
  if (scores.length < 2) return "insufficient_data";
  const recent = scores.slice(-3);
  const older = scores.slice(0, -3);
  if (recent.length < 2) return "insufficient_data";
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const olderAvg = older.length ? older.reduce((s, v) => s + v, 0) / older.length : recentAvg;
  const diff = recentAvg - olderAvg;
  if (diff > 5) return "improving";
  if (diff < -5) return "declining";
  return "stable";
}

function getConfidence(sessionCount) {
  if (sessionCount >= 5) return "high";
  if (sessionCount >= 2) return "medium";
  return "low";
}

// =========================================================================
// Estimator for Reading / Listening
// =========================================================================

function estimateReadingListeningBand(sessions, module) {
  const moduleSessions = (Array.isArray(sessions) ? sessions : [])
    .filter(function (s) { return String(s.module || "").toLowerCase() === module; })
    .filter(function (s) { return Number(s.total) > 0; });

  const sessionCount = moduleSessions.length;
  if (sessionCount === 0) {
    return {
      module,
      estimatedBand: null,
      confidence: "low",
      sessionCount: 0,
      averageRawScore: 0,
      lastSessionDate: null,
      trend: "insufficient_data",
    };
  }

  const percentageScores = moduleSessions.map(
    function (s) { return ((s.score || 0) / (s.total || 1)) * 100; }
  );
  const avgPercentage = percentageScores.reduce((s, v) => s + v, 0) / sessionCount;

  // Scale to /40 and look up band
  const firstTotal = moduleSessions[0]?.total || 20;
  const scaledScore = Math.round((avgPercentage / 100) * firstTotal);
  const rawOutOf40 = scaleTo40(scaledScore, firstTotal);
  const estimatedBand = rawToBand(rawOutOf40, module === "listening");

  const sorted = [...moduleSessions].sort(function (a, b) {
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
  });

  return {
    module,
    estimatedBand,
    confidence: getConfidence(sessionCount),
    sessionCount,
    averageRawScore: Math.round(avgPercentage),
    lastSessionDate: sorted[0]?.date || null,
    trend: computeTrend(percentageScores),
  };
}

// =========================================================================
// Overall band estimate
// =========================================================================

export function estimateOverallBand(sessions) {
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const moduleEstimates = {};
  for (const module of MODULES) {
    moduleEstimates[module] = estimateReadingListeningBand(safeSessions, module);
  }

  const bandEstimates = MODULES
    .map(function (m) { return moduleEstimates[m].estimatedBand; })
    .filter(function (b) { return b !== null; });

  const overallBand = bandEstimates.length
    ? Math.round((bandEstimates.reduce(function (s, b) { return s + b; }, 0) / bandEstimates.length) * 2) / 2
    : null;

  const totalSessions = safeSessions.length;
  const lastUpdated = safeSessions
    .map(function (s) { return s.date; })
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;

  return {
    overallBand,
    confidence: totalSessions >= 10 ? "high" : totalSessions >= 4 ? "medium" : "low",
    totalSessions,
    moduleEstimates,
    lastUpdated,
  };
}

// =========================================================================
// Language proof resolver
// =========================================================================

export function getLanguageProof(profile, sessions) {
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const explicitIelts = Number(
    (profile && profile.languageTests ? profile.languageTests.ielts : null)
    ?? (profile && profile.languageTests ? profile.languageTests.IELTS : null)
    ?? (profile ? profile.ielts : null)
  );

  const estimates = estimateOverallBand(safeSessions);

  if (Number.isFinite(explicitIelts) && explicitIelts > 0) {
    return { ieltsOverall: explicitIelts, source: "explicit", estimates };
  }
  if (estimates.overallBand !== null) {
    return { ieltsOverall: estimates.overallBand, source: "estimated", estimates };
  }
  return { ieltsOverall: null, source: "none", estimates };
}

// =========================================================================
// Formatting helpers
// =========================================================================

export function formatBandEstimate(estimate) {
  if (estimate.estimatedBand === null) return "No data yet";
  const trend = estimate.trend === "improving" ? " ↑" : estimate.trend === "declining" ? " ↓" : "";
  return "~" + estimate.estimatedBand.toFixed(1) + trend + " (" + estimate.sessionCount + " sessions)";
}

export function formatOverallBand(estimate) {
  if (estimate.overallBand === null) return "Start practicing to see your estimated band";
  return "~" + estimate.overallBand.toFixed(1) + " (" + estimate.totalSessions + " sessions)";
}
