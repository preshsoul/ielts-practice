export const PROFILE_COMPLETION_SECTIONS = [
  {
    key: "identity",
    title: "Identity & location",
    description: "Nationality and location decide which programmes can be compared.",
    fields: [
      { path: ["identity", "nationality"], label: "Nationality", impact: "Unlocks nationality-based eligibility checks." },
      { path: ["identity", "countryOfResidence"], label: "Country of residence", impact: "Improves region-specific matching." },
      { path: ["identity", "ageAtApplicationCycle"], label: "Age at application cycle", impact: "Catches age-limited awards." },
    ],
  },
  {
    key: "academic",
    title: "Academic background",
    description: "Academic history drives degree class, discipline, and institution filters.",
    fields: [
      { path: ["academic", "degreeClass"], label: "Degree class", impact: "Enables minimum class filtering." },
      { path: ["academic", "institution"], label: "Institution", impact: "Improves institution-specific context." },
      { path: ["academic", "institutionCountry"], label: "Institution country", impact: "Adds location context for transcripts." },
      { path: ["academic", "discipline"], label: "Discipline", impact: "Unlocks subject-specific scholarships." },
      { path: ["academic", "disciplineCategory"], label: "Discipline category", impact: "Broadens taxonomy matching." },
      { path: ["academic", "graduationYear"], label: "Graduation year", impact: "Helps with early-career filters." },
      { path: ["academic", "cgpa"], label: "CGPA", impact: "Improves score and class inference." },
      { path: ["academic", "cgpaScale"], label: "CGPA scale", impact: "Normalises grade comparisons." },
    ],
  },
  {
    key: "professional",
    title: "Professional experience",
    description: "Work history helps awards that require experience or employment status.",
    fields: [
      { path: ["professional", "workExperienceYears"], label: "Work experience years", impact: "Shows relevant experience thresholds." },
      { path: ["professional", "currentlyEmployed"], label: "Currently employed", impact: "Supports employment-based awards." },
      { path: ["professional", "sector"], label: "Sector", impact: "Captures relevant professional background." },
    ],
  },
  {
    key: "language",
    title: "Language readiness",
    description: "Test scores and band minimums affect a large share of scholarship filters.",
    fields: [
      { path: ["languageTests", "ielts"], label: "IELTS overall", impact: "Unlocks IELTS-based eligibility checks." },
      { path: ["languageTests", "toefl"], label: "TOEFL score", impact: "Unlocks TOEFL-based eligibility checks." },
      { path: ["languageTests", "celpip"], label: "CELPIP score", impact: "Unlocks CELPIP-based eligibility checks." },
      { path: ["languageTests", "ieltsBands", "reading"], label: "IELTS reading band", impact: "Handles band-specific minimums." },
      { path: ["languageTests", "ieltsBands", "listening"], label: "IELTS listening band", impact: "Handles band-specific minimums." },
      { path: ["languageTests", "ieltsBands", "writing"], label: "IELTS writing band", impact: "Handles band-specific minimums." },
      { path: ["languageTests", "ieltsBands", "speaking"], label: "IELTS speaking band", impact: "Handles band-specific minimums." },
    ],
  },
  {
    key: "targets",
    title: "Application goals",
    description: "Targets narrow the ranking engine to the scholarships you actually want.",
    fields: [
      { path: ["applicationCycle"], label: "Application cycle", impact: "Matches deadlines to intake year." },
      { path: ["targetDegreeLevel"], label: "Target degree level", impact: "Filters by programme level." },
      { path: ["targetDisciplines"], label: "Target disciplines", impact: "Targets subject-specific awards." },
      { path: ["targetCountries"], label: "Target countries", impact: "Filters destination country." },
    ],
  },
];

export function getValueAtPath(source, path) {
  return path.reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), source);
}

export function hasProfileValue(value) {
  if (Array.isArray(value)) {
    return value.some((item) => hasProfileValue(item));
  }

  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}

export function getProfileCompletion(draft = {}) {
  const fields = PROFILE_COMPLETION_SECTIONS.flatMap((section) => section.fields);
  const filled = fields.reduce((count, field) => count + (hasProfileValue(getValueAtPath(draft, field.path)) ? 1 : 0), 0);
  const total = fields.length;

  return {
    filled,
    total,
    percent: total ? Math.round((filled / total) * 100) : 0,
  };
}

export function getProfileSectionCompletion(draft = {}) {
  return PROFILE_COMPLETION_SECTIONS.map((section) => {
    const fields = section.fields.map((field) => {
      const value = getValueAtPath(draft, field.path);
      const filled = hasProfileValue(value);
      return { ...field, filled, value };
    });

    const filled = fields.filter((field) => field.filled).length;
    const total = fields.length;

    return {
      ...section,
      fields,
      filled,
      total,
      percent: total ? Math.round((filled / total) * 100) : 0,
      missing: fields.filter((field) => !field.filled),
    };
  });
}

export function getProfileCompletionLabel(percent) {
  if (percent >= 85) return "Ready for matching";
  if (percent >= 60) return "Strong baseline";
  if (percent >= 35) return "In progress";
  return "Start here";
}
