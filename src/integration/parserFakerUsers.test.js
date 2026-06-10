import { describe, expect, it } from "vitest";
import { buildFakeParserPayloads } from "../../scripts/lib/faker-parser-fixtures.mjs";
import { parseAndValidateDocumentIntake } from "../../supabase/functions/_shared/json-parser.js";

describe("parser faker user payloads", () => {
  it("normalizes faker-generated user payloads with address-rich extracted text", () => {
    const payloads = buildFakeParserPayloads({ count: 10 });

    const validated = payloads.map((payload) =>
      parseAndValidateDocumentIntake(JSON.stringify(payload))
    );

    expect(validated).toHaveLength(10);
    for (const item of validated) {
      expect(item.label).toMatch(/CV intake/);
      expect(item.extractedText).toMatch(/Address:/);
      expect(item.parsedProfile.identity.nationality).toBeTruthy();
      expect(item.parsedCandidateProfile.personal_details.email).toContain("@");
      expect(item.parsedCandidateProfile.personal_details.phone).toBeTruthy();
    }
  });
});
