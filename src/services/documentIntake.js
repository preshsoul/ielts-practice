const DEGREE_CLASS_PATTERNS = [
  { pattern: /\bfirst class\b|\b1st class\b|\bfirst\b/i, value: "first" },
  { pattern: /\b2:1\b|\b2\.1\b|\bupper second\b/i, value: "2:1" },
  { pattern: /\b2:2\b|\b2\.2\b|\blower second\b/i, value: "2:2" },
  { pattern: /\bthird class\b|\bthird\b/i, value: "third" },
];

const DEGREE_LEVEL_PATTERNS = [
  { pattern: /\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/i, value: "PhD" },
  { pattern: /\bmaster'?s\b|\bmsc\b|\bma\b|\bmba\b|\bpostgraduate\b/i, value: "Master's" },
  { pattern: /\bundergraduate\b|\bbachelor'?s\b|\bbsc\b|\bba\b/i, value: "Bachelor's" },
];

const DISCIPLINE_PATTERNS = [
  { pattern: /\beducation\b|\bteaching\b|\bliteracy\b/i, value: "Education" },
  { pattern: /\bcomputer science\b|\bsoftware\b|\bdata science\b|\bai\b/i, value: "Computer Science" },
  { pattern: /\bengineering\b|\bmechanical\b|\belectrical\b/i, value: "Engineering" },
  { pattern: /\bpublic health\b|\bhealth\b|\bnursing\b/i, value: "Health Sciences" },
  { pattern: /\bbusiness\b|\bmanagement\b|\bfinance\b|\baccounting\b/i, value: "Business" },
  { pattern: /\blaw\b|\blegal\b/i, value: "Law" },
  { pattern: /\beconomics\b|\beconomic\b/i, value: "Economics" },
  { pattern: /\bpsychology\b/i, value: "Psychology" },
  { pattern: /\blinguistics\b|\blanguage\b/i, value: "Linguistics" },
  { pattern: /\bscience\b|\bbiology\b|\bchemistry\b|\bphysics\b/i, value: "Sciences" },
];

const COUNTRY_PATTERNS = [
  { pattern: /\bnigeria(n)?\b/i, value: "Nigeria", nationality: "Nigerian" },
  { pattern: /\bghana(ian)?\b/i, value: "Ghana", nationality: "Ghanaian" },
  { pattern: /\bkenya(n)?\b/i, value: "Kenya", nationality: "Kenyan" },
  { pattern: /\buk\b|\bunited kingdom\b|\bengland\b/i, value: "UK" },
  { pattern: /\bcanada(n)?\b/i, value: "Canada" },
  { pattern: /\baustralia(n)?\b/i, value: "Australia" },
  { pattern: /\busa\b|\bunited states\b|\bamerica(n)?\b/i, value: "US" },
];

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "you", "are", "was", "were",
  "cv", "resume", "document", "file", "upload", "application", "scholarship", "profile",
  "teacher", "student", "experience", "years", "year", "document", "notes", "please",
]);

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stripRtf(text) {
  return String(text || "")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-f]{2}/gi, " ")
    .replace(/\{\\[^{}]*\}/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\\[a-z]+-?\d* ?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unescapePdfText(text) {
  return String(text || "")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractPdfText(bytes) {
  const text = new TextDecoder("latin1").decode(bytes);
  const chunks = [];
  const stringMatches = text.match(/\((?:\\.|[^\\)])+\)\s*T[Jj]/g) || [];
  const hexMatches = text.match(/<([0-9A-Fa-f\s]+)>\s*T[Jj]/g) || [];

  for (const entry of stringMatches) {
    const inner = entry.replace(/^\(|\)\s*T[Jj]$/g, "");
    chunks.push(unescapePdfText(inner));
  }

  for (const entry of hexMatches) {
    const hex = entry.replace(/[<>\sT[Jj]]/g, "");
    if (hex.length % 2 === 0 && hex.length) {
      try {
        const bytes = new Uint8Array(hex.match(/.{1,2}/g).map((pair) => Number.parseInt(pair, 16)));
        chunks.push(new TextDecoder("utf-8").decode(bytes));
      } catch {
        // ignore malformed hex fragments
      }
    }
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function inferDocumentType(file) {
  const name = (file?.name || "").toLowerCase();
  const mime = (file?.type || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("word") || name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc";
  if (mime.includes("rtf") || name.endsWith(".rtf")) return "rtf";
  if (mime.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) return "text";
  return "unknown";
}

function buildSuggestions(sourceText) {
  const text = String(sourceText || "");
  const lowered = text.toLowerCase();
  const identity = {};
  const academic = {};
  const professional = {};
  const languageTests = {};

  for (const entry of DEGREE_CLASS_PATTERNS) {
    if (entry.pattern.test(lowered)) {
      academic.degreeClass = entry.value;
      break;
    }
  }

  for (const entry of DEGREE_LEVEL_PATTERNS) {
    if (entry.pattern.test(lowered)) {
      academic.degreeLevel = entry.value;
      break;
    }
  }

  for (const entry of DISCIPLINE_PATTERNS) {
    if (entry.pattern.test(lowered)) {
      academic.discipline = entry.value;
      academic.disciplineCategory = entry.value;
      break;
    }
  }

  for (const entry of COUNTRY_PATTERNS) {
    if (entry.pattern.test(lowered)) {
      identity.countryOfResidence = entry.value;
      if (entry.nationality) identity.nationality = entry.nationality;
      break;
    }
  }

  const ielts = lowered.match(/\bielts\b[^0-9]{0,12}(\d(?:\.\d)?)/i);
  const toefl = lowered.match(/\btoefl\b[^0-9]{0,12}(\d{2,3})/i);
  const celpip = lowered.match(/\bcelpip\b[^0-9]{0,12}(\d(?:\.\d)?)/i);

  if (ielts?.[1]) languageTests.ielts = Number.parseFloat(ielts[1]);
  if (toefl?.[1]) languageTests.toefl = Number.parseInt(toefl[1], 10);
  if (celpip?.[1]) languageTests.celpip = Number.parseFloat(celpip[1]);

  const experience = lowered.match(/\b(\d{1,2})\s+(?:years?|yrs?)\s+(?:of\s+)?experience\b/i);
  if (experience?.[1]) professional.workExperienceYears = Number.parseInt(experience[1], 10);
  if (/currently employed|employed\b/i.test(lowered)) professional.currentlyEmployed = "yes";
  if (/not employed|unemployed|seeking employment/i.test(lowered)) professional.currentlyEmployed = "no";

  const degreeCycle = lowered.match(/\b20\d{2}\b/);
  const year = degreeCycle?.[0] || "";

  const targetDisciplines = unique(
    DISCIPLINE_PATTERNS.filter((entry) => entry.pattern.test(lowered)).map((entry) => entry.value)
  );

  const keywords = unique(tokenize(text));

  return {
    identity: Object.keys(identity).length ? identity : undefined,
    academic: Object.keys(academic).length ? academic : undefined,
    professional: Object.keys(professional).length ? professional : undefined,
    languageTests: Object.keys(languageTests).length ? languageTests : undefined,
    applicationCycle: year ? String(Number(year) + 1) : undefined,
    targetDegreeLevel: academic.degreeLevel || undefined,
    targetDisciplines: targetDisciplines.length ? targetDisciplines : undefined,
    targetCountries: identity.countryOfResidence ? [identity.countryOfResidence] : undefined,
    keywords,
  };
}

export async function buildDocumentIntake(file, notes = "") {
  const bytes = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const rawTextHash = Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const documentType = inferDocumentType(file);
  const mimeType = file.type || "";

  let extractedText = "";
  if (documentType === "text" || documentType === "rtf") {
    extractedText = await file.text();
    if (documentType === "rtf") extractedText = stripRtf(extractedText);
  } else if (documentType === "pdf") {
    extractedText = extractPdfText(new Uint8Array(bytes));
  } else {
    extractedText = await file.text().catch(() => "");
  }

  const cleanText = String(extractedText || "").replace(/\s+/g, " ").trim();
  const combinedText = [file.name, notes, cleanText].filter(Boolean).join(" ");
  const keywords = unique(tokenize(combinedText));
  const parsedProfile = buildSuggestions(combinedText);
  const confidence = documentType === "text" ? 0.92 : documentType === "rtf" ? 0.7 : documentType === "pdf" ? 0.6 : 0.35;

  return {
    label: notes?.trim() || file.name,
    sourceFilename: file.name,
    mimeType,
    documentType,
    rawTextHash,
    extractedText: cleanText,
    extractedExcerpt: cleanText.slice(0, 1200),
    keywords,
    parsedProfile,
    confidence,
  };
}
