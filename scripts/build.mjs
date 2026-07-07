import { rm } from "node:fs/promises";
import { build } from "esbuild";
import { loadEnv } from "vite";

const mode = process.env.NODE_ENV || "production";
const env = loadEnv(mode, process.cwd(), "");

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
const supabaseAnonKey =
  env.VITE_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  "";
const supabaseFunctionsUrl = env.VITE_SUPABASE_FUNCTIONS_URL || "";
const cvExtractorUrl = env.VITE_CV_EXTRACTOR_URL || "";
const appOwner = env.VITE_APP_OWNER || "Loci";
const sentryDsn = env.VITE_SENTRY_DSN || "";
const sentryEnv = env.VITE_SENTRY_ENVIRONMENT || mode;
const sentryTracesRate = env.VITE_SENTRY_TRACES_SAMPLE_RATE || "0";
const sentryReplaySessionRate = env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE || "0";
const sentryReplayErrorRate = env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE || "0";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/index.jsx"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: "dist/assets",
  entryNames: "index",
  chunkNames: "chunks/[name]-[hash]",
  assetNames: "assets/[name]-[hash]",
  minify: true,
  loader: {
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".gif": "file",
    ".svg": "file",
    ".webp": "file",
    ".woff2": "file",
    ".woff": "file",
  },
  conditions: ["style"],
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "import.meta.env.MODE": JSON.stringify(mode),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
    "import.meta.env.VITE_SUPABASE_FUNCTIONS_URL": JSON.stringify(supabaseFunctionsUrl),
    "import.meta.env.VITE_CV_EXTRACTOR_URL": JSON.stringify(cvExtractorUrl),
    "import.meta.env.VITE_APP_OWNER": JSON.stringify(appOwner),
    "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(sentryDsn),
    "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(sentryEnv),
    "import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE": JSON.stringify(sentryTracesRate),
    "import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE": JSON.stringify(sentryReplaySessionRate),
    "import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE": JSON.stringify(sentryReplayErrorRate),
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
});
