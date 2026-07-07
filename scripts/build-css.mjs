/**
 * Processes the esbuild-bundled CSS with Tailwind + Autoprefixer.
 *
 * esbuild bundles ALL CSS imports (index.css, styles.css, shadcn, fonts, etc.)
 * into dist/assets/index.css but does NOT process Tailwind directives
 * (@tailwind, @apply). This script reads the already-bundled output,
 * runs it through PostCSS with tailwindcss + autoprefixer to generate
 * utility classes and resolve @apply, then writes it back.
 *
 * The key detail: we read the esbuild OUTPUT (which has all custom styles
 * from styles.css, shadcn, etc. already resolved) rather than starting from
 * src/index.css (which would lose all custom styles).
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const root = process.cwd();
const cssPath = path.join(root, "dist", "assets", "index.css");

const css = await readFile(cssPath, "utf8");

const result = await postcss([
  tailwindcss(),
  autoprefixer(),
]).process(css, {
  from: cssPath,
  to: cssPath,
  map: false,
});

// Minify
let output = result.css
  .replace(/\s+/g, " ")
  .replace(/;\s*}/g, "}")
  .replace(/\s*{\s*/g, "{")
  .replace(/}\s*/g, "}")
  .replace(/{\s*/g, "{")
  .trim();

await writeFile(cssPath, output, "utf8");

console.log(`[build-css] Tailwind processed → ${cssPath} (${Buffer.byteLength(output, "utf8")} bytes)`);
