---
name: fix-issue
description: Fix a bug in this project by reproducing it first, writing or updating a failing test when practical, implementing the minimal fix, and verifying the affected surfaces.
---

# fix-issue

Fix issues in this repo from first principles: reproduce first, fix second.

## Workflow

1. Read the bug report, failing behavior, or user request carefully.
2. Identify the affected runtime:
   - `src/` for frontend behavior
   - `src/server/` or `api/` or `netlify/functions/` for auth/API bridge issues
   - `supabase/functions/` for Edge Function issues
   - `backend/cv_extractor/` for Python parser issues
3. Reproduce the bug locally.
4. Add or update the smallest useful automated test when practical.
5. Confirm the test fails before changing the implementation.
6. Implement the fix with the narrowest safe scope.
7. Re-run the targeted test, then run broader verification for the touched area.
8. Summarize the root cause, the fix, and any residual risk.

## Verification map

- Frontend logic or pure JS modules:
  - `npm test`
- Auth bridge changes:
  - `node -e "import('./src/server/supabaseAuthBridge.js').then(() => console.log('ok'))"`
- Python extractor changes:
  - `python -m compileall backend/cv_extractor`
- End-to-end request path changes:
  - run the smallest targeted manual flow available, then note what was or was not verified

## Rules

- Reproduce before fixing.
- Prefer adding a regression test over relying on explanation alone.
- Do not broaden formatting or refactors outside the bug fix unless required.
- If a production secret, migration, or third-party dashboard change is required, stop at the code boundary and tell the user exactly what still needs to happen.
