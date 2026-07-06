/**
 * k6 Load Test — Static Assets & Frontend
 *
 * Tests the Vite dev server / Netlify hosting for static asset delivery
 * under load. Simulates real user page loads with concurrent asset fetching.
 *
 * Run: k6 run -e PROFILE=load load-tests/k6-static-assets.js
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend, Rate } from "k6/metrics";

const config = JSON.parse(open("../load-tests/config.json"));
const BASE_URL = __ENV.BASE_URL || config.local.devServer || "http://localhost:5173";

const assetDuration = new Trend("asset_duration");
const assetErrors = new Rate("asset_errors");

const PROFILE = __ENV.PROFILE || "load";
const profile = config.testProfiles[PROFILE] || config.testProfiles.load;

export const options = {
  stages: [
    { duration: profile.rampUp || "30s", target: profile.vus },
    { duration: profile.duration, target: profile.vus },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    asset_duration: ["p(95)<500", "p(99)<1000"],
    asset_errors: ["rate<0.02"],
    http_req_failed: ["rate<0.05"],
  },
};

// ── Assets to test (simulating page load patterns) ────────────────────────

const STATIC_ASSETS = {
  // HTML entry point
  indexHtml: {
    path: "/",
    weight: 3,
    label: "index.html (entry point)",
  },

  // Main JS bundle (largest asset)
  mainJs: {
    path: "/dist/index.js",
    weight: 3,
    label: "Main JS bundle",
  },

  // CSS bundle
  mainCss: {
    path: "/dist/index.css",
    weight: 3,
    label: "Main CSS bundle",
  },

  // Data JSON files (critical for app function)
  scholarshipsJson: {
    path: "/data/scholarships.json",
    weight: 5,
    label: "Scholarships data (115 records)",
  },
  questionsJson: {
    path: "/data/questions.json",
    weight: 5,
    label: "Questions data (117 items)",
  },
  passagesJson: {
    path: "/data/passages.json",
    weight: 5,
    label: "Passages data (25 items)",
  },
  contentManifestJson: {
    path: "/data/content-manifest.json",
    weight: 3,
    label: "Content manifest",
  },

  // Practice routes (simulating navigation)
  practicePage: {
    path: "/practice",
    weight: 2,
    label: "Practice hub SPA route",
  },
  scholarshipPage: {
    path: "/scholarships",
    weight: 2,
    label: "Scholarship page SPA route",
  },
};

// ── Test function ───────────────────────────────────────────────────────────

export default function () {
  // Phase 1: Initial page load (bundle + critical data)
  group("Initial page load", () => {
    const criticalAssets = ["indexHtml", "mainJs", "mainCss", "contentManifestJson"];

    for (const key of criticalAssets) {
      const asset = STATIC_ASSETS[key];
      const start = Date.now();

      const res = http.get(`${BASE_URL}${asset.path}`, {
        tags: { asset: asset.label },
      });

      const duration = Date.now() - start;
      assetDuration.add(duration);

      if (res.status >= 400) {
        assetErrors.add(1);
      }

      check(res, {
        [`${asset.label} — status OK`]: (r) => r.status < 400,
        [`${asset.label} — response < 1s`]: () => duration < 1000,
      });
    }
  });

  sleep(1);

  // Phase 2: Data loading (simulating user navigating to practice)
  group("Data loading", () => {
    const dataAssets = ["scholarshipsJson", "questionsJson", "passagesJson"];
    const selected = dataAssets[Math.floor(Math.random() * dataAssets.length)];

    const asset = STATIC_ASSETS[selected];
    const start = Date.now();

    const res = http.get(`${BASE_URL}${asset.path}`, {
      tags: { asset: asset.label },
    });

    const duration = Date.now() - start;
    assetDuration.add(duration);

    if (res.status >= 400) assetErrors.add(1);

    check(res, {
      [`${asset.label} — status OK`]: (r) => r.status < 400,
      [`${asset.label} — response < 2s`]: () => duration < 2000,
      [`${asset.label} — valid JSON`]: (r) => {
        try { JSON.parse(r.body); return true; } catch { return false; }
      },
    });
  });

  sleep(2);

  // Phase 3: SPA route navigation
  group("SPA navigation", () => {
    const routeKeys = ["practicePage", "scholarshipPage"];
    const key = routeKeys[Math.floor(Math.random() * routeKeys.length)];

    const asset = STATIC_ASSETS[key];
    const start = Date.now();
    const res = http.get(`${BASE_URL}${asset.path}`, {
      headers: { "Accept": "text/html" },
    });
    const duration = Date.now() - start;
    assetDuration.add(duration);

    check(res, {
      [`${asset.label} — status OK`]: (r) => r.status < 400,
    });
  });

  sleep(Math.random() * 3);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    profile: PROFILE,
    baseUrl: BASE_URL,
    metrics: {
      totalAssetRequests: data.metrics.asset_duration?.values?.count || 0,
      avgAssetDuration: data.metrics.asset_duration?.values?.avg || 0,
      p95AssetDuration: data.metrics.asset_duration?.values["p(95)"] || 0,
      p99AssetDuration: data.metrics.asset_duration?.values["p(99)"] || 0,
      maxAssetDuration: data.metrics.asset_duration?.values?.max || 0,
      errorRate: data.metrics.asset_errors?.values?.rate || 0,
    },
    verdict: null,
  };

  const p95 = summary.metrics.p95AssetDuration;
  const errorRate = summary.metrics.errorRate;

  if (p95 < 500 && errorRate < 0.01) {
    summary.verdict = "PASS — Static assets deliver quickly under load";
  } else if (p95 < 1000 && errorRate < 0.05) {
    summary.verdict = "WARN — Acceptable but CDN/compression recommended";
  } else {
    summary.verdict = "FAIL — Static asset delivery needs optimization";
  }

  return {
    "load-tests/results/static-assets-summary.json": JSON.stringify(summary, null, 2),
    stdout: `\n=== STATIC ASSET LOAD TEST ===\nBase URL: ${BASE_URL}\nProfile: ${PROFILE}\nAsset Requests: ${summary.metrics.totalAssetRequests}\nP95: ${summary.metrics.p95AssetDuration.toFixed(0)}ms\nP99: ${summary.metrics.p99AssetDuration.toFixed(0)}ms\nError Rate: ${(errorRate * 100).toFixed(2)}%\nVerdict: ${summary.verdict}\n================================\n`,
  };
}
