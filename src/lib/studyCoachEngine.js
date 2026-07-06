/**
 * AI Study Coach Engine
 *
 * Generates personalized daily actions, weekly study plans, and
 * scholarship-gated coaching priorities from practice history,
 * bridge analysis, vocabulary progress, and profile data.
 *
 * All client-side — no API calls. Pure computation from existing data.
 */

import { computeWeakSections } from "./sessionTools.js";
import { rankSkillsByUnlockImpact } from "./bridgeService.js";

// ── Module metadata ─────────────────────────────────────────────────────────

const MODULE_META = {
  reading: { label: "Reading", icon: "📖", route: "/practice/reading", focus: "T/F/NG questions" },
  listening: { label: "Listening", icon: "🎧", route: "/practice/listening", focus: "Answer prediction" },
  writing: { label: "Writing", icon: "✍️", route: "/practice/writing", focus: "Task 2 essays" },
  speaking: { label: "Speaking", icon: "🗣️", route: "/practice/speaking", focus: "Cue card responses" },
};

// ── Daily Actions Generator ─────────────────────────────────────────────────

/**
 * Generate today's recommended actions, ordered by priority.
 *
 * @param {object} snapshot — from buildDashboardSnapshot(profile, sessions)
 * @param {object|null} bridgeAnalysis — from analyzeBridge()
 * @param {object|null} vocabStats — from getVocabularyStats()
 * @param {object} profile — user profile
 * @param {Array} sessions — all practice sessions
 * @returns {Array} ranked action objects
 */
export function generateDailyActions(snapshot, bridgeAnalysis, vocabStats, profile, sessions = []) {
  const actions = [];

  // ── Priority 0: Test date urgency ─────────────────────────────────────
  if (snapshot?.daysUntilTest !== null && snapshot.daysUntilTest !== undefined && snapshot.daysUntilTest <= 14) {
    actions.push({
      id: "mock-test-urgent",
      priority: 0,
      type: "mock-test",
      module: null,
      focus: "Full timed simulation",
      reason: snapshot.daysUntilTest <= 0
        ? "Your test date has passed. Run a final readiness check."
        : `Your test is in ${snapshot.daysUntilTest} days. Run a timed mock test.`,
      icon: "⏱️",
      duration: "2h 45m",
      action: "Take a full mock test",
      route: "/practice/mock-test",
    });
  }

  // ── Priority 1: Scholarship-gated actions ─────────────────────────────
  if (bridgeAnalysis && bridgeAnalysis.shortlistGaps.length > 0) {
    const rankedSkills = rankSkillsByUnlockImpact(bridgeAnalysis.shortlistGaps);
    for (const skill of rankedSkills.slice(0, 2)) {
      const meta = MODULE_META[skill.module];
      if (!meta) continue;
      actions.push({
        id: `scholarship-gated-${skill.module}`,
        priority: 1,
        type: "practice",
        module: skill.module,
        focus: meta.focus,
        reason: `Improving ${meta.label} unlocks ${skill.scholarshipsUnlocked} shortlisted scholarship${skill.scholarshipsUnlocked > 1 ? "s" : ""}${skill.scholarshipNames.length > 0 ? ` including "${skill.scholarshipNames[0]}"` : ""}.`,
        icon: meta.icon,
        duration: "30 min",
        action: `Practice ${meta.label} — focus on ${meta.focus}`,
        route: meta.route,
      });
    }
  }

  // ── Priority 2: Weak area actions ─────────────────────────────────────
  const weakSections = computeWeakSections(sessions);
  // Map sections to modules
  const weakModules = new Set();
  for (const section of weakSections) {
    const lower = section.toLowerCase();
    if (lower.includes("reading")) weakModules.add("reading");
    else if (lower.includes("listen")) weakModules.add("listening");
    else if (lower.includes("writ")) weakModules.add("writing");
    else if (lower.includes("speak")) weakModules.add("speaking");
  }

  // Filter out weak modules already covered by scholarship-gated actions
  const coveredModules = new Set(actions.map((a) => a.module).filter(Boolean));
  for (const mod of weakModules) {
    if (coveredModules.has(mod) || actions.length >= 4) continue;
    const meta = MODULE_META[mod];
    if (!meta) continue;
    actions.push({
      id: `weak-area-${mod}`,
      priority: 2,
      type: "practice",
      module: mod,
      focus: meta.focus,
      reason: `${meta.label} is a weak area (below 60% accuracy). Targeted practice recommended.`,
      icon: meta.icon,
      duration: "20 min",
      action: `Practice ${meta.label}`,
      route: meta.route,
    });
  }

  // ── Priority 3: Vocabulary review ─────────────────────────────────────
  if (vocabStats && vocabStats.dueCount > 0 && actions.length < 4) {
    actions.push({
      id: "vocab-review",
      priority: 3,
      type: "vocabulary",
      module: null,
      focus: null,
      reason: `${vocabStats.dueCount} word${vocabStats.dueCount > 1 ? "s" : ""} due for review in your spaced repetition queue.`,
      icon: "📚",
      duration: `${Math.min(15, vocabStats.dueCount)} min`,
      action: `Review ${vocabStats.dueCount} vocabulary words`,
      route: "/practice/vocabulary",
    });
  }

  // ── Priority 4: Streak restoration ────────────────────────────────────
  if (snapshot?.streakDays === 0 && sessions.length > 0 && actions.length < 4) {
    actions.push({
      id: "streak-restore",
      priority: 4,
      type: "practice",
      module: snapshot?.weakestSkill || "reading",
      focus: null,
      reason: "Keep your practice streak alive. One session today maintains momentum.",
      icon: "🔥",
      duration: "15 min",
      action: `Quick ${MODULE_META[snapshot?.weakestSkill || "reading"]?.label || "Reading"} session`,
      route: MODULE_META[snapshot?.weakestSkill || "reading"]?.route || "/practice/reading",
    });
  }

  // ── Priority 5: First session prompt ──────────────────────────────────
  if (sessions.length === 0 && actions.length === 0) {
    actions.push({
      id: "first-session",
      priority: 5,
      type: "practice",
      module: "reading",
      focus: null,
      reason: "Start your first practice session to unlock band estimates and personalized coaching.",
      icon: "🚀",
      duration: "20 min",
      action: "Start your first practice session",
      route: "/practice/reading",
    });
  }

  // ── Priority 6: Default — weakest skill maintenance ───────────────────
  if (actions.length === 0) {
    const weakest = snapshot?.weakestSkill || "writing";
    const meta = MODULE_META[weakest];
    actions.push({
      id: "default-maintenance",
      priority: 6,
      type: "practice",
      module: weakest,
      focus: meta?.focus || null,
      reason: `Keep improving your ${meta?.label || weakest}. Consistent practice drives band gains.`,
      icon: meta?.icon || "📝",
      duration: "20 min",
      action: `Practice ${meta?.label || weakest}`,
      route: meta?.route || "/practice",
    });
  }

  // Sort by priority
  actions.sort((a, b) => a.priority - b.priority);

  return actions;
}

// ── Weekly Plan Generator ───────────────────────────────────────────────────

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Generate a 7-day study plan from today.
 */
export function generateWeeklyPlan(bridgeAnalysis, weakSections, vocabStats, snapshot, sessions = [], profile = {}) {
  const today = new Date();
  const days = [];

  // Determine focus modules from bridge + weak areas
  const focusModules = determineFocusModules(bridgeAnalysis, weakSections);

  // Session distribution (weighted by focus)
  const moduleWeights = {};
  for (const mod of focusModules) {
    const impact = bridgeAnalysis?.shortlistGaps
      ? rankSkillsByUnlockImpact(bridgeAnalysis.shortlistGaps)
          .find((s) => s.module === mod)?.scholarshipsUnlocked || 1
      : 1;
    moduleWeights[mod] = impact;
  }

  // Default weights if no focus modules
  if (Object.keys(moduleWeights).length === 0) {
    moduleWeights.reading = 3;
    moduleWeights.writing = 2;
    moduleWeights.listening = 1;
    moduleWeights.speaking = 1;
  }

  const totalWeight = Object.values(moduleWeights).reduce((a, b) => a + b, 0);
  const sessionsPerWeek = Math.min(7, Math.max(3, Math.round(totalWeight * 0.8)));

  // Distribute sessions across 7 days (5 practice days, 2 lighter)
  const practiceDays = [0, 1, 2, 4, 5]; // Mon, Tue, Wed, Fri, Sat (Thu + Sun lighter)

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const isPracticeDay = practiceDays.includes(i);
    const daySessions = [];

    if (isPracticeDay) {
      // Assign modules by weight
      let remaining = 2; // max 2 sessions per day
      const assigned = new Set();

      // First: highest-impact module
      const sortedModules = Object.entries(moduleWeights)
        .sort(([, a], [, b]) => b - a)
        .map(([mod]) => mod);

      for (const mod of sortedModules) {
        if (remaining <= 0) break;
        if (assigned.has(mod)) continue;
        const meta = MODULE_META[mod];
        daySessions.push({
          type: "practice",
          module: mod,
          focus: meta?.focus || "",
          duration: "30 min",
          label: `${meta?.label || mod} Practice`,
        });
        assigned.add(mod);
        remaining--;
      }
    }

    // Add vocabulary review on practice days
    if (isPracticeDay && vocabStats && vocabStats.dueCount > 0) {
      daySessions.push({
        type: "vocabulary",
        module: null,
        focus: null,
        duration: "10 min",
        label: `Review ${Math.min(10, vocabStats.dueCount)} words`,
      });
    }

    // Lighter day — just vocabulary or rest
    if (!isPracticeDay && daySessions.length === 0) {
      if (vocabStats && vocabStats.dueCount > 3 && i % 3 === 0) {
        daySessions.push({
          type: "vocabulary",
          module: null,
          focus: null,
          duration: "5 min",
          label: `Quick review: ${Math.min(5, vocabStats.dueCount)} words`,
        });
      } else {
        daySessions.push({
          type: "rest",
          module: null,
          focus: null,
          duration: "—",
          label: "Rest day — recovery is part of progress",
        });
      }
    }

    days.push({
      date: dateStr,
      dayName: DAY_NAMES[i],
      dayIndex: i,
      isPracticeDay,
      sessions: daySessions,
      totalDuration: daySessions.reduce((sum, s) => {
        const mins = parseInt(s.duration) || 0;
        return sum + (Number.isNaN(mins) ? 0 : mins);
      }, 0),
    });
  }

  return {
    weekStart: days[0]?.date || today.toISOString().slice(0, 10),
    weekEnd: days[6]?.date || "",
    days,
    summary: {
      focusModules,
      totalPracticeSessions: days.reduce(
        (sum, d) => sum + d.sessions.filter((s) => s.type === "practice").length, 0,
      ),
      totalVocabSessions: days.reduce(
        (sum, d) => sum + d.sessions.filter((s) => s.type === "vocabulary").length, 0,
      ),
      scholarshipImpact: bridgeAnalysis?.eligibleNowCount || 0,
    },
  };
}

function determineFocusModules(bridgeAnalysis, weakSections) {
  const modules = new Set();

  // Bridge-gated: modules with scholarship unlock impact
  if (bridgeAnalysis?.shortlistGaps?.length > 0) {
    const ranked = rankSkillsByUnlockImpact(bridgeAnalysis.shortlistGaps);
    for (const skill of ranked.slice(0, 2)) {
      modules.add(skill.module);
    }
  }

  // Weak areas
  for (const section of (weakSections || [])) {
    const lower = section.toLowerCase();
    if (lower.includes("reading")) modules.add("reading");
    else if (lower.includes("listen")) modules.add("listening");
    else if (lower.includes("writ")) modules.add("writing");
    else if (lower.includes("speak")) modules.add("speaking");
  }

  // Bridge biggest gap module
  if (bridgeAnalysis?.biggestGapModule) {
    modules.add(bridgeAnalysis.biggestGapModule);
  }

  // Default: always include reading + writing if nothing else
  if (modules.size === 0) {
    modules.add("reading");
    modules.add("writing");
  }

  return Array.from(modules);
}

// ── Scholarship-Gated Coaching ───────────────────────────────────────────────

/**
 * Get coaching priorities sorted by scholarship unlock impact.
 * Wraps rankSkillsByUnlockImpact from bridgeService with module metadata.
 */
export function getScholarshipGatedCoaching(bridgeAnalysis) {
  if (!bridgeAnalysis?.shortlistGaps?.length) return [];

  const ranked = rankSkillsByUnlockImpact(bridgeAnalysis.shortlistGaps);

  return ranked.map((skill) => ({
    ...skill,
    meta: MODULE_META[skill.module] || null,
    label: MODULE_META[skill.module]?.label || skill.module,
    icon: MODULE_META[skill.module]?.icon || "📝",
    route: MODULE_META[skill.module]?.route || "/practice",
  }));
}
