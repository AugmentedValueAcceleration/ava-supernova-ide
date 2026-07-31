// The training log — what actually HAPPENED, as opposed to what the plan asked
// for.
//
// Implements core's `GymSessionStore` contract over Tauri fs. The extension
// implements the same contract over Node fs and the companion over its own
// storage, so "same Ava, same memory" holds across all three rather than each
// surface knowing a different half of the week. The contract is the thing that
// makes that true — not a convention someone has to remember.
//
// One file per session rather than one per date: a plan day and a freestyle
// drop-in on the same date are two sessions, and folding them into one file
// would silently lose whichever was written second.
//
// Small local JSON is read whole rather than indexed. A year of training is a
// few hundred files, and reading them beats maintaining an index that can drift
// out of step with what is actually on disk — an index that lies is worse than
// no index, because nothing downstream can tell.

import { readTextFile, writeTextFile, mkdir, readDir, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
// session-types, NOT the ./health barrel — the barrel pulls in node-store.js.
import type { GymSession } from '@ava/core/health/session-types';
import { accountRoot } from './account-scope';

/** Account-scoped, exactly like plans — ~/.ava/users/<id>/health/sessions when
 *  signed in (the same files the extension writes), ~/.ava/health/sessions for
 *  BYOK / no-account. */
const sessionsDir = async (): Promise<string> => `${await accountRoot()}/health/sessions`;
const sessionFile = async (id: string): Promise<string> => `${await sessionsDir()}/${id}.json`;

/** Summary rows for a range, newest first — the shape core's list() returns. */
export interface GymSessionSummaryRow {
  id: string;
  date: string;
  status: GymSession['status'];
  title: string | null;
  exercise_count: number;
  set_count: number;
}

async function readAll(): Promise<GymSession[]> {
  let entries;
  try {
    entries = await readDir(await sessionsDir(), { baseDir: BaseDirectory.Home });
  } catch {
    return []; // no directory yet — nothing logged, not an error
  }
  const out: GymSession[] = [];
  for (const e of entries) {
    if (!e.name?.endsWith('.json')) continue;
    try {
      const raw = await readTextFile(`${await sessionsDir()}/${e.name}`, { baseDir: BaseDirectory.Home });
      const s = JSON.parse(raw) as GymSession;
      // Version-gate on read. A file from a future schema is skipped rather
      // than half-parsed into something that looks like a session and is not.
      if (s && s.schema_version === 1) out.push(s);
    } catch {
      // One unreadable file must not take the whole log with it.
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Every session, newest first. The calendar needs the whole log rather than a
 *  range — a month view can straddle two and asking twice reads the directory
 *  twice for no gain. */
export async function listAllSessions(): Promise<GymSession[]> {
  return readAll();
}

/** Sessions in a date range, newest first. Both bounds inclusive, ISO dates. */
export async function listSessions(from: string, to: string): Promise<GymSessionSummaryRow[]> {
  const all = await readAll();
  return all
    .filter(s => s.date >= from && s.date <= to)
    .map(s => ({
      id: s.id,
      date: s.date,
      status: s.status,
      title: s.title,
      exercise_count: s.exercises.length,
      set_count: s.exercises.reduce((n, e) => n + e.sets.length, 0),
    }));
}

/** One session in full — every exercise and every set. */
export async function getSession(id: string): Promise<GymSession | null> {
  try {
    const raw = await readTextFile(await sessionFile(id), { baseDir: BaseDirectory.Home });
    const s = JSON.parse(raw) as GymSession;
    return s && s.schema_version === 1 ? s : null;
  } catch {
    return null;
  }
}

/** The sessions for a date. Plural on purpose — a plan day and a freestyle
 *  drop-in on the same date are two separate records, and the caller decides
 *  which it means rather than the store guessing. */
export async function sessionsForDate(date: string): Promise<GymSession[]> {
  return (await readAll()).filter(s => s.date === date);
}

/** Create or replace. The caller owns id generation and timestamps so this
 *  stays a store rather than a half-model. */
export async function saveSession(session: GymSession): Promise<void> {
  await mkdir(await sessionsDir(), { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(await sessionFile(session.id), JSON.stringify(session, null, 2), { baseDir: BaseDirectory.Home });
}

export async function deleteSession(id: string): Promise<void> {
  await remove(await sessionFile(id), { baseDir: BaseDirectory.Home }).catch(() => {});
}
