/**
 * Lightweight pipeline test — validates each stage without loading the full scoring engine.
 * Run: node --use-system-ca scripts/test-pipeline-light.mjs
 */

import { createExtractedCandidateProfile } from "../src/lib/candidateProfile.js";
import { buildOfflineSemanticProfile } from "../src/lib/offlineSemanticProfile.js";

let passed = 0;
let failed = 0;

function check(label, ok) {
  if (ok) { console.log("  PASS:", label); passed++; }
  else { console.error("  FAIL:", label); failed++; }
}

// ── 1. Provenance flows from intake to extracted profile ──
console.log("\n[1] Provenance pipeline");
const withProvenance = {
  extractedText: "BSc CS, 2:1, IELTS 7.5",
  confidence: 0.85,
  provenance: { parser_version: "cv-parser-v2", method: "deepseek", model: "deepseek-chat" },
  parsedProfile: { identity: { nationality: "Nigeria" }, academic: { discipline: "Computer Science", degreeClass: "2:1" }, professional: {}, languageTests: { ielts: 7.5 } },
};
const r1 = createExtractedCandidateProfile(withProvenance);
check("parserVersion reads from intake.provenance", r1.parserVersion === "cv-parser-v2");
check("method reads from intake.provenance", r1.nationality?.method === "deepseek");

// ── 2. Falls back when provenance is missing ──
const withoutProvenance = {
  extractedText: "BSc CS, 2:1, IELTS 7.5",
  confidence: 0.85,
  parsedProfile: { identity: {}, academic: {}, professional: {}, languageTests: {} },
};
const r2 = createExtractedCandidateProfile(withoutProvenance);
check("falls back to heuristic-v1 when no provenance", r2.parserVersion === "heuristic-v1");
check("falls back to heuristic_parse method", r2.nationality === null || r2.nationality?.method === "heuristic_parse");

// ── 3. Offline semantic profile ──
console.log("\n[2] Offline semantic profile");
const profile = {
  identity: { nationality: "Nigeria" },
  academic: { discipline: "Computer Science", degreeClass: "2:1", graduationYear: 2023 },
  professional: { workExperienceYears: 2 },
  languageTests: { ielts: 7.5 },
  targetDisciplines: "Computer Science, AI",
  targetCountries: "UK, Canada",
  targetDegreeLevel: "MSc",
};
const sem = buildOfflineSemanticProfile(profile, {
  rawText: "BSc CS, Lagos, 2:1, IELTS 7.5, 2yr exp",
  keywords: ["computer science", "IELTS"],
  notes: "test"
});
check("keywords produced", Array.isArray(sem.keywords) && sem.keywords.length > 0);
check("semanticText produced", typeof sem.semanticText === "string" && sem.semanticText.length > 20);
check("confidence is number", typeof sem.confidence === "number" && sem.confidence >= 0 && sem.confidence <= 1);
console.log("  Keywords:", sem.keywords?.slice(0, 8).join(", "));
console.log("  Summary:", sem.summary?.slice(0, 100));

// ── 4. Scholarship scoring (lightweight inline test) ──
console.log("\n[3] Scholarship scoring (inline)");
const { scoreScholarship, normalizeStructuredProfile } = await import("../src/services/scoringEngine.js");
const normalized = normalizeStructuredProfile({
  ...profile,
  semanticText: sem.semanticText,
  semanticKeywords: sem.keywords,
  candidateProfile: { extracted: r1 },
});

const mockScholarship = {
  id: "test-scholarship-1",
  title: "MSc Computer Science Scholarship for Nigerian Students",
  provider: "Test University",
  country: "UK",
  eligibility: {
    nationalities: ["Nigeria", "Ghana"],
    disciplines: ["Computer Science", "Engineering"],
    degreeClass: "2:1",
    minWorkExperience: 1,
    ieltsMin: 6.5,
  },
  coverage: { tuition: true, stipend: true, accommodation: false },
  deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  application: { requiredDocuments: ["CV", "Transcript"] },
};

const scored = scoreScholarship(mockScholarship, normalized, {});
check("score is a number", typeof scored.score === "number");
check("score is reasonable (0-100)", scored.score >= 0 && scored.score <= 100);
check("analysis produced", scored.analysis && typeof scored.analysis === "object");
check("eligibility criteria present", Array.isArray(scored.analysis?.criteria));
console.log("  Score:", scored.score);
console.log("  Criteria:", scored.analysis?.criteria?.join(", "));

// ── 5. Blocked on past deadline ──
const pastScholarship = { ...mockScholarship, id: "past-1", deadline: "2020-01-01T00:00:00.000Z" };
const pastScored = scoreScholarship(pastScholarship, normalized, {});
check("past deadline blocks scholarship", pastScored.score === 0);

// ── Summary ─────────────────────────────────────────
console.log("\n===== " + (failed === 0 ? "ALL " + passed + " TESTS PASSED" : passed + "/" + (passed + failed) + " PASSED") + " =====");
process.exit(failed > 0 ? 1 : 0);
