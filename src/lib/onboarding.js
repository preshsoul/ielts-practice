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

  return {
    targetBand: profile.target_band ?? profile.targetBand ?? "",
    currentLevel: toSkillBands(selfAssessment),
    testDate: profile.test_date ? String(profile.test_date).slice(0, 10) : String(profile.testDate || "").slice(0, 10),
    targetModules: toModules(profile.target_modules || profile.targetModules),
  };
}

export function serializeOnboardingDraft(draft = {}) {
  const currentLevel = toSkillBands(draft.currentLevel || {});
  const targetModules = toModules(draft.targetModules);

  return {
    target_band: toNumberOrNull(draft.targetBand),
    self_assessment: currentLevel,
    test_date: toStringOrEmpty(draft.testDate) || null,
    target_modules: targetModules,
    onboarding_completed: Boolean(
      toNumberOrNull(draft.targetBand) !== null &&
      toStringOrEmpty(draft.testDate) &&
      Object.values(currentLevel).every((value) => value !== "")
    ),
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
