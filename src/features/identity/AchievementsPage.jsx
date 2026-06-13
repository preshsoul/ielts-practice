import { useMemo, useEffect, useState } from "react";
import { evaluateAchievements } from "../../lib/achievements.js";
import { loadVocabProgress, getVocabularyStats } from "../../lib/vocabularyEngine.js";
import { IELTS_VOCABULARY } from "../../data/ieltsVocabulary.js";
import { loadShortlistIds, loadApplicationTracking } from "../../services/supabaseData.js";
import AchievementBadge from "../../components/AchievementBadge.jsx";

export default function AchievementsPage({
  profile = null,
  sessions = [],
}) {
  const [shortlistIds, setShortlistIds] = useState([]);
  const [trackedApps, setTrackedApps] = useState({});
  const profileId = profile?.id || null;

  // Self-load shortlist and tracking data (like DeadlineActionPlan does)
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    Promise.all([
      loadShortlistIds(profileId).catch(() => []),
      loadApplicationTracking(profileId).catch(() => ({})),
    ]).then(([ids, tracking]) => {
      if (!cancelled) {
        setShortlistIds(Array.isArray(ids) ? ids : []);
        setTrackedApps(tracking || {});
      }
    });
    return () => { cancelled = true; };
  }, [profileId]);

  const results = useMemo(() => {
    const vocabProgress = loadVocabProgress(profileId);
    const vocabStats = getVocabularyStats(vocabProgress, IELTS_VOCABULARY);

    return evaluateAchievements(profile, sessions, {
      shortlistCount: shortlistIds.length,
      trackedCount: Object.keys(trackedApps || {}).length,
      vocabMastered: vocabStats.mastered,
    });
  }, [profile, sessions, shortlistIds, trackedApps, profileId]);

  const earned = results.filter((r) => r.earned);
  const unearned = results.filter((r) => !r.earned);
  const percent = results.length > 0 ? Math.round((earned.length / results.length) * 100) : 0;

  return (
    <div className="achievements-page">
      <div className="achievements-page__hero">
        <h1>Achievements</h1>
        <p className="achievements-page__subtitle">
          {earned.length}/{results.length} unlocked · {percent}% complete
        </p>
        <div className="achievements-page__progress-bar">
          <div className="achievements-page__progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {earned.length > 0 && (
        <section className="achievements-page__section">
          <h2 className="achievements-page__section-title">✅ Earned ({earned.length})</h2>
          <div className="achievements-page__grid">
            {earned.map(({ achievement, earned, earnedAt, progress }) => (
              <AchievementBadge
                key={achievement.id}
                achievement={achievement}
                earned={earned}
                earnedAt={earnedAt}
                progress={progress}
              />
            ))}
          </div>
        </section>
      )}

      <section className="achievements-page__section">
        <h2 className="achievements-page__section-title">🔒 Locked ({unearned.length})</h2>
        <div className="achievements-page__grid">
          {unearned.map(({ achievement, earned, progress }) => (
            <AchievementBadge
              key={achievement.id}
              achievement={achievement}
              earned={earned}
              progress={progress}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
