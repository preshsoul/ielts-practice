/**
 * k6 Load Test — Supabase Edge Functions
 *
 * Tests all deployed Edge Functions under harsh load patterns.
 * Run: k6 run --out json=results-edge.json load-tests/k6-edge-functions.js
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const config = JSON.parse(open("../load-tests/config.json"));

const SUPABASE_URL = __ENV.SUPABASE_URL || __ENV.VITE_SUPABASE_URL || config.supabase.url;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || __ENV.VITE_SUPABASE_ANON_KEY || config.supabase.anonKey;
const FUNCTIONS_URL = __ENV.SUPABASE_FUNCTIONS_URL || __ENV.VITE_SUPABASE_FUNCTIONS_URL || config.supabase.functionsUrl || `${SUPABASE_URL}/functions/v1`;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents) before running load tests.");
}

// Custom metrics
const edgeFunctionDuration = new Trend("edge_function_duration");
const edgeFunctionErrors = new Rate("edge_function_errors");
const rateLimitedCount = new Rate("rate_limited");

// Test profiles — override via CLI: k6 run -e PROFILE=stress ...
const PROFILE = __ENV.PROFILE || "load";
const profile = config.testProfiles[PROFILE] || config.testProfiles.load;
const ALLOW_REAL_AUTH_SIGNUP = String(__ENV.ALLOW_REAL_AUTH_SIGNUP_LOAD_TEST || "").toLowerCase() === "true";

export const options = {
  stages: [
    { duration: profile.rampUp || "30s", target: profile.vus },
    { duration: profile.duration, target: profile.vus },
    { duration: "30s", target: 0 },
  ],
  thresholds: config.thresholds,
};

// ── Auth token (valid for this session) ───────────────────────────────────
let authToken = null;

function getAuthHeaders() {
  const headers = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}

// ── Edge Function endpoints under test ────────────────────────────────────

const ENDPOINTS = {
  // Our new Phase 1 function (most complex — LLM generation)
  generateIeltsReading: {
    path: "/generate-ielts-reading",
    body: () => ({
      targetBand: 6.5,
      passageType: "academic",
      questionTypes: ["tfng", "mcq"],
      saveToDb: false,
    }),
    weight: 2, // Higher weight = called more often
    requiresAuth: true,
    expectCache: false,
    timeout: "30s",
  },

  // Existing LLM functions
  generateSemanticProfile: {
    path: "/generate-semantic-profile",
    body: () => ({
      text: "Candidate with MSc Computer Science from University of Lagos, First Class, IELTS 7.5, 3 years software engineering experience.",
      model: "",
    }),
    weight: 1,
    requiresAuth: true,
    expectCache: true,
    timeout: "15s",
  },

  generateEmbedding: {
    path: "/generate-embedding",
    body: () => ({
      text: "Scholarship for international students in computer science and engineering disciplines with full funding and stipend.",
      model: "",
    }),
    weight: 1,
    requiresAuth: true,
    expectCache: true,
    timeout: "15s",
  },

  // Document intake (lightweight validation — no LLM)
  documentIntake: {
    path: "/document-intake",
    body: () => ({
      documentType: "transcript",
      content: { institution: "University of Lagos", degree: "BSc Computer Science", gpa: "4.5/5.0" },
    }),
    weight: 1,
    requiresAuth: true,
    expectCache: false,
    timeout: "10s",
  },

  // Health check (unauthenticated baseline)
  healthCheck: {
    path: "/health",
    body: () => null,
    method: "GET",
    weight: 3,
    requiresAuth: false,
    expectCache: false,
    timeout: "5s",
  },
};

// ── Test setup ─────────────────────────────────────────────────────────────

export function setup() {
  if (__ENV.LOAD_TEST_AUTH_TOKEN) {
    authToken = __ENV.LOAD_TEST_AUTH_TOKEN;
    console.log("[Setup] Auth token loaded from LOAD_TEST_AUTH_TOKEN");
    return { authToken, startTime: new Date().toISOString() };
  }

  if (!ALLOW_REAL_AUTH_SIGNUP) {
    throw new Error("Set LOAD_TEST_AUTH_TOKEN for Edge Function load tests. To create real Supabase signup emails, set ALLOW_REAL_AUTH_SIGNUP_LOAD_TEST=true.");
  }

  // Sign in anonymously to get a JWT for authenticated tests
  const signInRes = http.post(`${SUPABASE_URL}/auth/v1/signup`, JSON.stringify({
    email: `loadtest_${Date.now()}@loci.test`,
    password: "loadtest-password-123",
  }), {
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
  });

  if (signInRes.status === 200 || signInRes.status === 201) {
    const data = signInRes.json();
    authToken = data.access_token || null;
    console.log(`[Setup] Auth token obtained: ${authToken ? "yes" : "no"}`);
  } else {
    // Try anonymous session as fallback
    console.log(`[Setup] Signup returned ${signInRes.status}, using anon access`);
  }

  return { authToken, startTime: new Date().toISOString() };
}

// ── Main test function ─────────────────────────────────────────────────────

export default function (data) {
  // Weighted endpoint selection
  const totalWeight = Object.values(ENDPOINTS).reduce((sum, e) => sum + e.weight, 0);
  let random = Math.random() * totalWeight;

  let selectedEndpoint = null;
  for (const [name, endpoint] of Object.entries(ENDPOINTS)) {
    random -= endpoint.weight;
    if (random <= 0) {
      selectedEndpoint = { name, ...endpoint };
      break;
    }
  }
  if (!selectedEndpoint) {
    selectedEndpoint = { name: "healthCheck", ...ENDPOINTS.healthCheck };
  }

  group(selectedEndpoint.name, () => {
    const method = selectedEndpoint.method || "POST";
    const body = selectedEndpoint.body ? selectedEndpoint.body() : null;
    const headers = selectedEndpoint.requiresAuth ? getAuthHeaders() : { "Content-Type": "application/json", apikey: ANON_KEY };
    const timeout = selectedEndpoint.timeout || "15s";

    const start = Date.now();

    let res;
    if (method === "GET") {
      res = http.get(`${SUPABASE_URL}/functions/v1${selectedEndpoint.path}`, { headers, timeout });
    } else {
      res = http.post(`${FUNCTIONS_URL}${selectedEndpoint.path}`, JSON.stringify(body), { headers, timeout });
    }

    const duration = Date.now() - start;
    edgeFunctionDuration.add(duration);

    // Check for rate limiting
    if (res.status === 429) {
      rateLimitedCount.add(1);
    }

    // Check for errors
    if (res.status >= 400 && res.status !== 429) {
      edgeFunctionErrors.add(1);
    }

    // Validate response
    const result = check(res, {
      [`${selectedEndpoint.name} — status 2xx or 429`]: (r) => r.status < 300 || r.status === 429,
      [`${selectedEndpoint.name} — response time < 10s`]: () => duration < 10000,
    });

    if (!result && res.status !== 429) {
      console.warn(`${selectedEndpoint.name} FAILED: status=${res.status} duration=${duration}ms body=${res.body?.substring(0, 200)}`);
    }
  });

  // Simulate real user think time
  sleep(Math.random() * 3 + 1); // 1-4 seconds between requests
}

// ── Teardown ───────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`[Teardown] Test completed. Started at: ${data.startTime}`);
  console.log(`[Teardown] Rate limited requests: ${rateLimitedCount}`);
}

// ── Summary report ─────────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    profile: PROFILE,
    config: profile,
    metrics: {
      totalRequests: data.metrics.http_reqs?.values?.count || 0,
      failedRequests: data.metrics.http_req_failed?.values?.rate || 0,
      avgDuration: data.metrics.http_req_duration?.values?.avg || 0,
      p95Duration: data.metrics.http_req_duration?.values["p(95)"] || 0,
      p99Duration: data.metrics.http_req_duration?.values["p(99)"] || 0,
      maxDuration: data.metrics.http_req_duration?.values?.max || 0,
      edgeFunctionP95: data.metrics.edge_function_duration?.values["p(95)"] || 0,
      edgeFunctionP99: data.metrics.edge_function_duration?.values["p(99)"] || 0,
      rateLimitedCount: data.metrics.rate_limited?.values?.count || 0,
      edgeFunctionErrors: data.metrics.edge_function_errors?.values?.rate || 0,
    },
    checks: data.metrics.checks
      ? {
          passed: data.metrics.checks.values.passes || 0,
          failed: data.metrics.checks.values.fails || 0,
        }
      : {},
    verdict: null,
  };

  // Pass/fail verdict
  const p95 = summary.metrics.p95Duration;
  const failedRate = summary.metrics.failedRequests;
  const checksFailed = summary.checks.failed || 0;

  if (p95 < 2000 && failedRate < 0.01 && checksFailed === 0) {
    summary.verdict = "PASS — System performs well under load";
  } else if (p95 < 5000 && failedRate < 0.05 && checksFailed < 10) {
    summary.verdict = "WARN — Acceptable but needs attention";
  } else {
    summary.verdict = "FAIL — System requires optimization before production";
  }

  return {
    "load-tests/results/edge-functions-summary.json": JSON.stringify(summary, null, 2),
    stdout: `\n=== EDGE FUNCTION LOAD TEST REPORT ===\nProfile: ${PROFILE} (${profile.vus} VUs, ${profile.duration})\nRequests: ${summary.metrics.totalRequests}\nP95: ${summary.metrics.p95Duration.toFixed(0)}ms | P99: ${summary.metrics.p99Duration.toFixed(0)}ms\nFailed: ${(failedRate * 100).toFixed(1)}%\nRate Limited: ${summary.metrics.rateLimitedCount}\nVerdict: ${summary.verdict}\n======================================\n`,
  };
}
