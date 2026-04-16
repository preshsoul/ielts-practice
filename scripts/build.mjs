import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });

  await build({
    entryPoints: [path.join(root, 'src', 'index.jsx')],
    bundle: true,
    format: 'esm',
    jsx: 'automatic',
    outfile: path.join(assetsDir, 'index.js'),
    loader: {
      '.png': 'file',
      '.jpg': 'file',
      '.jpeg': 'file',
      '.gif': 'file',
      '.svg': 'file',
      '.webp': 'file',
    },
    minify: true,
    sourcemap: false,
    logLevel: 'info',
  });

  const cssPath = path.join(assetsDir, 'index.css');
  const hasCss = await exists(cssPath);

  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<script type="module" src="/src/index.jsx"></script>', '<script type="module" src="./assets/index.js"></script>');
  if (hasCss) {
    html = html.replace('</head>', '    <link rel="stylesheet" href="./assets/index.css" />\n  </head>');
  }

  await writeFile(path.join(distDir, 'index.html'), html, 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
