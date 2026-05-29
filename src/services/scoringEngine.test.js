import { describe, it, expect } from "vitest";
import {
  createStructuredProfileDraft,
  normalizeStructuredProfile,
  serializeStructuredProfileDraft,
  buildProfileKeywords,
  scoreScholarship,
  rankScholarships,
} from "./scoringEngine.js";

// ── createStructuredProfileDraft ──────────────────────────────────────────────

describe("createStructuredProfileDraft", () => {
  it("returns sensible defaults with no input", () => {
    const draft = createStructuredProfileDraft();
    expect(draft.tier).toBe("free");
    expect(draft.identity.nationality).toBe("");
    expect(draft.academic.degreeClass).toBe("");
    expect(draft.targetDisciplines).toBe("");
    expect(draft.targetCountries).toBe("");
  });

  it("copies fields from a profile record", () => {
    const draft = createStructuredProfileDraft({
      identity: { nationality: "Nigerian", countryOfResidence: "Nigeria" },
      academic: { degreeClass: "2:1", discipline: "Engineering" },
      languageTests: { ielts: "7.5" },
      tier: "premium",
    });
    expect(draft.identity.nationality).toBe("Nigerian");
    expect(draft.academic.degreeClass).toBe("2:1");
    expect(draft.languageTests.ielts).toBe("7.5");
    expect(draft.tier).toBe("premium");
  });

  it("defaults tier to free when missing", () => {
    const draft = createStructuredProfileDraft({ tier: null });
    expect(draft.tier).toBe("free");
  });
});

// ── normalizeStructuredProfile ────────────────────────────────────────────────

describe("normalizeStructuredProfile", () => {
  it("normalizes IELTS score to a number", () => {
    const normalized = normalizeStructuredProfile({ languageTests: { ielts: "7.5" } });
    expect(normalized.languageTests.ielts).toBe(7.5);
  });

  it("normalizes work experience to a number", () => {
    const normalized = normalizeStructuredProfile({ professional: { workExperienceYears: "3" } });
    expect(normalized.professional.workExperienceYears).toBe(3);
  });

  it("returns null for unparseable numbers", () => {
    const normalized = normalizeStructuredProfile({ professional: { workExperienceYears: "" } });
    expect(normalized.professional.workExperienceYears).toBeNull();
  });

  it("splits targetDisciplines from comma string to array", () => {
    const normalized = normalizeStructuredProfile({ targetDisciplines: "Engineering, Law" });
    expect(normalized.targetDisciplines).toEqual(["Engineering", "Law"]);
  });

  it("defaults tier to free", () => {
    const normalized = normalizeStructuredProfile({});
    expect(normalized.tier).toBe("free");
  });
});

// ── buildProfileKeywords ──────────────────────────────────────────────────────

describe("buildProfileKeywords", () => {
  it("returns an array of strings", () => {
    const keywords = buildProfileKeywords({
      identity: { nationality: "Nigerian" },
      academic: { discipline: "Computer Science" },
    });
    expect(Array.isArray(keywords)).toBe(true);
    keywords.forEach((kw) => expect(typeof kw).toBe("string"));
  });

  it("returns empty array for empty profile", () => {
    const keywords = buildProfileKeywords({});
    expect(Array.isArray(keywords)).toBe(true);
  });

  it("includes normalized nationality tokens", () => {
    const keywords = buildProfileKeywords({ identity: { nationality: "Nigerian" } });
    expect(keywords).toContain("nigerian");
  });

  it("deduplicates tokens", () => {
    const keywords = buildProfileKeywords({
      identity: { nationality: "Nigerian" },
      targetCountries: ["Nigeria"],
    });
    const count = keywords.filter((kw) => kw === "nigerian").length;
    expect(count).toBe(1);
  });
});

// ── scoreScholarship ──────────────────────────────────────────────────────────

const baseScholarship = {
  id: "test-scholarship",
  name: "International STEM Fellowship",
  country: "UK",
  eligibility: {
    nationalities: [],
    disciplines: ["Engineering", "Computer Science"],
    degreeClassMin: "2:1",
    languageReqs: { ielts: 6.5 },
    workExperienceYearsMin: null,
  },
  coverage: { type: "full", stipend: true },
  application: { deadline: null, requiredDocuments: ["cv", "transcript"] },
  provenance: { confidenceScore: 0.9, sourceType: "manual", lastVerifiedAt: new Date().toISOString() },
};

const baseProfile = {
  identity: { nationality: "Nigerian", countryOfResidence: "Nigeria" },
  academic: { degreeClass: "2:1", discipline: "Engineering" },
  languageTests: { ielts: 7.0 },
  professional: { workExperienceYears: 2 },
  targetDegreeLevel: "Master's",
  targetDisciplines: ["Engineering"],
  targetCountries: ["UK"],
};

describe("scoreScholarship", () => {
  it("returns a numeric score between 0 and 100", () => {
    const result = scoreScholarship(baseScholarship, baseProfile);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("is not blocked for a clearly eligible candidate", () => {
    const result = scoreScholarship(baseScholarship, baseProfile);
    expect(result.blocked).toBe(false);
  });

  it("blocks a candidate whose IELTS is below requirement", () => {
    const result = scoreScholarship(
      { ...baseScholarship, eligibility: { ...baseScholarship.eligibility, languageReqs: { ielts: 8.0 } } },
      { ...baseProfile, languageTests: { ielts: 6.0 } }
    );
    expect(result.blocked).toBe(true);
    expect(result.blockedReasons.some((r) => r.toLowerCase().includes("ielts"))).toBe(true);
  });

  it("blocks when deadline has passed", () => {
    const pastDeadline = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = scoreScholarship(
      { ...baseScholarship, application: { ...baseScholarship.application, deadline: pastDeadline } },
      baseProfile
    );
    expect(result.blocked).toBe(true);
  });

  it("returns fallback score for empty profile", () => {
    const result = scoreScholarship(baseScholarship, {});
    expect(result.fallback).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("returns criteria array with expected keys", () => {
    const result = scoreScholarship(baseScholarship, baseProfile);
    const keys = result.criteria.map((c) => c.key);
    expect(keys).toContain("semantic");
    expect(keys).toContain("nationality");
    expect(keys).toContain("discipline");
  });

  it("scores higher when candidate discipline matches scholarship", () => {
    const matchingResult = scoreScholarship(baseScholarship, baseProfile);
    const mismatchResult = scoreScholarship(
      { ...baseScholarship, eligibility: { ...baseScholarship.eligibility, disciplines: ["Law"] } },
      baseProfile
    );
    expect(matchingResult.score).toBeGreaterThanOrEqual(mismatchResult.score);
  });
});

// ── rankScholarships ──────────────────────────────────────────────────────────

describe("rankScholarships", () => {
  const records = [baseScholarship, { ...baseScholarship, id: "b", name: "Law Fellowship", eligibility: { ...baseScholarship.eligibility, disciplines: ["Law"] } }];

  it("returns retrieved and scored arrays", () => {
    const result = rankScholarships(records, baseProfile);
    expect(Array.isArray(result.retrieved)).toBe(true);
    expect(Array.isArray(result.scored)).toBe(true);
    expect(Array.isArray(result.profileKeywords)).toBe(true);
  });

  it("returns empty arrays for empty records", () => {
    const result = rankScholarships([], baseProfile);
    expect(result.scored).toHaveLength(0);
  });

  it("ranks discipline-matching scholarship higher", () => {
    const result = rankScholarships(records, baseProfile);
    const engIndex = result.scored.findIndex((r) => r.scholarship.id === "test-scholarship");
    const lawIndex = result.scored.findIndex((r) => r.scholarship.id === "b");
    expect(engIndex).toBeLessThan(lawIndex);
  });

  it("each scored item has scholarship and analysis", () => {
    const result = rankScholarships(records, baseProfile);
    for (const item of result.scored) {
      expect(item).toHaveProperty("scholarship");
      expect(item).toHaveProperty("analysis");
      expect(typeof item.analysis.score).toBe("number");
    }
  });
});
