# CV Extractor Backend

## Staging backend

The parser now supports two staging modes for recoverable onboarding drafts:

- `sqlite`: best for local development on a single machine.
- `postgres`: best for production, horizontal scaling, and shared job state.
- `auto`: chooses Postgres when `CV_PARSER_DATABASE_URL` or `DATABASE_URL` looks like a Postgres URL, otherwise falls back to SQLite.

Environment variables:

```env
CV_PARSER_STAGE_BACKEND=auto
CV_PARSER_DATABASE_URL=postgresql://postgres:password@db.host:5432/postgres
CV_STAGE_TTL_MINUTES=60
CV_MAX_UPLOAD_BYTES=5242880
CV_COOKIE_SECURE=true
```

Notes:

- The service auto-creates `cv_parse_jobs` and `cv_profile_drafts` in Postgres on startup.
- For Supabase, use the direct Postgres connection string from Project Settings.
- Keep `CV_COOKIE_SECURE=true` anywhere HTTPS is enabled.

## Supported CV file types

The staged parser accepts:

- PDF
- DOCX
- TXT

The upload endpoint remains:

```http
POST /api/v1/extractor/parse-cv
```

Optional form field:

- `match_criteria`: JSON string matching the `CvMatchCriteria` schema. When provided, the parser stores a structured deterministic match result in `metadata.deterministic_match` on the job and draft records.

## LLM provider setup

Choose one provider with `LLM_PROVIDER`.

### OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1
OPENAI_TIMEOUT_SECONDS=45
```

### Gemini

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

Rules:

- Set only server-side secrets in the backend environment, never in `src/` or browser-exposed `VITE_*` variables.
- Restart the FastAPI process after changing provider variables.
- If both keys exist, the active provider is still controlled by `LLM_PROVIDER`.

## Parser pipeline

The parser now follows a layered strategy inspired by LiteParse, Dedoc, SemTools, and MonkeyOCR:

- native text extraction first for PDF, DOCX, and TXT
- layout repair before LLM analysis to reduce broken line order and hyphenation noise
- LLM preflight sanity checks so low-quality OCR output is rejected before any provider call
- optional LiteParse fallback for OCR-aware local recovery on hard PDFs
- optional Dedoc HTTP fallback when document structure needs to be reconstructed
- section-aware matching so education, skills, and experience are weighted differently

Optional parser fallbacks:

```env
CV_ENABLE_LITEPARSE_FALLBACK=false
CV_DEDOC_URL=
CV_LLM_MIN_TEXT_CHARS=250
CV_LLM_MAX_TEXT_CHARS=16000
CV_LLM_MIN_ALPHA_RATIO=0.55
CV_LLM_MAX_SUSPICIOUS_RATIO=0.18
CV_LLM_MIN_UNIQUE_LINE_RATIO=0.45
CV_LLM_MAX_DUPLICATE_LINE_SHARE=0.45
```

Notes:

- LiteParse is used only as a server-side fallback and never from the browser.
- Dedoc should point to a private backend service endpoint, not a public unauthenticated URL.
- MonkeyOCR is not wired in directly because it is substantially heavier operationally; the new parser seam is designed so a hosted OCR/vision parser can be added later without changing the API contract.

## Deterministic matcher

The backend also exposes a deterministic matcher for fast, auditable CV scoring:

```http
POST /api/v1/extractor/match-cv
Content-Type: application/json
```

Compared with the earlier flat TF-IDF pass, the matcher now:

- repairs layout noise before scoring
- identifies likely CV sections
- checks graduation year and degree-class thresholds explicitly
- extracts likely disciplines, exams, and skills from the CV
- builds a weighted similarity score across education, skills, and experience text
- reports matched and missing requirement signals for debugging

## Sanity test coverage

The local Python sanity suite now covers:

- layout repair and section splitting
- LLM preflight gating for noisy or repeated OCR output
- structured matcher scenario matrices across good fits, weak fits, exam requirements, and eligibility failures

Run it with:

```bash
python -m unittest discover -s backend/cv_extractor/tests -p "test_*.py"
```

Example payload:

```json
{
  "raw_cv_text": "Bachelor of Science in Computer Science. Graduation Year: 2024. First Class Honours. Python, React, FastAPI, PostgreSQL.",
  "criteria": {
    "min_graduation_year": 2022,
    "acceptable_degree_classes": ["First Class", "Second Class Upper"],
    "job_or_scholarship_description": "Looking for a software developer proficient in Python, React, FastAPI, and PostgreSQL data infrastructure."
  }
}
```

Example response:

```json
{
  "is_eligible": true,
  "match_confidence_score": 73.84,
  "extracted_metadata": {
    "graduation_year": 2024,
    "degree_classification": "First Class"
  },
  "compliance_flags": []
}
```
