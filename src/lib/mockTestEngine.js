/**
 * Mock Test Engine
 *
 * Question selection, state machine, and results computation for the
 * full IELTS mock test simulator.
 */

import { estimateOverallBand } from "./bandScoreEstimator.js";

/**
 * Mock test phases in order.
 */
export const MOCK_TEST_PHASES = [
  { key: "listening", label: "Listening", durationMin: 30, description: "Answer 40 questions based on audio passages." },
  { key: "reading", label: "Reading", durationMin: 60, description: "Answer 40 questions across 3 reading passages." },
  { key: "writing", label: "Writing", durationMin: 60, description: "Complete Task 1 (20 min) and Task 2 (40 min)." },
  { key: "speaking", label: "Speaking", durationMin: 15, description: "Complete 3 speaking tasks with voice recording." },
];

/**
 * Select mock test questions from the question bank.
 * Balances across sections and difficulty levels.
 *
 * @param {Array} qb - full question bank
 * @param {Array} passages - passage data
 * @param {number} count - questions per module (default 20 for mock test)
 * @returns {{ reading: Array, grammar: Array }}
 */
export function selectMockQuestions(qb = [], passages = [], count = 20) {
  const allQuestions = Array.isArray(qb) ? qb : [];

  // Reading questions — prefer IELTS, balance T/F/NG and Multiple Choice
  const readingQuestions = allQuestions
    .filter((q) => q.section?.toLowerCase().includes("reading"))
    .slice(0, count);

  // Grammar questions as supplementary
  const grammarQuestions = allQuestions
    .filter((q) => q.section?.toLowerCase().includes("grammar"))
    .slice(0, Math.floor(count / 2));

  return { reading: readingQuestions, grammar: grammarQuestions };
}

/**
 * Compute mock test results from per-section scores.
 *
 * @param {Array} sectionResults - [{ module: string, score: number, total: number }]
 * @param {Array} sessions - existing practice sessions (for band estimation context)
 * @returns {{ overallBand: number|null, sections: Array, totalScore: number, totalMax: number }}
 */
export function computeMockResults(sectionResults = [], sessions = []) {
  const sections = MOCK_TEST_PHASES.map((phase) => {
    const result = sectionResults.find((r) => r.module === phase.key);
    return {
      module: phase.key,
      label: phase.label,
      score: result?.score || 0,
      total: result?.total || 0,
      percentage: result?.total > 0 ? Math.round((result.score / result.total) * 100) : 0,
    };
  });

  const totalScore = sections.reduce((sum, s) => sum + s.score, 0);
  const totalMax = sections.reduce((sum, s) => sum + s.total, 0);

  // Create synthetic sessions for band estimation
  const mockSessions = sections
    .filter((s) => s.total > 0)
    .map((s) => ({
      module: s.module,
      score: s.score,
      total: s.total,
      date: new Date().toISOString(),
      exam: "IELTS",
      mode: "mock_test",
      component: `Mock test - ${s.label}`,
      results: [],
    }));

  const estimate = estimateOverallBand([...sessions, ...mockSessions]);

  return {
    overallBand: estimate.overallBand,
    confidence: estimate.confidence,
    sections,
    totalScore,
    totalMax,
    totalPercentage: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0,
    durationMinutes: MOCK_TEST_PHASES.reduce((sum, p) => sum + p.durationMin, 0),
  };
}
