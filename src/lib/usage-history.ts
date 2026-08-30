// ── Local usage history ─────────────────────────────────────────────────────
//
// Usage counts per CALENDAR MONTH and clears on the 1st (see api.ts). That is
// right for "what am I spending this month", and it means every completed
// month was thrown away — so the All-Time tab had nothing local to show and
// fell back to the platform's credit figures, which describe an account a BYOK
// user does not have.
//
// Someone running on their own keys is paying the provider directly. They need
// last month against this one, and which model the money went to. So a closing
// month is archived here before the counters reset.
//
// TOKENS are archived, not costs: prices change, and a stored dollar figure
// would quietly become a lie about a month that is already over. The Usage page
// applies the current price table to these tokens, exactly as it does for the
// live month — one pricing table, one method, every period.
//
// localStorage, not a file: this is small, per-machine, and read only by the
// page that renders it. Nothing here leaves the machine.

const HISTORY_KEY = 'ava-ide-usage-history';

/** Keep two years. Long enough to see a trend, small enough to stay cheap. */
const MAX_MONTHS = 24;

export interface MonthUsage {
  /** 'YYYY-MM' — the month these totals belong to. */
  month: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messages: number;
  toolCalls: number;
  /** Per-model split, so the page can show where the money went. */
  models: Record<string, { input: number; output: number; requests: number }>;
}

function load(): MonthUsage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MonthUsage[]) : [];
  } catch {
    return [];
  }
}

/**
 * Archive a month that has just closed.
 *
 * Idempotent on the month key: called from loadStats() on the first read after
 * a rollover, which can happen several times before anything is written, and
 * re-archiving would double the totals. An empty month is skipped — an idle
 * month is not history, it is noise in the chart.
 */
export function archiveMonth(stats: {
  month?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messages: number;
  toolCalls: number;
  models: Record<string, { input: number; output: number; requests: number }>;
}): void {
  if (!stats.month || stats.totalTokens <= 0) return;
  try {
    const history = load();
    if (history.some((m) => m.month === stats.month)) return;
    history.push({
      month: stats.month,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      totalTokens: stats.totalTokens,
      messages: stats.messages,
      toolCalls: stats.toolCalls,
      models: stats.models || {},
    });
    history.sort((a, b) => a.month.localeCompare(b.month));
    const trimmed = history.slice(-MAX_MONTHS);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent('ava-usage-history', { detail: trimmed }));
  } catch { /* storage full or unavailable — history is a nicety, not a gate */ }
}

/** Completed months, oldest first. The live month is NOT in here. */
export function readUsageHistory(): MonthUsage[] {
  return load();
}

/** Every completed month plus the live one, summed. */
export function totalUsage(history: MonthUsage[], live?: MonthUsage | null): MonthUsage {
  const all = live ? [...history, live] : history;
  const models: Record<string, { input: number; output: number; requests: number }> = {};
  let inputTokens = 0, outputTokens = 0, totalTokens = 0, messages = 0, toolCalls = 0;
  for (const m of all) {
    inputTokens += m.inputTokens || 0;
    outputTokens += m.outputTokens || 0;
    totalTokens += m.totalTokens || 0;
    messages += m.messages || 0;
    toolCalls += m.toolCalls || 0;
    for (const [name, v] of Object.entries(m.models || {})) {
      if (!models[name]) models[name] = { input: 0, output: 0, requests: 0 };
      models[name].input += v.input || 0;
      models[name].output += v.output || 0;
      models[name].requests += v.requests || 0;
    }
  }
  return { month: 'all', inputTokens, outputTokens, totalTokens, messages, toolCalls, models };
}

/** Wipe the archive. The user's own record of their own spending — theirs to clear. */
export function clearUsageHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
    window.dispatchEvent(new CustomEvent('ava-usage-history', { detail: [] }));
  } catch { /* nothing to do */ }
}
