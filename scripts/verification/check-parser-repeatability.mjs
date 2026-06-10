import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const runs = 25;
const started = performance.now();
let failures = 0;

for (let index = 0; index < runs; index += 1) {
  const result = spawnSync(process.execPath, ["--use-system-ca", "scripts/test-backend-parser.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failures += 1;
    console.log(result.stdout);
    console.error(result.stderr);
    break;
  }
}

const elapsed = performance.now() - started;
console.log(JSON.stringify({
  runs,
  failures,
  avgMsPerRun: Number((elapsed / runs).toFixed(2)),
}, null, 2));

if (failures > 0) {
  process.exit(1);
}
