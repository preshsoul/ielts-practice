/**
 * Output validation for the IELTS reading passage generator.
 *
 * Validates that the LLM-generated JSON matches the expected schema
 * and that passage content meets quality thresholds before returning
 * to the client.
 */

export interface GeneratedPassage {
  title: string;
  body: string;
  topic: string;
  wordCount: number;
  cefrLevel: string;
}

export interface GeneratedQuestion {
  type: string;
  questionText: string;
  options: string[];
  answer: string;
  explanation: string;
  difficulty: number;
  section: string;
}

export interface GeneratedReading {
  passage: GeneratedPassage;
  questions: GeneratedQuestion[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_TYPES = new Set(["tfng", "mcq", "summary", "matching"]);
const VALID_CEFR = new Set(["A2", "B1", "B2", "C1", "C2"]);
const VALID_SECTIONS: Record<string, string> = {
  tfng: "Reading - T/F/NG",
  mcq: "Reading - Multiple Choice",
  summary: "Reading - Summary",
  matching: "Reading - Matching",
};

export function validateGeneratedReading(output: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!output || typeof output !== "object") {
    return { valid: false, errors: ["Output is not a JSON object"], warnings: [] };
  }

  const data = output as Record<string, unknown>;

  // ── Validate passage ──────────────────────────────────────────────────────

  const passage = data.passage;
  if (!passage || typeof passage !== "object") {
    errors.push("Missing or invalid 'passage' object");
    return { valid: false, errors, warnings };
  }

  const p = passage as Record<string, unknown>;

  if (!p.title || typeof p.title !== "string" || p.title.trim().length === 0) {
    errors.push("Passage title is missing or empty");
  }
  if (typeof p.title === "string" && p.title.length > 300) {
    warnings.push(`Passage title is unusually long (${p.title.length} chars)`);
  }

  if (!p.body || typeof p.body !== "string" || p.body.trim().length === 0) {
    errors.push("Passage body is missing or empty");
  } else {
    const wordCount = (p.body as string).split(/\s+/).filter(Boolean).length;
    if (wordCount < 400) {
      errors.push(`Passage word count (${wordCount}) is too low (minimum 400)`);
    } else if (wordCount > 1400) {
      errors.push(`Passage word count (${wordCount}) is too high (maximum 1400)`);
    } else if (wordCount < 500) {
      warnings.push(`Passage word count (${wordCount}) is below recommended (500-1200)`);
    }
  }

  if (p.cefrLevel && typeof p.cefrLevel === "string" && !VALID_CEFR.has(p.cefrLevel)) {
    warnings.push(`Unexpected CEFR level: ${p.cefrLevel}`);
  }

  // ── Validate questions ────────────────────────────────────────────────────

  const questions = data.questions;
  if (!Array.isArray(questions)) {
    errors.push("Missing or invalid 'questions' array");
    return { valid: false, errors, warnings };
  }

  if (questions.length < 8) {
    errors.push(`Too few questions (${questions.length}) — minimum 8`);
  } else if (questions.length > 18) {
    errors.push(`Too many questions (${questions.length}) — maximum 18`);
  }

  const seenTypes = new Set<string>();
  const seenAnswers = new Set<string>();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Record<string, unknown>;
    const prefix = `questions[${i}]`;

    // Type validation
    if (!q.type || !VALID_TYPES.has(String(q.type))) {
      errors.push(`${prefix}: invalid or missing type "${q.type}"`);
    } else {
      seenTypes.add(String(q.type));
    }

    // Question text
    if (!q.questionText || typeof q.questionText !== "string" || String(q.questionText).trim().length === 0) {
      errors.push(`${prefix}: missing or empty questionText`);
    }

    // Options
    if (!Array.isArray(q.options)) {
      errors.push(`${prefix}: options is not an array`);
    } else if (q.options.length < 2) {
      errors.push(`${prefix}: options array has fewer than 2 entries`);
    } else if (q.options.length > 10) {
      warnings.push(`${prefix}: options array is unusually large (${q.options.length})`);
    }

    // Answer
    if (!q.answer || typeof q.answer !== "string" || String(q.answer).trim().length === 0) {
      errors.push(`${prefix}: missing or empty answer`);
    } else if (Array.isArray(q.options) && !q.options.includes(String(q.answer))) {
      // For matching questions, the answer might be a paragraph label, not in options
      if (String(q.type) !== "matching") {
        errors.push(`${prefix}: answer "${q.answer}" not found in options array`);
      }
    }

    // Explanation
    if (!q.explanation || typeof q.explanation !== "string" || String(q.explanation).trim().length < 10) {
      errors.push(`${prefix}: explanation is missing or too short`);
    }

    // Difficulty
    if (typeof q.difficulty !== "number" || ![1, 2, 3].includes(q.difficulty)) {
      warnings.push(`${prefix}: difficulty is not 1, 2, or 3 (got ${q.difficulty})`);
    }

    // Check for duplicate answers within the same question type (for tfng)
    if (String(q.type) === "tfng" && q.answer) {
      const ansKey = `tfng:${String(q.answer)}`;
      if (seenAnswers.has(ansKey)) {
        warnings.push(`${prefix}: duplicate tfng answer "${q.answer}" — all three tfng outcomes should appear`);
      }
      seenAnswers.add(ansKey);
    }
  }

  // ── Cross-validation ──────────────────────────────────────────────────────

  // At least one question type should be present
  if (seenTypes.size === 0) {
    errors.push("No valid question types found");
  }

  // Presence of paragraph labels is useful for matching questions
  if (seenTypes.has("matching") && passage && typeof (passage as Record<string, unknown>).body === "string") {
    const body = (passage as Record<string, unknown>).body as string;
    if (!/[Pp]aragraph\s+[A-F]/.test(body)) {
      warnings.push("Passage body does not contain labelled paragraphs (Paragraph A, B, etc.) — matching questions may not work well");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Normalize the LLM-generated output into a clean shape, filling in sensible
 * defaults for any missing fields.
 */
export function normalizeGeneratedReading(raw: Record<string, unknown>): GeneratedReading {
  const p = (raw.passage || {}) as Record<string, unknown>;
  const qs = Array.isArray(raw.questions) ? raw.questions : [];

  const passage: GeneratedPassage = {
    title: String(p.title || "IELTS Reading Passage").trim(),
    body: String(p.body || "").trim(),
    topic: String(p.topic || "General").trim(),
    wordCount: typeof p.wordCount === "number" && p.wordCount > 0
      ? p.wordCount
      : String(p.body || "").split(/\s+/).filter(Boolean).length,
    cefrLevel: VALID_CEFR.has(String(p.cefrLevel || "")) ? String(p.cefrLevel) : "B2",
  };

  const questions: GeneratedQuestion[] = qs.map((q: Record<string, unknown>) => ({
    type: VALID_TYPES.has(String(q.type || "")) ? String(q.type) : "mcq",
    questionText: String(q.questionText || "").trim(),
    options: Array.isArray(q.options) ? q.options.map((o: unknown) => String(o ?? "")) : [],
    answer: String(q.answer || "").trim(),
    explanation: String(q.explanation || "").trim(),
    difficulty: [1, 2, 3].includes(Number(q.difficulty)) ? Number(q.difficulty) : 2,
    section: String(q.section || VALID_SECTIONS[String(q.type)] || `Reading - ${String(q.type).toUpperCase()}`).trim(),
  }));

  return { passage, questions };
}
