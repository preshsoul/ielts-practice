export function collectSectionStats(sessions = []) {
  const sectionStats = {};

  sessions.forEach((session, sessionIndex) => {
    const sessionId = session?.date || sessionIndex;
    const results = Array.isArray(session?.results) ? session.results : [];

    results.forEach((result) => {
      if (!result?.section) return;
      if (!sectionStats[result.section]) {
        sectionStats[result.section] = { correct: 0, total: 0, sessions: new Set() };
      }
      sectionStats[result.section].total += 1;
      if (result.correct) sectionStats[result.section].correct += 1;
      sectionStats[result.section].sessions.add(sessionId);
    });
  });

  return sectionStats;
}

export function collectModuleStats(sessions = [], moduleOrder = ["reading", "listening", "writing", "speaking"]) {
  const stats = Object.fromEntries(
    moduleOrder.map((module) => [module, { attempts: 0, correct: 0, total: 0, latest: null }])
  );

  sessions.forEach((session) => {
    const module = String(session?.module || "reading").toLowerCase();
    if (!stats[module]) return;
    const total = Number(session?.total) || 0;
    const score = Number(session?.score) || 0;
    const current = stats[module];

    current.attempts += 1;
    current.correct += score;
    current.total += total;

    const latestTime = current.latest ? new Date(current.latest.date || 0).getTime() : -Infinity;
    const sessionTime = new Date(session?.date || 0).getTime();
    if (!Number.isFinite(latestTime) || sessionTime >= latestTime) {
      current.latest = session;
    }
  });

  return stats;
}
