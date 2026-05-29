# Connection Pooling and Client Lifecycle

## Current framework in this project

### Browser to Supabase
- The frontend creates a singleton Supabase JS client in [src/services/supabaseClient.js](C:/Users/Preshsoul/OneDrive/Desktop/IELTS/src/services/supabaseClient.js).
- This client does not open raw Postgres connections from the browser.
- It talks to Supabase over HTTPS for Auth, PostgREST, and Edge Functions.
- When the app receives a refreshed access token, `configureSupabaseSession()` rebuilds the client with the user `Authorization` header attached.

### Netlify/Vercel auth bridge
- The auth bridge in [src/server/supabaseAuthBridge.js](C:/Users/Preshsoul/OneDrive/Desktop/IELTS/src/server/supabaseAuthBridge.js) creates a short-lived Supabase server client per request.
- That client is also HTTP-based, not a direct database socket pool.
- Connection pooling is handled by Supabase’s managed API tier, not by this project code.

### Supabase Edge Functions
- The Edge Functions call Supabase Auth and REST endpoints with `fetch`.
- They do not create native database driver pools either.
- In practice, new function invocations create new outbound HTTP requests; persistent DB pooling is not part of this path.

### Python CV extractor
- The Python extractor is the place in this repo that can create direct database connections.
- In [backend/cv_extractor/job_store.py](C:/Users/Preshsoul/OneDrive/Desktop/IELTS/backend/cv_extractor/job_store.py), the SQLite backend opens a file-backed SQLite connection per operation.
- For Postgres staging, the code now uses `psycopg_pool.ConnectionPool`, so new requests borrow a pooled connection instead of creating a brand-new socket every time.

## What happens when a new client connects
- A new browser session does not connect directly to Postgres.
- It gets cookies/tokens through the auth bridge, then uses the shared Supabase JS client for HTTPS calls.
- Supabase itself owns the heavy connection management for browser-originated data access.
- The Python extractor is the only local service here that may hold reusable DB connections directly, and it now does that through a bounded pool.

## Operational notes
- If `CV_PARSER_STAGE_BACKEND=auto` and no Postgres URL is configured, the extractor falls back to SQLite and there is no cross-process pool.
- If `CV_PARSER_DATABASE_URL` or `DATABASE_URL` points to Postgres, the extractor uses the pool.
- Pool size is controlled with `CV_PARSER_DB_POOL_MAX_SIZE` and defaults to `5`.
