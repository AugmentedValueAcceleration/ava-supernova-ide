// Local-first task store for the IDE.
//
// Personal tasks live in the SAME files @ava/core owns and the CLI + extension
// read: the global store at ~/.ava/tasks.json and the per-workspace store at
// <workspace>/.ava/tasks.json. The IDE reads and writes them directly via the
// Tauri fs plugin (mirroring learning-store.ts), so tasks work with NO account
// and NO connection. Cloud sync is additive — opt-in, handled at the platform
// layer when the user enables it — never a requirement.
//
// Store shape matches @ava/core's TaskManager: { version, lastModified, entries[] }.

import { readTextFile, writeTextFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

/** A task entry — the subset of @ava/core's TaskEntry the IDE touches. */
export interface LocalTask {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  dueDate?: string;
  category: string;
  source: string;
  project: string;
  recurrence: string;
  subtasks: { id: string; title: string; done: boolean }[];
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
  recurrence?: string;
}

interface TaskStore {
  version: number;
  lastModified: string;
  entries: LocalTask[];
}

const GLOBAL_REL = '.ava/tasks.json';

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
  return { version: 1, lastModified: new Date().toISOString(), entries: [] };
}

function parseEntries(raw: string): LocalTask[] {
  try {
    const store = JSON.parse(raw);
    return Array.isArray(store?.entries) ? store.entries : [];
  } catch {
    return [];
  }
}

// ── Global store (~/.ava/tasks.json) ────────────────────────────────────────

async function readGlobal(): Promise<LocalTask[]> {
  try {
    return parseEntries(await readTextFile(GLOBAL_REL, { baseDir: BaseDirectory.Home }));
  } catch {
    return [];
  }
}

async function writeGlobal(entries: LocalTask[]): Promise<void> {
  let store: TaskStore = emptyStore();
  try {
    store = JSON.parse(await readTextFile(GLOBAL_REL, { baseDir: BaseDirectory.Home }));
  } catch { /* fresh store */ }
  store.entries = entries;
  store.lastModified = new Date().toISOString();
  if (typeof store.version !== 'number') store.version = 1;
  await mkdir('.ava', { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(GLOBAL_REL, JSON.stringify(store, null, 2), { baseDir: BaseDirectory.Home });
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
  if (typeof store.version !== 'number') store.version = 1;
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
    // Neutral default — not everyone uses Ava to build software.
    category: input.category || 'personal',
    source: 'user',
    project: folder ? (folder.split(/[/\\]/).pop() || 'global') : 'global',
    recurrence: input.recurrence || 'none',
    subtasks: [],
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

/** Toggle a task done/undone in whichever store holds it. */
export async function toggleLocalTask(id: string): Promise<void> {
  const flip = (t: LocalTask) => {
    const now = new Date().toISOString();
    if (t.status === 'done') {
      t.status = 'todo';
      t.completedAt = undefined;
    } else {
      t.status = 'done';
      t.completedAt = now;
    }
    t.updatedAt = now;
  };

  const proj = await readProject();
  const pEntry = proj.find(t => t.id === id);
  if (pEntry) {
    flip(pEntry);
    await writeProject(proj);
    return;
  }
  const glob = await readGlobal();
  const gEntry = glob.find(t => t.id === id);
  if (gEntry) {
    flip(gEntry);
    await writeGlobal(glob);
  }
}
