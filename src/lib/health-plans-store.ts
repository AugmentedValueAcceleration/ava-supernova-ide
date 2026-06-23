// Local-first storage for the IDE's multi-week Health Plans — the
// programs the operator builds on the Planner's Plans tab.
//
// The extension keeps plans in VS Code globalState; the IDE has no such
// store, so each plan is a JSON file under ~/.ava/health/plans/ via
// Tauri fs — the same pattern as the profile / daily plan in
// health-store.ts. Types mirror the extension's HealthPlan shapes.

import { readTextFile, writeTextFile, mkdir, readDir, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
import type { HealthProfile } from './health-store';
import { accountRoot } from './account-scope';

// Account-scoped plans dir — ~/.ava/users/<id>/health/plans when signed in (the
// same files the extension writes), ~/.ava/health/plans for BYOK / no-account.
const plansDir = async (): Promise<string> => `${await accountRoot()}/health/plans`;
const planFile = async (id: string): Promise<string> => `${await plansDir()}/${id}.json`;

// ── Types — mirror of the extension's HealthPlan shapes ───────────────

export type HealthPlanType = 'fitness' | 'meal' | 'combined';
export type HealthPlanSource = 'manual' | 'ava';
export type HealthPlanStatus = 'draft' | 'active' | 'completed' | 'archived';

/** A planned training exercise within a plan day. Links to a catalogue
 *  exercise by slug, or stands alone as a custom entry (ref null). */
export interface HealthPlanExercise {
  id: string;
  ref?: { kind: 'exercise'; slug: string } | null;
  name: string;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  notes: string | null;
}

/** A planned meal within a plan day. A catalogue recipe (ref set)
 *  derives its nutrition from the recipe × `servings`; a custom meal
 *  (ref null) carries hand-entered macros. */
export interface HealthPlanMeal {
  id: string;
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  ref?: { kind: 'recipe'; slug: string } | null;
  name: string;
  servings: number | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
}

export interface HealthPlanDay {
  day_index: number;
  kind: 'training' | 'rest' | 'active_recovery';
  title: string | null;
  training: HealthPlanExercise[];
  meals: HealthPlanMeal[];
  notes: string | null;
}

export interface HealthPlan {
  schema_version: 1;
  id: string;
  type: HealthPlanType;
  title: string;
  goal: string | null;
  source: HealthPlanSource;
  status: HealthPlanStatus;
  duration_days: number;
  start_date: string | null;
  profile_snapshot: HealthProfile | null;
  days: HealthPlanDay[];
  created_at: string;
  updated_at: string | null;
}

/** Lightweight summary for the Plans library grid. */
export interface HealthPlanSummary {
  id: string;
  type: HealthPlanType;
  title: string;
  status: HealthPlanStatus;
  duration_days: number;
  /** Plan start date (YYYY-MM-DD) so the Plans calendar can place it. */
  start_date: string | null;
  source: HealthPlanSource;
  updated_at: string | null;
}

// ── Storage ───────────────────────────────────────────────────────────

function toSummary(p: HealthPlan): HealthPlanSummary {
  return {
    id: p.id, type: p.type, title: p.title, status: p.status,
    duration_days: p.duration_days, start_date: p.start_date, source: p.source, updated_at: p.updated_at,
  };
}

/** Read one plan by id. Null when missing / malformed / unknown schema. */
export async function loadHealthPlan(id: string): Promise<HealthPlan | null> {
  try {
    const raw = await readTextFile(await planFile(id), { baseDir: BaseDirectory.Home });
    const parsed = JSON.parse(raw) as HealthPlan;
    if (parsed && parsed.schema_version === 1) return parsed;
  } catch { /* missing / malformed — fall through */ }
  return null;
}

/** Lightweight summaries for the Plans library, most-recently-touched
 *  first. Derived live from the stored plan files. */
export async function loadHealthPlanIndex(): Promise<HealthPlanSummary[]> {
  let entries: Array<{ name: string }> = [];
  try {
    entries = await readDir(await plansDir(), { baseDir: BaseDirectory.Home });
  } catch {
    return [];
  }
  const out: HealthPlanSummary[] = [];
  for (const e of entries) {
    if (!e.name || !e.name.endsWith('.json')) continue;
    const p = await loadHealthPlan(e.name.slice(0, -'.json'.length));
    if (p) out.push(toSummary(p));
  }
  return out.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
}

/** Upsert a plan, stamping updated_at. Activating a plan archives any
 *  other active plan of the same type — one active plan per type feeds
 *  the daily dashboard. Returns the refreshed library index. */
export async function saveHealthPlan(plan: HealthPlan): Promise<HealthPlanSummary[]> {
  await mkdir(await plansDir(), { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  const now = new Date().toISOString();
  if (plan.status === 'active') {
    const index = await loadHealthPlanIndex();
    for (const other of index) {
      if (other.id === plan.id || other.type !== plan.type || other.status !== 'active') continue;
      const full = await loadHealthPlan(other.id);
      if (full) {
        await writeTextFile(
          await planFile(other.id),
          JSON.stringify({ ...full, status: 'archived', updated_at: now }, null, 2),
          { baseDir: BaseDirectory.Home },
        );
      }
    }
  }
  const next: HealthPlan = { ...plan, schema_version: 1, updated_at: now };
  await writeTextFile(await planFile(next.id), JSON.stringify(next, null, 2), { baseDir: BaseDirectory.Home });
  return loadHealthPlanIndex();
}

/** Delete a plan. Returns the refreshed library index. */
export async function deleteHealthPlan(id: string): Promise<HealthPlanSummary[]> {
  try {
    await remove(await planFile(id), { baseDir: BaseDirectory.Home });
  } catch { /* already gone */ }
  return loadHealthPlanIndex();
}
