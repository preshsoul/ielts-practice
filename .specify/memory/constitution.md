# Loci Constitution

## Core Principles

### I. User-Owned Data Stays Protected
CVs, transcripts, profile details, auth identifiers, and parser output are private user data. Features must keep raw document text server-side unless there is a clear product need to show a reviewed excerpt, and logs/analytics/observability must scrub raw document text, parsed profile payloads, tokens, and provider keys.

### II. Parser Output Must Be Reviewable
Document import must produce transparent, reviewable output. Every parser feature must preserve source metadata, confidence, missing fields, low-confidence fields, and mapping issues so users can correct the result before it changes matching decisions.

### III. Matching Must Explain Itself
Scholarship and application scoring must surface why an opportunity is recommended. Hard filters, deadline pressure, eligibility evidence, source confidence, and profile gaps must remain auditable rather than hidden behind a single score.

### IV. Security Gates Are Part Of Delivery
Changes that touch auth, environment variables, parser functions, Supabase policies, document intake, or deployment configuration must pass targeted security checks. Secret scanning, client bundle secret scanning, input validation, and safe error handling are required for those surfaces.

### V. Observable Without Over-Collecting
Runtime instrumentation should make failures diagnosable without capturing private application content. Sentry, logs, and future analytics must prefer event type, route, parser phase, job id, provider, and error code over raw user input or full profile snapshots.

## Engineering Constraints

- Frontend work follows the existing React/Vite structure, shared components, and design tokens.
- Supabase Edge Functions remain the primary hosted parser path unless a spec explicitly moves a workflow back to the Python service.
- Python FastAPI backend changes must keep local development viable and preserve the staged job/draft contract.
- Public client environment variables must use `VITE_`; server secrets must never use `VITE_`.
- Generated content in `public/data/` must be produced by scripts, not hand-edited as a long-term workflow.

## Development Workflow

- High-risk features start with Spec Kit: `speckit-specify`, `speckit-plan`, `speckit-tasks`, then implementation.
- Parser, matching, auth, RLS, and observability changes require explicit verification commands in the plan.
- UI state-heavy work should add or update Storybook stories for idle, loading, error, and success states.
- Dependency and external API work should use current upstream docs, preferably through Context7 when available.
- Commits should keep generated artifacts out of source control unless the artifact is intentionally part of the app contract.

## Governance

This constitution governs major feature and infrastructure work for Loci. Amendments require a short rationale, the changed principle or workflow, and any migration steps needed for active specs. If an implementation conflicts with this constitution, update the spec or constitution before merging the implementation.

**Version**: 1.0.0 | **Ratified**: 2026-05-29 | **Last Amended**: 2026-05-29
