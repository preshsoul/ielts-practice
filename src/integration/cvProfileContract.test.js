import { describe, expect, it } from "vitest";
import { mergeCvParserResultIntoIntake } from "../services/cvParserClient.js";
import {
  createExtractedCandidateProfile,
  resolveCandidateProfile,
} from "../lib/candidateProfile.js";

const parserResult = {
  metadata: { overall_confidence: 0.82 },
  profile: {
    personal_details: {
      nationality: { raw_text: "Nigerian" },
    },
    academic_history: [
      {
        institution: "University of Lagos",
        academic_discipline: "Computer Science",
        graduation_year: 2024,
        degree_class: { raw_text: "2:1" },
        degree_type: "bsc",
      },
    ],
    international_exams: {
      ielts_band_score: 7.5,
    },
  },
};

describe("parser to candidate-profile contract", () => {
  it("preserves candidate signals needed by resolved-profile scoring", () => {
    const intake = mergeCvParserResultIntoIntake(
      {
        extractedText: "raw cv text",
        sourceFilename: "resume.pdf",
        confidence: 0.1,
        provenance: {
          method: "edge-parser",
          parserVersion: "parser-v2",
        },
      },
      parserResult
    );

    const extracted = createExtractedCandidateProfile(intake);
    const resolved = resolveCandidateProfile({ candidateProfile: { extracted } });

    expect(intake.parsedProfile.identity.nationality).toBe("Nigerian");
    expect(intake.parsedProfile.academic.discipline).toBe("Computer Science");
    expect(intake.parsedProfile.languageTests.ielts).toBe(7.5);
    expect(extracted.nationality.value).toBe("Nigerian");
    expect(extracted.discipline.value).toBe("Computer Science");
    expect(extracted.languageTests.value).toEqual({ ielts: 7.5, toefl: null, celpip: null });
    expect(resolved.resolved.nationality.state).toBe("extracted_only");
    expect(resolved.resolved.nationality.extracted.value).toBe("Nigerian");
    expect(resolved.resolved.discipline.extracted.value).toBe("Computer Science");
  });
});
