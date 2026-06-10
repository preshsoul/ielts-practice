import { performance } from "node:perf_hooks";
import { buildFakeParserPayloads } from "./lib/faker-parser-fixtures.mjs";
import { parseAndValidateDocumentIntake } from "../supabase/functions/_shared/json-parser.js";
import { createExtractedCandidateProfile } from "../src/lib/candidateProfile.js";
import { buildOfflineSemanticProfile } from "../src/lib/offlineSemanticProfile.js";
import { normalizeStructuredProfile, rankScholarships } from "../src/services/scoringEngine.js";
import { readFileSync } from "node:fs";

const scholarshipsRaw = JSON.parse(
  readFileSync(new URL("../public/data/scholarships.json", import.meta.url), "utf8")
);
const catalog = Array.isArray(scholarshipsRaw?.records) ? scholarshipsRaw.records : [];

const count = Number.parseInt(process.argv[2] || "100", 10);
const payloads = buildFakeParserPayloads({ count });

const started = performance.now();
let parseFailures = 0;
let matchFailures = 0;
let topScores = [];

for (const payload of payloads) {
  try {
    const parsed = parseAndValidateDocumentIntake(JSON.stringify(payload));

    // ── Staged artifact assertions (Task 4) ──────────────────────────
    if (!parsed?.parsedCandidateProfile) {
      throw new Error("Parser result missing parsed_candidate_profile.");
    }
    if (!parsed?.parsedProfile) {
      throw new Error("Parser result missing parsed_profile.");
    }
    if (!parsed?.extractedText || parsed.extractedText.length === 0) {
      throw new Error("Parser result missing extracted text evidence.");
    }
    // ─────────────────────────────────────────────────────────────────

    const extracted = createExtractedCandidateProfile(parsed);
    const semantic = buildOfflineSemanticProfile(
      {
        ...parsed.parsedProfile,
        targetDisciplines: parsed.parsedProfile.targetDisciplines.join(", "),
        targetCountries: parsed.parsedProfile.targetCountries.join(", "),
      },
      {
        rawText: parsed.extractedText,
        keywords: parsed.keywords,
        notes: parsed.label,
      }
    );

    const scoringProfile = normalizeStructuredProfile({
      ...parsed.parsedProfile,
      semanticText: semantic.semanticText,
      semanticKeywords: semantic.keywords,
      candidateProfile: { extracted },
    });

    const ranked = rankScholarships(catalog, scoringProfile, { limit: 5 });
    const scored = Array.isArray(ranked?.scored) ? ranked.scored : [];
    if (!scored.length) {
      matchFailures += 1;
      continue;
    }
    topScores.push(scored[0]?.analysis?.score ?? 0);
  } catch (error) {
    parseFailures += 1;
    console.error("Payload failed:", payload.sourceFilename);
    console.error(error);
  }
}

const ended = performance.now();
const validScores = topScores.filter((value) => Number.isFinite(value));

console.log(JSON.stringify({
  payloadCount: count,
  catalogSize: catalog.length,
  parseFailures,
  matchFailures,
  successfulMatches: validScores.length,
  minTopScore: validScores.length ? Math.min(...validScores) : null,
  maxTopScore: validScores.length ? Math.max(...validScores) : null,
  avgTopScore: validScores.length
    ? Number((validScores.reduce((sum, value) => sum + value, 0) / validScores.length).toFixed(2))
    : null,
  elapsedMs: Number((ended - started).toFixed(2)),
  avgMsPerPayload: Number(((ended - started) / count).toFixed(2)),
}, null, 2));

if (parseFailures > 0 || matchFailures > 0) {
  process.exit(1);
}
