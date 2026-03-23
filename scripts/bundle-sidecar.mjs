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

const nodeVersion = '20.18.3';
const targets = {
  'x86_64-pc-windows-msvc': `https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`,
};

for (const [triple, url] of Object.entries(targets)) {
  const outPath = join(binDir, `node-${triple}.exe`);
  if (existsSync(outPath)) {
    console.log(`[bundle] node-${triple}.exe already exists, skipping download.`);
    continue;
  }
  console.log(`[bundle] Downloading node.exe for ${triple}...`);
  execSync(`curl -L -o "${outPath}" "${url}"`, { stdio: 'inherit' });
  console.log(`[bundle] Downloaded node-${triple}.exe`);
}

console.log('[bundle] Done. Ready for tauri build.');
