import { describe, expect, it } from "vitest";
import { createOnboardingDraft, serializeOnboardingDraft } from "./onboarding.js";
import {
  createOnboardingResolutionDraft,
  serializeOnboardingResolutionDraft,
  getOnboardingResolutionIssues,
  getOnboardingWorkflowStep,
  syncOnboardingResolutionDraft,
} from "./onboardingResolution.js";

describe("createOnboardingResolutionDraft", () => {
  it("builds a resolution draft from an existing profile", () => {
    const draft = createOnboardingResolutionDraft({
      display_name: "Ada",
      target_band: 7.5,
      test_date: "2026-09-10",
      self_assessment: {
        reading: "7.0",
        listening: "7.5",
        writing: "6.5",
        speaking: "7.0",
      },
      identity: { nationality: "Nigerian", countryOfResidence: "Nigeria" },
      academic: { degreeClass: "2:1", discipline: "Engineering" },
      targetDegreeLevel: "Master's",
      targetCountries: ["UK"],
    });

    expect(draft.asserted.displayName).toBe("Ada");
    expect(draft.asserted.targets.targetBand).toBe(7.5);
    expect(draft.asserted.languageTests.ieltsBands.reading).toBe("7.0");
    expect(draft.asserted.targets.targetCountries).toEqual(["UK"]);
    expect(getOnboardingWorkflowStep(draft)).toBe("extraction");
  });

  it("reports extraction issues for low-confidence dossier intake", () => {
    const resolutionDraft = createOnboardingResolutionDraft();
    resolutionDraft.legacyDraft.dossier = {
      confidence: 0.35,
      documentType: "pdf",
      extractedText: "",
      parsedProfile: {},
    };
    resolutionDraft.extraction.intake = resolutionDraft.legacyDraft.dossier;
    resolutionDraft.extraction.issues = getOnboardingResolutionIssues(
      createOnboardingResolutionDraft({
        identity: {},
        academic: {},
      }),
    );

    const draftWithIssueRefresh = {
      ...resolutionDraft,
      extraction: {
        ...resolutionDraft.extraction,
        issues: [
          {
            key: "low-confidence",
            severity: "high",
            title: "Low confidence extraction",
            detail: "The uploaded document needs manual verification before we rely on it for matching.",
            action: "Review extracted fields",
          },
        ],
      },
    };

    expect(getOnboardingResolutionIssues(draftWithIssueRefresh)[0]?.key).toBe("low-confidence");
  });
});

describe("serializeOnboardingResolutionDraft", () => {
  it("serializes back to the current onboarding payload shape", () => {
    const resolutionDraft = createOnboardingResolutionDraft({
      target_band: 7,
      test_date: "2026-10-01",
      self_assessment: {
        reading: "7.0",
        listening: "7.5",
        writing: "6.5",
        speaking: "7.0",
      },
      identity: { nationality: "Nigerian", countryOfResidence: "Nigeria" },
      academic: { degreeClass: "2:1", discipline: "Engineering" },
      targetDegreeLevel: "Master's",
      targetCountries: ["UK"],
      targetDisciplines: ["Engineering"],
      languageTests: { ielts: 7 },
    });

    const legacyCompatible = serializeOnboardingResolutionDraft(resolutionDraft);
    const currentPayload = serializeOnboardingDraft(createOnboardingDraft({
      target_band: 7,
      test_date: "2026-10-01",
      self_assessment: {
        reading: "7.0",
        listening: "7.5",
        writing: "6.5",
        speaking: "7.0",
      },
      identity: { nationality: "Nigerian", countryOfResidence: "Nigeria" },
      academic: { degreeClass: "2:1", discipline: "Engineering" },
      targetDegreeLevel: "Master's",
      targetCountries: ["UK"],
      targetDisciplines: ["Engineering"],
      languageTests: { ielts: 7 },
    }));

    expect(legacyCompatible).toEqual(currentPayload);
  });

  it("uses asserted target overrides when present", () => {
    const resolutionDraft = createOnboardingResolutionDraft();
    resolutionDraft.asserted.targets.targetDegreeLevel = "PhD";
    resolutionDraft.asserted.targets.targetCountries = ["UK", "Canada"];
    resolutionDraft.asserted.targets.targetBand = 8;
    resolutionDraft.asserted.targets.testDate = "2026-11-20";
    resolutionDraft.asserted.languageTests.ieltsBands = {
      reading: "8.0",
      listening: "8.0",
      writing: "7.5",
      speaking: "7.5",
    };
    resolutionDraft.asserted.academic.discipline = "Computer Science";

    const payload = serializeOnboardingResolutionDraft(resolutionDraft);

    expect(payload.targetDegreeLevel).toBe("PhD");
    expect(payload.targetCountries).toEqual(["UK", "Canada"]);
    expect(payload.target_band).toBe(8);
    expect(payload.test_date).toBe("2026-11-20");
    expect(payload.self_assessment.reading).toBe("8.0");
    expect(payload.academic.discipline).toBe("Computer Science");
  });
});

describe("syncOnboardingResolutionDraft", () => {
  it("keeps the current legacy onboarding UI shape in sync with the resolution layer", () => {
    const resolutionDraft = createOnboardingResolutionDraft({
      identity: { nationality: "Nigerian" },
      academic: { degreeClass: "2:1" },
    });

    const next = syncOnboardingResolutionDraft(resolutionDraft, {
      academic: { discipline: "Engineering" },
      targetDegreeLevel: "Master's",
      targetCountries: ["UK"],
      targetBand: 7.5,
      currentLevel: {
        reading: "7.0",
        listening: "7.5",
        writing: "6.5",
        speaking: "7.0",
      },
      testDate: "2026-12-04",
    });

    expect(next.legacyDraft.academic.discipline).toBe("Engineering");
    expect(next.asserted.targets.targetDegreeLevel).toBe("Master's");
    expect(next.asserted.targets.targetCountries).toEqual(["UK"]);
    expect(next.asserted.targets.targetBand).toBe(7.5);
    expect(next.asserted.languageTests.ieltsBands.reading).toBe("7.0");
    expect(next.asserted.targets.testDate).toBe("2026-12-04");
  });

  it("preserves live text input without stripping spaces or dropping the display name", () => {
    const resolutionDraft = createOnboardingResolutionDraft({
      display_name: "Ada",
    });

    const next = syncOnboardingResolutionDraft(resolutionDraft, {
      displayName: "Ada Lovelace",
      academic: { institution: "University of Lagos " },
    });

    expect(next.legacyDraft.displayName).toBe("Ada Lovelace");
    expect(next.legacyDraft.academic.institution).toBe("University of Lagos ");
    expect(next.asserted.displayName).toBe("Ada Lovelace");
  });
});
