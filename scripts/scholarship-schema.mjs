export function createEmptyScholarship() {
  return {
    id: null,
    name: null,
    awardingBody: null,
    awardingBodyType: "unknown",
    coverage: {
      type: "unknown",
      tuitionCovered: false,
      livingCovered: false,
      flightsCovered: false,
      amountGBP: null,
      amountType: null,
      currency: "GBP",
      rawAmount: null,
    },
    eligibility: {
      nationalities: [],
      nigerianEligible: null,
      degreeClassRequired: null,
      disciplines: [],
      ageLimit: null,
      nyscRequired: false,
      englishTestRequired: null,
      otherRequirements: [],
    },
    application: {
      url: null,
      portal: null,
      deadline: null,
      deadlineType: "unknown",
      deadlineRaw: null,
      sequencing: "unknown",
      requiredDocuments: [],
      essayPrompt: null,
      essayWordLimit: null,
    },
    stackable: "unknown",
    stackableWith: [],
    competitionLevel: "unknown",
    competitionReasoning: null,
    fitScore: null,
    fitReasoning: null,
    tierGeographic: null,
    source: {
      sourceUrl: null,
      scrapedAt: null,
      verified: false,
      needsVerification: [],
      confidence: 0,
      rawText: null,
    },
    status: "unknown",
    urgency: "green",
  };
}

export function validateScholarship(obj) {
  const errors = [];
  if (!obj?.id) errors.push("missing id");
  if (!obj?.name) errors.push("missing name");
  if (!obj?.awardingBody) errors.push("missing awardingBody");
  if (!obj?.source?.sourceUrl) errors.push("missing source.sourceUrl");
  if (typeof obj?.source?.confidence !== "number") errors.push("confidence must be number");
  return { valid: errors.length === 0, errors };
}
