/**
 * autocannon Quick Benchmarks
 *
 * Rapid HTTP benchmarks for individual endpoints. Run with:
 *   node load-tests/autocannon-benchmarks.js
 *
 * Requires: npm install autocannon (if not globally installed)
 */

const autocannon = require("autocannon");
const fs = require("fs");
const path = require("path");

const config = require("./config.json");

const SUPABASE_URL = config.supabase.url;
const ANON_KEY = config.supabase.anonKey;
const DEV_SERVER = config.local.devServer;

const RESULTS_DIR = path.join(__dirname, "results");
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ── Benchmark definitions ──────────────────────────────────────────────────

const BENCHMARKS = [
  // ── Supabase REST API (Database) ──────────────────────────────────────
  {
    name: "DB — List scholarships (50 records)",
    url: `${SUPABASE_URL}/rest/v1/scholarships?select=id,name,deadline,eligibility&active=eq.true&limit=50`,
    method: "GET",
    headers: { apikey: ANON_KEY },
    connections: 50,
    duration: 30,
    threshold: { p99: 1000, errors: 0.05 },
  },
  {
    name: "DB — List questions (50 records)",
    url: `${SUPABASE_URL}/rest/v1/questions?select=id,section,difficulty,question_text&active=eq.true&verified=eq.true&limit=50`,
    method: "GET",
    headers: { apikey: ANON_KEY },
    connections: 50,
    duration: 30,
    threshold: { p99: 500, errors: 0.05 },
  },
  {
    name: "DB — Search scholarships (filtered)",
    url: `${SUPABASE_URL}/rest/v1/scholarships?select=id,name,country&active=eq.true&or=(eligibility_tags.cs.%7BEngineering%7D)&limit=20`,
    method: "GET",
    headers: { apikey: ANON_KEY },
    connections: 50,
    duration: 30,
    threshold: { p99: 800, errors: 0.05 },
  },
  {
    name: "DB — List passages",
    url: `${SUPABASE_URL}/rest/v1/passages?select=id,title,topic&active=eq.true&limit=20`,
    method: "GET",
    headers: { apikey: ANON_KEY },
    connections: 50,
    duration: 30,
    threshold: { p99: 500, errors: 0.05 },
  },

  // ── Edge Functions (Health endpoints) ──────────────────────────────────
  {
    name: "Edge — generate-ielts-reading health",
    url: `${SUPABASE_URL}/functions/v1/generate-ielts-reading/health`,
    method: "GET",
    headers: { apikey: ANON_KEY },
    connections: 20,
    duration: 15,
    threshold: { p99: 2000, errors: 0.05 },
  },
  {
    name: "Edge — generate-semantic-profile health",
    url: `${SUPABASE_URL}/functions/v1/generate-semantic-profile/health`,
    method: "GET",
    headers: { apikey: ANON_KEY },
    connections: 20,
    duration: 15,
    threshold: { p99: 2000, errors: 0.05 },
  },
  {
    name: "Edge — generate-embedding health",
    url: `${SUPABASE_URL}/functions/v1/generate-embedding/health`,
    method: "GET",
    headers: { apikey: ANON_KEY },
    connections: 20,
    duration: 15,
    threshold: { p99: 2000, errors: 0.05 },
  },
];

// ── Run all benchmarks ─────────────────────────────────────────────────────

async function runBenchmark(benchmark) {
  return new Promise((resolve) => {
    console.log(`\n▶ ${benchmark.name}`);
    console.log(`  ${benchmark.method} ${benchmark.url.replace(ANON_KEY, "***")}`);
    console.log(`  ${benchmark.connections} connections, ${benchmark.duration}s`);

    const instance = autocannon({
      url: benchmark.url,
      method: benchmark.method,
      headers: benchmark.headers,
      connections: benchmark.connections,
      duration: benchmark.duration,
      timeout: 15,
    });

    autocannon.track(instance, { renderProgressBar: true });

    instance.on("done", (result) => {
      const p99 = result.latency.p99;
      const errors = result.errors;
      const errorRate = result.errors / (result.requests.total || 1);
      const rps = result.requests.average;

      const p99Pass = p99 <= benchmark.threshold.p99;
      const errorPass = errorRate <= benchmark.threshold.errors;

      const verdict = p99Pass && errorPass ? "PASS" : "FAIL";

      console.log(`\n  ── Results ──`);
      console.log(`  Requests: ${result.requests.total} total | ${rps.toFixed(0)} req/sec avg`);
      console.log(`  Latency:  p50=${result.latency.p50}ms p95=${result.latency.p95}ms p99=${p99}ms`);
      console.log(`  Errors:   ${errors} (${(errorRate * 100).toFixed(1)}%)`);
      console.log(`  Threshold: p99<${benchmark.threshold.p99}ms (${p99Pass ? "✓" : `✗ ${p99 - benchmark.threshold.p99}ms over`}) | errors<${(benchmark.threshold.errors * 100).toFixed(0)}% (${errorPass ? "✓" : "✗"})`);
      console.log(`  Verdict: ${verdict}`);

      resolve({
        name: benchmark.name,
        url: benchmark.url,
        requests: result.requests.total,
        rps: rps,
        p50: result.latency.p50,
        p95: result.latency.p95,
        p99: p99,
        p999: result.latency.p999,
        max: result.latency.max,
        errors: errors,
        errorRate: errorRate,
        threshold: benchmark.threshold,
        passed: verdict === "PASS",
        verdict,
      });
    });

    instance.on("error", (err) => {
      console.log(`  ERROR: ${err.message}`);
      resolve({
        name: benchmark.name,
        error: err.message,
        passed: false,
        verdict: "ERROR",
      });
    });
  });
}

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  LOCI Platform — autocannon Benchmarks");
  console.log(`  ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════");

  const results = [];
  for (const benchmark of BENCHMARKS) {
    const result = await runBenchmark(benchmark);
    results.push(result);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════");
  console.log("  BENCHMARK SUMMARY");
  console.log("═══════════════════════════════════════════");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    console.log(`  ${icon} ${r.name}`);
    if (r.p99) console.log(`    P99: ${r.p99.toFixed(0)}ms | RPS: ${r.rps?.toFixed(0)} | Errors: ${r.errors}`);
    else console.log(`    ERROR: ${r.error}`);
  }

  console.log(`\n  Passed: ${passed}/${results.length} | Failed: ${failed}/${results.length}`);

  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    results,
    summary: { passed, failed, total: results.length },
  };
  fs.writeFileSync(
    path.join(RESULTS_DIR, "autocannon-summary.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(`\n  Report saved: load-tests/results/autocannon-summary.json`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
