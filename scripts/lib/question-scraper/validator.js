import { validateLegacyQuestion } from "./schema.js";

export function validateGeneratedQuestion(question) {
  const { valid, errors } = validateLegacyQuestion(question);
  if (!valid) {
    return { valid: false, errors };
  }

  const issues = [];
  if (Array.isArray(question.options) && question.options.length < 3) {
    issues.push("options too short");
  }
  if (!String(question.question || "").trim()) {
    issues.push("empty question");
  }
  if (!String(question.answer || "").trim()) {
    issues.push("empty answer");
  }
  return { valid: issues.length === 0, errors: issues };
}

export function validateQuestionSet(questions = []) {
  const invalid = [];
  const valid = [];
  for (const question of questions) {
    const result = validateGeneratedQuestion(question);
    if (result.valid) valid.push(question);
    else invalid.push({ question, errors: result.errors });
  }
  return { valid, invalid };
}
