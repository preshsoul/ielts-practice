function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDay(value) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function uniqueDays(sessions = []) {
  return [...new Set(
    sessions
      .map((session) => normalizeDay(session.completed_at || session.date))
      .filter(Boolean)
      .map((date) => date.toISOString().slice(0, 10))
  )]
    .sort();
}

function toBandNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function weakestSkill(selfAssessment = {}) {
  const skills = ["reading", "listening", "writing", "speaking"];
  const ranked = skills
    .map((skill) => ({ skill, value: toBandNumber(selfAssessment[skill]) ?? 0 }))
    .sort((a, b) => a.value - b.value);
  return ranked[0] || { skill: "reading", value: 0 };
}

function estimateBandFromSession(session = {}) {
  const score = Number(session.score);
  const total = Number(session.total);
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
  const accuracy = Math.max(0, Math.min(1, score / total));
  return Math.round(accuracy * 90) / 10;
}

function latestSessionBands(sessions = []) {
  const skills = { reading: null, listening: null, writing: null, speaking: null };
  const relevant = Array.isArray(sessions) ? sessions : [];
  for (let index = relevant.length - 1; index >= 0; index -= 1) {
    const session = relevant[index];
    const module = String(session?.module || "").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(skills, module) || skills[module] !== null) continue;
    const estimate = estimateBandFromSession(session);
    if (estimate !== null) {
      skills[module] = estimate;
    }
  }
  return skills;
}

export function calculateStreakDays(sessions = []) {
  const days = uniqueDays(sessions);
  if (!days.length) return 0;

  const daySet = new Set(days);
  let streak = 0;
  let cursor = new Date(days[days.length - 1] + "T00:00:00Z");

  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

export function getDaysUntil(dateString) {
  if (!dateString) return null;
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const utcTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));
  return Math.ceil((utcTarget - utcToday) / (1000 * 60 * 60 * 24));
}

export function buildDashboardSnapshot(profile = {}, sessions = []) {
  const practiceBands = latestSessionBands(sessions);
  const skillBands = {
    reading: profile.self_assessment?.reading ?? profile.selfAssessment?.reading ?? null,
    listening: profile.self_assessment?.listening ?? profile.selfAssessment?.listening ?? null,
    writing: profile.self_assessment?.writing ?? profile.selfAssessment?.writing ?? null,
    speaking: profile.self_assessment?.speaking ?? profile.selfAssessment?.speaking ?? null,
  };

  const liveSkillBands = {
    reading: practiceBands.reading ?? skillBands.reading,
    listening: practiceBands.listening ?? skillBands.listening,
    writing: practiceBands.writing ?? skillBands.writing,
    speaking: practiceBands.speaking ?? skillBands.speaking,
  };

  const streakDays = calculateStreakDays(sessions);
  const daysUntilTest = getDaysUntil(profile.test_date || profile.testDate);
  const weakest = weakestSkill(liveSkillBands);
  const recentSession = sessions.length ? sessions[sessions.length - 1] : null;

  let nextTask = `Work on ${weakest.skill} for 20 minutes`;
  if (daysUntilTest !== null && daysUntilTest <= 14) {
    nextTask = "Run a timed mock test and review mistakes";
  } else if (!sessions.length) {
    nextTask = "Start your first practice session";
  } else if (streakDays === 0) {
    nextTask = "Resume practice today to keep momentum";
  }

  return {
    streakDays,
    daysUntilTest,
    nextTask,
    skillBands: liveSkillBands,
    practiceBands,
    recentSession,
    weakestSkill: weakest.skill,
    totalSessions: sessions.length,
    targetBand: profile.target_band ?? profile.targetBand ?? null,
    targetModules: profile.target_modules || profile.targetModules || [],
  };
}
