import { readFile } from "node:fs/promises";

export async function readManifest(manifestPath) {
  if (!manifestPath) return null;
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  return {
    target: manifest.target === "extra" ? "extra" : "base",
    approveAll: Boolean(manifest.approveAll),
    ids: Array.isArray(manifest.ids) ? manifest.ids.map((value) => String(value).trim()).filter(Boolean) : [],
    sourceIds: Array.isArray(manifest.sourceIds) ? manifest.sourceIds.map((value) => String(value).trim()).filter(Boolean) : [],
    minDifficulty: Number.isFinite(Number(manifest.minDifficulty)) ? Number(manifest.minDifficulty) : null,
    maxDifficulty: Number.isFinite(Number(manifest.maxDifficulty)) ? Number(manifest.maxDifficulty) : null,
    limit: Number.isFinite(Number(manifest.limit)) ? Number(manifest.limit) : null,
  };
}

export function selectQuestionsForManifest(reviewQuestions, manifest) {
  const questions = Array.isArray(reviewQuestions) ? reviewQuestions.slice() : [];
  let selected = questions;

  if (manifest?.ids?.length) {
    const idSet = new Set(manifest.ids);
    selected = selected.filter((question) => idSet.has(question.id));
  } else if (manifest?.sourceIds?.length) {
    const sourceSet = new Set(manifest.sourceIds);
    selected = selected.filter((question) => sourceSet.has(question.sourceId) || sourceSet.has(question.pid?.split("-p")?.[0]));
  }

  if (Number.isFinite(manifest?.minDifficulty)) {
    selected = selected.filter((question) => Number(question.difficulty) >= manifest.minDifficulty);
  }

  if (Number.isFinite(manifest?.maxDifficulty)) {
    selected = selected.filter((question) => Number(question.difficulty) <= manifest.maxDifficulty);
  }

  if (Number.isFinite(manifest?.limit) && manifest.limit >= 0) {
    selected = selected.slice(0, manifest.limit);
  }

  return selected;
}
