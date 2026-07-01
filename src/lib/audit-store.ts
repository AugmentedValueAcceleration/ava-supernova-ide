// Local-first audit findings for the IDE — READ side.
//
// The Command Centre trust-nudge card can't go through the sidecar: the
// sidecar is only started by the chat page, so on the launch page (the
// Command Centre) it isn't running. Instead we do what the History tab and
// learning-store already do — read the on-disk log directly via the Tauri fs
// plugin and run the SAME pure @ava/core/audit detector on it. No sidecar, no
// network, works the moment the app opens.
//
// The audit log is flat (not account-scoped): @ava/core writes every entry to
// ~/.ava/audit-log.jsonl regardless of who's signed in, so we read exactly
// that path (relative to Home).

import { readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { detectPatterns, type Finding } from '@ava/core/audit/patterns';

const LOG_REL_PATH = '.ava/audit-log.jsonl';

/** Parse the append-only JSONL log into entries. Skips any malformed line so
 *  one bad append can't blank the whole card. */
function parseEntries(text: string): any[] {
  const out: any[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip a torn line */ }
  }
  return out;
}

/** Read the audit log and compute the current findings via the shared engine.
 *  Local-first: returns [] (not an error) when the log is missing/unreadable. */
export async function readAuditFindings(): Promise<Finding[]> {
  // Read-then-catch (no exists() — that fs command isn't in the capability
  // allow-list, unlike read-text-file which is granted **). Missing/unreadable
  // log → [] via the catch, same pattern history-store uses.
  try {
    const text = await readTextFile(LOG_REL_PATH, { baseDir: BaseDirectory.Home });
    const entries = parseEntries(text);
    if (entries.length === 0) return [];
    return detectPatterns(entries);
  } catch {
    return [];
  }
}
