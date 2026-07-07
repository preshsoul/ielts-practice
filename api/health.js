// Minimal health check — no imports, no deps
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    node: process.version,
    env: {
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      vercelEnv: process.env.VERCEL_ENV || "not set",
    },
  });
}
