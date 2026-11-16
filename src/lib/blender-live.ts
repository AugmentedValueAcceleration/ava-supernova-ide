// Blender Live in the IDE: the Blender room's Headless · Live switch, its
// status line, and the sidebar label that follows it ("Blender (Headless)" /
// "Blender (Live)"). One setting for the room, shared with the extension
// through ~/.ava/config.json. Mirrors the extension's dashboard-ui/src/lib/blender-live.ts.
import { useEffect, useState } from 'react';
import { getSidecar, type SidecarEvent } from './sidecar';
import { tt } from './i18n';

export type BlenderLiveState = 'needs-uv' | 'needs-server' | 'off' | 'blender-closed' | 'ready' | 'error';

export interface BlenderLive {
  wanted: boolean;
  state: BlenderLiveState;
  /** The sidecar's own words (English) — shown only for an unexpected error. */
  message: string;
  blenderVersion: string | null;
  busy: boolean;
}

const initial: BlenderLive = { wanted: false, state: 'off', message: '', blenderVersion: null, busy: false };
let last = initial;
const listeners = new Set<(s: BlenderLive) => void>();
let listening = false;

function listen(): void {
  if (listening) return;
  listening = true;
  getSidecar().onAny((e: SidecarEvent) => {
    const m = e as unknown as { event?: string } & Partial<BlenderLive>;
    if (m.event !== 'blender_live_status') return;
    last = {
      wanted: m.wanted === true,
      state: (m.state ?? 'off') as BlenderLiveState,
      message: String(m.message ?? ''),
      blenderVersion: m.blenderVersion ?? null,
      busy: m.busy === true,
    };
    for (const l of listeners) l(last);
  });
}

export function useBlenderLive(): BlenderLive {
  const [s, setS] = useState(last);
  useEffect(() => {
    listen();
    listeners.add(setS);
    void getSidecar().blenderLiveStatus().catch(() => {});
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

export function setBlenderLive(on: boolean): void {
  void getSidecar().setBlenderLive(on).catch(() => {});
}

export function blenderRoomName(wanted: boolean): string {
  return wanted ? tt('dash.studio.asset.model_mcp', 'Blender (MCP)') : tt('dash.studio.asset.model', 'Blender (Headless)');
}

export function blenderLiveLine(s: BlenderLive): string {
  if (s.busy) return tt('dash.studio.live.connecting', 'Connecting to Blender…');
  switch (s.state) {
    case 'ready': return tt('dash.studio.live.ready', 'Connected to Blender {version} · ready').replace('{version}', s.blenderVersion ?? '');
    case 'blender-closed': return tt('dash.studio.live.closed', 'Blender isn’t open with the MCP add-on running. Open Blender 5.1 or newer.');
    case 'needs-uv':
    case 'needs-server': return tt('dash.studio.live.setup', 'MCP needs a one-time setup. Ask Ava to set it up for you.');
    case 'error': return s.message || tt('dash.studio.live.error', 'MCP couldn’t connect to Blender.');
    default: return tt('dash.studio.live.off', 'Ava builds headless, with no Blender window.');
  }
}
