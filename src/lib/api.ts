import { dataModeHeader } from './data-mode';

const PLATFORM_URL = 'https://avasupernova.com/api';

export function getPlatformKey(): string | null {
  try { return localStorage.getItem('ava-ide-platform-key') || null; } catch { return null; }
}

export function getStoredEmail(): string | null {
  try { return localStorage.getItem('ava-ide-email') || null; } catch { return null; }
}

export function getStoredTier(): string | null {
  try { return localStorage.getItem('ava-ide-tier') || null; } catch { return null; }
}

export function isConnected(): boolean {
  const key = getPlatformKey();
  return !!key && key.startsWith('sk-ava-');
}

// ── Account id ────────────────────────────────────────────────────────────
// The signed-in user's id, used to scope local data under ~/.ava/users/<id>/
// (the same per-account layout the extension uses, so both surfaces read the
// same files on one machine). Cached in localStorage so it survives reloads;
// an in-flight promise dedupes concurrent callers. null for BYOK / no-account.
const ACCOUNT_ID_KEY = 'ava-ide-account-id';
/** The last account this machine was signed into. Deliberately NOT cleared by
 *  disconnectAccount — it is how account-scope.ts keeps finding your local
 *  data after you sign out. Identity lives in ACCOUNT_ID_KEY; this is only a
 *  pointer at a folder you already own. */
export const LAST_ACCOUNT_ID_KEY = 'ava-ide-last-account-id';
let accountIdPromise: Promise<string | null> | null = null;

export function resetAccountIdCache(): void {
  accountIdPromise = null;
}

export async function getAccountId(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(ACCOUNT_ID_KEY);
    // A cached id means we have been signed in as this account; keep the
    // last-account pointer in step even on the cache-hit path, or a user who
    // never re-fetches (offline, or already cached) never records one.
    if (cached) {
      try { localStorage.setItem(LAST_ACCOUNT_ID_KEY, cached); } catch { /* ignore */ }
      return cached;
    }
  } catch { /* ignore */ }
  const key = getPlatformKey();
  if (!key) return null;
  if (accountIdPromise) return accountIdPromise;
  accountIdPromise = (async () => {
    try {
      const res = await fetch(`${PLATFORM_URL}/account-info`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const id: string | null = data?.id ?? null;
      if (id) {
        try {
          localStorage.setItem(ACCOUNT_ID_KEY, id);
          localStorage.setItem(LAST_ACCOUNT_ID_KEY, id);
        } catch { /* ignore */ }
      }
      return id;
    } catch {
      return null;
    } finally {
      accountIdPromise = null; // allow a retry on the next call if this failed
    }
  })();
  return accountIdPromise;
}

/**
 * Disconnect account — clears all account-specific data and resets to local-first state.
 * Keeps local-only keys: BYOK, device ID, onboarded, consent, language, project folder, work hours.
 */
export function disconnectAccount() {
  // Account identity
  localStorage.removeItem('ava-ide-platform-key');
  localStorage.removeItem('ava-ide-email');
  localStorage.removeItem('ava-ide-tier');
  localStorage.removeItem('ava-ide-user-name');
  localStorage.removeItem('ava-ide-account-id');
  resetAccountIdCache();
  // Clear from shared config so other surfaces see the disconnect on next read.
  void import('./shared-config').then((m) => m.clearSharedPlatformKey());

  // Avatars (account-specific)
  localStorage.removeItem('ava-ide-user-avatar');
  localStorage.removeItem('ava-ide-ai-avatar');

  // Cloud-synced data caches
  localStorage.removeItem('ava-platform-balance');
  localStorage.removeItem('ava-ide-platform-models');
  localStorage.removeItem('ava-ide-session-stats');
  localStorage.removeItem('ava-ide-sync-prefs');
  localStorage.removeItem('ava-ide-settings');
  localStorage.removeItem('ava-knowledge-packs');
  localStorage.removeItem('ava-support-unread');

  // Chat state — conversations belong to the account session
  localStorage.removeItem('ava-ide-chat-history');
  localStorage.removeItem('ava-ide-chat-current');
  localStorage.removeItem('ava-ide-chat-model');
  localStorage.removeItem('ava-ide-chat-mode');

  // Secrets and sensitive keys
  localStorage.removeItem('ava-ide-secrets');

  // Reset backend to local — cloud is no longer available
  localStorage.setItem('ava-ide-chat-backend', 'local');

  // Notify all pages to reset to local state
  window.dispatchEvent(new CustomEvent('ava-auth-changed'));
}

function getDeviceId(): string {
  let id = localStorage.getItem('ava-ide-device-id');
  if (!id) {
    id = crypto.randomUUID().slice(0, 16);
    localStorage.setItem('ava-ide-device-id', id);
  }
  return id;
}

/**
 * This machine's IANA timezone, for surfaces that bucket by the user's day.
 *
 * Sent on every request rather than added to the handful of URLs that need it
 * today, because a header cannot be forgotten by the next caller — /usage/summary
 * alone has five call sites across three surfaces. Servers that do not read it
 * ignore it; servers that do fall back to UTC when it is absent, so an old
 * client keeps working unchanged.
 *
 * An IANA name and not an offset — an offset is wrong twice a year.
 */
function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function apiFetch(path: string, options?: RequestInit) {
  const key = getPlatformKey();
  if (!key) throw new Error('Not connected');
  // Data-mode header — server-side routes (generate-image, generate-music,
  // render-video, ...) gate their cloud persistence on this. Derived from
  // the binary cloud-sync toggle: off -> 'local', on -> 'both'.
  const res = await fetch(`${PLATFORM_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Ava-Platform': 'ide',
      'X-Ava-Device': getDeviceId(),
      'X-Ava-Timezone': localTimezone(),
      'X-Ava-Data-Mode': dataModeHeader(),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export function apiStreamUrl(path: string): string {
  return `${PLATFORM_URL}${path}`;
}

/* ── Shared Session Stats ──────────────────────────────────────────────── */

export interface SessionStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messages: number;
  toolCalls: number;
  models: Record<string, { input: number; output: number; requests: number }>;
  /** The calendar month these belong to, 'YYYY-MM'. Absent on stats written
   *  before the rollover existed — treated as stale and cleared on first read. */
  month?: string;
  /** ISO timestamp the month's counting began — the 1st, local time. */
  periodStart?: string;
}

const SESSION_KEY = 'ava-ide-session-stats';

/**
 * Usage accumulates per CALENDAR MONTH and clears on the 1st.
 *
 * It always persisted here — unlike the extension, which held it in memory and
 * lost it on every reload — but it accumulated forever, so the figures drifted
 * further from anything useful the longer the IDE was installed. A month is
 * what someone actually wants to know, and it matches how billing is reckoned.
 *
 * The rollover is a KEY COMPARISON, not a timer: stored stats carry the month
 * they belong to, and the moment the current month differs they are replaced.
 * That resets correctly on the 1st even if the app was closed over the
 * boundary, asleep, or is opened in a different timezone — none of which a
 * scheduled reset would survive.
 */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function emptyStats(): SessionStats {
  return {
    inputTokens: 0, outputTokens: 0, totalTokens: 0, messages: 0, toolCalls: 0, models: {},
    month: currentMonth(), periodStart: monthStart(),
  };
}

function loadStats(): SessionStats {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as SessionStats;
    // Different month, or written before the field existed. Either way the
    // stored numbers describe a period that is over — so archive them before
    // the counters reset. They used to be dropped, which left a BYOK user with
    // no record of anything but the month they are standing in.
    if (parsed.month !== currentMonth()) {
      void import('./usage-history').then((m) => m.archiveMonth(parsed)).catch(() => { /* nicety, not a gate */ });
      return emptyStats();
    }
    return parsed;
  } catch {
    return emptyStats();
  }
}

function saveStats(stats: SessionStats) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(stats));
  window.dispatchEvent(new CustomEvent('ava-session-stats', { detail: stats }));
}

export function getSessionStats(): SessionStats {
  return loadStats();
}

export function resetSessionStats() {
  saveStats(emptyStats());
}

export function trackTokenUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }, model?: string) {
  const stats = loadStats();
  const inp = usage.prompt_tokens || 0;
  const out = usage.completion_tokens || 0;
  const total = usage.total_tokens || (inp + out);
  stats.inputTokens += inp;
  stats.outputTokens += out;
  stats.totalTokens += total;
  if (model) {
    if (!stats.models[model]) stats.models[model] = { input: 0, output: 0, requests: 0 };
    stats.models[model].input += inp;
    stats.models[model].output += out;
  }
  saveStats(stats);
}

export function trackMessage(model?: string) {
  const stats = loadStats();
  stats.messages += 1;
  if (model) {
    if (!stats.models[model]) stats.models[model] = { input: 0, output: 0, requests: 0 };
    stats.models[model].requests += 1;
  }
  saveStats(stats);
}

export function trackToolCall() {
  const stats = loadStats();
  stats.toolCalls += 1;
  saveStats(stats);
}

/** React hook — re-renders when session stats change */
export function useSessionStats(): SessionStats {
  // This is a simple hook — import { useState, useEffect } at top won't work in a non-React file
  // Instead, consumers can use getSessionStats() + listen for 'ava-session-stats' events
  return loadStats();
}

/* ── Platform Models ──────────────────────────────────────────────────── */

export interface PlatformModel {
  id: string;
  name: string;
  provider: string;
  section: 'platform' | 'byok';
  context_window: number;
  max_output: number;
  supports_vision: boolean;
  supports_tools: boolean;
  supports_thinking: boolean;
}

const MODELS_CACHE_KEY = 'ava-ide-platform-models';
const MODELS_CACHE_TTL = 3600000; // 1 hour

export async function fetchPlatformModels(): Promise<PlatformModel[] | null> {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < MODELS_CACHE_TTL) return data;
    }
    const res = await fetch(`${PLATFORM_URL}/models`);
    if (!res.ok) return null;
    const data: PlatformModel[] = await res.json();
    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    return data;
  } catch {
    return null;
  }
}

export function getCachedModels(): PlatformModel[] | null {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (!cached) return null;
    const { data } = JSON.parse(cached);
    return data;
  } catch {
    return null;
  }
}

export async function validateKey(key: string): Promise<{ valid: boolean; email?: string; name?: string; tier?: string; error?: string }> {
  try {
    const res = await fetch(`${PLATFORM_URL}/account-info`, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return { valid: false, error: 'Invalid API key' };
    }
    const data = await res.json();
    return { valid: true, email: data.email, name: data.name || data.display_name || data.email?.split('@')[0], tier: data.tier || data.plan || 'free' };
  } catch {
    return { valid: false, error: 'Could not reach platform' };
  }
}

/**
 * Push the user's display name to the platform and refresh the local
 * cache. Local-first: caller should already have written to localStorage
 * before invoking this — the round-trip exists so other surfaces (the
 * extension, the companion, the web dashboard) read the same name.
 *
 * No-op when not connected — falls back to localStorage-only behaviour
 * so the name editor still works for users without a platform account.
 * Returns true on success, false on any failure (network, API error,
 * not signed in).
 */
export async function updateDisplayName(name: string): Promise<boolean> {
  const key = getPlatformKey();
  if (!key) return false;
  try {
    const trimmed = (name ?? '').trim();
    // Empty name maps to "clear" — but the existing /account-info PATCH
    // rejects empty strings. Send a single space as a sentinel, server
    // can treat it as the same as null. Until the server supports
    // explicit clear, only push non-empty names; an empty local clear
    // simply leaves the platform record at its previous value, which is
    // acceptable — the local greeting falls back to email prefix anyway.
    if (!trimmed) return true;
    const res = await fetch(`${PLATFORM_URL}/account-info`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Re-fetch the user's display name from the platform and sync it into
 * localStorage if different. Called on app launch and after sign-in so
 * an edit made on another surface (extension, companion, dashboard)
 * propagates to the IDE without requiring a sign-out/sign-in cycle.
 *
 * Fires `ava-ide-name-changed` only when the value actually changes,
 * so unrelated re-renders don't cascade. Returns the resolved name or
 * null if not connected / fetch failed.
 */
export async function refreshDisplayName(): Promise<string | null> {
  const key = getPlatformKey();
  if (!key) return null;
  try {
    const res = await fetch(`${PLATFORM_URL}/account-info`, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const next = (data.name ?? '').trim();
    if (!next) return null;
    const prev = (localStorage.getItem('ava-ide-user-name') ?? '').trim();
    if (next !== prev) {
      localStorage.setItem('ava-ide-user-name', next);
      window.dispatchEvent(new CustomEvent('ava-ide-name-changed'));
    }
    return next;
  } catch {
    return null;
  }
}

/**
 * Re-fetch the user's current tier from the platform and update the
 * localStorage cache. Called on app launch and on window focus so an
 * upgrade made on the website propagates to the IDE without requiring
 * a sign-out/sign-in cycle. No-op when not connected.
 */
export async function refreshTier(): Promise<string | null> {
  const key = getPlatformKey();
  if (!key) return null;
  try {
    const res = await fetch(`${PLATFORM_URL}/account-info`, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const nextTier = (data.tier || data.plan || 'free') as string;
    const prev = getStoredTier();
    if (nextTier !== prev) {
      localStorage.setItem('ava-ide-tier', nextTier);
      window.dispatchEvent(new CustomEvent('ava-tier-changed', { detail: { tier: nextTier } }));
    }
    return nextTier;
  } catch {
    return null;
  }
}
