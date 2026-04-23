import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { promoteReviewedQuestions, readQuestionStores } from "./lib/question-scraper/writer.js";
import { readManifest, selectQuestionsForManifest } from "./lib/question-scraper/manifest.js";

const args = new Set(process.argv.slice(2));
const approveAll = args.has("--approve-all");
const targetArg = [...args].find((arg) => arg.startsWith("--target="));
const idsArg = [...args].find((arg) => arg.startsWith("--ids="));
const manifestArg = [...args].find((arg) => arg.startsWith("--manifest="));
const manifestPath = manifestArg
  ? manifestArg.replace("--manifest=", "")
  : existsSync("content/questions.review.manifest.json")
    ? "content/questions.review.manifest.json"
    : null;

async function main() {
  const stores = await readQuestionStores();
  const manifest = manifestPath ? await readManifest(manifestPath) : null;
  const reviewIds = stores.reviewQuestions.map((question) => question.id).filter(Boolean);
  const selectedFromManifest = manifest ? selectQuestionsForManifest(stores.reviewQuestions, manifest) : [];
  const ids = approveAll
    ? reviewIds
    : idsArg
      ? idsArg.replace("--ids=", "").split(",").map((value) => value.trim()).filter(Boolean)
      : manifest?.approveAll
        ? reviewIds
        : selectedFromManifest.length
          ? selectedFromManifest.map((question) => question.id)
          : [];
  const target = targetArg ? targetArg.replace("--target=", "") : manifest?.target || "base";

  if (!ids.length) {
    const bySource = stores.reviewQuestions.reduce((acc, question) => {
      const key = question.sourceId || question.pid?.split("-p")?.[0] || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const byDifficulty = stores.reviewQuestions.reduce((acc, question) => {
      const key = String(question.difficulty ?? "unknown");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    console.log(`Review queue contains ${reviewIds.length} questions.`);
    console.log(`By source: ${JSON.stringify(bySource)}`);
    console.log(`By difficulty: ${JSON.stringify(byDifficulty)}`);
    if (manifest) {
      console.log(`Manifest: ${manifestPath}`);
      console.log(`Manifest selection: ${selectedFromManifest.length} questions`);
    }
    console.log(`Use --approve-all or --ids=id1,id2 to promote.`);
    return;
  }

  const result = await promoteReviewedQuestions({ ids, target: target === "extra" ? "extra" : "base" });
  console.log(`Promoted ${result.promotedCount} questions to ${target === "extra" ? "extra" : "base"}. Remaining in review: ${result.remainingCount}`);

  const refresh = spawnSync(process.execPath, ["scripts/refresh-content.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (refresh.status !== 0) {
    throw new Error("Refresh step failed after question promotion");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
