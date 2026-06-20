import { spawn } from "node:child_process";

const suites = [
  { name: "vitest", command: "npm run test:unit" },
  { name: "parser", command: "npm run test:parser" },
  { name: "pipeline", command: "npm run test:pipeline" },
  { name: "python", command: "python -m pytest backend/cv_extractor/tests --tb=short" },
];

function runSuite({ name, command }) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, {
      stdio: "inherit",
      shell: true,
    });

    child.on("exit", (code) => {
      const ms = Date.now() - startedAt;
      resolve({ name, ok: code === 0, code, ms });
    });

    child.on("error", (error) => {
      const ms = Date.now() - startedAt;
      resolve({ name, ok: false, code: null, ms, error: error.message });
    });
  });
}

const results = [];
let passedCount = 0;
let failedCount = 0;

for (const suite of suites) {
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Running ${suite.name}...`);
  console.log(`${'─'.repeat(40)}`);
  const result = await runSuite(suite);
  results.push(result);

  if (result.ok) {
    passedCount++;
    console.log(`\n  ✓ ${result.name} (${result.ms}ms)`);
  } else {
    failedCount++;
    console.log(`\n  ✗ ${result.name} (${result.ms}ms)${result.error ? ` — ${result.error}` : ` — exit code ${result.code}`}`);
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`Test All: ${passedCount} passed, ${failedCount} failed, ${suites.length} total`);
if (failedCount) {
  console.log(`Failed: ${results.filter((r) => !r.ok).map((r) => r.name).join(', ')}`);
}
console.log(`${'═'.repeat(50)}\n`);

if (failedCount > 0) {
  process.exit(1);
}
