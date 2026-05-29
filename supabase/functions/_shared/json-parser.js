const DEFAULT_LIMITS = {
  maxBytes: 256_000,
  maxDepth: 32,
  maxObjectKeys: 128,
  maxArrayItems: 256,
};

class StrictJsonError extends Error {
  constructor(message, { line = 1, column = 1, path = "$" } = {}) {
    super(message);
    this.name = "StrictJsonError";
    this.line = line;
    this.column = column;
    this.path = path;
  }
}

function makeReader(input) {
  let index = 0;
  let line = 1;
  let column = 1;

  const current = () => input[index];
  const eof = () => index >= input.length;
  const position = () => ({ line, column });

  const advance = () => {
    const ch = input[index++];
    if (ch === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return ch;
  };

  const error = (message, path = "$") => {
    const pos = position();
    throw new StrictJsonError(message, { line: pos.line, column: pos.column, path });
  };

  return { current, eof, advance, error, position, get index() { return index; } };
}

function sortObjectKeys(entries) {
  return entries.sort(([left], [right]) => left.localeCompare(right, "en"));
}

function skipWhitespace(reader) {
  while (!reader.eof()) {
    const ch = reader.current();
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      reader.advance();
      continue;
    }
    break;
  }
}

function parseString(reader, path) {
  if (reader.current() !== "\"") reader.error("Expected string", path);
  reader.advance();
  let result = "";
  while (!reader.eof()) {
    const ch = reader.advance();
    if (ch === "\"") return result;
    if (ch === "\\") {
      if (reader.eof()) reader.error("Unterminated escape sequence", path);
      const esc = reader.advance();
      if (esc === "\"" || esc === "\\" || esc === "/") result += esc;
      else if (esc === "b") result += "\b";
      else if (esc === "f") result += "\f";
      else if (esc === "n") result += "\n";
      else if (esc === "r") result += "\r";
      else if (esc === "t") result += "\t";
      else if (esc === "u") {
        let hex = "";
        for (let i = 0; i < 4; i += 1) {
          if (reader.eof()) reader.error("Invalid unicode escape", path);
          hex += reader.advance();
        }
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) reader.error("Invalid unicode escape", path);
        result += String.fromCharCode(Number.parseInt(hex, 16));
      } else {
        reader.error(`Invalid escape character '${esc}'`, path);
      }
      continue;
    }
    result += ch;
  }
  reader.error("Unterminated string", path);
}

function parseNumber(reader, path) {
  const start = reader.index;
  let text = "";
  if (reader.current() === "-") {
    text += reader.advance();
  }
  const first = reader.current();
  if (first === "0") {
    text += reader.advance();
  } else if (first >= "1" && first <= "9") {
    while (!reader.eof()) {
      const ch = reader.current();
      if (ch >= "0" && ch <= "9") {
        text += reader.advance();
      } else {
        break;
      }
    }
  } else {
    reader.error("Invalid number", path);
  }

  if (reader.current() === ".") {
    text += reader.advance();
    if (!(reader.current() >= "0" && reader.current() <= "9")) reader.error("Invalid fractional part", path);
    while (!reader.eof()) {
      const ch = reader.current();
      if (ch >= "0" && ch <= "9") {
        text += reader.advance();
      } else {
        break;
      }
    }
  }

  if (reader.current() === "e" || reader.current() === "E") {
    text += reader.advance();
    if (reader.current() === "+" || reader.current() === "-") text += reader.advance();
    if (!(reader.current() >= "0" && reader.current() <= "9")) reader.error("Invalid exponent", path);
    while (!reader.eof()) {
      const ch = reader.current();
      if (ch >= "0" && ch <= "9") {
        text += reader.advance();
      } else {
        break;
      }
    }
  }

  const value = Number(text);
  if (!Number.isFinite(value)) {
    reader.error("Invalid number", path);
  }
  if (reader.index === start) reader.error("Invalid number", path);
  return value;
}

function parseLiteral(reader, literal, value, path) {
  for (const expected of literal) {
    if (reader.eof() || reader.advance() !== expected) {
      reader.error(`Expected '${literal}'`, path);
    }
  }
  return value;
}

function parseValue(reader, options, path = "$", depth = 0) {
  if (depth > options.maxDepth) {
    reader.error(`Maximum nesting depth of ${options.maxDepth} exceeded`, path);
  }
  skipWhitespace(reader);
  if (reader.eof()) reader.error("Unexpected end of input", path);
  const ch = reader.current();
  if (ch === "{") return parseObject(reader, options, path, depth + 1);
  if (ch === "[") return parseArray(reader, options, path, depth + 1);
  if (ch === "\"") return parseString(reader, path);
  if (ch === "t") return parseLiteral(reader, "true", true, path);
  if (ch === "f") return parseLiteral(reader, "false", false, path);
  if (ch === "n") return parseLiteral(reader, "null", null, path);
  if (ch === "-" || (ch >= "0" && ch <= "9")) return parseNumber(reader, path);
  reader.error(`Unexpected token '${ch}'`, path);
}

function parseArray(reader, options, path, depth) {
  if (reader.advance() !== "[") reader.error("Expected '['", path);
  const items = [];
  skipWhitespace(reader);
  if (reader.current() === "]") {
    reader.advance();
    return items;
  }
  let index = 0;
  while (!reader.eof()) {
    if (index >= options.maxArrayItems) {
      reader.error(`Array exceeds maximum length of ${options.maxArrayItems}`, `${path}[${index}]`);
    }
    const itemPath = `${path}[${index}]`;
    items.push(parseValue(reader, options, itemPath, depth));
    index += 1;
    skipWhitespace(reader);
    const next = reader.current();
    if (next === ",") {
      reader.advance();
      skipWhitespace(reader);
      continue;
    }
    if (next === "]") {
      reader.advance();
      return items;
    }
    reader.error("Expected ',' or ']'", itemPath);
  }
  reader.error("Unterminated array", path);
}

function parseObject(reader, options, path, depth) {
  if (reader.advance() !== "{") reader.error("Expected '{'", path);
  const entries = [];
  const seen = new Set();
  skipWhitespace(reader);
  if (reader.current() === "}") {
    reader.advance();
    return {};
  }
  let count = 0;
  while (!reader.eof()) {
    if (count >= options.maxObjectKeys) {
      reader.error(`Object exceeds maximum key count of ${options.maxObjectKeys}`, path);
    }
    if (reader.current() !== "\"") {
      reader.error("Expected string key", path);
    }
    const key = parseString(reader, path);
    if (seen.has(key)) {
      reader.error(`Duplicate key '${key}'`, `${path}.${key}`);
    }
    seen.add(key);
    skipWhitespace(reader);
    if (reader.current() !== ":") reader.error("Expected ':' after key", `${path}.${key}`);
    reader.advance();
    const valuePath = `${path}.${key}`;
    const value = parseValue(reader, options, valuePath, depth);
    entries.push([key, value]);
    count += 1;
    skipWhitespace(reader);
    const next = reader.current();
    if (next === ",") {
      reader.advance();
      skipWhitespace(reader);
      continue;
    }
    if (next === "}") {
      reader.advance();
      const sorted = sortObjectKeys(entries);
      const obj = {};
      for (const [entryKey, entryValue] of sorted) {
        obj[entryKey] = entryValue;
      }
      return obj;
    }
    reader.error("Expected ',' or '}'", path);
  }
  reader.error("Unterminated object", path);
}

export function parseStrictJson(text, limits = {}) {
  const options = { ...DEFAULT_LIMITS, ...limits };
  const input = String(text ?? "");
  if (input.length > options.maxBytes) {
    throw new StrictJsonError(`Payload exceeds maximum size of ${options.maxBytes} bytes`, { path: "$" });
  }
  const reader = makeReader(input);
  const value = parseValue(reader, options);
  skipWhitespace(reader);
  if (!reader.eof()) {
    reader.error("Trailing characters after valid JSON", "$");
  }
  return value;
}

function ensureObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StrictJsonError("Expected object", { path });
  }
  return value;
}

function ensureString(value, path, { nullable = false, maxLength = 500 } = {}) {
  if (value === null) {
    if (nullable) return null;
    throw new StrictJsonError("Expected string", { path });
  }
  if (typeof value !== "string") throw new StrictJsonError("Expected string", { path });
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new StrictJsonError(`String exceeds maximum length of ${maxLength}`, { path });
  return trimmed;
}

function ensureNumber(value, path, { nullable = false, integer = false, min = -Infinity, max = Infinity } = {}) {
  if (value === null) {
    if (nullable) return null;
    throw new StrictJsonError("Expected number", { path });
  }
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new StrictJsonError("Expected number", { path });
  }
  if (integer && !Number.isInteger(value)) throw new StrictJsonError("Expected integer", { path });
  if (value < min || value > max) throw new StrictJsonError(`Number must be between ${min} and ${max}`, { path });
  return value;
}

function ensureArray(value, path, { nullable = false, maxLength = 128 } = {}) {
  if (value === null) {
    if (nullable) return null;
    throw new StrictJsonError("Expected array", { path });
  }
  if (!Array.isArray(value)) throw new StrictJsonError("Expected array", { path });
  if (value.length > maxLength) throw new StrictJsonError(`Array exceeds maximum length of ${maxLength}`, { path });
  return value;
}

function normalizeStringArray(value, path, options = {}) {
  const arr = ensureArray(value, path, options);
  if (arr === null) return null;
  return arr.map((item, index) => ensureString(item, `${path}[${index}]`, { maxLength: 120 })).filter(Boolean);
}

function normalizeNullableObject(value, path) {
  if (value === null) return null;
  return ensureObject(value, path);
}

function validateKnownKeys(value, path, allowedKeys) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new StrictJsonError(`Unexpected key '${key}'`, { path: `${path}.${key}` });
    }
  }
}

function normalizeIdentity(value, path) {
  const obj = normalizeNullableObject(value, path) || {};
  validateKnownKeys(obj, path, ["nationality", "countryOfResidence", "ageAtApplicationCycle"]);
  return {
    nationality: ensureString(obj.nationality ?? null, `${path}.nationality`, { nullable: true, maxLength: 80 }),
    countryOfResidence: ensureString(obj.countryOfResidence ?? null, `${path}.countryOfResidence`, { nullable: true, maxLength: 80 }),
    ageAtApplicationCycle: ensureNumber(obj.ageAtApplicationCycle ?? null, `${path}.ageAtApplicationCycle`, { nullable: true, integer: true, min: 0, max: 120 }),
  };
}

function normalizeAcademic(value, path) {
  const obj = normalizeNullableObject(value, path) || {};
  validateKnownKeys(obj, path, ["degreeClass", "institution", "institutionCountry", "discipline", "disciplineCategory", "graduationYear", "cgpa", "cgpaScale", "degreeLevel"]);
  return {
    degreeClass: ensureString(obj.degreeClass ?? null, `${path}.degreeClass`, { nullable: true, maxLength: 40 }),
    institution: ensureString(obj.institution ?? null, `${path}.institution`, { nullable: true, maxLength: 160 }),
    institutionCountry: ensureString(obj.institutionCountry ?? null, `${path}.institutionCountry`, { nullable: true, maxLength: 80 }),
    discipline: ensureString(obj.discipline ?? null, `${path}.discipline`, { nullable: true, maxLength: 120 }),
    disciplineCategory: ensureString(obj.disciplineCategory ?? null, `${path}.disciplineCategory`, { nullable: true, maxLength: 120 }),
    graduationYear: ensureNumber(obj.graduationYear ?? null, `${path}.graduationYear`, { nullable: true, integer: true, min: 1950, max: 2100 }),
    cgpa: ensureNumber(obj.cgpa ?? null, `${path}.cgpa`, { nullable: true, min: 0, max: 100 }),
    cgpaScale: ensureNumber(obj.cgpaScale ?? 5, `${path}.cgpaScale`, { min: 1, max: 10 }),
    degreeLevel: ensureString(obj.degreeLevel ?? null, `${path}.degreeLevel`, { nullable: true, maxLength: 40 }),
  };
}

function normalizeProfessional(value, path) {
  const obj = normalizeNullableObject(value, path) || {};
  validateKnownKeys(obj, path, ["workExperienceYears", "currentlyEmployed", "sector"]);
  let employed = null;
  if (obj.currentlyEmployed !== null && obj.currentlyEmployed !== undefined) {
    if (typeof obj.currentlyEmployed === "boolean") {
      employed = obj.currentlyEmployed;
    } else if (typeof obj.currentlyEmployed === "string") {
      const lowered = obj.currentlyEmployed.trim().toLowerCase();
      if (["yes", "true", "1", "y", "currently", "current"].includes(lowered)) employed = true;
      else if (["no", "false", "0", "n", "none"].includes(lowered)) employed = false;
      else throw new StrictJsonError("Expected boolean-like employment value", { path: `${path}.currentlyEmployed` });
    } else {
      throw new StrictJsonError("Expected boolean-like employment value", { path: `${path}.currentlyEmployed` });
    }
  }
  return {
    workExperienceYears: ensureNumber(obj.workExperienceYears ?? 0, `${path}.workExperienceYears`, { integer: true, min: 0, max: 80 }),
    currentlyEmployed: employed,
    sector: ensureString(obj.sector ?? null, `${path}.sector`, { nullable: true, maxLength: 120 }),
  };
}

function normalizeLanguageTests(value, path) {
  const obj = normalizeNullableObject(value, path) || {};
  validateKnownKeys(obj, path, ["ielts", "toefl", "celpip"]);
  return {
    ielts: ensureNumber(obj.ielts ?? null, `${path}.ielts`, { nullable: true, min: 0, max: 9 }),
    toefl: ensureNumber(obj.toefl ?? null, `${path}.toefl`, { nullable: true, min: 0, max: 120 }),
    celpip: ensureNumber(obj.celpip ?? null, `${path}.celpip`, { nullable: true, min: 0, max: 12 }),
  };
}

function normalizeParsedProfile(value, path) {
  const obj = normalizeNullableObject(value, path) || {};
  validateKnownKeys(obj, path, ["identity", "academic", "professional", "languageTests", "applicationCycle", "targetDegreeLevel", "targetDisciplines", "targetCountries", "keywords"]);
  return {
    identity: normalizeIdentity(obj.identity, `${path}.identity`),
    academic: normalizeAcademic(obj.academic, `${path}.academic`),
    professional: normalizeProfessional(obj.professional, `${path}.professional`),
    languageTests: normalizeLanguageTests(obj.languageTests, `${path}.languageTests`),
    applicationCycle: ensureString(obj.applicationCycle ?? null, `${path}.applicationCycle`, { nullable: true, maxLength: 20 }),
    targetDegreeLevel: ensureString(obj.targetDegreeLevel ?? null, `${path}.targetDegreeLevel`, { nullable: true, maxLength: 40 }),
    targetDisciplines: normalizeStringArray(obj.targetDisciplines ?? [], `${path}.targetDisciplines`, { maxLength: 12 }),
    targetCountries: normalizeStringArray(obj.targetCountries ?? [], `${path}.targetCountries`, { maxLength: 12 }),
    keywords: normalizeStringArray(obj.keywords ?? [], `${path}.keywords`, { maxLength: 64 }),
  };
}

// ── Canonical contract validators (cv-parser-v2) ──

function normalizeControlledValue(value, path) {
  if (value === null) return null;
  const obj = ensureObject(value, path);
  validateKnownKeys(obj, path, ["id", "label", "raw_text"]);
  return {
    id: ensureString(obj.id ?? null, `${path}.id`, { nullable: true, maxLength: 80 }),
    label: ensureString(obj.label ?? null, `${path}.label`, { nullable: true, maxLength: 120 }),
    raw_text: ensureString(obj.raw_text ?? null, `${path}.raw_text`, { nullable: true, maxLength: 200 }),
  };
}

function normalizeAcademicRecord(value, path) {
  const obj = ensureObject(value, path);
  validateKnownKeys(obj, path, [
    "institution", "institution_country", "degree_type",
    "academic_discipline", "degree_class", "graduation_date",
    "graduation_year", "cgpa", "cgpa_scale",
  ]);
  return {
    institution: ensureString(obj.institution ?? null, `${path}.institution`, { nullable: true, maxLength: 160 }),
    institution_country: ensureString(obj.institution_country ?? null, `${path}.institution_country`, { nullable: true, maxLength: 80 }),
    degree_type: ensureString(obj.degree_type ?? null, `${path}.degree_type`, { nullable: true, maxLength: 40 }),
    academic_discipline: ensureString(obj.academic_discipline ?? null, `${path}.academic_discipline`, { nullable: true, maxLength: 120 }),
    degree_class: normalizeControlledValue(obj.degree_class ?? null, `${path}.degree_class`),
    graduation_date: ensureString(obj.graduation_date ?? null, `${path}.graduation_date`, { nullable: true, maxLength: 24 }),
    graduation_year: ensureNumber(obj.graduation_year ?? null, `${path}.graduation_year`, { nullable: true, integer: true, min: 1950, max: 2100 }),
    cgpa: ensureNumber(obj.cgpa ?? null, `${path}.cgpa`, { nullable: true, min: 0, max: 100 }),
    cgpa_scale: ensureNumber(obj.cgpa_scale ?? 5, `${path}.cgpa_scale`, { min: 1, max: 10 }),
  };
}

function normalizeGradeEvidence(value, path) {
  const obj = ensureObject(value, path);
  validateKnownKeys(obj, path, ["scheme", "normalized", "raw", "cgpa", "scale"]);
  const scheme = ensureString(obj.scheme ?? "other", `${path}.scheme`, { maxLength: 24 });
  return {
    scheme: ["degree_class", "cgpa", "other"].includes(scheme) ? scheme : "other",
    normalized: ensureString(obj.normalized ?? null, `${path}.normalized`, { nullable: true, maxLength: 80 }),
    raw: ensureString(obj.raw ?? null, `${path}.raw`, { nullable: true, maxLength: 40 }),
    cgpa: ensureNumber(obj.cgpa ?? null, `${path}.cgpa`, { nullable: true, min: 0, max: 100 }),
    scale: ensureNumber(obj.scale ?? null, `${path}.scale`, { nullable: true, min: 1, max: 10 }),
  };
}

function normalizePersonalDetails(value, path) {
  const obj = ensureObject(value, path);
  validateKnownKeys(obj, path, [
    "full_legal_name", "email", "phone",
    "nationality", "country_of_residence",
  ]);
  return {
    full_legal_name: ensureString(obj.full_legal_name ?? null, `${path}.full_legal_name`, { nullable: true, maxLength: 160 }),
    email: ensureString(obj.email ?? null, `${path}.email`, { nullable: true, maxLength: 254 }),
    phone: ensureString(obj.phone ?? null, `${path}.phone`, { nullable: true, maxLength: 40 }),
    nationality: normalizeControlledValue(obj.nationality ?? null, `${path}.nationality`),
    country_of_residence: normalizeControlledValue(obj.country_of_residence ?? null, `${path}.country_of_residence`),
  };
}

function normalizeLanguageTestScores(value, path) {
  const obj = normalizeNullableObject(value, path) || {};
  validateKnownKeys(obj, path, ["ielts_band_score", "toefl_score", "celpip_score"]);
  return {
    ielts_band_score: ensureNumber(obj.ielts_band_score ?? null, `${path}.ielts_band_score`, { nullable: true, min: 0, max: 9 }),
    toefl_score: ensureNumber(obj.toefl_score ?? null, `${path}.toefl_score`, { nullable: true, min: 0, max: 120 }),
    celpip_score: ensureNumber(obj.celpip_score ?? null, `${path}.celpip_score`, { nullable: true, min: 0, max: 12 }),
  };
}

function normalizeParsedCandidateProfile(value, path) {
  const obj = normalizeNullableObject(value, path) || {};
  validateKnownKeys(obj, path, [
    "personal_details", "academic_history", "professional_experience_years",
    "international_exams", "grade", "keywords", "raw_text_snippet",
  ]);
  return {
    personal_details: normalizePersonalDetails(obj.personal_details ?? {}, `${path}.personal_details`),
    academic_history: ensureArray(obj.academic_history ?? [], `${path}.academic_history`, { maxLength: 16 })
      .map((entry, i) => normalizeAcademicRecord(entry, `${path}.academic_history[${i}]`)),
    professional_experience_years: ensureNumber(
      obj.professional_experience_years ?? null,
      `${path}.professional_experience_years`,
      { nullable: true, integer: false, min: 0, max: 80 },
    ),
    international_exams: normalizeLanguageTestScores(
      obj.international_exams ?? {},
      `${path}.international_exams`,
    ),
    grade: normalizeGradeEvidence(obj.grade ?? {}, `${path}.grade`),
    keywords: normalizeStringArray(obj.keywords ?? [], `${path}.keywords`, { maxLength: 64 }),
    raw_text_snippet: ensureString(obj.raw_text_snippet ?? null, `${path}.raw_text_snippet`, { nullable: true, maxLength: 2000 }),
  };
}

function normalizeProvenance(value, path) {
  const obj = normalizeNullableObject(value, path) || {};
  validateKnownKeys(obj, path, ["parser_version", "method", "model", "parsed_at"]);
  return {
    parser_version: ensureString(obj.parser_version ?? "cv-parser-v2", `${path}.parser_version`, { maxLength: 40 }),
    method: ensureString(obj.method ?? "llm_parse", `${path}.method`, { maxLength: 40 }),
    model: ensureString(obj.model ?? null, `${path}.model`, { nullable: true, maxLength: 80 }),
    parsed_at: ensureString(obj.parsed_at ?? new Date().toISOString(), `${path}.parsed_at`, { maxLength: 32 }),
  };
}

export function validateDocumentIntake(value) {
  const obj = ensureObject(value, "$");
  validateKnownKeys(obj, "$", [
    "label",
    "sourceFilename",
    "mimeType",
    "documentType",
    "rawTextHash",
    "extractedExcerpt",
    "extractedText",
    "keywords",
    "parsedProfile",
    "parsedCandidateProfile",
    "provenance",
    "confidence",
  ]);
  const legacyProfile = obj.parsedProfile && typeof obj.parsedProfile === "object" && Object.keys(obj.parsedProfile).length
    ? normalizeParsedProfile(obj.parsedProfile, "$.parsedProfile")
    : {};

  return {
    label: ensureString(obj.label ?? null, "$.label", { nullable: true, maxLength: 240 }),
    sourceFilename: ensureString(obj.sourceFilename ?? null, "$.sourceFilename", { nullable: true, maxLength: 240 }),
    mimeType: ensureString(obj.mimeType ?? null, "$.mimeType", { nullable: true, maxLength: 120 }),
    documentType: ensureString(obj.documentType ?? null, "$.documentType", { nullable: true, maxLength: 20 }),
    rawTextHash: ensureString(obj.rawTextHash ?? null, "$.rawTextHash", { nullable: true, maxLength: 128 }),
    extractedExcerpt: ensureString(obj.extractedExcerpt ?? null, "$.extractedExcerpt", { nullable: true, maxLength: 2000 }),
    extractedText: ensureString(obj.extractedText ?? null, "$.extractedText", { nullable: true, maxLength: 200000 }),
    keywords: normalizeStringArray(obj.keywords ?? [], "$.keywords", { maxLength: 64 }),
    parsedProfile: legacyProfile,
    parsedCandidateProfile: normalizeParsedCandidateProfile(obj.parsedCandidateProfile ?? {}, "$.parsedCandidateProfile"),
    provenance: normalizeProvenance(obj.provenance ?? {}, "$.provenance"),
    confidence: ensureNumber(obj.confidence ?? 0, "$.confidence", { min: 0, max: 1 }),
  };
}

export function parseAndValidateDocumentIntake(text, limits = {}) {
  const parsed = parseStrictJson(text, limits);
  return validateDocumentIntake(parsed);
}

export { StrictJsonError };
