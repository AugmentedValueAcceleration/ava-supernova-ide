// Health catalog data layer for the IDE — types + platform fetch
// wrappers for the public exercise / recipe library.
//
// The catalog is public: browsable with no account. When an account
// IS connected, the Bearer token is attached so the server's
// auth-aware list also returns the caller's own pending submissions.
//
// Types mirror the extension's health catalog shapes — the IDE has no
// shared message-types file, so they're defined here alongside the
// fetchers that produce them.

import { getPlatformKey } from './api';

const PLATFORM_URL = 'https://ava-supernova.com/api';
const HEALTH_TIMEOUT_MS = 8000;

// ── Catalog types ─────────────────────────────────────────────────────────

export type HealthExerciseType =
  | 'compound' | 'isolation' | 'bodyweight' | 'plyometric'
  | 'mobility' | 'cardio' | 'isometric' | 'stretching' | 'breathing';

export type HealthWorkoutType =
  | 'strength' | 'hypertrophy' | 'conditioning' | 'mobility'
  | 'hybrid' | 'yoga' | 'pilates' | 'running' | 'cycling'
  | 'recovery' | 'hiit';

export type HealthMuscleRole = 'primary' | 'secondary';
export type HealthSubmissionStatus = 'pending' | 'rejected' | 'published';
export type HealthRecipeSkillLevel = 'beginner' | 'intermediate' | 'expert';

export interface HealthExerciseRoutine {
  sets: number | string | null;
  reps_target: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  frequency_per_week: string | null;
  progression: string | null;
}

export interface HealthExerciseSummary {
  id: string;
  slug: string;
  name: string;
  exercise_type: HealthExerciseType;
  workout_type: HealthWorkoutType;
  difficulty: number;
  status?: HealthSubmissionStatus;
  thumbnail_url?: string | null;
}

export interface HealthMuscleTag {
  slug: string;
  name: string;
  category: string;
  role: HealthMuscleRole;
}

export interface HealthEquipmentTag {
  slug: string;
  name: string;
}

export interface HealthExerciseDetail extends HealthExerciseSummary {
  description: string | null;
  steps: string[];
  routine: HealthExerciseRoutine;
  beginner_detail: string | null;
  common_mistakes: string | null;
  demo_video_url: string | null;
  thumbnail_url: string | null;
  muscles: HealthMuscleTag[];
  equipment: HealthEquipmentTag[];
}

export interface HealthRecipeSummary {
  id: string;
  slug: string;
  name: string;
  cuisine_name: string | null;
  origin_country: string | null;
  course: string | null;
  hero_image_url: string | null;
  status?: HealthSubmissionStatus;
}

export interface HealthRecipeIngredient {
  sort_order: number;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  optional: boolean;
}

export interface HealthRecipeStep {
  sort_order: number;
  action: string;
  notes: string | null;
  technique_term: string | null;
  time_estimate_seconds: number | null;
  tricky_flag: boolean;
}

export interface HealthRecipeEquipment {
  sort_order: number;
  name: string;
  notes: string | null;
  optional: boolean;
}

export interface HealthRecipeVersionDetail {
  level: HealthRecipeSkillLevel;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  default_servings: number | null;
  steps: HealthRecipeStep[];
  dietary_flags: string[];
  diets: string[];
  equipment: HealthRecipeEquipment[];
}

export interface HealthRecipeDetail extends HealthRecipeSummary {
  overview: string | null;
  source_attribution: string | null;
  ingredients: HealthRecipeIngredient[];
  versions: HealthRecipeVersionDetail[];
}

// ── Taxonomies (drive the contribution flow's pickers) ────────────────────

export interface HealthTaxonomyAllergen {
  slug: string;
  name: string;
  severity_hint: string | null;
  sort_order: number;
}

export interface HealthTaxonomyContraindication {
  slug: string;
  name: string;
  category: string | null;
  severity_hint: string | null;
  sort_order: number;
}

export interface HealthTaxonomyCuisine {
  slug: string;
  name: string;
  region: string | null;
  sort_order: number;
}

export interface HealthTaxonomyDiet {
  slug: string;
  name: string;
  sort_order: number;
}

export interface HealthTaxonomyDietaryFlag {
  slug: string;
  name: string;
  sort_order: number;
}

export interface HealthTaxonomies {
  allergens: HealthTaxonomyAllergen[];
  contraindications: HealthTaxonomyContraindication[];
  cuisines: HealthTaxonomyCuisine[];
  diets: HealthTaxonomyDiet[];
  dietary_flags: HealthTaxonomyDietaryFlag[];
}

// ── Fetch helper ──────────────────────────────────────────────────────────

/** GET a health endpoint. Anonymous-capable — attaches the Bearer
 *  token only when an account is connected. Bounded by an 8s timeout
 *  (a bare unbounded fetch is exactly the class of bug that stalled
 *  chat init). */
async function healthGet<T>(path: string): Promise<T> {
  const key = getPlatformKey();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${PLATFORM_URL}${path}`, {
      method: 'GET',
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Ava-Platform': 'ide',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`Health API ${res.status}`);
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Catalog calls ─────────────────────────────────────────────────────────

export interface ExerciseListParams {
  limit?: number;
  offset?: number;
  workoutType?: string;
  q?: string;
}

/** Browse exercises — paginated, optionally filtered by workout type
 *  and search query. */
export async function loadExercises(
  p: ExerciseListParams = {},
): Promise<{ exercises: HealthExerciseSummary[]; total: number }> {
  const params = new URLSearchParams({
    limit: String(p.limit ?? 24),
    offset: String(p.offset ?? 0),
  });
  if (p.workoutType) params.set('workout_type', p.workoutType);
  if (p.q && p.q.trim()) params.set('q', p.q.trim());
  const data = await healthGet<{ exercises?: HealthExerciseSummary[]; total?: number }>(
    `/health/exercises?${params.toString()}`,
  );
  return { exercises: data.exercises ?? [], total: data.total ?? 0 };
}

export interface RecipeListParams {
  limit?: number;
  offset?: number;
  course?: string;
  q?: string;
}

/** Browse recipes — paginated, optionally filtered by course and
 *  search query. */
export async function loadRecipes(
  p: RecipeListParams = {},
): Promise<{ recipes: HealthRecipeSummary[]; total: number }> {
  const params = new URLSearchParams({
    limit: String(p.limit ?? 24),
    offset: String(p.offset ?? 0),
  });
  if (p.course) params.set('course', p.course);
  if (p.q && p.q.trim()) params.set('q', p.q.trim());
  const data = await healthGet<{ recipes?: HealthRecipeSummary[]; total?: number }>(
    `/health/recipes?${params.toString()}`,
  );
  return { recipes: data.recipes ?? [], total: data.total ?? 0 };
}

/** Full detail for one exercise. Returns null when the slug isn't
 *  found (or is a non-published row the caller can't see). */
export async function loadExerciseDetail(slug: string): Promise<HealthExerciseDetail | null> {
  const data = await healthGet<{ exercise?: HealthExerciseDetail | null }>(
    `/health/exercises/${encodeURIComponent(slug)}`,
  );
  return data.exercise ?? null;
}

/** Full detail for one recipe (all skill-level versions). */
export async function loadRecipeDetail(slug: string): Promise<HealthRecipeDetail | null> {
  const data = await healthGet<{ recipe?: HealthRecipeDetail | null }>(
    `/health/recipes/${encodeURIComponent(slug)}`,
  );
  return data.recipe ?? null;
}

/** The taxonomy lists (allergens, cuisines, diets, …) — public,
 *  used to populate the contribution flow's pickers. */
export async function loadTaxonomies(): Promise<HealthTaxonomies> {
  return healthGet<HealthTaxonomies>('/health/taxonomies');
}
