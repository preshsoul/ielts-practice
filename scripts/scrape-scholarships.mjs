import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractScholarship } from "./scholarship-extractor.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourcesPath = join(root, "content", "scholarship-sources.json");
const outputPath = join(root, "content", "scholarships.scraped.json");
const outputPathV2 = join(root, "content", "scholarships.scraped.v2.json");
const wanted = /scholar|fund|funding|award|bursar|grant/i;

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

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorRe = /<a\b[^>]*href=["']([^"'#?]+(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html))) {
    const href = absoluteUrl(match[1], baseUrl);
    if (!href) continue;
    const text = decodeEntities(stripTags(match[2]).replace(/\s+/g, " ").trim());
    links.push({ href, text });
  }
  return links;
}

function scoreScholarshipLink(link) {
  const haystack = `${link.href} ${link.text}`.toLowerCase();
  let score = 0;
  for (const token of ["scholar", "fund", "funding", "award", "bursar", "grant", "studentship", "bursary"]) {
    if (haystack.includes(token)) score += 2;
  }
  if (haystack.includes("international")) score += 1;
  if (haystack.includes("postgraduate")) score += 1;
  return score;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Codex Scholarship Crawler; +https://openai.com)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const html = await response.text();
  return { html, contentType: response.headers.get("content-type") || "" };
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) return decodeEntities(titleMatch[1].replace(/\s+/g, " ").trim());
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return decodeEntities(stripTags(h1Match[1]).replace(/\s+/g, " ").trim());
  return "";
}

function parseSourceList(raw) {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.sources) ? parsed.sources : [];
}

function normalizeRecord(source, pageUrl, title, summary) {
  return {
    id: slugify(`${source.label}-${title || pageUrl}`),
    name: title || source.label,
    country: source.country || "UK",
    city: source.city || "Online",
    tuition_international_yearly: 0,
    currency: source.currency || "GBP",
    typical_program_length_months: 12,
    living_cost_monthly_by_city: {},
    IHS_per_year: 0,
    CAS_issuance_speed: "unknown",
    research_areas: ["scholarship", "funding"],
    website: pageUrl,
    notes: summary || source.notes || `Scraped from ${source.label}.`,
    source: "scraped",
    verified: false,
    active: true,
    scraped_from: source.url,
  };
}

async function main() {
  const rawSources = await readFile(sourcesPath, "utf8");
  const sources = parseSourceList(rawSources);
  const results = [];
  const resultsV2 = [];
  const seen = new Set();

  for (const source of sources) {
    if (!source?.url) continue;

    let rootPage;
    try {
      rootPage = await fetchPage(source.url);
    } catch (error) {
      console.error(`[skip] ${source.label}: ${error.message}`);
      continue;
    }

    const origin = new URL(source.url).origin;
    const rootLinks = extractLinks(rootPage.html, source.url)
      .filter((link) => sameOrigin(link.href, origin))
      .map((link) => ({ ...link, score: scoreScholarshipLink(link) }))
      .filter((link) => link.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const candidateUrls = [source.url, ...rootLinks.map((link) => link.href)];
    for (const pageUrl of candidateUrls) {
      if (seen.has(pageUrl)) continue;
      seen.add(pageUrl);

      let page;
      try {
        page = pageUrl === source.url ? rootPage : await fetchPage(pageUrl);
      } catch (error) {
        console.error(`[skip] ${pageUrl}: ${error.message}`);
        continue;
      }

      const title = extractTitle(page.html);
      const summary = textSnippet(page.html, 260);
      const haystack = `${title} ${summary} ${pageUrl}`.toLowerCase();
      if (!wanted.test(haystack)) continue;

      results.push(normalizeRecord(source, pageUrl, title, summary));
      const v2 = extractScholarship({
        html: page.html,
        sourceUrl: pageUrl,
        sourceLabel: source.label,
        title,
      });
      if (typeof v2.source.confidence === "number" && v2.source.confidence >= 0.35) {
        resultsV2.push(v2);
      }
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        version: "1.0.0",
        updated_at: new Date().toISOString(),
        total: results.length,
        scholarships: results,
      },
      null,
      2
    ),
    "utf8"
  );

  await writeFile(
    outputPathV2,
    JSON.stringify(
      {
        version: "2.0.0",
        updated_at: new Date().toISOString(),
        total: resultsV2.length,
        scholarships: resultsV2,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Scraped ${results.length} scholarship candidates into ${resolve(outputPath)}`);
  console.log(`Wrote ${resultsV2.length} v2 records to ${resolve(outputPathV2)}`);
}

await main();
