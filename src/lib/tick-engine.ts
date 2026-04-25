/**
 * Tick Engine — IDE version
 *
 * Lightweight client-side tick for the Tauri IDE.
 * Checks credit balance and support unread from localStorage.
 * Task and journal checks done via API polling in DashboardPages.
 *
 * Same concept, same comment. You know who to thank. 🍻
 */

export interface TickContext {
  getCreditBalance?: () => { used: number; limit: number } | null;
  getSupportUnread?: () => number;
}

export interface TickEvent {
  type: 'credit_warning' | 'support_reply';
  message: string;
  severity: 'info' | 'nudge' | 'urgent';
}

const MIN_TICK_INTERVAL = 120_000;
const DEDUP_INTERVAL = 600_000;

export class TickEngine {
  private lastTick = 0;
  private lastEventByType = new Map<string, number>();

  async tick(ctx: TickContext): Promise<{ events: TickEvent[] }> {
    const now = Date.now();
    if (now - this.lastTick < MIN_TICK_INTERVAL) return { events: [] };
    this.lastTick = now;

    const events: TickEvent[] = [];

    // Credit balance
    if (ctx.getCreditBalance) {
      const bal = ctx.getCreditBalance();
      if (bal && bal.limit > 0 && bal.limit < 999_999_999) {
        const remaining = bal.limit - bal.used;
        const pct = (remaining / bal.limit) * 100;
        if (pct <= 10 && !this.isDup('credit_warning', now)) {
          events.push({
            type: 'credit_warning',
            message: `Heads up — ${Math.round(100 - pct)}% of your credits used this month.`,
            severity: pct <= 5 ? 'urgent' : 'nudge',
          });
        }
      }
    }

    // Support unread
    if (ctx.getSupportUnread) {
      const unread = ctx.getSupportUnread();
      if (unread > 0 && !this.isDup('support_reply', now)) {
        events.push({
          type: 'support_reply',
          message: `${unread} unread support message${unread > 1 ? 's' : ''}.`,
          severity: 'nudge',
        });
      }
    }

    for (const e of events) this.lastEventByType.set(e.type, now);
    return { events };
  }

  private isDup(type: string, now: number): boolean {
    const last = this.lastEventByType.get(type);
    return !!last && now - last < DEDUP_INTERVAL;
  }
}
