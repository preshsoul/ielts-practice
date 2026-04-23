export const DEFAULT_QUESTION_BANK_VERSION = "1.1.0";

function isString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isArray(value) {
  return Array.isArray(value);
}

export function validateLegacyQuestion(question) {
  const errors = [];
  if (!question || typeof question !== "object") {
    return { valid: false, errors: ["question must be an object"] };
  }
  if (!isString(question.id)) errors.push("missing id");
  if (!isString(question.exam)) errors.push("missing exam");
  if (!isString(question.section)) errors.push("missing section");
  if (!isString(question.question)) errors.push("missing question");
  if (!isArray(question.options)) errors.push("missing options");
  if (!isString(question.answer)) errors.push("missing answer");
  if (!isString(question.explanation)) errors.push("missing explanation");
  if (!Number.isFinite(Number(question.difficulty))) errors.push("difficulty must be numeric");
  return { valid: errors.length === 0, errors };
}

export function validatePassageMap(passages) {
  if (!passages || typeof passages !== "object" || Array.isArray(passages)) {
    return { valid: false, errors: ["passages must be an object"] };
  }
  const errors = [];
  for (const [key, value] of Object.entries(passages)) {
    if (!isString(key)) errors.push(`invalid passage id: ${String(key)}`);
    if (!isString(value)) errors.push(`invalid passage text for ${key}`);
  }
  return { valid: errors.length === 0, errors };
}

export function dedupeById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function normalizeQuestions(items = []) {
  return dedupeById(items)
    .filter((item) => validateLegacyQuestion(item).valid)
    .map((item) => ({
      ...item,
      difficulty: Number(item.difficulty),
      options: Array.isArray(item.options) ? item.options : [],
      tags: Array.isArray(item.tags) ? item.tags : [],
    }));
}

export function normalizePassages(passages = {}) {
  const result = {};
  for (const [key, value] of Object.entries(passages || {})) {
    if (isString(key) && isString(value)) {
      result[key] = value.trim();
    }
  }
  return result;
}
