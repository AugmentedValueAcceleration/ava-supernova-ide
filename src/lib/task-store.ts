// Local-first task store for the IDE.
//
// Personal tasks live in the SAME files @ava/core's TaskManager owns and the
// extension reads: the account-scoped global store at
// ~/.ava/users/<id>/tasks/tasks.json (or ~/.ava/tasks/tasks.json with no
// account) and the per-workspace store at <workspace>/.ava/tasks.json. The IDE
// reads/writes them directly via the Tauri fs plugin, so tasks work with NO
// account and NO connection. Cloud sync is additive — opt-in — never required.
//
// Store shape matches @ava/core's TaskManager: { version, lastModified, entries[] }.
// The global store lives in a dedicated tasks/ subfolder (mirrors creative/) so
// the panel's "Open save folder" button has a clean target.

import { readTextFile, writeTextFile, mkdir, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
import { join, homeDir } from '@tauri-apps/api/path';
import { accountRoot } from './account-scope';

/** A subtask within a task. */
export interface LocalSubtask { id: string; title: string; done: boolean }

/** Where a task came from — provenance. */
export interface LocalTaskContext { kind: 'chat' | 'file' | 'plan' | 'lesson' | 'other'; ref: string; label?: string }

/** A task entry — the subset of @ava/core's TaskEntry the IDE touches. */
export interface LocalTask {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  dueDate?: string;
  dueTime?: string;
  category: string;
  source: string;
  project: string;
  recurrence: string;
  subtasks: LocalSubtask[];
  reminderLead?: number;
  reminderFiredAt?: string;
  context?: LocalTaskContext;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** Input for a manually created task from the panel quick-add. */
export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: string;
  category?: string;
  due_date?: string;
  due_time?: string;
  recurrence?: string;
  reminder_lead?: number;
  subtasks?: string[];
}

/** Fields the detail editor can change. */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: string;
  category?: string;
  due_date?: string;
  due_time?: string;
  recurrence?: string;
  reminder_lead?: number;
}

interface TaskStore {
  version: number;
  lastModified: string;
  entries: LocalTask[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The open workspace folder, or null when none is open (global-only). */
function projectFolder(): string | null {
  try {
    const f = localStorage.getItem('ava-ide-project-folder');
    return f && f !== '.' ? f : null;
  } catch {
    return null;
  }
}

function emptyStore(): TaskStore {
  return { version: 2, lastModified: new Date().toISOString(), entries: [] };
}

function parseEntries(raw: string): LocalTask[] {
  try {
    const store = JSON.parse(raw);
    return Array.isArray(store?.entries) ? store.entries : [];
  } catch {
    return [];
  }
}

// ── Global store (~/.ava/users/<id>/tasks/tasks.json) ───────────────────────

/** Home-relative path to the account-scoped global task file. */
async function globalRel(): Promise<string> {
  return `${await accountRoot()}/tasks/tasks.json`;
}

/** One-time move of a legacy flat <root>/tasks.json into <root>/tasks/. */
async function migrateGlobal(): Promise<void> {
  const root = await accountRoot();
  const oldRel = `${root}/tasks.json`;
  const newRel = `${root}/tasks/tasks.json`;
  try {
    const raw = await readTextFile(oldRel, { baseDir: BaseDirectory.Home });
    // Old file exists. Only move if the new one isn't there yet.
    try {
      await readTextFile(newRel, { baseDir: BaseDirectory.Home });
      return; // new already exists — leave the old one
    } catch { /* new missing — proceed */ }
    await mkdir(`${root}/tasks`, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
    await writeTextFile(newRel, raw, { baseDir: BaseDirectory.Home });
    await remove(oldRel, { baseDir: BaseDirectory.Home }).catch(() => {});
  } catch { /* no legacy file — nothing to migrate */ }
}

async function readGlobal(): Promise<LocalTask[]> {
  await migrateGlobal();
  try {
    return parseEntries(await readTextFile(await globalRel(), { baseDir: BaseDirectory.Home }));
  } catch {
    return [];
  }
}

async function writeGlobal(entries: LocalTask[]): Promise<void> {
  const root = await accountRoot();
  const rel = await globalRel();
  let store: TaskStore = emptyStore();
  try {
    store = JSON.parse(await readTextFile(rel, { baseDir: BaseDirectory.Home }));
  } catch { /* fresh store */ }
  store.entries = entries;
  store.lastModified = new Date().toISOString();
  store.version = 2;
  await mkdir(`${root}/tasks`, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(rel, JSON.stringify(store, null, 2), { baseDir: BaseDirectory.Home });
}

// ── Project store (<workspace>/.ava/tasks.json) ─────────────────────────────

async function projectStorePath(): Promise<string | null> {
  const folder = projectFolder();
  if (!folder) return null;
  try {
    return await join(folder, '.ava', 'tasks.json');
  } catch {
    return null;
  }
}

async function readProject(): Promise<LocalTask[]> {
  const path = await projectStorePath();
  if (!path) return [];
  try {
    return parseEntries(await readTextFile(path));
  } catch {
    return [];
  }
}

async function writeProject(entries: LocalTask[]): Promise<boolean> {
  const folder = projectFolder();
  const path = await projectStorePath();
  if (!folder || !path) return false;
  let store: TaskStore = emptyStore();
  try {
    store = JSON.parse(await readTextFile(path));
  } catch { /* fresh store */ }
  store.entries = entries;
  store.lastModified = new Date().toISOString();
  store.version = 2;
  try {
    await mkdir(await join(folder, '.ava'), { recursive: true }).catch(() => {});
    await writeTextFile(path, JSON.stringify(store, null, 2));
    return true;
  } catch {
    return false;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/** All non-archived tasks from both stores (global + workspace). Local-first:
 *  returns [] (not an error) when the files are missing or unreadable. */
export async function readLocalTasks(): Promise<LocalTask[]> {
  const [g, p] = await Promise.all([readGlobal(), readProject()]);
  return [...g, ...p].filter(t => t.status !== 'archived');
}

/** Create a task in the local store. Defaults to the workspace store when a
 *  folder is open (so it travels with the project, like @ava/core), else the
 *  global store. Always source 'user'. */
export async function createLocalTask(input: CreateTaskInput): Promise<void> {
  const now = new Date().toISOString();
  const folder = projectFolder();
  const entry: LocalTask = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    priority: input.priority || 'medium',
    status: 'todo',
    dueDate: input.due_date,
    dueTime: input.due_time,
    // Neutral default — not everyone uses Ava to build software.
    category: input.category || 'personal',
    source: 'user',
    project: folder ? (folder.split(/[/\\]/).pop() || 'global') : 'global',
    recurrence: input.recurrence || 'none',
    subtasks: (input.subtasks ?? []).map(title => ({ id: crypto.randomUUID(), title, done: false })),
    reminderLead: input.reminder_lead,
    createdAt: now,
    updatedAt: now,
  };

  if (folder) {
    const entries = await readProject();
    entries.push(entry);
    if (await writeProject(entries)) return;
  }
  const entries = await readGlobal();
  entries.push(entry);
  await writeGlobal(entries);
}

/** Find which store (project | global) holds a task, mutate it, persist. */
async function mutateTask(id: string, mutate: (t: LocalTask) => void): Promise<void> {
  const proj = await readProject();
  const pEntry = proj.find(t => t.id === id);
  if (pEntry) {
    mutate(pEntry);
    pEntry.updatedAt = new Date().toISOString();
    await writeProject(proj);
    return;
  }
  const glob = await readGlobal();
  const gEntry = glob.find(t => t.id === id);
  if (gEntry) {
    mutate(gEntry);
    gEntry.updatedAt = new Date().toISOString();
    await writeGlobal(glob);
  }
}

/** Toggle a task done/undone in whichever store holds it. */
export async function toggleLocalTask(id: string): Promise<void> {
  await mutateTask(id, (t) => {
    const now = new Date().toISOString();
    if (t.status === 'done') { t.status = 'todo'; t.completedAt = undefined; }
    else { t.status = 'done'; t.completedAt = now; }
  });
}

/** Toggle one subtask's done state. */
export async function toggleLocalSubtask(taskId: string, subtaskId: string): Promise<void> {
  await mutateTask(taskId, (t) => {
    t.subtasks = (t.subtasks ?? []).map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
  });
}

/** Apply detail-editor changes. Moving the due date/time re-arms the reminder. */
export async function updateLocalTask(id: string, u: UpdateTaskInput): Promise<void> {
  await mutateTask(id, (t) => {
    const timingChanged =
      (u.due_date !== undefined && u.due_date !== t.dueDate) ||
      (u.due_time !== undefined && u.due_time !== t.dueTime) ||
      (u.reminder_lead !== undefined && u.reminder_lead !== t.reminderLead);
    if (u.title !== undefined) t.title = u.title;
    if (u.description !== undefined) t.description = u.description;
    if (u.priority !== undefined) t.priority = u.priority;
    if (u.category !== undefined) t.category = u.category;
    if (u.due_date !== undefined) t.dueDate = u.due_date || undefined;
    if (u.due_time !== undefined) t.dueTime = u.due_time || undefined;
    if (u.recurrence !== undefined) t.recurrence = u.recurrence;
    if (u.reminder_lead !== undefined) t.reminderLead = u.reminder_lead >= 0 ? u.reminder_lead : undefined;
    if (timingChanged) t.reminderFiredAt = undefined;
  });
}

// ── Reminders (webview-side scheduler reads/writes these) ────────────────────

/** Wall-clock fire time (epoch ms) for a task's reminder, or null. Date-only
 *  tasks default to 09:00 local. Mirrors @ava/core's reminderFireTimeMs. */
export function localReminderFireMs(t: LocalTask): number | null {
  if (t.reminderLead === undefined || t.reminderLead < 0 || !t.dueDate) return null;
  const time = t.dueTime && /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : '09:00';
  const dueMs = new Date(`${t.dueDate}T${time}:00`).getTime();
  if (Number.isNaN(dueMs)) return null;
  return dueMs - t.reminderLead * 60_000;
}

/** Reminders due to fire now and not yet fired (caps catch-up at 24h). */
export async function getDueLocalReminders(nowMs: number = Date.now()): Promise<LocalTask[]> {
  const all = await readLocalTasks();
  const DAY = 24 * 60 * 60_000;
  return all.filter(t => {
    if (t.status === 'done' || t.reminderFiredAt) return false;
    const fire = localReminderFireMs(t);
    if (fire === null || nowMs < fire) return false;
    const time = t.dueTime && /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : '09:00';
    const dueMs = new Date(`${t.dueDate}T${time}:00`).getTime();
    return !Number.isNaN(dueMs) && nowMs <= dueMs + DAY;
  });
}

/** Stamp a task's reminder as fired (dedupe). */
export async function markLocalReminderFired(id: string): Promise<void> {
  await mutateTask(id, (t) => { t.reminderFiredAt = new Date().toISOString(); });
}

/** Absolute path to the account-scoped tasks folder (for the open-folder button). */
export async function tasksFolderPath(): Promise<string> {
  return join(await homeDir(), `${await accountRoot()}/tasks`);
}
