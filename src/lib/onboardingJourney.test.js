import { describe, expect, it } from "vitest";
import { getOnboardingStatus } from "./onboardingJourney.js";

describe("getOnboardingStatus", () => {
  it("marks a sparse profile as incomplete", () => {
    const status = getOnboardingStatus({
      identity: { nationality: "Nigerian" },
      academic: { degreeClass: "2:1" },
    });

    expect(status.complete).toBe(false);
    expect(status.shouldRedirect).toBe(true);
    expect(status.missing.some((item) => item.key === "discipline")).toBe(true);
    expect(status.nextLabel).toBeTruthy();
  });

  it("accepts legacy onboarding fields for language and targets", () => {
    const status = getOnboardingStatus({
      target_band: 7.5,
      test_date: "2026-10-04",
      self_assessment: {
        reading: "7.0",
        listening: "7.0",
        writing: "6.5",
        speaking: "7.0",
      },
      identity: { nationality: "Nigerian" },
      academic: { degreeClass: "2:1", discipline: "Engineering" },
      targetDegreeLevel: "Master's",
      targetCountries: ["United Kingdom"],
    });

    expect(status.complete).toBe(true);
    expect(status.shouldRedirect).toBe(false);
    expect(status.percent).toBe(100);
  });

  it("accepts structured IELTS band storage", () => {
    const status = getOnboardingStatus({
      target_band: 8,
      test_date: "2026-11-12",
      identity: { nationality: "Nigerian" },
      academic: { degreeClass: "first", discipline: "Public Policy" },
      targetDegreeLevel: "Master's",
      targetCountries: ["United Kingdom"],
      languageTests: {
        ieltsBands: {
          reading: "8.0",
          listening: "8.5",
          writing: "7.5",
          speaking: "7.5",
        },
      },
    });

    expect(status.complete).toBe(true);
  });
});
