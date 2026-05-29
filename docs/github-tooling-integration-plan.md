# GitHub Tooling Integration Plan

This plan explains how to use the five requested GitHub projects in this Loci/IELTS workspace:

- `github/spec-kit`
- `storybookjs/storybook`
- `upstash/context7`
- `gitleaks/gitleaks`
- `getsentry/sentry`

The goal is not to clone all five repositories into this project. The right approach is to integrate the useful product, workflow, SDK, CLI, and CI pieces from each repo while keeping this application small and maintainable.

## Current Project Fit

This repository is a React/Vite app with Supabase Edge Functions, a Python FastAPI CV extractor, content scraping scripts, local security helpers, and a scholarship/CV matching workflow. The biggest gaps these tools can help with are:

- clearer product specifications before complex feature work
- isolated UI development for onboarding, scholarship, account, and CV import components
- fresher library documentation during AI-assisted coding
- stronger secret scanning before commits and in CI
- production error and performance visibility across frontend, Supabase functions, and Python services

Recommended integration order:

1. `gitleaks/gitleaks` for immediate secret safety.
2. `github/spec-kit` for feature governance and implementation discipline.
3. `getsentry/sentry` for observability before the parser and matching flow grow further.
4. `storybookjs/storybook` for UI confidence and visual documentation.
5. `upstash/context7` for AI-assisted docs lookup after the core workflow rules are in place.

## 1. `gitleaks/gitleaks`

### What It Does

Gitleaks scans repositories, directories, and stdin for hardcoded secrets. This project already has `.env` files, Supabase service role secrets, LLM provider keys, and generated content workflows, so secret scanning should be the first integration.

### Best Use In This Project

- Add local scanning through an npm script.
- Add a GitHub Actions workflow for pull requests, pushes, scheduled scans, and manual dispatch.
- Add a small `.gitleaks.toml` that extends default rules and allowlists known placeholders only.
- Keep the existing `scripts/scan-client-secrets.mjs`; use Gitleaks as the broader repository/history scanner.

### Initialization

Local options:

```bash
gitleaks dir -v .
gitleaks git -v --redact .
```

Suggested npm scripts:

```json
{
  "security:gitleaks:dir": "gitleaks dir -v --redact .",
  "security:gitleaks:git": "gitleaks git -v --redact ."
}
```

Suggested CI workflow:

```yaml
name: gitleaks

on:
  pull_request:
  push:
  workflow_dispatch:
  schedule:
    - cron: "0 4 * * *"

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Pros

- Fastest security win for this repo.
- Catches accidental Supabase, OpenAI, Anthropic, Gemini, Sentry, and database secrets.
- Works locally and in CI.
- Complements the existing client-secret scan instead of replacing it.
- Can scan git history, not just the current working tree.

### Cons

- Historical scans may reveal old leaks and require rotation, not just code changes.
- False positives are possible in sample configs, logs, generated content, and test fixtures.
- The official GitHub Action may require a license for organizations.
- Baselines can hide real issues if they are created too casually.

### Implementation Notes

Use a two-stage rollout:

1. Run `gitleaks dir` first to catch current files.
2. Run `gitleaks git` after deciding how to handle any historical findings.

Do not commit real scan reports if they include secret-like values. Store reports only as CI artifacts with redaction.

## 2. `github/spec-kit`

### What It Does

Spec Kit supports spec-driven development. It creates a workflow around specification, clarification, planning, tasks, consistency analysis, and implementation.

### Best Use In This Project

Use Spec Kit for high-ambiguity work:

- CV parser contract changes
- scholarship matching algorithm changes
- document upload, OCR, and validation features
- account/profile data model changes
- production observability and security gates

Do not require it for small copy edits or single-component fixes.

### Initialization

For this Windows workspace:

```bash
uvx --from git+https://github.com/github/spec-kit.git specify init . --script ps --ignore-agent-tools
```

If the CLI supports a Codex integration in the installed version, prefer:

```bash
uvx --from git+https://github.com/github/spec-kit.git specify init . --script ps --integration codex
```

If not, use `--ignore-agent-tools` and keep the generated templates as repo process documentation.

### Proposed Repository Rules

Create a Loci constitution with these principles:

- User-owned document data must stay server-side unless explicitly needed in the browser.
- CV parser output must be reviewable, confidence-scored, and recoverable.
- Scholarship scoring must show provenance and avoid silent overconfidence.
- Secrets must never be committed or exposed through `VITE_` variables.
- Every high-risk feature needs a spec, acceptance criteria, and targeted verification.

### Pros

- Gives AI-assisted work a stronger product and technical contract.
- Reduces drift between feature intent, implementation, and tests.
- Excellent fit for the parser and scholarship matching surfaces, where ambiguity is expensive.
- Produces Markdown artifacts that future agents and developers can read.
- Helps avoid "just code it" changes that quietly break data contracts.

### Cons

- Adds ceremony if used for tiny tasks.
- Generated folders and command files can feel noisy unless the team commits to the workflow.
- Requires discipline to keep specs updated after implementation.
- May duplicate existing docs unless the repo has a clear rule for where specs live.

### Implementation Notes

Adopt it as a gate for major features only. Start with one pilot spec:

```text
Feature: Server-side document parser parity
Goal: Bring Supabase Edge parser behavior closer to the richer Python backend, especially DOCX support, OCR fallback strategy, confidence scoring, and canonical profile completeness.
```

## 3. `getsentry/sentry`

### What It Does

Sentry is error tracking, performance monitoring, session replay, and release observability. The `getsentry/sentry` repo is the platform, but this project should integrate the official SDKs rather than vendoring the Sentry monorepo.

### Best Use In This Project

Integrate Sentry across three layers:

- React/Vite frontend with `@sentry/react`
- Python FastAPI extractor with `sentry-sdk`
- Supabase Edge Functions through lightweight manual error capture or Sentry's Deno-compatible SDK path after validation

### Frontend Initialization

Install:

```bash
npm install @sentry/react
```

Add public env values:

```env
VITE_SENTRY_DSN=
VITE_SENTRY_ENVIRONMENT=local
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0
VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=0.25
```

Create `src/instrument.js`, import it first in `src/index.jsx`, and wrap the app with Sentry-aware error handling. Keep `sendDefaultPii` off unless there is a deliberate privacy review.

### Python Backend Initialization

Install:

```bash
pip install sentry-sdk
```

Add to `backend/cv_extractor/requirements.txt`:

```text
sentry-sdk
```

Initialize before the FastAPI app is created:

```python
import os
import sentry_sdk

if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
        environment=os.getenv("SENTRY_ENVIRONMENT", "local"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        send_default_pii=False,
    )
```

### Supabase Edge Function Strategy

Start simple:

- Add structured error logging with job id, profile id, parser phase, provider, and error code.
- Avoid sending raw CV text or extracted document text.
- If Sentry is later enabled for Deno, use a narrow `beforeSend` scrubber and sample parser failures.

### Pros

- Gives visibility into frontend crashes, parser failures, LLM provider failures, and slow endpoints.
- Helps connect user-facing errors to backend traces and releases.
- Useful before scaling the CV parser and document import flow.
- Makes debugging production problems much faster than reading user reports alone.

### Cons

- Easy to over-collect sensitive data if not configured carefully.
- Session replay can capture private document or profile screens unless masked or disabled.
- Source maps require CI/release setup to be maximally useful.
- Adds external SaaS dependency and potential quota/cost concerns.

### Implementation Notes

The highest-value first milestone is error monitoring without replay. Add replay only after masking rules are reviewed against account, CV, transcript, and scholarship data screens.

## 4. `storybookjs/storybook`

### What It Does

Storybook provides isolated UI development, documentation, and component testing for React/Vite components.

### Best Use In This Project

Use Storybook for components that have meaningful state variation:

- `ScholarshipDocumentImport`
- `ScholarshipMatchSummary`
- `AccountProfileForm`
- `OnboardingForm`
- shared UI primitives in `src/components/ui/`
- empty, loading, failed, and completed scholarship/CV parser states

Do not put every page into Storybook immediately. Start with high-risk components.

### Initialization

```bash
npm create storybook@latest
```

Expected additions:

- `.storybook/main.js`
- `.storybook/preview.js`
- `src/**/*.stories.jsx`
- scripts: `storybook`, `build-storybook`

Recommended package path for this Vite/React project:

```bash
npm install --save-dev @storybook/react-vite
```

### First Stories

Create stories for:

- document import idle
- selected file
- parser processing
- parser failed
- parser completed with low confidence
- parser completed with high confidence
- signed-out state

### Pros

- Makes frontend states easier to inspect without manually reproducing auth/parser flows.
- Helps prevent UI regressions in the upload and matching workflow.
- Good documentation for future contributors and AI agents.
- Supports a11y and interaction testing as the UI matures.

### Cons

- Requires mocking Supabase/auth/parser hooks well.
- Stories can rot if treated as a side project.
- Adds dev dependencies and build time.
- Components with heavy inline styles may need cleanup to become pleasant Storybook citizens.

### Implementation Notes

Use Storybook as a frontend workshop, not as a second app. Keep stories close to user-critical states. Add CI build only after the first story set is stable.

## 5. `upstash/context7`

### What It Does

Context7 is an MCP/CLI documentation layer that injects current, version-specific docs into AI coding workflows.

### Best Use In This Project

Use it during tasks involving fast-moving APIs:

- Supabase JS and Edge Functions
- Sentry SDKs
- Storybook/Vite setup
- React Router v7
- Vite and build tooling
- OpenAI, Anthropic, Gemini, and parser provider SDKs

It should support development decisions, not become runtime application infrastructure.

### Initialization

CLI setup:

```bash
npx ctx7 setup
```

Manual MCP configuration:

```json
{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "headers": {
        "CONTEXT7_API_KEY": "YOUR_API_KEY"
      },
      "enabled": true
    }
  }
}
```

Suggested agent rule:

```text
Use Context7 when implementing or configuring third-party libraries, especially Supabase, Sentry, Storybook, Vite, React Router, and AI provider SDKs.
```

### Pros

- Reduces stale API mistakes during AI-assisted coding.
- Especially useful because this repo has modern Supabase, React Router, Vite, Sentry, and Storybook surfaces.
- Low runtime risk because it is a development tool, not user-facing code.
- Can be run as CLI or MCP depending on the agent environment.

### Cons

- Hosted mode sends documentation queries to an external service.
- Documentation coverage depends on Context7's indexing quality.
- It can create overconfidence if developers accept retrieved examples without checking project fit.
- Adds another tool to maintain in local setup instructions.

### Implementation Notes

Use it as a rule for library/API work, but keep final implementation decisions grounded in this repository's code and tests.

## Combined Rollout Plan

### Phase 1: Security Baseline

Add Gitleaks local and CI scanning.

Deliverables:

- `.gitleaks.toml`
- `.github/workflows/gitleaks.yml`
- npm scripts for local scans
- documented rule for secret rotation if findings appear

Verification:

```bash
npm run security:scan-client
gitleaks dir -v --redact .
```

### Phase 2: Feature Governance

Initialize Spec Kit and create the first parser parity spec.

Deliverables:

- `.specify/` workflow assets
- first feature specification under the generated specs folder
- constitution aligned with Loci's privacy, parser, and matching rules

Verification:

```bash
specify version
```

### Phase 3: Observability

Add Sentry SDKs to the frontend and Python backend.

Deliverables:

- frontend Sentry instrumentation
- Python FastAPI Sentry initialization
- `.env.example` entries for Sentry
- scrubber rules and privacy notes
- optional release/source-map plan

Verification:

```bash
npm run build
pytest backend/cv_extractor/tests
```

### Phase 4: UI Workshop

Initialize Storybook and add the first state-driven stories.

Deliverables:

- Storybook React/Vite config
- stories for document import, match summary, account form, and buttons
- `storybook` and `build-storybook` scripts

Verification:

```bash
npm run storybook
npm run build-storybook
```

### Phase 5: AI Documentation Assist

Configure Context7 as a development-only helper.

Deliverables:

- local Context7 setup instructions
- agent rule for when to use Context7
- no runtime dependency in the app

Verification:

```bash
npx ctx7 library supabase auth
npx ctx7 docs /supabase/supabase "edge functions auth"
```

## Pros And Cons Of The Full Stack

### Full Integration Pros

- Better protection against accidental secret leaks.
- More predictable feature development through specs and tasks.
- Better production debugging and faster root cause analysis.
- Safer UI iteration because parser and account states become reproducible.
- Better AI-assisted coding with current docs for modern libraries.

### Full Integration Cons

- More tooling to maintain.
- More CI minutes and dependency updates.
- More process overhead if every small task is forced through all tools.
- Privacy risk if Sentry or Context7 is configured too broadly.
- Storybook and Spec Kit need active discipline to stay useful.

## Final Recommendation

Use all five, but give each one a narrow job:

- Gitleaks protects secrets.
- Spec Kit controls major feature scope.
- Sentry observes real runtime failures.
- Storybook stabilizes complex UI states.
- Context7 improves library/API accuracy during development.

The strongest path is phased adoption, starting with Gitleaks and Spec Kit. That gives the project guardrails before adding observability and UI tooling.

## References

- GitHub Spec Kit docs: https://github.github.io/spec-kit/
- Spec Kit quick start: https://github.github.io/spec-kit/quickstart.html
- Storybook React/Vite docs: https://storybook.js.org/docs/get-started/frameworks/react-vite
- Context7 repository: https://github.com/upstash/context7
- Gitleaks repository: https://github.com/gitleaks/gitleaks
- Gitleaks GitHub Action: https://github.com/gitleaks/gitleaks-action
- Sentry React docs: https://docs.sentry.io/platforms/javascript/guides/react/
- Sentry FastAPI docs: https://docs.sentry.io/platforms/python/integrations/fastapi/
- Sentry JavaScript SDK repository: https://github.com/getsentry/sentry-javascript
