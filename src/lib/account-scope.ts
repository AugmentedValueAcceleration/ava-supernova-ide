// ── Account-scoped local data root ──────────────────────────────────────────
//
// Health data (profile, plans, general profile) lives under a per-account dir
// so multiple accounts on one machine don't collide — and, crucially, so the
// IDE reads/writes the SAME files the extension does (~/.ava/users/<id>/...).
// The IDE previously used a flat ~/.ava/health which never saw the extension's
// account-scoped data, so the Plans tab + profile came up empty.
//
// Signed in → ".ava/users/<id>"; BYOK / no-account → ".ava" (the legacy flat
// layout, still valid for users without a platform account).

import { getAccountId, resetAccountIdCache } from './api';

let cached: string | null = null;

/** Root for this account's local data, relative to the home dir (Tauri
 *  BaseDirectory.Home). Resolved once and cached for the session. */
export async function accountRoot(): Promise<string> {
  if (cached) return cached;
  const id = await getAccountId();
  cached = id ? `.ava/users/${id}` : '.ava';
  return cached;
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
