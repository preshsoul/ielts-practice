# Comprehensive Verification Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a serious verification program for Loci that checks local/runtime correctness, live Supabase sanity, deployed endpoint health, and repeatable automation in the order `audit-first`, `production-first`, `test-suite-first`.

**Architecture:** The implementation is split into four verification layers: local orchestration, synthetic parser/matcher stress, read-only Supabase SQL audits, and reusable reporting/runbook automation. Each layer produces structured evidence artifacts so we can distinguish raw execution from findings and keep production mutation out of the default path.

**Tech Stack:** Node.js ESM scripts, Vitest, Python pytest, Supabase SQL, Artillery, Markdown runbooks, PowerShell/npm

---

## File Map

- `package.json`
  Purpose: expose canonical verification entrypoints for local, database, and production checks.
- `scripts/verification/run-phase1.mjs`
  Purpose: orchestrate audit-first local verification with structured output.
- `scripts/verification/run-phase2.mjs`
  Purpose: orchestrate production-first Supabase and endpoint checks in read-only mode.
- `scripts/verification/run-phase3.mjs`
  Purpose: orchestrate automation-focused verification bundles and report generation.
- `scripts/verification/report-writer.mjs`
  Purpose: normalize findings into JSON and Markdown summaries.
- `scripts/verification/check-endpoints.mjs`
  Purpose: run smoke checks against local or deployed parser/auth endpoints.
- `scripts/verification/check-matcher-scenarios.mjs`
  Purpose: centralize scholarship matcher scenario sweeps.
- `scripts/verification/check-parser-repeatability.mjs`
  Purpose: centralize repeated parser contract runs and summarize timing/failures.
- `supabase/sql/verification/00_auth_users_sanity.sql`
  Purpose: read-only audit of auth user anomalies.
- `supabase/sql/verification/01_profiles_sanity.sql`
  Purpose: read-only audit of profile and candidate data anomalies.
- `supabase/sql/verification/02_parser_jobs_sanity.sql`
  Purpose: read-only audit of parser jobs, drafts, and canonical payload consistency.
- `supabase/sql/verification/03_user_records_sanity.sql`
  Purpose: read-only audit of shortlist/application integrity.
- `supabase/sql/verification/04_rls_inventory.sql`
  Purpose: inventory exposed schemas, tables, and RLS posture.
- `docs/verification/matrix.md`
  Purpose: human-readable verification matrix by surface, risk, and evidence type.
- `docs/verification/runbook.md`
  Purpose: operator guide for running all phases safely.
- `docs/verification/report-template.md`
  Purpose: consistent findings report structure.
- `src/integration/parserFakerUsers.test.js`
  Purpose: existing parser faker contract coverage; extend only if needed.
- `scripts/test-parser-faker-stress.mjs`
  Purpose: existing parser synthetic stress surface; wire into the new orchestration layer.
- `load-tests/artillery.yml`
  Purpose: existing backend load test definition to be wrapped rather than duplicated.
- `load-tests/artillery-edge.yml`
  Purpose: deployed-edge load test definition to be reused for approved targets.

---

### Task 1: Build The Verification Matrix And Phase Entry Points

**Files:**
- Create: `docs/verification/matrix.md`
- Create: `scripts/verification/run-phase1.mjs`
- Create: `scripts/verification/report-writer.mjs`
- Modify: `package.json`
- Test: `node scripts/verification/run-phase1.mjs`

- [ ] **Step 1: Write the failing matrix contract and phase runner shell**

Create `scripts/verification/run-phase1.mjs`:

```js
import { writeReport } from "./report-writer.mjs";

const checks = [
  { id: "unit", label: "Vitest and integration tests", command: "npm run test:unit" },
  { id: "parser", label: "Parser contract checks", command: "npm run test:parser" },
  { id: "pipeline", label: "Pipeline checks", command: "npm run test:pipeline" },
  { id: "parser-faker", label: "Parser faker stress", command: "npm run test:parser:faker -- 100" },
  { id: "build", label: "Production build", command: "npm run build" },
];

throw new Error("Phase 1 runner not implemented yet");
```

Create `scripts/verification/report-writer.mjs`:

```js
export async function writeReport(_name, _payload) {
  throw new Error("writeReport not implemented yet");
}
```

Create `docs/verification/matrix.md`:

```md
# Verification Matrix

| Phase | Surface | Check | Risk | Safety | Evidence |
|------|---------|-------|------|--------|----------|
| 1 | parser | parser faker stress | high | read-only | stress |
```

- [ ] **Step 2: Run the phase-1 runner to verify it fails**

Run: `node scripts/verification/run-phase1.mjs`

Expected: FAIL with `Phase 1 runner not implemented yet`

- [ ] **Step 3: Implement the minimal orchestration and matrix wiring**

Replace `scripts/verification/report-writer.mjs`:

```js
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function writeReport(name, payload) {
  const jsonPath = resolve("tmp", "verification", `${name}.json`);
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return jsonPath;
}
```

Replace `scripts/verification/run-phase1.mjs`:

```js
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeReport } from "./report-writer.mjs";

const execAsync = promisify(exec);

const checks = [
  { id: "unit", label: "Vitest and integration tests", command: "npm run test:unit", risk: "high", safety: "read-only", evidence: "test" },
  { id: "parser", label: "Parser contract checks", command: "npm run test:parser", risk: "high", safety: "read-only", evidence: "test" },
  { id: "pipeline", label: "Pipeline checks", command: "npm run test:pipeline", risk: "medium", safety: "read-only", evidence: "test" },
  { id: "parser-faker", label: "Parser faker stress", command: "npm run test:parser:faker -- 100", risk: "high", safety: "read-only", evidence: "stress" },
  { id: "build", label: "Production build", command: "npm run build", risk: "high", safety: "read-only", evidence: "build" },
];

const results = [];

for (const check of checks) {
  try {
    const { stdout, stderr } = await execAsync(check.command, { maxBuffer: 10 * 1024 * 1024 });
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
```

Update `package.json`:

```json
{
  "scripts": {
    "verify:phase1": "node scripts/verification/run-phase1.mjs"
  }
}
```

Expand `docs/verification/matrix.md`:

```md
# Verification Matrix

| Phase | Surface | Check | Risk | Safety | Evidence |
|------|---------|-------|------|--------|----------|
| 1 | frontend | route and workflow tests | high | read-only | test |
| 1 | parser | parser contract checks | high | read-only | test |
| 1 | parser | parser faker stress | high | read-only | stress |
| 1 | matcher | matcher scenario sweeps | high | read-only | stress |
| 1 | pipeline | pipeline scripts | medium | read-only | test |
| 1 | build | production build and secret scan | high | read-only | build |
```

- [ ] **Step 4: Run the phase-1 runner to verify it passes**

Run: `node scripts/verification/run-phase1.mjs`

Expected: PASS and print a report path under `tmp/verification/`

- [ ] **Step 5: Commit**

```bash
git add docs/verification/matrix.md package.json scripts/verification/run-phase1.mjs scripts/verification/report-writer.mjs
git commit -m "feat: add phase 1 verification orchestration"
```

### Task 2: Harden Parser And Matcher Stress Coverage

**Files:**
- Create: `scripts/verification/check-parser-repeatability.mjs`
- Create: `scripts/verification/check-matcher-scenarios.mjs`
- Modify: `scripts/verification/run-phase1.mjs`
- Test: `node scripts/verification/check-parser-repeatability.mjs`

- [ ] **Step 1: Write the failing parser and matcher stress wrappers**

Create `scripts/verification/check-parser-repeatability.mjs`:

```js
throw new Error("parser repeatability check not implemented");
```

Create `scripts/verification/check-matcher-scenarios.mjs`:

```js
throw new Error("matcher scenario check not implemented");
```

- [ ] **Step 2: Run each script to verify it fails**

Run: `node scripts/verification/check-parser-repeatability.mjs`
Expected: FAIL with `parser repeatability check not implemented`

Run: `node scripts/verification/check-matcher-scenarios.mjs`
Expected: FAIL with `matcher scenario check not implemented`

- [ ] **Step 3: Implement the minimal wrappers around the existing stress surfaces**

Replace `scripts/verification/check-parser-repeatability.mjs`:

```js
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

if (failures > 0) process.exit(1);
```

Replace `scripts/verification/check-matcher-scenarios.mjs`:

```js
import { execSync } from "node:child_process";

const output = execSync(
  "@'\n" +
  "import { performance } from 'node:perf_hooks';\n" +
  "import { buildOfflineSemanticProfile } from './src/lib/offlineSemanticProfile.js';\n" +
  "import { rankScholarships, normalizeStructuredProfile } from './src/services/scoringEngine.js';\n" +
  "import { createExtractedCandidateProfile } from './src/lib/candidateProfile.js';\n" +
  "import { readFileSync } from 'node:fs';\n" +
  "const scholarshipsRaw = JSON.parse(readFileSync(new URL('./public/data/scholarships.json', import.meta.url), 'utf8'));\n" +
  "const catalog = Array.isArray(scholarshipsRaw?.records) ? scholarshipsRaw.records : [];\n" +
  "const candidate = { nationality: 'Nigeria', discipline: 'Computer Science', degreeClass: 'Second Class Upper', ielts: 7.5, workExperienceYears: 2, targets: ['UK', 'Canada'] };\n" +
  "const intake = { extractedText: 'Address-rich candidate text', extractedExcerpt: 'Computer Science', sourceFilename: 'scenario.txt', keywords: ['Computer Science'], confidence: 0.82, rawTextHash: 'scenario-1', parsedProfile: { identity: { nationality: candidate.nationality, countryOfResidence: candidate.nationality }, academic: { institution: 'Test University', discipline: candidate.discipline, disciplineCategory: candidate.discipline, graduationYear: 2024, degreeClass: candidate.degreeClass }, professional: { workExperienceYears: candidate.workExperienceYears }, languageTests: { ielts: candidate.ielts }, applicationCycle: '2026', targetDegreeLevel: 'Master\\'s', targetDisciplines: [candidate.discipline], targetCountries: candidate.targets }, provenance: { parser_version: 'cv-parser-v2', method: 'scenario-check' } };\n" +
  "const extracted = createExtractedCandidateProfile(intake);\n" +
  "const semantic = buildOfflineSemanticProfile({ ...intake.parsedProfile, targetDisciplines: intake.parsedProfile.targetDisciplines.join(', '), targetCountries: intake.parsedProfile.targetCountries.join(', ') }, { rawText: intake.extractedText, keywords: intake.keywords });\n" +
  "const scoringProfile = normalizeStructuredProfile({ ...intake.parsedProfile, semanticText: semantic.semanticText, semanticKeywords: semantic.keywords, candidateProfile: { extracted } });\n" +
  "const ranked = rankScholarships(catalog, scoringProfile, { limit: 5 });\n" +
  "const scored = Array.isArray(ranked?.scored) ? ranked.scored : [];\n" +
  "console.log(JSON.stringify({ catalogSize: catalog.length, scored: scored.length, topScore: scored[0]?.analysis?.score ?? null }, null, 2));\n" +
  "'@ | node --input-type=module -",
  { encoding: "utf8", shell: "powershell" }
);

process.stdout.write(output);
```

Update `scripts/verification/run-phase1.mjs` check list to include:

```js
  { id: "parser-repeatability", label: "Repeated parser contract runs", command: "node scripts/verification/check-parser-repeatability.mjs", risk: "high", safety: "read-only", evidence: "stress" },
  { id: "matcher-scenarios", label: "Matcher scenario sweeps", command: "node scripts/verification/check-matcher-scenarios.mjs", risk: "high", safety: "read-only", evidence: "stress" },
```

- [ ] **Step 4: Run the new wrappers**

Run: `node scripts/verification/check-parser-repeatability.mjs`
Expected: PASS with `failures: 0`

Run: `node scripts/verification/check-matcher-scenarios.mjs`
Expected: PASS with a non-zero `scored` count

- [ ] **Step 5: Commit**

```bash
git add scripts/verification/check-parser-repeatability.mjs scripts/verification/check-matcher-scenarios.mjs scripts/verification/run-phase1.mjs
git commit -m "feat: add parser and matcher stress wrappers"
```

### Task 3: Add Read-Only Supabase Audit SQL Pack

**Files:**
- Create: `supabase/sql/verification/00_auth_users_sanity.sql`
- Create: `supabase/sql/verification/01_profiles_sanity.sql`
- Create: `supabase/sql/verification/02_parser_jobs_sanity.sql`
- Create: `supabase/sql/verification/03_user_records_sanity.sql`
- Create: `supabase/sql/verification/04_rls_inventory.sql`
- Test: review each file with `rg -n "delete|update|insert|alter|drop" supabase/sql/verification`

- [ ] **Step 1: Write the failing SQL pack skeleton with explicit TODO-style failure**

Create `supabase/sql/verification/00_auth_users_sanity.sql`:

```sql
select 'not implemented'::text as status;
```

Repeat the same placeholder query in:

- `01_profiles_sanity.sql`
- `02_parser_jobs_sanity.sql`
- `03_user_records_sanity.sql`
- `04_rls_inventory.sql`

- [ ] **Step 2: Run a review grep to verify the files are placeholder-only**

Run: `rg -n "not implemented" supabase/sql/verification`

Expected: all five SQL files match

- [ ] **Step 3: Replace placeholders with real read-only audit queries**

Use these exact queries.

`supabase/sql/verification/00_auth_users_sanity.sql`

```sql
select
  count(*) as total_users,
  count(*) filter (where email is null or trim(email) = '') as users_missing_email,
  count(*) filter (where email is not null and email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') as malformed_email_users,
  count(*) filter (where deleted_at is not null) as soft_deleted_users
from auth.users;

select
  email,
  count(*) as duplicate_count
from auth.users
where email is not null
group by email
having count(*) > 1
order by duplicate_count desc, email;
```

`supabase/sql/verification/01_profiles_sanity.sql`

```sql
select
  count(*) as total_profiles,
  count(*) filter (where id is null) as profiles_missing_id,
  count(*) filter (where targetdegreelevel is null and targetDegreeLevel is null) as missing_target_degree_level,
  count(*) filter (where semantic_text is null and semanticText is null) as missing_semantic_text
from public.profiles;

select
  p.id as profile_id
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null
order by p.id;
```

`supabase/sql/verification/02_parser_jobs_sanity.sql`

```sql
select
  count(*) as total_jobs,
  count(*) filter (where status in ('queued', 'processing')) as active_jobs,
  count(*) filter (where status = 'failed') as failed_jobs,
  count(*) filter (where parsed_candidate_profile is null) as jobs_missing_canonical_profile
from public.cv_parse_jobs;

select
  id,
  profile_id,
  status,
  created_at,
  updated_at
from public.cv_parse_jobs
where status in ('queued', 'processing')
  and created_at < now() - interval '30 minutes'
order by created_at asc;

select
  draft.id as draft_id,
  draft.profile_id,
  draft.created_at
from public.cv_profile_drafts draft
left join auth.users u on u.id = draft.profile_id
where u.id is null
order by draft.created_at desc;
```

`supabase/sql/verification/03_user_records_sanity.sql`

```sql
select
  count(*) as total_shortlists
from public.shortlists;

select
  s.*
from public.shortlists s
left join auth.users u on u.id = s.profile_id
where u.id is null;
```

`supabase/sql/verification/04_rls_inventory.sql`

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname in ('public')
order by schemaname, tablename;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname in ('public')
order by schemaname, tablename, policyname;
```

- [ ] **Step 4: Verify the SQL pack is read-only**

Run: `rg -n "delete|update|insert|alter|drop" supabase/sql/verification`

Expected: no matches

- [ ] **Step 5: Commit**

```bash
git add supabase/sql/verification
git commit -m "feat: add read-only supabase audit sql pack"
```

### Task 4: Add Production-First Orchestration And Endpoint Smoke Checks

**Files:**
- Create: `scripts/verification/check-endpoints.mjs`
- Create: `scripts/verification/run-phase2.mjs`
- Create: `docs/verification/report-template.md`
- Modify: `package.json`
- Test: `node scripts/verification/check-endpoints.mjs`

- [ ] **Step 1: Write the failing endpoint and phase-2 runners**

Create `scripts/verification/check-endpoints.mjs`:

```js
throw new Error("endpoint smoke checks not implemented");
```

Create `scripts/verification/run-phase2.mjs`:

```js
throw new Error("phase 2 orchestration not implemented");
```

Create `docs/verification/report-template.md`:

```md
# Verification Report

- Status: draft
```

- [ ] **Step 2: Run the endpoint checker to verify it fails**

Run: `node scripts/verification/check-endpoints.mjs`

Expected: FAIL with `endpoint smoke checks not implemented`

- [ ] **Step 3: Implement minimal read-only endpoint and phase-2 orchestration**

Replace `scripts/verification/check-endpoints.mjs`:

```js
const targets = [
  process.env.LOCI_BACKEND_HEALTH_URL || "http://127.0.0.1:8000/healthz",
];

const results = [];

for (const url of targets) {
  try {
    const response = await fetch(url, { method: "GET" });
    results.push({ url, ok: response.ok, status: response.status });
  } catch (error) {
    results.push({ url, ok: false, status: null, message: error.message });
  }
}

console.log(JSON.stringify(results, null, 2));

if (results.some((item) => !item.ok)) {
  process.exit(1);
}
```

Replace `scripts/verification/run-phase2.mjs`:

```js
import { writeReport } from "./report-writer.mjs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const checks = [
  { id: "endpoint-smoke", label: "Endpoint smoke checks", command: "node scripts/verification/check-endpoints.mjs", safety: "read-only", evidence: "smoke" },
];

const results = [];

for (const check of checks) {
  try {
    const { stdout, stderr } = await execAsync(check.command, { maxBuffer: 10 * 1024 * 1024 });
    results.push({ ...check, ok: true, stdout, stderr });
  } catch (error) {
    results.push({ ...check, ok: false, stdout: error.stdout || "", stderr: error.stderr || "", message: error.message });
  }
}

const reportPath = await writeReport("phase2-latest", {
  phase: "phase2",
  checks: results,
  passed: results.every((item) => item.ok),
});

console.log(`Phase 2 report: ${reportPath}`);
```

Update `package.json`:

```json
{
  "scripts": {
    "verify:phase2": "node scripts/verification/run-phase2.mjs"
  }
}
```

Replace `docs/verification/report-template.md`:

```md
# Verification Report

- Phase:
- Status:
- Generated at:
- Environment:

## Summary

- Total checks:
- Passed:
- Failed:

## Findings

| Severity | Subsystem | Evidence | Summary | Reproducible | Safe to auto-remediate |
|----------|-----------|----------|---------|--------------|-------------------------|
```

- [ ] **Step 4: Run the endpoint checker with explicit expectations**

Run: `node scripts/verification/check-endpoints.mjs`

Expected: PASS if the backend health URL is reachable, otherwise FAIL with a structured JSON error entry for the unreachable target

- [ ] **Step 5: Commit**

```bash
git add docs/verification/report-template.md package.json scripts/verification/check-endpoints.mjs scripts/verification/run-phase2.mjs
git commit -m "feat: add phase 2 verification orchestration"
```

### Task 5: Add Runbook And Safe Operational Guidance

**Files:**
- Create: `docs/verification/runbook.md`
- Modify: `docs/verification/matrix.md`
- Test: `rg -n "read-only|safe-write|destructive/manual-review-required" docs/verification`

- [ ] **Step 1: Write the failing runbook draft**

Create `docs/verification/runbook.md`:

```md
# Verification Runbook

TODO
```

- [ ] **Step 2: Verify the runbook is incomplete before replacing it**

Run: `rg -n "TODO" docs/verification/runbook.md`

Expected: one match

- [ ] **Step 3: Replace the runbook with concrete operator steps**

Replace `docs/verification/runbook.md`:

```md
# Verification Runbook

## Safety Levels

- `read-only`: never changes local or live data
- `safe-write`: writes only local artifacts such as temp reports
- `destructive/manual-review-required`: never run without explicit approval

## Phase 1

Run:

```bash
npm run verify:phase1
```

Expected:

- local tests pass
- parser and matcher stress checks pass
- build passes

## Phase 2

Run:

```bash
npm run verify:phase2
```

Expected:

- endpoint health is reachable for configured targets
- read-only Supabase audit SQL is executed manually or through approved tooling

## Manual Supabase SQL execution

Run each file in:

- `supabase/sql/verification/00_auth_users_sanity.sql`
- `supabase/sql/verification/01_profiles_sanity.sql`
- `supabase/sql/verification/02_parser_jobs_sanity.sql`
- `supabase/sql/verification/03_user_records_sanity.sql`
- `supabase/sql/verification/04_rls_inventory.sql`

## Red Flags

- do not mutate live rows during audits
- do not store raw sensitive report output in git
- separate anomaly detection from remediation
```

Update `docs/verification/matrix.md` by adding a safety column legend:

```md
## Safety Legend

- `read-only`: query or inspect only
- `safe-write`: local temp files only
- `destructive/manual-review-required`: never part of default verification
```

- [ ] **Step 4: Verify the safety guidance is present**

Run: `rg -n "read-only|safe-write|destructive/manual-review-required" docs/verification`

Expected: matches in both `matrix.md` and `runbook.md`

- [ ] **Step 5: Commit**

```bash
git add docs/verification/runbook.md docs/verification/matrix.md
git commit -m "docs: add verification runbook and safety guidance"
```

### Task 6: Add Phase 3 Automation Entry Point

**Files:**
- Create: `scripts/verification/run-phase3.mjs`
- Modify: `package.json`
- Test: `node scripts/verification/run-phase3.mjs`

- [ ] **Step 1: Write the failing phase-3 runner**

Create `scripts/verification/run-phase3.mjs`:

```js
throw new Error("phase 3 orchestration not implemented");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/verification/run-phase3.mjs`

Expected: FAIL with `phase 3 orchestration not implemented`

- [ ] **Step 3: Implement the minimal automation-focused phase**

Replace `scripts/verification/run-phase3.mjs`:

```js
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
    const { stdout, stderr } = await execAsync(check.command, { maxBuffer: 10 * 1024 * 1024 });
    results.push({ ...check, ok: true, stdout, stderr });
  } catch (error) {
    results.push({ ...check, ok: false, stdout: error.stdout || "", stderr: error.stderr || "", message: error.message });
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
```

Update `package.json`:

```json
{
  "scripts": {
    "verify:phase3": "node scripts/verification/run-phase3.mjs"
  }
}
```

- [ ] **Step 4: Run the phase-3 runner**

Run: `node scripts/verification/run-phase3.mjs`

Expected: PASS if Phase 1 and configured Phase 2 both pass, otherwise FAIL with report output

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/verification/run-phase3.mjs
git commit -m "feat: add phase 3 verification automation entrypoint"
```

---

## Self-Review

### Spec coverage

- audit-first local orchestration: covered by Tasks 1 and 2
- production-first Supabase and endpoint checks: covered by Tasks 3 and 4
- test-suite-first repeatability and operator guidance: covered by Tasks 5 and 6
- explicit safety model and read-only default: covered by Tasks 3 and 5

### Placeholder scan

- No `TODO`, `TBD`, or “fill later” placeholders remain in the plan body.
- Every task includes exact files, commands, expected outcomes, and example content.

### Type consistency

- The plan consistently uses `run-phase1.mjs`, `run-phase2.mjs`, `run-phase3.mjs`, `report-writer.mjs`, and the SQL audit pack under `supabase/sql/verification/`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-comprehensive-verification-program.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
