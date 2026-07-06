const TIER_RANK = { free: 0, pro: 1, premium: 2 };

function tierRank(tier) {
  return TIER_RANK[String(tier || "free").toLowerCase()] ?? 0;
}

export function useFeatureGate(profile) {
  const tier = String(profile?.tier || "free").toLowerCase();
  const rank = tierRank(tier);

  return {
    tier,
    isPro: rank >= TIER_RANK.pro,
    isPremium: rank >= TIER_RANK.premium,

    // Practice
    canExportResults: rank >= TIER_RANK.pro,
    canAccessAdvancedPractice: rank >= TIER_RANK.pro,
    canAccessAdaptiveReading: rank >= TIER_RANK.pro,
    canAccessBridge: rank >= TIER_RANK.pro,
    canAccessStudyCoach: rank >= TIER_RANK.pro,

    // Scholarships
    canAccessSemanticSearch: rank >= TIER_RANK.pro,
    canSeeAllScholarships: rank >= TIER_RANK.pro,
    canReceiveDeadlineAlerts: rank >= TIER_RANK.pro,
    canDownloadApplicationChecklist: rank >= TIER_RANK.pro,

    // Application tracking
    canTrackApplications: true,
    canTrackApplicationsLimit: rank >= TIER_RANK.pro ? Infinity : 3,

    // Account
    canAccessPrioritySupport: rank >= TIER_RANK.premium,
  };
}
