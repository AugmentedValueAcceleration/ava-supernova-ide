// Local-first learning store for the IDE.
//
// Personal learning (the user's curriculums + their progress) lives in
// ~/.ava/learning.json — the SAME file the CLI and the extension use, the same
// one @ava/core reads + writes. The IDE reads and writes it directly via the
// Tauri fs plugin (mirroring shared-config.ts for config.json), so learning
// works with NO account and NO connection. Cloud sync is additive — handled by
// @ava/core when the user is signed in — never a requirement.
//
// The curated *library catalogue* (/learning/library) stays remote on purpose:
// that's a catalogue you browse and fork from, not your own data. Forking
// copies a course into this local store.

import { readTextFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

const LEARNING_PATH = '.ava/learning.json';

// The store is loosely typed — it's the same JSON @ava/core owns; we only
// touch the fields the player needs.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Read the user's curriculums from the local store. Local-first: returns an
 *  empty list (not an error) when the file is missing or unreadable. */
export async function readLocalLearning(): Promise<any[]> {
  try {
    const raw = await readTextFile(LEARNING_PATH, { baseDir: BaseDirectory.Home });
    const store = JSON.parse(raw);
    return Array.isArray(store?.curriculums) ? store.curriculums : [];
  } catch {
    return [];
  }
}

/** Persist the curriculums array back to the local store, preserving any other
 *  top-level fields (streaks etc.) @ava/core keeps there. */
async function writeLocalCurriculums(curriculums: any[]): Promise<void> {
  let store: any = { curriculums: [] };
  try {
    store = JSON.parse(await readTextFile(LEARNING_PATH, { baseDir: BaseDirectory.Home }));
  } catch { /* fresh store */ }
  store.curriculums = curriculums;
  await writeTextFile(LEARNING_PATH, JSON.stringify(store, null, 2), { baseDir: BaseDirectory.Home });
}

function locateLesson(curriculums: any[], curriculumId: string, lessonId: string): any {
  const curr = curriculums.find((c) => c?.id === curriculumId);
  for (const mod of curr?.modules ?? []) {
    const lesson = (mod.lessons ?? []).find((l: any) => l?.id === lessonId);
    if (lesson) return lesson;
  }
  return null;
}

function recalcProgress(curr: any): void {
  for (const mod of curr.modules ?? []) {
    const lessons = mod.lessons ?? [];
    if (lessons.length === 0) continue;
    const done = lessons.filter((l: any) => l.status === 'completed').length;
    mod.progress_percent = Math.round((done / lessons.length) * 100);
    if (mod.progress_percent === 100) mod.status = 'completed';
    else if (done > 0 || lessons.some((l: any) => l.status === 'in_progress')) {
      mod.status = mod.status === 'locked' ? 'locked' : 'in_progress';
    }
  }
  const mods = curr.modules ?? [];
  if (mods.length > 0) {
    curr.progress_percent = Math.round(
      mods.reduce((s: number, m: any) => s + (m.progress_percent ?? 0), 0) / mods.length,
    );
    if (curr.progress_percent === 100) curr.status = 'completed';
  }
}

/** Save one interactive step's progress (status + the learner's last answer) to
 *  the local store, so returning resumes and @ava/core sees it next turn. */
export async function saveStepProgress(
  curriculumId: string,
  lessonId: string,
  stepId: string,
  status: 'attempted' | 'mastered',
  lastAttempt: string | null,
): Promise<void> {
  try {
    const curriculums = await readLocalLearning();
    const lesson = locateLesson(curriculums, curriculumId, lessonId);
    const step = lesson?.steps?.find((s: any) => s?.id === stepId);
    if (!step) return;
    step.status = status;
    step.attempts = (step.attempts ?? 0) + 1;
    step.last_attempt = lastAttempt;
    if (lesson.status === 'not_started') {
      lesson.status = 'in_progress';
      lesson.started_at = lesson.started_at ?? new Date().toISOString();
    }
    await writeLocalCurriculums(curriculums);
  } catch { /* best-effort — never block the lesson */ }
}

/** Mark a lesson complete + recompute progress in the local store. Returns the
 *  updated curriculums so the UI can refresh its bars + ticks. */
export async function saveLessonComplete(
  curriculumId: string,
  lessonId: string,
  score: number,
): Promise<any[]> {
  try {
    const curriculums = await readLocalLearning();
    const curr = curriculums.find((c) => c?.id === curriculumId);
    const lesson = locateLesson(curriculums, curriculumId, lessonId);
    if (curr && lesson) {
      lesson.status = 'completed';
      lesson.score = score;
      lesson.best_score = Math.max(lesson.best_score ?? 0, score);
      lesson.completed_at = new Date().toISOString();
      recalcProgress(curr);
      await writeLocalCurriculums(curriculums);
    }
    return curriculums;
  } catch {
    return [];
  }
}
