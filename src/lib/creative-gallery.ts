/**
 * Creative Studio gallery — unified state + persistence for every medium.
 *
 * Replaces the per-medium "lastX" single-slot state with a list keyed by
 * medium, plus persistence that honours the operator's Data Mode toggle:
 *   - Local      → write binary to disk + append to ~/.ava/creative/metadata.json
 *   - Cloud      → POST to /api/creative-assets (Supabase)
 *   - Both       → both writes
 *
 * Display = local items ∪ cloud items, deduped by id. Toggling between
 * modes mid-session never deletes anything; it just changes which writes
 * fire on the next generation. Explicit Delete deletes from whichever
 * stores have the asset.
 *
 * Per medium gallery state is exposed via a React hook; the surrounding
 * Creative Studio page calls saveGenerated()/deleteItem()/regenerateItem()
 * and consumes the items array. The OutputCard component renders each
 * entry — render varies by type, chrome is shared.
 */

import { writeFile, writeTextFile, readTextFile, mkdir, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import { homeDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getDataMode, type DataMode } from './data-mode';
import { getPlatformKey, apiFetch } from './api';
import { useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────

export type MediumKind = 'image' | 'music' | 'voice' | 'sfx' | 'video';

/** Single gallery entry. `url` is what the OutputCard plays / displays —
 *  Tauri asset-protocol URL when local, https when cloud. `localPath` is
 *  set when there's a disk file (used for Delete). `cloudId` is set when
 *  the entry exists in Supabase (used for cloud Delete). */
export interface GalleryItem {
  id: string;
  kind: MediumKind;
  url: string;
  prompt: string;
  title: string;
  createdAt: string;
  localPath?: string;
  cloudId?: string;
}

const TYPE_TO_DIR: Record<MediumKind, string> = {
  image: 'images',
  music: 'audio',
  voice: 'voice',
  sfx: 'sfx',
  video: 'video',
};

const TYPE_TO_EXT: Record<MediumKind, string> = {
  image: 'jpg',
  music: 'mp3',
  voice: 'mp3',
  sfx: 'mp3',
  video: 'mp4',
};

// ── Local persistence ─────────────────────────────────────────────────────

/** metadata.json is the local gallery's source of truth. Contains every
 *  item the operator has ever generated locally (until they delete one).
 *  Each entry carries enough info to re-render in the gallery without a
 *  re-fetch. */
async function readLocalMetadata(): Promise<GalleryItem[]> {
  try {
    const raw = await readTextFile('.ava/creative/metadata.json', { baseDir: BaseDirectory.Home }).catch(() => '[]');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalMetadata(items: GalleryItem[]): Promise<void> {
  await mkdir('.ava/creative', { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(
    '.ava/creative/metadata.json',
    JSON.stringify(items, null, 2),
    { baseDir: BaseDirectory.Home },
  );
}

/** Write the binary bytes of a generation to disk and return the Tauri
 *  asset-protocol URL the WebView can load. Accepts either a data URI
 *  (decode the base64) or a remote https URL (download then save).
 *  Returns null when the write fails — caller falls back to the original
 *  URL so playback still works in-session even if disk save fails. */
async function saveBinaryToDisk(item: GalleryItem): Promise<{ assetUrl: string; localPath: string } | null> {
  try {
    const home = await homeDir();
    const dir = `.ava/creative/${TYPE_TO_DIR[item.kind]}`;
    await mkdir(dir, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
    const filename = `${item.id}.${TYPE_TO_EXT[item.kind]}`;
    const filePath = `${dir}/${filename}`;

    let bytes: Uint8Array | null = null;
    if (item.url.startsWith('data:')) {
      const base64 = item.url.split(',')[1] ?? '';
      bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    } else {
      const res = await fetch(item.url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      bytes = new Uint8Array(buf);
    }

    await writeFile(filePath, bytes, { baseDir: BaseDirectory.Home });
    const absPath = await join(home, filePath);
    return { assetUrl: convertFileSrc(absPath), localPath: filePath };
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

// ── Cloud persistence ─────────────────────────────────────────────────────

interface CloudAsset {
  id: string;
  asset_type: string;
  title: string | null;
  prompt: string | null;
  url: string;
  created_at: string;
}

async function fetchCloudGallery(): Promise<GalleryItem[]> {
  const key = getPlatformKey();
  if (!key) return [];
  try {
    const raw = await apiFetch('/creative-assets', { method: 'GET' });
    const res = raw as { assets?: CloudAsset[] } | null;
    if (!res || !Array.isArray(res.assets)) return [];
    return res.assets.map((a): GalleryItem => ({
      id: a.id,
      kind: normaliseKind(a.asset_type),
      url: a.url,
      prompt: a.prompt ?? '',
      title: a.title ?? '',
      createdAt: a.created_at,
      cloudId: a.id,
    }));
  } catch {
    return [];
  }
}

async function saveCloud(item: GalleryItem): Promise<{ cloudId: string } | null> {
  const key = getPlatformKey();
  if (!key) return null;
  try {
    const raw = await apiFetch('/creative-assets', {
      method: 'POST',
      body: JSON.stringify({
        asset_type: item.kind,
        title: item.title,
        prompt: item.prompt,
        url: item.url,
        source: 'creative-studio',
      }),
    });
    const res = raw as { id?: string } | null;
    if (!res?.id) return null;
    return { cloudId: res.id };
  } catch {
    return null;
  }
}

async function deleteCloud(cloudId: string): Promise<void> {
  const key = getPlatformKey();
  if (!key) return;
  try {
    await apiFetch(`/creative-assets/${cloudId}`, { method: 'DELETE' });
  } catch {
    /* non-fatal */
  }
}

function normaliseKind(raw: string): MediumKind {
  const lower = raw.toLowerCase();
  if (lower === 'image') return 'image';
  if (lower === 'music' || lower === 'audio') return 'music';
  if (lower === 'voice') return 'voice';
  if (lower === 'sfx') return 'sfx';
  if (lower === 'video') return 'video';
  return 'image';
}

// ── Hook ──────────────────────────────────────────────────────────────────

/** Per-medium gallery hook. Loads on mount + on data-mode change, exposes
 *  save/delete operations that honour the active mode. Items are sorted
 *  newest-first so the gallery strip naturally puts the most recent
 *  generation at the front. */
export function useCreativeGallery(kind: MediumKind) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<DataMode>(getDataMode());

  // Subscribe to data-mode changes — reload from the appropriate stores.
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<{ mode: DataMode }>).detail?.mode;
      if (next) setMode(next);
    };
    window.addEventListener('ava-data-mode-changed', handler);
    return () => window.removeEventListener('ava-data-mode-changed', handler);
  }, []);

  // Load gallery — local + cloud, deduped by id, filtered to this medium.
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [local, cloud] = await Promise.all([
        mode === 'cloud' ? Promise.resolve([]) : readLocalMetadata(),
        mode === 'local' ? Promise.resolve([]) : fetchCloudGallery(),
      ]);
      const seen = new Set<string>();
      const merged: GalleryItem[] = [];
      for (const item of [...local, ...cloud]) {
        if (item.kind !== kind) continue;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
      }
      merged.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setItems(merged);
    } finally {
      setLoading(false);
    }
  }, [kind, mode]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Persist a freshly-generated item according to the current data mode.
   *  Always inserts into the in-memory gallery so the user sees their new
   *  generation immediately, regardless of which stores the writes hit. */
  const saveGenerated = useCallback(async (
    args: { id?: string; prompt: string; title: string; url: string },
  ): Promise<GalleryItem> => {
    const id = args.id ?? `${kind}_${Date.now()}`;
    const createdAt = new Date().toISOString();
    let item: GalleryItem = {
      id,
      kind,
      url: args.url,
      prompt: args.prompt,
      title: args.title,
      createdAt,
    };

    const dataMode = getDataMode();
    if (dataMode === 'local' || dataMode === 'both') {
      const saved = await saveBinaryToDisk(item);
      if (saved) {
        item = { ...item, url: saved.assetUrl, localPath: saved.localPath };
      }
      const meta = await readLocalMetadata();
      meta.unshift(item);
      await writeLocalMetadata(meta).catch(() => {});
    }

    if (dataMode === 'cloud' || dataMode === 'both') {
      const cloud = await saveCloud(item);
      if (cloud) item = { ...item, cloudId: cloud.cloudId };
    }

    setItems((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
    return item;
  }, [kind]);

  /** Remove an item from whichever stores hold it, plus the in-memory list. */
  const deleteItem = useCallback(async (item: GalleryItem) => {
    setItems((prev) => prev.filter((p) => p.id !== item.id));
    if (item.localPath) {
      await deleteFromDisk(item.localPath);
      const meta = await readLocalMetadata();
      const next = meta.filter((m) => m.id !== item.id);
      await writeLocalMetadata(next).catch(() => {});
    }
    if (item.cloudId) {
      await deleteCloud(item.cloudId);
    }
  }, []);

  return { items, loading, reload, saveGenerated, deleteItem };
}

/** Trigger a download of any URL — works for Tauri asset-protocol URLs and
 *  https / data: equivalently. Used by the OutputCard's Download pill. */
export async function downloadGalleryItem(item: GalleryItem): Promise<void> {
  const a = document.createElement('a');
  a.href = item.url;
  a.download = `${item.kind}_${item.id}.${TYPE_TO_EXT[item.kind]}`;
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
