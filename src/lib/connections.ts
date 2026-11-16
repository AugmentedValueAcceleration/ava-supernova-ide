// The IDE's plumbing for the shared Connections page (ConnectionsPage),
// mirroring the extension's: each request goes to the sidecar as one
// `mcp_page` command and resolves when its `mcp_page_result` event comes back.
// The sidecar runs core's mcpPage(). The sidebar badge (servers waiting for a
// yes) is asked for once and then kept current by the page.

import { useEffect, useState } from 'react';
import { getSidecar, type SidecarEvent } from './sidecar';

let next = 0;

export function connectionsRequest(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const sc = getSidecar();
  const requestId = `mcp-${Date.now()}-${next++}`;
  return new Promise((resolve, reject) => {
    const handler = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; requestId?: string; result?: unknown };
      if (m.event !== 'mcp_page_result' || m.requestId !== requestId) return;
      sc.offAny(handler);
      clearTimeout(timer);
      const r = m.result as { ok?: boolean; error?: string } | undefined;
      if (r && r.ok === false && typeof r.error === 'string') reject(new Error(r.error));
      else resolve(m.result);
    };
    // A sidecar that never answers must not leave the page spinning forever.
    const timer = setTimeout(() => { sc.offAny(handler); reject(new Error('Your servers did not answer.')); }, 90_000);
    sc.onAny(handler);
    void sc.mcpPage(requestId, op, args).catch((err: unknown) => { sc.offAny(handler); clearTimeout(timer); reject(err); });
  });
}

let waiting = 0;
const watchers = new Set<(n: number) => void>();

/** The page tells us how many of this project's servers wait for a yes. */
export function setConnectionsWaiting(n: number): void {
  waiting = n;
  for (const w of watchers) w(n);
}

/** The sidebar badge: asks once, then follows the page. */
export function useConnectionsWaiting(): number {
  const [n, setN] = useState(waiting);
  useEffect(() => {
    watchers.add(setN);
    connectionsRequest('state').then((s) => setConnectionsWaiting((s as { waiting?: number })?.waiting ?? 0)).catch(() => {});
    return () => { watchers.delete(setN); };
  }, []);
  return n;
}
