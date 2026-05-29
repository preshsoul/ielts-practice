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
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
});
