# Comprehensive Verification Program Design

## Goal

Define a serious, repeatable verification program for Loci that checks the project from three angles, in order:

1. local and controlled runtime correctness
2. live Supabase and production-facing state sanity
3. automation coverage so the strongest checks become repeatable

The program must cover parser behavior, scholarship matcher behavior, frontend and backend flows, database integrity, auth and RLS safety, and user-data sanity without defaulting to risky live mutations.

## Why this exists

The repo already has meaningful tests, but they are still uneven across surfaces. Some of the riskiest failures are not “does a unit test pass” failures. They are:

- parser output drifting from downstream profile expectations
- live user rows becoming malformed, duplicated, stale, or orphaned
- RLS and exposed-schema mistakes that do not show up in local tests
- stale parser jobs or drafts that silently degrade user workflows
- scholarship matching continuing to return output even when source or profile quality has drifted
- endpoint and deployment behavior diverging from local assumptions

This verification program is meant to answer a harder question than “are tests green?”:

`Can we trust the current system, its live data, and its operational boundaries?`

## Design principles

### 1. Ordered evidence

The program runs in three ordered phases:

- `Audit-first`
- `Production-first`
- `Test-suite-first`

That order matters. We first verify the code and controlled data paths, then we inspect live state, then we turn the strongest checks into repeatable automation.

### 2. Safety by default

Database work is read-only unless explicitly escalated.

Every check must be labeled as one of:

- `read-only`
- `safe-write`
- `destructive/manual-review-required`

The default mode for all live Supabase sanity checks is `read-only`.

### 3. Separate audit from repair

This program is not primarily a cleanup script. It is an evidence-gathering and anomaly-classification system.

Repair actions, if later approved, must live separately from audit actions so we never confuse:

- “we detected a problem”
- “we summarized a problem”
- “we changed production state”

### 4. Real subsystem boundaries

Verification should be grouped by product and operational surfaces, not just by tool:

- parser
- candidate profile resolution
- scholarship matcher
- frontend route and workflow health
- backend extractor
- Supabase auth and user-owned tables
- RLS and exposed schemas
- deployment and endpoint availability

### 5. Repeatability

The final state should not depend on memory or manual heroics. The best local checks, database audits, and stress checks must become documented, scriptable, and eventually automatable.

## Scope

### In scope

- local frontend and backend verification
- parser contract checks
- parser stress checks using synthetic but realistic user records
- scholarship matcher stress and scenario sweeps
- build and client secret scans
- database schema and live-table sanity checks
- auth and RLS sanity checks
- deployed endpoint smoke checks
- optional load and stress checks for approved environments
- anomaly reporting and severity classification
- automation design for future reuse

### Out of scope for the first plan

- automatic repair of live user rows
- automatic deletion or mutation of live parser jobs
- broad data migrations not directly tied to verification
- non-verification product refactors
- full observability platform rollout

## Phase structure

## Phase 1: Audit-First

### Purpose

Establish trust in the local code paths and controlled verification surfaces before making claims about live data.

### Required outcomes

- a single verification matrix describing all major subsystems
- confirmation that existing local tests, builds, and stress scripts are still valid
- stronger parser and matcher verification where current checks are weak or misleading
- a documented list of unverified or partially verified local surfaces

### Surfaces to verify

#### Frontend and route behavior

- onboarding route gating
- onboarding skip/save flow
- scholarship document import flow
- candidate-profile handoff from parser outputs
- account/profile surfaces that depend on parser or resolved profile state

#### Parser correctness

- strict JSON contract validation
- legacy `parsedProfile` normalization
- canonical `parsedCandidateProfile` normalization
- provenance handling
- faker-backed synthetic user payload checks with names, email, phone, and address-rich extracted text
- repeat-run parser contract stability

#### Scholarship matcher correctness

- single-profile ranking correctness
- varied candidate scenario sweeps
- output stability across repeated runs
- no-zero-result checks against populated catalogs
- blocked and non-blocked path coverage
- performance timing at small stress scales

#### Pipeline and build surfaces

- full local test suite
- production build
- client secret scan
- content and scholarship pipeline smoke checks

#### Backend extractor

- Python test suite
- sanity matrix
- matcher service tests
- any local load/stress scripts already present and runnable

### Phase 1 artifacts

- verification matrix document
- local verification entrypoints
- parser stress script(s)
- matcher scenario/stress script(s)
- findings report for local-only gaps

## Phase 2: Production-First

### Purpose

Inspect live Supabase and production-facing state in read-only mode so we can detect corruption, drift, stale records, auth problems, and data-integrity issues that local tests cannot see.

### Safety model

Phase 2 is read-only by default.

Any write-capable or repair-capable action must be isolated into a later, explicitly approved remediation workflow.

### Required outcomes

- a live database sanity checklist
- read-only SQL audits for critical tables
- anomaly reports grouped by severity and subsystem
- operational health summary for parser-related live tables
- auth and RLS sanity summary

### Live Supabase surfaces to inspect

#### Auth and user identity

- `auth.users` sanity
- malformed or suspicious emails
- duplicate logical users across auth and profile tables
- users without expected downstream records
- unexpected deleted/disabled/session edge states if visible

#### Profile and candidate data

- profiles without owning users
- users without profiles where profiles are expected
- duplicate profiles per user
- malformed nationality, degree, IELTS, year, country, or target fields
- impossible dates and suspicious null concentrations
- candidate profile snapshots that disagree with canonical assumptions

#### Parser and CV-related tables

- stale queued jobs
- failed jobs concentration
- drafts without users
- jobs without drafts where drafts are expected
- parsed canonical payloads missing required sections
- mismatch between parser-stored canonical records and downstream resolved-profile assumptions
- repeated parser retries or duplicated raw text hashes

#### Scholarship and application tables

- shortlist rows without users
- application tracking rows without valid parent references
- malformed scholarship references
- suspicious duplicate shortlist/application rows
- data drift between catalog assumptions and user-owned records

#### RLS and exposed-schema safety

- confirm exposed schemas are known
- confirm RLS is enabled where required
- inspect policies for high-risk tables
- identify views/functions that could bypass intended access boundaries
- flag any auth or metadata anti-patterns relevant to Supabase security guidance

#### Deployment and endpoint state

- deployed Edge Function availability
- health/smoke checks for parser-related endpoints
- smoke checks for auth/session related endpoints where appropriate
- optional approved load checks for deployed endpoints

### Phase 2 artifacts

- read-only SQL audit pack
- live anomaly report
- severity rubric
- remediation backlog for later action

## Phase 3: Test-Suite-First

### Purpose

Turn the strongest Phase 1 and Phase 2 checks into repeatable automation so future verification is systematic rather than rediscovered each time.

### Required outcomes

- a durable verification command structure
- reusable SQL or script-based audit entrypoints
- automation-friendly reporting surfaces
- documentation for manual checks that still cannot be automated safely

### What gets automated first

- parser synthetic-data stress
- scholarship matcher scenario sweeps
- local full verification command(s)
- read-only database sanity queries
- endpoint smoke checks
- release-grade verification runbook

### What may remain manual

- high-risk production inspections that require human review
- anomaly triage and remediation approval
- mutation-capable repair steps

### Phase 3 artifacts

- reusable scripts and command docs
- optional CI/nightly hooks
- verification runbook

## Verification categories

Every check in the program should be tagged across these axes:

### Risk level

- `low`
- `medium`
- `high`

### Safety level

- `read-only`
- `safe-write`
- `destructive/manual-review-required`

### Surface

- `frontend`
- `parser`
- `matcher`
- `pipeline`
- `backend`
- `database`
- `auth`
- `rls`
- `deployment`

### Evidence type

- `test`
- `stress`
- `sql-audit`
- `build`
- `smoke`
- `report`

## Reporting model

The verification system should not just print raw command output. It should produce structured findings.

Each finding should include:

- subsystem
- severity
- environment
- evidence source
- exact failing record/query/test when possible
- whether it is reproducible
- whether it is safe to auto-remediate later

Severity levels should be:

- `critical`
- `high`
- `medium`
- `low`
- `informational`

## Data-handling requirements

Because this will inspect live user data, the design must minimize sensitive exposure.

Rules:

- never dump raw personal data unless strictly required for diagnosis
- prefer counts, hashes, IDs, or masked values in reports
- only surface enough identifying context to triage anomalies
- do not store extracted report artifacts with raw sensitive values in git

## Success criteria

This program is successful when we can produce evidence-backed answers to these questions:

- Are the local parser and matcher flows correct and stable?
- Are the user-facing onboarding/import/ranking paths behaving as expected?
- Does the live database contain malformed, orphaned, duplicated, or stale records?
- Are parser jobs, drafts, profiles, and candidate snapshots internally consistent?
- Are auth and RLS boundaries configured sanely for the current access model?
- Are deployed parser-related endpoints reachable and sane?
- Can the strongest checks be rerun without inventing a new process every time?

## Constraints and known gaps

- live endpoint load testing depends on reachable deployed targets
- some Supabase checks depend on actual permissions and project connectivity
- local-only tests cannot prove live RLS correctness
- the parser architecture is already known to be only partially integrated with the redesigned candidate profile model, so some checks must explicitly look for that drift

## Recommended implementation order

1. build the master verification matrix and command structure
2. harden Phase 1 scripts and local stress checks
3. add read-only Supabase audit queries and reporting
4. add endpoint smoke/load verification wrappers
5. add automation entrypoints and documentation

## Recommended output files

- `docs/superpowers/plans/` for implementation plans
- `docs/verification/` for runbooks and matrix docs
- `scripts/verification/` for orchestration and reports
- `supabase/sql/verification/` or similar for read-only audit SQL

## Final recommendation

Implement this as one master verification program with ordered phases, not as isolated tasks.

The first implementation plan should focus on:

- building the verification matrix
- unifying local and stress checks
- introducing read-only live Supabase sanity audits
- documenting safe versus unsafe operational actions
