import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractScholarship, verifyInternationalEligibility, verifyScholarshipQuality } from "./scholarship-extractor.mjs";
import { validateScholarship } from "./scholarship-schema.mjs";
import { writeScholarshipReviewQueue } from "./lib/scholarship-scraper/writer.js";
import { normalizeUrl as normalizeScholarshipUrl } from "../src/lib/scholarshipContract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourcesPath = process.env.SOURCES_PATH || join(root, "content", "scholarship-sources.json");
const outPrefix = process.env.SCHOLARSHIP_OUTPUT_PREFIX || "";
const reviewQueuePath = join(root, "content", outPrefix + "scholarships.review.json");
const validationFailuresPath = join(root, "content", outPrefix + "validation-failures.json");
const deadLinksPath = join(root, "content", outPrefix + "dead-links.json");
const candidateBankPath = join(root, "content", outPrefix + "scholarship-candidates.json");
const sourceMetricsPath = join(root, "content", outPrefix + "scholarship-source-metrics.json");
const wanted = /scholar|fund|funding|award|bursar|grant|fellow|fellowship|studentship|position|opportunity/i;
const blockedPathPatterns = [
  "/login",
  "/signin",
  "/sign-in",
  "/register",
  "/signup",
  "/sign-up",
  "/account",
  "/admin",
  "/wp-admin",
  "/contact",
  "/privacy",
  "/cookie",
  "/terms",
  "/sitemap",
  "/search",
  "/feed",
  "/rss",
];
const blockedExtensions = [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".css", ".js", ".zip", ".rar", ".7z", ".mp4", ".mp3"];
const deadLinkState = new Map();
const robotsCache = new Map();
const lastRequestAtByDomain = new Map();
const defaultDomainDelayMs = 1000;
let browserInstance = null;
let browserContext = null;
const deadLinks = [];

function getSourceProfile(source = {}, currentUrl = "") {
  let hostname = "";
  try {
    hostname = new URL(source.url || currentUrl).hostname.replace(/^www\./, "");
  } catch {
    hostname = "";
  }

  if (hostname === "scholarshipscafe.com") {
      return {
        kind: "scholarshipscafe",
        listingContainer: ".opportunity_data",
        listingLink: "a.position_click_btn",
        title: "h2",
        provider: "h2",
        content: ".description span:first-child",
        deadline: ".field_list",
        applyLink: ".nav_btns a.custom_btn.back",
      };
  }

  if (hostname === "scholarshipregion.com") {
    return {
      kind: "scholarshipregion",
      brand: "Scholarship Region",
      listingContainer: ".tdb_module_loop, .td-module-container",
      listingLink: ".td-module-title a, .td-module-thumb a, a[rel='bookmark']",
      title: ".tdb-title-text, .entry-title a",
      provider: ".tdb-author-name",
      content: ".td-post-content, .elementor-widget-text-editor",
      deadline: ".elementor-widget-text-editor li",
      applyLink: "a[href*='apply'], a[href*='application']",
    };
  }

  if (hostname === "chevening.org") {
    return {
      kind: "chevening",
      brand: "Chevening",
      listingContainer: "main",
      listingLink: "a[href*='/scholarship'], a[href*='/fellowship/']",
      title: ".pagehero-title, h1",
      provider: ".pagehero-kicker, .site-header__logo-text",
      content: ".pagehero-summary, .accordion-description.content, .page-content, main",
      applyLink: "a.btn.button[href*='/apply'], a[href*='/apply']",
      useSourcePageAsApplication: true,
    };
  }

  if (hostname === "cambridgetrust.org") {
    return {
      kind: "cambridge-trust",
      brand: "Cambridge Trust",
      listingContainer: ".scholarship-card, .scholarships-listing, main",
      listingLink: ".scholarship-info h3 a, a[href*='/scholarship/']",
      title: ".scholarship-info h3, h1",
      provider: "h1",
      content: ".scholarship-info p, .scholarships-listing, main",
      applyLink: "a[href*='postgraduate-applicants'], a[href*='undergraduate-applicants'], a[href*='/apply']",
      useSourcePageAsApplication: true,
    };
  }

  if (hostname === "www2.daad.de" || hostname === "daad.de") {
    return {
      kind: "daad",
      brand: "DAAD",
      listingContainer: "main, body",
      listingLink: "a[href*='detail=']",
      title: "h2.title, h1",
      provider: "meta[name='author']",
      content: "h2.title, .tab-content, #select-application-info, main, body",
      applyLink: "a[href*='bewerbung'], a[href*='application'], a[href*='stipdb'], a[href*='apply']",
      applyForm: "#select-application-info-form",
      useSourcePageAsApplication: true,
    };
  }

  if (hostname === "foreign.fulbrightonline.org") {
    return {
      kind: "fulbright",
      brand: "Fulbright",
      listingContainer: "main, body",
      listingLink: "a[href*='/apply'], a[href*='embassy'], a[href*='commission']",
      title: "h1, .page-title",
      provider: "h1",
      content: "main, .content, body",
      applyLink: "a[href*='/apply'], a[href*='embassy'], a[href*='commission']",
    };
  }

  if (hostname === "studyinjapan.go.jp") {
    return {
      kind: "mext",
      brand: "MEXT",
      listingContainer: "main, body",
      listingLink: "a[href*='embassy'], a[href*='university'], a[href*='guideline']",
      title: "h2, h1",
      provider: "h2, h1",
      content: "main, .contents, body",
      applyLink: "a[href*='embassy'], a[href*='university'], a[href*='guideline']",
      useSourcePageAsApplication: true,
    };
  }

  if (hostname === "study.ed.ac.uk") {
    return {
      kind: "edinburgh",
      brand: "University of Edinburgh",
      listingContainer: "main, article, body",
      listingLink: "a[href*='scholarship'], a[href*='student-funding'], a[href*='funding']",
      title: "h1",
      provider: "h1",
      content: "main, article, body",
      applyLink: "a[href*='student-funding'], a[href*='scholarship'], a[href*='funding']",
      useSourcePageAsApplication: true,
    };
  }

  if (String(source?.source_type || "").toLowerCase() === "official_university_directory") {
    return {
      kind: "generic-university",
      brand: source.label || hostname,
      listingContainer: "main, article, body",
      listingLink: "a[href*='scholarship'], a[href*='funding'], a[href*='studentship'], a[href*='bursary'], a[href*='award'], a[href*='fellowship']",
      title: "h1, .page-title, .hero__title",
      provider: "h1, .page-title, .hero__title",
      content: "main, article, body",
      applyLink: "a[href*='apply'], a[href*='application'], a[href*='admission'], a[href*='funding'], a[href*='scholarship']",
      useSourcePageAsApplication: true,
    };
  }

  return null;
}

function extractPrimaryText(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isInternalSiteLink(href, origin) {
  try {
    return new URL(href).origin === origin;
  } catch {
    return false;
  }
}

function isScholarshipSignal(text = "", href = "") {
  const haystack = `${text} ${href}`.toLowerCase();
  return /\bscholar|fund|funding|award|grant|fellow|fellowship|studentship|bursar|opportunity|position\b/.test(haystack);
}

function isValidScholarshipCandidate(text = "", href = "", origin = "") {
  const loweredText = String(text || "").toLowerCase();
  if (loweredText.includes("scholarship")) return true;
  if (!href) return false;
  return !isInternalSiteLink(href, origin) || isScholarshipSignal(text, href);
}

async function ensureBrowserContext() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
    browserContext = await browserInstance.newContext({
      userAgent: "Mozilla/5.0 (Codex Scholarship Crawler; +https://openai.com)",
    });
  }
  return browserContext;
}

async function parseDocumentWithProfile(html, baseUrl, source) {
  const profile = getSourceProfile(source, baseUrl);
  if (!profile) {
    return {
      profile: null,
      title: extractTitle(html),
      provider: "",
      contentText: bodyText(html, 6000),
      primaryLink: null,
      deadlineText: "",
      candidateLinks: [],
    };
  }

  const context = await ensureBrowserContext();
  const page = await context.newPage();
  try {
    return await page.evaluate(
      ({ html, baseUrl, profile }) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const normalize = (href) => {
          try {
            return new URL(href, baseUrl).href;
          } catch {
            return null;
          }
        };
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const first = (selectors, root = doc) => {
          if (!selectors) return null;
          for (const selector of String(selectors).split(",").map((item) => item.trim()).filter(Boolean)) {
            const node = root.querySelector(selector);
            if (node) return node;
          }
          return null;
        };
        const collect = (selectors, root = doc) => {
          if (!selectors) return [];
          const items = [];
          for (const selector of String(selectors).split(",").map((item) => item.trim()).filter(Boolean)) {
            items.push(...root.querySelectorAll(selector));
          }
          return items;
        };
        const text = (selectors, root = doc) => clean(first(selectors, root)?.textContent || "");
        const preferredRoot = first(profile.content) || first(profile.listingContainer) || doc.body || doc.documentElement;
        const titleNode = first(profile.title) || first("meta[property='og:title']") || first("title");
        const title = clean(titleNode?.textContent || titleNode?.getAttribute?.("content") || doc.title || "");
        const provider = clean(text(profile.provider, doc));
        const contentText = clean((preferredRoot || doc.body || doc.documentElement)?.textContent || "");
        const deadlineText = clean(text(profile.deadline, doc));
        const linkNodes = profile.listingContainer
          ? collect(profile.listingContainer, doc)
          : [preferredRoot || doc.body || doc.documentElement].filter(Boolean);
        const candidateLinks = [];
        for (const rootNode of linkNodes) {
          const anchors = collect(profile.listingLink, rootNode);
          for (const anchor of anchors) {
            const href = normalize(anchor.getAttribute("href"));
            if (!href) continue;
            const linkText = clean(anchor.textContent || "");
            const containerText = clean(rootNode.textContent || "");
            candidateLinks.push({ href, text: linkText, containerText });
          }
        }
        const primaryLinkNode = first(profile.applyLink) || first(profile.listingLink) || null;
        const formNode = first(profile.applyForm) || null;
        const primaryLink = primaryLinkNode
          ? normalize(primaryLinkNode.getAttribute("href"))
          : formNode
            ? normalize(formNode.getAttribute("action"))
            : null;
        return {
          profile,
          title,
          provider,
          contentText,
          deadlineText,
          primaryLink,
          candidateLinks,
        };
      },
      { html, baseUrl, profile }
    );
  } finally {
    await page.close();
  }
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || crypto.randomUUID();
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textSnippet(html, max = 220) {
  return decodeEntities(stripTags(html).replace(/\s+/g, " ").trim()).slice(0, max);
}

function bodyText(html, max = 6000) {
  return decodeEntities(stripTags(html).replace(/\s+/g, " ").trim()).slice(0, max);
}

function absoluteUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function toPatternList(value = []) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function getSourceStrategy(source = {}) {
  const strategy = source.strategy || {};
  return {
    entryPaths: toPatternList(strategy.entryPaths),
    entryUrls: toPatternList(strategy.entryUrls),
    followPatterns: toPatternList(strategy.followPatterns),
    applicationPatterns: toPatternList(strategy.applicationPatterns),
    priorityPatterns: toPatternList(strategy.priorityPatterns),
    ignorePatterns: toPatternList(strategy.ignorePatterns),
    allowUrlPatterns: toPatternList(strategy.allowUrlPatterns),
    denyUrlPatterns: toPatternList(strategy.denyUrlPatterns),
    allowPathPatterns: toPatternList(strategy.allowPathPatterns),
    denyPathPatterns: toPatternList(strategy.denyPathPatterns),
    maxPages: Number.isFinite(Number(strategy.maxPages)) ? Number(strategy.maxPages) : 20,
    maxDepth: Number.isFinite(Number(strategy.maxDepth)) ? Number(strategy.maxDepth) : 2,
    priorityBonus: Number.isFinite(Number(strategy.priorityBonus)) ? Number(strategy.priorityBonus) : 0,
  };
}

function matchesPatternList(value, patterns = []) {
  const text = String(value || "").toLowerCase();
  return patterns.some((pattern) => text.includes(String(pattern || "").toLowerCase()));
}

function urlMatchesPatternList(value, patterns = []) {
  const text = String(value || "").toLowerCase();
  return patterns.some((pattern) => text.includes(String(pattern || "").toLowerCase()));
}

function pathMatches(url, patterns = []) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return patterns.some((pattern) => {
      const normalized = String(pattern || "").toLowerCase().replace(/\*/g, "");
      return normalized ? path.includes(normalized.replace(/^\//, "")) : false;
    });
  } catch {
    return false;
  }
}

function matchesUrlPolicy(url, strategy = {}) {
  if (!url) return false;
  if (Array.isArray(strategy.denyUrlPatterns) && strategy.denyUrlPatterns.length && urlMatchesPatternList(url, strategy.denyUrlPatterns)) {
    return false;
  }
  if (Array.isArray(strategy.denyPathPatterns) && strategy.denyPathPatterns.length && pathMatches(url, strategy.denyPathPatterns)) {
    return false;
  }
  if (Array.isArray(strategy.allowUrlPatterns) && strategy.allowUrlPatterns.length) {
    return urlMatchesPatternList(url, strategy.allowUrlPatterns) || pathMatches(url, strategy.entryPaths);
  }
  if (Array.isArray(strategy.allowPathPatterns) && strategy.allowPathPatterns.length) {
    return pathMatches(url, strategy.allowPathPatterns) || pathMatches(url, strategy.entryPaths);
  }
  return true;
}

function normalizeQueuedUrl(rawUrl, baseUrl) {
  try {
    return normalizeUrl(rawUrl, baseUrl);
  } catch {
    return null;
  }
}

function isBlockedExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return blockedExtensions.some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}

function isBlockedPath(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return blockedPathPatterns.some((pattern) => path.includes(pattern));
  } catch {
    return false;
  }
}

function isPermanentDeadLinkEntry(entry = {}) {
  const errorText = String(entry?.error || "").toLowerCase();
  if (!errorText) return false;
  if (/timeout|err_connection_reset|err_http2_protocol_error|err_internet_disconnected|err_cert_date_invalid|access denied|bot traffic blocked/.test(errorText)) {
    return false;
  }
  return /404|410|not found|unsupported content-type|known-dead-link|download is starting/.test(errorText);
}

function isDeadLinkUrl(url) {
  const entry = deadLinkState.get(url);
  return Boolean(entry && isPermanentDeadLinkEntry(entry));
}

async function loadDeadLinkState() {
  try {
    const raw = await readFile(deadLinksPath, "utf8");
    const parsed = JSON.parse(raw);
    const existing = Array.isArray(parsed?.deadLinks) ? parsed.deadLinks : [];
    for (const entry of existing) {
      if (entry?.url) {
        deadLinkState.set(normalizeQueuedUrl(entry.url) || entry.url, entry);
      }
    }
  } catch {
    return;
  }
}

function parseRobotsRules(rawText) {
  const rules = [];
  const lines = String(rawText || "").split(/\r?\n/);
  let groupAgents = [];
  let groupDisallows = [];

  const flushGroup = () => {
    if (groupAgents.includes("*")) {
      rules.push(...groupDisallows);
    }
    groupAgents = [];
    groupDisallows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      if (!line) flushGroup();
      continue;
    }
    if (!line.includes(":")) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey === "user-agent") {
      groupAgents.push(value.toLowerCase());
      continue;
    }
    if (normalizedKey === "disallow" && value) {
      groupDisallows.push(value.toLowerCase());
    }
  }

  flushGroup();
  return rules;
}

async function canFetchUrl(url) {
  if (!url) return { allowed: false, reason: "missing-url" };
  if (isBlockedExtension(url)) return { allowed: false, reason: "blocked-extension" };
  if (isBlockedPath(url)) return { allowed: false, reason: "blocked-path" };
  if (isDeadLinkUrl(url)) return { allowed: false, reason: "known-dead-link" };

  const parsed = new URL(url);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  let disallowedRules = robotsCache.get(parsed.origin);
  if (!disallowedRules) {
    try {
      const response = await fetch(robotsUrl, {
        headers: {
          "user-agent": "Mozilla/5.0 (Codex Scholarship Crawler; +https://openai.com)",
          accept: "text/plain,*/*;q=0.1",
        },
      });
      if (response.ok) {
        disallowedRules = parseRobotsRules(await response.text());
      } else {
        disallowedRules = [];
      }
    } catch {
      disallowedRules = [];
    }
    robotsCache.set(parsed.origin, disallowedRules);
  }

  const pathname = parsed.pathname.toLowerCase();
  if (disallowedRules.some((rule) => rule === "/" || (rule && pathname.startsWith(rule)))) {
    return { allowed: false, reason: "robots-disallow" };
  }

  return { allowed: true };
}

async function paceDomain(url, delayMs = defaultDomainDelayMs) {
  const domain = new URL(url).origin;
  const lastRequestAt = lastRequestAtByDomain.get(domain) || 0;
  const waitMs = lastRequestAt + delayMs - Date.now();
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastRequestAtByDomain.set(domain, Date.now());
}

function cleanText(value) {
  return decodeEntities(stripTags(String(value || ""))).replace(/\s+/g, " ").trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html))) {
    const href = absoluteUrl(match[1], baseUrl);
    if (!href) continue;
    const text = cleanText(match[2]);
    links.push({ href, text });
  }
  return links;
}

function scoreScholarshipLink(link, strategy = {}) {
  const haystack = `${link.href} ${link.text}`.toLowerCase();
  let score = 0;
  for (const token of ["scholar", "fund", "funding", "award", "bursar", "grant", "studentship", "bursary", "fellow", "fellowship", "position", "opportunity"]) {
    if (haystack.includes(token)) score += 2;
  }
  for (const token of strategy.priorityPatterns || []) {
    if (haystack.includes(token.toLowerCase())) score += 2;
  }
  if (haystack.includes("international")) score += 1;
  if (haystack.includes("graduate trainee") || haystack.includes("graduate program") || haystack.includes("graduate scheme")) score += 2;
  if (haystack.includes("postgraduate")) score += 1;
  if (/position-detail\?id=\d+/i.test(link.href)) score += 6;
  if (/\/positions(?:\/|$|\?)/i.test(link.href)) score += 5;
  if (/\/category\/scholarships\//i.test(link.href)) score += 4;
  score += Number(strategy.priorityBonus || 0);
  return score;
}

function normalizeUrl(rawUrl, baseUrl) {
  return normalizeScholarshipUrl(rawUrl, baseUrl);
}

function discoverLinksFromHtml(html, baseUrl) {
  return extractLinks(html, baseUrl)
    .map((link) => ({
      ...link,
      href: normalizeQueuedUrl(link.href),
    }))
    .filter((link) => link.href);
}

function scoreApplicationLink(link, strategy = {}) {
  const haystack = `${link.href} ${link.text}`.toLowerCase();
  let score = 0;
  for (const pattern of strategy.applicationPatterns || []) {
    if (haystack.includes(pattern.toLowerCase())) score += 3;
  }
  for (const pattern of strategy.priorityPatterns || []) {
    if (haystack.includes(pattern.toLowerCase())) score += 2;
  }
  if (/apply|application|deadline|portal|submit|details|open position|view scholarship/i.test(haystack)) score += 4;
  if (/login|sign\s*up|register/i.test(haystack)) score += 1;
  if (/application|apply|portal/i.test(link.href)) score += 1;
  score += Number(strategy.priorityBonus || 0);
  return score;
}

async function collectApplicationLink(html, baseUrl, source = {}, strategy = {}) {
  const structured = await parseDocumentWithProfile(html, baseUrl, source);
  if (structured?.primaryLink && isScholarshipSignal(structured.title, structured.primaryLink)) {
    return structured.primaryLink;
  }

  let origin = "";
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    origin = "";
  }

  const candidates = discoverLinksFromHtml(html, baseUrl)
    .filter((link) => !matchesPatternList(`${link.href} ${link.text}`, strategy.ignorePatterns))
    .filter((link) => matchesUrlPolicy(link.href, strategy))
    .filter((link) => isValidScholarshipCandidate(link.text, link.href, origin))
    .map((link) => ({
      ...link,
      score: scoreApplicationLink(link, strategy),
    }))
    .filter((link) => link.score >= 4);
  const best = candidates.sort((a, b) => b.score - a.score || scoreScholarshipLink(b) - scoreScholarshipLink(a))[0];
  return best?.href || structured?.primaryLink || null;
}

function scoreCandidateLink(link, strategy = {}) {
  const haystack = `${link.href} ${link.text}`.toLowerCase();
  let score = scoreScholarshipLink(link, strategy);
  for (const pattern of strategy.followPatterns || []) {
    if (haystack.includes(pattern.toLowerCase())) score += 3;
  }
  for (const pattern of strategy.priorityPatterns || []) {
    if (haystack.includes(pattern.toLowerCase())) score += 2;
  }
  if (matchesPatternList(haystack, strategy.ignorePatterns)) score -= 10;
  if (/page=\d+|\/page\/\d+/i.test(link.href)) score += 2;
  if (/position-detail\?id=\d+/i.test(link.href)) score += 6;
  if (/\/positions(?:\/|$|\?)/i.test(link.href)) score += 4;
  if (/\/category\/scholarships\//i.test(link.href)) score += 4;
  // University funding pages often use non-standard paths
  if (/\/(fees-and-funding|student-funding|funding|studentships|bursaries|awards)\//i.test(link.href)) score += 3;
  if (/\/(postgraduate|graduate|masters|phd|doctoral|research-degrees)\//i.test(link.href)) score += 2;
  return score;
}

async function fetchCambridgeScholarshipCards(strategy = {}) {
  const ajaxUrl = "https://www.cambridgetrust.org/wp-admin/admin-ajax.php";
  const pageLimit = Math.max(1, Math.min(6, Number(strategy.maxPages || 6)));
  const cards = [];

  for (let page = 1; page <= pageLimit; page += 1) {
    let payload = null;
    try {
      await paceDomain(ajaxUrl);
      const response = await fetch(ajaxUrl, {
        method: "POST",
        headers: {
          "user-agent": "Mozilla/5.0 (Codex Scholarship Crawler; +https://openai.com)",
          accept: "application/json,text/plain,*/*",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({
          action: "ct_fetch_scholarships",
          page: String(page),
        }),
      });
      if (!response.ok) break;
      payload = await response.json().catch(() => null);
    } catch {
      const context = await ensureBrowserContext();
      const browserPage = await context.newPage();
      try {
        await browserPage.goto("https://www.cambridgetrust.org/find-a-scholarship/", { waitUntil: "domcontentloaded", timeout: 15000 });
        payload = await browserPage.evaluate(async (currentPage) => {
          const response = await fetch("/wp-admin/admin-ajax.php", {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
              accept: "application/json,text/plain,*/*",
            },
            body: new URLSearchParams({
              action: "ct_fetch_scholarships",
              page: String(currentPage),
            }),
          });
          if (!response.ok) return null;
          return await response.json().catch(() => null);
        }, page);
      } finally {
        await browserPage.close();
      }
    }
    const html = payload?.data?.html || "";
    if (!html) break;
    cards.push(
      ...discoverLinksFromHtml(html, "https://www.cambridgetrust.org/find-a-scholarship/")
        .filter((link) => /\/scholarship\//i.test(link.href))
        .map((link) => ({ href: link.href, text: link.text, containerText: link.text }))
    );
  }

  return cards;
}

async function discoverCandidateUrls(source, html, currentUrl, strategy = {}) {
  const current = new URL(currentUrl);
  const origin = current.origin;
  const structured = await parseDocumentWithProfile(html, currentUrl, source);
  const profile = structured?.profile || getSourceProfile(source, currentUrl);
  const ajaxCandidateLinks = profile?.kind === "cambridge-trust" && /find-a-scholarship/i.test(currentUrl)
    ? await fetchCambridgeScholarshipCards(strategy)
    : [];
  const links = (structured?.candidateLinks?.length
    ? structured.candidateLinks
    : discoverLinksFromHtml(html, currentUrl).map((link) => ({ ...link, containerText: link.text })))
    .concat(ajaxCandidateLinks)
    .filter((link) => sameOrigin(link.href, origin))
    .filter((link) => !matchesPatternList(`${link.href} ${link.text} ${link.containerText || ""}`, strategy.ignorePatterns))
    .filter((link) => matchesUrlPolicy(link.href, strategy))
    .filter((link) => isValidScholarshipCandidate(link.text || link.containerText, link.href, origin))
    .map((link) => ({ ...link, score: scoreCandidateLink(link, strategy) }));

  const explicitEntryUrls = strategy.entryPaths
    .map((entryPath) => {
      try {
        return new URL(entryPath, origin).href;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const directLinks = links
    .filter((link) => link.score >= 4)
    .map((link) => link.href);

  const entryLinks = links
    .filter((link) => explicitEntryUrls.includes(link.href) || pathMatches(link.href, strategy.entryPaths))
    .map((link) => link.href);

  return [...new Set([...entryLinks, ...directLinks])].slice(0, strategy.maxPages);
}

async function fetchPage(url) {
  await paceDomain(url);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Codex Scholarship Crawler; +https://openai.com)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      const error = new Error(`Failed to fetch ${url}: ${response.status}`);
      error.status = response.status;
      error.finalUrl = response.url || url;
      throw error;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!/html|pdf/i.test(contentType) && !/text\/plain/i.test(contentType)) {
      const error = new Error(`Unsupported content-type for ${url}: ${contentType || "unknown"}`);
      error.contentType = contentType;
      error.finalUrl = response.url || url;
      throw error;
    }
    const body = contentType.toLowerCase().includes("pdf") ? "" : await response.text();
    return { html: body, contentType, finalUrl: response.url || url, source: "fetch" };
  } catch (error) {
    await ensureBrowserContext();
    const page = await browserContext.newPage();
    try {
      await paceDomain(url);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      const html = await page.content();
      return { html, contentType: "text/html", finalUrl: page.url(), source: "browser" };
    } finally {
      await page.close();
    }
  }
}

async function enqueueDiscoveredUrls({ source, html, canonicalPageUrl, strategy, depth, candidateQueue, seen, queued }) {
  if (depth >= strategy.maxDepth || candidateQueue.length >= strategy.maxPages) {
    return;
  }

  const discovered = await discoverCandidateUrls(source, html, canonicalPageUrl, strategy);
  for (const discoveredUrl of discovered) {
    const normalizedDiscoveredUrl = normalizeQueuedUrl(discoveredUrl);
    if (!normalizedDiscoveredUrl) continue;
    if (!seen.has(normalizedDiscoveredUrl) && !queued.has(normalizedDiscoveredUrl)) {
      const discoveredGate = await canFetchUrl(normalizedDiscoveredUrl);
      if (!discoveredGate.allowed) continue;
      queued.add(normalizedDiscoveredUrl);
      candidateQueue.push({ url: normalizedDiscoveredUrl, depth: depth + 1 });
    }
  }
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) return decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim());
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return decodeEntities(stripTags(h1Match[1]).replace(/\s+/g, " ").trim());
  return "";
}

function classifyPageType(title, bodyText, sourceUrl) {
  const haystack = `${title} ${bodyText} ${sourceUrl}`.toLowerCase();
  if (/\blogin\b|\bsign up\b|\bregister\b/.test(haystack)) return "login";
  if (/\bcategory\b|\ball scholarships\b|\bfind scholarships\b|\blist of scholarships\b|\bpositions\b/.test(haystack)) return "listing";
  if (/\bpdf\b/.test(sourceUrl)) return "pdf";
  if (/\bapply now\b|\bdeadline\b|\beligibility\b|\bfunding\b|\baward\b/.test(haystack) || wanted.test(haystack)) return "detail";
  return "unknown";
}

function isBlockedScholarshipPage(title = "", bodyText = "", sourceUrl = "") {
  const haystack = `${title} ${bodyText} ${sourceUrl}`.toLowerCase();
  return (
    /\baccess denied\b/.test(haystack) ||
    /\b403 forbidden\b/.test(haystack) ||
    /\bbot traffic blocked\b/.test(haystack) ||
    /\byou don't have permission\b/.test(haystack) ||
    /\berrors\.edgesuite\.net\b/.test(haystack) ||
    /\battention required\b/.test(haystack) ||
    /\btemporarily unavailable\b/.test(haystack) ||
    /\bjust a moment\b/.test(haystack) ||
    /\benable javascript and cookies to continue\b/.test(haystack) ||
    /\bcf[- ]?challenge\b/.test(haystack)
  );
}

function isDirectExtractionSource(source = {}) {
  return String(source?.source_type || "").toLowerCase() !== "discovery_directory";
}

function isLowValueScholarshipCandidate({ title = "", summary = "", url = "", source = {} } = {}) {
  const haystack = `${title} ${summary} ${url}`.toLowerCase();
  const sourceType = String(source?.source_type || "").toLowerCase();
  if (/\bcurrent scholars\b/.test(haystack)) return true;
  if (/\b(application timeline|find a course|who can apply|how to apply|funding your studies|fees and funding|living costs|tuition fees)\b/.test(haystack)) {
    return true;
  }
  if (/\b(history, funding and future|funding opportunities)\b/.test(haystack)) return true;
  if (sourceType === "discovery_directory" && /\bguide\b|\bguides\b/.test(haystack)) {
    return true;
  }
  return false;
}

function createSourceMetric(label = "") {
  return {
    sourceLabel: label,
    sourceUrl: null,
    sourceType: null,
    trustTier: null,
    seedCount: 0,
    pagesVisited: 0,
    reviewReady: 0,
    validationFailures: 0,
    blockedPages: 0,
    skippedPages: 0,
    deadLinks: 0,
  };
}

function pushCandidateCandidate(store = [], entry = {}) {
  store.push({
    capturedAt: new Date().toISOString(),
    ...entry,
  });
}

function parseSourceList(raw) {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.sources) ? parsed.sources : [];
}

async function main() {
  const rawSources = await readFile(sourcesPath, "utf8");
  const sources = parseSourceList(rawSources);
  const resultsV2 = [];
  const validationFailures = [];
  const candidateBank = [];
  const sourceMetrics = new Map();
  const seen = new Set();
  await loadDeadLinkState();

  for (const source of sources) {
    if (!source?.url) continue;
    if (!isDirectExtractionSource(source)) {
      console.log(`[skip] ${source.label}: discovery-only source retained for future lead resolution, not direct extraction`);
      continue;
    }
    const strategy = getSourceStrategy(source);
    const normalizedSourceUrl = normalizeQueuedUrl(source.url);
    if (!normalizedSourceUrl) continue;
    const metric = sourceMetrics.get(source.label) || createSourceMetric(source.label);
    metric.sourceUrl = normalizedSourceUrl;
    metric.sourceType = source.source_type || null;
    metric.trustTier = source.trust_tier || null;
    sourceMetrics.set(source.label, metric);

    const sourceGate = await canFetchUrl(normalizedSourceUrl);
    if (!sourceGate.allowed) {
      metric.skippedPages += 1;
      console.error(`[skip] ${source.label}: ${sourceGate.reason} ${normalizedSourceUrl}`);
      continue;
    }

    let rootPage;
    try {
      rootPage = await fetchPage(normalizedSourceUrl);
    } catch (error) {
      metric.deadLinks += 1;
      console.error(`[skip] ${source.label}: ${error.message}`);
      deadLinks.push({
        url: normalizedSourceUrl,
        sourceLabel: source.label,
        error: error.message,
        capturedAt: new Date().toISOString(),
      });
      deadLinkState.set(normalizedSourceUrl, {
        url: normalizedSourceUrl,
        sourceLabel: source.label,
        error: error.message,
        capturedAt: new Date().toISOString(),
      });
      continue;
    }

    const seedUrls = [normalizedSourceUrl, ...strategy.entryUrls.map((url) => normalizeQueuedUrl(url)).filter(Boolean)];
    metric.seedCount = seedUrls.length;
    const candidateQueue = [...new Set(seedUrls)].map((url) => ({ url, depth: 0 }));
    const queued = new Set(seedUrls);
    for (let cursor = 0; cursor < candidateQueue.length && cursor < strategy.maxPages; cursor += 1) {
      const { url: pageUrl, depth } = candidateQueue[cursor];
      if (seen.has(pageUrl)) continue;
      seen.add(pageUrl);
      metric.pagesVisited += 1;

      const gate = await canFetchUrl(pageUrl);
      if (!gate.allowed) {
        metric.skippedPages += 1;
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label,
          sourceUrl: normalizedSourceUrl,
          url: pageUrl,
          depth,
          status: "skipped",
          reason: gate.reason || "blocked",
        });
        continue;
      }

      let page;
      try {
        page = pageUrl === normalizedSourceUrl ? rootPage : await fetchPage(pageUrl);
      } catch (error) {
        metric.deadLinks += 1;
        console.error(`[skip] ${pageUrl}: ${error.message}`);
        deadLinks.push({
          url: pageUrl,
          sourceLabel: source.label,
          error: error.message,
          capturedAt: new Date().toISOString(),
        });
        deadLinkState.set(pageUrl, {
          url: pageUrl,
          sourceLabel: source.label,
          error: error.message,
          capturedAt: new Date().toISOString(),
        });
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label,
          sourceUrl: normalizedSourceUrl,
          url: pageUrl,
          depth,
          status: "dead_link",
          reason: error.message,
        });
        continue;
      }

      const canonicalPageUrl = normalizeQueuedUrl(page.finalUrl || pageUrl) || pageUrl;
      if (!matchesUrlPolicy(canonicalPageUrl, strategy)) {
        metric.skippedPages += 1;
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label,
          sourceUrl: normalizedSourceUrl,
          url: pageUrl,
          canonicalUrl: canonicalPageUrl,
          depth,
          status: "skipped",
          reason: "url-policy",
        });
        continue;
      }
      if (canonicalPageUrl !== pageUrl) {
        const redirectGate = await canFetchUrl(canonicalPageUrl);
        if (!redirectGate.allowed) {
          metric.skippedPages += 1;
          deadLinks.push({
            url: canonicalPageUrl,
            sourceLabel: source.label,
            error: redirectGate.reason || "redirect-blocked",
            capturedAt: new Date().toISOString(),
          });
          deadLinkState.set(canonicalPageUrl, {
            url: canonicalPageUrl,
            sourceLabel: source.label,
            error: redirectGate.reason || "redirect-blocked",
            capturedAt: new Date().toISOString(),
          });
          pushCandidateCandidate(candidateBank, {
            sourceLabel: source.label,
            sourceUrl: normalizedSourceUrl,
            url: pageUrl,
            canonicalUrl: canonicalPageUrl,
            depth,
            status: "skipped",
            reason: redirectGate.reason || "redirect-blocked",
          });
          continue;
        }
      }

      if (!page.contentType || (!/html/i.test(page.contentType) && !/pdf/i.test(page.contentType))) {
        metric.skippedPages += 1;
        continue;
      }

      const structured = await parseDocumentWithProfile(page.html, canonicalPageUrl, source);
      const title = structured.title || extractTitle(page.html);
      const summary = textSnippet(structured.contentText || page.html, 260);
      if (isBlockedScholarshipPage(title, summary, canonicalPageUrl)) {
        metric.blockedPages += 1;
        validationFailures.push({
          sourceUrl: pageUrl,
          sourceLabel: source.label,
          title,
          errors: ["blocked or access-denied page"],
          capturedAt: new Date().toISOString(),
        });
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label,
          sourceUrl: normalizedSourceUrl,
          url: pageUrl,
          canonicalUrl: canonicalPageUrl,
          depth,
          title,
          pageType: "blocked",
          status: "blocked",
          reason: "blocked or access-denied page",
        });
        continue;
      }
      const haystack = `${title} ${summary} ${canonicalPageUrl}`.toLowerCase();
      const pageType = classifyPageType(title, summary, canonicalPageUrl);
      const pageScore = [
        wanted.test(haystack) ? 3 : 0,
        matchesPatternList(haystack, strategy.followPatterns) ? 3 : 0,
        matchesPatternList(haystack, strategy.priorityPatterns) ? 2 : 0,
        pathMatches(canonicalPageUrl, strategy.entryPaths) ? 1 : 0,
      ].reduce((sum, value) => sum + value, 0);
      // University directory pages often lack strong keyword signals despite
      // containing scholarship content. Use a lower bar for those sources.
      const isUniversitySource = String(source?.source_type || "").toLowerCase() === "official_university_directory";
      const minPageScore = isUniversitySource ? 1 : 3;
      const canExtractRecord =
        pageType !== "login" &&
        pageType !== "faq" &&
        pageType !== "news" &&
        pageType !== "listing" &&
        (pageType === "detail" || (isUniversitySource && pageType === "unknown")) &&
        pageScore >= minPageScore &&
        !isLowValueScholarshipCandidate({ title, summary, url: canonicalPageUrl, source });

      if (!canExtractRecord) {
        metric.skippedPages += 1;
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label,
          sourceUrl: normalizedSourceUrl,
          url: pageUrl,
          canonicalUrl: canonicalPageUrl,
          depth,
          title,
          pageType,
          pageScore,
          status: "discovered",
          reason: "not-extractable-yet",
        });
        await enqueueDiscoveredUrls({
          source,
          html: page.html,
          canonicalPageUrl,
          strategy,
          depth,
          candidateQueue,
          seen,
          queued,
        });
        continue;
      }

      const applicationLink = await collectApplicationLink(page.html, canonicalPageUrl, source, strategy);
      const extractionLabel = structured?.profile?.brand || structured.provider || source.label;
      const fallbackApplicationLink = applicationLink || (structured?.profile?.useSourcePageAsApplication ? canonicalPageUrl : null);
      const v2 = extractScholarship({
        html: page.html,
        sourceUrl: canonicalPageUrl,
        sourceLabel: extractionLabel,
        title,
        applicationLink: fallbackApplicationLink,
        contentText: structured.contentText || page.html,
      });
      if (structured?.profile?.kind === "daad" && /:/.test(v2.name || "")) {
        const [body, ...rest] = String(v2.name).split(":");
        const nextName = rest.join(":").trim();
        if (body.trim() && nextName) {
          v2.awardingBody = body.trim();
          v2.name = nextName;
          v2.displayName = nextName;
        }
      }
      v2.source.sourceLabel = source.label;
      v2.source.sourceBrand = extractionLabel;
      // ── International-student verification ──
      // Reject scholarships that are UK-only or have no international signal.
      const intlCheck = verifyInternationalEligibility(
        v2.eligibility?.rawText || structured.contentText || page.html,
        canonicalPageUrl
      );
      if (!intlCheck.isInternational) {
        metric.skippedPages += 1;
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label, sourceUrl: normalizedSourceUrl,
          url: pageUrl, canonicalUrl: canonicalPageUrl, depth,
          title, pageType, pageScore,
          status: "skipped", reason: "not_international: " + (intlCheck.warnings[0] || "no signal"),
        });
        continue;
      }

      // ── Stringent quality verification ──
      const qualityCheck = verifyScholarshipQuality(v2);
      if (!qualityCheck.passed) {
        metric.validationFailures += 1;
        validationFailures.push({
          sourceUrl: pageUrl, sourceLabel: source.label, title,
          errors: qualityCheck.checks.filter(function (c) { return !c.passed; }).map(function (c) { return c.check + ": " + c.detail; }),
          capturedAt: new Date().toISOString(),
        });
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label, sourceUrl: normalizedSourceUrl,
          url: pageUrl, canonicalUrl: canonicalPageUrl, depth,
          title, pageType, pageScore,
          status: "validation_failure",
          reason: qualityCheck.checks.filter(function (c) { return !c.passed; }).map(function (c) { return c.check; }).join("; "),
        });
        continue;
      }

      // Store international verification in the scholarship record
      v2.internationalVerification = intlCheck;
      v2.qualityVerification = qualityCheck;

      const validation = validateScholarship(v2);
      if (!validation.valid) {
        metric.validationFailures += 1;
        validationFailures.push({
          sourceUrl: pageUrl,
          sourceLabel: source.label,
          title,
          errors: validation.errors,
          capturedAt: new Date().toISOString(),
        });
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label,
          sourceUrl: normalizedSourceUrl,
          url: pageUrl,
          canonicalUrl: canonicalPageUrl,
          depth,
          title,
          pageType,
          pageScore,
          status: "validation_failure",
          reason: validation.errors.join("; "),
        });
        continue;
      }

      v2.source.pageTitle = title;
      v2.source.registrySourceType = source.source_type || null;
      v2.source.registryTrustTier = source.trust_tier || null;
      v2.source.registryCountry = source.country || null;
      v2.source.registryCity = source.city || null;
      v2.source.discoveryScore = pageScore;
      v2.source.discoveryDepth = depth;
      v2.source.discoveryNotes = source.notes || "";
      v2.provenance.discoveryScore = pageScore;

      if (typeof v2.source.confidence === "number" && v2.source.confidence >= 0.35) {
        metric.reviewReady += 1;
        resultsV2.push(v2);
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label,
          sourceUrl: normalizedSourceUrl,
          url: pageUrl,
          canonicalUrl: canonicalPageUrl,
          depth,
          title: v2.name,
          pageType,
          pageScore,
          status: "review_ready",
          confidence: v2.source.confidence,
          awardingBody: v2.awardingBody,
        });
      } else {
        metric.validationFailures += 1;
        validationFailures.push({
          sourceUrl: pageUrl,
          sourceLabel: source.label,
          title,
          errors: ["confidence below threshold"],
          capturedAt: new Date().toISOString(),
        });
        pushCandidateCandidate(candidateBank, {
          sourceLabel: source.label,
          sourceUrl: normalizedSourceUrl,
          url: pageUrl,
          canonicalUrl: canonicalPageUrl,
          depth,
          title,
          pageType,
          pageScore,
          status: "validation_failure",
          reason: "confidence below threshold",
        });
      }

      await enqueueDiscoveredUrls({
        source,
        html: page.html,
        canonicalPageUrl,
        strategy,
        depth,
        candidateQueue,
        seen,
        queued,
      });
    }
  }

  const reviewQueue = await writeScholarshipReviewQueue({ scholarships: resultsV2 }, { version: "1.0.0" });

  await writeFile(
    validationFailuresPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        total: validationFailures.length,
        failures: validationFailures,
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    deadLinksPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        total: deadLinkState.size,
        deadLinks: Array.from(deadLinkState.values()),
      },
      null,
      2
    ),
    "utf8"
  );

  const candidateMap = new Map();
  for (const entry of candidateBank) {
    const key = `${entry.canonicalUrl || entry.url || ""}::${entry.sourceLabel || ""}`;
    candidateMap.set(key, entry);
  }

  await writeFile(
    candidateBankPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        total: candidateMap.size,
        candidates: [...candidateMap.values()],
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    sourceMetricsPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        total: sourceMetrics.size,
        sources: [...sourceMetrics.values()].sort((a, b) => b.reviewReady - a.reviewReady || b.pagesVisited - a.pagesVisited),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Wrote ${reviewQueue.total} scholarship review records to ${resolve(reviewQueuePath)}`);
  console.log(`Captured ${validationFailures.length} validation failures in ${resolve(validationFailuresPath)}`);
  console.log(`Recorded ${deadLinks.length} dead links in ${resolve(deadLinksPath)}`);

  if (browserContext) {
    await browserContext.close();
  }
  if (browserInstance) {
    await browserInstance.close();
  }
}

await main();
