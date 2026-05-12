import { readFile } from "node:fs/promises";

export async function readManifest(manifestPath) {
  if (!manifestPath) return null;
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  return {
    target: manifest.target === "approved" ? "approved" : "approved",
    approveAll: Boolean(manifest.approveAll),
    ids: Array.isArray(manifest.ids) ? manifest.ids.map((value) => String(value).trim()).filter(Boolean) : [],
    sourceIds: Array.isArray(manifest.sourceIds) ? manifest.sourceIds.map((value) => String(value).trim()).filter(Boolean) : [],
    minConfidence: Number.isFinite(Number(manifest.minConfidence)) ? Number(manifest.minConfidence) : null,
    maxConfidence: Number.isFinite(Number(manifest.maxConfidence)) ? Number(manifest.maxConfidence) : null,
    limit: Number.isFinite(Number(manifest.limit)) ? Number(manifest.limit) : null,
  };
}

export function selectScholarshipsForManifest(reviewScholarships, manifest) {
  const scholarships = Array.isArray(reviewScholarships) ? reviewScholarships.slice() : [];
  let selected = scholarships;

  if (manifest?.ids?.length) {
    const idSet = new Set(manifest.ids);
    selected = selected.filter((scholarship) => idSet.has(scholarship.id));
  } else if (manifest?.sourceIds?.length) {
    const sourceSet = new Set(manifest.sourceIds);
    selected = selected.filter((scholarship) => {
      const sourceUrl = scholarship?.source?.sourceUrl || scholarship?.provenance?.sourceUrl || "";
      const sourceLabel = scholarship?.source?.sourceLabel || scholarship?.awardingBody || "";
      return sourceSet.has(sourceUrl) || sourceSet.has(sourceLabel);
    });
  }

  if (Number.isFinite(manifest?.minConfidence)) {
    selected = selected.filter((scholarship) => Number(scholarship?.provenance?.confidenceScore ?? scholarship?.source?.confidence ?? 0) >= manifest.minConfidence);
  }

  if (Number.isFinite(manifest?.maxConfidence)) {
    selected = selected.filter((scholarship) => Number(scholarship?.provenance?.confidenceScore ?? scholarship?.source?.confidence ?? 0) <= manifest.maxConfidence);
  }

  if (Number.isFinite(manifest?.limit) && manifest.limit >= 0) {
    selected = selected.slice(0, manifest.limit);
  }

  return selected;
}
