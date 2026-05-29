import { createOnboardingDraft, serializeOnboardingDraft } from "./onboarding.js";

function toText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function hasValue(value) {
  if (Array.isArray(value)) return value.some((item) => hasValue(item));
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}

function getExtractionIssues(draft = {}) {
  const intake = draft?.dossier || null;
  if (!intake) return [];

  const issues = [];
  const confidence = Number(intake.confidence);
  const documentType = toText(intake.documentType).toLowerCase();
  const extractedText = toText(intake.extractedText);

  if (Number.isFinite(confidence) && confidence < 0.5) {
    issues.push({
      key: "low-confidence",
      severity: "high",
      title: "Low confidence extraction",
      detail: "The uploaded document needs manual verification before we rely on it for matching.",
      action: "Review extracted fields",
    });
  }

  if (!extractedText) {
    issues.push({
      key: "empty-text",
      severity: "high",
      title: "No readable text found",
      detail: "We could not extract enough text from this document to build a reliable candidate profile.",
      action: "Upload a clearer file",
    });
  }

  if (documentType === "pdf" && Number.isFinite(confidence) && confidence < 0.7) {
    issues.push({
      key: "pdf-review",
      severity: "medium",
      title: "PDF needs confirmation",
      detail: "This PDF was parsed with partial confidence, so academic and language signals should be checked carefully.",
      action: "Confirm profile details",
    });
  }

  if (!hasValue(draft?.identity?.nationality) && !hasValue(intake?.parsedProfile?.identity?.nationality)) {
    issues.push({
      key: "missing-nationality",
      severity: "medium",
      title: "Nationality still missing",
      detail: "Nationality is required for many scholarship eligibility checks.",
      action: "Add nationality",
    });
  }

  if (!hasValue(draft?.academic?.discipline) && !hasValue(intake?.parsedProfile?.academic?.discipline)) {
    issues.push({
      key: "missing-discipline",
      severity: "medium",
      title: "Discipline still missing",
      detail: "Discipline helps Loci compare your background against scholarship taxonomies.",
      action: "Confirm discipline",
    });
  }

  const lowConfidenceFields = Array.isArray(intake?.lowConfidenceFields) ? intake.lowConfidenceFields : [];
  const missingFields = Array.isArray(intake?.missingFields) ? intake.missingFields : [];

  for (const field of lowConfidenceFields.slice(0, 4)) {
    const fieldPath = toText(field?.field_path || field?.fieldPath);
    if (!fieldPath) continue;
    issues.push({
      key: `low-confidence-${fieldPath}`,
      severity: "medium",
      title: "One extracted field needs confirmation",
      detail: toText(field?.message) || `${fieldPath} was extracted with low confidence and should be reviewed.`,
      action: "Verify highlighted field",
    });
  }

  for (const field of missingFields.slice(0, 4)) {
    const fieldPath = toText(field?.field_path || field?.fieldPath);
    if (!fieldPath) continue;
    issues.push({
      key: `missing-${fieldPath}`,
      severity: "medium",
      title: "One important field is still missing",
      detail: toText(field?.message) || `${fieldPath} could not be extracted and should be filled manually.`,
      action: "Fill missing field",
    });
  }

  return issues;
}

function buildResolvedSignals(draft = {}) {
  const intake = draft?.dossier || null;
  const extracted = intake?.parsedProfile || {};
  const confidence = Number.isFinite(Number(intake?.confidence)) ? Number(intake.confidence) : null;

  const resolveField = (assertedValue, extractedValue, fallbackReason) => {
    if (hasValue(assertedValue)) {
      return {
        state: hasValue(extractedValue) && String(assertedValue).trim() !== String(extractedValue).trim()
          ? "conflict"
          : "confirmed",
        value: assertedValue,
        extractedValue: hasValue(extractedValue) ? extractedValue : null,
        confidence,
        reason: null,
      };
    }

    if (hasValue(extractedValue)) {
      return {
        state: confidence !== null && confidence >= 0.65 ? "extracted_only" : "needs_verification",
        value: extractedValue,
        extractedValue,
        confidence,
        reason: confidence !== null && confidence >= 0.65 ? null : fallbackReason,
      };
    }

    return {
      state: "needs_verification",
      value: null,
      extractedValue: null,
      confidence,
      reason: fallbackReason,
    };
  };

  return {
    nationality: resolveField(
      draft?.identity?.nationality,
      extracted?.identity?.nationality || extracted?.identity?.countryOfResidence,
      "Nationality is still unverified.",
    ),
    discipline: resolveField(
      draft?.academic?.discipline || draft?.academic?.disciplineCategory,
      extracted?.academic?.discipline || extracted?.academic?.disciplineCategory,
      "Discipline is still unverified.",
    ),
    degreeClass: resolveField(
      draft?.academic?.degreeClass,
      extracted?.academic?.degreeClass,
      "Degree class is still unverified.",
    ),
    languageTests: resolveField(
      draft?.languageTests?.ielts || draft?.targetBand,
      extracted?.languageTests?.ielts,
      "Language readiness is still unverified.",
    ),
    workExpYears: resolveField(
      draft?.professional?.workExperienceYears,
      extracted?.professional?.workExperienceYears,
      "Work experience is still unverified.",
    ),
  };
}

export function createOnboardingResolutionDraft(profile = {}) {
  const baseDraft = createOnboardingDraft(profile);

  return {
    extraction: {
      intake: baseDraft.dossier || null,
      confidence: baseDraft?.dossier?.confidence ?? null,
      issues: getExtractionIssues(baseDraft),
    },
    asserted: {
      displayName: toText(profile.display_name || profile.displayName || profile.full_name || profile.fullName || profile.name),
      identity: { ...(baseDraft.identity || {}) },
      academic: { ...(baseDraft.academic || {}) },
      professional: { ...(baseDraft.professional || {}) },
      languageTests: {
        ...(baseDraft.languageTests || {}),
        ieltsBands: {
          ...(baseDraft.currentLevel || {}),
        },
      },
      targets: {
        applicationCycle: toText(baseDraft.applicationCycle),
        targetDegreeLevel: toText(baseDraft.targetDegreeLevel),
        targetDisciplines: toList(baseDraft.targetDisciplines),
        targetCountries: toList(baseDraft.targetCountries),
        targetTracks: toList(baseDraft.targetTracks),
        targetBand: baseDraft.targetBand ?? "",
        testDate: toText(baseDraft.testDate),
        targetModules: toList(baseDraft.targetModules),
      },
    },
    resolved: buildResolvedSignals(baseDraft),
    workflow: {
      currentStep: "extraction",
      completedSteps: [],
    },
    legacyDraft: baseDraft,
  };
}

export function syncOnboardingResolutionDraft(resolutionDraft = {}, nextLegacyDraft = {}) {
  const previousLegacyDraft = resolutionDraft?.legacyDraft || {};
  const mergedLegacyDraft = {
    ...previousLegacyDraft,
    ...nextLegacyDraft,
    identity: {
      ...(previousLegacyDraft.identity || {}),
      ...(nextLegacyDraft.identity || {}),
    },
    academic: {
      ...(previousLegacyDraft.academic || {}),
      ...(nextLegacyDraft.academic || {}),
    },
    professional: {
      ...(previousLegacyDraft.professional || {}),
      ...(nextLegacyDraft.professional || {}),
    },
    languageTests: {
      ...(previousLegacyDraft.languageTests || {}),
      ...(nextLegacyDraft.languageTests || {}),
    },
    currentLevel: {
      ...(previousLegacyDraft.currentLevel || {}),
      ...(nextLegacyDraft.currentLevel || {}),
    },
  };

  const nextResolution = createOnboardingResolutionDraft({
    display_name: nextLegacyDraft.displayName ?? resolutionDraft?.asserted?.displayName ?? "",
    ...serializeOnboardingDraft(mergedLegacyDraft),
  });

  return {
    ...nextResolution,
    workflow: {
      currentStep: resolutionDraft?.workflow?.currentStep || "extraction",
      completedSteps: Array.isArray(resolutionDraft?.workflow?.completedSteps)
        ? resolutionDraft.workflow.completedSteps
        : [],
    },
    asserted: {
      ...nextResolution.asserted,
      displayName: mergedLegacyDraft.displayName ?? nextResolution.asserted?.displayName ?? "",
    },
    extraction: {
      ...nextResolution.extraction,
      intake: nextLegacyDraft.dossier ?? resolutionDraft?.extraction?.intake ?? nextResolution.extraction.intake,
    },
    legacyDraft: {
      ...mergedLegacyDraft,
      dossier: nextLegacyDraft.dossier ?? resolutionDraft?.extraction?.intake ?? mergedLegacyDraft.dossier ?? null,
    },
  };
}

export function serializeOnboardingResolutionDraft(resolutionDraft = {}) {
  const asserted = resolutionDraft?.asserted || {};
  const legacyDraft = resolutionDraft?.legacyDraft || {};
  const extractionIntake = resolutionDraft?.extraction?.intake || legacyDraft?.dossier || null;
  const ieltsBands = asserted?.languageTests?.ieltsBands || legacyDraft?.currentLevel || {};
  const { ieltsBands: _assertedBands, ...assertedLanguageTests } = asserted?.languageTests || {};
  const { ieltsBands: _legacyBands, ...legacyLanguageTests } = legacyDraft?.languageTests || {};

  const compatibilityDraft = {
    ...legacyDraft,
    displayName: asserted.displayName || legacyDraft.displayName || "",
    identity: {
      ...(legacyDraft.identity || {}),
      ...(asserted.identity || {}),
    },
    academic: {
      ...(legacyDraft.academic || {}),
      ...(asserted.academic || {}),
    },
    professional: {
      ...(legacyDraft.professional || {}),
      ...(asserted.professional || {}),
    },
    languageTests: {
      ...legacyLanguageTests,
      ...assertedLanguageTests,
    },
    currentLevel: {
      ...(legacyDraft.currentLevel || {}),
      ...ieltsBands,
    },
    applicationCycle: asserted?.targets?.applicationCycle ?? legacyDraft.applicationCycle ?? "",
    targetDegreeLevel: asserted?.targets?.targetDegreeLevel ?? legacyDraft.targetDegreeLevel ?? "",
    targetDisciplines: asserted?.targets?.targetDisciplines ?? legacyDraft.targetDisciplines ?? [],
    targetCountries: asserted?.targets?.targetCountries ?? legacyDraft.targetCountries ?? [],
    targetTracks: asserted?.targets?.targetTracks ?? legacyDraft.targetTracks ?? [],
    targetBand: asserted?.targets?.targetBand ?? legacyDraft.targetBand ?? "",
    testDate: asserted?.targets?.testDate ?? legacyDraft.testDate ?? "",
    targetModules: asserted?.targets?.targetModules ?? legacyDraft.targetModules ?? [],
    dossier: extractionIntake,
  };

  return serializeOnboardingDraft(compatibilityDraft);
}

export function getOnboardingWorkflowStep(resolutionDraft = {}) {
  return resolutionDraft?.workflow?.currentStep || "extraction";
}

export function getOnboardingResolutionIssues(resolutionDraft = {}) {
  return Array.isArray(resolutionDraft?.extraction?.issues) ? resolutionDraft.extraction.issues : [];
}
