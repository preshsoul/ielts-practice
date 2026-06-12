function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toSkillBands(source = {}) {
  return {
    reading: toStringOrEmpty(source.reading),
    listening: toStringOrEmpty(source.listening),
    writing: toStringOrEmpty(source.writing),
    speaking: toStringOrEmpty(source.speaking),
  };
}

function toModules(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function toList(value) {
  return toModules(value);
}

function toNestedObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeDefined(base = {}, patch = {}) {
  const next = { ...base };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim?.() !== "") {
      next[key] = value;
    }
  });
  return next;
}

function hashSeed(value = "") {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function getDisplayName(profile = {}) {
  const fromProfile =
    profile.display_name ||
    profile.displayName ||
    profile.full_name ||
    profile.fullName ||
    profile.name ||
    profile.email?.split("@")?.[0] ||
    "";
  return String(fromProfile || "").trim();
}

export function buildOnboardingGreeting(profile = {}, now = new Date()) {
  const hour = Number.isFinite(now.getHours()) ? now.getHours() : 12;
  const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const displayName = getDisplayName(profile);
  const personalization = displayName ? `, ${displayName}` : "";
  const variants = [
    {
      title: `Hey, welcome back${personalization}!`,
      copy: "Let’s finish your setup so the dashboard can start speaking your language.",
    },
    {
      title: `Good to see you${personalization}!`,
      copy: "A few quick details here will make the rest of the workspace feel a lot sharper.",
    },
    {
      title: `Ready to pick up where you left off${personalization}?`,
      copy: "Once this is saved, your next recommendations can lean on a real baseline instead of guesswork.",
    },
    {
      title: `${period[0].toUpperCase()}${period.slice(1)} check-in${personalization}.`,
      copy: "Give us the final pieces and we’ll turn them into a cleaner study plan.",
    },
  ];
  const seedSource = `${profile.id || profile.email || "guest"}:${now.toISOString().slice(0, 10)}`;
  const variant = variants[hashSeed(seedSource) % variants.length];

  return {
    label: `${period} check-in`,
    title: variant.title,
    copy: variant.copy,
  };
}

export function createOnboardingDraft(profile = {}) {
  const selfAssessment = profile.self_assessment || profile.selfAssessment || {};
  const academic = toNestedObject(profile.academic);
  const identity = toNestedObject(profile.identity);
  const professional = toNestedObject(profile.professional);
  const languageTests = toNestedObject(profile.languageTests);

  return {
    displayName: getDisplayName(profile),
    targetBand: profile.target_band ?? profile.targetBand ?? "",
    currentLevel: toSkillBands(selfAssessment),
    testDate: profile.test_date ? String(profile.test_date).slice(0, 10) : String(profile.testDate || "").slice(0, 10),
    targetModules: toModules(profile.target_modules || profile.targetModules),
    identity: {
      nationality: toStringOrEmpty(identity.nationality),
      countryOfResidence: toStringOrEmpty(identity.countryOfResidence),
    },
    academic: {
      degreeClass: toStringOrEmpty(academic.degreeClass),
      institution: toStringOrEmpty(academic.institution),
      institutionCountry: toStringOrEmpty(academic.institutionCountry),
      discipline: toStringOrEmpty(academic.discipline),
      disciplineCategory: toStringOrEmpty(academic.disciplineCategory),
      graduationYear: toStringOrEmpty(academic.graduationYear),
      cgpa: toStringOrEmpty(academic.cgpa),
      cgpaScale: toStringOrEmpty(academic.cgpaScale || "5"),
    },
    professional: {
      workExperienceYears: professional.workExperienceYears ?? "",
      currentlyEmployed: toStringOrEmpty(professional.currentlyEmployed),
      sector: toStringOrEmpty(professional.sector),
    },
    languageTests: {
      ielts: languageTests.ielts ?? "",
      toefl: languageTests.toefl ?? "",
      celpip: languageTests.celpip ?? "",
    },
    applicationCycle: toStringOrEmpty(profile.applicationCycle || profile.applicationcycle),
    targetDegreeLevel: toStringOrEmpty(profile.targetDegreeLevel || profile.targetdegreelevel),
    targetDisciplines: toList(profile.targetDisciplines || profile.targetdisciplines),
    targetCountries: toList(profile.targetCountries || profile.targetcountries),
    targetTracks: toList(profile.targetTracks || profile.target_tracks || academic.targetScholarships),
    dossier: null,
  };
}

export function serializeOnboardingDraft(draft = {}) {
  const currentLevel = toSkillBands(draft.currentLevel || {});
  const targetModules = toModules(draft.targetModules);
  const parsedProfile = toNestedObject(draft.dossier?.parsedProfile);
  const parsedAcademic = toNestedObject(parsedProfile.academic);
  const parsedIdentity = toNestedObject(parsedProfile.identity);
  const parsedProfessional = toNestedObject(parsedProfile.professional);
  const parsedLanguageTests = toNestedObject(parsedProfile.languageTests);
  const identity = mergeDefined(parsedIdentity, toNestedObject(draft.identity));
  const academic = mergeDefined(parsedAcademic, {
    ...toNestedObject(draft.academic),
    targetScholarships: toList(draft.targetTracks),
  });
  const professional = mergeDefined(parsedProfessional, toNestedObject(draft.professional));
  const languageTests = mergeDefined(parsedLanguageTests, toNestedObject(draft.languageTests));
  const targetDisciplines = toList(draft.targetDisciplines).length
    ? toList(draft.targetDisciplines)
    : toList(parsedProfile.targetDisciplines);
  const targetCountries = toList(draft.targetCountries).length
    ? toList(draft.targetCountries)
    : toList(parsedProfile.targetCountries);
  const targetDegreeLevel = toStringOrEmpty(draft.targetDegreeLevel) || toStringOrEmpty(parsedProfile.targetDegreeLevel);
  const applicationCycle = toStringOrEmpty(draft.applicationCycle) || toStringOrEmpty(parsedProfile.applicationCycle);

  return {
    display_name: toStringOrEmpty(draft.displayName) || null,
    target_band: toNumberOrNull(draft.targetBand),
    self_assessment: currentLevel,
    test_date: toStringOrEmpty(draft.testDate) || null,
    target_modules: targetModules,
    identity,
    academic,
    professional,
    languageTests,
    applicationCycle,
    targetDegreeLevel,
    targetDisciplines,
    targetCountries,
    // onboarding_completed is a privileged field — set server-side only.
    // The client computes readiness via isOnboardingComplete() instead.
  };
}

export function isOnboardingComplete(profile = {}) {
  const safeProfile = profile || {};
  const targetBand = safeProfile.target_band ?? safeProfile.targetBand;
  const testDate = safeProfile.test_date ?? safeProfile.testDate;
  const selfAssessment = safeProfile.self_assessment || safeProfile.selfAssessment || {};

  return (
    Number.isFinite(Number(targetBand)) &&
    Boolean(String(testDate || "").trim()) &&
    ["reading", "listening", "writing", "speaking"].every((skill) => {
      const value = selfAssessment[skill];
      return value !== null && value !== undefined && String(value).trim() !== "";
    })
  );
}
