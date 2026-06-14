/**
 * Shared hook for the desktop-automation perception (vision) setting.
 *
 * Phase C3: governs whether Ava may LOOK at the screen via a vision model
 * when the accessibility tree and browser DOM are blind.
 *   - 'off'   — never capture the screen. Ava says she can't see instead.
 *   - 'local' — on-device vision only (free, private). Until the packaged
 *               local model ships this behaves like 'off' at runtime.
 *   - 'cloud' — local first; falls back to Holo via the user's own
 *               H Company key or platform credits. Screenshots leave the
 *               machine ONLY on this setting.
 *
 * Same pattern as useDesktopPermLevel: localStorage is the source of truth,
 * a window CustomEvent syncs instances, and changes push to the sidecar.
 */

import { useCallback, useEffect, useState } from 'react';
import { getSidecar } from './sidecar';

export type DesktopVisionMode = 'off' | 'local' | 'cloud';

const STORAGE_KEY = 'ava-ide-desktop-vision-mode';
const SYNC_EVENT = 'ava-desktop-vision-changed';

function readStored(): DesktopVisionMode {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  // Default 'off' — the most invasive capability ships dark until the user
  // chooses a lane. ('local' becomes the recommended default once the
  // packaged on-device model exists.)
  return v === 'local' || v === 'cloud' ? v : 'off';
}

interface SyncDetail { mode: DesktopVisionMode; source: number }

let nextSourceId = 1;

export function useDesktopVisionMode(): [DesktopVisionMode, (mode: DesktopVisionMode) => void] {
  const [mode, setMode] = useState<DesktopVisionMode>(readStored);
  const [sourceId] = useState(() => nextSourceId++);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SyncDetail>).detail;
      if (!detail || detail.source === sourceId) return;
      setMode(detail.mode);
    };
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, [sourceId]);

  const update = useCallback((next: DesktopVisionMode) => {
    setMode(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage denied */ }
    try {
      window.dispatchEvent(new CustomEvent<SyncDetail>(SYNC_EVENT, { detail: { mode: next, source: sourceId } }));
    } catch { /* no-op */ }
    try {
      getSidecar().setDesktopVisionMode(next).catch(() => {});
    } catch { /* sidecar not ready — reapplied on desktop-mode entry */ }
  }, [sourceId]);

  return [mode, update];
}
