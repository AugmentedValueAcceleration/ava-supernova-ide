// The IDE's plumbing for the shared Brainstorm room (BrainstormRoom), mirroring
// the extension's: each request goes to the sidecar as one `brainstorm_page`
// command and resolves when its `brainstorm_page_result` event comes back. The
// sidecar runs core's brainstormPage().

import { getSidecar, type SidecarEvent } from './sidecar';

let next = 0;

export function brainstormRequest(op: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const sc = getSidecar();
  const requestId = `bs-${Date.now()}-${next++}`;
  return new Promise((resolve, reject) => {
    const handler = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; requestId?: string; result?: unknown };
      if (m.event !== 'brainstorm_page_result' || m.requestId !== requestId) return;
      sc.offAny(handler);
      clearTimeout(timer);
      const r = m.result as { ok?: boolean; error?: string } | undefined;
      if (r && r.ok === false && typeof r.error === 'string') reject(new Error(r.error));
      else resolve(m.result);
    };
    // A sidecar that never answers must not leave the room spinning forever.
    const timer = setTimeout(() => { sc.offAny(handler); reject(new Error('Your brainstorms did not answer.')); }, 90_000);
    sc.onAny(handler);
    void sc.brainstormPage(requestId, op, args).catch((err: unknown) => { sc.offAny(handler); clearTimeout(timer); reject(err); });
  });
}

// Main-chat → Brainstorm room hand-off: the card sets this right before
// navigating; the room drains it once and starts a new brainstorm with it.
let pendingPrimer: string | null = null;
export function seedBrainstormRoom(primer: string): void { pendingPrimer = primer.trim() || null; }
export function takeBrainstormPrimer(): string | null { const p = pendingPrimer; pendingPrimer = null; return p; }
