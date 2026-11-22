// Reads the usage ledger (~/.ava/usage/<YYYY-MM>.jsonl) for the Usage timeline.
//
// Read DIRECTLY through Tauri, like the audit log (audit-store.ts): the
// sidecar only runs on the chat page, so it cannot serve the History page.
// The lines are written by core — this sidecar, the extension, the CLI and the
// Unreal panel — and every figure is worked out by core's usage/view.ts, the
// same code the extension's page runs.

import { readDir, readTextFile, writeTextFile, stat, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { parseUsageLines, filterUsage, monthsForRange, legacyUsageLines, type LegacyMonth, type UsageEntry } from '@ava/core/usage/view';

const DIR = '.ava/usage';

/** Every entry whose local day is within [from, to] (inclusive, either open). */
export async function readUsageRange(from?: string, to?: string): Promise<UsageEntry[]> {
  let months: string[] = [];
  try {
    months = (await readDir(DIR, { baseDir: BaseDirectory.Home }))
      .map((e) => /^(\d{4}-\d{2})\.jsonl$/.exec(e.name ?? '')?.[1])
      .filter((m): m is string => !!m)
      .sort();
  } catch { return []; } // nothing recorded yet
  const out: UsageEntry[] = [];
  for (const m of monthsForRange(months, from, to)) {
    try { out.push(...parseUsageLines(await readTextFile(`${DIR}/${m}.jsonl`, { baseDir: BaseDirectory.Home }))); } catch { /* unreadable month */ }
  }
  return filterUsage(out, from, to);
}

// ─── The months before daily records ────────────────────────────────────────

/** Where the old counters lived (lib/api.ts and lib/usage-history.ts, both
 *  removed 21 Nov 2026). Read once below, then deleted once the import's
 *  marker exists (his call, 22 Nov 2026) — never before, so a failed import
 *  keeps the source to retry. */
const OLD_LIVE_KEY = 'ava-ide-session-stats';
const OLD_HISTORY_KEY = 'ava-ide-usage-history';

type OldMonth = { month?: string; models?: Record<string, { input?: number; output?: number; requests?: number }> };

function readOldMonths(): LegacyMonth[] {
  const read = (key: string): unknown => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
  };
  const history = read(OLD_HISTORY_KEY);
  const live = read(OLD_LIVE_KEY) as OldMonth | null;
  const all: OldMonth[] = [...(Array.isArray(history) ? (history as OldMonth[]) : []), ...(live ? [live] : [])];
  return all
    .filter((m): m is OldMonth & { month: string } => !!m && typeof m.month === 'string')
    .map((m) => ({
      month: m.month,
      // The old IDE counter kept the model id only, never the provider.
      models: Object.entries(m.models ?? {}).map(([model, v]) => ({
        model, in: v.input ?? 0, out: v.output ?? 0, requests: v.requests ?? 0,
      })),
    }));
}

/**
 * Bring the IDE's old monthly totals into ~/.ava/usage — ONCE (a marker file,
 * `imported-ide`, makes every later start a no-op). Run at start-up of the
 * first version without the old counter, so what core recorded alongside it
 * this month is taken off rather than counted twice (legacyUsageLines).
 *
 * One honest limit, said where it is used: the old IDE counter was reset on
 * every New Chat, so its months only hold what was spent since each last new
 * chat. They come in as they are, marked "before daily records".
 */
export async function importLegacyIdeUsage(): Promise<void> {
  const home = { baseDir: BaseDirectory.Home };
  const marker = `${DIR}/imported-ide`;
  // stat(), not exists(): fs:allow-exists is not in the capability scope, so
  // exists() is denied at runtime and the import would never have run.
  const removeOldKeys = () => {
    try { localStorage.removeItem(OLD_LIVE_KEY); localStorage.removeItem(OLD_HISTORY_KEY); } catch { /* storage unavailable */ }
  };
  try { await stat(marker, home); removeOldKeys(); return; } catch { /* no marker: import */ }
  try {
    const months = readOldMonths();
    const wanted = months.map((m) => m.month).sort();
    const recorded = wanted.length ? await readUsageRange(`${wanted[0]}-01`, `${wanted[wanted.length - 1]}-31`) : [];
    const lines = legacyUsageLines('ide', months, recorded);
    await mkdir(DIR, { ...home, recursive: true });
    const byMonth = new Map<string, string>();
    for (const e of lines) byMonth.set(e.t.slice(0, 7), (byMonth.get(e.t.slice(0, 7)) ?? '') + JSON.stringify(e) + '\n');
    for (const [month, text] of byMonth) await writeTextFile(`${DIR}/${month}.jsonl`, text, { ...home, append: true });
    await writeTextFile(marker, `${new Date().toISOString()} ${lines.length} lines\n`, home);
    removeOldKeys();
  } catch { /* the old months are a nicety; nothing depends on them */ }
}
