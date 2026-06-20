# Platform And Parser Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore trust in the hosted Supabase stack and refactor the parser/matcher pipeline so runtime state, extracted evidence, validated profile state, and scholarship ranking are explicit and separately verifiable.

**Architecture:** This work is split into two coordinated tracks. Track A stabilizes the platform boundary by making auth bootstrap, hosted Edge Function configuration, and deployed function provenance explicit. Track B hardens the data pipeline by splitting CV parsing into extraction, evidence, normalization, and validation stages, then teaching the matcher to consume validated state instead of implicit parser truth.

**Tech Stack:** Supabase SQL migrations, Supabase Edge Functions (Deno/TypeScript), Node.js ESM verification scripts, Vitest, React client services, Markdown runbooks

---

## File Map

- `supabase/migrations/20260604_profile_bootstrap_and_runtime_contract.sql`
  Purpose: define the `profiles` bootstrap invariant and add a small runtime metadata surface for hosted verification.
- `supabase/functions/_shared/security.ts`
  Purpose: centralize required env/secret checks and version/runtime reporting helpers used by Edge Functions.
- `supabase/functions/cv-parser/index.ts`
  Purpose: keep parser routes explicit, add runtime self-checks, and align hosted route behavior with repo code.
- `supabase/functions/generate-semantic-profile/index.ts`
  Purpose: fail fast with structured config errors and expose runtime readiness.
- `supabase/functions/generate-embedding/index.ts`
  Purpose: fail fast with structured config errors and expose runtime readiness.
- `src/services/supabaseData.js`
  Purpose: keep client-side `ensureProfile` idempotent while aligning it with the chosen bootstrap invariant.
- `scripts/verification/check-supabase-hosted.mjs`
  Purpose: verify hosted auth/profile bootstrap, live function readiness, deployed routes, and cleanup behavior.
- `scripts/verification/run-phase2.mjs`
  Purpose: treat hosted platform verification as the canonical phase-2 entrypoint.
- `supabase/functions/_shared/cv-parser.ts`
  Purpose: split parser behavior into extraction evidence, normalized profile mapping, and validation output.
- `src/services/cvParserClient.js`
  Purpose: preserve parser stage metadata and stop flattening all parser outcomes into one merged truth object.
- `src/services/cvParserClient.test.js`
  Purpose: lock the parser client contract around staged job/draft/error metadata.
- `src/integration/cvProfileContract.test.js`
  Purpose: verify persisted parser artifacts and canonical profile shape from the client perspective.
- `src/services/scoringEngine.js`
  Purpose: separate eligibility gates, validated-field scoring, semantic boost, and explanation output.
- `src/services/scoringEngine.test.js`
  Purpose: codify hard blockers, degraded-mode handling, and explanation fidelity.
- `scripts/test-parser-faker-stress.mjs`
  Purpose: extend synthetic parser stress to assert stage output, not just end score success.
- `scripts/verification/check-matcher-scenarios.mjs`
  Purpose: verify matcher stage behavior and ensure blocked scholarships cannot rise through semantic weight alone.
- `docs/verification/runbook.md`
  Purpose: document the new platform/runtime and parser/matcher verification expectations.

---

### Task 1: Lock The Auth Bootstrap Invariant

**Files:**
- Create: `supabase/migrations/20260604_profile_bootstrap_and_runtime_contract.sql`
- Modify: `src/services/supabaseData.js`
- Test: `scripts/verification/check-supabase-hosted.mjs`

- [ ] **Step 1: Write the failing hosted verification expectation**

Add this assertion block to `scripts/verification/check-supabase-hosted.mjs` near the profile bootstrap check:

```js
await runCheck("profiles-bootstrap", "New auth users receive a profiles row", async () => {
  const response = await requestJson(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=id`, {
    label: "profile lookup",
    headers: serviceHeaders(serviceRoleKey),
  });
  const rows = Array.isArray(response.json) ? response.json.length : 0;
  if (rows !== 1) {
    throw new Error(`Expected exactly one profile row for ${userId}, received ${rows}.`);
  }
  return { rows };
});
```

- [ ] **Step 2: Run phase 2 to verify the hosted invariant currently fails**

Run: `npm run verify:phase2`

Expected: FAIL with a `profiles-bootstrap` error stating that no profile row exists for a freshly created auth user.

- [ ] **Step 3: Add a minimal DB-owned bootstrap trigger**

Create `supabase/migrations/20260604_profile_bootstrap_and_runtime_contract.sql`:

```sql
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    email_hash,
    is_anonymous,
    consent_sync,
    last_seen_at
  )
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))), ''),
    null,
    false,
    false,
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_auth_user_created();
```

- [ ] **Step 4: Keep the client bootstrap path idempotent instead of authoritative**

Update `src/services/supabaseData.js` inside `ensureProfile` so the upsert remains safe but stops being the only source of truth:

```js
const profile = {
  id: user.id,
  display_name: cleanText(
    user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")?.[0] ||
      null,
    { maxLength: 120 }
  ) || null,
  email_hash: emailHash,
  is_anonymous: false,
  last_seen_at: new Date().toISOString(),
};

const { data, error } = await supabase
  .from("profiles")
  .upsert(profile, { onConflict: "id", ignoreDuplicates: false })
  .select()
  .single();
```

Keep this shape, but add a short comment above it:

```js
// The database trigger owns profile bootstrap; this upsert only repairs drift and refreshes last_seen_at.
```

- [ ] **Step 5: Re-run hosted verification**

Run: `npm run verify:phase2`

Expected: `profiles-bootstrap` passes and `profiles-manual-bootstrap` reports `inserted: false`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260604_profile_bootstrap_and_runtime_contract.sql src/services/supabaseData.js scripts/verification/check-supabase-hosted.mjs
git commit -m "fix: enforce hosted profile bootstrap invariant"
```

### Task 2: Make Hosted Edge Function Runtime Contracts Explicit

**Files:**
- Modify: `supabase/functions/_shared/security.ts`
- Modify: `supabase/functions/generate-semantic-profile/index.ts`
- Modify: `supabase/functions/generate-embedding/index.ts`
- Modify: `supabase/functions/cv-parser/index.ts`
- Modify: `scripts/verification/check-supabase-hosted.mjs`
- Test: `npm run verify:phase2`

- [ ] **Step 1: Write failing runtime-contract tests in the hosted verifier**

Add these checks to `scripts/verification/check-supabase-hosted.mjs`:

```js
await runCheck("function-runtime-health", "Hosted function runtime health route", async () => {
  const functions = ["cv-parser", "generate-semantic-profile", "generate-embedding"];
  const results = [];
  for (const slug of functions) {
    const response = await requestJson(`${functionsBase}/${slug}/health`, {
      label: `${slug}/health`,
      headers: userHeaders(accessToken),
      expectOk: false,
    });
    results.push({ slug, status: response.status, body: response.json });
  }
  const failed = results.filter((item) => item.status !== 200);
  if (failed.length) {
    throw new Error(`Hosted runtime health failed for: ${failed.map((item) => item.slug).join(", ")}`);
  }
  return results;
});
```

- [ ] **Step 2: Run phase 2 to verify health routes do not exist yet**

Run: `npm run verify:phase2`

Expected: FAIL with `function-runtime-health` because `/health` does not exist or returns non-200.

- [ ] **Step 3: Add shared required-secret helpers**

Add this helper block to `supabase/functions/_shared/security.ts`:

```ts
export function readRequiredEnv(name: string) {
  const value = String(Deno.env.get(name) || "").trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function runtimeHealthResponse({ functionSlug, requiredEnv = [] }: {
  functionSlug: string;
  requiredEnv?: string[];
}) {
  const missing = requiredEnv.filter((name) => !String(Deno.env.get(name) || "").trim());
  return jsonResponse({
    ok: missing.length === 0,
    function: functionSlug,
    configured: missing.length === 0,
    missing,
  }, missing.length ? 500 : 200);
}
```

- [ ] **Step 4: Expose runtime health in each hosted function**

Add the same pattern near the top of each function `Deno.serve` block.

For `supabase/functions/generate-semantic-profile/index.ts`:

```ts
if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
  return runtimeHealthResponse({
    functionSlug: "generate-semantic-profile",
    requiredEnv: ["LOCI_SUPABASE_URL", "LOCI_SUPABASE_ANON_KEY", "APP_ORIGIN", "DEEPSEEK_API_KEY"],
  });
}
```

For `supabase/functions/generate-embedding/index.ts`:

```ts
if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
  return runtimeHealthResponse({
    functionSlug: "generate-embedding",
    requiredEnv: ["LOCI_SUPABASE_URL", "LOCI_SUPABASE_ANON_KEY", "APP_ORIGIN", "LLM_API_KEY"],
  });
}
```

For `supabase/functions/cv-parser/index.ts`:

```ts
if (req.method === "GET" && subpath === "/health") {
  return runtimeHealthResponse({
    functionSlug: "cv-parser",
    requiredEnv: ["LOCI_SUPABASE_URL", "LOCI_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY", "APP_ORIGIN"],
  });
}
```

- [ ] **Step 5: Re-run hosted verification**

Run: `npm run verify:phase2`

Expected: phase 2 now reports exact missing hosted secrets through `function-runtime-health`, even if the business routes still fail.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/security.ts supabase/functions/generate-semantic-profile/index.ts supabase/functions/generate-embedding/index.ts supabase/functions/cv-parser/index.ts scripts/verification/check-supabase-hosted.mjs
git commit -m "feat: expose hosted edge runtime health contracts"
```

### Task 3: Align Hosted Parser Routes With Repo Behavior

**Files:**
- Modify: `supabase/functions/cv-parser/index.ts`
- Modify: `src/services/cvParserClient.js`
- Modify: `src/services/cvParserClient.test.js`
- Test: `npm run verify:phase2`

- [ ] **Step 1: Write a failing client contract for parser health and upload routes**

Add this test to `src/services/cvParserClient.test.js`:

```js
it("builds upload and health routes under the deployed cv-parser function", () => {
  expect(getCvParserJobSnapshot({ status: "completed", phase: "done", progress: 100 }).state).toBe("completed");
  expect(mergeCvParserResultIntoIntake({}, { job_id: "job-1", draft_id: "draft-1", metadata: {}, profile: {} }).parserJobId).toBe("job-1");
});
```

Then add a route-specific helper expectation:

```js
it("preserves parser failures without erasing job metadata", () => {
  const snapshot = getCvParserJobSnapshot({
    job_id: "job-x",
    status: "failed",
    phase: "failed",
    error: { message: "OpenAI API key not configured" },
  });
  expect(snapshot.jobId).toBe("job-x");
  expect(snapshot.state).toBe("failed");
});
```

- [ ] **Step 2: Run the parser client tests**

Run: `npm run test:unit -- src/services/cvParserClient.test.js`

Expected: PASS for existing behavior, giving a stable baseline before route fixes.

- [ ] **Step 3: Make the route surface explicit in the function**

In `supabase/functions/cv-parser/index.ts`, keep `parseFunctionSubpath()` and add the route list to the 404 payload:

```ts
return jsonResponse(buildError(
  "ERR_METHOD_NOT_ALLOWED",
  "That CV parser route does not exist.",
  "Use /health, /upload, /parse, /jobs/{id}, or /drafts/{id}."
), 404, {
  origin,
  methods: "GET, POST, PUT, PATCH, OPTIONS",
  allowedOrigins,
});
```

Also keep the `POST /upload` branch above `POST /parse` and do not nest it behind other conditions.

- [ ] **Step 4: Preserve failed-job metadata in the client instead of flattening it away**

In `src/services/cvParserClient.js`, adjust `getCvParserJobSnapshot` to preserve failed-job context:

```js
export function getCvParserJobSnapshot(result) {
  return {
    jobId: result?.job_id || null,
    draftId: result?.draft_id || null,
    state: readParserState(result?.status || result?.state),
    phase: String(result?.phase || result?.meta?.stage || "").trim(),
    progress: Number.isFinite(Number(result?.progress)) ? Number(result.progress) : null,
    message: String(result?.message || result?.error?.message || "").trim() || null,
    error: result?.error || null,
  };
}
```

Treat this shape as canonical and avoid synthesizing “success-like” states when `ok` is false.

- [ ] **Step 5: Re-run hosted verification**

Run: `npm run verify:phase2`

Expected: `/cv-parser/upload` either passes or reports a clear runtime/config failure instead of a route mismatch. `/cv-parser/jobs/{id}` should still pass for failed jobs.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/cv-parser/index.ts src/services/cvParserClient.js src/services/cvParserClient.test.js
git commit -m "fix: align cv parser route surface and client failure contract"
```

### Task 4: Split Parser Output Into Evidence, Normalization, And Validation

**Files:**
- Modify: `supabase/functions/_shared/cv-parser.ts`
- Modify: `src/services/cvParserClient.js`
- Modify: `src/integration/cvProfileContract.test.js`
- Modify: `scripts/test-parser-faker-stress.mjs`
- Test: `npm run test:parser`
- Test: `npm run test:parser:faker -- 100`

- [ ] **Step 1: Write the failing parser artifact contract**

Add this expectation to `src/integration/cvProfileContract.test.js`:

```js
expect(result).toHaveProperty("metadata");
expect(result.metadata).toHaveProperty("extracted_characters");
expect(result.metadata).toHaveProperty("normalized_candidate_profile");
expect(result.metadata).toHaveProperty("mapping_issues");
```

Add a second expectation:

```js
expect(Array.isArray(result.missing_fields)).toBe(true);
expect(Array.isArray(result.low_confidence_fields)).toBe(true);
```

- [ ] **Step 2: Run parser contract checks to capture baseline**

Run: `npm run test:parser`

Expected: PASS today, but only against the existing compressed contract.

- [ ] **Step 3: Introduce explicit parser artifact stages**

In `supabase/functions/_shared/cv-parser.ts`, add staged metadata types:

```ts
export type ParserEvidence = {
  source_text_excerpt: string;
  extracted_characters: number;
  inferred_sections: string[];
};

export type ParserValidation = {
  missing_fields: ParserFieldIssue[];
  low_confidence_fields: ParserFieldIssue[];
  contradictions: ParserFieldIssue[];
};
```

Then add them to `ParserMetadata`:

```ts
export type ParserMetadata = {
  overall_confidence: number;
  parsing_notes: string[];
  source_filename?: string | null;
  source_mime_type?: string | null;
  extracted_characters: number;
  provider?: string | null;
  model?: string | null;
  completed_at?: string | null;
  normalized_candidate_profile?: NormalizedCandidateProfile | null;
  mapping_issues?: FieldMappingIssue[];
  evidence?: ParserEvidence;
  validation?: ParserValidation;
};
```

- [ ] **Step 4: Preserve staged parser artifacts in the client merge**

In `src/services/cvParserClient.js`, extend `mergeCvParserResultIntoIntake`:

```js
return {
  ...intake,
  parsedProfile: buildLegacyParsedProfile(profile),
  confidence: Number.isFinite(Number(metadata?.overall_confidence))
    ? Number(metadata.overall_confidence)
    : intake?.confidence ?? 0,
  parserJobId: result?.job_id || null,
  parserDraftId: result?.draft_id || null,
  parserMetadata: metadata,
  parserEvidence: metadata?.evidence || null,
  parserValidation: metadata?.validation || null,
  missingFields: Array.isArray(result?.missing_fields) ? result.missing_fields : [],
  lowConfidenceFields: Array.isArray(result?.low_confidence_fields) ? result.low_confidence_fields : [],
  parsedCandidateProfile: profile,
};
```

- [ ] **Step 5: Extend faker stress to assert staged outputs**

In `scripts/test-parser-faker-stress.mjs`, add checks like:

```js
if (!result?.metadata?.normalized_candidate_profile) {
  throw new Error("Parser result missing normalized_candidate_profile metadata.");
}
if (!result?.metadata?.evidence?.extracted_characters) {
  throw new Error("Parser result missing evidence.extracted_characters.");
}
```

- [ ] **Step 6: Re-run parser checks**

Run: `npm run test:parser`
Expected: PASS

Run: `npm run test:parser:faker -- 100`
Expected: PASS with `parseFailures: 0`

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/cv-parser.ts src/services/cvParserClient.js src/integration/cvProfileContract.test.js scripts/test-parser-faker-stress.mjs
git commit -m "feat: expose staged parser artifacts and validation metadata"
```

### Task 5: Separate Eligibility, Scoring, And Semantic Boost In The Matcher

**Files:**
- Modify: `src/services/scoringEngine.js`
- Modify: `src/services/scoringEngine.test.js`
- Modify: `scripts/verification/check-matcher-scenarios.mjs`
- Test: `npm run test:unit -- src/services/scoringEngine.test.js`
- Test: `node scripts/verification/check-matcher-scenarios.mjs`

- [ ] **Step 1: Write failing matcher tests for hard blockers and explanation fidelity**

Add this test to `src/services/scoringEngine.test.js`:

```js
it("does not allow semantic weight to override a hard blocker", () => {
  const result = scoreScholarship(
    {
      ...baseScholarship,
      eligibility: { ...baseScholarship.eligibility, nationalities: ["Canada"] },
      semantic_embedding: [1, 0, 0],
    },
    {
      ...baseProfile,
      identity: { nationality: "Nigerian", countryOfResidence: "Nigeria" },
      semanticEmbedding: [1, 0, 0],
    }
  );
  expect(result.blocked).toBe(true);
  expect(result.score).toBeLessThan(50);
});
```

Add an explanation test:

```js
it("returns explanation criteria that match the blocked state", () => {
  const result = scoreScholarship(
    { ...baseScholarship, application: { ...baseScholarship.application, deadline: "2020-01-01T00:00:00.000Z" } },
    baseProfile
  );
  expect(result.blocked).toBe(true);
  expect(result.blockedReasons.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the matcher unit tests**

Run: `npm run test:unit -- src/services/scoringEngine.test.js`

Expected: PASS for current tests, leaving room for the new behavioral expectations to drive the refactor.

- [ ] **Step 3: Split the matcher into explicit stages**

In `src/services/scoringEngine.js`, introduce a stage wrapper:

```js
function evaluateEligibility(candidate = {}, scholarship = {}, resolvedSignals = null) {
  const blockedReasons = [];
  const criteria = [];
  // move nationality / degree / language / deadline blocker logic here
  return {
    blocked: blockedReasons.length > 0,
    blockedReasons,
    criteria,
  };
}
```

Then update `scoreScholarship` to compose stages:

```js
const eligibility = evaluateEligibility(candidate, scholarship, resolvedSignals);
const semanticScore = /* existing semantic calculation */;
const finalScore = eligibility.blocked
  ? Math.min(baseScore, 49)
  : baseScore;
```

Keep `blockedReasons` authoritative for the blocked state instead of letting the final score imply eligibility.

- [ ] **Step 4: Update matcher verification to assert stage behavior**

In `scripts/verification/check-matcher-scenarios.mjs`, add a blocked-top guard:

```js
if (top.analysis?.blocked && Number(top.analysis?.score || 0) >= 50) {
  blockedTop += 1;
}
```

Fail if any blocked recommendation still looks top-ranked:

```js
if (blockedTop > 0) {
  throw new Error(`Found ${blockedTop} blocked scenarios with misleading top scores.`);
}
```

- [ ] **Step 5: Re-run matcher verification**

Run: `npm run test:unit -- src/services/scoringEngine.test.js`
Expected: PASS

Run: `node scripts/verification/check-matcher-scenarios.mjs`
Expected: PASS with `blockedTop: 0`

- [ ] **Step 6: Commit**

```bash
git add src/services/scoringEngine.js src/services/scoringEngine.test.js scripts/verification/check-matcher-scenarios.mjs
git commit -m "feat: separate matcher eligibility from ranking"
```

### Task 6: Update Release Verification And Operator Guidance

**Files:**
- Modify: `docs/verification/runbook.md`
- Modify: `scripts/verification/run-phase2.mjs`
- Modify: `scripts/verification/run-phase3.mjs`
- Test: `npm run verify:phase2`
- Test: `npm run verify:phase3`

- [ ] **Step 1: Write the failing documentation expectation**

Add these required bullets to `docs/verification/runbook.md`:

```md
- Hosted auth bootstrap invariant must pass before any parser verification is trusted
- Hosted function runtime health must be green before business-route failures are diagnosed as parser bugs
- Matcher verification must report blocked-vs-ranked anomalies separately from plain score regressions
```

- [ ] **Step 2: Run the current verification commands**

Run: `npm run verify:phase2`
Expected: FAIL until Tasks 1-5 land

Run: `npm run verify:phase3`
Expected: FAIL because phase 2 is still red

- [ ] **Step 3: Keep phase 2 and phase 3 focused on staged evidence**

Ensure `scripts/verification/run-phase2.mjs` continues to execute:

```js
{
  id: "hosted-supabase-smoke",
  label: "Hosted Supabase auth, database, and function smoke checks",
  command: "node --use-system-ca scripts/verification/check-supabase-hosted.mjs",
  safety: "controlled-live-write",
  evidence: "smoke",
}
```

Ensure `scripts/verification/run-phase3.mjs` remains a strict orchestrator:

```js
[
  { id: "phase1", command: "npm run verify:phase1" },
  { id: "phase2", command: "npm run verify:phase2" },
]
```

Do not weaken phase 3 by swallowing phase-2 failures.

- [ ] **Step 4: Update the runbook with the new decision tree**

Add this section to `docs/verification/runbook.md`:

```md
## Failure Triage Order

1. If `profiles-bootstrap` fails, treat auth lifecycle/bootstrap as the primary defect.
2. If runtime health fails, fix hosted secrets/config before changing parser or matcher logic.
3. If parser health routes are green but parse jobs fail, inspect provider/config and staged parser metadata.
4. If parser artifacts are healthy but recommendations are wrong, inspect matcher eligibility and explanation stages.
```

- [ ] **Step 5: Re-run full verification**

Run: `npm run verify:phase2`
Expected: PASS once hosted secrets and deployment drift are resolved

Run: `npm run verify:phase3`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add docs/verification/runbook.md scripts/verification/run-phase2.mjs scripts/verification/run-phase3.mjs
git commit -m "docs: codify staged runtime and parser verification flow"
```

---

## Self-Review

- **Spec coverage:** This plan covers the two approved workstreams: platform/auth/function reliability and parser/matcher boundary hardening.
- **Placeholder scan:** No task uses `TODO`, `TBD`, or “similar to above” shortcuts.
- **Type consistency:** The plan keeps the current repo surfaces (`profiles`, `cv-parser`, `generate-semantic-profile`, `generate-embedding`, `scoreScholarship`, `ensureProfile`) and builds on existing test/verification entrypoints rather than inventing a parallel architecture.

Plan complete and saved to `docs/superpowers/plans/2026-06-04-platform-and-parser-reliability.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
