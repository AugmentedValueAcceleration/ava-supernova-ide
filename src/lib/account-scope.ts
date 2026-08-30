// ── Account-scoped local data root ──────────────────────────────────────────
//
// Health data (profile, plans, general profile) lives under a per-account dir
// so multiple accounts on one machine don't collide — and, crucially, so the
// IDE reads/writes the SAME files the extension does (~/.ava/users/<id>/...).
// The IDE previously used a flat ~/.ava/health which never saw the extension's
// account-scoped data, so the Plans tab + profile came up empty.
//
// Signed in → ".ava/users/<id>". Signed OUT → the last account's folder if it
// still exists on disk, otherwise ".ava" (the legacy flat layout, still valid
// for anyone who never had a platform account).
//
// That fallback is the whole point: signing out is not supposed to hide files
// you already have. Without it the root moved to ".ava", the Library read an
// empty directory, and nine creative items sat invisible under users/<id>
// while the Storage bar in the same header went on counting them.

import { getAccountId, resetAccountIdCache, LAST_ACCOUNT_ID_KEY } from './api';

let cached: string | null = null;

/** Root for this account's local data, relative to the home dir (Tauri
 *  BaseDirectory.Home). Resolved once and cached for the session. */
export async function accountRoot(): Promise<string> {
  if (cached) return cached;
  const id = await getAccountId();
  if (id) {
    cached = `.ava/users/${id}`;
    return cached;
  }
  // Signed out — go and LOOK for the account folder rather than relying on
  // having written a pointer earlier. A pointer is only ever recorded while
  // signed in, so for anyone already signed out it is simply absent, which
  // made the remembered version useless to every existing user.
  cached = (await findAccountFolder()) ?? '.ava';
  return cached;
}

/** The files and folders that mean "a real account's data lives here".
 *  Presence is the primary signal, newest mtime among them the tie-break. */
const ACCOUNT_MARKERS = [
  'creative/metadata.json', 'journal', 'tasks', 'history',
  'learning.json', 'health', 'memory.json', 'general.json',
];

/** The account folder under ~/.ava/users, or null if there isn't one.
 *  One folder → that's it. Several → the last-account pointer breaks the tie,
 *  and failing that the most recently touched one. */
async function findAccountFolder(): Promise<string | null> {
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    const opts = { baseDir: fs.BaseDirectory.Home };
    // readDir straight off, no exists() first: fs:allow-stat and
    // fs:allow-read-dir are in the capability scope, fs:allow-exists is NOT,
    // so exists() is DENIED at runtime and throws. Same note lives in
    // creative-gallery.ts and audit-store.ts. A missing directory just makes
    // readDir reject, which is the answer we wanted from exists() anyway.
    const dirs = (await fs.readDir('.ava/users', opts).catch(() => []))
      .filter((e) => e.isDirectory && e.name)
      .map((e) => e.name as string);
    if (dirs.length === 0) return null;
    if (dirs.length === 1) return `.ava/users/${dirs[0]}`;

    const last = (() => {
      try { return localStorage.getItem(LAST_ACCOUNT_ID_KEY); } catch { return null; }
    })();
    if (last && dirs.includes(last)) return `.ava/users/${last}`;

    // Several accounts, no pointer — pick by what is IN each folder. NOT by
    // the folder's own mtime: that only moves when direct children are added
    // or removed, so on a real machine the live 124 MB account read as OLDER
    // than a near-empty one and mtime picked the empty one.
    let best: string | null = null;
    let bestHits = -1;
    let bestAt = -1;
    for (const d of dirs) {
      let hits = 0;
      let at = 0;
      for (const marker of ACCOUNT_MARKERS) {
        try {
          const st = await fs.stat(`.ava/users/${d}/${marker}`, opts);
          hits++;
          const m = st.mtime ? new Date(st.mtime).getTime() : 0;
          if (m > at) at = m;
        } catch { /* marker absent — that is the signal */ }
      }
      if (hits > bestHits || (hits === bestHits && at > bestAt)) {
        bestHits = hits; bestAt = at; best = d;
      }
    }
    return `.ava/users/${best ?? dirs[0]}`;
  } catch {
    // No Tauri fs (tests / SSR) — the flat layout is the safe answer.
    return null;
  }
}

/** Drop the cached root (e.g. on sign-in / disconnect) so the next read
 *  re-resolves against the new account. */
export function resetAccountScope(): void {
  cached = null;
  resetAccountIdCache();
}

// Re-resolve whenever auth changes (sign-in / disconnect).
if (typeof window !== 'undefined') {
  window.addEventListener('ava-auth-changed', () => { cached = null; });
}
