export function createEmptyScholarship() {
  return {
    id: null,
    name: null,
    nameFull: null,
    name_full: null,
    displayName: null,
    awardingBody: null,
    coverage: {
      type: "unknown",
      tuition: false,
      tuitionCovered: false,
      livingCovered: false,
      flightsCovered: false,
      visaFees: false,
      numericAmount: null,
      amountGBP: null,
      amountType: null,
      rawAmountString: "",
      rawAmount: null,
      currency: "GBP",
    },
    eligibility: {
      nationalities: [],
      nationalityIsOpen: true,
      disciplines: [],
      degreeClassMin: "",
      degreeClassRequired: null,
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
      deadlineIsApproximate: false,
      deadlineApproximationConfidence: 0,
      applicationOpensAt: null,
      requiredDocuments: [],
      essayPrompts: [],
      pageType: null,
      pageTitle: null,
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
      sourceLabel: "",
      scrapedAt: null,
      verified: true,
      needsVerification: [],
      confidence: 0.5,
      rawText: null,
    },
    awardeeContributions: [],
    tags: [],
    fit_score_default: null,
    sourceKind: "static",
    verified: true,
    active: true,
  };
}

export function validateScholarship(obj) {
  const errors = [];
  if (!obj?.id) errors.push("missing id");
  if (!obj?.name) errors.push("missing name");
  if (!obj?.awardingBody) errors.push("missing awardingBody");
  if (!obj?.application?.url && !obj?.provenance?.sourceUrl && !obj?.source?.sourceUrl) errors.push("missing application.url");
  if (!obj?.provenance?.sourceUrl) errors.push("missing provenance.sourceUrl");
  if (typeof obj?.provenance?.confidenceScore !== "number") errors.push("confidenceScore must be number");
  if (!obj?.coverage?.type) errors.push("missing coverage.type");
  if (!obj?.source?.sourceUrl) errors.push("missing source.sourceUrl");
  return { valid: errors.length === 0, errors };
}
