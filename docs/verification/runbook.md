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

- primary production domain serves the same Loci SPA shell as the Vercel project domain
- `/runtime-env.js`, `/api/health`, and `/auth/callback` are not intercepted by a parked domain or external lander
- hosted Supabase REST is reachable
- a temporary verification user can authenticate
- live Edge Functions return healthy responses
- parser job and draft routes work end-to-end
- the verification script cleans up its temporary auth/database rows

Notes:

- set `LOCI_PRODUCTION_URL` when the primary domain changes; defaults to `https://loci-project.vercel.app`
- set `LOCI_VERCEL_URL` when the Vercel project URL changes; defaults to `https://loci-project.vercel.app`
- phase 2 performs controlled live writes for a temporary verification user, parser job, and optional profile bootstrap row, then deletes them
- failures here usually indicate deployment drift, missing live secrets, or auth/profile bootstrap gaps

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

## Failure Triage Order

1. If `primary-domain-*` fails, treat DNS/custom-domain alias drift as the primary defect before debugging application auth.
2. If `profiles-bootstrap` fails, treat auth lifecycle/bootstrap as the primary defect.
3. If runtime health fails, fix hosted secrets/config before changing parser or matcher logic.
4. If parser health routes are green but parse jobs fail, inspect provider/config and staged parser metadata.
5. If parser artifacts are healthy but recommendations are wrong, inspect matcher eligibility and explanation stages.

## Hosted Invariants

- Hosted auth bootstrap invariant must pass before any parser verification is trusted
- Primary production domain must serve the Vercel app shell before OAuth callback behavior is trusted
- Hosted function runtime health must be green before business-route failures are diagnosed as parser bugs
- Matcher verification must report blocked-vs-ranked anomalies separately from plain score regressions
