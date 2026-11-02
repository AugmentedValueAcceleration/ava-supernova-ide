// ── Everything about you follows you between the apps ──────────────────────
//
// A user with the extension AND the IDE sets things up once. What is about
// THEM lives in ~/.ava, which both apps read; the extension's
// src/shared-settings.ts keeps the same files from its side:
//   - ~/.ava/settings.json    language, working hours, Ava's settings, the chat
//                             model, the local model server, local embeddings
//   - ~/.ava/avatar.dat       your picture (the extension's file, unchanged)
//   - ~/.ava/personality.json Ava's style (the file core and the extension use)
// Secrets go to the shared keychain instead (provider-keys.ts, keychain.ts).
// Window layout — panel widths, collapsed sections, the open page — stays per
// app on purpose.
//
// The rest of the IDE keeps reading its own localStorage keys, unchanged. This
// module keeps those keys and ~/.ava matched: at boot, when the window gains
// focus, when it loses it, and every few seconds. It remembers what it last
// synced, so it can tell "the other app changed this" (copy it here) from "you
// changed this here" (copy it there). On first sync the shared copy wins —
// whatever the other app already holds is what the user set up.

import { readTextFile, writeTextFile, remove, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { setLanguage } from './i18n';
import { restartSidecar } from './sidecar-boot';
import { getSidecar } from './sidecar';
import { resolveSidecarModel } from './chat-models';

const opts = { baseDir: BaseDirectory.Home };
const SETTINGS = '.ava/settings.json';
const AVATAR = '.ava/avatar.dat';
const PERSONALITY = '.ava/personality.json';
const SNAPSHOT_KEY = 'ava-ide-shared-sync';

type Doc = Record<string, unknown>;
type Val = string | null; // canonical JSON, or null for "not set"

interface Ctx { doc: Doc; dirty: boolean }

interface Item {
  id: string;
  /** The sidecar reads this at start: a change from the other app restarts it. */
  sidecar?: boolean;
  local(): Val;
  setLocal(v: Val): void;
  readShared(ctx: Ctx): Promise<Val>;
  writeShared(ctx: Ctx, v: Val): Promise<void>;
}

/** JSON with sorted keys, so the same value always compares equal. */
function canon(v: unknown): Val {
  if (v === undefined || v === null) return null;
  const sort = (x: unknown): unknown => Array.isArray(x)
    ? x.map(sort)
    : x && typeof x === 'object'
      ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])]))
      : x;
  return JSON.stringify(sort(v));
}

const ls = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string | null | undefined) => {
  try { if (v === null || v === undefined || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage off */ }
};
const parse = <T,>(v: Val): T | null => { try { return v === null ? null : JSON.parse(v) as T; } catch { return null; } };

/** An item stored as one field of ~/.ava/settings.json. */
function docItem(id: string, local: () => unknown, setLocal: (v: unknown) => void, sidecar = true): Item {
  return {
    id, sidecar,
    local: () => canon(local()),
    setLocal: (v) => setLocal(parse(v)),
    readShared: async (ctx) => canon(ctx.doc[id]),
    writeShared: async (ctx, v) => {
      if (v === null) delete ctx.doc[id]; else ctx.doc[id] = parse(v);
      ctx.dirty = true;
    },
  };
}

// ── The IDE's settings blob ('ava-ide-settings') — the fields both apps have.
const PREF_FIELDS = ['temperature', 'maxTokens', 'permissionMode', 'autoMemory', 'streamResponses', 'contributeSharedLearning'] as const;
const readPrefs = (): Record<string, unknown> | null => {
  const blob = parse<Record<string, unknown>>(ls('ava-ide-settings'));
  if (!blob) return null;
  const out = Object.fromEntries(PREF_FIELDS.filter((f) => blob[f] !== undefined).map((f) => [f, blob[f]]));
  return Object.keys(out).length ? out : null;
};
const writePrefs = (v: unknown) => {
  const blob = parse<Record<string, unknown>>(ls('ava-ide-settings')) ?? {};
  for (const f of PREF_FIELDS) delete blob[f];
  Object.assign(blob, (v as Record<string, unknown>) ?? {});
  lsSet('ava-ide-settings', JSON.stringify(blob));
};

const ITEMS: Item[] = [
  docItem('language',
    () => ls('ava-ide-language'),
    (v) => setLanguage(typeof v === 'string' ? v : 'auto')),
  docItem('working_hours',
    () => {
      const s = ls('ava-ide-work-start'); const e = ls('ava-ide-work-end');
      return s || e ? { start: Number(s) || 9, end: Number(e) || 17 } : null;
    },
    (v) => {
      const h = v as { start?: number; end?: number } | null;
      lsSet('ava-ide-work-start', h ? String(h.start ?? 9) : null);
      lsSet('ava-ide-work-end', h ? String(h.end ?? 17) : null);
    }),
  docItem('preferences', readPrefs, writePrefs),
  // Same ids in both apps ('provider:model', or a fleet: auto, supernova…).
  // Switched live, as the room picker does — no restart needed.
  docItem('chat_model',
    () => ls('ava-ide-chat-model'),
    (v) => {
      const id = typeof v === 'string' ? v : null;
      lsSet('ava-ide-chat-model', id);
      if (id && getSidecar().isReady) getSidecar().setModel(resolveSidecarModel(id)).catch(() => {});
      window.dispatchEvent(new CustomEvent('ava-ide-model-changed'));
    },
    false),
  // Core's mode ids ('work' — the extension's panel calls it 'code' and maps).
  // The chat page and the mode pill both follow 'ava-mode-changed'.
  docItem('chat_mode',
    () => ls('ava-ide-chat-mode'),
    (v) => {
      lsSet('ava-ide-chat-mode', typeof v === 'string' ? v : null);
      window.dispatchEvent(new CustomEvent('ava-mode-changed'));
    },
    false),
  docItem('local_model',
    () => {
      const baseUrl = ls('ava-ide-local-baseurl');
      if (!baseUrl) return null;
      const models = parse<string[]>(ls('ava-ide-local-models')) ?? [];
      return { baseUrl, modelName: ls('ava-ide-local-model') ?? '', label: ls('ava-ide-local-label') ?? '', models };
    },
    (v) => {
      const m = v as { baseUrl?: string; modelName?: string; label?: string; models?: string[] } | null;
      lsSet('ava-ide-local-baseurl', m?.baseUrl ?? null);
      lsSet('ava-ide-local-model', m?.modelName ?? null);
      lsSet('ava-ide-local-label', m?.label ?? null);
      lsSet('ava-ide-local-models', m?.models?.length ? JSON.stringify(m.models) : null);
    }),
  docItem('embeddings',
    () => {
      const enabled = ls('ava-ide-embeddings-enabled') === '1';
      const model = ls('ava-ide-embeddings-model'); const baseUrl = ls('ava-ide-embeddings-baseurl');
      return enabled || model || baseUrl ? { enabled, model: model ?? '', baseUrl: baseUrl ?? '' } : null;
    },
    (v) => {
      const e = v as { enabled?: boolean; model?: string; baseUrl?: string } | null;
      lsSet('ava-ide-embeddings-enabled', e?.enabled ? '1' : null);
      lsSet('ava-ide-embeddings-model', e?.model || null);
      lsSet('ava-ide-embeddings-baseurl', e?.baseUrl || null);
    }),

  // Your picture — a data URL in ~/.ava/avatar.dat, the extension's file.
  {
    id: 'avatar',
    local: () => canon(ls('ava-ide-user-avatar') || null),
    setLocal: (v) => {
      lsSet('ava-ide-user-avatar', parse<string>(v));
      window.dispatchEvent(new CustomEvent('ava-avatar-changed'));
    },
    readShared: async () => {
      try {
        const d = (await readTextFile(AVATAR, opts)).trim();
        return d.startsWith('data:image/') ? canon(d) : null;
      } catch { return null; }
    },
    writeShared: async (_ctx, v) => {
      const d = parse<string>(v);
      if (d) { await mkdir('.ava', { ...opts, recursive: true }).catch(() => {}); await writeTextFile(AVATAR, d, opts); }
      else await remove(AVATAR, opts).catch(() => { /* already gone */ });
    },
  },

  // Ava's style — ~/.ava/personality.json, read by the sidecar at start.
  {
    id: 'personality',
    sidecar: true,
    local: () => {
      const p = parse<Record<string, unknown>>(ls('ava-ide-personality'));
      return p ? canon({ tone: p.tone, energy: p.energy, style: p.style, description: p.description ?? '' }) : null;
    },
    setLocal: (v) => {
      lsSet('ava-ide-personality', v);
      window.dispatchEvent(new CustomEvent('ava-personality-changed'));
    },
    readShared: async () => {
      try {
        const p = JSON.parse(await readTextFile(PERSONALITY, opts)) as Record<string, unknown>;
        return canon({ tone: p.tone, energy: p.energy, style: p.style, description: p.description ?? '' });
      } catch { return null; }
    },
    writeShared: async (_ctx, v) => {
      const p = parse<Record<string, unknown>>(v);
      if (!p) { await remove(PERSONALITY, opts).catch(() => {}); return; }
      // Identity is locked, as core's savePersonality does it.
      await mkdir('.ava', { ...opts, recursive: true }).catch(() => {});
      await writeTextFile(PERSONALITY, JSON.stringify({ name: 'Ava', pronouns: 'she/her', ...p }, null, 2), opts);
    },
  },
];

async function readDoc(): Promise<Doc> {
  try {
    const d = JSON.parse(await readTextFile(SETTINGS, opts));
    return d && typeof d === 'object' ? d as Doc : {};
  } catch { return {}; }
}

let running: Promise<void> | null = null;

/**
 * Match the IDE's copy and ~/.ava. `prefer` only settles a true clash — the
 * same thing changed in both apps since the last sync: 'shared' when this
 * window has just come into focus (the other app was the one in use),
 * 'local' when it is leaving focus or a save here asks for a push.
 */
export function syncSharedSettings(prefer: 'shared' | 'local' = 'shared'): Promise<void> {
  const run = async () => {
    const ctx: Ctx = { doc: await readDoc(), dirty: false };
    const snap = parse<Record<string, Val>>(ls(SNAPSHOT_KEY)) ?? {};
    let restart = false;
    for (const item of ITEMS) {
      try {
        const L = item.local();
        const S = await item.readShared(ctx);
        const last = snap[item.id];
        if (L === S) { snap[item.id] = L; continue; }
        const take = last === undefined ? (S !== null ? 'shared' : 'local')
          : L === last ? 'shared'
            : S === last ? 'local'
              : prefer;
        if (take === 'shared') {
          item.setLocal(S);
          snap[item.id] = S;
          if (item.sidecar) restart = true;
        } else {
          await item.writeShared(ctx, L);
          snap[item.id] = L;
        }
      } catch { /* one item failing must not stop the rest */ }
    }
    if (ctx.dirty) {
      ctx.doc.schema_version = 1;
      await mkdir('.ava', { ...opts, recursive: true }).catch(() => {});
      await writeTextFile(SETTINGS, JSON.stringify(ctx.doc, null, 2), opts);
    }
    lsSet(SNAPSHOT_KEY, JSON.stringify(snap));
    if (restart) {
      window.dispatchEvent(new CustomEvent('ava-shared-settings-changed'));
      // At boot nothing is running yet — the first start reads the new values.
      if (getSidecar().isReady) restartSidecar();
    }
  };
  // One at a time; a request made during a run queues behind it.
  running = (running ?? Promise.resolve()).then(run, run).catch(() => { /* never throws */ });
  return running;
}

/** Push changes made here straight away (call after a save). */
export function pushSharedSettings(): void {
  void syncSharedSettings('local');
}

/** Focus, blur and a gentle interval — installed once, at boot. */
export function watchSharedSettings(): void {
  window.addEventListener('focus', () => { void syncSharedSettings('shared'); });
  window.addEventListener('blur', () => { void syncSharedSettings('local'); });
  window.setInterval(() => { void syncSharedSettings('local'); }, 15_000);
}
