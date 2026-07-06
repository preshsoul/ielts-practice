import { defineConfig, loadEnv } from "vite";

function applyDevSecurityHeaders(res) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' https://*.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.posthog.com http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*;"
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  const supabaseFunctionsUrl = env.VITE_SUPABASE_FUNCTIONS_URL || "";
  const cvExtractorUrl = env.VITE_CV_EXTRACTOR_URL || "";
  const appOwner = env.VITE_APP_OWNER || "";

  if (supabaseUrl) {
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.VITE_SUPABASE_URL = supabaseUrl;
  }

  if (supabaseAnonKey) {
    process.env.SUPABASE_ANON_KEY = supabaseAnonKey;
    process.env.SUPABASE_PUBLISHABLE_KEY = supabaseAnonKey;
    process.env.VITE_SUPABASE_ANON_KEY = supabaseAnonKey;
  }

  return {
    plugins: [
      {
        name: "dev-server-config",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            applyDevSecurityHeaders(res);
            next();
          });

          server.middlewares.use((req, res, next) => {
            if (req.url !== "/runtime-env.js") {
              next();
              return;
            }

            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
            res.end(
              `window.__LOCI_ENV__ = ${JSON.stringify({
                VITE_SUPABASE_URL: supabaseUrl,
                VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
                VITE_SUPABASE_FUNCTIONS_URL: supabaseFunctionsUrl,
                VITE_CV_EXTRACTOR_URL: cvExtractorUrl,
                VITE_APP_OWNER: appOwner,
              }, null, 2)};\n`
            );
          });
        },
      },
    ],
  };
});
