import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');
const jsPath = path.join(assetsDir, 'index.js');
const cssPath = path.join(assetsDir, 'index.css');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(assetsDir, { recursive: true });

  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<script type="module" src="/src/index.jsx"></script>', '<script type="module" src="./assets/index.js"></script>');

  if (await exists(cssPath)) {
    html = html.replace('</head>', '    <link rel="stylesheet" href="./assets/index.css" />\n  </head>');
  }

  await writeFile(path.join(distDir, 'index.html'), html, 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
