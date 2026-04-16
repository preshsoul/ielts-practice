# IELTS Practice & Scholarship Tools

Client-side IELTS practice and scholarship discovery app.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Supabase

Create a `.env` file from `.env.example` and add:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Use `src/services/supabaseClient.js` as the shared browser client.

## Deploy

- Vercel: build command `npm run build`, output directory `dist`
- Netlify: build command `npm run build`, publish directory `dist`
