/**
 * Match Breakdown Formatter
 *
 * Formats scoringEngine analysis data for display in the Match Breakdown panel.
 * Each criterion has a status (passed/provisional/failed), icon, and color.
 * Failed criteria get actionable fix suggestions based on the user's profile.
 */

/**
 * @param {{ score: number, max: number }} criterion
 * @returns {{ icon: string, label: string, color: string }}
 */
export function formatCriterionStatus(criterion) {
  const ratio = criterion.max > 0 ? criterion.score / criterion.max : 0;

  if (ratio >= 0.8) return { icon: "check", label: "Strong match", color: "var(--c-green)" };
  if (ratio >= 0.5) return { icon: "warn", label: "Partial match", color: "var(--c-amber)" };
  if (ratio > 0) return { icon: "warn", label: "Weak match", color: "var(--c-amber)" };
  return { icon: "cross", label: "Not met", color: "var(--c-red)" };
}

/**
 * Build a human-readable fix suggestion for a failed criterion.
 *
 * @param {{ key: string, score: number, max: number, reason?: string }} criterion
 * @param {object} profile - the normalized profile
 * @returns {string | null}
 */
export function buildFixSuggestion(criterion, profile) {
  if (!criterion || criterion.score >= criterion.max * 0.8) return null;

  const key = (criterion.key || "").toLowerCase();
  const reason = criterion.reason || "";

  // Nationality
  if (key === "nationality") {
    const userNat = profile?.identity?.nationality || profile?.nationality || null;
    if (userNat) {
      return `This scholarship requires a specific nationality. Your nationality (${userNat}) doesn't match. Look for scholarships with open nationality requirements.`;
    }
    return "Add your nationality to your profile to check eligibility for nationality-restricted scholarships.";
  }

  // Discipline
  if (key === "discipline") {
    const userDisc = profile?.academic?.discipline || profile?.discipline || null;
    if (userDisc) {
      return `This scholarship targets a different academic discipline than yours (${userDisc}). Explore scholarships in your field or consider adjacent disciplines.`;
    }
    return "Add your academic discipline to your profile to match with field-specific scholarships.";
  }

  // Degree class
  if (key === "degree") {
    const userDegree = profile?.academic?.degreeClass || profile?.degreeClass || null;
    if (userDegree) {
      return `This scholarship requires a higher degree classification. You have ${userDegree}. Focus on scholarships with lower or no degree class requirements.`;
    }
    return "Add your degree classification (e.g., 1st, 2:1, 2:2) to unlock degree-restricted scholarships.";
  }

  // Language
  if (key === "language") {
    const ielts = profile?.languageTests?.ielts || profile?.ielts || null;
    if (ielts) {
      return `This scholarship requires a higher IELTS score. Your current score is ${ielts}. Improving your IELTS band could unlock more scholarships.`;
    }
    return "Add your IELTS (or equivalent) score to your profile to check language requirements.";
  }

  // Experience
  if (key === "experience") {
    const exp = profile?.professional?.workExperienceYears ?? profile?.workExperienceYears ?? null;
    if (exp !== null && exp !== undefined) {
      return `This scholarship requires more work experience (${reason}). You have ${exp} years. Consider entry-level or graduate-specific scholarships.`;
    }
    return "Add your work experience to your profile to match with experience-gated scholarships.";
  }

  // Coverage
  if (key === "coverage") {
    return "This scholarship provides less funding coverage than ideal. You may need to supplement with other funding sources.";
  }

  // Deadline
  if (key === "deadline") {
    return "The deadline for this scholarship has passed or is very close. Check the deadline action plan for upcoming opportunities.";
  }

  // Provenance
  if (key === "provenance") {
    return "The source data for this scholarship has lower confidence. Verify details on the official scholarship page before applying.";
  }

  // Document burden
  if (key === "burden") {
    return "This scholarship requires many documents. Prepare your CV, transcripts, and references in advance.";
  }

  return null;
}

/**
 * Get a human-readable label for a criterion key.
 */
export function getCriterionDisplayName(key) {
  const names = {
    semantic: "Semantic fit",
    nationality: "Nationality",
    discipline: "Discipline",
    degree: "Degree class",
    language: "Language test",
    experience: "Work experience",
    coverage: "Funding coverage",
    deadline: "Deadline",
    provenance: "Source confidence",
    burden: "Document burden",
    priority: "Opportunity priority",
    engagement: "Your engagement",
  };
  return names[key] || key;
}
