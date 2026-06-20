import { mkdir, readFile, writeFile, access, cp } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from 'vite';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');
const jsPath = path.join(assetsDir, 'index.js');
const cssPath = path.join(assetsDir, 'index.css');
const runtimeEnvPath = path.join(distDir, 'runtime-env.js');

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
  const env = loadEnv(process.env.NODE_ENV || 'production', root, '');
  const publicEnv = {
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL || env.SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY:
      env.VITE_SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY ||
      env.SUPABASE_PUBLISHABLE_KEY ||
      '',
    VITE_SUPABASE_FUNCTIONS_URL: env.VITE_SUPABASE_FUNCTIONS_URL || '',
    VITE_CV_EXTRACTOR_URL: env.VITE_CV_EXTRACTOR_URL || '',
    VITE_APP_OWNER: env.VITE_APP_OWNER || '',
  };

  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<script type="module" src="/src/index.jsx"></script>', '<script type="module" src="./assets/index.js"></script>');
  html = html.replace('<script src="/runtime-env.js"></script>', '<script src="./runtime-env.js"></script>');
  for (const [key, value] of Object.entries(publicEnv)) {
    html = html.replaceAll(`%${key}%`, value);
  }

  if (await exists(cssPath)) {
    html = html.replace('</head>', '    <link rel="stylesheet" href="./assets/index.css" />\n  </head>');
  }

  await writeFile(path.join(distDir, 'index.html'), html, 'utf8');
  await cp(path.join(root, 'public', 'runtime-env.js'), runtimeEnvPath, { force: true });
  if (await exists(runtimeEnvPath)) {
    let runtimeEnv = await readFile(runtimeEnvPath, 'utf8');
    for (const [key, value] of Object.entries(publicEnv)) {
      runtimeEnv = runtimeEnv.replaceAll(`%${key}%`, value);
    }
    await writeFile(runtimeEnvPath, runtimeEnv, 'utf8');
  }
  await cp(path.join(root, 'public', 'data'), path.join(distDir, 'data'), { recursive: true });
  // Static files served at root
  for (const file of ['robots.txt', 'sitemap.xml']) {
    const src = path.join(root, 'public', file);
    if (await exists(src)) {
      await cp(src, path.join(distDir, file));
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
