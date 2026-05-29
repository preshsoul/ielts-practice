---
name: debug-runtime-logs
description: Debug failures across this repo's frontend, auth bridge, Supabase Edge Functions, and Python CV extractor by tracing root cause instead of stopping at the final error.
---

# debug-runtime-logs

You are debugging runtime failures in a multi-runtime app. Find the root cause, not just the last crash line.

## Inputs

The user may provide one or more of:

- browser console output
- `logs/` files from local Vite or scripts
- Netlify/Vercel function logs
- Supabase Edge Function logs
- Python CV extractor logs

## Workflow

### 1. Orient the failing path

Determine which path failed:

- browser UI only
- frontend to auth bridge
- frontend to Supabase Edge Function
- frontend to Python CV extractor
- background content script

### 2. Build a timeline

Trace events in order:

1. request origin
2. auth/session state
3. network call
4. server/runtime error
5. downstream symptoms

Do not assume the first visible error is the trigger.

### 3. Search by failure class

- Auth/session:
  - `401`, `403`, cookie mismatch, origin mismatch, missing bearer token
- Validation:
  - `400`, unexpected field, invalid UUID, payload too large
- Rate limiting:
  - `429`, `Retry-After`, `RATE_LIMITED`
- Upstream model/provider:
  - OpenAI, Anthropic, Gemini timeouts or invalid payloads
- Storage/data:
  - missing table, RLS failure, stale content file, bad JSON

### 4. Correlate across runtimes

When a flow spans runtimes, check each hop:

- browser request payload
- auth bridge response
- Supabase function response
- Python service response

### 5. Re-verify the root cause

Before reporting:

- re-read the exact log lines
- confirm the root cause explains the downstream failures
- call out uncertainty if logs are incomplete

## Rules

- Prefer a causal chain over a list of disconnected errors.
- If logs are incomplete, say exactly what additional artifact is needed.
- Distinguish a root trigger from cleanup noise, retries, or cascade failures.
