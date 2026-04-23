import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePassages, normalizeQuestions } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

async function readJsonIfExists(path, fallback) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function atomicWriteJson(path, data) {
  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  try {
    await rename(tempPath, path);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EXDEV") {
      await writeFile(path, JSON.stringify(data, null, 2), "utf8");
      try {
        await unlink(tempPath);
      } catch {
        // ignore temp cleanup failures
      }
      return;
    }
    throw error;
  }
}

function mergePassageMaps(base = {}, extra = {}) {
  return { ...normalizePassages(base), ...normalizePassages(extra) };
}

export async function readQuestionStores() {
  const baseQuestionsPath = join(ROOT, "content", "questions.base.json");
  const extraQuestionsPath = join(ROOT, "content", "questions.extra.json");
  const reviewQuestionsPath = join(ROOT, "content", "questions.review.json");
  const basePassagesPath = join(ROOT, "content", "passages.base.json");
  const extraPassagesPath = join(ROOT, "content", "passages.extra.json");

  const [baseQuestions, extraQuestions, reviewQuestions, basePassages, extraPassages] = await Promise.all([
    readJsonIfExists(baseQuestionsPath, { questions: [] }),
    readJsonIfExists(extraQuestionsPath, { questions: [] }),
    readJsonIfExists(reviewQuestionsPath, { questions: [], passages: {} }),
    readJsonIfExists(basePassagesPath, { passages: {} }),
    readJsonIfExists(extraPassagesPath, { passages: {} }),
  ]);

  return {
    baseQuestionsPath,
    extraQuestionsPath,
    reviewQuestionsPath,
    basePassagesPath,
    extraPassagesPath,
    baseQuestions: Array.isArray(baseQuestions?.questions) ? baseQuestions.questions : [],
    extraQuestions: Array.isArray(extraQuestions?.questions) ? extraQuestions.questions : [],
    reviewQuestions: Array.isArray(reviewQuestions?.questions) ? reviewQuestions.questions : [],
    reviewPassages: reviewQuestions?.passages || {},
    basePassages: basePassages?.passages || {},
    extraPassages: extraPassages?.passages || {},
  };
}

export async function mergeQuestionStores(incoming, options = {}) {
  const stores = await readQuestionStores();
  const mergedQuestionsMap = new Map();
  for (const question of [...stores.baseQuestions, ...stores.extraQuestions, ...(incoming?.questions || [])]) {
    if (question?.id) mergedQuestionsMap.set(question.id, question);
  }

  const mergedPassages = mergePassageMaps(
    mergePassageMaps(stores.basePassages, stores.extraPassages),
    incoming?.passages || {}
  );

  const mergedQuestions = normalizeQuestions([...mergedQuestionsMap.values()]);
  const questionPayload = {
    version: options.version || "1.1.0",
    updated_at: new Date().toISOString(),
    total: mergedQuestions.length,
    questions: mergedQuestions,
  };
  const passagePayload = {
    version: options.version || "1.1.0",
    updated_at: new Date().toISOString(),
    passages: mergedPassages,
  };

  await mkdir(join(ROOT, "content"), { recursive: true });
  await atomicWriteJson(stores.extraQuestionsPath, questionPayload);
  await atomicWriteJson(stores.extraPassagesPath, passagePayload);

  return { questions: mergedQuestions, passages: mergedPassages };
}

export async function writeReviewQueue(incoming, options = {}) {
  const stores = await readQuestionStores();
  const incomingQuestions = normalizeQuestions(incoming?.questions || []).map((question) => ({
    ...question,
    reviewStatus: "pending",
    reviewNotes: question.reviewNotes || "",
    reviewedAt: null,
    promotedAt: null,
  }));
  const reviewQuestionMap = new Map();
  for (const question of stores.reviewQuestions) {
    if (question?.id) reviewQuestionMap.set(question.id, question);
  }
  for (const question of incomingQuestions) {
    if (question?.id) reviewQuestionMap.set(question.id, question);
  }
  const reviewQuestions = [...reviewQuestionMap.values()];
  const reviewPassages = mergePassageMaps(stores.reviewPassages, incoming?.passages || {});
  const payload = {
    version: options.version || "1.1.0",
    updated_at: new Date().toISOString(),
    questions: reviewQuestions,
    passages: reviewPassages,
  };

  await atomicWriteJson(stores.reviewQuestionsPath, payload);
  return payload;
}

export async function promoteReviewedQuestions({ ids = [], target = "base" } = {}) {
  const stores = await readQuestionStores();
  const reviewQueue = stores.reviewQuestions;
  const selectedIds = new Set(ids.filter(Boolean));
  const approved = reviewQueue.filter((question) => selectedIds.has(question.id));
  const remaining = reviewQueue.filter((question) => !selectedIds.has(question.id));
  if (!approved.length) {
    return { promoted: [], remaining };
  }

  const targetPath = target === "extra" ? stores.extraQuestionsPath : stores.baseQuestionsPath;
  const targetPassagesPath = target === "extra" ? stores.extraPassagesPath : stores.basePassagesPath;
  const targetPayload = await readJsonIfExists(targetPath, { questions: [] });
  const targetPassagePayload = await readJsonIfExists(targetPassagesPath, { passages: {} });
  const targetQuestions = Array.isArray(targetPayload?.questions) ? targetPayload.questions : [];
  const targetPassages = targetPassagePayload?.passages || {};
  const approvedPids = new Set(approved.map((question) => question.pid).filter(Boolean));
  const remainingPids = new Set(remaining.map((question) => question.pid).filter(Boolean));
  const approvedPassages = {};
  for (const pid of approvedPids) {
    if (stores.reviewPassages[pid]) {
      approvedPassages[pid] = stores.reviewPassages[pid];
    }
  }
  const nextReviewPassages = { ...stores.reviewPassages };
  for (const pid of approvedPids) {
    if (!remainingPids.has(pid)) {
      delete nextReviewPassages[pid];
    }
  }
  const mergedQuestions = normalizeQuestions([...approved.map((question) => ({
    ...question,
    reviewStatus: "approved",
    reviewedAt: new Date().toISOString(),
    promotedAt: new Date().toISOString(),
  })), ...targetQuestions]);
  const mergedPassages = mergePassageMaps(targetPassages, approvedPassages);
  const nextTargetPayload = {
    version: "1.1.0",
    updated_at: new Date().toISOString(),
    total: mergedQuestions.length,
    questions: mergedQuestions,
  };
  const nextTargetPassagePayload = {
    version: "1.1.0",
    updated_at: new Date().toISOString(),
    passages: mergedPassages,
  };

  const nextReviewPayload = {
    version: "1.1.0",
    updated_at: new Date().toISOString(),
    questions: remaining,
    passages: nextReviewPassages,
  };

  await atomicWriteJson(targetPath, nextTargetPayload);
  await atomicWriteJson(targetPassagesPath, nextTargetPassagePayload);
  await atomicWriteJson(stores.reviewQuestionsPath, nextReviewPayload);

  return {
    promoted: approved,
    promotedCount: approved.length,
    remaining,
    remainingCount: remaining.length,
    targetQuestions: mergedQuestions,
  };
}
