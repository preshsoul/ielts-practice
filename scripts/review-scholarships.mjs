import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { promoteReviewedScholarships, readScholarshipStores } from "./lib/scholarship-scraper/writer.js";
import { readManifest, selectScholarshipsForManifest } from "./lib/scholarship-scraper/manifest.js";

const args = new Set(process.argv.slice(2));
const approveAll = args.has("--approve-all");
const targetArg = [...args].find((arg) => arg.startsWith("--target="));
const idsArg = [...args].find((arg) => arg.startsWith("--ids="));
const manifestArg = [...args].find((arg) => arg.startsWith("--manifest="));
const manifestPath = manifestArg
  ? manifestArg.replace("--manifest=", "")
  : existsSync("content/scholarships.review.manifest.json")
    ? "content/scholarships.review.manifest.json"
    : null;

async function main() {
  const stores = await readScholarshipStores();
  const manifest = manifestPath ? await readManifest(manifestPath) : null;
  const reviewIds = stores.reviewScholarships.map((scholarship) => scholarship.id).filter(Boolean);
  const selectedFromManifest = manifest ? selectScholarshipsForManifest(stores.reviewScholarships, manifest) : [];
  const ids = approveAll
    ? reviewIds
    : idsArg
      ? idsArg.replace("--ids=", "").split(",").map((value) => value.trim()).filter(Boolean)
      : manifest?.approveAll
        ? reviewIds
        : selectedFromManifest.length
          ? selectedFromManifest.map((scholarship) => scholarship.id)
          : [];
  const target = targetArg ? targetArg.replace("--target=", "") : manifest?.target || "approved";

  if (!ids.length) {
    const bySource = stores.reviewScholarships.reduce((acc, scholarship) => {
      const key = scholarship?.source?.sourceLabel || scholarship?.awardingBody || scholarship?.source?.sourceUrl || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const byConfidence = stores.reviewScholarships.reduce((acc, scholarship) => {
      const key = String(Math.round((Number(scholarship?.provenance?.confidenceScore ?? scholarship?.source?.confidence ?? 0) * 10) / 10));
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log(`Review queue contains ${reviewIds.length} scholarships.`);
    console.log(`By source: ${JSON.stringify(bySource)}`);
    console.log(`By confidence: ${JSON.stringify(byConfidence)}`);
    if (manifest) {
      console.log(`Manifest: ${manifestPath}`);
      console.log(`Manifest selection: ${selectedFromManifest.length} scholarships`);
    }
    console.log(`Use --approve-all or --ids=id1,id2 to promote.`);
    return;
  }

  const result = await promoteReviewedScholarships({ ids });
  console.log(`Promoted ${result.promotedCount} scholarships into approved content. Remaining in review: ${result.remainingCount}`);

  const refresh = spawnSync(process.execPath, ["scripts/refresh-content.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (refresh.status !== 0) {
    throw new Error("Refresh step failed after scholarship promotion");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
