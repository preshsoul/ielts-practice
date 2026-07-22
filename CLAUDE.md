# LOCI Security Rules & Access Control Matrix

> **Standing security baseline — applies to all changes in this project.**
> Do not relax these rules per-feature. If a rule must be bent, document the exception here.

---

## 1. Access Control Matrix

### 1.1 Database Roles (Supabase Postgres + RLS)

| Role | Scope | Auth Required | RLS Bypass | Used In |
|------|-------|---------------|------------|---------|
| `anon` | Public read-only content (passages, questions, scholarships, universities) | No | No | Browser client (public pages) |
| `authenticated` | User-owned CRUD (profiles, sessions, shortlists, cv_profiles, candidate_profiles, scholarship_matches, match_events, application_tracking, cv_parse_jobs, cv_profile_drafts) | Yes (JWT) | No | Browser client (authenticated routes) |
| `service_role` | Admin-level DB access, bypasses all RLS | Yes (server-side secret) | **YES** | Edge Functions, server-side scripts |

**Critical rule:** `service_role` queries MUST append `profile_id=eq.${profileId}` to every where-clause. The role bypasses RLS entirely — row-level scoping is manual and must never be omitted.

### 1.2 Table-Level RLS Summary

| Table | Read (anon) | Read (auth) | Write (auth) | Policy |
|-------|-------------|-------------|--------------|--------|
| `profiles` | No | Own row | Own row | `auth.uid() = id` |
| `passages` | Active only | Active only | None | `active = true` |
| `questions` | Active+verified | Active+verified | None | `active = true and verified = true` |
| `scholarships` | Active only | Active only | None | `active = true` |
| `universities` | All rows | All rows | None | `true` (reference data) |
| `practice_sessions` | None | Own rows | Own rows | `auth.uid() = profile_id` |
| `shortlists` | None | Own rows | Own rows | `auth.uid() = profile_id` |
| `cv_profiles` | None | Own rows | Own rows | `auth.uid() = profile_id` |
| `application_tracking` | None | Own rows | Own rows | `auth.uid() = candidate_id` |
| `candidate_profiles` | None | Own rows | Own rows | `auth.uid() = profile_id` |
| `scholarship_matches` | None | Own rows | Own rows | `auth.uid() = profile_id` |
| `match_events` | None | Own rows | Insert only | `auth.uid() = profile_id` |
| `cv_parse_jobs` | None | Own rows | Own rows | `auth.uid() = profile_id` |
| `cv_profile_drafts` | None | Own rows | Own rows | `auth.uid() = profile_id` |

### 1.3 Edge Function Access Control

| Function | Auth Required | Rate Limit | Max Body | Roles |
|----------|--------------|------------|----------|-------|
| `cv-parser` | Yes (JWT verified via Supabase Auth API) | 10 req/10min (upload), 12 req/10min (parse), 120 req/min (jobs/drafts read), 30 req/5min (drafts write) | 6 MB (upload), 200 KB (text parse) | service_role for DB ops |
| `document-intake` | Yes (JWT verified) | 30 req/5min | 512 KB | None (read-only validation) |
| `generate-embedding` | Yes (JWT verified) | 30 req/5min | 256 KB | None (stateless) |
| `generate-semantic-profile` | Yes (JWT verified) | 20 req/5min | 256 KB | None (stateless) |

### 1.4 Python Backend Access Control

| Endpoint | Auth Required | Rate Limit | Session Ownership |
|----------|--------------|------------|-------------------|
| `GET /healthz` | No | 120 req/min | N/A |
| `POST /parse-cv` | No (session cookie) | 10 req/10min | Cookie-based session |
| `POST /match-cv` | No | 30 req/5min | Stateless (cached) |
| `GET /parse-cv/{job_id}` | No (session cookie) | 120 req/min | Session ownership check |
| `GET /parse-cv/{job_id}/events` | No (session cookie) | 120 req/min | Session ownership check |
| `GET /profile-drafts/{draft_id}` | No (session cookie) | 120 req/min | Session ownership check |
| `PUT /profile-drafts/{draft_id}` | No (session cookie) | 30 req/5min | Session ownership check |
| `PATCH /profile-drafts/{draft_id}` | No (session cookie) | 30 req/5min | Session ownership check |

---

## 2. API Key & Secret Handling

### 2.1 Rules
1. **No secrets in source code.** Every credential reads from environment variables.
2. **`VITE_` prefix = public.** Vite inlines these into the client bundle. Only use `VITE_` for Supabase anon key, Supabase URL, functions URL, CV extractor URL, and app branding.
3. **Server secrets never use `VITE_`.** `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `CV_PARSER_DATABASE_URL` — no `VITE_` prefix.
4. **Build-time scan runs on every build.** `scripts/scan-client-secrets.mjs` checks `dist/` for 7 forbidden key names and their values. Build fails if any leak.
5. **Pre-commit hook blocks secret patterns.** `.git/hooks/pre-commit` scans staged changes for API key patterns and forbids `.env` file commits.
6. **`.gitignore` covers:** `.env`, `.env.local`, `.env.*` (except `.example`), `.claude/`, `node_modules/`, `dist/`, `.supabase/`, `*.pem`, `*.key`, `*-service-account.json`, `credentials.json`.
7. **Key rotation:** If a key is ever committed or exposed, rotate it immediately in the provider dashboard. Do not attempt to "clean" the git history as the only remediation.
8. **Pre-deployment safety:** Until the project ships, store secrets at the OS level (Windows environment variables) and inject them via `scripts/inject-secrets.ps1`. Never keep real credentials in `.env` files inside the project directory.

### 2.2 Env File Hierarchy
- `.env.example` — template with placeholders (safe to commit)
- `.env` — development-safe placeholders only (gitignored). Real values NEVER go here.
- `.env.local` — generated by `scripts/inject-secrets.ps1` from OS-level env vars (gitignored, transient)
- `dist/runtime-env.js` — build artifact, contains only `VITE_` keys (intentionally public)

### 2.3 Secret Injection (Local Dev)
```
# One-time setup: store secrets in your Windows user env vars
[Environment]::SetEnvironmentVariable("LOCI_SUPABASE_URL", "https://...", "User")
[Environment]::SetEnvironmentVariable("LOCI_SUPABASE_ANON_KEY", "eyJh...", "User")
# ... etc (see scripts/inject-secrets.ps1 for the full list)

# Each terminal session:
.\scripts\inject-secrets.ps1     # Creates .env.local from OS env vars
npm run dev                       # Vite picks up .env.local automatically

# Clean up when switching machines:
.\scripts\inject-secrets.ps1 -Clear
```
The `LOCI_` prefix namespaces the project's secrets in your OS env, preventing collisions with other projects. The injection script maps each `LOCI_*` OS var to the correct `.env.local` key name.

---

## 3. Input Validation & Sanitization

### 3.1 Frontend (Browser)
- **`src/lib/security.js`** — Core sanitization: strips control chars, HTML tags via `cleanText()`, validates emails with `cleanEmail()`, validates URLs with `cleanUrl()`. Apply to ALL user inputs before sending to any API.
- **`src/services/inputSanitizer.js`** — Higher-level sanitizer: `sanitizeHtml()` preserves only whitelisted tags, `containsSuspiciousPatterns()` blocks XSS vectors (`<script`, `javascript:`, `on*=`, `eval(`).
- **`cleanProfilePatch()`** — Strips privileged fields (`email_hash`, `device_id`, `tier`, `onboarding_completed`) before any profile update payload is sent.

### 3.2 Edge Functions (Deno)
- **`rejectUnexpectedFields()`** — Every endpoint must whitelist allowed JSON keys. Unknown fields are rejected with a 400 error.
- **`readString()`** — Enforces min/max length and optional regex pattern. Used for every string field.
- **`readNumber()`** — Enforces numeric type, finiteness, min/max range, and optional integer constraint.
- **`ensureObject()`** — Rejects arrays and primitives where objects are expected.
- **Content-Length guard** — Every endpoint checks `Content-Length` header BEFORE reading the body. Rejects with 413 if over the limit.
- **Strict JSON parser** — `document-intake` uses `parseAndValidateDocumentIntake()` which enforces `maxBytes`, `maxDepth`, `maxObjectKeys`, `maxArrayItems`.

### 3.3 Python Backend (FastAPI/Pydantic)
- **`extra="forbid"`** — All Pydantic models reject unexpected fields.
- **`max_length`** — All string fields have explicit `max_length` constraints (see `schemas.py` constants).
- **`ge`/`le`** — All numeric fields have bounds.
- **`str_strip_whitespace=True`** — Auto-trims whitespace on all string inputs.
- **File validation** — File size checked BEFORE processing (MAX_UPLOAD_BYTES), content type validated against ALLOWED_DOCUMENT_TYPES, filename length capped at 180 chars.

---

## 4. Rate Limiting

### 4.1 Architecture
- **Primary:** Upstash Redis (distributed, consistent across instances)
- **Fallback:** In-memory Map (per-instance, degrades under concurrency)
- **Key hashing:** Client IP + user ID is SHA-256 hashed before storage
- **Headers returned:** `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### 4.2 Endpoint Limits

| Endpoint | Requests | Window |
|----------|----------|--------|
| Auth login | 8 | 10 min |
| Auth OAuth callback | 20 | 10 min |
| Session check | 120 | 60 sec |
| CV parser upload | 10 | 10 min |
| CV parser parse | 12 | 10 min |
| CV parser jobs/drafts read | 120 | 60 sec |
| CV parser drafts write | 30 | 5 min |
| Document intake | 30 | 5 min |
| Embedding generation | 30 | 5 min |
| Semantic profile | 20 | 5 min |
| Health check | 120 | 60 sec |
| CV match | 30 | 5 min |

### 4.3 429 Response Format
```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please slow down and try again shortly."
  }
}
```

---

## 5. Authentication & Session Security

### 5.1 Token Storage
- **No custom cookie bridge.** Auth runs entirely through the Supabase JS SDK (`@supabase/supabase-js`) in the browser — no `api/auth.js` serverless proxy, no hand-rolled cookies.
- **Session storage:** the SDK persists the session (access + refresh token) in `localStorage` under its own key and handles PKCE code-verifier storage, auto-refresh, and cross-tab sync internally. This is the standard, Supabase-recommended pattern for SPAs and is what `src/services/supabaseClient.js` and `src/services/authBridge.js` implement.
- **Why the change:** an earlier iteration used a Vercel serverless function (`api/auth.js`) to set `HttpOnly` cookies manually. That approach hit a persistent, unrecoverable bug: Node's `res.setHeader("Set-Cookie", ...)` was called with a single comma-joined string instead of an array, so the browser only ever stored one of the two cookies (per RFC 6265, `Set-Cookie` cannot be folded) — the refresh token silently vanished on every login. Multiple attempts to patch this in place (see commit history around `api/auth.js`) kept resurfacing. The SDK-native approach removes the entire class of bug by eliminating the manual cookie bridge.
- If a future change reintroduces a server-side cookie bridge, `Set-Cookie` **must** be set via an array (`res.setHeader("Set-Cookie", [cookieA, cookieB])`), never a joined string.

### 5.2 Session Lifecycle
- Session refresh, expiry, and cross-tab sync are handled entirely by the Supabase SDK (`onAuthStateChange`, `getSession()`).
- OAuth (Google) uses the SDK's PKCE flow: `signInWithOAuth` redirects to Google, then `/auth/callback` (`src/components/AuthCallback.jsx`) calls `supabase.auth.exchangeCodeForSession()` to complete sign-in.
- The Supabase project's **Redirect URLs** allowlist (Auth → URL Configuration) must include `https://<production-domain>/auth/callback` — otherwise Supabase silently falls back to the Site URL and drops the OAuth code, which looks like a redirect loop back to the login page.

### 5.3 CSRF Protection
- `assertSameOrigin()` verifies `Origin` header on all POST operations.
- SameSite=Strict cookies prevent cross-site request forgery.
- OAuth nonce validation on callback endpoint.

### 5.4 Frontend Gate
- All authenticated routes are gated behind `authUser !== null` in `App.jsx`.
- `AuthGate` component renders for unauthenticated users.
- No route-level auth checks in child components (relies on parent gate — acceptable for single-level nesting).

---

## 6. Database Connection Pooling (Supabase)

### 6.1 Architecture
Supabase uses **PgBouncer** for connection pooling on managed Postgres instances. Connection mode is set in the Supabase dashboard under Database → Connection pooling.

- **Transaction mode (recommended):** PgBouncer assigns a connection for the duration of a single transaction. Compatible with Supabase client libraries. Best for serverless/Edge Functions that open many short-lived connections.
- **Session mode:** A connection is held for the lifetime of the client session. Required for prepared statements and some ORMs. Not recommended for serverless.
- **Port mapping:** Transaction mode uses port 6543; Session mode uses port 5432.

### 6.2 How Connections Open
1. **Browser client (anon/authenticated):** Uses Supabase JS SDK → PostgREST (port 443) → PgBouncer (port 6543) → Postgres. Each REST API call is a single transaction. The SDK does not hold persistent connections.
2. **Edge Functions (service_role):** Direct HTTP fetch to `https://<project>.supabase.co/rest/v1/<table>`. Each request is a separate HTTP call → PostgREST → PgBouncer → Postgres. No persistent connection pool in the Deno runtime.
3. **Python backend:** Uses SQLAlchemy (or raw psycopg2) with connection pooling configured via `CV_PARSER_DB_POOL_MAX_SIZE` (default 5). Pool size should not exceed the Supabase plan limit (typically 15-60 direct connections depending on compute tier).

### 6.3 Pool Exhaustion Prevention
- Edge Functions: Use `Prefer: return=representation` header to combine INSERT + SELECT into one call.
- Python: Set `pool_pre_ping=True` to detect and recycle stale connections. Set `pool_recycle` to less than the Supabase connection timeout (typically 300s).
- Never open connections in loops — batch queries where possible.

---

## 7. Caching Layer (Upstash Redis)

### 7.1 What to Cache
Use `rememberJson()` from `supabase/functions/_shared/security.ts`:
- **Embedding results** — TTL: 6 hours. Keyed on (input, model, dimensions, userId).
- **Semantic profiles** — TTL: 1 hour. Keyed on (model, text, userId).
- **CV match results** — TTL: 1 hour. Keyed on (raw_cv_text, criteria).
- **Scholarship catalog** — TTL: 24 hours. Cache the full catalog JSON.

### 7.2 Cache Key Rules
- Keys are SHA-256 hashed from the payload JSON + namespace.
- Prefix with `cache:<namespace>:` for namespacing.
- Never cache user credentials or tokens.
- Cache misses fall through to the loader function transparently.

### 7.3 Configuration
```
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-rest-token
```
Both must be set for Redis features to work. If missing, the system degrades gracefully to in-memory cache (per-instance, lost on cold start).

---

## 7. OWASP-Aligned Security Headers

All Edge Functions and the Python backend set:
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-Permitted-Cross-Domain-Policies: none`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cache-Control: no-store` (except `/healthz`: `public, max-age=30`)

Netlify (`netlify.toml`) adds CSP and HSTS headers.

---

## 8. Incident Response Checklist

If a secret is exposed:
1. **Rotate immediately** in the provider dashboard (Supabase, OpenAI, Anthropic, Google Cloud).
2. **Update `.env`** with the new value.
3. **Redeploy** Edge Functions: `npx supabase functions deploy <name>`
4. **Redeploy** site on Netlify/Vercel.
5. **Check audit logs** in the provider dashboard for unauthorized usage.
6. **If committed to git:** `git log --all --full-history -- <file>` to find the exposure, then force-push a cleanup after rotation. Consider `git filter-branch` or BFG for deep history cleanup.

---

## 9. Development Rules

1. **Never disable RLS** on any table, even in development.
2. **Never commit `.env` files.** The pre-commit hook blocks this.
3. **Run `npm run build` before merging** — the secret scanner runs as part of the build.
4. **Test rate limiting locally** by sending rapid requests and verifying 429 responses.
5. **All new API endpoints must have:** rate limiting, input validation (`rejectUnexpectedFields`), Content-Length guard, and authenticated user check (unless explicitly public like health).
6. **All new database tables must have:** RLS enabled, ownership policy defined, trigger for server-side enforcement if modifying privileged fields.
7. **LLM prompts must include:** Prompt injection mitigation — strip or escape user input before embedding in prompts. This applies to `generate-semantic-profile` and `cv-parser` functions.
