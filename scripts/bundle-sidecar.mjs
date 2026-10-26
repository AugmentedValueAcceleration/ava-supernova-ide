#!/usr/bin/env node
/**
 * Bundle the sidecar + @ava/core into a single .mjs file,
 * and download node.exe for the target platform.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const tauriDir = join(root, 'src-tauri');

// 1. Bundle sidecar
console.log('[bundle] Bundling sidecar + @ava/core...');
const resourcesDir = join(tauriDir, 'resources');
if (!existsSync(resourcesDir)) mkdirSync(resourcesDir, { recursive: true });

await build({
  entryPoints: [join(root, 'sidecar', 'index.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: join(resourcesDir, 'sidecar-bundle.mjs'),
  external: ['node:*'],
  minify: true,
  banner: { js: 'import{createRequire}from"node:module";const require=createRequire(import.meta.url);' },
});
console.log('[bundle] Sidecar bundled successfully.');

// 2. Download node.exe if not present
const binDir = join(tauriDir, 'binaries');
if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

// Node 20 is end-of-life (Apr 2026) and missed the 21 Oct 2026 security release
// (TLS hostname-check bypass, Brotli RCE, eMudhra certificate distrust). Keep
// this on a patched release of a supported major.
const nodeVersion = '24.22.1';
const targets = {
  'x86_64-pc-windows-msvc': `https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`,
};

for (const [triple, url] of Object.entries(targets)) {
  const outPath = join(binDir, `node-${triple}.exe`);
  // Present is not the same as current. This used to skip on existence alone,
  // so changing nodeVersion kept shipping whatever binary was already on disk.
  if (existsSync(outPath)) {
    let have = '';
    try { have = execSync(`"${outPath}" --version`).toString().trim(); } catch { /* unreadable: replace it */ }
    if (have === `v${nodeVersion}`) {
      console.log(`[bundle] node-${triple}.exe is already v${nodeVersion}, skipping download.`);
      continue;
    }
    console.log(`[bundle] node-${triple}.exe is ${have || 'unreadable'}, replacing with v${nodeVersion}.`);
  }
  console.log(`[bundle] Downloading node.exe for ${triple}...`);
  execSync(`curl -L -o "${outPath}" "${url}"`, { stdio: 'inherit' });
  console.log(`[bundle] Downloaded node-${triple}.exe`);
}

console.log('[bundle] Done. Ready for tauri build.');
