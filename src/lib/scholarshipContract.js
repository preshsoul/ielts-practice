const TRACKING_PARAMS = new Set([
  "ref",
  "source",
  "fbclid",
  "gclid",
  "msclkid",
]);

const NOISE_PREFIXES = [
  "apply for ",
  "information about ",
  "about the ",
  "download information on ",
  "click here to apply for the ",
];

const NOISE_SUFFIXES = [
  " | scholarships office",
  " | scholarship office",
  " | scholarship region",
  " | scholarships cafe",
  " :: apply now",
  " - scholarships office",
  " - scholarship office",
  " - scholarships",
  " - apply now",
  " - scholarship region",
  " - scholarships cafe",
];

const GENERIC_TITLE_EXACT = new Set([
  "scholarship",
  "scholarships",
  "scholarship region",
  "funding options",
  "current scholars",
  "faq",
  "application timeline",
  "find a course",
]);

const GENERIC_TITLE_FRAGMENTS = [
  "who can apply",
  "eligibility for",
  "host a chevening fellowship",
  "application form",
  "scholarship announcements",
  "information for scholarship",
  "frequently asked questions",
  "where to apply",
  "application timeline",
  "find a course",
];

function normalizeText(input) {
  return String(input || "")
    .replace(/&amp;|&#38;|&#038;/g, "&")
    .replace(/['’"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(rawUrl, baseUrl = null) {
  try {
    const url = new URL(rawUrl, baseUrl || undefined);
    // Block dangerous protocols that can execute JavaScript
    const protocol = (url.protocol || "").toLowerCase().replace(/:$/, "");
    if (protocol === "javascript" || protocol === "data" || protocol === "vbscript") {
      return "";
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lowered = key.toLowerCase();
      if (lowered.startsWith("utm_") || TRACKING_PARAMS.has(lowered)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function titleCase(input) {
  const preserved = new Set(["UK", "USA", "US", "EU", "UN", "ECOWAS", "NYSC", "CGPA"]);
  return normalizeText(input)
    .split(" ")
    .map((token) => {
      if (!token) return token;
      if (preserved.has(token.toUpperCase())) return token.toUpperCase();
      if (/^[A-Z0-9]{2,6}$/.test(token)) return token.toUpperCase();
      const lower = token.toLowerCase();
      if (lower === "phd") return "PhD";
      if (lower === "msc") return "MSc";
      if (lower === "mba") return "MBA";
      if (lower === "ielts") return "IELTS";
      if (lower === "toefl") return "TOEFL";
      if (lower === "pte") return "PTE";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanScholarshipName(rawName, sourceLabel = "") {
  let value = normalizeText(rawName);
  if (!value) return "";

  const lowered = value.toLowerCase();
  for (const prefix of NOISE_PREFIXES) {
    if (lowered.startsWith(prefix)) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }

  for (const suffix of NOISE_SUFFIXES) {
    if (lowered.endsWith(suffix)) {
      value = value.slice(0, value.length - suffix.length).trim();
      break;
    }
  }

  const label = normalizeText(sourceLabel);
  if (label) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    value = value.replace(new RegExp(`\\s*[\\-|:|\\|]{1}\\s*${escapedLabel}$`, "i"), "");
    value = value.replace(new RegExp(`^${escapedLabel}\\s*[\\-|:|\\|]\\s*`, "i"), "");
  }

  value = value
    .replace(/\s+\d{4}(?:\/\d{2})?$/g, "")
    .replace(/\s+\d{4}\s+applications?$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  value = value.replace(/\s*&\s*/g, " and ");
  return titleCase(value);
}

function isGenericScholarshipName(rawName, sourceLabel = "") {
  const value = normalizeText(rawName).toLowerCase();
  const label = normalizeText(sourceLabel).toLowerCase();
  if (!value) return true;
  if (GENERIC_TITLE_EXACT.has(value)) return true;
  if (label && value === label) return true;
  if (GENERIC_TITLE_FRAGMENTS.some((fragment) => value.includes(fragment))) return true;
  return false;
}

function canonicalizeScholarshipName(rawName, sourceLabel = "") {
  const cleaned = cleanScholarshipName(rawName, sourceLabel).toLowerCase();
  if (!cleaned) return "";
  return cleaned
    .replace(/^(who can apply for|eligibility for|apply for|information about)\s+/i, "")
    .replace(/\?+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(input) {
  return normalizeText(input)
    .toLowerCase()
    .replace(/['’"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function generateScholarshipId(sourceUrl, fundingBody) {
  const canonical = normalizeUrl(sourceUrl);
  if (!canonical) return "";
  try {
    const url = new URL(canonical);
    const bodySlug = slugify(fundingBody || "unknown") || "unknown";
    const pathSlug = slugify(url.pathname.replace(/\//g, "-")) || "root";
    return `${url.hostname}_${bodySlug}_${pathSlug}`.slice(0, 120);
  } catch {
    return "";
  }
}

function truncateName(name, maxLength = 80) {
  const value = normalizeText(name);
  if (value.length <= maxLength) return value;
  const truncated = value.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 60 ? `${truncated.slice(0, lastSpace)}…` : `${truncated}…`;
}

function pickFirst(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

export {
  canonicalizeScholarshipName,
  cleanScholarshipName,
  generateScholarshipId,
  isGenericScholarshipName,
  normalizeText,
  normalizeUrl,
  pickFirst,
  slugify,
  titleCase,
  truncateName,
};
