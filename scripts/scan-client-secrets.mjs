import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");

const forbiddenEnvKeys = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "CV_PARSER_DATABASE_URL",
  "DATABASE_URL",
];

const allowlistedPublicKeys = new Set([
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_FUNCTIONS_URL",
  "VITE_CV_EXTRACTOR_URL",
  "VITE_APP_OWNER",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function readConfiguredSecretValues() {
  return forbiddenEnvKeys
    .map((key) => [key, String(process.env[key] || "").trim()])
    .filter(([, value]) => value.length >= 8);
}

async function main() {
  const files = await walk(distDir);
  const textFiles = files.filter((file) => /\.(html|js|css|json|txt|map)$/i.test(file));
  const configuredSecrets = readConfiguredSecretValues();
  const findings = [];

  for (const file of textFiles) {
    const content = await readFile(file, "utf8");

    for (const key of forbiddenEnvKeys) {
      if (allowlistedPublicKeys.has(key)) continue;
      if (content.includes(key)) {
        findings.push(`${file} contains forbidden key name ${key}`);
      }
    }

    for (const [key, value] of configuredSecrets) {
      if (allowlistedPublicKeys.has(key)) continue;
      if (content.includes(value)) {
        findings.push(`${file} contains the configured secret value for ${key}`);
      }
    }
  }

  if (findings.length) {
    console.error("Client secret scan failed:");
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }

  console.log("Client secret scan passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
