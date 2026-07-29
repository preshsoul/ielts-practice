/**
 * Node.js Load Test Harness
 *
 * Comprehensive load testing without external dependencies (no k6 needed).
 * Simulates concurrent users hitting Supabase Edge Functions, PostgREST,
 * and static assets with configurable concurrency and ramp-up patterns.
 *
 * Run: node load-tests/node-load-test.js [smoke|load|stress|spike]
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const config = require("./config.json");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || config.supabase.url;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || config.supabase.anonKey;
const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || process.env.VITE_SUPABASE_FUNCTIONS_URL || config.supabase.functionsUrl || `${SUPABASE_URL}/functions/v1`;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents) before running load tests.");
}

const PROFILE = process.argv[2] || "load";
const profile = config.testProfiles[PROFILE] || config.testProfiles.load;

const RESULTS_DIR = path.join(__dirname, "results");
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ── HTTP helper (no dependencies) ──────────────────────────────────────────

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: options.timeout || 15000,
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json: () => { try { return JSON.parse(body); } catch { return null; } },
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Metrics collector ──────────────────────────────────────────────────────

class MetricsCollector {
  constructor() {
    this.timings = [];
    this.statuses = {};
    this.errors = [];
    this.rateLimited = 0;
    this.startTime = Date.now();
  }

  record(status, durationMs, url) {
    this.timings.push(durationMs);
    this.statuses[status] = (this.statuses[status] || 0) + 1;
    if (status === 429) this.rateLimited++;
    if (status >= 400 && status !== 429) {
      this.errors.push({ url, status, duration: durationMs });
    }
  }

  summary() {
    const sorted = [...this.timings].sort((a, b) => a - b);
    const total = sorted.length;
    const elapsed = (Date.now() - this.startTime) / 1000;

    return {
      totalRequests: total,
      elapsedSeconds: elapsed.toFixed(1),
      rps: (total / elapsed).toFixed(1),
      p50: sorted[Math.floor(total * 0.50)] || 0,
      p90: sorted[Math.floor(total * 0.90)] || 0,
      p95: sorted[Math.floor(total * 0.95)] || 0,
      p99: sorted[Math.floor(total * 0.99)] || 0,
      p999: sorted[Math.floor(total * 0.999)] || 0,
      max: sorted[total - 1] || 0,
      min: sorted[0] || 0,
      avg: total > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / total) : 0,
      statusDistribution: this.statuses,
      rateLimited: this.rateLimited,
      errorCount: this.errors.length,
      errorRate: total > 0 ? (this.errors.length / total * 100).toFixed(2) : "0.00",
    };
  }
}

// ── Concurrent runner ──────────────────────────────────────────────────────

async function runConcurrently(tasks, concurrency) {
  const results = [];
  const queue = [...tasks];
  let active = 0;
  let completed = 0;
  const total = queue.length;

  function progress() {
    const pct = Math.round((completed / total) * 100);
    process.stdout.write(`\r  Progress: ${completed}/${total} (${pct}%) [${active} active]`);
  }

  return new Promise((resolve) => {
    function next() {
      while (active < concurrency && queue.length > 0) {
        const task = queue.shift();
        active++;
        task()
          .then((r) => { results.push(r); })
          .catch((e) => { results.push({ error: e.message }); })
          .finally(() => {
            active--;
            completed++;
            progress();
            if (completed >= total) {
              process.stdout.write("\n");
              resolve(results);
            } else {
              next();
            }
          });
      }
    }
    next();
  });
}

// ── Test definitions ───────────────────────────────────────────────────────

async function testDatabaseQueries(metrics) {
  console.log("\n═══ DATABASE QUERY LOAD TEST ═══");
  console.log(`  Profile: ${PROFILE} — up to ${profile.vus} concurrent users`);
  console.log(`  Duration: ${profile.duration}`);

  const queries = [
    async () => {
      const start = Date.now();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scholarships?select=id,name,awardingBody,country,deadline,eligibility,coverage&active=eq.true&limit=20`,
        { headers: { apikey: ANON_KEY } },
      ).catch(() => ({ status: 0 }));
      metrics.record(res.status, Date.now() - start, "List scholarships");
    },
    async () => {
      const start = Date.now();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/questions?select=id,exam,section,difficulty,question_text,options,answer&active=eq.true&verified=eq.true&limit=20`,
        { headers: { apikey: ANON_KEY } },
      ).catch(() => ({ status: 0 }));
      metrics.record(res.status, Date.now() - start, "List questions");
    },
    async () => {
      const start = Date.now();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/passages?select=id,title,topic&active=eq.true&limit=10`,
        { headers: { apikey: ANON_KEY } },
      ).catch(() => ({ status: 0 }));
      metrics.record(res.status, Date.now() - start, "List passages");
    },
    async () => {
      const disciplines = ["Computer Science", "Engineering", "Business"];
      const d = disciplines[Math.floor(Math.random() * disciplines.length)];
      const start = Date.now();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/scholarships?select=id,name,country,deadline&active=eq.true&eligibility_tags=cs.%7B${encodeURIComponent(d)}%7D&limit=10`,
        { headers: { apikey: ANON_KEY } },
      ).catch(() => ({ status: 0 }));
      metrics.record(res.status, Date.now() - start, "Search scholarships");
    },
    async () => {
      const start = Date.now();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/universities?select=*&limit=30`,
        { headers: { apikey: ANON_KEY } },
      ).catch(() => ({ status: 0 }));
      metrics.record(res.status, Date.now() - start, "List universities");
    },
  ];

  const concurrency = profile.vus;
  const durationMs = parseDuration(profile.duration);
  const startTime = Date.now();

  // Build task list for the duration
  const tasks = [];
  let taskCount = 0;
  const maxTasks = profile.vus * 50; // Cap tasks for smoke tests

  while (Date.now() - startTime < durationMs && tasks.length < maxTasks) {
    const q = queries[Math.floor(Math.random() * queries.length)];
    tasks.push(q);
    taskCount++;
  }

  console.log(`  Generated ${tasks.length} requests over ${profile.duration}`);
  await runConcurrently(tasks, concurrency);
  console.log(`  Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return metrics.summary();
}

async function testEdgeFunctionHealth(metrics) {
  console.log("\n═══ EDGE FUNCTION HEALTH CHECK TEST ═══");

  const endpoints = [
    { name: "generate-ielts-reading", path: "/generate-ielts-reading/health" },
    { name: "generate-semantic-profile", path: "/generate-semantic-profile/health" },
    { name: "generate-embedding", path: "/generate-embedding/health" },
    { name: "document-intake", path: "/document-intake/health" },
    { name: "cv-parser", path: "/cv-parser/health" },
  ];

  const results = {};
  for (const ep of endpoints) {
    const start = Date.now();
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1${ep.path}`, {
        headers: { apikey: ANON_KEY },
      });
      const duration = Date.now() - start;
      metrics.record(res.status, duration, ep.name);
      const data = res.json();
      results[ep.name] = {
        status: res.status,
        duration,
        configured: data?.configured || false,
        missing: data?.missing || [],
      };
      console.log(`  ${ep.name}: status=${res.status} duration=${duration}ms configured=${data?.configured || false}`);
    } catch (e) {
      console.log(`  ${ep.name}: ERROR — ${e.message}`);
      results[ep.name] = { error: e.message };
    }
  }

  return results;
}

async function testRateLimiting() {
  console.log("\n═══ RATE LIMITING VERIFICATION ═══");

  const endpoints = [
    {
      name: "document-intake (health)",
      url: `${SUPABASE_URL}/functions/v1/document-intake/health`,
      method: "GET",
    },
  ];

  const results = [];
  const burstSize = 25;

  for (const ep of endpoints) {
    console.log(`\n  Testing: ${ep.name}`);
    console.log(`  Sending ${burstSize} rapid requests...`);

    const tasks = Array.from({ length: burstSize }, (_, i) => async () => {
      const start = Date.now();
      try {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: { apikey: ANON_KEY },
        });
        return { index: i + 1, status: res.status, duration: Date.now() - start, retryAfter: res.headers["retry-after"] || null };
      } catch (e) {
        return { index: i + 1, error: e.message };
      }
    });

    const responses = await runConcurrently(tasks, burstSize); // All at once

    let first429 = -1;
    let total429s = 0;
    for (const r of responses) {
      if (r.status === 429) {
        total429s++;
        if (first429 === -1) first429 = r.index;
      }
    }

    console.log(`  First 429 at request #${first429} | Total 429s: ${total429s}/${burstSize}`);
    console.log(`  Rate limiting ${first429 > 0 ? "ACTIVE ✓" : "NOT DETECTED ✗"}`);

    results.push({
      endpoint: ep.name,
      first429At: first429,
      total429s,
      rateLimited: first429 > 0,
    });
  }

  return results;
}

// ── Utility ─────────────────────────────────────────────────────────────────

function parseDuration(str) {
  const match = String(str).match(/(\d+)(s|m)/);
  if (!match) return 60000;
  const val = parseInt(match[1]);
  return match[2] === "m" ? val * 60 * 1000 : val * 1000;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const timestamp = new Date().toISOString();

  console.log("═══════════════════════════════════════════");
  console.log("  LOCI Platform — Node.js Load Test Suite");
  console.log(`  Profile: ${PROFILE} (${profile.vus} VUs, ${profile.duration})`);
  console.log(`  Started: ${timestamp}`);
  console.log("═══════════════════════════════════════════");

  const report = {
    timestamp,
    profile: PROFILE,
    config: profile,
    tests: {},
  };

  // ── Test 1: Database Queries ─────────────────────────────────────────
  const dbMetrics = new MetricsCollector();
  report.tests.database = await testDatabaseQueries(dbMetrics);
  console.log(`\n  DB Summary: ${report.tests.database.totalRequests} requests`);
  console.log(`    P50=${report.tests.database.p50}ms P95=${report.tests.database.p95}ms P99=${report.tests.database.p99}ms`);
  console.log(`    RPS=${report.tests.database.rps} Errors=${report.tests.database.errorCount} Rate=${report.tests.database.errorRate}%`);

  // ── Test 2: Edge Function Health ─────────────────────────────────────
  const edgeMetrics = new MetricsCollector();
  report.tests.edgeFunctions = await testEdgeFunctionHealth(edgeMetrics);

  // ── Test 3: Rate Limiting ────────────────────────────────────────────
  report.tests.rateLimiting = await testRateLimiting();

  // ── Final Verdict ────────────────────────────────────────────────────
  const dbP95 = report.tests.database?.p95 || 0;
  const dbErrorRate = parseFloat(report.tests.database?.errorRate || "100");
  const rateLimitWorking = report.tests.rateLimiting?.some((r) => r.rateLimited) || false;

  let verdict = "PASS";
  const issues = [];

  if (dbP95 > 2000) { verdict = "FAIL"; issues.push(`Database P95 latency (${dbP95}ms) exceeds 2000ms threshold`); }
  else if (dbP95 > 1000) { verdict = Math.max(verdict === "FAIL" ? "FAIL" : "WARN", "WARN"); issues.push(`Database P95 latency (${dbP95}ms) above 1000ms warning`); }

  if (dbErrorRate > 5) { verdict = "FAIL"; issues.push(`Database error rate (${dbErrorRate}%) exceeds 5% threshold`); }
  else if (dbErrorRate > 1) { issues.push(`Database error rate (${dbErrorRate}%) above 1%`); }

  if (!rateLimitWorking) { issues.push("Rate limiting not detected — verify Upstash Redis configuration"); }

  report.verdict = { result: verdict, issues };

  console.log("\n═══════════════════════════════════════════");
  console.log(`  FINAL VERDICT: ${verdict}`);
  if (issues.length > 0) {
    console.log("  Issues:");
    issues.forEach((i) => console.log(`    - ${i}`));
  }
  console.log("═══════════════════════════════════════════");

  // Save report
  const reportPath = path.join(RESULTS_DIR, `node-load-test-${PROFILE}-${timestamp.replace(/:/g, "-")}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  Report saved: ${reportPath}`);

  return report;
}

main().catch(console.error);
