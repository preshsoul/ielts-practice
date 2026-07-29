/**
 * k6 Load Test — Supabase PostgREST / Database
 *
 * Tests database query performance under load via the PostgREST API.
 * Simulates real user patterns: loading scholarships, passages, questions,
 * and writing practice sessions.
 *
 * Run: k6 run -e PROFILE=stress load-tests/k6-postgrest.js
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend, Rate } from "k6/metrics";

const config = JSON.parse(open("../load-tests/config.json"));
const SUPABASE_URL = __ENV.SUPABASE_URL || __ENV.VITE_SUPABASE_URL || config.supabase.url;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || __ENV.VITE_SUPABASE_ANON_KEY || config.supabase.anonKey;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_ equivalents) before running load tests.");
}

const dbQueryDuration = new Trend("db_query_duration");
const dbErrors = new Rate("db_errors");

const PROFILE = __ENV.PROFILE || "load";
const profile = config.testProfiles[PROFILE] || config.testProfiles.load;

export const options = {
  stages: [
    { duration: profile.rampUp || "30s", target: profile.vus },
    { duration: profile.duration, target: profile.vus },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    db_query_duration: ["p(95)<1000", "p(99)<3000"],
    db_errors: ["rate<0.02"],
    http_req_failed: ["rate<0.05"],
  },
};

const REST_HEADERS = {
  apikey: ANON_KEY,
  "Content-Type": "application/json",
};

// ── Query templates (simulating real user patterns) ──────────────────────

const QUERIES = {
  // Scholarship list (most frequent — dashboard + scholarship page)
  getScholarships: {
    weight: 5,
    url: () => `${SUPABASE_URL}/rest/v1/scholarships?select=id,name,awardingBody,country,deadline,eligibility,coverage&active=eq.true&order=created_at.desc&limit=20`,
    method: "GET",
    label: "List scholarships (20 records)",
  },

  // Single scholarship detail (matching detail view)
  getSingleScholarship: {
    weight: 2,
    url: () => `${SUPABASE_URL}/rest/v1/scholarships?select=*&active=eq.true&limit=1`,
    method: "GET",
    label: "Single scholarship detail",
  },

  // Scholarship search with filters (heavy query)
  searchScholarships: {
    weight: 3,
    url: () => {
      const disciplines = ["Computer Science", "Engineering", "Law", "Medicine", "Business"];
      const discipline = disciplines[Math.floor(Math.random() * disciplines.length)];
      return `${SUPABASE_URL}/rest/v1/scholarships?select=id,name,awardingBody,country,deadline,eligibility,coverage,search_text&active=eq.true&or=(eligibility_tags.cs.%7B${encodeURIComponent(discipline)}%7D,name.ilike.*${encodeURIComponent(discipline.slice(0, 4))}*)&limit=10`;
    },
    method: "GET",
    label: "Search scholarships (filtered)",
  },

  // Passages + Questions (practice loading)
  getPassages: {
    weight: 4,
    url: () => `${SUPABASE_URL}/rest/v1/passages?select=id,title,topic&active=eq.true&limit=10`,
    method: "GET",
    label: "List passages",
  },
  getQuestions: {
    weight: 4,
    url: () => `${SUPABASE_URL}/rest/v1/questions?select=id,exam,section,difficulty,question_text,options,answer,explanation&active=eq.true&verified=eq.true&limit=20`,
    method: "GET",
    label: "List questions (20 records)",
  },

  // Universities (reference data — cached in production)
  getUniversities: {
    weight: 1,
    url: () => `${SUPABASE_URL}/rest/v1/universities?select=*&limit=50`,
    method: "GET",
    label: "List universities",
  },

  // Write practice session (simulate session completion)
  writePracticeSession: {
    weight: 2,
    url: () => `${SUPABASE_URL}/rest/v1/practice_sessions`,
    method: "POST",
    body: () => JSON.stringify({
      client_session_id: `loadtest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      exam: "IELTS",
      score: Math.floor(Math.random() * 15) + 5,
      total: 20,
      module: "reading",
      mode: "practice",
      component: "Reading quiz",
      session_data: {
        results: Array.from({ length: 20 }, (_, i) => ({
          qid: `q${i + 1}`,
          section: "Reading - T/F/NG",
          correct: Math.random() > 0.3,
        })),
      },
    }),
    label: "Write practice session",
    requiresAuth: true,
  },
};

// ── Auth helper ────────────────────────────────────────────────────────────

function generateAuthHeaders() {
  const token = __ENV.AUTH_TOKEN || "";
  if (!token) return REST_HEADERS;
  return {
    ...REST_HEADERS,
    Authorization: `Bearer ${token}`,
  };
}

// ── Test setup ─────────────────────────────────────────────────────────────

export function setup() {
  const res = http.get(`${SUPABASE_URL}/rest/v1/scholarships?select=count&active=eq.true`, { headers: REST_HEADERS });
  console.log(`[Setup] Scholarship count check: status=${res.status}`);

  // Verify tables exist
  const tables = ["passages", "questions", "universities", "practice_sessions"];
  for (const table of tables) {
    const r = http.get(`${SUPABASE_URL}/rest/v1/${table}?select=count&limit=1`, { headers: REST_HEADERS });
    console.log(`[Setup] ${table}: status=${r.status}`);
  }

  return { startTime: new Date().toISOString() };
}

// ── Main test function ─────────────────────────────────────────────────────

export default function () {
  // Weighted query selection
  const totalWeight = Object.values(QUERIES).reduce((sum, q) => sum + q.weight, 0);
  let random = Math.random() * totalWeight;
  let selected = null;
  for (const [name, query] of Object.entries(QUERIES)) {
    random -= query.weight;
    if (random <= 0) { selected = { name, ...query }; break; }
  }
  if (!selected) selected = { name: "getScholarships", ...QUERIES.getScholarships };

  group(selected.label, () => {
    const url = selected.url();
    const method = selected.method;
    const body = selected.body ? selected.body() : null;
    const headers = selected.requiresAuth ? generateAuthHeaders() : REST_HEADERS;

    const start = Date.now();
    let res;

    if (method === "GET") {
      res = http.get(url, { headers, tags: { query: selected.label } });
    } else {
      res = http.post(url, body, { headers, tags: { query: selected.label } });
    }

    const duration = Date.now() - start;
    dbQueryDuration.add(duration);

    if (res.status >= 400) {
      dbErrors.add(1);
    }

    check(res, {
      [`${selected.label} — status OK`]: (r) => r.status < 400,
      [`${selected.label} — response < 3s`]: () => duration < 3000,
    });
  });

  sleep(Math.random() * 2 + 0.5); // 0.5-2.5s think time
}

// ── Summary ─────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    profile: PROFILE,
    metrics: {
      totalDBQueries: data.metrics.db_query_duration?.values?.count || 0,
      avgQueryDuration: data.metrics.db_query_duration?.values?.avg || 0,
      p95QueryDuration: data.metrics.db_query_duration?.values["p(95)"] || 0,
      p99QueryDuration: data.metrics.db_query_duration?.values["p(99)"] || 0,
      maxQueryDuration: data.metrics.db_query_duration?.values?.max || 0,
      dbErrorRate: data.metrics.db_errors?.values?.rate || 0,
      totalErrors: data.metrics.http_req_failed?.values?.passes
        ? (data.metrics.http_req_failed?.values?.rate || 0) * (data.metrics.http_reqs?.values?.count || 1)
        : 0,
    },
    verdict: null,
  };

  const p95 = summary.metrics.p95QueryDuration;
  const errorRate = summary.metrics.dbErrorRate;

  if (p95 < 500 && errorRate < 0.01) {
    summary.verdict = "PASS — Database queries are fast under load";
  } else if (p95 < 1000 && errorRate < 0.05) {
    summary.verdict = "WARN — Acceptable query performance, monitor under growth";
  } else {
    summary.verdict = "FAIL — Database queries need optimization (indexing, query patterns)";
  }

  return {
    "load-tests/results/postgrest-summary.json": JSON.stringify(summary, null, 2),
    stdout: `\n=== POSTGREST DATABASE LOAD TEST ===\nProfile: ${PROFILE} (${profile.vus} VUs)\nDB Queries: ${summary.metrics.totalDBQueries}\nP95: ${summary.metrics.p95QueryDuration.toFixed(0)}ms | P99: ${summary.metrics.p99QueryDuration.toFixed(0)}ms\nError Rate: ${(errorRate * 100).toFixed(2)}%\nVerdict: ${summary.verdict}\n======================================\n`,
  };
}
