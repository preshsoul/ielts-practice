import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeReport } from "./report-writer.mjs";

const execAsync = promisify(exec);

const checks = [
  {
    id: "hosted-supabase-smoke",
    label: "Hosted Supabase auth, database, and function smoke checks",
    command: "node --use-system-ca scripts/verification/check-supabase-hosted.mjs",
    safety: "controlled-live-write",
    evidence: "smoke",
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
  }
}

const reportPath = await writeReport("phase2-latest", {
  phase: "phase2",
  checks: results,
  passed: results.every((item) => item.ok),
});

console.log(`Phase 2 report: ${reportPath}`);

if (results.some((item) => !item.ok)) {
  process.exit(1);
}
