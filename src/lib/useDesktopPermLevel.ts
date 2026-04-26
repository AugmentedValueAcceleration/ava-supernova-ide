/**
 * Shared hook for the desktop-automation permission level.
 *
 * The chat page (AvaChatPage) renders the level picker in the input bar;
 * the settings page (SettingsPage) renders the same picker with more
 * descriptive copy. Both must stay in sync — change in one, reflect in
 * the other instantly — without lifting state into a global store or
 * adding a second source of truth.
 *
 * Pattern:
 *   - localStorage is the source of truth between mounts.
 *   - A window-level CustomEvent ('ava-desktop-perm-changed') keeps every
 *     mounted instance in sync within the same tab.
 *   - Each instance pushes the change to the sidecar (only meaningful
 *     while in desktop mode; the sidecar handler also gates internally).
 */

import { useCallback, useEffect, useState } from 'react';
import { getSidecar } from './sidecar';

export type DesktopPermLevel = 'watch' | 'ask' | 'drive';

const STORAGE_KEY = 'ava-ide-desktop-perm-level';
const SYNC_EVENT = 'ava-desktop-perm-changed';

function readStored(): DesktopPermLevel {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  return v === 'watch' || v === 'drive' ? v : 'ask';
}

interface SyncDetail { level: DesktopPermLevel; source: number }

// Per-instance source id so each hook instance can ignore the event
// it just dispatched itself (otherwise we'd ping-pong through state
// updates that don't change the value, but still cost a render).
let nextSourceId = 1;

/**
 * Returns the active desktop permission level + a setter. The setter
 * persists to localStorage, broadcasts to any other mounted instance via
 * a window event, and pushes to the sidecar so the system-prompt block
 * Ava reads matches the operator's choice.
 */
export function useDesktopPermLevel(): [DesktopPermLevel, (level: DesktopPermLevel) => void] {
  const [level, setLevel] = useState<DesktopPermLevel>(readStored);
  const [sourceId] = useState(() => nextSourceId++);

  // Listen for cross-instance changes — when the chat page picker fires,
  // the settings picker re-renders with the new level (and vice versa).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SyncDetail>).detail;
      if (!detail || detail.source === sourceId) return;
      setLevel(detail.level);
    };
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, [sourceId]);

  const update = useCallback((next: DesktopPermLevel) => {
    setLevel(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage quota or denied */ }
    // Broadcast to other mounted instances within this tab.
    try {
      window.dispatchEvent(new CustomEvent<SyncDetail>(SYNC_EVENT, { detail: { level: next, source: sourceId } }));
    } catch { /* no-op */ }
    // Sidecar push — fire-and-forget; the sidecar handler is itself a
    // no-op when the value didn't change, so duplicate broadcasts cost
    // nothing on the agent side.
    try {
      const sidecar = getSidecar();
      sidecar.setDesktopPermissionLevel(next).catch(() => {});
    } catch { /* sidecar not ready yet — value will reapply on entry to desktop mode */ }
  }, [sourceId]);

  return [level, update];
}
