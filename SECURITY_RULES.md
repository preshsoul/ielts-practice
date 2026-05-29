# Security Rules

This file is the standing security contract for the project. Follow it for every change, even when a prompt does not mention security explicitly.

## 1. Secrets and Keys
- Never hardcode secrets, tokens, or service-role credentials in source files, client bundles, test fixtures, screenshots, or logs.
- Public browser code may use only intentionally public values such as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Server-only credentials must come from environment variables.
- If a key is suspected to be exposed, rotate it before or during deployment.
- `.env`, local function env files, and generated reports must stay out of git.

## 2. Authentication and Authorization
- Treat every network entrypoint as hostile until validated and authorized.
- Authenticate before performing user-bound reads, writes, document parsing, embeddings, or semantic generation.
- Use explicit ownership checks on staged CV jobs and drafts.
- Never derive authorization from editable user metadata.

## 3. Input Validation
- Validate all request bodies with strict schemas.
- Reject unexpected fields instead of silently ignoring them.
- Enforce type checks, byte limits, item-count limits, and string length limits.
- Validate identifiers such as UUIDs before using them in data access queries.
- Sanitize user-controlled text before persisting or rendering it.

## 4. Rate Limiting
- All public endpoints must have rate limiting.
- Use both network identity and user/session identity when available.
- Prefer shared Redis-backed counters in deployed environments and safe in-memory fallback locally.
- Return graceful `429` responses with `Retry-After` and rate-limit headers.

## 5. Data Access
- Keep RLS enabled on exposed Supabase tables.
- Service-role access is allowed only in trusted server runtimes and only for operations that cannot rely on user-scoped RLS.
- Prefer least-privilege queries and narrow selects.
- Cache only data that is stable enough to reuse safely.

## 6. Browser and API Surface
- Return defensive headers on API responses: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy`.
- Use `no-store` for sensitive auth and profile endpoints by default.
- Allow cross-origin requests only from explicitly configured app origins.

## 7. Logging and Errors
- Do not log raw secrets, access tokens, refresh tokens, or full uploaded document content.
- Error responses should be actionable for users but should not leak internals, stack traces, SQL text, or provider payloads.
- Keep detailed failure details server-side only when they do not contain secrets or personal data.

## 8. Caching
- Shared cache and distributed rate limits use Upstash Redis when configured.
- Cache only deterministic or low-volatility responses.
- Do not cache authenticated session material, tokens, or user-private documents in shared caches unless the cache key is explicitly user-bound and the value is safe to store.

## 9. File and Document Handling
- Limit upload size and accepted MIME types/extensions.
- Reject unreadable or oversized documents early.
- Never trust filenames, MIME types, or client-declared metadata alone.

## 10. Delivery Gate
- Before merge or deploy, confirm:
- no hardcoded secrets were introduced
- public endpoints still enforce rate limits
- schema validation rejects unknown fields
- client bundles do not contain server-only keys
- docs/examples reflect current required env vars
