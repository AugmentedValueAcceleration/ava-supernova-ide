// Can the SHIPPED IDE sidecar make and read Word, Excel and PDF files?
//
// Bundles the extension's document smoke test with the sidecar's own settings
// (scripts/sidecar-shared.mjs), copies the same side files, and runs it from a
// temp folder with no node_modules above it. Added 14 Nov 2026.
//
//   node scripts/check-documents.mjs

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { SIDECAR_BUILD, copyDocumentAssets } from './sidecar-shared.mjs';

const dir = mkdtempSync(join(tmpdir(), 'ava-ide-doc-smoke-'));
try {
  await build({
    ...SIDECAR_BUILD,
    entryPoints: ['../extension/scripts/documents-smoke-entry.mjs'],
    outfile: join(dir, 'smoke.mjs'),
    logLevel: 'warning',
  });
  copyDocumentAssets(dir);
  execFileSync(process.execPath, [join(dir, 'smoke.mjs')], { cwd: dir, stdio: 'inherit' });
} catch {
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
