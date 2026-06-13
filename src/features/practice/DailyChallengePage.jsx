import { Link } from "react-router-dom";
import { getDailyChallenge } from "../../data/dailyChallenges.js";
import { isChallengeCompleted, getChallengeHistory } from "../../lib/dailyChallengeEngine.js";
import { calculateStreakDays } from "../../lib/dashboard.js";
import SvgIcon from "../../components/SvgIcon.jsx";

/**
 * DailyChallengePage
 *
 * Full page at /practice/daily showing today's challenge in detail,
 * the last 7 days' completion history, and current practice streak.
 *
 * Props (cascaded from App.jsx through PracticeRoutes):
 *   sessions - array of practice session objects
 *   C, Chip, PrimaryBtn - UI atoms
 */
export default function DailyChallengePage({ sessions = [], C = {}, Chip = null, PrimaryBtn = null }) {
  const today = new Date();
  const challenge = getDailyChallenge(today);
  const completed = isChallengeCompleted(today, sessions);
  const history = getChallengeHistory(sessions, 7);
  const streak = calculateStreakDays(sessions);

  const completedDays = history.filter((h) => h.completed).length;

  return (
    <div className="daily-challenge-page">
      <div className="daily-challenge-page__hero">
        <h1>Daily Challenge</h1>
        <p className="daily-challenge-page__subtitle">
          A new bite-sized challenge every day. Build your streak.
        </p>
      </div>

      {/* Streak stats */}
      <div className="daily-challenge-page__stats">
        <div className="daily-challenge-page__stat">
          <span className="daily-challenge-page__stat-value">{streak}</span>
          <span className="daily-challenge-page__stat-label">Day Streak <SvgIcon name="fire" size={14} color="var(--c-orange, #f97316)" /></span>
        </div>
        <div className="daily-challenge-page__stat">
          <span className="daily-challenge-page__stat-value">{completedDays}/7</span>
          <span className="daily-challenge-page__stat-label">This Week</span>
        </div>
      </div>

      {/* Today's challenge */}
      {challenge && (
        <div className={`daily-challenge-page__today ${completed ? "daily-challenge-page__today--done" : ""}`}>
          <div className="daily-challenge-page__today-header">
            <span className="daily-challenge-page__today-icon">{challenge.icon}</span>
            <div>
              <h2>{challenge.title}</h2>
              <span className="daily-challenge-page__today-time">~{challenge.estimatedMinutes} minutes</span>
            </div>
            {completed ? (
              <span className="daily-challenge-page__badge daily-challenge-page__badge--done"><SvgIcon name="check" size={12} /> Completed</span>
            ) : (
              <span className="daily-challenge-page__badge daily-challenge-page__badge--pending">Today</span>
            )}
          </div>
          <p className="daily-challenge-page__today-desc">{challenge.description}</p>
          {challenge.hint && (
            <p className="daily-challenge-page__today-hint"><SvgIcon name="lightbulb" size={14} /> {challenge.hint}</p>
          )}
          {!completed && (
            <Link to={challenge.route} className="daily-challenge-page__start-btn">
              Start Challenge →
            </Link>
          )}
        </div>
      )}

      {/* Past 7 days */}
      <section className="daily-challenge-page__history">
        <h3>Last 7 Days</h3>
        <div className="daily-challenge-page__history-grid">
          {history.map((day) => (
            <div
              key={day.date}
              className={`daily-challenge-page__day ${day.completed ? "daily-challenge-page__day--done" : "daily-challenge-page__day--missed"}`}
            >
              <span className="daily-challenge-page__day-date">
                {new Date(day.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
              </span>
              <span className="daily-challenge-page__day-challenge">
                {day.challenge?.icon} {day.challenge?.title || "No challenge"}
              </span>
              <span className="daily-challenge-page__day-status">
                {day.completed ? <SvgIcon name="check" size={14} color="var(--c-green)" /> : <span style={{color:"var(--text-3)"}}>—</span>}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
