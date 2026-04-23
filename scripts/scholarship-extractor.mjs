import { createEmptyScholarship } from "./scholarship-schema.mjs";

const MONEY_RE = /£\s?([\d,]+(?:\.\d+)?)\s?(k|thousand|million|m)?\b/gi;
const DATE_RE = /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi;
const DEADLINE_CUES = /\b(deadline|closing date|apply by|applications? close|final date|closes on)\b/i;
const ROLLING_CUES = /\b(rolling|ongoing|year[- ]round|continuous|no deadline|applications are open all year)\b/i;
const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/['\u2019"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseAmount(match) {
  const raw = match[1].replace(/,/g, "");
  const n = parseFloat(raw);
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "k" || suffix === "thousand") return Math.round(n * 1000);
  if (suffix === "m" || suffix === "million") return Math.round(n * 1000000);
  return Math.round(n);
}

function extractCoverage(text) {
  const moneyMatches = [...text.matchAll(MONEY_RE)];
  const amountGBP = moneyMatches.length ? parseAmount(moneyMatches[0]) : null;
  const rawAmount = moneyMatches[0]?.[0] ?? null;

  const fullCues = /\bfull\s+(tuition|scholarship|funding|award)\b|\b100\s?%\s+(fee|tuition)\b/i.test(text);
  const tuition = /\b(tuition|fee\s+waiver|fee\s+discount|tuition\s+fee)\b/i.test(text);
  const stipend = /\b(stipend|living\s+(allowance|cost|expense)|maintenance\s+grant)\b/i.test(text);
  const flights = /\b(flight|airfare|travel\s+allowance)\b/i.test(text);

  let type = "unknown";
  if (fullCues || (tuition && stipend)) type = "full";
  else if (tuition) type = "tuition-only";
  else if (stipend) type = "stipend-only";

  const amountType = /\bper\s+year|\bannually|\bannual|\bper\s+annum\b/i.test(text) ? "annual" : "total";

  return {
    type,
    tuition: tuition || fullCues,
    tuitionCovered: tuition || fullCues,
    livingCovered: stipend || fullCues,
    flightsCovered: flights || fullCues,
    visaFees: /\bvisa\s+fees?\b/i.test(text),
    numericAmount: amountGBP,
    amountGBP,
    amountType: amountGBP ? amountType : null,
    currency: "GBP",
    rawAmountString: rawAmount,
    rawAmount,
  };
}

function extractEligibility(text) {
  const nigerianEligible = /\b(nigeria|west\s+africa|sub-?saharan|commonwealth|developing\s+countr|international\s+students?|african\s+students?)\b/i.test(text);
  const degreeMatch = text.match(/\b(2[:.]?1|2[:.]?2|first[- ]class|upper\s+second|lower\s+second|2\.1|2\.2)\b/i);
  const normalizeDegreeClass = (s) => {
    if (!s) return null;
    const x = s.toLowerCase();
    if (/first|1st/.test(x)) return "1st";
    if (/2[:.]1|upper\s+second/.test(x)) return "2:1";
    if (/2[:.]2|lower\s+second/.test(x)) return "2:2";
    return null;
  };
  const englishMatch = text.match(/\bIELTS\s+(\d(?:\.\d)?)|\bTOEFL\s+(\d{2,3})\b/i);
  const englishTestRequired = englishMatch ? (englishMatch[1] ? `IELTS ${englishMatch[1]}` : `TOEFL ${englishMatch[2]}`) : null;

  return {
    nationalities: nigerianEligible ? ["international"] : [],
    degreeClassMin: normalizeDegreeClass(degreeMatch?.[1]) || "",
    disciplines: [],
    ageLimitMin: null,
    ageLimitMax: null,
    workExperienceYearsMin: 0,
    employmentStatusAtApplication: null,
    languageReqs: {
      ielts: englishMatch?.[1] ? `IELTS ${englishMatch[1]}` : null,
      toefl: englishMatch?.[2] ? `TOEFL ${englishMatch[2]}` : null,
      celpip: null,
      exemptions: [],
    },
    refereesRequired: /\b(referee|reference letter|references?)\b/i.test(text) ? 2 : 0,
    refereeCategories: [],
    targetInstitutions: [],
    targetProgrammes: [],
    notes: "",
    nigerianEligible,
    degreeClassRequired: normalizeDegreeClass(degreeMatch?.[1]),
    ageLimit: null,
    nyscRequired: /\bnysc\b/i.test(text),
    englishTestRequired,
    otherRequirements: [],
  };
}

function toISO(match, type) {
  const day = parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  const year = parseInt(match[3], 10);
  const d = new Date(Date.UTC(year, month, day));
  return { iso: d.toISOString().slice(0, 10), type, raw: match[0] };
}

function extractDeadline(text) {
  if (ROLLING_CUES.test(text)) {
    return { iso: null, type: "rolling", raw: "Rolling" };
  }
  const matches = [...text.matchAll(DATE_RE)];
  if (!matches.length) {
    return { iso: null, type: "unknown", raw: null };
  }
  for (const m of matches) {
    const window = text.slice(Math.max(0, m.index - 80), m.index + 80);
    if (DEADLINE_CUES.test(window)) {
      return toISO(m, "fixed");
    }
  }
  return toISO(matches[0], "estimated");
}

function classifyAwardingBody(body) {
  if (!body) return "unknown";
  const s = body.toLowerCase();
  if (/universit|college|institute/.test(s)) return "university";
  if (/government|ministry|council|commonwealth|chevening/.test(s)) return "government";
  if (/foundation|trust/.test(s)) return "foundation";
  if (/corporat|company|firm/.test(s)) return "corporate";
  return "unknown";
}

function computeConfidence(record) {
  let c = 0;
  if (record.name && record.name.length > 10) c += 0.2;
  if (record.coverage.numericAmount || record.coverage.amountGBP) c += 0.25;
  if (record.application.deadline || record.application.deadlineType === "rolling") c += 0.25;
  if (record.eligibility.degreeClassMin || record.eligibility.nigerianEligible || record.eligibility.nationalities.length) c += 0.15;
  if (record.application.url) c += 0.15;
  return Math.min(1, c);
}

function computeNeedsVerification(record) {
  const missing = [];
  if (!record.coverage.amountGBP && record.coverage.type === "unknown") missing.push("amount");
  if (!record.application.deadline && record.application.deadlineType !== "rolling") missing.push("deadline");
  if (!record.eligibility.nigerianEligible && !record.eligibility.nationalities.length) missing.push("eligibility");
  if (!record.application.url) missing.push("applicationUrl");
  return missing;
}

function computeUrgency(deadlineISO) {
  if (!deadlineISO) return "green";
  const days = (new Date(deadlineISO) - new Date()) / (1000 * 60 * 60 * 24);
  if (days < 0) return "black";
  if (days <= 56) return "red";
  if (days <= 150) return "yellow";
  return "green";
}

function cleanTitle(title, label) {
  if (!title) return "";
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(?:${escapedLabel})\s*[-–|:]\s*`, "i");
  return title.replace(pattern, "").trim();
}

export function extractScholarship({ html, sourceUrl, sourceLabel, title }) {
  const record = createEmptyScholarship();
  const text = stripTags(html);
  const cleanedName = cleanTitle(title || sourceLabel, sourceLabel);
  const name = cleanedName || title || sourceLabel || "Untitled Scholarship";
  const awardingBody = sourceLabel || new URL(sourceUrl).hostname.replace(/^www\./, "");

  record.id = slugify(`${awardingBody}-${name}`);
  record.name = name;
  record.awardingBody = awardingBody;
  record.sourceType = classifyAwardingBody(awardingBody);
  record.coverage = extractCoverage(text);
  record.eligibility = extractEligibility(text);

  const deadline = extractDeadline(text);
  record.application.url = sourceUrl;
  record.application.deadline = deadline.iso;
  record.application.deadlineType = deadline.type;
  record.application.deadlineRaw = deadline.raw;

  const now = new Date().toISOString();
  const confidence = computeConfidence(record);
  const needsVerification = computeNeedsVerification(record);
  record.provenance.sourceUrl = sourceUrl;
  record.provenance.scrapedAt = now;
  record.provenance.sourceType = "scraped";
  record.provenance.confidenceScore = confidence;
  record.provenance.flaggedFields = needsVerification;
  record.source.sourceUrl = sourceUrl;
  record.source.scrapedAt = now;
  record.source.verified = false;
  record.source.rawText = text.slice(0, 2000);
  record.source.confidence = confidence;
  record.source.needsVerification = needsVerification;

  record.status = deadline.type === "rolling" ? "open" : record.application.deadline ? "open" : "unknown";
  record.urgency = computeUrgency(deadline.iso);

  return record;
}
