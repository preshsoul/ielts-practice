import { createEmptyScholarship } from "./scholarship-schema.mjs";
import {
  cleanScholarshipName,
  generateScholarshipId,
  normalizeText,
  normalizeUrl,
  pickFirst,
  titleCase,
} from "../src/lib/scholarshipContract.js";

const MONEY_RE = /£\s?([\d,]+(?:\.\d+)?)\s?(k|thousand|million|m)?\b/gi;
const ORDINAL_RE = /\b(\d{1,2})(?:st|nd|rd|th)\b/gi;
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

const DEADLINE_PATTERNS = [
  /\b(?:deadline|closing date|apply by|applications?\s+close|final date|closes on|submit by)\b/i,
  /\b(?:open until|applications?\s+are open until)\b/i,
];

const FAQ_CUES = /\b(frequently asked questions?|faq|questions? and answers?)\b/i;
const ROLLING_CUES = /\b(rolling|ongoing|year[- ]round|continuous|no deadline|applications? are open all year|open until filled)\b/i;
const CLOSED_CUES = /\b(applications?\s+(?:are\s+)?closed|closed for applications|deadline passed|now closed)\b/i;
const TBC_CUES = /\b(tbc|to be confirmed|to be announced|forthcoming|pending)\b/i;
const APPROX_CUES = /\b(early|mid|late|around|about|approximately|approx\.?|towards the end of)\b/i;
const SEASON_PATTERNS = [
  { pattern: /\bspring\s+(\d{4})\b/i, month: 4, day: 30, confidence: 0.45 },
  { pattern: /\bsummer\s+(\d{4})\b/i, month: 7, day: 31, confidence: 0.45 },
  { pattern: /\bautumn\s+(\d{4})\b/i, month: 10, day: 31, confidence: 0.45 },
  { pattern: /\bfall\s+(\d{4})\b/i, month: 10, day: 31, confidence: 0.45 },
  { pattern: /\bwinter\s+(\d{4})\b/i, month: 1, day: 31, confidence: 0.45 },
];

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function compactText(text) {
  return decodeEntities(String(text || "")).replace(/\s+/g, " ").trim();
}

function getMetaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return compactText(match[1]);
  }
  return "";
}

function getTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? compactText(titleMatch[1]) : "";
}

function getFirstHeading(html, tag) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i"));
  return match ? compactText(stripTags(match[1])) : "";
}

function getBreadcrumbText(html) {
  const breadcrumbMatch = html.match(/<nav[^>]*aria-label=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i);
  if (breadcrumbMatch) return compactText(stripTags(breadcrumbMatch[1]));

  const classMatch = html.match(/<[^>]+class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (classMatch) return compactText(stripTags(classMatch[1]));
  return "";
}

function getJsonLdNames(html) {
  const names = [];
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(html))) {
    const text = compactText(match[1]);
    if (!text) continue;
    try {
      const data = JSON.parse(text);
      const stack = Array.isArray(data) ? data : [data];
      for (const item of stack) {
        if (item && typeof item === "object") {
          if (typeof item.name === "string") names.push(compactText(item.name));
          if (Array.isArray(item["@graph"])) {
            for (const node of item["@graph"]) {
              if (node && typeof node.name === "string") names.push(compactText(node.name));
            }
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return names.filter(Boolean);
}

function getVisibleBodyText(html) {
  return compactText(stripTags(html));
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html))) {
    const href = normalizeUrl(match[1], baseUrl);
    if (!href) continue;
    const text = compactText(stripTags(match[2]));
    links.push({ href, text });
  }
  return links;
}

function scoreMoneyAmount(match) {
  const raw = match[1].replace(/,/g, "");
  const n = parseFloat(raw);
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "k" || suffix === "thousand") return Math.round(n * 1000);
  if (suffix === "m" || suffix === "million") return Math.round(n * 1000000);
  return Math.round(n);
}

function extractCoverage(text) {
  const moneyMatches = [...text.matchAll(MONEY_RE)];
  const amountGBP = moneyMatches.length ? scoreMoneyAmount(moneyMatches[0]) : null;
  const rawAmount = moneyMatches[0]?.[0] ?? null;

  const fullCues = /\bfull\s+(tuition|scholarship|funding|award)\b|\b100\s?%\s+(fee|tuition)\b/i.test(text);
  const tuition = /\b(tuition|fee\s+waiver|fee\s+discount|tuition\s+fee)\b/i.test(text);
  const stipend = /\b(stipend|living\s+(allowance|cost|expense)|maintenance\s+grant|living\s+grant)\b/i.test(text);
  const flights = /\b(flight|airfare|travel\s+allowance|travel\s+grant)\b/i.test(text);

  let type = "unknown";
  if (fullCues || (tuition && stipend)) type = "full";
  else if (tuition && !stipend) type = "tuition_only";
  else if (stipend && !tuition) type = "partial";

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

function normalizeDegreeClass(input) {
  const text = compactText(input).toLowerCase();
  if (!text) return "";
  if (/first|1st/.test(text)) return "1st";
  if (/2[:.]1|upper\s+second/.test(text)) return "2:1";
  if (/2[:.]2|lower\s+second/.test(text)) return "2:2";
  if (/third/.test(text)) return "third";
  return "";
}

function extractNationalitySignals(text) {
  const lowered = text.toLowerCase();
  const signals = new Set();

  if (/\b(any nationality|open to all|all nationalities|international students?)\b/i.test(lowered)) {
    signals.add("open");
  }

  const mappings = [
    { pattern: /\bnigerian(s)?\b/i, value: "Nigeria" },
    { pattern: /\bghanaian(s)?\b/i, value: "Ghana" },
    { pattern: /\bkenyan(s)?\b/i, value: "Kenya" },
    { pattern: /\bcommonwealth\b/i, value: "Commonwealth countries" },
    { pattern: /\b(ecowas|west african)\b/i, value: "ECOWAS" },
    { pattern: /\bsub-?saharan africa\b/i, value: "Sub-Saharan Africa" },
    { pattern: /\bdeveloping countries?\b/i, value: "Developing countries" },
    { pattern: /\bafrican students?\b/i, value: "Africa" },
  ];

  for (const entry of mappings) {
    if (entry.pattern.test(lowered)) signals.add(entry.value);
  }

  return {
    nationalities: [...signals].filter((value) => value !== "open"),
    nationalityIsOpen: signals.has("open") || signals.size === 0,
  };
}

function extractDisciplineSignals(text) {
  const lowered = text.toLowerCase();
  const disciplines = [];
  const patterns = [
    { pattern: /\bcomputer science\b|\bsoftware\b|\bdata science\b|\bmachine learning\b|\binformation systems\b/i, value: "Computer Science" },
    { pattern: /\bengineering\b|\bmechanical\b|\belectrical\b|\bcivil\b|\baerospace\b|\bchemical\b|\bmaterial\b/i, value: "Engineering" },
    { pattern: /\beducation\b|\bteaching\b|\bliteracy\b/i, value: "Education" },
    { pattern: /\bpublic health\b|\bnursing\b|\bmedicine\b|\bpharmacy\b|\bbiomedical\b/i, value: "Health Sciences" },
    { pattern: /\bbusiness\b|\bmanagement\b|\bfinance\b|\baccounting\b|\bmarketing\b|\bentrepreneurship\b/i, value: "Business" },
    { pattern: /\beconomics?\b/i, value: "Economics" },
    { pattern: /\blaw\b|\blegal\b/i, value: "Law" },
    { pattern: /\blinguistics\b|\blanguage\b|\btranslation\b/i, value: "Linguistics" },
    { pattern: /\barts?\b|\bhumanities\b|\bhistory\b|\bliterature\b|\bphilosophy\b|\banthropology\b/i, value: "Arts and Humanities" },
    { pattern: /\bagricultur|\bhorticultur|\bforestry\b|\bveterinary\b/i, value: "Agriculture" },
    { pattern: /\bscience\b|\bbiology\b|\bchemistry\b|\bphysics\b|\bmathematics?\b/i, value: "Sciences" },
  ];

  for (const entry of patterns) {
    if (entry.pattern.test(lowered)) disciplines.push(entry.value);
  }

  return [...new Set(disciplines)];
}

function extractEligibility(text) {
  const body = String(text || "");
  const normalized = body.toLowerCase();
  const nationalitySignals = extractNationalitySignals(body);
  const disciplineSignals = extractDisciplineSignals(body);
  const degreeClassMin = normalizeDegreeClass(body);
  const experienceYearsMin = extractExperience(body);

  const ieltsMatch = normalized.match(/\bielts(?:\s*[:\-]?\s*|\s+score\s+of\s+)?(\d(?:\.\d)?)\b/i);
  const toeflMatch = normalized.match(/\btoefl(?:\s*[:\-]?\s*|\s+score\s+of\s+)?(\d{2,3})\b/i);
  const celpipMatch = normalized.match(/\bcelpip(?:\s*[:\-]?\s*|\s+score\s+of\s+)?(\d{1,2})\b/i);

  return {
    nationalities: nationalitySignals.nationalities,
    nationalityIsOpen: nationalitySignals.nationalityIsOpen,
    disciplines: disciplineSignals,
    degreeClassMin,
    degreeClassRequired: degreeClassMin || null,
    ageLimitMin: null,
    ageLimitMax: null,
    workExperienceYearsMin: experienceYearsMin ?? 0,
    employmentStatusAtApplication: null,
    languageReqs: {
      ielts: ieltsMatch ? Number.parseFloat(ieltsMatch[1]) : null,
      toefl: toeflMatch ? Number.parseInt(toeflMatch[1], 10) : null,
      celpip: celpipMatch ? Number.parseInt(celpipMatch[1], 10) : null,
      exemptions: [],
    },
    refereesRequired: /\b(two|2)\s+references?\b/i.test(normalized) ? 2 : /\b(\d)\s+references?\b/i.test(normalized) ? Number.parseInt(normalized.match(/\b(\d)\s+references?\b/i)?.[1] || "0", 10) : 0,
    refereeCategories: [],
    targetInstitutions: [],
    targetProgrammes: [],
    notes: "",
  };
}

function summarizeRequirements(eligibility = {}, application = {}) {
  const parts = [];
  const nationalities = Array.isArray(eligibility.nationalities) ? eligibility.nationalities.filter(Boolean) : [];
  const disciplines = Array.isArray(eligibility.disciplines) ? eligibility.disciplines.filter(Boolean) : [];
  const docs = Array.isArray(application.requiredDocuments) ? application.requiredDocuments.filter(Boolean) : [];
  const languageReqs = eligibility.languageReqs || {};

  if (!eligibility.nationalityIsOpen && nationalities.length) {
    parts.push(`Open to ${nationalities.slice(0, 3).join(", ")}`);
  } else {
    parts.push("Open to international applicants");
  }

  if (eligibility.degreeClassMin) {
    parts.push(`Degree class: ${eligibility.degreeClassMin}`);
  }

  if (disciplines.length) {
    parts.push(`Field: ${disciplines.slice(0, 3).join(", ")}`);
  }

  if (Number.isFinite(Number(languageReqs.ielts)) && Number(languageReqs.ielts) > 0) {
    const band = Number(languageReqs.ielts);
    parts.push(`IELTS ${Number.isInteger(band) ? band.toFixed(0) : band.toFixed(1)}`);
  }

  if (eligibility.workExperienceYearsMin) {
    parts.push(`Experience: ${eligibility.workExperienceYearsMin}+ years`);
  }

  if (docs.length) {
    parts.push(`Documents: ${docs.slice(0, 3).join(", ")}`);
  }

  return parts.join(" • ");
}

function extractExperience(text) {
  const lowered = text.toLowerCase();
  const yearsMatch = lowered.match(/\b(?:at least|minimum|min\.?|with)?\s*(\d{1,2})\s+(?:years?|yrs?)\s+(?:of\s+)?(?:work|research|relevant)?\s*experience\b/i);
  if (yearsMatch?.[1]) return Number.parseInt(yearsMatch[1], 10);
  if (/\brecent graduates?\b|\bnew graduates?\b|\bno experience required\b/i.test(lowered)) return 0;
  return null;
}

function parseIsoDate(day, month, year) {
  const d = new Date(Date.UTC(Number(year), Number(month), Number(day)));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseMatchedDate(match) {
  const day = Number.parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number.parseInt(match[3], 10);
  return parseIsoDate(day, month, year);
}

function deadlineWindowScore(text, index) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 80);
  return text.slice(start, end);
}

function extractDeadline(text) {
  const lowered = text.toLowerCase();

  if (ROLLING_CUES.test(lowered)) {
    return { iso: null, type: "rolling", raw: "Rolling", isApproximate: false, approximationConfidence: 1 };
  }

  if (CLOSED_CUES.test(lowered)) {
    return { iso: null, type: "closed", raw: "Closed", isApproximate: false, approximationConfidence: 1 };
  }

  if (TBC_CUES.test(lowered)) {
    return { iso: null, type: "unknown", raw: "TBC", isApproximate: true, approximationConfidence: 0.1 };
  }

  for (const season of SEASON_PATTERNS) {
    const match = lowered.match(season.pattern);
    if (match) {
      return {
        iso: parseIsoDate(season.day, season.month, match[1]),
        type: "estimated",
        raw: titleCase(match[0]),
        isApproximate: true,
        approximationConfidence: season.confidence,
      };
    }
  }

  const datePatterns = [
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/gi,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi,
  ];

  for (const pattern of datePatterns) {
    let match;
    while ((match = pattern.exec(lowered))) {
      const normalized = pattern === datePatterns[0]
        ? [match[0], match[1], match[2], match[3]]
        : [match[0], match[2], match[1], match[3]];
      const window = deadlineWindowScore(lowered, match.index || 0);
      if (DEADLINE_PATTERNS.some((cue) => cue.test(window))) {
        return {
          iso: parseMatchedDate(normalized),
          type: "fixed",
          raw: compactText(match[0]),
          isApproximate: APPROX_CUES.test(window),
          approximationConfidence: APPROX_CUES.test(window) ? 0.6 : 1,
        };
      }
    }
  }

  return { iso: null, type: "unknown", raw: null, isApproximate: false, approximationConfidence: 0 };
}

function classifyPageType({ title, bodyText, sourceUrl }) {
  const haystack = `${title} ${bodyText.slice(0, 1000)} ${sourceUrl}`.toLowerCase();
  if (/\blogin\b|\bsign up\b|\bregister\b/.test(haystack)) return "login";
  if (FAQ_CUES.test(haystack)) return "faq";
  if (ROLLING_CUES.test(haystack)) return "detail";
  if (/\bapply now\b|\bdeadline\b|\beligibility\b|\bfunding\b|\baward\b/.test(haystack) && /\brequirements?\b/.test(haystack)) return "detail";
  if (/\bcategory\b|\ball scholarships\b|\bfind scholarships\b|\blist of scholarships\b|\bpositions\b/.test(haystack)) return "listing";
  if (/\bnews\b|\bblog\b|\bannouncement\b/.test(haystack) && !/\bapply\b/.test(haystack)) return "news";
  if (/\bpdf\b/.test(sourceUrl)) return "pdf";
  return "unknown";
}

function extractNameSignals(html, sourceUrl, sourceLabel, title) {
  const metaTitle = getMetaContent(html, "title") || getMetaContent(html, "og:title");
  const jsonLdNames = getJsonLdNames(html);
  const h1 = getFirstHeading(html, "h1");
  const h2 = getFirstHeading(html, "h2");
  const breadcrumb = getBreadcrumbText(html);
  const bodyText = getVisibleBodyText(html);
  const urlPathName = titleCase(decodeURIComponent(new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() || ""));
  const fallback = pickFirst(metaTitle, title, h1, h2, breadcrumb, urlPathName, sourceLabel);
  const fromJsonLd = jsonLdNames.find(Boolean) || "";

  return {
    raw: pickFirst(fromJsonLd, metaTitle, title, h1, h2, breadcrumb, urlPathName, sourceLabel),
    title: title || "",
    metaTitle,
    jsonLd: fromJsonLd,
    h1,
    h2,
    breadcrumb,
    bodyText,
    fallback,
    urlPathName,
  };
}

function cleanApplicationLink(link) {
  return normalizeUrl(link || "");
}

function extractApplicationLink(html, baseUrl) {
  const links = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html))) {
    const href = cleanApplicationLink(new URL(match[1], baseUrl).href);
    if (!href) continue;
    const text = compactText(stripTags(match[2]));
    if (!/\bapply\b|\bapplication\b|\bportal\b|\bdetails\b|\bview scholarship\b|\bopen scholarship\b/i.test(text) && !/\bapply\b|\bapplication\b|\bportal\b|\blogin\b/i.test(href)) {
      continue;
    }
    links.push({ href, text });
  }

  const best = links
    .map((link) => ({
      ...link,
      score: [
        /\bapply\b/i.test(link.text) ? 3 : 0,
        /\bapplication\b/i.test(link.text) ? 3 : 0,
        /\bportal\b/i.test(link.text) ? 3 : 0,
        /\blogin\b/i.test(link.href) ? 1 : 0,
      ].reduce((sum, value) => sum + value, 0),
    }))
    .sort((a, b) => b.score - a.score)[0];

  return best?.href || null;
}

function computeConfidence(record) {
  let c = 0;
  if (record.name && record.name.length > 10) c += 0.18;
  if (record.coverage.numericAmount || record.coverage.amountGBP) c += 0.25;
  if (record.application.deadline || record.application.deadlineType === "rolling") c += 0.2;
  if (record.eligibility.degreeClassMin || record.eligibility.nationalities.length || record.eligibility.disciplines.length) c += 0.17;
  if (record.application.url) c += 0.2;
  return Math.min(1, c);
}

function computeNeedsVerification(record) {
  const missing = [];
  if (!record.coverage.amountGBP && record.coverage.type === "unknown") missing.push("amount");
  if (!record.application.deadline && record.application.deadlineType !== "rolling" && record.application.deadlineType !== "closed") missing.push("deadline");
  if (!record.eligibility.nationalityIsOpen && !record.eligibility.nationalities.length) missing.push("eligibility");
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

function classifyAwardingBody(body) {
  if (!body) return "unknown";
  const s = body.toLowerCase();
  if (/universit|college|institute|school/.test(s)) return "university";
  if (/government|ministry|council|commonwealth|chevening/.test(s)) return "government";
  if (/foundation|trust|charity/.test(s)) return "foundation";
  if (/corporat|company|firm/.test(s)) return "corporate";
  return "unknown";
}

export function extractScholarship({ html, sourceUrl, sourceLabel, title, applicationLink = null, contentText = null }) {
  const record = createEmptyScholarship();
  const htmlText = stripTags(html);
  const scopedText = compactText(contentText || htmlText);
  const pageType = classifyPageType({ title: title || "", bodyText: scopedText, sourceUrl });
  const nameSignals = extractNameSignals(html, sourceUrl, sourceLabel, title);
  const rawName = nameSignals.raw || nameSignals.fallback || sourceLabel || sourceUrl;
  const name = cleanScholarshipName(rawName, sourceLabel) || titleCase(nameSignals.urlPathName || sourceLabel || "Untitled Scholarship");
  const sourceNormalized = normalizeUrl(sourceUrl);
  const awardingBody = cleanScholarshipName(sourceLabel || new URL(sourceNormalized).hostname.replace(/^www\./, ""), "") || sourceLabel || new URL(sourceNormalized).hostname.replace(/^www\./, "");

  record.id = generateScholarshipId(sourceNormalized, awardingBody) || `${awardingBody}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  record.name = name;
  record.awardingBody = awardingBody;
  record.sourceType = classifyAwardingBody(awardingBody);
  record.coverage = extractCoverage(scopedText);
  record.eligibility = {
    ...record.eligibility,
    ...extractEligibility(scopedText),
  };

  const deadline = extractDeadline(scopedText);
  const applicationUrl = sourceNormalized;
  const portal = cleanApplicationLink(applicationLink || extractApplicationLink(html, sourceNormalized) || "");

  record.application.url = applicationUrl;
  record.application.portal = portal || null;
  record.application.deadline = deadline.iso;
  record.application.deadlineType = deadline.type;
  record.application.deadlineRaw = deadline.raw;
  record.application.deadlineIsApproximate = Boolean(deadline.isApproximate);
  record.application.deadlineApproximationConfidence = deadline.approximationConfidence;
  record.application.pageType = pageType;
  record.application.pageTitle = nameSignals.title || null;
  record.requirementsSummary = summarizeRequirements(record.eligibility, record.application);

  record.id = generateScholarshipId(sourceNormalized, awardingBody) || record.id;
  record.nameFull = rawName;
  record.name_full = rawName;
  record.displayName = titleCase(record.name);

  const now = new Date().toISOString();
  const confidence = computeConfidence(record);
  const needsVerification = computeNeedsVerification(record);

  record.provenance.sourceUrl = sourceNormalized;
  record.provenance.scrapedAt = now;
  record.provenance.sourceType = "scraped";
  record.provenance.confidenceScore = confidence;
  record.provenance.flaggedFields = needsVerification;

  record.source.sourceUrl = sourceNormalized;
  record.source.sourceLabel = sourceLabel || "";
  record.source.scrapedAt = now;
  record.source.verified = false;
  record.source.rawText = scopedText.slice(0, 2000);
  record.source.confidence = confidence;
  record.source.needsVerification = needsVerification;
  record.source.pageType = pageType;
  record.source.pageTitle = nameSignals.title || "";
  record.source.discoveryNotes = "";

  record.status = deadline.type === "rolling" ? "open" : record.application.deadline ? "open" : pageType === "listing" ? "unknown" : "unknown";
  record.urgency = computeUrgency(deadline.iso);

  return record;
}
