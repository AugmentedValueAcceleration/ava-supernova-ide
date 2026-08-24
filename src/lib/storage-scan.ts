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

import { readDir, stat, remove, readTextFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import type { ProjectsUsage } from '@ava/core/projects/storage';

export interface StorageCategory { key: string; label: string; bytes: number }
export interface StorageReclaim { label: string; bytes: number; paths: string[] }
export interface StorageScan { totalBytes: number; categories: StorageCategory[]; reclaim: StorageReclaim[] }

/** Ava's data root, relative to the home dir. Kept Home-relative throughout so
 *  every fs call rides the same BaseDirectory.Home the rest of the IDE uses. */
export const AVA_HOME_REL = '.ava';

// The category rules — labels, order, and which folder counts as what — live
// in core so this surface and the other cannot disagree about the user's disk.
import { CATEGORY_LABEL, CATEGORY_ORDER, categoryOf } from '@ava/core/projects/storage';


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
// ─── The user's projects ─────────────────────────────────────────────────────
//
// Measured separately from ~/.ava, and never on render.
//
// A source tree is not a config folder. An Unreal project's Intermediate,
// Binaries and DerivedDataCache run to tens of gigabytes; walking that on every
// page load would stall the UI every single time. So the figure is cached,
// shown with its age, and re-measured only on request or once stale.
//
// The cache is ~/.ava/projects-usage.json — the SAME file the extension host
// writes, so a measurement taken on either surface is visible on both. One
// disk, one answer.

const USAGE_CACHE_REL = `${AVA_HOME_REL}/projects-usage.json`;

export async function readProjectsUsage(): Promise<ProjectsUsage | null> {
  try {
    const raw = await readTextFile(USAGE_CACHE_REL, { baseDir: BaseDirectory.Home });
    const parsed = JSON.parse(raw) as ProjectsUsage;
    return parsed?.measuredAt ? parsed : null;
  } catch { return null; }
}

/**
 * Walk the projects home and total it.
 *
 * Counts EVERY immediate subfolder, not only projects Ava created — the number
 * should match what the file manager says about that folder. Counting only
 * hers would under-report the moment someone clones a repo into it, with no
 * way for them to tell why.
 *
 * `projectsHome` is absolute; the Tauri fs plugin takes absolute paths when no
 * baseDir is given, which is why this one call does not ride BaseDirectory.Home
 * like the rest of the file.
 */
export async function measureProjects(projectsHome: string): Promise<ProjectsUsage> {
  let projectCount = 0;
  let bytes = 0;

  let entries: { name: string; isDirectory?: boolean; isFile?: boolean }[] = [];
  try { entries = await readDir(projectsHome); } catch { entries = []; }

  for (const e of entries) {
    const full = `${projectsHome}/${e.name}`;
    if (e.isDirectory) {
      projectCount++;
      bytes += await absDirSize(full);
    } else if (e.isFile) {
      // Loose files still occupy the disk the user is being shown.
      try { const st = await stat(full); bytes += st.size != null ? Number(st.size) : 0; } catch { /* skip */ }
    }
  }

  const usage: ProjectsUsage = {
    path: projectsHome,
    bytes,
    projectCount,
    measuredAt: new Date().toISOString(),
  };
  // Best-effort: a measurement that cannot be cached is still worth showing.
  try {
    await writeTextFile(USAGE_CACHE_REL, JSON.stringify(usage, null, 2), { baseDir: BaseDirectory.Home });
  } catch { /* ignore */ }
  return usage;
}

/** Recursive size of an ABSOLUTE directory. The rest of this file works
 *  Home-relative; the projects home may be anywhere the user pointed it. */
async function absDirSize(dir: string): Promise<number> {
  let entries;
  try { entries = await readDir(dir); } catch { return 0; }
  const sizes = await Promise.all(entries.map(async (e) => {
    const full = `${dir}/${e.name}`;
    try {
      if (e.isDirectory) return await absDirSize(full);
      const st = await stat(full);
      return st.size != null ? Number(st.size) : 0;
    } catch { return 0; }
  }));
  return sizes.reduce((a, b) => a + b, 0);
}

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
