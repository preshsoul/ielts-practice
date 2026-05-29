// supabase/functions/_shared/cv-parser.ts
function toText(value) {
  return String(value ?? "").trim();
}
function maybeText(value) {
  const text = toText(value);
  return text || null;
}
function normalizeDegreeClass(input) {
  const clean = toText(input).toLowerCase();
  if (!clean) return null;
  if (clean.includes("first") || clean.includes("1st")) return "First Class";
  if (clean.includes("upper") || clean.includes("2:1") || clean.includes("2.1")) return "Second Class Upper";
  if (clean.includes("lower") || clean.includes("2:2") || clean.includes("2.2")) return "Second Class Lower";
  if (clean.includes("third") || clean.includes("3rd")) return "Third Class";
  if (clean.includes("pass")) return "Pass";
  return null;
}
function normalizeYear(input) {
  if (input === null || input === void 0 || input === "") return null;
  const parsed = typeof input === "string" ? Number.parseInt(input.replace(/\D/g, ""), 10) : Number(input);
  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2030 ? parsed : null;
}
function safelyExtractField(fieldKey, fieldObject, issuesList) {
  if (!fieldObject || typeof fieldObject !== "object") {
    issuesList.push({
      field: fieldKey,
      issueType: "MISSING_PROPERTY",
      message: "The root field payload was either absent or structurally malformed."
    });
    return { extractedValue: null, exactQuote: null };
  }
  const payload = fieldObject;
  return {
    extractedValue: payload?.extractedValue ?? null,
    exactQuote: typeof payload?.exactQuote === "string" ? payload.exactQuote : null
  };
}
async function parseCvRawTextHardened(rawLLMData2, rawCvText) {
  const mappingIssues = [];
  const cleanRawText = rawCvText ? rawCvText.toLowerCase() : "";
  const source = rawLLMData2 && typeof rawLLMData2 === "object" ? rawLLMData2 : {};
  const fullNameField = safelyExtractField("fullName", source?.fullName, mappingIssues);
  const degreeClassField = safelyExtractField("degreeClass", source?.degreeClass, mappingIssues);
  const institutionField = safelyExtractField("degreeInstitution", source?.degreeInstitution, mappingIssues);
  const graduationField = safelyExtractField("graduationYear", source?.graduationYear, mappingIssues);
  const skillsField = safelyExtractField("skills", source?.skills, mappingIssues);
  const verifyQuoteWithAudit = (fieldKey, extracted) => {
    if (extracted.extractedValue === null) return false;
    if (!extracted.exactQuote) {
      mappingIssues.push({
        field: fieldKey,
        issueType: "HALLUCINATION_DETECTED",
        message: "Value was returned without matching exactQuote verification metadata."
      });
      return false;
    }
    const citationFound = cleanRawText.includes(extracted.exactQuote.toLowerCase());
    if (!citationFound) {
      mappingIssues.push({
        field: fieldKey,
        issueType: "HALLUCINATION_DETECTED",
        message: `Extracted citation quote "${extracted.exactQuote}" could not be cross-verified inside the raw CV text.`
      });
      return false;
    }
    return true;
  };
  const fullNameVerified = verifyQuoteWithAudit("fullName", fullNameField);
  const institutionVerified = verifyQuoteWithAudit("degreeInstitution", institutionField);
  const normalizedDegreeClass = normalizeDegreeClass(maybeText(degreeClassField.extractedValue));
  const normalizedGraduationYear = normalizeYear(graduationField.extractedValue);
  const normalizedProfile = {
    full_name: fullNameVerified ? String(fullNameField.extractedValue) : null,
    degree_class: normalizedDegreeClass,
    institution_name: institutionVerified ? String(institutionField.extractedValue) : null,
    graduation_year: normalizedGraduationYear,
    skills_list: Array.isArray(skillsField.extractedValue) ? skillsField.extractedValue.slice(0, 8).map((item) => String(item)) : []
  };
  if (degreeClassField.extractedValue && !normalizedProfile.degree_class) {
    mappingIssues.push({
      field: "degreeClass",
      issueType: "TYPE_MISMATCH",
      message: `Failed to resolve raw value "${String(degreeClassField.extractedValue)}" into a standard database enum definition.`
    });
  }
  const totalFieldsTracked = 4;
  const passedChecksCount = [
    fullNameVerified,
    normalizedProfile.degree_class !== null,
    institutionVerified,
    normalizedProfile.graduation_year !== null
  ].filter(Boolean).length;
  const overallConfidenceScore = totalFieldsTracked > 0 ? passedChecksCount / totalFieldsTracked : 0;
  return {
    normalizedProfile,
    mappingIssues,
    overallConfidenceScore
  };
}

// cv-adversarial.ts
var rawText = "Ada Okafor\nUniversity of Lagos\nGraduated 2022";
var rawLLMData = { "fullName": { "extractedValue": "Ada Okafor", "exactQuote": "Ada Okafor" }, "degreeClass": { "extractedValue": "Summa Cum Laude", "exactQuote": null }, "degreeInstitution": { "extractedValue": "Harvard University", "exactQuote": "Harvard University" }, "graduationYear": { "extractedValue": "2099", "exactQuote": "2099" } };
var result = await parseCvRawTextHardened(rawLLMData, rawText);
console.log(JSON.stringify(result, null, 2));
