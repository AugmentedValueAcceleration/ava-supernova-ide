// ── Shared keychain entries beyond provider keys ────────────────────────────
//
// The extension reads and writes these same entries (extension
// src/secrets/shared-keychain.ts), so they follow the user between the apps:
//   - `local.apiKey`        the local / custom model server's key
//   - `vault.head` + pieces the secret vault
//
// A Windows credential holds at most 2,560 bytes — 1,280 characters, because
// it is stored as UTF-16 — so the vault, which can hold a private key or two,
// is written in numbered pieces under a fresh generation and only then made
// current by `vault.head`. A failed save leaves the previous vault readable.

import { invoke } from '@tauri-apps/api/core';

// Characters per piece (the pattern in writeVault/writeBlob uses it literally).

export async function keychainGet(key: string): Promise<string | null> {
  const v = await invoke<string | null>('keychain_get', { key });
  return v ?? null;
}

/** Write and read back; throws if the keychain did not keep it. */
export async function keychainSet(key: string, value: string): Promise<void> {
  await invoke('keychain_set', { key, value });
  if ((await keychainGet(key)) !== value) throw new Error('The system keychain did not keep the value.');
}

export async function keychainDelete(key: string): Promise<void> {
  try { await invoke('keychain_delete', { key }); } catch { /* already gone */ }
}

interface Head { gen: number; count: number }

async function readHead(name: string): Promise<Head | null> {
  try {
    const raw = await keychainGet(`${name}.head`);
    const h = raw ? JSON.parse(raw) as Head : null;
    return h && Number.isInteger(h.gen) && Number.isInteger(h.count) ? h : null;
  } catch { return null; }
}

/** A long value stored in pieces. null when there is none. */
export async function readBlob(name: string): Promise<string | null> {
  const head = await readHead(name);
  if (!head) return null;
  let out = '';
  for (let i = 0; i < head.count; i++) {
    const piece = await keychainGet(`${name}.${head.gen}.${i}`);
    if (piece === null) return null;
    out += piece;
  }
  return out;
}

/** Write a long value in pieces, then point the head at it; null removes it. */
export async function writeBlob(name: string, value: string | null): Promise<void> {
  const old = await readHead(name);
  if (value !== null) {
    const gen = (old?.gen ?? 0) + 1;
    const pieces = value.match(/[\s\S]{1,1000}/g) ?? [];
    for (let i = 0; i < pieces.length; i++) await keychainSet(`${name}.${gen}.${i}`, pieces[i]);
    await keychainSet(`${name}.head`, JSON.stringify({ gen, count: pieces.length }));
  } else {
    await keychainDelete(`${name}.head`);
  }
  if (old) for (let i = 0; i < old.count; i++) await keychainDelete(`${name}.${old.gen}.${i}`);
}

// ── Local model key ────────────────────────────────────────────────────────
// Read once at boot (main.tsx) and served from memory: the sidecar config and
// the settings page read it synchronously. Was plaintext localStorage.

const LOCAL_KEY = 'local.apiKey';
const LEGACY_LOCAL_KEY = 'ava-ide-local-apikey';
let localModelKey = '';

export async function hydrateLocalModelKey(): Promise<void> {
  try {
    localModelKey = (await keychainGet(LOCAL_KEY)) ?? '';
    const legacy = localStorage.getItem(LEGACY_LOCAL_KEY);
    if (legacy) {
      if (!localModelKey) { await keychainSet(LOCAL_KEY, legacy); localModelKey = legacy; }
      localStorage.removeItem(LEGACY_LOCAL_KEY);
    }
  } catch {
    // No keychain: keep using the old copy.
    try { localModelKey = localStorage.getItem(LEGACY_LOCAL_KEY) ?? ''; } catch { /* none */ }
  }
}

export function getLocalModelKey(): string {
  return localModelKey;
}

/** Re-read after the extension may have changed it. True when it changed. */
export async function refreshLocalModelKey(): Promise<boolean> {
  try {
    const now = (await keychainGet(LOCAL_KEY)) ?? '';
    if (now === localModelKey) return false;
    localModelKey = now;
    return true;
  } catch { return false; }
}

export async function setLocalModelKey(value: string): Promise<void> {
  const v = value.trim();
  try {
    if (v) await keychainSet(LOCAL_KEY, v); else await keychainDelete(LOCAL_KEY);
  } catch {
    try { if (v) localStorage.setItem(LEGACY_LOCAL_KEY, v); else localStorage.removeItem(LEGACY_LOCAL_KEY); } catch { /* none */ }
  }
  localModelKey = v;
}

// ── Secret vault ───────────────────────────────────────────────────────────
// Same shape in both apps ({ id, label, value, …}[]). Was plaintext
// localStorage['ava-ide-secrets'].

const LEGACY_VAULT = 'ava-ide-secrets';

export interface VaultEntry { id: string; label: string; value: string; [extra: string]: unknown }

export async function loadVault(): Promise<VaultEntry[]> {
  let legacy: VaultEntry[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_VAULT);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) legacy = parsed;
  } catch { /* none */ }
  try {
    const raw = await readBlob('vault');
    const shared: VaultEntry[] = raw ? JSON.parse(raw) : [];
    if (legacy.length) {
      // Bring the IDE's old entries in alongside anything the extension has.
      const ids = new Set(shared.map((s) => s.id));
      const merged = [...shared, ...legacy.filter((s) => !ids.has(s.id))];
      await writeBlob('vault', JSON.stringify(merged));
      if ((await readBlob('vault')) === JSON.stringify(merged)) localStorage.removeItem(LEGACY_VAULT);
      return merged;
    }
    return Array.isArray(shared) ? shared : [];
  } catch {
    return legacy;
  }
}

export async function saveVault(entries: VaultEntry[]): Promise<void> {
  try {
    await writeBlob('vault', entries.length ? JSON.stringify(entries) : null);
    try { localStorage.removeItem(LEGACY_VAULT); } catch { /* none */ }
  } catch {
    try { localStorage.setItem(LEGACY_VAULT, JSON.stringify(entries)); } catch { /* none */ }
  }
}
