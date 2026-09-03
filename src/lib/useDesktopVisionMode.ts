/**
 * Shared hook for the desktop-automation perception (vision) setting.
 *
 * Governs whether Ava may LOOK at the screen via a vision model when the
 * accessibility tree and browser DOM are blind.
 *   - 'off'   — never capture the screen. Ava says she can't see instead.
 *   - 'local' — on-device vision. The screenshot never leaves this machine.
 *
 * The 'cloud' value was removed on 2026-09-03 along with the H Company lane.
 * There is now no setting under which a screenshot leaves the machine, which
 * is a stronger promise than any default could be.
 *
 * Same pattern as useDesktopPermLevel: localStorage is the source of truth,
 * a window CustomEvent syncs instances, and changes push to the sidecar.
 */

import { useCallback, useEffect, useState } from 'react';
import { getSidecar } from './sidecar';

export type DesktopVisionMode = 'off' | 'local';

const STORAGE_KEY = 'ava-ide-desktop-vision-mode';
const SYNC_EVENT = 'ava-desktop-vision-changed';

function readStored(): DesktopVisionMode {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  // A stored 'cloud' migrates to 'local', not to 'off'. Someone who chose
  // Fast wanted Ava to be able to see; dropping them to off would silently
  // take away a capability they asked for, where on-device keeps it and makes
  // their screenshots more private than the setting they picked. That is the
  // safe direction to be wrong in.
  if (v === 'cloud') return 'local';
  // Default 'off' — the most invasive capability ships dark until the user
  // turns it on.
  return v === 'local' ? 'local' : 'off';
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
