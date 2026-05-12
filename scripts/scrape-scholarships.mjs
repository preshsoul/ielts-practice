import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractScholarship } from "./scholarship-extractor.mjs";
import { validateScholarship } from "./scholarship-schema.mjs";
import { writeScholarshipReviewQueue } from "./lib/scholarship-scraper/writer.js";
import { normalizeUrl as normalizeScholarshipUrl } from "../src/lib/scholarshipContract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourcesPath = join(root, "content", "scholarship-sources.json");
const reviewQueuePath = join(root, "content", "scholarships.review.json");
const validationFailuresPath = join(root, "content", "validation-failures.json");
const deadLinksPath = join(root, "content", "dead-links.json");
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
      listingContainer: ".tdb_module_loop, .td-module-container",
      listingLink: ".td-module-title a, .td-module-thumb a, a[rel='bookmark']",
      title: ".tdb-title-text, .entry-title a",
      provider: ".tdb-author-name",
      content: ".td-post-content, .elementor-widget-text-editor",
      deadline: ".elementor-widget-text-editor li",
      applyLink: "a[href*='apply'], a[href*='application']",
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
      contentText: textSnippet(html, 260),
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
        const primaryLink = primaryLinkNode ? normalize(primaryLinkNode.getAttribute("href")) : null;
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
    followPatterns: toPatternList(strategy.followPatterns),
    applicationPatterns: toPatternList(strategy.applicationPatterns),
    priorityPatterns: toPatternList(strategy.priorityPatterns),
    ignorePatterns: toPatternList(strategy.ignorePatterns),
    maxPages: Number.isFinite(Number(strategy.maxPages)) ? Number(strategy.maxPages) : 20,
    maxDepth: Number.isFinite(Number(strategy.maxDepth)) ? Number(strategy.maxDepth) : 2,
    priorityBonus: Number.isFinite(Number(strategy.priorityBonus)) ? Number(strategy.priorityBonus) : 0,
  };
}

function matchesPatternList(value, patterns = []) {
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

function isDeadLinkUrl(url) {
  return deadLinkState.has(url);
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
  return score;
}

async function discoverCandidateUrls(source, html, currentUrl, strategy = {}) {
  const current = new URL(currentUrl);
  const origin = current.origin;
  const structured = await parseDocumentWithProfile(html, currentUrl, source);
  const links = (structured?.candidateLinks?.length
    ? structured.candidateLinks
    : discoverLinksFromHtml(html, currentUrl).map((link) => ({ ...link, containerText: link.text })))
    .filter((link) => sameOrigin(link.href, origin))
    .filter((link) => !matchesPatternList(`${link.href} ${link.text} ${link.containerText || ""}`, strategy.ignorePatterns))
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
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      const html = await page.content();
      return { html, contentType: "text/html", finalUrl: page.url(), source: "browser" };
    } finally {
      await page.close();
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

function parseSourceList(raw) {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.sources) ? parsed.sources : [];
}

async function main() {
  const rawSources = await readFile(sourcesPath, "utf8");
  const sources = parseSourceList(rawSources);
  const resultsV2 = [];
  const validationFailures = [];
  const seen = new Set();
  await loadDeadLinkState();

  for (const source of sources) {
    if (!source?.url) continue;
    const strategy = getSourceStrategy(source);
    const normalizedSourceUrl = normalizeQueuedUrl(source.url);
    if (!normalizedSourceUrl) continue;

    const sourceGate = await canFetchUrl(normalizedSourceUrl);
    if (!sourceGate.allowed) {
      console.error(`[skip] ${source.label}: ${sourceGate.reason} ${normalizedSourceUrl}`);
      continue;
    }

    let rootPage;
    try {
      rootPage = await fetchPage(normalizedSourceUrl);
    } catch (error) {
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

    const candidateQueue = [{ url: normalizedSourceUrl, depth: 0 }];
    const queued = new Set([normalizedSourceUrl]);
    for (let cursor = 0; cursor < candidateQueue.length && cursor < strategy.maxPages; cursor += 1) {
      const { url: pageUrl, depth } = candidateQueue[cursor];
      if (seen.has(pageUrl)) continue;
      seen.add(pageUrl);

      const gate = await canFetchUrl(pageUrl);
      if (!gate.allowed) {
        continue;
      }

      let page;
      try {
        page = pageUrl === normalizedSourceUrl ? rootPage : await fetchPage(pageUrl);
      } catch (error) {
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
        continue;
      }

      const canonicalPageUrl = normalizeQueuedUrl(page.finalUrl || pageUrl) || pageUrl;
      if (canonicalPageUrl !== pageUrl) {
        const redirectGate = await canFetchUrl(canonicalPageUrl);
        if (!redirectGate.allowed) {
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
          continue;
        }
      }

      if (!page.contentType || (!/html/i.test(page.contentType) && !/pdf/i.test(page.contentType))) {
        continue;
      }

      const structured = await parseDocumentWithProfile(page.html, canonicalPageUrl, source);
      const title = structured.title || extractTitle(page.html);
      const summary = textSnippet(structured.contentText || page.html, 260);
      const haystack = `${title} ${summary} ${canonicalPageUrl}`.toLowerCase();
      const pageType = classifyPageType(title, summary, canonicalPageUrl);
      const pageScore = [
        wanted.test(haystack) ? 3 : 0,
        matchesPatternList(haystack, strategy.followPatterns) ? 3 : 0,
        matchesPatternList(haystack, strategy.priorityPatterns) ? 2 : 0,
        pathMatches(canonicalPageUrl, strategy.entryPaths) ? 1 : 0,
      ].reduce((sum, value) => sum + value, 0);
      if (pageType === "login" || pageType === "listing" && pageScore < 5) continue;
      if (pageScore < 3 && pageType !== "detail") continue;

      const applicationLink = await collectApplicationLink(page.html, canonicalPageUrl, source, strategy);
      const v2 = extractScholarship({
        html: page.html,
        sourceUrl: canonicalPageUrl,
        sourceLabel: source.label,
        title,
        applicationLink,
        contentText: structured.contentText || page.html,
      });
      const validation = validateScholarship(v2);
      if (!validation.valid) {
        validationFailures.push({
          sourceUrl: pageUrl,
          sourceLabel: source.label,
          title,
          errors: validation.errors,
          capturedAt: new Date().toISOString(),
        });
        continue;
      }

      v2.source.pageTitle = title;
      v2.source.discoveryScore = pageScore;
      v2.source.discoveryDepth = depth;
      v2.source.discoveryNotes = source.notes || "";
      v2.provenance.discoveryScore = pageScore;

      if (typeof v2.source.confidence === "number" && v2.source.confidence >= 0.35) {
        resultsV2.push(v2);
      } else {
        validationFailures.push({
          sourceUrl: pageUrl,
          sourceLabel: source.label,
          title,
          errors: ["confidence below threshold"],
          capturedAt: new Date().toISOString(),
        });
      }

      if (depth < strategy.maxDepth && candidateQueue.length < strategy.maxPages) {
        const discovered = await discoverCandidateUrls(source, page.html, canonicalPageUrl, strategy);
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
