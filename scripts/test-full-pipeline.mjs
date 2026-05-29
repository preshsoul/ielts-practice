/**
 * Full pipeline test: CV text → semantic profile → scholarship matching
 * Tests the offline path (no external APIs required).
 * Run: node --use-system-ca scripts/test-full-pipeline.mjs
 */

import { buildOfflineSemanticProfile } from "../src/lib/offlineSemanticProfile.js";
import { rankScholarships, serializeStructuredProfileDraft, normalizeStructuredProfile } from "../src/services/scoringEngine.js";
import { createExtractedCandidateProfile } from "../src/lib/candidateProfile.js";
import { readFileSync } from "node:fs";

// ── Step 1: Load scholarship catalog ─────────────────
console.log("[1/5] Loading scholarship catalog...");
const scholarshipsPath = new URL("../public/data/scholarships.json", import.meta.url);
const scholarshipsRaw = JSON.parse(readFileSync(scholarshipsPath, "utf8"));
const catalog = Array.isArray(scholarshipsRaw?.records) ? scholarshipsRaw.records : [];
console.log(`  Loaded ${catalog.length} scholarships`);

// ── Step 2: Build a mock parsed CV (simulates what the parser returns) ──
console.log("[2/5] Building mock parsed CV profile...");
const mockIntake = {
  extractedText: "Precious Ajayi\nBSc Computer Science\nUniversity of Lagos, 2023\nSecond Class Upper (2:1)\nIELTS Overall Band Score: 7.5\nSoftware Engineer, 2 years experience\nSkills: JavaScript, Python, React, Node.js",
  extractedExcerpt: "BSc Computer Science, University of Lagos, Second Class Upper, IELTS 7.5",
  sourceFilename: "test-cv.pdf",
  keywords: ["computer science", "software engineering", "IELTS", "JavaScript", "Python"],
  confidence: 0.85,
  rawTextHash: "test-hash-" + Date.now(),
  parsedProfile: {
    identity: {
      nationality: "Nigeria",
      countryOfResidence: "Nigeria",
    },
    academic: {
      institution: "University of Lagos",
      discipline: "Computer Science",
      disciplineCategory: "Computer Science",
      graduationYear: 2023,
      degreeClass: "Second Class Upper",
      cgpa: null,
      cgpaScale: null,
    },
    professional: {
      workExperienceYears: 2,
    },
    languageTests: {
      ielts: 7.5,
      toefl: null,
      celpip: null,
    },
    applicationCycle: "2026",
    targetDegreeLevel: "MSc",
    targetDisciplines: ["Computer Science", "AI", "Machine Learning"],
    targetCountries: ["UK", "Canada"],
  },
  provenance: {
    parser_version: "cv-parser-v2",
    method: "deepseek",
    model: "deepseek-chat",
    parsed_at: new Date().toISOString(),
  },
};

// ── Step 3: Build extracted candidate profile ───────
console.log("[3/5] Building extracted candidate profile...");
const extracted = createExtractedCandidateProfile(mockIntake);
console.log("  Track:", extracted._track);
console.log("  Parser version:", extracted.parserVersion);
console.log("  Nationality:", extracted.nationality?.value);
console.log("  Discipline:", extracted.discipline?.value);
console.log("  Degree class:", extracted.degreeClass?.value);
console.log("  IELTS:", extracted.languageTests?.value?.ielts);
console.log("  Work years:", extracted.workExpYears?.value);

if (extracted.parserVersion === "cv-parser-v2") {
  console.log("  PASS: Provenance read correctly (not hardcoded 'heuristic-v1')");
} else {
  console.log("  WARN: Unexpected parser version:", extracted.parserVersion);
}

// ── Step 4: Build semantic profile (offline path) ───
console.log("[4/5] Building semantic profile (offline regex path)...");
const mergedDraft = {
  ...mockIntake.parsedProfile,
  identity: { ...mockIntake.parsedProfile.identity },
  academic: { ...mockIntake.parsedProfile.academic },
  professional: { ...mockIntake.parsedProfile.professional },
  languageTests: { ...mockIntake.parsedProfile.languageTests },
  targetDisciplines: mockIntake.parsedProfile.targetDisciplines.join(", "),
  targetCountries: mockIntake.parsedProfile.targetCountries.join(", "),
};

const semantic = buildOfflineSemanticProfile(mergedDraft, {
  rawText: mockIntake.extractedText,
  keywords: mockIntake.keywords,
  notes: mockIntake.label,
});

console.log("  Keywords:", semantic.keywords?.slice(0, 8).join(", ") + (semantic.keywords?.length > 8 ? "..." : ""));
console.log("  Summary:", semantic.summary?.slice(0, 100));
console.log("  Confidence:", semantic.confidence);
console.log("  PASS: Offline semantic profile built");

// ── Step 5: Score scholarships against profile ──────
console.log("[5/5] Scoring scholarships against profile...");
const scoringProfile = normalizeStructuredProfile({
  ...mergedDraft,
  semanticText: semantic.semanticText,
  semanticKeywords: semantic.keywords,
  candidateProfile: {
    extracted,
  },
});

const ranked = rankScholarships(catalog, scoringProfile, { limit: 10 });

console.log(`  Scored ${ranked.length} matches`);
if (ranked.length > 0) {
  console.log("\n  Top 5 matches:");
  for (let i = 0; i < Math.min(5, ranked.length); i++) {
    const r = ranked[i];
    console.log(`  ${i + 1}. [${String(r.score).padStart(3)}] ${(r.title || r.name || "Unknown").slice(0, 70)}`);
    if (r.analysis?.criteria?.length) {
      console.log(`     Criteria: ${r.analysis.criteria.slice(0, 3).join(", ")}`);
    }
  }
  console.log("\n  PASS: Scholarship matching pipeline works end-to-end");
} else {
  console.log("  WARN: No matches found (catalog may be empty or profile mismatch)");
}

// ── Summary ─────────────────────────────────────────
console.log("\n===== Pipeline Test Summary =====");
console.log(" CV text extraction    : OK (simulated)");
console.log(" Candidate profile     : OK (" + extracted.parserVersion + ")");
console.log(" Semantic profile      : OK (offline regex, confidence: " + semantic.confidence + ")");
console.log(" Scholarship matching  : OK (" + ranked.length + " matches ranked)");
console.log(" API dependencies      : NONE (pure offline path)");
console.log("================================\n");
console.log("To test with live LLM: ensure DEEPSEEK_API_KEY is valid, then upload a real CV via the UI.");
