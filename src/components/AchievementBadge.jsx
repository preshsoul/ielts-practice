/**
 * AchievementBadge
 *
 * Renders a single achievement as a hexagonal-style badge.
 * Earned: full color with shine. Unearned: greyscale with progress bar.
 *
 * Props:
 *   achievement - { id, title, description, icon }
 *   earned      - boolean
 *   progress    - string (e.g., "3/5 days")
 *   earnedAt    - ISO string or null
 */
export default function AchievementBadge({ achievement = {}, earned = false, progress = "", earnedAt = null }) {
  const { title, description, icon } = achievement;

  return (
    <div className={`achievement-badge ${earned ? "achievement-badge--earned" : "achievement-badge--unearned"}`}>
      <div className="achievement-badge__icon">{icon}</div>
      <div className="achievement-badge__content">
        <h4 className="achievement-badge__title">{title}</h4>
        <p className="achievement-badge__desc">{description}</p>
        {earned ? (
          <span className="achievement-badge__earned-label">
            Earned {earnedAt ? new Date(earnedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
          </span>
        ) : (
          <span className="achievement-badge__progress">{progress}</span>
        )}
      </div>
      {earned && <div className="achievement-badge__shine" />}
    </div>
  );
}
