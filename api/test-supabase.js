// Test: can we import @supabase/supabase-js at all?
import { createClient } from "@supabase/supabase-js";

export default function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";

  if (!url || !key) {
    return res.status(500).json({ ok: false, error: "Missing env vars" });
  }

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return res.status(200).json({ ok: true, import: "works", clientCreated: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, stack: e.stack?.split("\n")[0] });
  }
}
