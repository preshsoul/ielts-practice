import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const registryPath = join(root, "content", "uk-universities.json");
const outputPath = join(root, "content", "uk-university-scholarship-sources.json");

const ENTRY_PATHS = [
  "/scholarships",
  "/scholarships-and-funding",
  "/fees-and-funding",
  "/funding",
  "/study/fees-and-funding",
  "/study/fees-and-funding/scholarships",
  "/international/scholarships",
  "/international/fees-and-funding/scholarships",
  "/postgraduate/fees-and-funding",
  "/postgraduate/fees-and-funding/scholarships",
  "/postgraduate/finance",
  "/postgraduate/funding",
  "/study/postgraduate/fees-and-funding",
  "/study/postgraduate-research/funding",
  "/admissions/graduate/fees-and-funding/funding/scholarships",
];

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toAbsoluteUrl(baseUrl, path) {
  try {
    return new URL(path, baseUrl).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function main() {
  const raw = await readFile(registryPath, "utf8");
  const registry = JSON.parse(raw);
  const universities = Array.isArray(registry?.universities) ? registry.universities : [];

  const sources = universities.map((university) => ({
    label: `${university.name} Scholarships`,
    url: university.website,
    country: university.country,
    city: university.nation,
    currency: "GBP",
    source_type: "official_university_directory",
    trust_tier: "tier_1",
    strategy: {
      entryPaths: ENTRY_PATHS,
      entryUrls: unique(ENTRY_PATHS.map((path) => toAbsoluteUrl(university.website, path))),
      followPatterns: ["scholarship", "funding", "bursary", "studentship", "fellowship", "postgraduate", "international"],
      priorityPatterns: ["international students", "tuition fee", "living costs", "postgraduate", "masters", "phd", "research"],
      applicationPatterns: ["apply", "application deadline", "eligibility", "funding deadline", "how to apply"],
      ignorePatterns: ["cookie", "privacy", "news", "events", "alumni", "donate"],
      maxPages: 30,
      maxDepth: 2,
      priorityBonus: 3,
    },
    notes: `Generated from official ${university.registrySource} registry for ${university.nation}. Use as a university-owned scholarship discovery surface and only publish verifiable scholarship records.`,
    registry: {
      nation: university.nation,
      registrySource: university.registrySource,
      registrySourceUrl: university.registrySourceUrl,
      verifiedOfficial: university.verifiedOfficial,
    },
  }));

  const payload = {
    version: "1.0.0",
    updated_at: new Date().toISOString(),
    total: sources.length,
    sources,
  };

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${sources.length} generated university scholarship sources to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
