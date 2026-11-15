// How the sidecar is bundled, and the files bundled libraries need beside it.
// Shared by bundle-sidecar.mjs and check-documents.mjs, so the check always
// tests exactly what ships.
//
// Found 14 Nov 2026: PDFs could not be made in the IDE. pdfkit reads its
// built-in fonts from `__dirname/data`, but the sidecar is an ES module (no
// `__dirname`) and no data folder sat beside it — "__dirname is not defined".

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const SIDECAR_BUILD = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['node:*'],
  minify: true,
  // `require` for the CommonJS libraries inside, and a real `__dirname` /
  // `__filename` for the ones that read files beside themselves (pdfkit).
  banner: {
    js: 'import{createRequire}from"node:module";import{fileURLToPath as __avaFileURLToPath}from"node:url";import{dirname as __avaDirname}from"node:path";const require=createRequire(import.meta.url);const __filename=__avaFileURLToPath(import.meta.url);const __dirname=__avaDirname(__filename);',
  },
};

const coreRequire = () => createRequire(path.resolve('..', 'core', 'package.json'));

/** pdfkit's built-in fonts + colour profile → `<outDir>/data`. */
export function copyDocumentAssets(outDir) {
  const req = coreRequire();
  const pdfkitData = path.join(path.dirname(req.resolve('pdfkit')), 'data');
  const dest = path.join(outDir, 'data');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(pdfkitData)) fs.copyFileSync(path.join(pdfkitData, f), path.join(dest, f));
}
