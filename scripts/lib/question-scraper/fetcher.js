import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");
const CACHE_DIR = join(ROOT, "content", "scraper-cache");
const RATE_LIMITS = new Map();
const ROBOTS_AGENT = "lociquestionbot";

function hashUrl(url) {
  return createHash("sha256").update(url).digest("hex");
}

async function ensureCacheDir() {
  await mkdir(CACHE_DIR, { recursive: true });
}

async function readCache(url, ttlMs) {
  await ensureCacheDir();
  const key = hashUrl(url);
  const metaPath = join(CACHE_DIR, `${key}.json`);
  try {
    const raw = await readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > ttlMs) return null;
    return parsed.body || null;
  } catch {
    return null;
  }
}

async function writeCache(url, body) {
  await ensureCacheDir();
  const key = hashUrl(url);
  const metaPath = join(CACHE_DIR, `${key}.json`);
  await writeFile(metaPath, JSON.stringify({ url, fetchedAt: Date.now(), body }, null, 2), "utf8");
}

async function checkRobotsTxt(url) {
  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.origin}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: {
        "User-Agent": "LociQuestionBot/1.0 (+https://loci.local/research)",
        Accept: "text/plain",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const text = await response.text();
    const rules = parseRobotsTxt(text);
    const path = parsed.pathname || "/";
    return isAllowedByRobots(rules, path);
  } catch {
    return false;
  }
}

function parseRobotsTxt(text) {
  const groups = [];
  let current = { agents: [], allow: [], disallow: [] };

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line || !line.includes(":")) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (current.agents.length || current.allow.length || current.disallow.length) {
        groups.push(current);
        current = { agents: [], allow: [], disallow: [] };
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (key === "allow") {
      current.allow.push(value);
      continue;
    }

    if (key === "disallow") {
      current.disallow.push(value);
    }
  }

  if (current.agents.length || current.allow.length || current.disallow.length) {
    groups.push(current);
  }

  return groups;
}

function isAllowedByRobots(groups, path) {
  const matchingGroups = groups.filter((group) => {
    const agents = group.agents.map((agent) => agent.trim().toLowerCase());
    return agents.includes("*") || agents.includes(ROBOTS_AGENT);
  });
  if (!matchingGroups.length) return true;

  const rules = matchingGroups.flatMap((group) => [
    ...group.allow.map((pattern) => ({ type: "allow", pattern })),
    ...group.disallow.map((pattern) => ({ type: "disallow", pattern })),
  ]);

  let matchedRule = null;
  for (const rule of rules) {
    const pattern = rule.pattern || "";
    if (!pattern) continue;
    const normalized = pattern.replace(/\*/g, "");
    if (!normalized) continue;
    if (!path.startsWith(normalized)) continue;
    if (!matchedRule || normalized.length > matchedRule.normalized.length || (normalized.length === matchedRule.normalized.length && rule.type === "allow")) {
      matchedRule = { ...rule, normalized };
    }
  }

  if (!matchedRule) return true;
  return matchedRule.type === "allow";
}

async function enforceRateLimit(hostname, rateLimitMs) {
  const nextAllowed = RATE_LIMITS.get(hostname) || 0;
  const now = Date.now();
  if (now < nextAllowed) {
    await new Promise((resolve) => setTimeout(resolve, nextAllowed - now));
  }
  RATE_LIMITS.set(hostname, Date.now() + rateLimitMs);
}

export async function fetchWithRateLimit(url, options = {}) {
  const ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
  const rateLimitMs = options.rateLimitMs ?? 2000;
  const hostname = new URL(url).hostname;

  const allowed = await checkRobotsTxt(url);
  if (!allowed) {
    return null;
  }

  const cached = await readCache(url, ttlMs);
  if (cached) return cached;

  await enforceRateLimit(hostname, rateLimitMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LociQuestionBot/1.0 (+https://loci.local/research)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 12000),
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    await writeCache(url, html);
    return html;
  } catch {
    return null;
  }
}
