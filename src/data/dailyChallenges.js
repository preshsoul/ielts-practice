/**
 * Daily Practice Challenges
 *
 * A rotating set of bite-sized daily tasks deterministically selected by day-of-year.
 * Each challenge links to an existing practice route and suggests a focused activity.
 */

export const CHALLENGE_TEMPLATES = [
  {
    id: "reading_tfng",
    title: "5 T/F/NG Questions",
    description: "Sharpen your reading comprehension with 5 True/False/Not Given questions. Focus on distinguishing between 'False' and 'Not Given' — the most common mistake.",
    route: "/practice/reading",
    module: "reading",
    estimatedMinutes: 10,
    icon: "📖",
    hint: "Look for exact matches in the passage — if the information isn't there, it's Not Given.",
  },
  {
    id: "vocabulary_boost",
    title: "10 Vocabulary Words",
    description: "Learn 10 new academic words today. Focus on words commonly found in IELTS reading passages and writing prompts.",
    route: "/practice/vocabulary",
    module: "vocabulary",
    estimatedMinutes: 8,
    icon: "📝",
    hint: "Try using each new word in a sentence — active recall speeds up retention.",
  },
  {
    id: "writing_outline",
    title: "Writing Task 2 Outline",
    description: "Draft an outline for one IELTS Writing Task 2 essay. Focus on your thesis statement and 2-3 supporting arguments with examples.",
    route: "/practice/writing",
    module: "writing",
    estimatedMinutes: 15,
    icon: "✍️",
    hint: "Spend 2 minutes planning before writing — a clear structure makes a big difference in your coherence score.",
  },
  {
    id: "listening_practice",
    title: "Listening Strategy Drill",
    description: "Complete a focused listening exercise. Pay attention to answer type prediction — read the questions first and anticipate what kind of answer you'll need.",
    route: "/practice/listening",
    module: "listening",
    estimatedMinutes: 10,
    icon: "🎧",
    hint: "Check the word limit in the instructions — writing more words than allowed means zero marks.",
  },
  {
    id: "speaking_cue_card",
    title: "Speaking Part 2 Cue Card",
    description: "Practice one Part 2 long turn. Speak for 2 minutes on a cue card topic. Record yourself and review for fluency and coherence.",
    route: "/practice/speaking",
    module: "speaking",
    estimatedMinutes: 10,
    icon: "🎤",
    hint: "Use the 1-minute preparation time to jot down keywords — don't write full sentences.",
  },
  {
    id: "weak_area_focus",
    title: "Weak Area Focus",
    description: "Target your weakest section today. The system has identified this as an area where focused practice can make the biggest difference to your band score.",
    route: "/practice/reading",
    module: "reading",
    estimatedMinutes: 15,
    icon: "🎯",
    hint: "Quality over quantity — review each wrong answer carefully and understand why the correct answer is right.",
  },
  {
    id: "reading_multiple_choice",
    title: "5 Multiple Choice Questions",
    description: "Practice 5 IELTS Reading multiple-choice questions. Focus on eliminating wrong answers before selecting the correct one.",
    route: "/practice/reading",
    module: "reading",
    estimatedMinutes: 10,
    icon: "🔍",
    hint: "Read the question before the passage — it helps you know what to look for.",
  },
  {
    id: "grammar_check",
    title: "Grammar Quick Check",
    description: "Review 5 grammar questions covering common IELTS pitfalls: articles, prepositions, and verb tenses.",
    route: "/practice/reading",
    module: "reading",
    estimatedMinutes: 8,
    icon: "✅",
    hint: "Pay special attention to singular/plural agreement — it's a quick win for your writing score.",
  },
  {
    id: "writing_task1",
    title: "Writing Task 1 Overview",
    description: "Write a Task 1 overview paragraph. Focus on identifying the main trends without describing every data point.",
    route: "/practice/writing",
    module: "writing",
    estimatedMinutes: 12,
    icon: "📊",
    hint: "Don't include specific numbers in your overview — just describe the big picture trends.",
  },
];

/**
 * Get the challenge for a specific date (or today if not provided).
 * Uses day-of-year modulus for deterministic rotation — same challenge
 * for all users on a given day.
 */
export function getDailyChallenge(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const index = dayOfYear % CHALLENGE_TEMPLATES.length;
  return CHALLENGE_TEMPLATES[index];
}
