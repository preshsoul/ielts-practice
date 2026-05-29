const MODULES = ["reading", "listening", "writing", "speaking"];

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function getBand(profile, module) {
  return profile?.languageTests?.ieltsBands?.[module]
    ?? profile?.self_assessment?.[module]
    ?? profile?.selfAssessment?.[module]
    ?? "";
}

export function getOnboardingStatus(profile = {}) {
  const requirements = [
    { key: "nationality", label: "Nationality", complete: hasValue(profile?.identity?.nationality) },
    { key: "degreeClass", label: "Degree class", complete: hasValue(profile?.academic?.degreeClass) },
    { key: "discipline", label: "Discipline", complete: hasValue(profile?.academic?.discipline) },
    { key: "targetDegreeLevel", label: "Target degree level", complete: hasValue(profile?.targetDegreeLevel) },
    { key: "targetCountries", label: "Target countries", complete: Array.isArray(profile?.targetCountries) && profile.targetCountries.length > 0 },
    { key: "targetBand", label: "Target IELTS band", complete: hasValue(profile?.target_band ?? profile?.targetBand) },
    { key: "testDate", label: "Test date", complete: hasValue(profile?.test_date ?? profile?.testDate) },
    ...MODULES.map((module) => ({
      key: module,
      label: `${module[0].toUpperCase()}${module.slice(1)} baseline`,
      complete: hasValue(getBand(profile, module)),
    })),
  ];

  const missing = requirements.filter((item) => !item.complete);
  const completeCount = requirements.length - missing.length;
  const percent = requirements.length ? Math.round((completeCount / requirements.length) * 100) : 0;

  return {
    complete: missing.length === 0,
    shouldRedirect: missing.length > 0,
    percent,
    missing,
    nextLabel: missing[0]?.label || null,
  };
}
