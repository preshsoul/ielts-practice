/**
 * Daily Challenge Engine
 *
 * Determines whether today's challenge has been completed based on practice sessions.
 * Works entirely client-side — no server calls needed.
 */

import { getDailyChallenge } from "../data/dailyChallenges.js";

/**
 * Check if the daily challenge for the given date has been completed.
 * A challenge is "completed" if the user has a practice session from today
 * whose module matches the challenge's module.
 *
 * @param {Date} date - the date to check (defaults to today)
 * @param {Array} sessions - array of practice session objects
 * @returns {boolean}
 */
export function isChallengeCompleted(date = new Date(), sessions = []) {
  const challenge = getDailyChallenge(date);
  if (!challenge) return false;

  const dateStr = date.toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => {
    const sessionDate = (s?.completed_at || s?.date || "").toString().slice(0, 10);
    return sessionDate === dateStr;
  });

  if (todaySessions.length === 0) return false;

  // Match by module — if the challenge is for "reading", any reading session today counts
  if (challenge.module) {
    return todaySessions.some((s) => {
      const mod = (s?.module || "").toLowerCase();
      return mod === challenge.module.toLowerCase();
    });
  }

  // If no module specified, any practice session today counts
  return todaySessions.length > 0;
}

/**
 * Get the last N days' challenge completion status for a streak display.
 *
 * @param {Array} sessions
 * @param {number} days - how many days to look back (default 7)
 * @returns {Array<{ date: string, challenge: object, completed: boolean }>}
 */
export function getChallengeHistory(sessions = [], days = 7) {
  const history = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const challenge = getDailyChallenge(date);
    const completed = isChallengeCompleted(date, sessions);
    history.push({
      date: date.toISOString().slice(0, 10),
      challenge,
      completed,
    });
  }
  return history;
}
