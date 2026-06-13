/**
 * DeadlineCountdownBadge
 *
 * Small inline badge showing days remaining until a scholarship deadline.
 * Color-coded by urgency: red (overdue/7d), orange (14d), amber (30d), default (>30d).
 */
export default function DeadlineCountdownBadge({ daysRemaining, deadline }) {
  if (daysRemaining === null || daysRemaining === undefined) {
    return (
      <span className="deadline-countdown-badge deadline-countdown-badge--unknown">
        No deadline
      </span>
    );
  }

  if (daysRemaining < 0) {
    return (
      <span className="deadline-countdown-badge deadline-countdown-badge--overdue">
        Overdue by {Math.abs(Math.round(daysRemaining))}d
      </span>
    );
  }

  if (daysRemaining === 0) {
    return (
      <span className="deadline-countdown-badge deadline-countdown-badge--today">
        Due today
      </span>
    );
  }

  const days = Math.round(daysRemaining);

  if (days <= 7) {
    return (
      <span className="deadline-countdown-badge deadline-countdown-badge--urgent">
        {days}d left
      </span>
    );
  }

  if (days <= 14) {
    return (
      <span className="deadline-countdown-badge deadline-countdown-badge--caution">
        {days}d left
      </span>
    );
  }

  if (days <= 30) {
    return (
      <span className="deadline-countdown-badge deadline-countdown-badge--soon">
        {days}d left
      </span>
    );
  }

  return (
    <span className="deadline-countdown-badge deadline-countdown-badge--upcoming">
      {days}d
    </span>
  );
}

/**
 * Compute integer days remaining from a deadline ISO string.
 * Returns null if the deadline is missing or unparseable.
 */
export function getDaysUntilDeadline(deadline) {
  if (!deadline) return null;
  try {
    const target = new Date(deadline);
    if (Number.isNaN(target.getTime())) return null;
    const now = new Date();
    const diff = target.getTime() - now.getTime();
    return diff / (1000 * 60 * 60 * 24);
  } catch {
    return null;
  }
}
