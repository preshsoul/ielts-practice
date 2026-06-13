import { useEffect, useState, useCallback } from "react";
import { IELTS_VOCABULARY } from "../../data/ieltsVocabulary.js";
import { loadVocabProgress, getDailyQueue, recordAnswer, getVocabularyStats } from "../../lib/vocabularyEngine.js";

/**
 * VocabularyPractice — Flashcard UI at /practice/vocabulary
 *
 * Phases: idle → studying → done
 * Shows word → tap to reveal definition and example → rate as Easy/Medium/Hard
 * Saves progress to localStorage via vocabularyEngine.
 *
 * Props:
 *   onSessionComplete - callback to save session (from App.jsx)
 *   C, Chip, PrimaryBtn - UI atoms
 */
export default function VocabularyPractice({ profile = null, onSessionComplete = null, C = {}, Chip = null, PrimaryBtn = null }) {
  const profileId = profile?.id || null;
  const [phase, setPhase] = useState("idle");
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState(() => loadVocabProgress(profileId));
  const [sessionResults, setSessionResults] = useState([]);
  const [stats, setStats] = useState(() => getVocabularyStats(loadVocabProgress(profileId), IELTS_VOCABULARY));

  useEffect(() => {
    const currentProgress = loadVocabProgress(profileId);
    const dailyQueue = getDailyQueue(currentProgress, IELTS_VOCABULARY);
    setProgress(currentProgress);
    setQueue(dailyQueue);
    setStats(getVocabularyStats(currentProgress, IELTS_VOCABULARY));
  }, [profileId]);

  const startSession = useCallback(() => {
    const currentProgress = loadVocabProgress(profileId);
    const dailyQueue = getDailyQueue(currentProgress, IELTS_VOCABULARY);
    setProgress(currentProgress);
    setQueue(dailyQueue);
    setCurrentIndex(0);
    setRevealed(false);
    setSessionResults([]);
    setPhase("studying");
  }, []);

  const handleReveal = useCallback(() => {
    setRevealed(true);
  }, []);

  const handleAnswer = useCallback((quality) => {
    // quality: "easy" | "medium" | "hard"
    const word = queue[currentIndex];
    if (!word) return;

    const isCorrect = quality === "easy" || quality === "medium";
    const updatedProgress = recordAnswer(word.id, isCorrect, { ...progress }, profileId);
    setProgress(updatedProgress);

    setSessionResults((prev) => [...prev, {
      wordId: word.id,
      word: word.word,
      correct: isCorrect,
      quality,
    }]);

    // Move to next word
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      // Session complete
      setPhase("done");
      setStats(getVocabularyStats(updatedProgress, IELTS_VOCABULARY));
      if (onSessionComplete) {
        onSessionComplete({
          date: new Date().toISOString(),
          score: sessionResults.filter((r) => r.correct).length + (isCorrect ? 1 : 0),
          total: queue.length,
          module: "vocabulary",
          mode: "practice",
          component: "Vocabulary review",
          results: [...sessionResults, { wordId: word.id, word: word.word, correct: isCorrect, quality }].map((r) => ({
            id: r.wordId,
            section: "Vocabulary",
            correct: r.correct,
            rubricAvg: r.correct ? 5 : 2,
          })),
          summary: `Reviewed ${queue.length} words`,
        });
      }
    } else {
      setCurrentIndex(nextIndex);
      setRevealed(false);
    }
  }, [currentIndex, queue, progress, sessionResults, onSessionComplete]);

  // Idle phase — show stats and start button
  if (phase === "idle") {
    return (
      <div className="vocabulary-practice">
        <div className="vocabulary-practice__hero">
          <h1>Vocabulary Builder</h1>
          <p className="vocabulary-practice__subtitle">
            Spaced repetition flashcards for IELTS Academic vocabulary.
          </p>
        </div>

        <div className="vocabulary-practice__stats">
          <div className="vocabulary-practice__stat">
            <span className="vocabulary-practice__stat-value">{stats.mastered}</span>
            <span className="vocabulary-practice__stat-label">Mastered</span>
          </div>
          <div className="vocabulary-practice__stat">
            <span className="vocabulary-practice__stat-value">{stats.inReview}</span>
            <span className="vocabulary-practice__stat-label">In Review</span>
          </div>
          <div className="vocabulary-practice__stat">
            <span className="vocabulary-practice__stat-value">{stats.learning}</span>
            <span className="vocabulary-practice__stat-label">Learning</span>
          </div>
          <div className="vocabulary-practice__stat">
            <span className="vocabulary-practice__stat-value">{stats.percentComplete}%</span>
            <span className="vocabulary-practice__stat-label">Complete</span>
          </div>
        </div>

        <div className="vocabulary-practice__start">
          <p>You have <strong>{queue.length} words</strong> to review today.</p>
          <button className="vocabulary-practice__start-btn" onClick={startSession}>
            Start Review
          </button>
        </div>
      </div>
    );
  }

  // Done phase
  if (phase === "done") {
    const correctCount = sessionResults.filter((r) => r.correct).length;
    const totalCount = sessionResults.length;
    return (
      <div className="vocabulary-practice">
        <div className="vocabulary-practice__hero">
          <h1>Session Complete</h1>
        </div>
        <div className="vocabulary-practice__result">
          <span className="vocabulary-practice__result-score">{correctCount}/{totalCount}</span>
          <span className="vocabulary-practice__result-label">words correct</span>
        </div>
        <div className="vocabulary-practice__result-stats">
          <span>{stats.mastered} words mastered total</span>
          <span>{stats.percentComplete}% of {stats.totalAvailable} words</span>
          {stats.streak > 0 && <span>{stats.streak}-day vocabulary streak 🔥</span>}
        </div>
        <div className="vocabulary-practice__review-list">
          {sessionResults.map((r, i) => (
            <div key={i} className={`vocabulary-practice__review-item ${r.correct ? "vocabulary-practice__review-item--correct" : "vocabulary-practice__review-item--incorrect"}`}>
              <span>{r.word}</span>
              <span>{r.correct ? "✓" : "✗"}</span>
            </div>
          ))}
        </div>
        <div className="vocabulary-practice__done-actions">
          <button className="vocabulary-practice__start-btn" onClick={startSession}>
            Review Again
          </button>
        </div>
      </div>
    );
  }

  // Studying phase — flashcard
  const currentWord = queue[currentIndex];
  if (!currentWord) {
    return <div className="vocabulary-practice">No words to review today!</div>;
  }

  return (
    <div className="vocabulary-practice">
      <div className="vocabulary-practice__progress">
        <span>{currentIndex + 1} / {queue.length}</span>
        <div className="vocabulary-practice__progress-bar">
          <div
            className="vocabulary-practice__progress-fill"
            style={{ width: `${Math.round(((currentIndex + 1) / queue.length) * 100)}%` }}
          />
        </div>
      </div>

      <div className={`vocabulary-flashcard ${revealed ? "vocabulary-flashcard--revealed" : ""}`}>
        <div className="vocabulary-flashcard__word">
          {currentWord.word}
        </div>
        {currentWord.difficulty && (
          <span className="vocabulary-flashcard__difficulty">
            {"●".repeat(currentWord.difficulty)}{"○".repeat(3 - currentWord.difficulty)}
          </span>
        )}

        {!revealed ? (
          <button className="vocabulary-flashcard__reveal-btn" onClick={handleReveal}>
            Tap to reveal definition
          </button>
        ) : (
          <div className="vocabulary-flashcard__back">
            <p className="vocabulary-flashcard__definition">{currentWord.definition}</p>
            <p className="vocabulary-flashcard__example">"{currentWord.example}"</p>
            {currentWord.wordFamily.length > 0 && (
              <p className="vocabulary-flashcard__family">
                Related: {currentWord.wordFamily.join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {revealed && (
        <div className="vocabulary-practice__rating">
          <p className="vocabulary-practice__rating-label">How well did you know this?</p>
          <div className="vocabulary-practice__rating-buttons">
            <button
              className="vocabulary-practice__rating-btn vocabulary-practice__rating-btn--hard"
              onClick={() => handleAnswer("hard")}
            >
              Hard
            </button>
            <button
              className="vocabulary-practice__rating-btn vocabulary-practice__rating-btn--medium"
              onClick={() => handleAnswer("medium")}
            >
              Medium
            </button>
            <button
              className="vocabulary-practice__rating-btn vocabulary-practice__rating-btn--easy"
              onClick={() => handleAnswer("easy")}
            >
              Easy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
