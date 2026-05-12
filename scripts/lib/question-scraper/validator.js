import { normalizeQuestionRecord, normalizeQuestionText, validateLegacyQuestion } from "./schema.js";

export function validateGeneratedQuestion(question) {
  const normalized = normalizeQuestionRecord(question);
  const { valid, errors } = validateLegacyQuestion(normalized);
  if (!valid) {
    return { valid: false, errors };
  }

  const issues = [];
  if (Array.isArray(normalized.options) && normalized.options.length < 3) {
    issues.push("options too short");
  }
  if (!String(normalized.question || "").trim()) {
    issues.push("empty question");
  }
  if (!String(normalized.answer || "").trim()) {
    issues.push("empty answer");
  }
  if (normalized.question && !/[.?!…]$/.test(normalizeQuestionText(normalized.question))) {
    issues.push("question punctuation missing");
  }
  if (normalized.explanation && !/[.?!…]$/.test(normalizeQuestionText(normalized.explanation))) {
    issues.push("explanation punctuation missing");
  }
  return { valid: issues.length === 0, errors: issues };
}

export function validateQuestionSet(questions = []) {
  const invalid = [];
  const valid = [];
  const seenQuestionTexts = new Set();
  for (const question of questions) {
    const normalized = normalizeQuestionRecord(question);
    const questionTextKey = normalizeQuestionText(normalized.question).toLowerCase();
    if (questionTextKey && seenQuestionTexts.has(questionTextKey)) {
      invalid.push({ question, errors: ["duplicate question text"] });
      continue;
    }
    const result = validateGeneratedQuestion(normalized);
    if (result.valid) valid.push(normalized);
    else invalid.push({ question, errors: result.errors });
    if (result.valid && questionTextKey) {
      seenQuestionTexts.add(questionTextKey);
    }
  }
  return { valid, invalid };
}
