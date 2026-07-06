/**
 * Achievement System
 *
 * Defines earned/unearned achievements with per-user evaluation.
 * Progress is persisted to user-scoped localStorage via userStorage.js.
 * Keys: loci.achievements:{profileId} — no cross-user leaks.
 */

import { calculateStreakDays } from "./dashboard.js";
import { estimateOverallBand } from "./bandScoreEstimator.js";
import { getUserStorage, setUserStorage, STORAGE_NAMESPACES } from "./userStorage.js";

let currentProfileId = null;

/**
 * All achievement definitions.
 * Each has: id, title, description, icon, evaluate(profile, sessions, context)
 * where context is { shortlistIds, trackedApps, vocabMastered }
 */
export const ACHIEVEMENTS = [
  {
    id: "first_steps",
    title: "First Steps",
    description: "Complete your onboarding profile.",
    icon: "🌟",
    evaluate: (profile) => profile?.onboarding_completed === true,
    progressText: (profile) =>
      profile?.onboarding_completed ? "100%" : "Complete onboarding in your account settings",
  },
  {
    id: "five_day_streak",
    title: "5-Day Streak",
    description: "Practice for 5 consecutive days.",
    icon: "🔥",
    evaluate: (_profile, sessions) => calculateStreakDays(sessions) >= 5,
    progressText: (_profile, sessions) => {
      const streak = calculateStreakDays(sessions);
      return streak >= 5 ? "5/5 days" : `${streak}/5 days`;
    },
  },
  {
    id: "ten_day_streak",
    title: "10-Day Streak",
    description: "Practice for 10 consecutive days.",
    icon: "💪",
    evaluate: (_profile, sessions) => calculateStreakDays(sessions) >= 10,
    progressText: (_profile, sessions) => {
      const streak = calculateStreakDays(sessions);
      return streak >= 10 ? "10/10 days" : `${streak}/10 days`;
    },
  },
  {
    id: "scholar_hunter",
    title: "Scholar Hunter",
    description: "Shortlist 20 scholarships.",
    icon: "🔍",
    evaluate: (_profile, _sessions, context) => (context?.shortlistCount || 0) >= 20,
    progressText: (_profile, _sessions, context) => {
      const count = context?.shortlistCount || 0;
      return count >= 20 ? "20/20" : `${count}/20`;
    },
  },
  {
    id: "band_7_plus",
    title: "Band 7+ Club",
    description: "Reach an estimated band score of 7.0 or higher.",
    icon: "🏆",
    evaluate: (_profile, sessions) => {
      const estimate = estimateOverallBand(sessions);
      return estimate.overallBand !== null && estimate.overallBand >= 7.0;
    },
    progressText: (_profile, sessions) => {
      const estimate = estimateOverallBand(sessions);
      if (estimate.overallBand === null) return "Complete practice sessions to estimate your band";
      return `Current: ${estimate.overallBand.toFixed(1)} (target: 7.0)`;
    },
  },
  {
    id: "perfect_score",
    title: "Perfect Score",
    description: "Score 100% on any practice session.",
    icon: "⭐",
    evaluate: (_profile, sessions) =>
      sessions.some((s) => s.total > 0 && s.score / s.total === 1),
    progressText: (_profile, sessions) => {
      const best = sessions.reduce((max, s) => {
        const pct = s.total > 0 ? s.score / s.total : 0;
        return Math.max(max, pct);
      }, 0);
      return `Best: ${Math.round(best * 100)}% (target: 100%)`;
    },
  },
  {
    id: "vocab_master",
    title: "Vocabulary Master",
    description: "Master 100 vocabulary words.",
    icon: "📚",
    evaluate: (_profile, _sessions, context) => (context?.vocabMastered || 0) >= 100,
    progressText: (_profile, _sessions, context) => {
      const count = context?.vocabMastered || 0;
      return count >= 100 ? "100/100" : `${count}/100`;
    },
  },
  {
    id: "app_ready",
    title: "Application Ready",
    description: "Track 5 scholarship applications.",
    icon: "📋",
    evaluate: (_profile, _sessions, context) => (context?.trackedCount || 0) >= 5,
    progressText: (_profile, _sessions, context) => {
      const count = context?.trackedCount || 0;
      return count >= 5 ? "5/5" : `${count}/5`;
    },
  },

  // ── Bridge + Coach achievements (Phase 2) ─────────────────────────────
  {
    id: "bridge_activated",
    title: "Bridge Activated",
    description: "Connect your IELTS score to scholarship eligibility for the first time.",
    icon: "🌉",
    evaluate: (_profile, _sessions, context) => context?.bridgeActivated === true,
    progressText: (_profile, _sessions, context) => context?.bridgeActivated === true ? "Activated" : "Visit the IELTS Bridge",
  },
  {
    id: "scholarship_ready",
    title: "Scholarship Ready",
    description: "Reach the IELTS threshold for 5 or more scholarships.",
    icon: "🎓",
    evaluate: (_profile, _sessions, context) => (context?.eligibleNowCount || 0) >= 5,
    progressText: (_profile, _sessions, context) => {
      const count = context?.eligibleNowCount || 0;
      return count >= 5 ? "5/5" : `${count}/5`;
    },
  },
];

/**
 * Load earned achievements from localStorage.
 * @returns {Record<string, string>} — { achievementId: earnedAtISO }
 */
export function loadEarnedAchievements(profileId) {
  if (!profileId) return {};
  currentProfileId = profileId;
  return getUserStorage(STORAGE_NAMESPACES.ACHIEVEMENTS, profileId) || {};
}

export function saveEarnedAchievement(achievementId, profileId) {
  if (!profileId) return {};
  const earned = loadEarnedAchievements(profileId);
  if (!earned[achievementId]) {
    earned[achievementId] = new Date().toISOString();
    setUserStorage(STORAGE_NAMESPACES.ACHIEVEMENTS, profileId, earned);
  }
  return earned;
}

export function evaluateAchievements(profile, sessions, context = {}) {
  const profileId = profile?.id || currentProfileId;
  const earned = loadEarnedAchievements(profileId);

  return ACHIEVEMENTS.map((achievement) => {
    const isEarnedNow = achievement.evaluate(profile, sessions, context);
    const earnedAt = earned[achievement.id] || null;

    // Auto-save if newly earned
    if (isEarnedNow && !earnedAt) {
      saveEarnedAchievement(achievement.id, profileId);
    }

    return {
      achievement,
      earned: isEarnedNow || Boolean(earnedAt),
      earnedAt: earnedAt || (isEarnedNow ? new Date().toISOString() : null),
      progress: achievement.progressText(profile, sessions, context),
    };
  });
}
