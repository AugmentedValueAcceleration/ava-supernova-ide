#!/usr/bin/env node
// ── Why createUpdaterArtifacts is FALSE in tauri.conf.json (2026-10-07) ──
//
// This script builds latest.json for the auto-updater. It is currently moot,
// and the config records none of that because JSON takes no comments — so the
// reason lives here, beside the thing it affects.
//
// Setting bundle.createUpdaterArtifacts true makes Tauri demand
// TAURI_SIGNING_PRIVATE_KEY at bundle time. That is the MINISIGN key that
// signs update packages so an installed IDE will accept them. It is NOT the
// Microsoft / Authenticode certificate we are waiting on, which only governs
// whether Defender warns on download. The two are unrelated and neither
// unlocks the other — worth stating plainly, because waiting on Microsoft does
// not block building installers and the error message does not say so.
//
// Nothing is lost while the IDE is not publicly released: the updater has
// never shipped. Its endpoint 404s and no .sig has ever been built, so the
// artifacts had no reader.
//
// BEFORE THE PUBLIC RELEASE: set it back to true, and only once the minisign
// private key is in hand AND BACKED UP. It lives on one machine. An update
// that existing installations will accept can only ever be signed with that
// one key — lose it and every installed copy is stranded on its version.

/**
 * Build latest.json — the manifest the in-app updater actually reads.
 *
 * The updater has been configured since 2026-03-24 and has never once
 * delivered an update. The plugin is initialised, the pubkey is compiled in,
 * UpdateChecker is mounted, and the endpoint —
 *   releases/latest/download/latest.json
 * — has returned 404 for five months, because nothing ever produced that file.
 * Every user has been on manual download-and-reinstall without knowing it.
 *
 * `bundle.createUpdaterArtifacts` now makes the build emit a .sig next to each
 * installer. This turns those into the manifest. It is a script and not a
 * paragraph in a runbook deliberately: a manual step in a release process that
 * runs every few weeks is a step that gets skipped, and the failure is silent —
 * the release looks complete and the updater simply stays dead.
 *
 * Usage (after `tauri build`):
 *   node scripts/make-updater-manifest.mjs                 # writes latest.json
 *   node scripts/make-updater-manifest.mjs --notes "..."   # release notes line
 *
 * Then upload latest.json to the GitHub release ALONGSIDE the installers. The
 * endpoint points at /releases/latest/download/latest.json, so it must be an
 * asset on the release marked latest.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ideRoot = join(here, '..');
const conf = JSON.parse(readFileSync(join(ideRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf.version;

const args = process.argv.slice(2);
const flag = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const notes = flag('notes') || `Ava Supernova IDE ${version}`;

const bundleDir = join(ideRoot, 'src-tauri', 'target', 'release', 'bundle');
if (!existsSync(bundleDir)) {
  console.error(`No bundle directory at ${bundleDir}. Run \`pnpm tauri build\` first.`);
  process.exit(1);
}

/**
 * The NSIS installer is what the updater downloads on Windows, not the MSI.
 *
 * Tauri's Windows updater runs the downloaded installer silently; the NSIS
 * target is the one built for that. Pointing the manifest at the MSI produces
 * an update that downloads, verifies, and then does nothing visible.
 */
const nsisDir = join(bundleDir, 'nsis');
if (!existsSync(nsisDir)) {
  console.error('No nsis/ bundle. The updater needs the NSIS target, not the MSI.');
  process.exit(1);
}

const files = readdirSync(nsisDir);
const installer = files.find((f) => f.includes(version) && f.endsWith('.exe'));
const sig = files.find((f) => f.includes(version) && f.endsWith('.exe.sig'));

if (!installer) {
  console.error(`No installer for ${version} in ${nsisDir}. Found: ${files.join(', ') || '(nothing)'}`);
  process.exit(1);
}
if (!sig) {
  // Two very different situations, and conflating them turns a deliberate
  // choice into a red build. When the config says not to produce updater
  // artifacts, a missing .sig is the expected outcome and there is simply no
  // manifest to write. Only an UNEXPECTED missing signature is an error, and
  // that one stays loud: an unsigned update is rejected by every client,
  // silently.
  if (conf?.bundle?.createUpdaterArtifacts === false) {
    console.log(
      `Skipping latest.json for ${version}: bundle.createUpdaterArtifacts is false, so no ` +
      '.sig was produced and there is nothing to publish an update from.',
    );
    process.exit(0);
  }
  console.error(
    `Installer present but NO .sig for ${version}.\n` +
    'That means the build did not sign it — check bundle.createUpdaterArtifacts is true\n' +
    'and that TAURI_SIGNING_PRIVATE_KEY was set when you built. An unsigned update is\n' +
    'rejected by every client, silently.',
  );
  process.exit(1);
}

const signature = readFileSync(join(nsisDir, sig), 'utf8').trim();

// GitHub rewrites spaces to dots in asset names on upload. Matching that here
// means the URL in the manifest is the URL the release actually serves.
const assetName = installer.replace(/ /g, '.');
const repo = 'AugmentedValueAcceleration/ava-supernova-ide';
const url = `https://github.com/${repo}/releases/download/v${version}/${assetName}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': { signature, url },
  },
};

const out = join(ideRoot, 'latest.json');
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');

console.log(`latest.json written for v${version}`);
console.log(`  installer : ${installer}`);
console.log(`  asset url : ${url}`);
console.log(`  signature : ${signature.slice(0, 40)}…`);
console.log('');
console.log('Upload it to the GitHub release with the installers, or the endpoint 404s.');
