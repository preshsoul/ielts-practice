// =========================================================================
// LOCI CV Text Preprocessing Pipeline
// =========================================================================
// Prepares extracted CV text for LLM parsing by:
//   1. Normalizing whitespace and removing artifacts
//   2. Repairing hyphenated line breaks and continuation lines
//   3. Splitting text into canonical CV sections
//   4. Quality-gating: rejecting text unlikely to be a CV
//   5. Trimming to LLM context limits with section prioritization
//
// Ported from backend/cv_extractor/services/text_processing.py
// =========================================================================

// =========================================================================
// Constants
// =========================================================================

const QUALITY_MIN_CHARS = 250;
const QUALITY_MIN_ALPHA_RATIO = 0.55;
const QUALITY_MAX_SUSPICIOUS_RATIO = 0.18;
const QUALITY_MIN_UNIQUE_LINE_RATIO = 0.45;

const LLM_MAX_CHARS = 16_000;

const SECTION_KEYWORDS: Record<string, string[]> = {
  contact: [
    "contact",
    "personal",
    "details",
    "profile",
  ],
  summary: [
    "summary",
    "objective",
    "about me",
    "professional profile",
    "personal statement",
    "career objective",
    "executive summary",
  ],
  education: [
    "education",
    "academic",
    "qualification",
    "university",
    "degree",
    "institution",
    "college",
    "school",
    "certification",
    "training",
  ],
  skills: [
    "skill",
    "technolog",
    "competenc",
    "expertise",
    "proficienc",
    "language",
    "tool",
    "framework",
    "platform",
  ],
  experience: [
    "experience",
    "employment",
    "work history",
    "professional experience",
    "career",
    "work experience",
  ],
  projects: [
    "project",
    "portfolio",
    "publication",
    "research",
  ],
  awards: [
    "award",
    "honour",
    "honor",
    "achievement",
    "scholarship",
    "prize",
  ],
  references: [
    "reference",
    "referee",
  ],
};

// =========================================================================
// Types
// =========================================================================

export interface SectionMap {
  contact: string[];
  summary: string[];
  education: string[];
  skills: string[];
  experience: string[];
  projects: string[];
  awards: string[];
  references: string[];
  other: string[];
}

export interface PreprocessResult {
  normalized: string;
  sections: SectionMap;
  quality: QualityReport;
  trimmed: string;
  trimmedChars: number;
  originalChars: number;
}

export interface QualityReport {
  passed: boolean;
  totalChars: number;
  alphaRatio: number;
  suspiciousCharRatio: number;
  uniqueLineRatio: number;
  hasEducationSignal: boolean;
  hasContactSignal: boolean;
  failures: string[];
}

// =========================================================================
// Whitespace & Artifact Normalization
// =========================================================================

export function normalizeText(raw: string): string {
  return String(raw || "")
    .replace(/\x00/g, " ")          // null bytes → space
    .replace(/­/g, "")         // soft hyphens → remove
    .replace(/\r\n/g, "\n")         // CRLF → LF
    .replace(/\r/g, "\n")           // CR → LF
    .replace(/[ \t\f\v]+/g, " ")    // horizontal whitespace → single space
    .replace(/\n[ \t]+/g, "\n")     // space after newline → remove
    .replace(/[ ]*\n[ ]*/g, "\n")   // spaces around newline → newline
    .replace(/\n{3,}/g, "\n\n")     // 3+ newlines → 2
    .trim();
}

// =========================================================================
// Layout Repair
// =========================================================================

/**
 * Repairs common PDF extraction artifacts:
 * - Hyphenated line breaks ("educa-\ntion" → "education")
 * - Continuation lines (lowercase start after sentence-ending punctuation)
 * - Trailing punctuation on isolated lines
 */
export function repairLayout(text: string): string {
  const lines = text.split("\n");
  const repaired: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (!line) {
      repaired.push("");
      continue;
    }

    // Merge hyphenated breaks: "educa-" followed by "tion" on next line
    if (line.endsWith("-") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      // Only merge if the next line starts with lowercase (continuation)
      if (nextLine && /^[a-z]/.test(nextLine)) {
        repaired.push(line.slice(0, -1) + nextLine);
        i++; // skip the next line
        continue;
      }
    }

    // Merge continuation: if previous line ends with sentence punctuation
    // and current line starts lowercase, merge with space
    if (
      repaired.length > 0 &&
      repaired[repaired.length - 1] &&
      /[.!?:;]\s*$/.test(repaired[repaired.length - 1]) === false &&
      /^[a-z(]/.test(line) &&
      !isSectionHeader(line)
    ) {
      const prev = repaired.pop()!;
      repaired.push(prev + " " + line);
      continue;
    }

    repaired.push(line);
  }

  return repaired.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// =========================================================================
// Section Detection
// =========================================================================

function isSectionHeader(line: string): boolean {
  const cleaned = line.replace(/[#*\-•\d.\s]/g, "").trim().toLowerCase();
  if (cleaned.length < 3 || cleaned.length > 40) return false;

  // Check if line is a known section heading
  for (const keywords of Object.values(SECTION_KEYWORDS)) {
    for (const kw of keywords) {
      if (cleaned.includes(kw)) return true;
    }
  }

  // All-caps short line (common CV heading style)
  if (line === line.toUpperCase() && line.length >= 4 && line.length <= 40) {
    return true;
  }

  return false;
}

export function splitSections(text: string): SectionMap {
  const lines = text.split("\n");
  const sections: SectionMap = {
    contact: [],
    summary: [],
    education: [],
    skills: [],
    experience: [],
    projects: [],
    awards: [],
    references: [],
    other: [],
  };

  let currentSection: keyof SectionMap = "other";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      sections[currentSection].push("");
      continue;
    }

    // Check if this is a new section header
    const newSection = detectSectionChange(trimmed);
    if (newSection) {
      currentSection = newSection;
      sections[currentSection].push(trimmed);
      continue;
    }

    sections[currentSection].push(trimmed);
  }

  return sections;
}

function detectSectionChange(line: string): keyof SectionMap | null {
  const cleaned = line.replace(/[#*\-•\d.\s]/g, "").trim().toLowerCase();
  if (cleaned.length < 3) return null;

  // Score each section by keyword match
  const scores: Array<{ section: keyof SectionMap; score: number }> = [];
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (cleaned.includes(kw)) score++;
    }
    if (score > 0) {
      scores.push({ section: section as keyof SectionMap, score });
    }
  }

  scores.sort((a, b) => b.score - a.score);

  // Only change section if we have a strong signal
  if (scores.length > 0 && scores[0].score >= 2) {
    return scores[0].section;
  }

  // All-caps short line with high confidence
  if (line === line.toUpperCase() && line.length >= 4 && line.length <= 30) {
    // Check against known section patterns
    const lowerLine = line.toLowerCase();
    for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
      for (const kw of keywords) {
        if (lowerLine.includes(kw)) {
          return section as keyof SectionMap;
        }
      }
    }
  }

  return null;
}

// =========================================================================
// Quality Assessment
// =========================================================================

export function assessQuality(text: string): QualityReport {
  const failures: string[] = [];
  const totalChars = text.replace(/\s/g, "").length;
  const alphaChars = (text.match(/[A-Za-z]/g) || []).length;
  const totalNonSpace = text.replace(/\s/g, "").length;
  const suspiciousChars = (text.match(/[^\x20-\x7E\n\r\t\f\v -ÿ]/g) || []).length;
  const lines = text.split("\n").filter((l) => l.trim());
  const uniqueLines = new Set(lines.map((l) => l.trim().toLowerCase()));

  const alphaRatio = totalNonSpace > 0 ? alphaChars / totalNonSpace : 0;
  const suspiciousRatio = totalNonSpace > 0 ? suspiciousChars / totalNonSpace : 0;
  const uniqueLineRatio = lines.length > 0 ? uniqueLines.size / lines.length : 0;

  // Check signals
  const hasEducationSignal = /education|university|college|degree|bachelor|master|phd|bsc|msc|ba\b|b\.a\.|m\.a\.|b\.s\.|m\.s\./i.test(text);
  const hasContactSignal = /@|phone|tel|mobile|address|linkedin|github/i.test(text);

  if (totalChars < QUALITY_MIN_CHARS) {
    failures.push(`chars=${totalChars}, min=${QUALITY_MIN_CHARS}`);
  }
  if (alphaRatio < QUALITY_MIN_ALPHA_RATIO) {
    failures.push(`alpha=${alphaRatio.toFixed(2)}, min=${QUALITY_MIN_ALPHA_RATIO}`);
  }
  if (suspiciousRatio > QUALITY_MAX_SUSPICIOUS_RATIO) {
    failures.push(`suspicious=${suspiciousRatio.toFixed(2)}, max=${QUALITY_MAX_SUSPICIOUS_RATIO}`);
  }
  if (uniqueLineRatio < QUALITY_MIN_UNIQUE_LINE_RATIO) {
    failures.push(`uniqueLines=${uniqueLineRatio.toFixed(2)}, min=${QUALITY_MIN_UNIQUE_LINE_RATIO}`);
  }
  if (!hasEducationSignal) {
    failures.push("no_education_signal");
  }

  return {
    passed: failures.length === 0,
    totalChars,
    alphaRatio,
    suspiciousCharRatio: suspiciousRatio,
    uniqueLineRatio,
    hasEducationSignal,
    hasContactSignal,
    failures,
  };
}

// =========================================================================
// Section-Prioritized Trimming
// =========================================================================

/**
 * Trims CV text to fit LLM context window, prioritizing high-signal sections.
 *
 * Priority order: contact > summary > education > skills > experience >
 *   projects > awards > references > other
 *
 * Text is trimmed from the lowest-priority sections first.
 */
export function trimToContextLimit(text: string, sections: SectionMap, maxChars: number = LLM_MAX_CHARS): string {
  const priorityOrder: Array<keyof SectionMap> = [
    "contact",
    "summary",
    "education",
    "skills",
    "experience",
    "projects",
    "awards",
    "references",
    "other",
  ];

  // Fast path: text already fits
  if (text.length <= maxChars) return text;

  // Build prioritized text, dropping lowest-priority sections
  const included = new Set<keyof SectionMap>();
  let result = "";
  let remaining = maxChars;

  for (const section of priorityOrder) {
    const sectionText = sections[section].join("\n").trim();
    if (!sectionText) continue;

    if (sectionText.length <= remaining) {
      // Include full section
      result += (result ? "\n\n" : "") + sectionText;
      remaining -= sectionText.length;
      included.add(section);
    } else {
      // Include partial section — take first N chars
      const partial = sectionText.slice(0, remaining - 3) + "...";
      result += (result ? "\n\n" : "") + partial;
      included.add(section);
      break;
    }
  }

  return result.trim();
}

// =========================================================================
// Full Pipeline
// =========================================================================

export function preprocessCvText(raw: string, maxChars: number = LLM_MAX_CHARS): PreprocessResult {
  // Step 1: Normalize whitespace and artifacts
  const normalized = normalizeText(raw);

  // Step 2: Repair layout (hyphenation, continuation lines)
  const repaired = repairLayout(normalized);

  // Step 3: Quality assessment
  const quality = assessQuality(repaired);

  // Step 4: Split into sections
  const sections = splitSections(repaired);

  // Step 5: Trim to context limit with section prioritization
  const trimmed = trimToContextLimit(repaired, sections, maxChars);

  return {
    normalized: repaired,
    sections,
    quality,
    trimmed,
    trimmedChars: trimmed.length,
    originalChars: raw.length,
  };
}
