#!/usr/bin/env bash
# =============================================================================
# LOCI Platform — Comprehensive Load Test Runner
#
# Runs all load tests (k6 + autocannon + Lighthouse) and compiles the report.
#
# Usage:
#   chmod +x load-tests/run-all-tests.sh
#   ./load-tests/run-all-tests.sh              # Full suite (load profile)
#   ./load-tests/run-all-tests.sh smoke        # Quick smoke test
#   ./load-tests/run-all-tests.sh stress       # Heavy stress test
#   ./load-tests/run-all-tests.sh spike        # Sudden spike test
# =============================================================================

set -e

PROFILE="${1:-load}"
RESULTS_DIR="load-tests/results"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")

echo "═══════════════════════════════════════════"
echo "  LOCI Platform — Load Test Suite"
echo "  Profile: $PROFILE"
echo "  Started: $TIMESTAMP"
echo "═══════════════════════════════════════════"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Check prerequisites
command -v k6 >/dev/null 2>&1 || { echo "ERROR: k6 is not installed. Install from https://k6.io/docs/get-started/installation/"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is not installed."; exit 1; }

echo ""
echo "[1/6] Checking prerequisites..."
echo "  k6 version: $(k6 version 2>&1 | head -1)"
echo "  node version: $(node --version)"
echo "  npm version: $(npm --version)"

# ── Test 1: Static Assets (local dev server) ────────────────────────────────
echo ""
echo "[2/6] Static Asset Load Test ($PROFILE profile)"
echo "────────────────────────────────────────────────"

# Check if dev server is running
DEV_SERVER_RUNNING=false
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null | grep -q "200\|304"; then
  DEV_SERVER_RUNNING=true
fi

if [ "$DEV_SERVER_RUNNING" = true ]; then
  k6 run -e PROFILE="$PROFILE" -e BASE_URL="http://localhost:5173" \
    --summary-export="$RESULTS_DIR/static-assets-$PROFILE-$TIMESTAMP.json" \
    load-tests/k6-static-assets.js 2>&1 | tee "$RESULTS_DIR/static-assets-$PROFILE-$TIMESTAMP.log"
  echo "  ✓ Static asset test complete"
else
  echo "  ⚠ Dev server not running at http://localhost:5173 — skipping static asset test"
  echo "  Start with: npm run dev"
fi

# ── Test 2: PostgREST / Database Queries ────────────────────────────────────
echo ""
echo "[3/6] Database Query Load Test ($PROFILE profile)"
echo "────────────────────────────────────────────────"

k6 run -e PROFILE="$PROFILE" \
  --summary-export="$RESULTS_DIR/postgrest-$PROFILE-$TIMESTAMP.json" \
  load-tests/k6-postgrest.js 2>&1 | tee "$RESULTS_DIR/postgrest-$PROFILE-$TIMESTAMP.log"
echo "  ✓ Database load test complete"

# ── Test 3: Edge Functions ──────────────────────────────────────────────────
echo ""
echo "[4/6] Edge Function Load Test ($PROFILE profile)"
echo "────────────────────────────────────────────────"

k6 run -e PROFILE="$PROFILE" \
  --summary-export="$RESULTS_DIR/edge-functions-$PROFILE-$TIMESTAMP.json" \
  load-tests/k6-edge-functions.js 2>&1 | tee "$RESULTS_DIR/edge-functions-$PROFILE-$TIMESTAMP.log"
echo "  ✓ Edge function load test complete"

# ── Test 4: Rate Limiting Verification ──────────────────────────────────────
echo ""
echo "[5/6] Rate Limiting Verification"
echo "────────────────────────────────────────────────"

k6 run \
  --summary-export="$RESULTS_DIR/rate-limiting-$PROFILE-$TIMESTAMP.json" \
  load-tests/k6-rate-limiting.js 2>&1 | tee "$RESULTS_DIR/rate-limiting-$PROFILE-$TIMESTAMP.log"
echo "  ✓ Rate limit verification complete"

# ── Test 5: autocannon Quick Benchmarks ─────────────────────────────────────
echo ""
echo "[6/6] autocannon Quick Benchmarks"
echo "────────────────────────────────────────────────"

node load-tests/autocannon-benchmarks.cjs 2>&1 | tee "$RESULTS_DIR/autocannon-$PROFILE-$TIMESTAMP.log"
echo "  ✓ autocannon benchmarks complete"

# ── Compile Final Report ────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  COMPILING FINAL TEST REPORT"
echo "═══════════════════════════════════════════"

node -e "
const fs = require('fs');
const path = require('path');
const resultsDir = '$RESULTS_DIR';

// Gather all summary files
const summaries = {};
const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('-summary.json') || f.endsWith('-$TIMESTAMP.json'));
for (const file of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(resultsDir, file), 'utf-8'));
    summaries[file] = data;
  } catch (e) {
    console.log('  Could not parse: ' + file);
  }
}

const report = {
  timestamp: '$TIMESTAMP',
  profile: '$PROFILE',
  summaries: Object.keys(summaries).length,
  results: summaries,
  overall: {
    totalTests: Object.keys(summaries).length,
    passed: Object.values(summaries).filter(s => s.verdict && s.verdict.startsWith('PASS')).length,
    failed: Object.values(summaries).filter(s => s.verdict && s.verdict.startsWith('FAIL')).length,
    warnings: Object.values(summaries).filter(s => s.verdict && s.verdict.startsWith('WARN')).length,
  },
};

fs.writeFileSync(
  path.join(resultsDir, 'final-report-$PROFILE-$TIMESTAMP.json'),
  JSON.stringify(report, null, 2)
);

console.log('Final report: load-tests/results/final-report-$PROFILE-$TIMESTAMP.json');
console.log(JSON.stringify(report.overall, null, 2));
"

echo ""
echo "═══════════════════════════════════════════"
echo "  LOAD TEST SUITE COMPLETE"
echo "  Results: $RESULTS_DIR/"
echo "═══════════════════════════════════════════"
