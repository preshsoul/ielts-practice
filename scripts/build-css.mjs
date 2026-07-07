/**
 * Processes the app's CSS with Tailwind (PostCSS).
 *
 * esbuild bundles CSS imports but doesn't process Tailwind directives.
 * This script runs postcss + tailwindcss + autoprefixer against the
 * source CSS and overwrites the esbuild output with properly generated
 * utility classes.
 *
 * Handles the `shadcn/tailwind.css` package import (which uses the
 * "style" export condition) by resolving it to the actual file path
 * since postcss-import doesn't understand package.json exports.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import atImport from "postcss-import";

const root = process.cwd();

function resolveShadcn(id) {
  // Handle shadcn package "style" export condition
  // shadcn's package.json exports "./tailwind.css" → "./dist/tailwind.css" under the "style" condition
  if (id === "shadcn/tailwind.css") {
    return path.join(root, "node_modules", "shadcn", "dist", "tailwind.css");
  }
  return id;
}

const inputPath = path.join(root, "src", "index.css");
const outputPath = path.join(root, "dist", "assets", "index.css");

const css = await readFile(inputPath, "utf8");

const result = await postcss([
  atImport({
    resolve(id, basedir) {
      // First try the custom resolution
      const resolved = resolveShadcn(id);
      if (resolved !== id && path.isAbsolute(resolved)) return resolved;
      // Fall back to default resolution
      return atImport.prototype?.resolve
        ? id
        : id; // let postcss-import use its default
    },
    path: [path.dirname(inputPath), path.join(root, "node_modules")],
  }),
  tailwindcss(),
  autoprefixer(),
]).process(css, {
  from: inputPath,
  to: outputPath,
  map: false,
});

// Minify: collapse whitespace
let output = result.css
  .replace(/\s+/g, " ")
  .replace(/;\s*}/g, "}")
  .replace(/\s*{\s*/g, "{")
  .replace(/}\s*/g, "}")
  .replace(/{\s*/g, "{")
  .trim();

await writeFile(outputPath, output, "utf8");

console.log(`[build-css] Tailwind CSS → ${outputPath} (${Buffer.byteLength(output, "utf8")} bytes)`);
