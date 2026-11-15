// The IDE's plumbing for the shared Memory page (MemoryV4Page), mirroring the
// extension's: each request goes to the sidecar as one `memory_v4` command and
// resolves when its `memory_v4_result` event comes back. The sidecar runs
// core's memoryPage(). `memory_v4_status` events carry whether memory v4 is on
// and how many things wait for a yes (the sidebar badge).

import { useEffect, useState } from 'react';
import { getSidecar, type SidecarEvent } from './sidecar';

let next = 0;

export function memoryRequest(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const sc = getSidecar();
  const requestId = `mem-${Date.now()}-${next++}`;
  return new Promise((resolve, reject) => {
    const handler = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; requestId?: string; result?: unknown };
      if (m.event !== 'memory_v4_result' || m.requestId !== requestId) return;
      sc.offAny(handler);
      clearTimeout(timer);
      resolve(m.result);
    };
    // A sidecar that never answers must not leave the page spinning forever.
    const timer = setTimeout(() => { sc.offAny(handler); reject(new Error('Memory did not answer.')); }, 20_000);
    sc.onAny(handler);
    void sc.memoryV4(requestId, op, args).catch((err: unknown) => { sc.offAny(handler); clearTimeout(timer); reject(err); });
  });
}

/** Ava's memory at a glance: waiting for a yes (the badge), facts, the newest. Asks once, then follows events. */
export function useMemoryV4Status(): { pending: number; facts: number; latest: string | null } {
  const [status, setStatus] = useState<{ pending: number; facts: number; latest: string | null }>({ pending: 0, facts: 0, latest: null });
  useEffect(() => {
    const sc = getSidecar();
    const handler = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; pending?: number; facts?: number; latest?: string | null };
      if (m.event === 'memory_v4_status') setStatus({ pending: Number(m.pending) || 0, facts: Number(m.facts) || 0, latest: m.latest ?? null });
    };
    sc.onAny(handler);
    void sc.memoryV4Status().catch(() => {});
    return () => sc.offAny(handler);
  }, []);
  return status;
}
