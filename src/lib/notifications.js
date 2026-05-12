import { getDaysUntil, calculateStreakDays } from "./dashboard.js";

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function humaniseRelativeDays(days) {
  if (days === null) return "unknown timing";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export function buildNotificationFeed({ profile = {}, sessions = [], contentManifest = null, contentNotifications = [] } = {}) {
  const feed = [];
  const streakDays = calculateStreakDays(sessions);
  const daysUntilTest = getDaysUntil(profile.test_date || profile.testDate);

  if (daysUntilTest !== null) {
    feed.push({
      id: "test-date",
      type: daysUntilTest <= 7 ? "danger" : daysUntilTest <= 14 ? "warning" : "info",
      title: "Test date countdown",
      body: daysUntilTest <= 0
        ? "Your test date has arrived or passed. Move to timed review and final readiness checks."
        : `Your test is in ${humaniseRelativeDays(daysUntilTest)}.`,
      target: "/account",
    });
  }

  if (!sessions.length) {
    feed.push({
      id: "first-session",
      type: "info",
      title: "Start your first session",
      body: "A short practice run will unlock your progress history and next-task logic.",
      target: "/practice",
    });
  } else if (streakDays === 0) {
    feed.push({
      id: "streak-reminder",
      type: "warning",
      title: "Keep the streak alive",
      body: "You have a saved profile and progress history. Run one short session today to keep the loop active.",
      target: "/practice",
    });
  }

  if (contentManifest) {
    feed.push({
      id: "content-manifest",
      type: "info",
      title: "Content snapshot",
      body: `Catalogue refreshed ${contentManifest.updated_at ? `at ${new Date(contentManifest.updated_at).toLocaleString("en-GB")}` : "recently"}. Deadlines tracked: ${contentManifest.deadlines?.tracked ?? 0}, changes: ${contentManifest.deadlines?.changes ?? 0}.`,
      target: "/admin",
    });
  }

  for (const item of contentNotifications || []) {
    feed.push({
      id: item.id || crypto.randomUUID(),
      type: item.type || "info",
      title: item.title || "Update",
      body: item.body || "",
      target: item.target || "/admin",
    });
  }

  return feed
    .map((item) => ({
      ...item,
      priority: item.type === "danger" ? 0 : item.type === "warning" ? 1 : 2,
      createdAt: toDate(contentManifest?.updated_at)?.toISOString() || new Date().toISOString(),
    }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 6);
}
