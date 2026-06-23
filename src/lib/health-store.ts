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
import { accountRoot } from './account-scope';

// Account-scoped paths — ~/.ava/users/<id>/... when signed in (the same files
// the extension reads/writes), ~/.ava/... for BYOK / no-account.
const healthDir = async (): Promise<string> => `${await accountRoot()}/health`;
const profilePath = async (): Promise<string> => `${await healthDir()}/profile.json`;
const generalProfilePath = async (): Promise<string> => `${await accountRoot()}/general.json`;
const planPath = async (date: string): Promise<string> => `${await healthDir()}/plan-${date}.json`;

// ── Types — mirror of the extension's health profile / plan shapes ────────

export interface HealthProfile {
  schema_version: 1;
  updated_at: string | null;
  /** @deprecated Body basics moved to GeneralProfile (general.json). Kept
   *  optional so legacy profile.json still parses + migration can seed General
   *  from it. New writes omit it; reads of body fields go through General. */
  body?: {
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
  /** Food taste — soft steering for meal plans (likes/dislikes) + favourite
   *  cuisines that focus the global catalogue. Optional for legacy profiles.
   *  Mirrors the extension's HealthProfile.food. */
  food?: {
    likes: string[];
    dislikes: string[];
    cuisines: string[];
  };
  schedule: {
    training_window: { start: string | null; end: string | null };
    meal_times: { breakfast: string | null; lunch: string | null; dinner: string | null };
    sleep_target: { bedtime: string | null; wake: string | null };
  };
}

/** General profile — identity + body basics, stored at account level
 *  (~/.ava/general.json), separate from health so it's reusable beyond the
 *  health surface. Split out of HealthProfile.body on 2026-06-21; the health
 *  room + plans read across both. Mirrors the extension's GeneralProfile. */
export interface GeneralProfile {
  schema_version: 1;
  updated_at: string | null;
  display_name: string | null;
  sex: 'female' | 'male' | 'other' | null;
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  units: 'metric' | 'imperial' | null;
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
    goals: { primary: null, weekly_focus: null },
    constraints: { allergens: [], dietary: [], injuries: [], equipment_available: [], minutes_per_day_target: null },
    food: { likes: [], dislikes: [], cuisines: [] },
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
    const raw = await readTextFile(await profilePath(), { baseDir: BaseDirectory.Home });
    const parsed = JSON.parse(raw) as HealthProfile;
    if (parsed && parsed.schema_version === 1) return parsed;
  } catch { /* missing / malformed — fall through to scaffold */ }
  return emptyHealthProfile();
}

/** Persist the HealthProfile to disk, stamping updated_at. */
export async function saveHealthProfile(profile: HealthProfile): Promise<void> {
  const next: HealthProfile = { ...profile, schema_version: 1, updated_at: new Date().toISOString() };
  await mkdir(await healthDir(), { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(await profilePath(), JSON.stringify(next, null, 2), { baseDir: BaseDirectory.Home });
}

// ── General profile (identity + body basics) ──────────────────────────────

export function emptyGeneralProfile(): GeneralProfile {
  return {
    schema_version: 1,
    updated_at: null,
    display_name: null,
    sex: null,
    date_of_birth: null,
    height_cm: null,
    weight_kg: null,
    body_fat_pct: null,
    units: 'metric',
  };
}

/** Read the GeneralProfile from ~/.ava/general.json. On first read, if no
 *  general profile exists but a legacy HealthProfile carries body basics, seed
 *  it (non-destructively — health.json is left untouched) and persist. */
export async function loadGeneralProfile(): Promise<GeneralProfile> {
  try {
    const raw = await readTextFile(await generalProfilePath(), { baseDir: BaseDirectory.Home });
    const parsed = JSON.parse(raw) as GeneralProfile;
    if (parsed && parsed.schema_version === 1) return parsed;
  } catch { /* missing / malformed — fall through to migrate/scaffold */ }
  // Migrate from a legacy health profile's body block, once.
  const seeded = emptyGeneralProfile();
  try {
    const rawHealth = await readTextFile(await profilePath(), { baseDir: BaseDirectory.Home });
    const health = JSON.parse(rawHealth) as HealthProfile;
    if (health?.body) {
      seeded.sex = health.body.sex;
      seeded.date_of_birth = health.body.date_of_birth;
      seeded.height_cm = health.body.height_cm;
      seeded.weight_kg = health.body.weight_kg;
      seeded.body_fat_pct = health.body.body_fat_pct;
      seeded.updated_at = health.updated_at ?? null;
      await saveGeneralProfile(seeded);
    }
  } catch { /* no legacy body — return blank scaffold */ }
  return seeded;
}

/** Persist the GeneralProfile to ~/.ava/general.json, stamping updated_at. */
export async function saveGeneralProfile(profile: GeneralProfile): Promise<void> {
  const next: GeneralProfile = { ...profile, schema_version: 1, updated_at: new Date().toISOString() };
  await mkdir(await accountRoot(), { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(await generalProfilePath(), JSON.stringify(next, null, 2), { baseDir: BaseDirectory.Home });
}

/** Read the daily plan for an ISO date (YYYY-MM-DD). Returns the empty
 *  scaffold when no plan has been saved for that day. */
export async function loadHealthDailyPlan(date: string): Promise<HealthDailyPlan> {
  try {
    const raw = await readTextFile(await planPath(date), { baseDir: BaseDirectory.Home });
    const parsed = JSON.parse(raw) as HealthDailyPlan;
    if (parsed && parsed.schema_version === 1 && parsed.date === date) return parsed;
  } catch { /* missing / malformed — fall through to scaffold */ }
  return emptyHealthDailyPlan(date);
}

/** Persist a daily plan to disk, stamping updated_at. */
export async function saveHealthDailyPlan(plan: HealthDailyPlan): Promise<void> {
  const next: HealthDailyPlan = { ...plan, schema_version: 1, updated_at: new Date().toISOString() };
  await mkdir(await healthDir(), { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(await planPath(plan.date), JSON.stringify(next, null, 2), { baseDir: BaseDirectory.Home });
}
