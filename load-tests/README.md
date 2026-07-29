# LOCI Load Tests

## Prerequisites
```bash
npm install -g artillery
```

## Test Suites

Set the Supabase target through environment variables before running hosted load tests:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_FUNCTIONS_URL=https://your-project.supabase.co/functions/v1
```

### Backend (Python CV Extractor)
```bash
# Requires Python backend running on :8000
cd backend/cv_extractor && uvicorn main:app --host 127.0.0.1 --port 8000
npx artillery run load-tests/artillery.yml
```

### Full-stack (Frontend + APIs)
```bash
# Requires dev server on :5173 and Python backend on :8000
npm run dev
npx artillery run load-tests/artillery-fullstack.yml
```

### Production (Edge Functions)
```bash
# Tests against deployed Supabase Edge Functions
npx artillery run load-tests/artillery-edge.yml --target "$SUPABASE_URL"
```

## Output
Reports are written to `load-tests/reports/` (gitignored).
Generate HTML report:
```bash
npx artillery run --output load-tests/reports/run.json load-tests/artillery.yml
npx artillery report load-tests/reports/run.json
```
