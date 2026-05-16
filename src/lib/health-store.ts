// Local-first storage for the IDE's health surface — the operator's
// HealthProfile and the per-date HealthDailyPlan.
//
// The extension keeps these in VS Code globalState; the IDE has no
// such store, so they live on disk under ~/.ava/health/ via Tauri fs
// — the same pattern the creative gallery uses for its local metadata.
//
// Local-first by design: works fully with no account. Cloud backup is
// the separate, opt-in `health_profile` sync category.

import { readTextFile, writeTextFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';

const HEALTH_DIR = '.ava/health';
const PROFILE_PATH = `${HEALTH_DIR}/profile.json`;
const planPath = (date: string) => `${HEALTH_DIR}/plan-${date}.json`;

// ── Types — mirror of the extension's health profile / plan shapes ────────

export interface HealthProfile {
  schema_version: 1;
  updated_at: string | null;
  body: {
    sex: 'female' | 'male' | 'other' | null;
    date_of_birth: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    body_fat_pct: number | null;
  };
  goals: {
    primary: 'fat_loss' | 'muscle_gain' | 'maintenance' | 'athletic' | 'recovery' | 'longevity' | null;
    weekly_focus: string | null;
  };
  constraints: {
    allergens: string[];
    dietary: string[];
    injuries: string[];
    equipment_available: string[];
    minutes_per_day_target: number | null;
  };
  schedule: {
    training_window: { start: string | null; end: string | null };
    meal_times: { breakfast: string | null; lunch: string | null; dinner: string | null };
    sleep_target: { bedtime: string | null; wake: string | null };
  };
}

export interface HealthDailyPlanItem {
  id: string;
  time: string;
  kind: 'mobility' | 'meal' | 'workout' | 'rest' | 'sleep' | 'note';
  title: string;
  detail?: string | null;
  ref?: { kind: 'exercise' | 'recipe' | 'workout'; slug: string } | null;
  duration_minutes?: number | null;
  status: 'pending' | 'done' | 'skipped';
}

export interface HealthDailyLog {
  meals: Array<{ id: string; time: string; description: string | null; calories: number | null; protein_g: number | null }>;
  water_ml: number;
  sleep_hours: number | null;
  /** 1 = drained, 5 = thriving. */
  mood: 1 | 2 | 3 | 4 | 5 | null;
}

export interface HealthDailyPlan {
  schema_version: 1;
  date: string;
  morning_brief: string | null;
  brief_reasoning: string | null;
  items: HealthDailyPlanItem[];
  log: HealthDailyLog;
  updated_at: string | null;
}

// ── Empty scaffolds — returned when nothing has been saved yet ────────────

/** A blank profile — all fields null / arrays empty. Mirrors the
 *  extension host's getHealthProfile() scaffold. */
export function emptyHealthProfile(): HealthProfile {
  return {
    schema_version: 1,
    updated_at: null,
    body: { sex: null, date_of_birth: null, height_cm: null, weight_kg: null, body_fat_pct: null },
    goals: { primary: null, weekly_focus: null },
    constraints: { allergens: [], dietary: [], injuries: [], equipment_available: [], minutes_per_day_target: null },
    schedule: {
      training_window: { start: null, end: null },
      meal_times: { breakfast: null, lunch: null, dinner: null },
      sleep_target: { bedtime: null, wake: null },
    },
  };
}

/** A blank plan for a date — minted when the operator opens / logs
 *  against a day with no plan yet. */
export function emptyHealthDailyPlan(date: string): HealthDailyPlan {
  return {
    schema_version: 1,
    date,
    morning_brief: null,
    brief_reasoning: null,
    items: [],
    log: { meals: [], water_ml: 0, sleep_hours: null, mood: null },
    updated_at: null,
  };
}

// ── Storage ───────────────────────────────────────────────────────────────

/** Read the operator's HealthProfile from disk. Returns the empty
 *  scaffold when no profile has been saved yet, or the file is
 *  missing / malformed / from an unknown schema version. */
export async function loadHealthProfile(): Promise<HealthProfile> {
  try {
    const raw = await readTextFile(PROFILE_PATH, { baseDir: BaseDirectory.Home });
    const parsed = JSON.parse(raw) as HealthProfile;
    if (parsed && parsed.schema_version === 1) return parsed;
  } catch { /* missing / malformed — fall through to scaffold */ }
  return emptyHealthProfile();
}

/** Persist the HealthProfile to disk, stamping updated_at. */
export async function saveHealthProfile(profile: HealthProfile): Promise<void> {
  const next: HealthProfile = { ...profile, schema_version: 1, updated_at: new Date().toISOString() };
  await mkdir(HEALTH_DIR, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(PROFILE_PATH, JSON.stringify(next, null, 2), { baseDir: BaseDirectory.Home });
}

/** Read the daily plan for an ISO date (YYYY-MM-DD). Returns the empty
 *  scaffold when no plan has been saved for that day. */
export async function loadHealthDailyPlan(date: string): Promise<HealthDailyPlan> {
  try {
    const raw = await readTextFile(planPath(date), { baseDir: BaseDirectory.Home });
    const parsed = JSON.parse(raw) as HealthDailyPlan;
    if (parsed && parsed.schema_version === 1 && parsed.date === date) return parsed;
  } catch { /* missing / malformed — fall through to scaffold */ }
  return emptyHealthDailyPlan(date);
}

/** Persist a daily plan to disk, stamping updated_at. */
export async function saveHealthDailyPlan(plan: HealthDailyPlan): Promise<void> {
  const next: HealthDailyPlan = { ...plan, schema_version: 1, updated_at: new Date().toISOString() };
  await mkdir(HEALTH_DIR, { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(planPath(plan.date), JSON.stringify(next, null, 2), { baseDir: BaseDirectory.Home });
}
