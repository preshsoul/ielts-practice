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
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`Phase 2: ${passedCount} passed, ${failedCount} failed, ${checks.length} total`);
if (failedCount) {
  console.log(`Failed: ${results.filter((r) => !r.ok).map((r) => r.label).join(', ')}`);
}
console.log(`${'═'.repeat(50)}\n`);

const reportPath = await writeReport("phase2-latest", {
  phase: "phase2",
  checks: results,
  passed: failedCount === 0,
  counts: { passed: passedCount, failed: failedCount, total: checks.length },
});

console.log(`Phase 2 report: ${reportPath}`);

if (failedCount > 0) {
  process.exit(1);
}
