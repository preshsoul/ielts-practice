---
name: verify
description: Run targeted verification for changed files in this repo, with emphasis on the affected runtime instead of a one-size-fits-all test command.
---

# verify

Run verification on the current changes.

## Step 1: Find the scope

Inspect changed files first:

```powershell
git diff --name-only HEAD
```

Also include files touched during the current session.

## Step 2: Choose the smallest correct checks

- If `src/lib/` or `src/services/` changed:
  - `npm test`
- If `src/server/`, `api/`, or `netlify/functions/` changed:
  - `node -e "import('./src/server/supabaseAuthBridge.js').then(() => console.log('ok'))"`
- If `backend/cv_extractor/` changed:
  - `python -m compileall backend/cv_extractor`
- If `supabase/functions/` changed:
  - run any repo-local tests that cover the caller path
  - if `deno` is installed, run `deno check` on touched functions
- If docs or config only changed:
  - verify links, commands, and referenced env vars still exist

## Step 3: Report clearly

For each check:

- what was run
- whether it passed
- what could not be run locally
- what still needs manual verification

## Rules

- Prefer targeted checks before full-suite checks when the scope is small.
- Do not claim unrun checks passed.
- If a tool is missing locally, say so explicitly and keep going with the checks you can run.
