// ── Sidecar activity log ─────────────────────────────────────────────────────
// An always-on, in-app record of everything the sidecar/agent emits. The IDE's
// Output panel renders the full stream and the Problems panel renders the errors,
// so a dev (or Ava herself) can SEE what the agent is doing without reaching for
// the browser devtools. One global wildcard subscription on the sidecar singleton
// feeds a capped ring buffer; panels subscribe for live updates.

import { getSidecar, type SidecarEvent } from './sidecar';

export type SidecarLogLevel = 'info' | 'tool' | 'error';

export interface SidecarLogEntry {
  seq: number;      // monotonic id (stable React key)
  t: number;        // epoch ms
  lane: string;     // 'main' | 'design' | 'health' | 'learning'
  event: string;    // raw event type
  level: SidecarLogLevel;
  detail: string;   // human-readable one-liner
}

const MAX = 1000;
const buffer: SidecarLogEntry[] = [];
const listeners = new Set<() => void>();
let seq = 0;
let attached = false;

function short(s: string, n = 160): string {
  const c = s.replace(/\s+/g, ' ').trim();
  return c.length > n ? c.slice(0, n) + '…' : c;
}

function summarize(ev: SidecarEvent): { level: SidecarLogLevel; detail: string } {
  switch (ev.event) {
    case 'error':
    case 'agent_error':
      return { level: 'error', detail: ev.message || 'error' };
    case 'tool_call_start':
      return { level: 'tool', detail: `→ ${ev.toolName || 'tool'}${ev.args ? ' ' + short(JSON.stringify(ev.args), 100) : ''}` };
    case 'tool_call_end':
      return { level: ev.success === false ? 'error' : 'tool', detail: `${ev.toolName || 'tool'} ${ev.success === false ? 'failed' : 'ok'}` };
    case 'stream_start':
      return { level: 'info', detail: '· streaming…' };
    case 'stream_delta':
      return { level: 'info', detail: short(ev.content || '') };
    case 'stream_end':
    case 'done':
    case 'stopped':
    case 'cancelled':
    case 'injected':
      return { level: 'info', detail: ev.event };
    default:
      if (ev.message) return { level: 'info', detail: short(ev.message) };
      if (ev.content) return { level: 'info', detail: short(ev.content) };
      return { level: 'info', detail: '' };
  }
}

function push(ev: SidecarEvent): void {
  const { level, detail } = summarize(ev);
  buffer.push({ seq: ++seq, t: Date.now(), lane: ev.lane || 'main', event: ev.event, level, detail });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  listeners.forEach((l) => l());
}

/** Push a frontend-originated diagnostic line into the log (shows in Output). */
export function logDiag(detail: string, level: SidecarLogLevel = 'info'): void {
  buffer.push({ seq: ++seq, t: Date.now(), lane: 'diag', event: 'frontend', level, detail });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  listeners.forEach((l) => l());
}

/** Attach the global sidecar subscription once. Idempotent. */
export function ensureSidecarLog(): void {
  if (attached) return;
  attached = true;
  getSidecar().onAny(push);
}

export function getSidecarLog(): readonly SidecarLogEntry[] {
  return buffer;
}

export function subscribeSidecarLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function clearSidecarLog(): void {
  buffer.length = 0;
  listeners.forEach((l) => l());
}
