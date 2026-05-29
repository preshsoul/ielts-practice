# Tooling Execution Phases

## Phase 1: Secret Safety

Status: initialized.

- `.gitleaks.toml` defines repository allowlists for documented placeholders.
- `.github/workflows/gitleaks.yml` runs Gitleaks on pull requests, `main` pushes, schedules, and manual dispatch.
- `npm run security:gitleaks` expects the official `gitleaks` binary to be available locally.
- `npm run security:gitleaks:git` scans repository history when the official binary is available.

Next best step: install the official Gitleaks binary on developer machines or run the GitHub Action in CI before enabling branch protection.

## Phase 2: Spec Governance

Status: initialized.

- Spec Kit is initialized under `.specify/`.
- Codex-oriented Spec Kit skills were installed under `.agents/skills/` and `.codex/skills/`.
- `.specify/memory/constitution.md` now contains Loci-specific principles.

Next best step: create the first high-risk spec for parser parity: DOCX support, OCR strategy, confidence scoring, and canonical profile completeness.

## Phase 3: Observability

Status: frontend and Python backend foundations added.

- `src/instrument.js` initializes Sentry only when `VITE_SENTRY_DSN` is configured.
- `ErrorBoundary` reports caught React errors without sending raw profile or document text.
- Python FastAPI initializes Sentry only when `SENTRY_DSN` is configured.
- Sentry env placeholders are documented in `.env.example`, `.env.local.example`, and `supabase/.env.functions.example`.

Next best step: add release/source-map upload and structured parser failure capture after a real Sentry project DSN exists.

## Phase 4: Storybook

Status: initialized and expanded.

- Storybook React/Vite config is present in `.storybook/`.
- `npm run storybook` starts the local UI workshop.
- `npm run build-storybook` verifies the static Storybook build.
- The first shared component story exists for `Button`.

Next best step: add document import and scholarship match stories with mocked parser states.

## Phase 5: Context7

Status: installed and documented.

- `ctx7` is installed as a dev dependency.
- `npm run context7` exposes the CLI.
- `docs/context7-usage.md` defines when to use it.

Next best step: connect Context7 to the active agent environment with `npx ctx7 setup` if you want persistent MCP-assisted documentation lookup.
