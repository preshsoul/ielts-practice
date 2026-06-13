import { useEffect, useMemo, useState } from "react";
import { loadApplicationTracking } from "../../services/supabaseData.js";
import DeadlineCountdownBadge, { getDaysUntilDeadline } from "./DeadlineCountdownBadge.jsx";

/**
 * DeadlineActionPlan
 *
 * Page at /scholarships/deadlines showing all tracked scholarships grouped by
 * deadline urgency: Urgent (0-14 days), Caution (15-30 days), Upcoming (31+ days).
 * Each card shows scholarship name, days remaining, deadline date, and document
 * checklist progress from application tracking.
 *
 * Props (cascaded from App.jsx through AppRoutes):
 *   profile         - current user profile
 *   scholarshipCatalog - array of scholarship records (from loadScholarshipContent)
 *   C, Chip, PrimaryBtn - UI atoms
 */
export default function DeadlineActionPlan({
  profile = null,
  scholarshipCatalog = [],
}) {
  const [trackedApps, setTrackedApps] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!profile?.id) {
        setLoaded(true);
        return;
      }
      try {
        const tracking = await loadApplicationTracking(profile.id);
        if (!cancelled) {
          setTrackedApps(tracking || {});
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const catalog = Array.isArray(scholarshipCatalog) ? scholarshipCatalog : [];

  // Merge scholarship catalog with tracking data, group by urgency
  const { urgent, caution, upcoming, noDeadline } = useMemo(() => {
    const merged = catalog
      .filter((s) => {
        // Include if tracked OR has a deadline
        const id = s?.id || s?.slug || "";
        const tracked = trackedApps[id];
        return tracked || (s?.deadline || s?.application?.deadline);
      })
      .map((s) => {
        const id = s?.id || s?.slug || "";
        const deadline = s?.deadline || s?.application?.deadline || null;
        const days = getDaysUntilDeadline(deadline);
        const tracked = trackedApps[id] || null;
        return { scholarship: s, days, deadline, tracked, id };
      })
      .sort((a, b) => {
        if (a.days === null && b.days === null) return 0;
        if (a.days === null) return 1;
        if (b.days === null) return -1;
        return a.days - b.days;
      });

    return {
      urgent: merged.filter((m) => m.days !== null && m.days <= 14),
      caution: merged.filter((m) => m.days !== null && m.days > 14 && m.days <= 30),
      upcoming: merged.filter((m) => m.days !== null && m.days > 30),
      noDeadline: merged.filter((m) => m.days === null),
    };
  }, [catalog, trackedApps]);

  if (!loaded) {
    return (
      <div className="deadline-action-plan">
        <div className="deadline-action-plan__loading">Loading your action plan…</div>
      </div>
    );
  }

  const total = urgent.length + caution.length + upcoming.length + noDeadline.length;

  if (total === 0) {
    return (
      <div className="deadline-action-plan">
        <div className="deadline-action-plan__hero">
          <h1>Deadline Action Plan</h1>
          <p className="deadline-action-plan__subtitle">
            Track scholarship applications to see your deadline calendar here.
          </p>
        </div>
        <div className="deadline-action-plan__empty">
          <p>No scholarships with deadlines found. Start tracking applications on the{" "}
            <a href="/scholarships">Scholarships page</a> to build your action plan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="deadline-action-plan">
      <div className="deadline-action-plan__hero">
        <h1>Deadline Action Plan</h1>
        <p className="deadline-action-plan__subtitle">
          {total} scholarship{total !== 1 ? "s" : ""} tracked — {urgent.length} urgent
        </p>
      </div>

      {urgent.length > 0 && (
        <section className="deadline-action-plan__group deadline-action-plan__group--urgent">
          <h2 className="deadline-action-plan__group-title">
            <span className="deadline-action-plan__group-icon">🔴</span>
            Urgent — Due within 14 days ({urgent.length})
          </h2>
          <div className="deadline-action-plan__cards">
            {urgent.map((item) => (
              <DeadlineCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {caution.length > 0 && (
        <section className="deadline-action-plan__group deadline-action-plan__group--caution">
          <h2 className="deadline-action-plan__group-title">
            <span className="deadline-action-plan__group-icon">🟠</span>
            Caution — Due in 15-30 days ({caution.length})
          </h2>
          <div className="deadline-action-plan__cards">
            {caution.map((item) => (
              <DeadlineCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="deadline-action-plan__group deadline-action-plan__group--upcoming">
          <h2 className="deadline-action-plan__group-title">
            <span className="deadline-action-plan__group-icon">🔵</span>
            Upcoming — Due in 31+ days ({upcoming.length})
          </h2>
          <div className="deadline-action-plan__cards">
            {upcoming.map((item) => (
              <DeadlineCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {noDeadline.length > 0 && (
        <section className="deadline-action-plan__group deadline-action-plan__group--no-deadline">
          <h2 className="deadline-action-plan__group-title">
            <span className="deadline-action-plan__group-icon">⚪</span>
            No deadline set ({noDeadline.length})
          </h2>
          <div className="deadline-action-plan__cards">
            {noDeadline.map((item) => (
              <DeadlineCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Individual deadline card showing scholarship info, countdown, and document checklist.
 */
function DeadlineCard({ item }) {
  const { scholarship, days, deadline, tracked } = item;
  const name = scholarship?.name || scholarship?.displayName || scholarship?.name_full || "Untitled Scholarship";
  const provider = scholarship?.awardingBody || scholarship?.source?.sourceLabel || "";
  const docs = Array.isArray(tracked?.documents) ? tracked.documents : [];
  const docsDone = docs.filter((d) => d?.done).length;
  const docsTotal = docs.length || 3; // default 3 docs if not tracked
  const sourceUrl = scholarship?.source_url || scholarship?.source?.sourceUrl || "";

  const deadlineDate = deadline
    ? new Date(deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="deadline-card">
      <div className="deadline-card__header">
        <h3 className="deadline-card__title">{name}</h3>
        {provider && <span className="deadline-card__provider">{provider}</span>}
      </div>

      <div className="deadline-card__meta">
        <DeadlineCountdownBadge daysRemaining={days} deadline={deadline} />
        {deadlineDate && <span className="deadline-card__date">{deadlineDate}</span>}
      </div>

      <div className="deadline-card__docs">
        <span className="deadline-card__docs-label">Documents</span>
        <div className="deadline-card__docs-bar">
          <div
            className="deadline-card__docs-fill"
            style={{ width: `${docsTotal > 0 ? Math.round((docsDone / docsTotal) * 100) : 0}%` }}
          />
        </div>
        <span className="deadline-card__docs-count">{docsDone}/{docsTotal} ready</span>
      </div>

      <div className="deadline-card__actions">
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="deadline-card__link"
          >
            View scholarship →
          </a>
        )}
        <a href="/scholarships" className="deadline-card__link">
          Open tracker →
        </a>
      </div>
    </div>
  );
}
