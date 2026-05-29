# LOCI Load Tests

## Prerequisites
```bash
npm install -g artillery
```

## Test Suites

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
# Replace URL with your Supabase project URL
npx artillery run load-tests/artillery-edge.yml --target https://bnttvgrqyxxhsdmpvkfz.supabase.co
```

## Output
Reports are written to `load-tests/reports/` (gitignored).
Generate HTML report:
```bash
npx artillery run --output load-tests/reports/run.json load-tests/artillery.yml
npx artillery report load-tests/reports/run.json
```
