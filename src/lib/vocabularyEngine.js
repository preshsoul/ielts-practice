/**
 * Vocabulary Engine — SM-2 Simplified Spaced Repetition
 *
 * Four boxes: new → learning → review → mastered
 * Intervals: 1 day (learning), 3 days (review), 7 days (review+), mastered (no more review)
 *
 * Progress persisted to user-scoped localStorage via userStorage.js.
 * Keys: loci.vocabProgress:{profileId} — no cross-user leaks.
 */

import { getUserStorage, setUserStorage, STORAGE_NAMESPACES } from "./userStorage.js";

const DAILY_NEW_WORDS = 10;
let currentProfileId = null;

/**
 * @typedef {Object} WordProgress
 * @property {string} wordId - the vocabulary word ID
 * @property {number} box - 0=new, 1=learning, 2=review, 3=mastered
 * @property {number} lastReviewed - timestamp (ms) of last review
 * @property {number} nextReview - timestamp (ms) when due for next review
 * @property {number} reviewCount - total times reviewed
 * @property {number} correctCount - total correct answers
 */

/**
 * Load or initialize vocabulary progress from localStorage.
 * @param {string|null} profileId
 * @returns {{ words: Record<string, WordProgress>, startedAt: string | null }}
 */
export function loadVocabProgress(profileId) {
  if (!profileId) return { words: {}, startedAt: null };
  currentProfileId = profileId;
  const data = getUserStorage(STORAGE_NAMESPACES.VOCAB_PROGRESS, profileId);
  if (data && data.words) {
    return { words: data.words || {}, startedAt: data.startedAt || null };
  }
  return { words: {}, startedAt: null };
}

/**
 * Save vocabulary progress to user-scoped localStorage.
 */
export function saveVocabProgress(progress, profileId) {
  if (!profileId) return;
  try {
    setUserStorage(STORAGE_NAMESPACES.VOCAB_PROGRESS, profileId, {
      words: progress.words,
      startedAt: progress.startedAt || new Date().toISOString(),
    });
  } catch {
    // silently ignore
  }
}

/**
 * Get the interval (in ms) for a given box level.
 * Box 1 (learning): 1 day
 * Box 2 (review): 3 days
 * Box 3 (review+): 7 days
 * Box 4 (mastered): never (no more reviews needed)
 */
function boxInterval(box) {
  if (box === 1) return 24 * 60 * 60 * 1000;
  if (box === 2) return 3 * 24 * 60 * 60 * 1000;
  if (box === 3) return 7 * 24 * 60 * 60 * 1000;
  return Infinity;
}

/**
 * Get the daily review queue — words due for review today + new words to learn.
 *
 * @param {object} progress - from loadVocabProgress()
 * @param {Array} allWords - full vocabulary array from ieltsVocabulary.js
 * @param {number} dailyNew - max new words per day (default 10)
 * @returns {Array} array of word objects to review today
 */
export function getDailyQueue(progress, allWords, dailyNew = DAILY_NEW_WORDS) {
  const now = Date.now();
  const words = progress.words || {};

  // Words due for review (past their nextReview date)
  const dueForReview = allWords.filter((w) => {
    const p = words[w.id];
    if (!p) return false;
    return p.box > 0 && p.box < 3 && p.nextReview <= now;
  });

  // New words to introduce today
  const reviewedIds = new Set(Object.keys(words));
  const newWords = allWords
    .filter((w) => !reviewedIds.has(w.id))
    .slice(0, dailyNew);

  // Combine: new words first, then due reviews
  return [...newWords, ...dueForReview].slice(0, dailyNew + 10); // cap total
}

/**
 * Record an answer for a vocabulary word.
 * Moves the word between boxes based on whether the answer was correct.
 *
 * @param {string} wordId
 * @param {boolean} correct - whether the user answered correctly
 * @param {object} progress - current progress object (will be mutated)
 * @returns {object} updated progress
 */
export function recordAnswer(wordId, correct, progress, profileId) {
  const words = progress.words || {};
  const now = Date.now();
  let entry = words[wordId];

  if (!entry) {
    entry = { wordId, box: 0, lastReviewed: now, nextReview: 0, reviewCount: 0, correctCount: 0 };
  }

  entry.lastReviewed = now;
  entry.reviewCount += 1;

  if (correct) {
    entry.correctCount += 1;
    entry.box = Math.min(3, entry.box + 1);
  } else {
    entry.box = Math.max(1, entry.box - 1);
  }

  entry.nextReview = now + boxInterval(entry.box);
  words[wordId] = entry;
  progress.words = words;

  if (!progress.startedAt) {
    progress.startedAt = new Date().toISOString();
  }

  saveVocabProgress(progress, profileId);
  return progress;
}

/**
 * Get vocabulary statistics for display.
 */
export function getVocabularyStats(progress, allWords = []) {
  const words = progress.words || {};
  const entries = Object.values(words);
  const totalSeen = entries.length;
  const mastered = entries.filter((e) => e.box >= 3).length;
  const inReview = entries.filter((e) => e.box === 2).length;
  const learning = entries.filter((e) => e.box === 1).length;
  const newCount = entries.filter((e) => e.box === 0).length;
  const totalAvailable = allWords.length || 150;

  return {
    totalSeen,
    totalAvailable,
    mastered,
    inReview,
    learning,
    new: newCount,
    percentComplete: totalAvailable > 0 ? Math.round((mastered / totalAvailable) * 100) : 0,
    streak: computeVocabStreak(progress),
    startedAt: progress.startedAt || null,
  };
}

/**
 * Compute vocabulary study streak — consecutive days with at least one review.
 */
function computeVocabStreak(progress) {
  const words = progress.words || {};
  const entries = Object.values(words);
  if (entries.length === 0) return 0;

  // Get all unique review dates (UTC day strings)
  const reviewDays = new Set();
  for (const entry of entries) {
    if (entry.lastReviewed) {
      const day = new Date(entry.lastReviewed).toISOString().slice(0, 10);
      reviewDays.add(day);
    }
  }

  const sorted = [...reviewDays].sort().reverse();
  if (sorted.length === 0) return 0;

  // Check if most recent review was today or yesterday
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);

  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;

  // Count consecutive days backwards
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = (prev.getTime() - curr.getTime()) / 86400000;
    if (Math.abs(diff - 1) < 0.1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
