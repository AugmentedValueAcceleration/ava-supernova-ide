/**
 * IDE sign-in — OAuth device-authorization flow.
 *
 * Mirrors the extension's SignInManager, built for the Tauri webview, with two
 * paths to completion so the flow isn't at the mercy of a single fragile push:
 *   - PUSH: listens for the `ava-deep-link` event (lib.rs dispatches the OS
 *     `ava-ide://auth?code=X&state=Y` URL back to us) → exchanges the code.
 *   - PULL: polls /api/auth/extension/poll after opening the browser → picks up
 *     the key as soon as the browser authorizes, even if the deep link never
 *     routes back (OS quirks, Remote, the IDE reloading / the panel unmounting).
 *
 * The pending attempt is persisted to localStorage so a reload / navigation
 * mid-auth resumes the poll on next mount. Completion is idempotent (resolvedRef)
 * so the two paths can't double-fire. The deep-link exchange is best-effort: a
 * failure there doesn't error or stop polling — only a real timeout / cancel
 * reports failure. That's what makes it robust instead of temperamental.
 *
 * Local-first preserve: a user can always dismiss this and use BYOK provider
 * keys directly — the flow is opt-in, not required.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { writeSharedPlatformKey } from './shared-config';

const DEVICE_ID_KEY = 'ava-ide-device-id';
const PLATFORM_KEY_LS = 'ava-ide-platform-key';
const PENDING_KEY = 'ava-ide-pending-signin';
const WEB_ORIGIN = 'https://avasupernova.com';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — generous for email verify
const POLL_INTERVAL_MS = 2500;
const CALLBACK_SCHEME = 'ava-ide://';

export type SignInMethod = 'github' | 'email';

export interface SignInAccount {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  tier?: string;
}

interface PersistedPending {
  state: string;
  method: SignInMethod;
  startedAt: number;
}

function ensureDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      // 48 hex chars = 192 bits of entropy, stable per install
      id = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().slice(0, 16);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // Fallback if localStorage is gone — one-time device id for this session
    return crypto.randomUUID().replace(/-/g, '');
  }
}

function randomState(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * React hook that manages the full sign-in lifecycle for the Tauri IDE.
 * Components call `start(method)` to initiate. The deep-link listener + a
 * resume of any persisted in-flight attempt are wired on mount.
 */
export function useSignIn() {
  const [pending, setPending] = useState<SignInMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<SignInAccount | null>(null);

  // All mutable flow state lives in refs so the (mount-once) listener + poll
  // loop always see the latest without re-subscribing.
  const pendingRef = useRef<{ state: string; method: SignInMethod; startedAt: number; timeoutId: number } | null>(null);
  const resolvedRef = useRef(false);
  const pollRef = useRef<number | null>(null);

  const clearPersisted = useCallback(() => {
    try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const cancelPending = useCallback(() => {
    stopPolling();
    clearPersisted();
    if (pendingRef.current) { clearTimeout(pendingRef.current.timeoutId); pendingRef.current = null; }
    setPending(null);
  }, [stopPolling, clearPersisted]);

  // Idempotent completion — first path to obtain a key wins; the rest no-op.
  const finish = useCallback((key: string, acct: SignInAccount | null) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    stopPolling();
    clearPersisted();
    if (pendingRef.current) { clearTimeout(pendingRef.current.timeoutId); pendingRef.current = null; }

    // Persist: localStorage is the authoritative in-IDE cache; shared-config
    // mirrors into ~/.ava/config.json so the CLI + extension pick up the same
    // sign-in on their next boot.
    try {
      localStorage.setItem(PLATFORM_KEY_LS, key);
      if (acct?.email) localStorage.setItem('ava-ide-email', acct.email);
      if (acct?.name) localStorage.setItem('ava-ide-user-name', acct.name);
      if (acct?.tier) localStorage.setItem('ava-ide-tier', acct.tier);
    } catch { /* localStorage full or disabled — fall through */ }

    void writeSharedPlatformKey(key);

    setAccount(acct ?? { id: 'unknown' });
    setPending(null);
    setError(null);

    // Let the rest of the IDE react to the new sign-in (both event names — the
    // newer `ava-platform-key-changed` and the legacy `ava-auth-changed`).
    try {
      window.dispatchEvent(new CustomEvent('ava-platform-key-changed', { detail: { key } }));
      window.dispatchEvent(new CustomEvent('ava-auth-changed', { detail: { key } }));
    } catch { /* non-fatal */ }
  }, [stopPolling, clearPersisted]);

  // One poll tick against /api/auth/extension/poll (the PULL path).
  const pollOnce = useCallback(async () => {
    if (resolvedRef.current || !pendingRef.current) { stopPolling(); return; }
    const deviceId = ensureDeviceId();
    try {
      const res = await fetch(`${WEB_ORIGIN}/api/auth/extension/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      });
      if (!res.ok) return; // transient (rate limit / blip) — keep polling
      const data = await res.json() as { status?: string; key?: string; account?: SignInAccount } | null;
      if (data?.status !== 'complete') return; // still pending
      const key = typeof data.key === 'string' ? data.key : null;
      if (!key) return;
      finish(key, data.account ?? null);
    } catch {
      // Network blip — keep polling until success or timeout.
    }
  }, [stopPolling, finish]);

  const startPolling = useCallback(() => {
    if (pollRef.current !== null) return;
    pollRef.current = window.setInterval(() => { void pollOnce(); }, POLL_INTERVAL_MS);
  }, [pollOnce]);

  // The PUSH path — deep-link callback. Best-effort: a failed exchange does NOT
  // error or stop polling; the poll loop remains the backstop.
  const handleCallback = useCallback(async (urlString: string) => {
    if (!urlString.startsWith(CALLBACK_SCHEME)) return;

    let parsed: URL;
    try { parsed = new URL(urlString); } catch { return; }

    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    const callbackError = parsed.searchParams.get('error');

    if (callbackError) { cancelPending(); setError(callbackError); return; }
    if (!code || !state) return;
    if (resolvedRef.current) return; // already signed in via the other path
    if (!pendingRef.current || pendingRef.current.state !== state) return; // stale / not ours

    const deviceId = ensureDeviceId();
    try {
      const res = await fetch(`${WEB_ORIGIN}/api/auth/extension/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, device_id: deviceId, state }),
      });
      if (!res.ok) return; // don't fail — poll remains the fallback
      const data = await res.json() as { key?: string; account?: SignInAccount } | null;
      const key = typeof data?.key === 'string' ? data.key : null;
      if (!key) return;
      finish(key, data?.account ?? null);
    } catch {
      // Network error on the deep-link exchange — poll remains the fallback.
    }
  }, [cancelPending, finish]);

  // Register the deep-link listener once + resume any persisted in-flight attempt.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<string>('ava-deep-link', (evt) => { void handleCallback(evt.payload); })
      .then((fn) => { unlisten = fn; });

    // Resume: if a sign-in was in flight when the IDE last reloaded / the panel
    // unmounted, restart the poll so a browser authorization still completes.
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw && !pendingRef.current) {
        const p = JSON.parse(raw) as PersistedPending;
        const elapsed = Date.now() - p.startedAt;
        if (p.state && p.method && elapsed < SIGN_IN_TIMEOUT_MS) {
          resolvedRef.current = false;
          const timeoutId = window.setTimeout(() => {
            if (pendingRef.current && !resolvedRef.current) {
              cancelPending();
              setError('Sign-in timed out after 5 minutes. Please try again.');
            }
          }, SIGN_IN_TIMEOUT_MS - elapsed);
          pendingRef.current = { state: p.state, method: p.method, startedAt: p.startedAt, timeoutId };
          setPending(p.method);
          startPolling();
        } else {
          try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore malformed persisted state */ }

    return () => { unlisten?.(); stopPolling(); };
  }, [handleCallback, startPolling, stopPolling, cancelPending]);

  const start = useCallback(async (method: SignInMethod) => {
    // Cancel any in-flight attempt — only one sign-in at a time
    if (pendingRef.current) { clearTimeout(pendingRef.current.timeoutId); pendingRef.current = null; }
    stopPolling();
    resolvedRef.current = false;
    setError(null);

    const state = randomState();
    const deviceId = ensureDeviceId();
    const startedAt = Date.now();

    const timeoutId = window.setTimeout(() => {
      if (pendingRef.current?.state === state && !resolvedRef.current) {
        cancelPending();
        setError('Sign-in timed out after 5 minutes. Please try again.');
      }
    }, SIGN_IN_TIMEOUT_MS);

    pendingRef.current = { state, method, startedAt, timeoutId };
    setPending(method);
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ state, method, startedAt } as PersistedPending));
    } catch { /* ignore */ }
    startPolling();

    const url = new URL('/auth/extension', WEB_ORIGIN);
    url.searchParams.set('state', state);
    url.searchParams.set('device_id', deviceId);
    url.searchParams.set('platform', 'ide');
    url.searchParams.set('hint', method);

    try {
      // In a real Tauri build, @tauri-apps/plugin-opener's openUrl handles the
      // system browser. In `vite dev` (browser-only preview, no Tauri runtime)
      // the plugin transport is undefined and openUrl throws — fall back to
      // window.open() so the dev server can still walk the auth flow.
      const isTauri = typeof window !== 'undefined'
        && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
      if (isTauri) {
        await openUrl(url.toString());
      } else {
        const opened = window.open(url.toString(), '_blank', 'noopener,noreferrer');
        if (!opened) throw new Error('Browser blocked the popup — allow popups for localhost.');
      }
    } catch (err) {
      // The user never reached the authorize page — polling can't help.
      cancelPending();
      setError(err instanceof Error ? `Could not open browser: ${err.message}` : 'Could not open browser.');
    }
  }, [cancelPending, stopPolling, startPolling]);

  const cancel = useCallback(() => {
    cancelPending();
    setError(null);
  }, [cancelPending]);

  const clearError = useCallback(() => { setError(null); }, []);

  return { pending, error, account, start, cancel, clearError };
}
