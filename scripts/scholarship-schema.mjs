export function createEmptyScholarship() {
  return {
    id: null,
    name: null,
    awardingBody: null,
    coverage: {
      tuition: false,
      tuitionCovered: false,
      livingCovered: false,
      flightsCovered: false,
      visaFees: false,
      numericAmount: null,
      rawAmountString: "",
      currency: "GBP",
    },
    eligibility: {
      nationalities: [],
      disciplines: [],
      degreeClassMin: "",
      ageLimitMin: null,
      ageLimitMax: null,
      workExperienceYearsMin: 0,
      employmentStatusAtApplication: null,
      languageReqs: {
        ielts: null,
        toefl: null,
        celpip: null,
        exemptions: [],
      },
      refereesRequired: 0,
      refereeCategories: [],
      targetInstitutions: [],
      targetProgrammes: [],
      notes: "",
    },
    application: {
      url: "",
      portal: null,
      deadline: null,
      deadlineType: "fixed",
      deadlineRaw: null,
      applicationOpensAt: null,
      requiredDocuments: [],
      essayPrompts: [],
    },
    provenance: {
      sourceUrl: "",
      scrapedAt: null,
      lastVerifiedAt: null,
      verifiedBy: "",
      confidenceScore: 0.5,
      confidenceDecayRatePerDay: 0.001,
      flaggedFields: [],
      sourceType: "canonical",
    },
    source: {
      sourceUrl: "",
      scrapedAt: null,
      verified: true,
      needsVerification: [],
      confidence: 0.5,
      rawText: null,
    },
    awardeeContributions: [],
    tags: [],
    fit_score_default: null,
    source: "static",
    verified: true,
    active: true,
  };
}

export function validateScholarship(obj) {
  const errors = [];
  if (!obj?.id) errors.push("missing id");
  if (!obj?.name) errors.push("missing name");
  if (!obj?.awardingBody) errors.push("missing awardingBody");
  if (!obj?.application?.url) errors.push("missing application.url");
  if (!obj?.provenance?.sourceUrl) errors.push("missing provenance.sourceUrl");
  if (typeof obj?.provenance?.confidenceScore !== "number") errors.push("confidenceScore must be number");
  return { valid: errors.length === 0, errors };
}
