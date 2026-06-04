import { describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient.js", () => ({
  getCvExtractorUrl: () => "http://localhost:8000",
  getSupabaseAccessToken: () => "token",
  getSupabaseFunctionsUrl: () => "https://example.supabase.co/functions/v1",
  supabase: {},
}));

vi.mock("./api.js", () => ({
  default: {
    request: vi.fn(),
    get: vi.fn(),
  },
}));

import {
  getCvParserJobSnapshot,
  mergeCvParserResultIntoIntake,
} from "./cvParserClient.js";

describe("getCvParserJobSnapshot", () => {
  it("maps queued and completed parser states consistently", () => {
    expect(getCvParserJobSnapshot({ status: "queued", job_id: "job-1" }).state).toBe("processing");
    expect(getCvParserJobSnapshot({ status: "completed", job_id: "job-1" }).state).toBe("completed");
  });

  it("reads phase, progress, and error message from parser payloads", () => {
    const snapshot = getCvParserJobSnapshot({
      job_id: "job-2",
      draft_id: "draft-2",
      status: "failed",
      phase: "extracting",
      progress: 42,
      error: { message: "Bad document" },
    });

    expect(snapshot).toEqual({
      jobId: "job-2",
      draftId: "draft-2",
      state: "failed",
      phase: "extracting",
      progress: 42,
      message: "Bad document",
      error: { message: "Bad document" },
    });
  });
});

describe("mergeCvParserResultIntoIntake", () => {
  it("preserves parser metadata and builds the legacy parsed profile shape", () => {
    const intake = { confidence: 0.2, extractedText: "raw text" };
    const result = {
      job_id: "job-9",
      draft_id: "draft-9",
      metadata: { overall_confidence: 0.82 },
      missing_fields: ["degreeClass"],
      low_confidence_fields: ["nationality"],
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

    const merged = mergeCvParserResultIntoIntake(intake, result);

    expect(merged.confidence).toBe(0.82);
    expect(merged.parserJobId).toBe("job-9");
    expect(merged.parserDraftId).toBe("draft-9");
    expect(merged.missingFields).toEqual(["degreeClass"]);
    expect(merged.lowConfidenceFields).toEqual(["nationality"]);
    expect(merged.parsedProfile).toEqual({
      identity: {
        nationality: "Nigerian",
        countryOfResidence: "Nigerian",
      },
      academic: {
        institution: "University of Lagos",
        discipline: "Computer Science",
        disciplineCategory: "Computer Science",
        graduationYear: 2024,
        degreeClass: "2:1",
        degreeLevel: "Bachelor's",
      },
      professional: {},
      languageTests: {
        ielts: 7.5,
      },
      applicationCycle: "",
      targetDegreeLevel: "Bachelor's",
      targetDisciplines: ["Computer Science"],
      targetCountries: ["Nigerian"],
    });
  });
});
