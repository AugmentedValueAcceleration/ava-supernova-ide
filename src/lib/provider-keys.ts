// ── Provider keys, in the OS keychain ───────────────────────────────────────
//
// Keys are the only way into Ava now (no accounts, 1 Nov 2026), so they live
// in the OS keychain — Windows Credential Manager, macOS Keychain, the Secret
// Service on Linux — through the keychain_* commands in lib.rs. They used to
// sit in plaintext in localStorage['ava-ide-byok'], readable by anything that
// could read the webview's profile folder.
//
// One keychain entry per provider (`byok.<Field>`), never one blob: Windows
// caps a credential at 2,560 bytes, and one bad write must not take every key
// with it.
//
// Readers all over the app need keys SYNCHRONOUSLY (pickers, availability,
// the sidecar config), so the keychain is read once before React mounts
// (hydrateProviderKeys in main.tsx) and served from memory after that.
// Writes go to the keychain first and the memory copy only once that worked.
//
// If the keychain is unavailable (a Linux box with no Secret Service) the
// keys stay in localStorage as before — a working app with the old storage
// beats an app that silently forgets every key.

import { invoke } from '@tauri-apps/api/core';
import { testProviderKey, type KeyTestResult } from './oneshot';

/** Store field → core provider id. The field names are the ones the IDE has
 *  always saved under and must not change, or saved keys are orphaned. */
export const PROVIDER_FIELDS = {
  Qwen: 'qwen',
  DeepSeek: 'deepseek',
  Moonshot: 'kimi',
  Zhipu: 'glm',
  Mistral: 'mistral',
  MiniMax: 'minimax',
  Xiaomi: 'xiaomi',
  Tencent: 'tencent',
  NVIDIA: 'nvidia',
  Brave: 'brave',
} as const;

export type ProviderField = keyof typeof PROVIDER_FIELDS;

/** Core provider id → store field (glm and zhipu are the same provider). */
export function fieldFor(providerId: string): ProviderField | undefined {
  const id = providerId === 'zhipu' ? 'glm' : providerId;
  return (Object.keys(PROVIDER_FIELDS) as ProviderField[]).find((f) => PROVIDER_FIELDS[f] === id);
}

const LEGACY_KEY = 'ava-ide-byok';
const entry = (field: string) => `byok.${field}`;

let keys: Record<string, string> = {};
let backend: 'keychain' | 'local' = 'keychain';

function readLegacy(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

/**
 * Load every key into memory, moving any still in localStorage into the
 * keychain first. A key is removed from localStorage only after the keychain
 * hands the same value back — never on a write that merely did not throw.
 */
export async function hydrateProviderKeys(): Promise<void> {
  const legacy = readLegacy();
  const fields = Object.keys(PROVIDER_FIELDS);
  try {
    const loaded: Record<string, string> = {};
    for (const f of fields) {
      const v = await invoke<string | null>('keychain_get', { key: entry(f) });
      if (v && v.trim()) loaded[f] = v;
    }
    // Move what is still in localStorage. The keychain wins a clash: it is the
    // newer store, and anything there was written by this code.
    let allMoved = true;
    for (const [f, v] of Object.entries(legacy)) {
      if (!v || !v.trim() || loaded[f]) continue;
      try {
        await invoke('keychain_set', { key: entry(f), value: v.trim() });
        const back = await invoke<string | null>('keychain_get', { key: entry(f) });
        if (back === v.trim()) loaded[f] = back;
        else allMoved = false;
      } catch { allMoved = false; }
    }
    if (allMoved) {
      try { localStorage.removeItem(LEGACY_KEY); } catch { /* nothing to clear */ }
    } else {
      // Keep the plaintext copy for whatever did not verify; it is still
      // read below, so nothing goes missing.
      for (const [f, v] of Object.entries(legacy)) if (v && v.trim() && !loaded[f]) loaded[f] = v.trim();
    }
    keys = loaded;
    backend = 'keychain';
  } catch {
    // No keychain on this machine — carry on with localStorage.
    keys = Object.fromEntries(Object.entries(legacy).filter(([, v]) => v && v.trim()));
    backend = 'local';
  }
}

/** Every saved key by store field (Qwen, DeepSeek, Moonshot…). */
export function getProviderKeys(): Record<string, string> {
  return { ...keys };
}

/** One provider's key, by core provider id ('qwen', 'kimi', 'glm', 'brave'…). */
export function getProviderKey(providerId: string): string | undefined {
  const f = fieldFor(providerId);
  return f ? keys[f] || undefined : undefined;
}

/** Store fields that hold a key. */
export function keyedFields(): Set<string> {
  return new Set(Object.entries(keys).filter(([, v]) => v && v.trim()).map(([k]) => k));
}

/** Save (or, with '', remove) one key. Throws if the keychain refused it. */
export async function setProviderKey(field: ProviderField, value: string): Promise<void> {
  const v = value.trim();
  if (backend === 'keychain') {
    if (v) await invoke('keychain_set', { key: entry(field), value: v });
    else await invoke('keychain_delete', { key: entry(field) });
  } else {
    const legacy = readLegacy();
    if (v) legacy[field] = v; else delete legacy[field];
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
  }
  if (v) keys[field] = v; else delete keys[field];
  window.dispatchEvent(new CustomEvent('ava-byok-changed'));
}

/**
 * Test a pasted key against its provider, then save it unless the provider
 * refused it. 'unverified' (offline, a provider with no cheap test) is saved:
 * a key we could not check is not a key we know is wrong.
 */
export async function testAndSaveProviderKey(field: ProviderField, value: string): Promise<KeyTestResult> {
  const v = value.trim();
  if (!v) return { status: 'invalid', message: '' };
  let result: KeyTestResult;
  try {
    result = await testProviderKey(PROVIDER_FIELDS[field], v);
  } catch (err) {
    result = { status: 'unverified', message: err instanceof Error ? err.message : String(err) };
  }
  if (result.status !== 'invalid') await setProviderKey(field, v);
  return result;
}

/** Remove every key (factory reset). */
export async function clearProviderKeys(): Promise<void> {
  for (const f of Object.keys(PROVIDER_FIELDS) as ProviderField[]) {
    try { await setProviderKey(f, ''); } catch { /* keep going */ }
  }
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* none */ }
}
