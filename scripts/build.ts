// Construit dist/ : copie les fichiers statiques de site/ et compile le client TypeScript.
// Utilisé par `npm run build` et automatiquement par `wrangler dev` (voir wrangler.jsonc).

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const OUT = 'dist';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync('site', OUT, { recursive: true });

await build({
  entryPoints: ['src/client/main.ts'],
  outfile: `${OUT}/app.js`,
  bundle: true,
  format: 'esm',
  // Safari iOS 15+ (WebView de WeChat sur iPhone) et Chromium 100+ (WeChat Android).
  target: ['es2020', 'safari15', 'chrome100'],
  minify: true,
  sourcemap: true,
  logLevel: 'warning',
});
