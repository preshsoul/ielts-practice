import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeReport } from "./report-writer.mjs";

const execAsync = promisify(exec);

const checks = [
  {
    id: "unit",
    label: "Vitest and integration tests",
    command: "npm run test:unit",
    risk: "high",
    safety: "read-only",
    evidence: "test",
  },
  {
    id: "parser",
    label: "Parser contract checks",
    command: "npm run test:parser",
    risk: "high",
    safety: "read-only",
    evidence: "test",
  },
  {
    id: "pipeline",
    label: "Pipeline checks",
    command: "npm run test:pipeline",
    risk: "medium",
    safety: "read-only",
    evidence: "test",
  },
  {
    id: "parser-faker",
    label: "Parser faker stress",
    command: "npm run test:parser:faker -- 100",
    risk: "high",
    safety: "read-only",
    evidence: "stress",
  },
  {
    id: "parser-repeatability",
    label: "Repeated parser contract runs",
    command: "node scripts/verification/check-parser-repeatability.mjs",
    risk: "high",
    safety: "read-only",
    evidence: "stress",
  },
  {
    id: "matcher-scenarios",
    label: "Matcher scenario sweeps",
    command: "node scripts/verification/check-matcher-scenarios.mjs",
    risk: "high",
    safety: "read-only",
    evidence: "stress",
  },
  {
    id: "build",
    label: "Production build",
    command: "npm run build",
    risk: "high",
    safety: "read-only",
    evidence: "build",
  },
];

const results = [];
let passedCount = 0;
let failedCount = 0;

for (const check of checks) {
  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execAsync(check.command, {
      maxBuffer: 10 * 1024 * 1024,
    });
    const ms = Date.now() - startedAt;
    results.push({ ...check, ok: true, stdout, stderr, ms });
    passedCount++;
    console.log(`  ✓ ${check.label} (${ms}ms)`);
  } catch (error) {
    const ms = Date.now() - startedAt;
    results.push({
      ...check,
      ok: false,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      message: error.message,
      ms,
    });
    failedCount++;
    console.log(`  ✗ ${check.label} (${ms}ms)`);
    // Continue running remaining checks — collect all results before reporting.
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`Phase 1: ${passedCount} passed, ${failedCount} failed, ${checks.length} total`);
if (failedCount) {
  console.log(`Failed: ${results.filter((r) => !r.ok).map((r) => r.label).join(', ')}`);
}
console.log(`${'═'.repeat(50)}\n`);

const summary = {
  phase: "phase1",
  checks: results,
  passed: failedCount === 0,
  counts: { passed: passedCount, failed: failedCount, total: checks.length },
};

const reportPath = await writeReport("phase1-latest", summary);
console.log(`Phase 1 report: ${reportPath}`);

if (!summary.passed) {
  process.exit(1);
}
