import { Link } from "react-router-dom";
import { getDailyChallenge } from "../../data/dailyChallenges.js";
import { isChallengeCompleted } from "../../lib/dailyChallengeEngine.js";
import SvgIcon from "../../components/SvgIcon.jsx";

/**
 * DailyChallengeCard
 *
 * Compact card for the dashboard showing today's challenge.
 * Shows "Done ✓" when completed, or a "Start challenge" link button.
 *
 * Props:
 *   sessions - array of practice session objects
 *   date     - date to check (defaults to today)
 */
export default function DailyChallengeCard({ sessions = [], date = new Date() }) {
  const challenge = getDailyChallenge(date);
  const completed = isChallengeCompleted(date, sessions);

  if (!challenge) return null;

  return (
    <div className="daily-challenge-card">
      <div className="daily-challenge-card__header">
        <span className="daily-challenge-card__icon">{challenge.icon}</span>
        <div className="daily-challenge-card__title-group">
          <h3 className="daily-challenge-card__title">Daily Challenge</h3>
          <span className="daily-challenge-card__subtitle">~{challenge.estimatedMinutes} min</span>
        </div>
        {completed && (
          <span className="daily-challenge-card__done-badge"><SvgIcon name="check" size={14} color="var(--c-green)" /> Done</span>
        )}
      </div>

      <p className="daily-challenge-card__description">
        <strong>{challenge.title}</strong> — {challenge.description}
      </p>

      {challenge.hint && !completed && (
        <p className="daily-challenge-card__hint"><SvgIcon name="lightbulb" size={14} /> {challenge.hint}</p>
      )}

      <div className="daily-challenge-card__actions">
        {completed ? (
          <Link to="/practice/daily" className="daily-challenge-card__link">
            View streak →
          </Link>
        ) : (
          <Link to={challenge.route} className="daily-challenge-card__button">
            Start challenge
          </Link>
        )}
      </div>
    </div>
  );
}
