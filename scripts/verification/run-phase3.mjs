import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeReport } from "./report-writer.mjs";

const execAsync = promisify(exec);

const checks = [
  { id: "phase1", command: "npm run verify:phase1" },
  { id: "phase2", command: "npm run verify:phase2" },
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
  phase: "phase3",
  checks: results,
  passed: results.every((item) => item.ok),
};

const reportPath = await writeReport("phase3-latest", summary);
console.log(`Phase 3 report: ${reportPath}`);

if (!summary.passed) {
  process.exit(1);
}
