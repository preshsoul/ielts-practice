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

for (const check of checks) {
  try {
    const { stdout, stderr } = await execAsync(check.command, {
      maxBuffer: 10 * 1024 * 1024,
    });
    results.push({ ...check, ok: true, stdout, stderr });
  } catch (error) {
    results.push({
      ...check,
      ok: false,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      message: error.message,
    });
    break;
  }
}

const summary = {
  phase: "phase1",
  checks: results,
  passed: results.every((item) => item.ok),
};

const reportPath = await writeReport("phase1-latest", summary);
console.log(`Phase 1 report: ${reportPath}`);

if (!summary.passed) {
  process.exit(1);
}
