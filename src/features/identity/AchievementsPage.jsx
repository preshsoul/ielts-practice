import { useMemo } from "react";
import { evaluateAchievements } from "../../lib/achievements.js";
import { loadVocabProgress, getVocabularyStats } from "../../lib/vocabularyEngine.js";
import { IELTS_VOCABULARY } from "../../data/ieltsVocabulary.js";
import AchievementBadge from "../../components/AchievementBadge.jsx";

/**
 * AchievementsPage — /achievements
 *
 * Displays all achievements in a grid, grouped by earned/unearned.
 * Evaluates achievements based on profile, sessions, shortlist, and vocabulary progress.
 *
 * Props:
 *   profile     - user profile
 *   sessions    - practice sessions array
 *   shortlistIds - array of shortlisted scholarship IDs
 *   trackedApps - object of tracked applications
 */
export default function AchievementsPage({
  profile = null,
  sessions = [],
  shortlistIds = [],
  trackedApps = {},
}) {
  const results = useMemo(() => {
    const profileId = profile?.id || null;
    const vocabProgress = loadVocabProgress(profileId);
    const vocabStats = getVocabularyStats(vocabProgress, IELTS_VOCABULARY);

    return evaluateAchievements(profile, sessions, {
      shortlistCount: Array.isArray(shortlistIds) ? shortlistIds.length : 0,
      trackedCount: Object.keys(trackedApps || {}).length,
      vocabMastered: vocabStats.mastered,
    });
  }, [profile, sessions, shortlistIds, trackedApps]);

  const earned = results.filter((r) => r.earned);
  const unearned = results.filter((r) => !r.earned);

  return (
    <div className="achievements-page">
      <div className="achievements-page__hero">
        <h1>Achievements</h1>
        <p className="achievements-page__subtitle">
          {earned.length}/{results.length} unlocked — keep going!
        </p>
      </div>

      {earned.length > 0 && (
        <section className="achievements-page__section">
          <h2 className="achievements-page__section-title">Earned ({earned.length})</h2>
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

      {unearned.length > 0 && (
        <section className="achievements-page__section">
          <h2 className="achievements-page__section-title">Locked ({unearned.length})</h2>
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
      )}
    </div>
  );
}
