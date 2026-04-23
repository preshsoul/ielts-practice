import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { INSTITUTIONS } from "../src/data/institutions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const questionsPath = join(root, "public", "data", "questions.json");
const passagesPath = join(root, "public", "data", "passages.json");
const scholarshipsPath = join(root, "public", "data", "scholarships.json");
const baseQuestionsPath = join(root, "content", "questions.base.json");
const extraQuestionsPath = join(root, "content", "questions.extra.json");
const basePassagesPath = join(root, "content", "passages.base.json");
const extraPassagesPath = join(root, "content", "passages.extra.json");
const scrapedScholarshipsPath = join(root, "content", "scholarships.scraped.json");
const scrapedScholarshipsV2Path = join(root, "content", "scholarships.scraped.v2.json");

async function readJsonIfExists(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mergeById(base = [], extra = []) {
  const map = new Map();
  extra.forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  base.forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  return [...map.values()];
}

function v2ToLegacy(v2) {
  return {
    id: v2.id,
    name: v2.name,
    country: "UK",
    city: "Online",
    tuition_international_yearly: 0,
    currency: v2.coverage?.currency || "GBP",
    typical_program_length_months: 12,
    living_cost_monthly_by_city: {},
    IHS_per_year: 0,
    CAS_issuance_speed: "unknown",
    research_areas: ["scholarship", "funding"],
    website: v2.application?.url || v2.source?.sourceUrl,
    notes: v2.source?.rawText ? v2.source.rawText.slice(0, 260) : "",
    source: "scraped",
    verified: v2.source?.verified ?? false,
    active: true,
    scraped_from: v2.source?.sourceUrl,
    scholarship: v2,
  };
}

export async function refreshContentFiles() {
  const baseQuestions = (await readJsonIfExists(baseQuestionsPath))?.questions || [];
  const extraQuestions = (await readJsonIfExists(extraQuestionsPath))?.questions || [];
  const basePassages = (await readJsonIfExists(basePassagesPath))?.passages || {};
  const extraPassages = (await readJsonIfExists(extraPassagesPath))?.passages || {};
  const scrapedScholarships = (await readJsonIfExists(scrapedScholarshipsPath))?.scholarships || [];
  const scrapedScholarshipsV2 = (await readJsonIfExists(scrapedScholarshipsV2Path))?.scholarships || [];

  await writeFile(
    passagesPath,
    JSON.stringify(
      {
        version: "1.1.0",
        updated_at: new Date().toISOString(),
        passages: { ...basePassages, ...extraPassages },
      },
      null,
      2
    ),
    "utf8"
  );

  const mergedQuestions = mergeById(baseQuestions, extraQuestions);
  await writeFile(
    questionsPath,
    JSON.stringify(
      {
        version: "1.1.0",
        updated_at: new Date().toISOString(),
        total: mergedQuestions.length,
        questions: mergedQuestions,
      },
      null,
      2
    ),
    "utf8"
  );

  const scrapedV2AsLegacy = scrapedScholarshipsV2.map(v2ToLegacy);
  const allScraped = mergeById(scrapedScholarships, scrapedV2AsLegacy);
  const institutions = mergeById(INSTITUTIONS, allScraped);

  await writeFile(
    scholarshipsPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        total: institutions.length,
        institutions,
      },
      null,
      2
    ),
    "utf8"
  );

  return { questions: mergedQuestions.length, passages: Object.keys(basePassages).length + Object.keys(extraPassages).length, institutions: institutions.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshContentFiles()
    .then(() => console.log("Refreshed public data files."))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
