/**
 * Creative Studio gallery — local-first persistence for every medium.
 *
 * Account-scoped + local only: binaries are written to
 * ~/.ava/users/<id>/creative/<kind>/ and metadata.json is the source of truth.
 * No cloud — everything Creative Studio makes stays on the machine and travels
 * with the local data export. (The extension uses the exact same folder, so
 * creative made on either surface shows on both.)
 *
 * Per-medium gallery state is exposed via a React hook; the surrounding
 * Creative Studio page calls saveGenerated()/deleteItem() and consumes the
 * items array. The OutputCard component renders each entry.
 */

import { writeFile, writeTextFile, readFile, readTextFile, mkdir, stat, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import { homeDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { accountRoot } from './account-scope';
import { useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────

export type MediumKind = 'image' | 'music' | 'voice' | 'sfx' | 'video';

/** Single gallery entry. `url` is the Tauri asset-protocol URL the OutputCard
 *  plays / displays; `localPath` is the on-disk file (used for Delete). */
export interface GalleryItem {
  id: string;
  kind: MediumKind;
  url: string;
  prompt: string;
  title: string;
  createdAt: string;
  localPath?: string;
  /** Override the on-disk file extension. Defaults to TYPE_TO_EXT[kind]. Design
   *  Studio icons set 'png' so their transparent bytes keep a correct extension
   *  (the kind default for images is the lossy 'jpg', which has no alpha). */
  ext?: string;
  /** Which Creative Studio lane made this (icon / logo / image / …). Routes the
   *  file into its own on-disk folder and lets the Library sort it into the
   *  matching section. Absent = fall back to the medium's default folder. Logo
   *  variants also share a `logo_<ts>_<variant>` id so the Library groups them
   *  as one card. */
  designType?: string;
  /** Extension-schema fields. The creative folder is SHARED with the VS Code
   *  extension, whose creative-store writes `path` (relative) + `absolutePath`
   *  (+ `bytes`) instead of `localPath`. We persist these too so items made on
   *  either surface are readable on both — the Library reads absolutePath to
   *  show a preview off disk. */
  path?: string;
  absolutePath?: string;
  bytes?: number;
}

const TYPE_TO_DIR: Record<MediumKind, string> = {
  image: 'images',
  music: 'audio',
  voice: 'voice',
  sfx: 'sfx',
  video: 'video',
};

/** Design-type overrides for the on-disk folder — each lane gets its own folder
 *  (mirrors the extension's per-type creative store) instead of everything
 *  piling into images/. Absent design types fall back to TYPE_TO_DIR[kind]. */
const DESIGN_TYPE_TO_DIR: Record<string, string> = {
  icon: 'icons',
  logo: 'logos',
};

const TYPE_TO_EXT: Record<MediumKind, string> = {
  image: 'jpg',
  music: 'mp3',
  voice: 'mp3',
  sfx: 'mp3',
  video: 'mp4',
};

// ── Local persistence (account-scoped) ──────────────────────────────────────

/** The creative dir relative to the home dir: ~/.ava/users/<id>/creative when
 *  signed in (shared with the extension), ~/.ava/creative for BYOK/no-account. */
const creativeDir = async (): Promise<string> => `${await accountRoot()}/creative`;
const metadataRel = async (): Promise<string> => `${await creativeDir()}/metadata.json`;

/** metadata.json is the local gallery's source of truth. Each entry carries
 *  enough info to re-render without a re-fetch. */
async function readLocalMetadata(): Promise<GalleryItem[]> {
  try {
    const raw = await readTextFile(await metadataRel(), { baseDir: BaseDirectory.Home }).catch(() => '[]');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalMetadata(items: GalleryItem[]): Promise<void> {
  await mkdir(await creativeDir(), { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(await metadataRel(), JSON.stringify(items, null, 2), { baseDir: BaseDirectory.Home });
  // Every save AND delete funnels through here, so it's the one place that has
  // to tell the storage bars (Command Centre + Library) the footprint moved.
  try { window.dispatchEvent(new CustomEvent('ava-storage-changed')); } catch { /* non-DOM caller */ }
}

/** Write the binary bytes of a generation to disk and return the Tauri
 *  asset-protocol URL the WebView can load. Accepts a data URI (decode base64)
 *  or a remote https URL (download then save). Returns null on failure. */
async function saveBinaryToDisk(item: GalleryItem): Promise<{ assetUrl: string; localPath: string; absolutePath: string; path: string; bytes: number } | null> {
  try {
    const home = await homeDir();
    const folder = (item.designType && DESIGN_TYPE_TO_DIR[item.designType]) ?? TYPE_TO_DIR[item.kind];
    const dir = `${await creativeDir()}/${folder}`;
    await mkdir(dir, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
    const filePath = `${dir}/${item.id}.${item.ext ?? TYPE_TO_EXT[item.kind]}`;

    let bytes: Uint8Array | null = null;
    if (item.url.startsWith('data:')) {
      const comma = item.url.indexOf(',');
      const header = item.url.slice(0, comma);
      const payload = item.url.slice(comma + 1);
      if (/;base64/i.test(header)) {
        bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
      } else {
        // URL-encoded data URL (e.g. `data:image/svg+xml,<svg…>`) — NOT base64.
        // Decoding it with atob would corrupt the file; decode as text instead.
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }
    } else {
      const res = await fetch(item.url);
      if (!res.ok) return null;
      bytes = new Uint8Array(await res.arrayBuffer());
    }

    await writeFile(filePath, bytes, { baseDir: BaseDirectory.Home });
    const absPath = await join(home, filePath);
    const relToCreative = `${folder}/${item.id}.${item.ext ?? TYPE_TO_EXT[item.kind]}`;
    return { assetUrl: convertFileSrc(absPath), localPath: filePath, absolutePath: absPath, path: relToCreative, bytes: bytes.length };
  } catch (err) {
    console.warn('[creative-gallery] saveBinaryToDisk failed:', err);
    return null;
  }
}

async function deleteFromDisk(localPath: string): Promise<void> {
  try {
    await remove(localPath, { baseDir: BaseDirectory.Home });
  } catch {
    /* file might already be gone */
  }
}

/** Remove a local creative asset's metadata entry so it doesn't reappear after
 *  the Library deletes its file. Shared metadata.json is the source of truth. */
export async function removeLocalCreative(id: string): Promise<void> {
  const meta = await readLocalMetadata();
  await writeLocalMetadata(meta.filter((m) => m.id !== id)).catch(() => {});
}

/** Rename a stored asset. Only the metadata `title` changes — the file on disk
 *  keeps its id-based name, so every path already handed out (to the Library,
 *  to Ava via browse_library, or copied into a project) stays valid. Renaming
 *  the file would silently break those. Returns the new title, or null if the
 *  id is unknown / the title is empty. */
export async function renameLocalCreative(id: string, title: string): Promise<string | null> {
  const next = title.trim();
  if (!next) return null;
  const meta = await readLocalMetadata();
  const item = meta.find((m) => m.id === id);
  if (!item) return null;
  item.title = next;
  await writeLocalMetadata(meta).catch(() => {});
  return next;
}

/** Where the user's project is, as the app records it. App.tsx keeps this key
 *  deliberately in sync with its own state so the sidecar and other components
 *  agree; reading it here avoids threading the folder through every caller. */
function currentProjectFolder(): string | null {
  try { return localStorage.getItem('ava-ide-project-folder') || null; } catch { return null; }
}

/**
 * Copy a Studio asset into the user's project so it can actually be used in
 * code — the library lives account-scoped outside any project, so a reference
 * to it would only ever work on this machine.
 *
 * Destination follows the project's OWN convention: the first of public/,
 * src/assets/, assets/, static/, images/ that already exists, falling back to
 * creating images/. Deliberately NOT <project>/.ava/creative — that's
 * gitignored, so the asset would work locally and vanish for everyone else.
 *
 * Returns the project-relative path, ready to paste into code, plus the
 * absolute one for revealing. Null if there's no project open or no such asset.
 */
export async function copyCreativeToProject(
  id: string,
): Promise<{ relPath: string; absPath: string } | null> {
  const projectRoot = currentProjectFolder();
  if (!projectRoot) return null;

  const meta = await readLocalMetadata();
  const item = meta.find((m) => m.id === id);
  if (!item) return null;

  // localPath is the absolute on-disk path stamped at save time.
  const source = item.localPath;
  if (!source) return null;

  // stat(), not exists(): fs:allow-stat is in the capability scope but
  // fs:allow-exists is NOT, so exists() would be denied at runtime.
  const isDir = async (p: string): Promise<boolean> => {
    try { return (await stat(p)).isDirectory; } catch { return false; }
  };
  const isTaken = async (p: string): Promise<boolean> => {
    try { await stat(p); return true; } catch { return false; }
  };

  const PREFERRED = ['public', 'src/assets', 'assets', 'static', 'images'];
  let destDir: string | null = null;
  for (const candidate of PREFERRED) {
    const abs = `${projectRoot}/${candidate}`;
    if (await isDir(abs)) { destDir = abs; break; }
  }
  if (!destDir) {
    destDir = `${projectRoot}/images`;
    await mkdir(destDir, { recursive: true }).catch(() => {});
  }

  // Name it after the user's title where we can — that's the name they gave it
  // — keeping the original extension, and never clobbering an existing file.
  const ext = item.ext ?? TYPE_TO_EXT[item.kind];
  const base = (item.title || 'asset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'asset';

  let filename = `${base}.${ext}`;
  let n = 2;
  while (await isTaken(`${destDir}/${filename}`)) {
    filename = `${base}-${n++}.${ext}`;
  }

  const absPath = `${destDir}/${filename}`;
  const bytes = await readFile(source);
  await writeFile(absPath, bytes);

  const relPath = absPath.slice(projectRoot.length + 1);
  return { relPath, absPath };
}

/** Every local creative item across all media, newest-first — for the Library
 *  Assets grid (which shows all kinds together, not one medium). */
export async function readAllLocalCreative(): Promise<GalleryItem[]> {
  const items = await readLocalMetadata();
  return items.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

// ── Hook ──────────────────────────────────────────────────────────────────

/** Per-medium gallery hook. Loads on mount, exposes save/delete. Items are
 *  sorted newest-first. Local only — no cloud. */
export function useCreativeGallery(kind: MediumKind) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const local = await readLocalMetadata();
      const merged = local
        .filter((item) => item.kind === kind)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setItems(merged);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Persist a freshly-generated item to disk + metadata. Always inserts into
   *  the in-memory gallery so the user sees it immediately. */
  const saveGenerated = useCallback(async (
    args: { id?: string; prompt: string; title: string; url: string; ext?: string; designType?: string },
  ): Promise<GalleryItem> => {
    const id = args.id ?? `${kind}_${Date.now()}`;
    let item: GalleryItem = {
      id,
      kind,
      url: args.url,
      prompt: args.prompt,
      title: args.title,
      createdAt: new Date().toISOString(),
      ext: args.ext,
      designType: args.designType,
    };

    const saved = await saveBinaryToDisk(item);
    if (saved) {
      // Record BOTH our fields and the extension's (absolutePath/path/bytes) so
      // an item saved in the IDE is readable in the extension's Library too.
      item = { ...item, url: saved.assetUrl, localPath: saved.localPath, absolutePath: saved.absolutePath, path: saved.path, bytes: saved.bytes };
    }
    const meta = await readLocalMetadata();
    await writeLocalMetadata([item, ...meta.filter((m) => m.id !== item.id)]).catch(() => {});

    setItems((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
    return item;
  }, [kind]);

  /** Remove an item from disk + metadata + the in-memory list. */
  const deleteItem = useCallback(async (item: GalleryItem) => {
    setItems((prev) => prev.filter((p) => p.id !== item.id));
    if (item.localPath) {
      await deleteFromDisk(item.localPath);
    }
    const meta = await readLocalMetadata();
    await writeLocalMetadata(meta.filter((m) => m.id !== item.id)).catch(() => {});
  }, []);

  return { items, loading, reload, saveGenerated, deleteItem };
}

/** Trigger a download of any URL — works for Tauri asset-protocol URLs and
 *  https / data: equivalently. Used by the OutputCard's Download pill. */
export async function downloadGalleryItem(item: GalleryItem): Promise<void> {
  const a = document.createElement('a');
  a.href = item.url;
  a.download = `${item.kind}_${item.id}.${item.ext ?? TYPE_TO_EXT[item.kind]}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Copy the prompt to the clipboard — used by the OutputCard's Copy pill.
 *  Returns true on success so the UI can show a "copied" flash. */
export async function copyGalleryPrompt(item: GalleryItem): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(item.prompt);
    return true;
  } catch {
    return false;
  }
}
