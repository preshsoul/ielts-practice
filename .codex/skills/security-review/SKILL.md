---
name: security-review
description: Review this repo with a security-first lens, produce concrete findings ordered by severity, and turn the highest-signal issues into implementation work where safe.
---

# security-review

Review this project like an application security engineer, not like a style reviewer.

## Primary goal

Find real risks in:

- authentication and session handling
- authorization and ownership checks
- input validation and deserialization
- secret exposure
- browser security headers and CSP
- file upload and document parsing
- rate limiting and abuse resistance
- caching safety
- logging and sensitive data exposure
- Supabase service-role usage and RLS assumptions

## Workflow

### 1. Map the attack surface

Check:

- `src/`
- `src/server/`
- `api/`
- `netlify/functions/`
- `supabase/functions/`
- `backend/cv_extractor/`
- deployment config like `vercel.json`, `netlify.toml`, and `index.html`

### 2. Prioritize findings

Order by:

1. exploitable auth/authz flaws
2. secret exposure or client-side leakage
3. file upload or parsing abuse
4. injection or XSS surfaces
5. broken or overly permissive CSP/CORS/security headers
6. denial-of-service risks
7. logging/privacy leaks

### 3. Prefer proof over guesswork

For each finding, point to:

- the file
- the exact risky behavior
- why it matters in this app
- the likely exploit or failure mode

### 4. Fix what is safe to fix immediately

If the fix is low-risk and local, implement it.

Examples:

- tighten CSP while preserving functionality
- reject unsafe input fields
- add missing security headers
- reduce secret exposure surface
- add missing rate limits

### 5. Stop at the right boundary

If a fix requires:

- rotating real credentials
- changing Supabase dashboard policy
- changing external deployment secrets
- adding WAF or CDN controls

document the exact action instead of pretending code alone solved it.

## Output shape

1. findings first, highest severity first
2. implementation summary second
3. residual risks or required external actions last

## Repo-specific checks

- Confirm runtime env bootstrapping does not force unsafe inline script allowances unnecessarily.
- Confirm the deployed CSP matches actual use of Google Fonts, Supabase, and local backend development URLs.
- Confirm service-role keys exist only in trusted server runtimes.
- Confirm CV parser endpoints validate UUIDs and bound payload sizes.
- Confirm staged draft ownership is explicit and not only implied by client behavior.
