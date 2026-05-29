# Supabase Schema Notes

This folder holds the initial database schema for the IELTS app.

## What is included

- `profiles` for app-level user data mapped to Supabase Auth users
- `practice_sessions` for session history and answers
- `passages`, `questions`, and `scholarships` for public content
- `shortlists` and `cv_profiles` for user-owned scholarship data
- `user_section_accuracy` as an authenticated, RLS-respecting read-only view for progress tracking

## Why `profiles` instead of a custom `users` table

Supabase Auth already owns identity. The app profile table keeps RLS simple and lets us attach consent, device metadata, and app-specific flags without duplicating auth logic.

## Next step

Apply the SQL migration through the Supabase CLI or SQL editor, then connect the client to the tables one by one.

## CV parser edge function

The first free-tier migration path for CV parsing now lives in `supabase/functions/cv-parser`.

Current routes inside the function:

- `POST /functions/v1/cv-parser/upload`
- `POST /functions/v1/cv-parser/parse`
- `GET /functions/v1/cv-parser/jobs/{jobId}`
- `GET /functions/v1/cv-parser/drafts/{draftId}`
- `PUT /functions/v1/cv-parser/drafts/{draftId}`
- `PATCH /functions/v1/cv-parser/drafts/{draftId}`

Current input contract for `POST /upload`:

- multipart form-data with:
  - `file`
  - optional `notes`

Current fallback input contract for `POST /parse`:

```json
{
  "rawText": "Extracted CV text",
  "sourceFilename": "candidate-cv.pdf",
  "mimeType": "application/pdf",
  "documentType": "pdf",
  "rawTextHash": "sha256..."
}
```

Notes:

- The preferred path is now `POST /upload`, which extracts PDF/TXT/RTF server-side.
- `POST /parse` remains as a fallback path for already-extracted text.
- Drafts and jobs are persisted in `cv_profile_drafts` and `cv_parse_jobs`.
- Required secrets: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`, plus `LLM_PROVIDER`.

## Localhost workflow

1. Create frontend env:

```bash
cp .env.local.example .env.local
```

2. Create local function secrets:

```bash
cp supabase/.env.functions.example supabase/.env.functions.local
```

3. Fill in the real values in both files.

If you want the browser to talk to local Edge Functions while testing locally, set:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
VITE_SUPABASE_FUNCTIONS_URL=http://127.0.0.1:54321
```

If you intentionally want hosted auth/database but local functions during development, keep your hosted
`VITE_SUPABASE_URL` and set only:

```env
VITE_SUPABASE_FUNCTIONS_URL=http://127.0.0.1:54321
```

4. Run the frontend locally:

```bash
npm install
npm run dev
```

5. Run Edge Functions locally with your secrets file:

```bash
supabase start
supabase functions serve cv-parser --env-file supabase/.env.functions.local --no-verify-jwt
supabase functions serve document-intake --env-file supabase/.env.functions.local --no-verify-jwt
supabase functions serve generate-semantic-profile --env-file supabase/.env.functions.local --no-verify-jwt
supabase functions serve generate-embedding --env-file supabase/.env.functions.local --no-verify-jwt
```

Notes for localhost:

- `APP_ORIGIN` should stay `http://localhost:5173` while Vite is local.
- The current `cv-parser` function now prefers file upload and does PDF/TXT/RTF extraction server-side.
- If direct upload fails or the file type is unsupported, the frontend falls back to the older extracted-text route.
- A small client helper for invoking the parser lives in `src/services/cvParserClient.js`.
