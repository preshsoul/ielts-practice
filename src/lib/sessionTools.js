import securityLogger from "../services/securityLogger.js";
import { collectSectionStats } from "./sessionStats.js";

export function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function selectQueue(allQuestions, weakSections, exam, count = 20) {
  const pool = exam === "All" ? allQuestions : allQuestions.filter((question) => question.exam === exam);
  if (!pool.length) return [];
  if (weakSections.length === 0) return shuffle(pool).slice(0, count);

  const weak = pool.filter((question) => weakSections.includes(question.section));
  const other = pool.filter((question) => !weakSections.includes(question.section));
  const weakCount = Math.min(Math.round(count * 0.6), weak.length);
  const otherCount = Math.min(count - weakCount, other.length);

  return shuffle([
    ...shuffle(weak).slice(0, weakCount),
    ...shuffle(other).slice(0, otherCount),
  ]);
}

export function computeWeakSections(sessions, threshold = 0.6) {
  const sectionData = collectSectionStats(sessions);
  return Object.entries(sectionData)
    .filter(([, data]) => data.sessions.size >= 3 && data.correct / data.total < threshold)
    .map(([section]) => section);
}

export function normalizeSessions(list) {
  return (Array.isArray(list) ? list : []).map((session) => ({
    ...session,
    id: session.id || session.date || crypto.randomUUID(),
    module: session.module || "reading",
    mode: session.mode || "practice",
    component: session.component || "Reading quiz",
  }));
}

export function mergeSessions(existing, incoming) {
  const sessions = new Map();
  [...normalizeSessions(existing), ...normalizeSessions(incoming)].forEach((session) => {
    sessions.set(session.id, session);
  });

  return [...sessions.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function buildResultsExport(sessions) {
  const totalQuestions = sessions.reduce((sum, session) => sum + (Array.isArray(session.results) ? session.results.length : 0), 0);
  const correctAnswers = sessions.reduce(
    (sum, session) => sum + (Array.isArray(session.results) ? session.results.filter((result) => result.correct).length : 0),
    0
  );

  return {
    exported_at: new Date().toISOString(),
    summary: {
      total_sessions: sessions.length,
      total_questions_answered: totalQuestions,
      total_correct_answers: correctAnswers,
      accuracy_pct: totalQuestions ? Math.round((correctAnswers / totalQuestions) * 1000) / 10 : 0,
    },
    sessions: sessions.map((session) => ({
      id: session.id,
      date: session.date,
      exam: session.exam,
      module: session.module || session.exam,
      mode: session.mode || "practice",
      score: session.score,
      total: session.total,
      durationSecs: session.durationSecs || null,
      results: Array.isArray(session.results)
        ? session.results.map((result) => ({
            section: result.section,
            correct: Boolean(result.correct),
          }))
        : [],
    })),
  };
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportResultsData(sessions, userId = "anonymous") {
  securityLogger.logDataExport(userId, "practice_results", sessions.length);
  downloadJson(`ielts-results-${new Date().toISOString().slice(0, 10)}.json`, buildResultsExport(sessions));
}
