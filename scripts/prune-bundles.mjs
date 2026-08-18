#!/usr/bin/env node
/**
 * Keep the two most recent builds' installers and delete the rest.
 *
 * On 2026-08-18 this tree held 62 installers — 2.0GB — going back to 0.25.1,
 * because `tauri build` never removes anything and nothing else was doing it.
 * Together with the extension's 112 stale .vsix packages that was 2.7GB of
 * builds nobody could use.
 *
 * Deleting them costs nothing: every published version is on its GitHub
 * release. Two are kept so a rollback does not need a download.
 *
 * A VERSION's files are kept or dropped together — the .msi, the setup .exe
 * and their .sig files. Dropping a .sig while keeping its installer would
 * leave `updater-manifest` unable to write a manifest for a build that is
 * still sitting right there, which is a confusing way to break a release.
 */
import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ideRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = join(ideRoot, 'src-tauri', 'target', 'release', 'bundle');
const KEEP = 2;

if (!existsSync(bundleDir)) {
  console.log('[prune] no bundle directory — nothing to do.');
  process.exit(0);
}

/** Every installer/signature file, grouped by the version in its name. */
const byVersion = new Map();
for (const sub of ['nsis', 'msi']) {
  const dir = join(bundleDir, sub);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!/\.(msi|exe)(\.sig)?$/.test(name)) continue;
    const version = name.match(/_(\d+\.\d+\.\d+)_/)?.[1];
    if (!version) continue;
    const path = join(dir, name);
    const entry = byVersion.get(version) ?? { files: [], mtime: 0 };
    entry.files.push(path);
    entry.mtime = Math.max(entry.mtime, statSync(path).mtimeMs);
    byVersion.set(version, entry);
  }
}

const versions = [...byVersion.entries()].sort((a, b) => b[1].mtime - a[1].mtime);
const doomed = versions.slice(KEEP);

if (doomed.length === 0) {
  console.log(`[prune] ${versions.length} version(s) present, nothing to remove.`);
  process.exit(0);
}

let freed = 0;
for (const [, entry] of doomed) {
  for (const path of entry.files) {
    freed += statSync(path).size;
    unlinkSync(path);
  }
}

console.log(
  `[prune] kept ${versions.slice(0, KEEP).map(([v]) => v).join(', ')}` +
  ` — removed ${doomed.length} version(s), freed ${(freed / 1048576).toFixed(0)}MB`,
);
