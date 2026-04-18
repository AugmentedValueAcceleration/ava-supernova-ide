/**
 * IDE sign-in — OAuth device-authorization flow.
 *
 * Mirrors the extension's SignInManager but built for the Tauri webview:
 *   - Opens the browser to /auth/extension on the platform website
 *   - Listens for the `ava-deep-link` event emitted by lib.rs when the
 *     OS dispatches an `ava-ide://auth?code=X&state=Y` URL back to us
 *   - Validates state, POSTs the code to /api/auth/extension/exchange,
 *     stores the returned platform key in localStorage AND the shared
 *     ~/.ava/config.json so the CLI / extension pick up the same key
 *
 * Local-first preserve: a user can always dismiss this and use BYOK
 * provider keys directly — the flow is opt-in, not required.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { writeSharedPlatformKey } from './shared-config';

const DEVICE_ID_KEY = 'ava-ide-device-id';
const PLATFORM_KEY_LS = 'ava-ide-platform-key';
const WEB_ORIGIN = 'https://ava-supernova.com';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — generous for email verify
const CALLBACK_SCHEME = 'ava-ide://';

export type SignInMethod = 'github' | 'email';

export interface SignInAccount {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  tier?: string;
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
 * Components call `start(method)` to initiate and unsubscribe via unmount.
 * The callback handler is wired automatically on first mount — only one
 * sign-in can be pending at a time; starting a new one cancels the prior.
 */
export function useSignIn() {
  const [pending, setPending] = useState<SignInMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<SignInAccount | null>(null);

  // Kept in a ref so the deep-link listener (registered once on mount)
  // always sees the latest state without needing to re-subscribe.
  const pendingRef = useRef<{ state: string; method: SignInMethod; timeoutId: number } | null>(null);

  const cancelPending = useCallback(() => {
    if (!pendingRef.current) return;
    clearTimeout(pendingRef.current.timeoutId);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const handleCallback = useCallback(async (urlString: string) => {
    if (!urlString.startsWith(CALLBACK_SCHEME)) return;

    let parsed: URL;
    try {
      parsed = new URL(urlString);
    } catch {
      return;
    }

    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    const callbackError = parsed.searchParams.get('error');

    if (callbackError) {
      cancelPending();
      setError(callbackError);
      return;
    }
    if (!code || !state) return;
    if (!pendingRef.current || pendingRef.current.state !== state) {
      // Not our callback — stale or state mismatch (CSRF guard)
      return;
    }

    // Mark consumed BEFORE the fetch so a duplicate callback doesn't race.
    clearTimeout(pendingRef.current.timeoutId);
    pendingRef.current = null;

    const deviceId = ensureDeviceId();
    try {
      const res = await fetch(`${WEB_ORIGIN}/api/auth/extension/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, device_id: deviceId, state }),
      });
      if (!res.ok) {
        let msg = `Exchange failed (HTTP ${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch { /* not JSON */ }
        setPending(null);
        setError(msg);
        return;
      }
      const data = await res.json() as { key?: string; account?: SignInAccount };
      const key = typeof data?.key === 'string' ? data.key : null;
      if (!key) {
        setPending(null);
        setError('Exchange response missing platform key.');
        return;
      }

      // Persist: localStorage is the authoritative in-IDE cache;
      // shared-config mirrors into ~/.ava/config.json so the CLI and
      // extension pick up the same sign-in on their next boot.
      try {
        localStorage.setItem(PLATFORM_KEY_LS, key);
        if (data.account?.email) localStorage.setItem('ava-ide-email', data.account.email);
        if (data.account?.name) localStorage.setItem('ava-ide-user-name', data.account.name);
        if (data.account?.tier) localStorage.setItem('ava-ide-tier', data.account.tier);
      } catch { /* localStorage full or disabled — fall through */ }

      void writeSharedPlatformKey(key);

      setAccount(data.account ?? { id: 'unknown' });
      setPending(null);
      setError(null);

      // Let the rest of the IDE react to the new sign-in. We dispatch both
      // event names: `ava-platform-key-changed` is the newer convention,
      // `ava-auth-changed` is what pre-OAuth components (Sidebar, CLI view
      // etc.) already listen for. Keeping both means we don't need to
      // touch every listener in the codebase in this commit.
      try {
        window.dispatchEvent(new CustomEvent('ava-platform-key-changed', { detail: { key } }));
        window.dispatchEvent(new CustomEvent('ava-auth-changed', { detail: { key } }));
      } catch { /* non-fatal */ }
    } catch (err) {
      setPending(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [cancelPending]);

  // Register the Tauri deep-link listener once per mount
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    listen<string>('ava-deep-link', (evt) => {
      void handleCallback(evt.payload);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [handleCallback]);

  const start = useCallback(async (method: SignInMethod) => {
    // Cancel any in-flight attempt — only one sign-in at a time
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timeoutId);
      pendingRef.current = null;
    }
    setError(null);
    const state = randomState();
    const deviceId = ensureDeviceId();

    const timeoutId = window.setTimeout(() => {
      if (pendingRef.current?.state === state) {
        pendingRef.current = null;
        setPending(null);
        setError('Sign-in timed out after 5 minutes. Please try again.');
      }
    }, SIGN_IN_TIMEOUT_MS);

    pendingRef.current = { state, method, timeoutId };
    setPending(method);

    const url = new URL('/auth/extension', WEB_ORIGIN);
    url.searchParams.set('state', state);
    url.searchParams.set('device_id', deviceId);
    url.searchParams.set('platform', 'ide');
    url.searchParams.set('hint', method);

    try {
      await openUrl(url.toString());
    } catch (err) {
      cancelPending();
      setError(err instanceof Error ? `Could not open browser: ${err.message}` : 'Could not open browser.');
    }
  }, [cancelPending]);

  const cancel = useCallback(() => {
    cancelPending();
    setError(null);
  }, [cancelPending]);

  const clearError = useCallback(() => { setError(null); }, []);

  return { pending, error, account, start, cancel, clearError };
}
