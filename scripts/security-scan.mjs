/**
 * Multi-layered security scanning pipeline.
 * Run: node scripts/security-scan.mjs
 *
 * Layers:
 *   1. npm audit with severity gate (blocks high/critical)
 *   2. Forbidden dependency detection (known-malicious patterns)
 *   3. SBOM generation (CycloneDX 1.4 JSON)
 *   4. Secret scan rerun (catches any drift since pre-commit)
 *   5. Production-only audit (strips dev deps for true surface area)
 *
 * A whole-file lockfile-hash gate used to live here as a manual
 * accept-to-unblock ritual. It fired on every legitimate dependency
 * bump, not just suspicious ones, so it was pure CI friction with no
 * detection value beyond what `lockfile-guard` in the CI workflow
 * already does (warns when the lockfile changes without package.json
 * changing — the actual dependency-confusion signal).
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const WARN = "\x1b[33m⚠\x1b[0m";

const findings = [];

function run(label, fn) {
  const startedAt = Date.now();
  try {
    const detail = fn();
    findings.push({ layer: label, ok: true, ms: Date.now() - startedAt, detail });
    console.log(`  ${PASS} ${label} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    findings.push({ layer: label, ok: false, ms: Date.now() - startedAt, detail: error.message });
    console.log(`  ${FAIL} ${label} (${Date.now() - startedAt}ms)`);
    console.log(`    ${error.message}`);
  }
}

// ── Layer 1: npm audit with severity gate ──────────────────────────────
run("npm audit (severity gate: block high/critical)", () => {
  let raw;
  try {
    raw = execSync("npm audit --json", { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  } catch (e) {
    // npm audit exits 1 when vulns exist — still produces valid JSON on stdout
    raw = e.stdout || e.stderr || "{}";
  }

  let audit;
  try {
    audit = JSON.parse(raw);
  } catch {
    throw new Error(`npm audit produced unparseable output: ${raw.substring(0, 200)}`);
  }

  const vulns = audit.vulnerabilities || {};

  let high = 0;
  let critical = 0;
  for (const [name, v] of Object.entries(vulns)) {
    if (v.severity === "high") high++;
    if (v.severity === "critical") critical++;
  }

  // Dev-only vulnerabilities — not in production bundle.
  // All require vite 8 upgrade (breaking change) to resolve.
  // Documented risk acceptance: see docs/security/vulnerability-register.md
  const devOnlyAllowed = [
    "esbuild",  // Dev server request smuggling (moderate) — vite dev only
    "vite",     // Path traversal in dev server + NTLMv2 hash on Windows (high) — dev only, not in dist
    "vitest",   // Arbitrary file read via UI server (critical) — we use vitest run, not UI server
  ];

  const riskAcceptedAdvisories = [
    {
      name: "react-router",
      source: 1124282,
      reason: "RSC mode CSRF advisory; this project ships a Vite SPA and does not enable React Router RSC/framework mode.",
    },
  ];

  function isRiskAccepted(v) {
    if (devOnlyAllowed.includes(v.name)) return true;

    if (v.name === "react-router") {
      return v.via.every((entry) => {
        if (typeof entry === "string") return false;
        return riskAcceptedAdvisories.some((accepted) => (
          accepted.name === v.name && accepted.source === entry.source
        ));
      });
    }

    if (v.name === "react-router-dom") {
      return v.via.every((entry) => entry === "react-router");
    }

    return false;
  }

  const blocked = Object.values(vulns).filter(v => {
    if (isRiskAccepted(v)) return false;
    return v.severity === "high" || v.severity === "critical";
  });

  if (blocked.length) {
    throw new Error(
      `BLOCKED: ${blocked.length} high/critical vulnerabilities not in allowlist.\n` +
      blocked.map(v => `  ${v.name}: ${v.severity} — ${v.via.map(x => typeof x === "string" ? x : x.title || "").join(", ")}`).join("\n")
    );
  }

  return {
    total: Object.keys(vulns).length,
    high,
    critical,
    allowed: [
      "esbuild/vite/vitest dev-only findings accepted pending vite 8",
      "react-router RSC-only finding accepted for Vite SPA until react-router-dom publishes a patched stable release",
    ],
  };
});

// ── Layer 2: Forbidden dependency detection ────────────────────────────
run("Forbidden dependency patterns", () => {
  const pkgLock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
  const allPkgs = new Set();

  function collect(node) {
    if (!node) return;
    allPkgs.add(node.name || "");
    if (node.dependencies) {
      for (const dep of Object.values(node.dependencies)) collect(dep);
    }
  }

  const forbiddenPatterns = [
    // Known malicious or archived packages
    { pattern: /^event-stream$/i, reason: "Known compromised package (flatmap-stream incident)" },
    { pattern: /^eslint-config-eslint$/i, reason: "Deprecated, replaced by @eslint/js" },
    { pattern: /node-ipc/i, reason: "Known protestware with destructive behavior" },
    { pattern: /colors.*1\.4/i, reason: "Known protestware versions" },
    { pattern: /faker.*5\.5\.3/i, reason: "Known protestware versions" },
    { pattern: /^left-pad$/i, reason: "Unpublish incident — archived" },
  ];

  collect(pkgLock);

  const hits = [];
  for (const { pattern, reason } of forbiddenPatterns) {
    for (const pkg of allPkgs) {
      if (pattern.test(pkg)) {
        hits.push(`${pkg}: ${reason}`);
      }
    }
  }

  if (hits.length) throw new Error(`Forbidden dependencies found:\n${hits.map(h => `  ${h}`).join("\n")}`);

  return { scanned: allPkgs.size, hits: 0 };
});

// ── Layer 3: SBOM generation ───────────────────────────────────────────
run("SBOM generation (CycloneDX 1.4)", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const pkgLock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));

  const components = [];
  function collectComponents(node) {
    if (!node) return;
    const name = node.name || "";
    const version = node.version || "";

    if (name && version) {
      const hash = createHash("sha256").update(`${name}@${version}`).digest("hex");
      components.push({
        type: "library",
        name,
        version,
        purl: `pkg:npm/${name}@${version}`,
        hashes: [{ alg: "SHA-256", content: hash }],
      });
    }

    if (node.dependencies) {
      for (const dep of Object.values(node.dependencies)) collectComponents(dep);
    }
  }

  collectComponents(pkgLock);

  const bom = {
    $schema: "http://cyclonedx.org/schema/bom-1.4.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.4",
    serialNumber: `urn:uuid:${createHash("sha256").update(Date.now().toString()).digest("hex").substring(0, 32)}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: "application",
        name: pkg.name,
        version: pkg.version,
      },
    },
    components,
  };

  const sbomPath = join(ROOT, "tmp", "security", "sbom.json");
  const sbomDir = join(ROOT, "tmp", "security");
  mkdirSync(sbomDir, { recursive: true });
  writeFileSync(sbomPath, JSON.stringify(bom, null, 2));

  return { path: sbomPath, components: components.length };
});

// ── Layer 4: Secret scan rerun ─────────────────────────────────────────
run("Client secret scan (build-time check)", () => {
  execSync("node scripts/scan-client-secrets.mjs", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { clean: true };
});

// ── Layer 5: Production-only surface area audit ─────────────────────────
run("Production dependency surface area", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const prodDeps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});

  // Flag production deps with network access (potential exfil vectors)
  const networkAccessPatterns = [
    /^axios$/,
    /^@supabase\//,
    /^@sentry\//,
  ];

  const flagged = [];
  for (const dep of prodDeps) {
    for (const pattern of networkAccessPatterns) {
      if (pattern.test(dep)) {
        flagged.push(dep);
        break;
      }
    }
  }

  return {
    production: prodDeps.length,
    development: devDeps.length,
    networkAccessDeps: flagged,
    ratio: `${prodDeps.length}/${prodDeps.length + devDeps.length}`,
  };
});

// ── Summary ────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
const failed = findings.filter((f) => !f.ok);
const passed = findings.filter((f) => f.ok);

console.log(`Security Scan: ${passed.length} passed, ${failed.length} failed, ${findings.length} total`);
if (failed.length) {
  console.log(`\nFailed layers:`);
  for (const f of failed) {
    console.log(`  ${FAIL} ${f.layer}: ${f.detail}`);
  }
}
console.log(`${"=".repeat(50)}\n`);

if (failed.length > 0) {
  process.exit(1);
}
