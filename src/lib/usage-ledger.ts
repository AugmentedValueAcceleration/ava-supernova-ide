// Reads the usage ledger (~/.ava/usage/<YYYY-MM>.jsonl) for the Usage timeline.
//
// Read DIRECTLY through Tauri, like the audit log (audit-store.ts): the
// sidecar only runs on the chat page, so it cannot serve the History page.
// The lines are written by core — this sidecar, the extension, the CLI and the
// Unreal panel — and every figure is worked out by core's usage/view.ts, the
// same code the extension's page runs.

import { readDir, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { parseUsageLines, filterUsage, monthsForRange, type UsageEntry } from '@ava/core/usage/view';

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
