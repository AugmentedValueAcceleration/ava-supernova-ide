// Local-first journal store for the IDE.
//
// Journal entries live in the SAME per-day files @ava/core owns and the CLI +
// extension read: the global store at ~/.ava/journal/YYYY-MM-DD.json and the
// per-workspace store at <workspace>/.ava/journal/YYYY-MM-DD.json. The IDE
// reads and writes them directly via the Tauri fs plugin (mirroring
// task-store.ts), so the journal works with NO account and NO connection.
// There is no cloud sync — the journal is local-only; transfer/backup is
// handled by the export/portability system.
//
// The migrateDay() helper and kind registry mirror @ava/core's journal/types.
// The IDE webview can't import the node-heavy core barrel, so the pure pieces
// are duplicated here — the on-disk SHAPE is the contract both surfaces share.

import { readTextFile, writeTextFile, mkdir, readDir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export type JournalAuthor = 'user' | 'ava';

export interface JournalEntry {
  id: string;
  author: JournalAuthor;
  kind: string;
  title?: string;
  content: string;
  mood?: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JournalMonthEntry extends JournalEntry {
  date: string;
}

export interface JournalKind {
  id: string;
  label: string;
  color: string;
  tracksMood: boolean;
  builtin: boolean;
}

export interface JournalSearchHit {
  date: string;
  entryId: string;
  author: JournalAuthor;
  kind: string;
  title?: string;
  snippet: string;
}

// Mirrors @ava/core BUILTIN_KINDS — keep colours/flags in sync.
export const BUILTIN_KINDS: JournalKind[] = [
  { id: 'personal', label: 'Personal', color: '#a855f7', tracksMood: true, builtin: true },
  { id: 'feeling', label: 'Feeling', color: '#34d399', tracksMood: true, builtin: true },
  { id: 'idea', label: 'Idea', color: '#f59e0b', tracksMood: false, builtin: true },
  { id: 'business', label: 'Business', color: '#3b82f6', tracksMood: false, builtin: true },
  { id: 'observation', label: 'Observation', color: '#94a3b8', tracksMood: false, builtin: true },
];
const DEFAULT_USER_KIND = 'personal';
const DEFAULT_AVA_KIND = 'observation';

/** Preset swatches offered when creating a custom kind. */
export const KIND_COLORS = ['#a855f7', '#34d399', '#f59e0b', '#3b82f6', '#ef4444', '#ec4899', '#14b8a6', '#eab308', '#8b5cf6', '#06b6d4'];

export function kindOf(kinds: JournalKind[], id: string): JournalKind {
  return kinds.find((k) => k.id === id) ?? { id, label: id, color: '#6b7280', tracksMood: false, builtin: false };
}

interface JournalDay {
  version: 2;
  date: string;
  entries: JournalEntry[];
}

/** Migrate a raw on-disk day (legacy v1 or v2) to v2. Mirrors @ava/core. */
export function migrateDay(raw: any, date: string): JournalDay {
  if (raw && raw.version === 2 && Array.isArray(raw.entries)) {
    return { version: 2, date: raw.date ?? date, entries: raw.entries };
  }
  const d = raw?.date ?? date;
  const entries: JournalEntry[] = [];
  if (raw?.userEntry) {
    const u = raw.userEntry;
    const created = u.createdAt ?? `${d}T00:00:00.000Z`;
    entries.push({ id: `v1-${d}-user`, author: 'user', kind: DEFAULT_USER_KIND, content: u.content ?? '', mood: u.mood, tags: u.tags, createdAt: created, updatedAt: u.updatedAt ?? created });
  }
  if (raw?.avaEntry) {
    const a = raw.avaEntry;
    const created = a.createdAt ?? `${d}T00:00:01.000Z`;
    entries.push({ id: `v1-${d}-ava`, author: 'ava', kind: DEFAULT_AVA_KIND, content: a.content ?? '', tags: a.tags, createdAt: created, updatedAt: a.updatedAt ?? created });
  }
  return { version: 2, date: d, entries };
}

function newId(): string {
  return crypto.randomUUID();
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function projectFolder(): string | null {
  try {
    const f = localStorage.getItem('ava-ide-project-folder');
    return f && f !== '.' ? f : null;
  } catch {
    return null;
  }
}

const GLOBAL_DIR = '.ava/journal';
const globalRel = (date: string) => `${GLOBAL_DIR}/${date}.json`;

async function projectDir(): Promise<string | null> {
  const folder = projectFolder();
  if (!folder) return null;
  try {
    return await join(folder, '.ava', 'journal');
  } catch {
    return null;
  }
}

// ── Read a single day file from a scope ───────────────────────────────────────

async function readGlobalDay(date: string): Promise<JournalDay> {
  try {
    return migrateDay(JSON.parse(await readTextFile(globalRel(date), { baseDir: BaseDirectory.Home })), date);
  } catch {
    return { version: 2, date, entries: [] };
  }
}

async function readProjectDay(date: string): Promise<JournalDay> {
  const dir = await projectDir();
  if (!dir) return { version: 2, date, entries: [] };
  try {
    return migrateDay(JSON.parse(await readTextFile(await join(dir, `${date}.json`))), date);
  } catch {
    return { version: 2, date, entries: [] };
  }
}

async function writeGlobalDay(day: JournalDay): Promise<void> {
  await mkdir(GLOBAL_DIR, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(globalRel(day.date), JSON.stringify(day, null, 2), { baseDir: BaseDirectory.Home });
}

async function writeProjectDay(day: JournalDay): Promise<boolean> {
  const folder = projectFolder();
  const dir = await projectDir();
  if (!folder || !dir) return false;
  try {
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeTextFile(await join(dir, `${day.date}.json`), JSON.stringify(day, null, 2));
    return true;
  } catch {
    return false;
  }
}

// ── Dates present in each scope ───────────────────────────────────────────────

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

async function globalDates(): Promise<string[]> {
  try {
    const entries = await readDir(GLOBAL_DIR, { baseDir: BaseDirectory.Home });
    return entries.map((e) => DATE_RE.exec(e.name ?? '')?.[1]).filter((d): d is string => !!d);
  } catch {
    return [];
  }
}

async function projectDates(): Promise<string[]> {
  const dir = await projectDir();
  if (!dir) return [];
  try {
    const entries = await readDir(dir);
    return entries.map((e) => DATE_RE.exec(e.name ?? '')?.[1]).filter((d): d is string => !!d);
  } catch {
    return [];
  }
}

async function allDates(): Promise<string[]> {
  const [g, p] = await Promise.all([globalDates(), projectDates()]);
  return [...new Set([...g, ...p])].sort();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Merged entries for a day (global + project, union by id), oldest first. */
export async function readDay(date: string): Promise<JournalEntry[]> {
  const [g, p] = await Promise.all([readGlobalDay(date), readProjectDay(date)]);
  const byId = new Map<string, JournalEntry>();
  for (const e of g.entries) byId.set(e.id, e);
  for (const e of p.entries) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** All entries for a calendar month (1-12), annotated with their date. */
export async function readMonth(year: number, month: number): Promise<JournalMonthEntry[]> {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const dates = (await allDates()).filter((d) => d.startsWith(prefix));
  const out: JournalMonthEntry[] = [];
  for (const date of dates) {
    for (const e of await readDay(date)) out.push({ ...e, date });
  }
  return out.sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
}

export interface JournalDaySummary {
  date: string;
  count: number;
  avgMood?: number;
}

/** Per-day summaries for a whole year — drives the heatmap. */
export async function readYearSummaries(year: number): Promise<JournalDaySummary[]> {
  const prefix = `${year}-`;
  const dates = (await allDates()).filter((d) => d.startsWith(prefix));
  const out: JournalDaySummary[] = [];
  for (const date of dates) {
    const entries = await readDay(date);
    if (!entries.length) continue;
    const moods = entries.map((e) => e.mood).filter((m): m is number => typeof m === 'number');
    out.push({ date, count: entries.length, avgMood: moods.length ? moods.reduce((s, m) => s + m, 0) / moods.length : undefined });
  }
  return out;
}

/** Add a new entry (defaults to the global store). */
export async function addEntry(date: string, input: { author: JournalAuthor; kind: string; content: string; title?: string; mood?: number; tags?: string[] }): Promise<void> {
  const day = await readGlobalDay(date);
  const now = new Date().toISOString();
  day.entries.push({
    id: newId(),
    author: input.author,
    kind: input.kind,
    title: input.title?.trim() || undefined,
    content: input.content,
    mood: input.mood,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
  });
  await writeGlobalDay(day);
}

/** Update an entry by id (searches global then project). */
export async function updateEntry(date: string, id: string, patch: { kind?: string; title?: string; content?: string; mood?: number | null; tags?: string[] }): Promise<void> {
  const apply = (day: JournalDay): boolean => {
    const e = day.entries.find((x) => x.id === id);
    if (!e) return false;
    if (patch.kind !== undefined) e.kind = patch.kind;
    if (patch.title !== undefined) e.title = patch.title.trim() || undefined;
    if (patch.content !== undefined) e.content = patch.content;
    if (patch.mood !== undefined) e.mood = patch.mood ?? undefined;
    if (patch.tags !== undefined) e.tags = patch.tags;
    e.updatedAt = new Date().toISOString();
    return true;
  };
  const g = await readGlobalDay(date);
  if (apply(g)) { await writeGlobalDay(g); return; }
  const p = await readProjectDay(date);
  if (apply(p)) { await writeProjectDay(p); }
}

/** Delete an entry by id (searches global then project). */
export async function deleteEntry(date: string, id: string): Promise<void> {
  const g = await readGlobalDay(date);
  if (g.entries.some((e) => e.id === id)) {
    g.entries = g.entries.filter((e) => e.id !== id);
    await writeGlobalDay(g);
    return;
  }
  const p = await readProjectDay(date);
  if (p.entries.some((e) => e.id === id)) {
    p.entries = p.entries.filter((e) => e.id !== id);
    await writeProjectDay(p);
  }
}

/** Substring search across entries (most recent year), with optional filters. */
export async function searchJournal(query: string, filters?: { kind?: string; author?: JournalAuthor }): Promise<JournalSearchHit[]> {
  const lower = query.toLowerCase();
  const dates = (await allDates()).reverse().slice(0, 365);
  const hits: JournalSearchHit[] = [];
  for (const date of dates) {
    for (const e of await readDay(date)) {
      if (filters?.kind && e.kind !== filters.kind) continue;
      if (filters?.author && e.author !== filters.author) continue;
      const hay = `${e.title ?? ''}\n${e.content}`.toLowerCase();
      const idx = hay.indexOf(lower);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 40);
      const end = Math.min(hay.length, idx + lower.length + 40);
      hits.push({ date, entryId: e.id, author: e.author, kind: e.kind, title: e.title, snippet: hay.slice(start, end) });
    }
  }
  return hits;
}

const KINDS_REL = `${GLOBAL_DIR}/kinds.json`;

async function readCustomKinds(): Promise<JournalKind[]> {
  try {
    const raw = JSON.parse(await readTextFile(KINDS_REL, { baseDir: BaseDirectory.Home }));
    return Array.isArray(raw?.kinds) ? raw.kinds.map((k: any) => ({ ...k, builtin: false })) : [];
  } catch {
    return [];
  }
}

async function writeCustomKinds(kinds: JournalKind[]): Promise<void> {
  await mkdir(GLOBAL_DIR, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(KINDS_REL, JSON.stringify({ version: 1, kinds }, null, 2), { baseDir: BaseDirectory.Home });
}

/** Custom kinds persisted at ~/.ava/journal/kinds.json, merged with built-ins. */
export async function listKinds(): Promise<JournalKind[]> {
  const custom = await readCustomKinds();
  const builtinIds = new Set(BUILTIN_KINDS.map((k) => k.id));
  return [...BUILTIN_KINDS, ...custom.filter((k) => !builtinIds.has(k.id))];
}

/** Add a user-defined kind. Returns the full updated list. */
export async function addKind(input: { id: string; label: string; color: string; tracksMood: boolean }): Promise<JournalKind[]> {
  const id = input.id.trim().toLowerCase().replace(/\s+/g, '-');
  if (!id) throw new Error('Kind id is required');
  if (BUILTIN_KINDS.some((k) => k.id === id)) throw new Error(`"${id}" is a built-in kind`);
  const custom = await readCustomKinds();
  if (custom.some((k) => k.id === id)) throw new Error(`Kind "${id}" already exists`);
  custom.push({ id, label: input.label.trim() || id, color: input.color, tracksMood: input.tracksMood, builtin: false });
  await writeCustomKinds(custom);
  return listKinds();
}

/** Delete a user-defined kind (built-ins are read-only). Existing entries keep their kind id. */
export async function deleteKind(id: string): Promise<JournalKind[]> {
  if (BUILTIN_KINDS.some((k) => k.id === id)) throw new Error(`"${id}" is a built-in kind`);
  await writeCustomKinds((await readCustomKinds()).filter((k) => k.id !== id));
  return listKinds();
}
