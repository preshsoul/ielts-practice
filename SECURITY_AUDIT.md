# Security Audit

## Scope
Checked the repository for exposed Supabase secrets, hardcoded service-role material, and risky client-side credential usage.

## What was checked
- `src/`
- `scripts/`
- `supabase/`
- `content/`
- generated build output in `dist/`
- example environment configuration

## Findings
- No `service_role` secret was found in source or generated output.
- No live private keys were found in the application code.
- The example environment file now uses placeholders rather than project-specific values.
- The client uses the Supabase anon key pattern, which is expected for browser apps.

## Notes
- The client-side app should never contain a service-role key.
- Any future backend automation that requires elevated access should keep that secret in server-only environment variables.
- Generated bundles should continue to be scanned after each release build.

## Follow-up
- Repeat this audit after any auth, deployment, or CI changes.
- Add automated scanning if the codebase starts shipping more build artifacts or server-side helpers.
