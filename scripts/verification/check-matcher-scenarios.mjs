import { buildOfflineSemanticProfile } from "../../src/lib/offlineSemanticProfile.js";
import { rankScholarships, normalizeStructuredProfile } from "../../src/services/scoringEngine.js";
import { createExtractedCandidateProfile } from "../../src/lib/candidateProfile.js";
import { readFileSync } from "node:fs";

const scholarshipsRaw = JSON.parse(
  readFileSync(new URL("../../public/data/scholarships.json", import.meta.url), "utf8")
);
const catalog = Array.isArray(scholarshipsRaw?.records) ? scholarshipsRaw.records : [];

const candidates = [
  {
    nationality: "Nigeria",
    discipline: "Computer Science",
    degreeClass: "Second Class Upper",
    ielts: 7.5,
    workExperienceYears: 2,
    targets: ["UK", "Canada"],
  },
  {
    nationality: "Ghana",
    discipline: "Public Health",
    degreeClass: "First Class",
    ielts: 8,
    workExperienceYears: 4,
    targets: ["UK", "Netherlands"],
  },
  {
    nationality: "Kenya",
    discipline: "Mechanical Engineering",
    degreeClass: "Second Class Upper",
    ielts: 6.5,
    workExperienceYears: 1,
    targets: ["Germany", "Sweden"],
  },
  {
    nationality: "India",
    discipline: "Economics",
    degreeClass: "First Class",
    ielts: 7,
    workExperienceYears: 3,
    targets: ["UK", "Canada"],
  },
  {
    nationality: "Pakistan",
    discipline: "Data Science",
    degreeClass: "Second Class Upper",
    ielts: 7.5,
    workExperienceYears: 2,
    targets: ["Ireland", "UK"],
  },
];

let zeroResults = 0;
let blockedTop = 0;
const topScores = [];

for (let index = 0; index < 100; index += 1) {
  const candidate = candidates[index % candidates.length];
  const intake = {
    extractedText: `${candidate.nationality} candidate with ${candidate.discipline} background and IELTS ${candidate.ielts}`,
    extractedExcerpt: `${candidate.discipline}, ${candidate.degreeClass}`,
    sourceFilename: `candidate-${index}.pdf`,
    keywords: [candidate.discipline, candidate.nationality],
    confidence: 0.82,
    rawTextHash: `matcher-scenario-${index}`,
    parsedProfile: {
      identity: {
        nationality: candidate.nationality,
        countryOfResidence: candidate.nationality,
      },
      academic: {
        institution: "Test University",
        discipline: candidate.discipline,
        disciplineCategory: candidate.discipline,
        graduationYear: 2024,
        degreeClass: candidate.degreeClass,
      },
      professional: {
        workExperienceYears: candidate.workExperienceYears,
      },
      languageTests: {
        ielts: candidate.ielts,
      },
      applicationCycle: "2026",
      targetDegreeLevel: "Master's",
      targetDisciplines: [candidate.discipline],
      targetCountries: candidate.targets,
    },
    provenance: {
      parser_version: "cv-parser-v2",
      method: "scenario-check",
    },
  };

  const extracted = createExtractedCandidateProfile(intake);
  const semantic = buildOfflineSemanticProfile({
    ...intake.parsedProfile,
    targetDisciplines: intake.parsedProfile.targetDisciplines.join(", "),
    targetCountries: intake.parsedProfile.targetCountries.join(", "),
  }, {
    rawText: intake.extractedText,
    keywords: intake.keywords,
  });

  const scoringProfile = normalizeStructuredProfile({
    ...intake.parsedProfile,
    semanticText: semantic.semanticText,
    semanticKeywords: semantic.keywords,
    candidateProfile: { extracted },
  });

  const ranked = rankScholarships(catalog, scoringProfile, { limit: 5 });
  const scored = Array.isArray(ranked?.scored) ? ranked.scored : [];

  if (!scored.length) {
    zeroResults += 1;
    continue;
  }

  if (scored[0]?.analysis?.blocked) {
    blockedTop += 1;
  }

  if (typeof scored[0]?.analysis?.score === "number") {
    topScores.push(scored[0].analysis.score);
  }
}

console.log(JSON.stringify({
  scenarios: 100,
  catalogSize: catalog.length,
  zeroResults,
  blockedTop,
  minTopScore: topScores.length ? Math.min(...topScores) : null,
  maxTopScore: topScores.length ? Math.max(...topScores) : null,
  avgTopScore: topScores.length
    ? Number((topScores.reduce((sum, value) => sum + value, 0) / topScores.length).toFixed(2))
    : null,
}, null, 2));

if (zeroResults > 0) {
  process.exit(1);
}
