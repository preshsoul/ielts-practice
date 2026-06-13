/**
 * MatchAlertBadge
 *
 * Red circular badge showing the count of new scholarship matches.
 * Renders nothing when count is 0.
 */
export default function MatchAlertBadge({ count = 0 }) {
  if (!count || count <= 0) return null;

  const display = count > 99 ? "99+" : String(count);

  return (
    <span className="match-alert-badge" aria-label={`${count} new scholarship matches`} title={`${count} new matches`}>
      {display}
    </span>
  );
}
