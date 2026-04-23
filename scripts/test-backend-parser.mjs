import assert from "node:assert/strict";
import { parseAndValidateDocumentIntake, parseStrictJson, StrictJsonError } from "../supabase/functions/_shared/json-parser.js";

const valid = parseAndValidateDocumentIntake(JSON.stringify({
  label: "CV intake",
  sourceFilename: "candidate-cv.txt",
  mimeType: "text/plain",
  documentType: "text",
  rawTextHash: "abc123",
  extractedExcerpt: "Candidate from Nigeria with a Master's in Education.",
  extractedText: "Candidate from Nigeria with a Master's in Education. IELTS 7.5 and two years experience.",
  keywords: ["education", "nigeria", "ielts"],
  confidence: 0.82,
  parsedProfile: {
    identity: {
      nationality: "Nigerian",
      countryOfResidence: "Nigeria",
      ageAtApplicationCycle: 27,
    },
    academic: {
      degreeClass: "2:1",
      institution: "University of Lagos",
      institutionCountry: "Nigeria",
      discipline: "Education",
      disciplineCategory: "Humanities",
      graduationYear: 2022,
      cgpa: 4.2,
      cgpaScale: 5,
      degreeLevel: "Master's",
    },
    professional: {
      workExperienceYears: 2,
      currentlyEmployed: "yes",
      sector: "Education",
    },
    languageTests: {
      ielts: 7.5,
      toefl: null,
      celpip: null,
    },
    applicationCycle: "2026",
    targetDegreeLevel: "Master's",
    targetDisciplines: ["Education", "Linguistics"],
    targetCountries: ["UK", "Canada"],
    keywords: ["education", "linguistics"],
  },
}));

assert.equal(valid.documentType, "text");
assert.equal(valid.parsedProfile.professional.currentlyEmployed, true);
assert.deepEqual(valid.parsedProfile.targetCountries, ["UK", "Canada"]);
assert.deepEqual(Object.keys(parseStrictJson('{"b":1,"a":2}')), ["a", "b"]);

assert.throws(() => parseStrictJson("[[[[[[[[[[[[[[[[[[[[[[]]]]]]]]]]]]]]]]]]]]]", { maxDepth: 8 }), StrictJsonError);
assert.throws(() => parseAndValidateDocumentIntake(JSON.stringify({
  label: 42,
  sourceFilename: "x.txt",
  mimeType: "text/plain",
  documentType: "text",
  rawTextHash: "abc",
  keywords: [],
  confidence: 0.5,
  parsedProfile: {},
})), StrictJsonError);

console.log("Backend parser tests passed.");
