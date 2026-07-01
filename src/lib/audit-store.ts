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

import { readTextFile, readFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { detectPatterns, type Finding } from '@ava/core/audit/patterns';
import { classifySecurity } from '@ava/core/audit/security';

const LOG_REL_PATH = '.ava/audit-log.jsonl';
const MAX_VERIFY_BYTES = 25 * 1024 * 1024;
const MAX_HASH_FILES = 200; // bound the integrity pass so a huge log stays snappy

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

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface AuditReadResult { entries: any[]; findings: Finding[]; }

/** Read the FULL audit log for the audit tab — the same job the sidecar's
 *  get_audit_log did, but done in the renderer so it works on pages where the
 *  sidecar isn't running (History, Usage). Returns entries newest-first (cap
 *  `limit`) annotated with integrity (hashed client-side via Web Crypto) +
 *  the security lens, plus the nudge findings. Local-first: [] on failure. */
export async function readAuditEntries(projectRoot?: string, limit = 1000): Promise<AuditReadResult> {
  try {
    const text = await readTextFile(LOG_REL_PATH, { baseDir: BaseDirectory.Home });
    const entries = parseEntries(text).slice(-limit).reverse(); // newest first
    if (entries.length === 0) return { entries: [], findings: [] };

    // Integrity — hash each unique mutated file once (bounded), compare to the
    // sha256 captured after Ava's edit. null verdict → unverifiable (missing,
    // unreadable, or over the size cap) rather than a false "deleted".
    const cache = new Map<string, string | null>();
    let hashed = 0;
    for (const e of entries) {
      const fm = e.fileMutation;
      if (!fm?.path || !fm.sha256After) continue;
      if (!cache.has(fm.path)) {
        if (hashed >= MAX_HASH_FILES) { cache.set(fm.path, null); continue; }
        hashed++;
        try {
          const bytes = await readFile(fm.path);
          cache.set(fm.path, bytes.length > MAX_VERIFY_BYTES ? null : await sha256Hex(bytes));
        } catch { cache.set(fm.path, null); }
      }
      const cur = cache.get(fm.path);
      e.integrity = cur == null ? 'unverifiable' : cur === fm.sha256After ? 'unchanged' : 'modified';
    }

    // Security lens — pure classifier, keyed off category / path / risk.
    const annotated = entries.map(e => {
      const s = classifySecurity(e, projectRoot);
      return s.length ? { ...e, security: s } : e;
    });

    return { entries: annotated, findings: detectPatterns(annotated) };
  } catch {
    return { entries: [], findings: [] };
  }
}
