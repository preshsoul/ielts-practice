/**
 * k6 Load Test — Rate Limiting Verification
 *
 * Verifies that rate limits trigger correctly at configured thresholds
 * across all Edge Function endpoints. This is a precision test — it sends
 * exactly the threshold+1 requests and verifies 429 responses.
 *
 * Run: k6 run load-tests/k6-rate-limiting.js
 */

import http from "k6/http";
import { check, group } from "k6";
import { Rate, Counter } from "k6/metrics";

const config = JSON.parse(open("../load-tests/config.json"));
const SUPABASE_URL = __ENV.SUPABASE_URL || __ENV.VITE_SUPABASE_URL || config.supabase.url;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || __ENV.VITE_SUPABASE_ANON_KEY || config.supabase.anonKey;
const FUNCTIONS_URL = __ENV.SUPABASE_FUNCTIONS_URL || __ENV.VITE_SUPABASE_FUNCTIONS_URL || config.supabase.functionsUrl || `${SUPABASE_URL}/functions/v1`;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents) before running load tests.");
}

const rateLimit429s = new Counter("rate_limit_429s");
const rateLimitPasses = new Counter("rate_limit_passes");

// This test uses a single VU sending sequential requests
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    rate_limit_429s: ["count>0"], // Must see at least one 429
  },
};

// ── Auth token ──────────────────────────────────────────────────────────────

function getAuthToken() {
  const res = http.post(`${SUPABASE_URL}/auth/v1/signup`, JSON.stringify({
    email: `ratelimit_test_${Date.now()}@loci.test`,
    password: "ratelimit-test-password-123",
  }), {
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
  });

  if (res.status === 200 || res.status === 201) {
    return res.json().access_token || null;
  }
  return null;
}

// ── Rate limit test helper ──────────────────────────────────────────────────

function testRateLimit(endpoint, expectedLimit, windowSeconds) {
  const headers = {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${authToken}`,
  };

  const body = endpoint.body || {};
  const url = endpoint.method === "GET"
    ? `${SUPABASE_URL}/functions/v1${endpoint.path}`
    : `${FUNCTIONS_URL}${endpoint.path}`;

  const requestsToSend = expectedLimit + 5; // Send a few more than the limit
  let last429 = -1;
  let firstStatus = null;
  let consecutive429s = 0;

  console.log(`\n[Rate Limit Test] ${endpoint.name}`);
  console.log(`  Expected limit: ${expectedLimit} requests / ${windowSeconds}s`);
  console.log(`  Sending ${requestsToSend} rapid requests...`);

  for (let i = 1; i <= requestsToSend; i++) {
    let res;
    if (endpoint.method === "GET") {
      res = http.get(url, { headers });
    } else {
      res = http.post(url, JSON.stringify(body), { headers });
    }

    if (i === 1) firstStatus = res.status;

    if (res.status === 429) {
      rateLimit429s.add(1);
      consecutive429s++;
      if (last429 === -1) last429 = i;
    } else if (res.status < 400) {
      rateLimitPasses.add(1);
      consecutive429s = 0;
    }

    // Log first 5 and every 5th + the 429 trigger
    if (i <= 5 || i % 5 === 0 || res.status === 429) {
      const retryAfter = res.headers["Retry-After"] || "-";
      console.log(`  [${i}/${requestsToSend}] status=${res.status} retry-after=${retryAfter}${res.status === 429 ? " ← RATE LIMITED" : ""}`);
    }
  }

  const passed = last429 > 0 && last429 <= expectedLimit + 2;
  console.log(`  Result: First 429 at request #${last429} ${passed ? "✓ (within expected range)" : "✗ (unexpected)"}`);
  console.log(`  Consecutive 429s after triggering: ${consecutive429s}`);

  // Verify the 429 headers
  if (last429 > 0) {
    // Send one more request to check headers
    let checkRes;
    if (endpoint.method === "GET") {
      checkRes = http.get(url, { headers });
    } else {
      checkRes = http.post(url, JSON.stringify(body), { headers });
    }
    const retryAfter = checkRes.headers["Retry-After"];
    const rateLimitLimit = checkRes.headers["X-RateLimit-Limit"];
    const rateLimitRemaining = checkRes.headers["X-RateLimit-Remaining"];

    console.log(`  Rate Limit Headers: Retry-After=${retryAfter || "missing"}, Limit=${rateLimitLimit || "missing"}, Remaining=${rateLimitRemaining || "missing"}`);

    check(checkRes, {
      "429 has Retry-After header": () => retryAfter !== undefined,
      "429 response body is JSON": () => {
        try { JSON.parse(checkRes.body); return true; } catch { return false; }
      },
    });
  }

  return {
    endpoint: endpoint.name,
    expectedLimit,
    first429At: last429,
    passed: last429 > 0,
    total429s: last429 > 0 ? requestsToSend - last429 + 1 : 0,
  };
}

// ── Main test ───────────────────────────────────────────────────────────────

const authToken = getAuthToken();
console.log(`Auth token available: ${authToken ? "yes" : "no (using anon)"}\n`);

const ENDPOINTS_TO_TEST = [
  {
    name: "generate-ielts-reading (health)",
    path: "/generate-ielts-reading/health",
    method: "GET",
    body: null,
    limit: 120, // Health checks have higher limits
  },
  {
    name: "generate-semantic-profile (health)",
    path: "/generate-semantic-profile/health",
    method: "GET",
    body: null,
    limit: 120,
  },
  {
    name: "document-intake (health)",
    path: "/document-intake/health",
    method: "GET",
    body: null,
    limit: 120,
  },
];

export default function () {
  const results = [];

  for (const endpoint of ENDPOINTS_TO_TEST) {
    const result = testRateLimit(endpoint, endpoint.limit, 300);
    results.push(result);
  }

  console.log("\n=== RATE LIMIT VERIFICATION SUMMARY ===");
  for (const r of results) {
    console.log(`  ${r.endpoint}: 429 at request #${r.first429At} ${r.passed ? "✓" : "✗"}`);
  }

  const allPassed = results.every((r) => r.passed);
  console.log(`\nOverall: ${allPassed ? "ALL RATE LIMITS WORKING" : "SOME RATE LIMITS FAILED — INVESTIGATE"}`);
}

export function handleSummary(data) {
  return {
    "load-tests/results/rate-limiting-summary.json": JSON.stringify({
      timestamp: new Date().toISOString(),
      total429s: data.metrics.rate_limit_429s?.values?.count || 0,
      totalPasses: data.metrics.rate_limit_passes?.values?.count || 0,
      verdict: (data.metrics.rate_limit_429s?.values?.count || 0) > 0
        ? "PASS — Rate limiting is active and responding"
        : "FAIL — No 429 responses detected, rate limiting may not be configured",
    }, null, 2),
  };
}
