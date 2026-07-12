// ─── Local footprint scanner (renderer-side) ─────────────────────────────────
//
// Walks ~/.ava and reports how much disk Ava is using, grouped into honest
// categories — Models, Runtime, Creative, Memory, Journal, Datasets, Backups,
// Other — plus the safely-reclaimable items (stale migration backups). This is
// what the storage bar (Command Centre + Library) reads, so it reflects the
// WHOLE footprint, not just one corner.
//
// Port of the extension's host-side src/webview/storage-scan.ts — same
// categories, same fold rules, same reclaim hardening — so the two surfaces
// report identical numbers.
//
// Why the RENDERER and not the sidecar: the Command Centre is the launch page
// and the sidecar is only started by the chat page, so a sidecar-backed scan
// would render a blank bar on the one screen that most wants it. This mirrors
// what audit-store / history-store already do: read the disk directly through
// the Tauri fs plugin. Local-first, no sidecar, works on first paint.
//
// Sizing only reads directory entries + file sizes (never file contents), and
// the per-directory stats are issued in parallel, so a ~1GB tree (dominated by
// a couple of large model files) scans in well under a second. Everything is
// best-effort: unreadable entries are skipped, never fatal.

import { readDir, stat, remove, BaseDirectory } from '@tauri-apps/plugin-fs';

export interface StorageCategory { key: string; label: string; bytes: number }
export interface StorageReclaim { label: string; bytes: number; paths: string[] }
export interface StorageScan { totalBytes: number; categories: StorageCategory[]; reclaim: StorageReclaim[] }

/** Ava's data root, relative to the home dir. Kept Home-relative throughout so
 *  every fs call rides the same BaseDirectory.Home the rest of the IDE uses. */
export const AVA_HOME_REL = '.ava';

const CATEGORY_LABEL: Record<string, string> = {
  models: 'Models', runtime: 'Runtime', creative: 'Creative', memory: 'Memory',
  journal: 'Journal', datasets: 'Datasets', backups: 'Old backups', other: 'Other',
};
// Stable display order (largest-first is applied after, but this breaks ties).
const CATEGORY_ORDER = ['models', 'runtime', 'creative', 'memory', 'journal', 'datasets', 'backups', 'other'];

/** Map a top-level entry name to a storage category. */
function categoryOf(name: string): string {
  const n = name.toLowerCase();
  if (/backup/.test(n)) return 'backups';
  if (n === 'models') return 'models';
  if (n === 'bin') return 'runtime';
  if (n === 'creative') return 'creative';
  if (n === 'memory' || n === 'memory.json' || n === 'memory.md' || n === 'embeddings' || n === 'graph.json') return 'memory';
  if (n === 'journal') return 'journal';
  if (n === 'datasets') return 'datasets';
  return 'other';
}

/** Recursive on-disk size of a directory (bytes). Best-effort — children are
 *  sized concurrently, which matters here because every stat is an IPC hop. */
async function dirSize(rel: string): Promise<number> {
  let entries;
  try { entries = await readDir(rel, { baseDir: BaseDirectory.Home }); } catch { return 0; }
  const sizes = await Promise.all(entries.map(async (e) => {
    const child = `${rel}/${e.name}`;
    try {
      // Symlinks report neither isDirectory nor isFile, so they contribute 0 —
      // same as the extension's Dirent walk, and it keeps us out of link loops.
      if (e.isDirectory) return await dirSize(child);
      if (e.isFile) return (await stat(child, { baseDir: BaseDirectory.Home })).size;
    } catch { /* skip unreadable */ }
    return 0;
  }));
  return sizes.reduce((a, b) => a + b, 0);
}

async function sizeOf(rel: string, isDir: boolean): Promise<number> {
  try { return isDir ? await dirSize(rel) : (await stat(rel, { baseDir: BaseDirectory.Home })).size; } catch { return 0; }
}

/**
 * Scan ~/.ava into categories + reclaimable items. Descends one level into
 * `users/<id>/` so account-scoped data (creative, memory, journal…) rolls up
 * into the same categories as the shared root.
 */
export async function scanStorage(): Promise<StorageScan> {
  const bytesByCat = new Map<string, number>();
  const reclaimPaths: string[] = [];
  let reclaimBytes = 0;

  const add = async (name: string, rel: string, isDir: boolean) => {
    const cat = categoryOf(name);
    const bytes = await sizeOf(rel, isDir);
    bytesByCat.set(cat, (bytesByCat.get(cat) ?? 0) + bytes);
    if (cat === 'backups') { reclaimPaths.push(rel); reclaimBytes += bytes; }
  };

  let top;
  try { top = await readDir(AVA_HOME_REL, { baseDir: BaseDirectory.Home }); } catch { return { totalBytes: 0, categories: [], reclaim: [] }; }

  for (const e of top) {
    const rel = `${AVA_HOME_REL}/${e.name}`;
    if (e.name === 'users' && e.isDirectory) {
      // Roll each account-scoped dir's children into the shared categories.
      let users: string[] = [];
      try { users = (await readDir(rel, { baseDir: BaseDirectory.Home })).filter(u => u.isDirectory).map(u => u.name); } catch { /* none */ }
      for (const u of users) {
        const udir = `${rel}/${u}`;
        let children;
        try { children = await readDir(udir, { baseDir: BaseDirectory.Home }); } catch { continue; }
        for (const c of children) await add(c.name, `${udir}/${c.name}`, c.isDirectory);
      }
      continue;
    }
    await add(e.name, rel, e.isDirectory);
  }

  const totalBytes = [...bytesByCat.values()].reduce((a, b) => a + b, 0);
  const categories: StorageCategory[] = [...bytesByCat.entries()]
    .filter(([, bytes]) => bytes > 0)
    .map(([key, bytes]) => ({ key, label: CATEGORY_LABEL[key] ?? key, bytes }))
    .sort((a, b) => b.bytes - a.bytes || CATEGORY_ORDER.indexOf(a.key) - CATEGORY_ORDER.indexOf(b.key));

  const reclaim: StorageReclaim[] = reclaimBytes > 0
    ? [{ label: 'Old backups', bytes: reclaimBytes, paths: reclaimPaths }]
    : [];

  return { totalBytes, categories, reclaim };
}

/**
 * Delete reclaimable paths. Hardened exactly like the extension's: only removes
 * paths INSIDE ~/.ava whose name contains "backup", so a bad path can't wipe
 * anything else. Returns bytes freed (best-effort). Two-tap confirm lives in
 * the UI.
 */
export async function reclaimStorage(paths: string[]): Promise<number> {
  let freed = 0;
  for (const p of paths) {
    if (!p.startsWith(`${AVA_HOME_REL}/`) || p.includes('..')) continue;  // must be inside ~/.ava
    if (!/backup/i.test(p)) continue;                                     // must be a backup
    const bytes = await sizeOf(p, true).catch(() => 0);
    try { await remove(p, { recursive: true, baseDir: BaseDirectory.Home }); freed += bytes; } catch { /* already gone */ }
  }
  return freed;
}

/** Reveal ~/.ava in the OS file manager — the pinned card's "Open folder". */
export async function openStorageFolder(): Promise<void> {
  const [{ homeDir, join }, { openPath }] = await Promise.all([
    import('@tauri-apps/api/path'),
    import('@tauri-apps/plugin-opener'),
  ]);
  await openPath(await join(await homeDir(), AVA_HOME_REL));
}
