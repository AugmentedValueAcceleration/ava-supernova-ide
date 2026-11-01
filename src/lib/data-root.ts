// ── Where this machine's data lives ─────────────────────────────────────────
//
// Everything is in ~/.ava itself (no accounts, 1 Nov 2026) — the same folder
// the extension and the CLI use, so all three see the same files.
//
// Account-era data sat under ~/.ava/users/<id>/. The first time the IDE opens
// after the update, core's mergeAccountFolders brings it up into ~/.ava — the
// same helper the extension runs: copy-only, the account you last used wins a
// clash, the other version is kept beside it, and a marker makes it run once.
// It runs as a one-shot Node job (lib/oneshot.ts) because a user with no key
// yet has no chat sidecar to ask.
//
// dataRoot() waits for that merge, so no screen can read — or worse, write —
// ~/.ava before the old data has arrived.

import { readDir, stat, BaseDirectory } from '@tauri-apps/plugin-fs';
import { runOneshot } from './oneshot';

const MARKER = '.ava/.account-folders-merged.json';

/** localStorage keys from the account era — cleared once the data is home. */
const ACCOUNT_KEYS = [
  'ava-ide-platform-key', 'ava-ide-email', 'ava-ide-tier', 'ava-ide-account-id',
  'ava-ide-last-account-id', 'ava-ide-use-platform', 'ava-ide-chat-backend',
  'ava-ide-platform-models', 'ava-platform-balance', 'ava-support-unread',
  'ava-ide-signin-pending',
];

let home: Promise<void> | null = null;

async function needsMerge(): Promise<boolean> {
  const opts = { baseDir: BaseDirectory.Home };
  // stat, not exists(): fs:allow-exists is not in the capability scope.
  try { await stat(MARKER, opts); return false; } catch { /* not merged yet */ }
  try {
    const dirs = (await readDir('.ava/users', opts)).filter((e) => e.isDirectory);
    return dirs.length > 0;
  } catch { return false; } // no users/ folder — nothing to bring home
}

async function forgetAccount(): Promise<void> {
  for (const k of ACCOUNT_KEYS) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
  // A platform key left in ~/.ava/config.json must not route anything back
  // onto account-only paths (the extension clears its copy the same way).
  try {
    const { clearSharedPlatformKey } = await import('./shared-config');
    await clearSharedPlatformKey();
  } catch { /* nothing to clear */ }
}

/** Bring account-era data home, once per launch. Never throws. */
export function ensureDataHome(): Promise<void> {
  if (!home) {
    home = (async () => {
      try {
        if (await needsMerge()) {
          let preferredAccount: string | null = null;
          try {
            preferredAccount = localStorage.getItem('ava-ide-last-account-id') || localStorage.getItem('ava-ide-account-id');
          } catch { /* none */ }
          // Generous: the first merge copies the whole account folder.
          const r = await runOneshot<{ report: { merged: boolean; copied: number } }>(
            { cmd: 'merge_account_folders', preferredAccount }, 300_000);
          console.info('[data-root] account data brought home', r.report);
        }
        await forgetAccount();
      } catch (err) {
        // The old folder is untouched (the merge only copies), so a failure
        // loses nothing; it is retried on the next launch.
        console.warn('[data-root] account data merge failed — data left where it was', err);
      }
    })();
  }
  return home;
}

/** Root for this machine's local data, relative to the home dir (Tauri
 *  BaseDirectory.Home). */
export async function dataRoot(): Promise<string> {
  await ensureDataHome();
  return '.ava';
}
