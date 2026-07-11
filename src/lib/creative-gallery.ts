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

import { writeFile, writeTextFile, readTextFile, mkdir, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
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
