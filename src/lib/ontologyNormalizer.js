function toText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function toMaybeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const NATIONALITY_ENTRIES = [
  { code: "NG", nationality: "Nigerian", country: "Nigeria", aliases: ["nigeria", "nigerian", "ng"] },
  { code: "GH", nationality: "Ghanaian", country: "Ghana", aliases: ["ghana", "ghanaian", "gh"] },
  { code: "KE", nationality: "Kenyan", country: "Kenya", aliases: ["kenya", "kenyan", "ke"] },
  { code: "UG", nationality: "Ugandan", country: "Uganda", aliases: ["uganda", "ugandan", "ug"] },
  { code: "CM", nationality: "Cameroonian", country: "Cameroon", aliases: ["cameroon", "cameroonian", "cm"] },
  { code: "RW", nationality: "Rwandan", country: "Rwanda", aliases: ["rwanda", "rwandan", "rw"] },
  { code: "TZ", nationality: "Tanzanian", country: "Tanzania", aliases: ["tanzania", "tanzanian", "tz"] },
  { code: "ZA", nationality: "South African", country: "South Africa", aliases: ["south africa", "south african", "za"] },
  { code: "GB", nationality: "United Kingdom", country: "United Kingdom", aliases: ["uk", "united kingdom", "great britain", "britain", "england", "scotland", "wales", "gb"] },
  { code: "CA", nationality: "Canadian", country: "Canada", aliases: ["canada", "canadian", "ca"] },
  { code: "AU", nationality: "Australian", country: "Australia", aliases: ["australia", "australian", "au"] },
  { code: "US", nationality: "American", country: "United States", aliases: ["united states", "usa", "us", "america", "american"] },
  { code: "ANY", nationality: "Any", country: "Any", aliases: ["international", "any", "any nationality", "open to all"] },
];

const DISCIPLINE_ENTRIES = [
  { code: "0110", label: "Education", parentCode: "0100", patterns: [/education/i, /teaching/i, /literacy/i, /pedagogy/i] },
  { code: "0610", label: "Computer Science", parentCode: "0600", patterns: [/computer science/i, /software/i, /data science/i, /\bai\b/i, /machine learning/i, /information systems/i, /computing/i] },
  { code: "0710", label: "Engineering", parentCode: "0700", patterns: [/engineering/i, /mechanical/i, /electrical/i, /civil/i, /chemical/i, /aerospace/i, /material/i] },
  { code: "0910", label: "Health Sciences", parentCode: "0900", patterns: [/public health/i, /nursing/i, /medicine/i, /health/i, /pharmacy/i, /biomedical/i] },
  { code: "0410", label: "Business", parentCode: "0400", patterns: [/business/i, /management/i, /finance/i, /accounting/i, /marketing/i, /supply chain/i, /entrepreneurship/i] },
  { code: "0421", label: "Law", parentCode: "0400", patterns: [/\blaw\b/i, /legal/i, /\bllm\b/i, /\bllb\b/i] },
  { code: "0311", label: "Economics", parentCode: "0300", patterns: [/economics?/i, /econometric/i, /economic policy/i] },
  { code: "0313", label: "Psychology", parentCode: "0300", patterns: [/psychology/i, /behavio(?:u)?ral science/i] },
  { code: "0231", label: "Linguistics", parentCode: "0200", patterns: [/linguistics/i, /language/i, /translation/i, /interpreting/i] },
  { code: "0500", label: "Sciences", parentCode: null, patterns: [/\bscience\b/i, /biology/i, /chemistry/i, /physics/i, /mathematics?/i] },
  { code: "0200", label: "Arts and Humanities", parentCode: null, patterns: [/arts?/i, /humanities/i, /history/i, /literature/i, /philosophy/i, /anthropology/i] },
  { code: "0810", label: "Agriculture", parentCode: "0800", patterns: [/agricultur/i, /horticulture/i, /forestry/i, /veterinary/i] },
];

const DEGREE_CLASS_ALIASES = {
  "1": "first",
  "1st": "first",
  "first class": "first",
  first: "first",
  distinction: "first",
  "2:1": "2:1",
  "2.1": "2:1",
  "upper second": "2:1",
  "upper second class": "2:1",
  merit: "2:1",
  "2:2": "2:2",
  "2.2": "2:2",
  "lower second": "2:2",
  "lower second class": "2:2",
  pass: "third",
  third: "third",
};

function buildResult({ input, resolved = null, path = "no_match", confidence = 0, notes = null, extra = {} }) {
  return {
    input: toText(input),
    resolved,
    path,
    confidence,
    notes,
    ...extra,
  };
}

export function normalizeNationalityValue(input) {
  const text = toText(input);
  if (!text) return buildResult({ input, resolved: null, path: "no_match", confidence: 0 });
  const lowered = text.toLowerCase();
  const exact = NATIONALITY_ENTRIES.find((entry) => entry.aliases.includes(lowered) || entry.nationality.toLowerCase() === lowered || entry.country.toLowerCase() === lowered);
  if (!exact) {
    return buildResult({ input, resolved: text, path: "no_match", confidence: 0.2 });
  }
  const exactLabel = exact.nationality.toLowerCase() === lowered || exact.country.toLowerCase() === lowered;
  return buildResult({
    input,
    resolved: exact.nationality,
    path: exactLabel ? "exact_match" : "alias_match",
    confidence: exactLabel ? 0.98 : 0.92,
    extra: { code: exact.code, country: exact.country, nationality: exact.nationality },
  });
}

export function normalizeCountryValue(input) {
  const result = normalizeNationalityValue(input);
  return {
    ...result,
    resolved: result.country || result.resolved,
  };
}

export function normalizeDisciplineValue(input) {
  const text = toText(input);
  if (!text) return buildResult({ input, resolved: null, path: "no_match", confidence: 0 });
  const matched = DISCIPLINE_ENTRIES.find((entry) => entry.patterns.some((pattern) => pattern.test(text)));
  if (!matched) {
    return buildResult({ input, resolved: text, path: "no_match", confidence: 0.2 });
  }
  return buildResult({
    input,
    resolved: matched.label,
    path: "alias_match",
    confidence: 0.9,
    extra: { code: matched.code, parentCode: matched.parentCode, label: matched.label },
  });
}

export function normalizeDegreeClassValue(input, options = {}) {
  const direct = toText(input).toLowerCase();
  const alias = DEGREE_CLASS_ALIASES[direct];
  if (alias) {
    return buildResult({ input, resolved: alias, path: "alias_match", confidence: 0.95 });
  }

  const cgpa = toMaybeNumber(options.cgpa);
  const scale = toMaybeNumber(options.cgpaScale) || 5;
  if (cgpa !== null && scale > 0) {
    const resolved = cgpaToDegreeClass(cgpa, scale);
    if (resolved) {
      return buildResult({ input: direct || `${cgpa}/${scale}`, resolved, path: "crosswalk", confidence: 0.85 });
    }
  }

  return buildResult({ input, resolved: direct || null, path: direct ? "no_match" : "no_match", confidence: direct ? 0.2 : 0 });
}

export function cgpaToDegreeClass(cgpa, scale = 5) {
  const value = toMaybeNumber(cgpa);
  const numericScale = toMaybeNumber(scale) || 5;
  if (value === null || !numericScale || numericScale <= 0) return "";

  if (numericScale >= 5) {
    if (value >= 4.5) return "first";
    if (value >= 3.5) return "2:1";
    if (value >= 2.4) return "2:2";
    if (value >= 1.5) return "third";
    return "";
  }

  const normalized = (value / numericScale) * 5;
  return cgpaToDegreeClass(normalized, 5);
}

function cefrFromIelts(score) {
  if (score >= 8) return "C2";
  if (score >= 7) return "C1";
  if (score >= 5.5) return "B2";
  if (score >= 4) return "B1";
  if (score >= 3) return "A2";
  return "A1";
}

function cefrFromToefl(score) {
  if (score >= 110) return "C2";
  if (score >= 95) return "C1";
  if (score >= 72) return "B2";
  if (score >= 42) return "B1";
  if (score >= 32) return "A2";
  return "A1";
}

function cefrFromCelpip(score) {
  if (score >= 10) return "C1";
  if (score >= 7) return "B2";
  if (score >= 5) return "B1";
  if (score >= 4) return "A2";
  return "A1";
}

export function normalizeLanguageScore(test, score) {
  const numeric = toMaybeNumber(score);
  const testName = toText(test).toUpperCase();
  if (numeric === null || !testName) return null;

  let cefr = "A1";
  if (testName === "IELTS") cefr = cefrFromIelts(numeric);
  else if (testName === "TOEFL") cefr = cefrFromToefl(numeric);
  else if (testName === "CELPIP") cefr = cefrFromCelpip(numeric);

  return {
    test: testName,
    score: numeric,
    cefr,
    confidence: 0.95,
    path: "crosswalk",
  };
}
