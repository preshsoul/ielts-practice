import { spawn } from "node:child_process";

const suites = [
  { name: "vitest", command: "npm run test:unit" },
  { name: "parser", command: "npm run test:parser" },
  { name: "pipeline", command: "npm run test:pipeline" },
  { name: "python", command: "python -m pytest backend/cv_extractor/tests" },
];

function runSuite({ name, command }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      stdio: "inherit",
      shell: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${name} failed with exit code ${code}`));
    });
  });
}

for (const suite of suites) {
  console.log(`\n=== Running ${suite.name} ===`);
  await runSuite(suite);
}
