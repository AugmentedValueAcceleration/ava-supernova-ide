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
import { getLocale } from './i18n';
import type { HealthProfile, HealthDailyLog } from './health-store';

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
  /** Member of the curated "From Scratch" collection (made entirely from
   *  fresh ingredients, nothing processed). Drives the filter + card badge. */
  from_scratch?: boolean;
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

/** Per-serving nutrition for a recipe version — Ava-estimated on the
 *  platform from the ingredient list. `source` stays 'estimated' until
 *  hand-verified. All numeric fields optional; an un-estimated version
 *  returns {}. */
export interface HealthRecipeNutrition {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fibre_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  saturated_fat_g?: number;
  source?: 'estimated' | 'verified';
  generated_at?: string;
}

export interface HealthRecipeVersionDetail {
  level: HealthRecipeSkillLevel;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  default_servings: number | null;
  nutrition: HealthRecipeNutrition;
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

/** Curated collection (Unprocessed, …) — the operator-driven filter axis. */
export interface HealthTaxonomyCollection {
  slug: string;
  name: string;
  description?: string | null;
  sort_order: number;
}

export interface HealthTaxonomies {
  allergens: HealthTaxonomyAllergen[];
  contraindications: HealthTaxonomyContraindication[];
  cuisines: HealthTaxonomyCuisine[];
  diets: HealthTaxonomyDiet[];
  dietary_flags: HealthTaxonomyDietaryFlag[];
  collections: HealthTaxonomyCollection[];
}

// ── Fetch helper ──────────────────────────────────────────────────────────

/** Stable per-install device id — read from the same localStorage key
 *  the IDE's apiFetch uses, so anonymous health submissions stay
 *  attributable across sessions. */
function deviceId(): string | null {
  try {
    return localStorage.getItem('ava-ide-device-id');
  } catch {
    return null;
  }
}

interface HealthRequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

/** Call a health endpoint. Anonymous-capable — attaches the Bearer
 *  token only when an account is connected, plus the device id for
 *  anonymous attribution. Bounded by a timeout (a bare unbounded
 *  fetch is the class of bug that stalled chat init). On a non-2xx
 *  response the server's `error` message is surfaced. */
async function healthRequest<T>(path: string, opts: HealthRequestOptions = {}): Promise<T> {
  const key = getPlatformKey();
  const dev = deviceId();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), opts.timeoutMs ?? HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${PLATFORM_URL}${path}`, {
      method: opts.method ?? 'GET',
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Ava-Platform': 'ide',
        ...(dev ? { 'X-Ava-Device': dev } : {}),
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = await res.json() as { error?: string };
        if (j && j.error) detail = j.error;
      } catch { /* no JSON error body */ }
      throw new Error(detail);
    }
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
  { const l = getLocale(); if (l && l !== 'en') params.set('locale', l); }
  const data = await healthRequest<{ exercises?: HealthExerciseSummary[]; total?: number }>(
    `/health/exercises?${params.toString()}`,
  );
  return { exercises: data.exercises ?? [], total: data.total ?? 0 };
}

export interface RecipeListParams {
  limit?: number;
  offset?: number;
  course?: string;
  /** Curated collection slug, e.g. 'unprocessed' (the "From Scratch" filter).
   *  Kept for back-compat; `collections` is the multi-select form. */
  collection?: string;
  /** Structured filters — slugs. Within an axis they OR; across axes they AND.
   *  `flags` covers "free from" (gluten_free, dairy_free, …). `maxTime` keeps
   *  recipes with a version at/under that many total minutes. */
  collections?: string[];
  diets?: string[];
  flags?: string[];
  cuisines?: string[];
  maxTime?: number;
  sort?: 'curated' | 'name';
  q?: string;
}

/** Browse recipes — paginated, filtered by course, curated collections,
 *  diet / dietary-flag / cuisine taxonomies, max cook time, and search. */
export async function loadRecipes(
  p: RecipeListParams = {},
): Promise<{ recipes: HealthRecipeSummary[]; total: number }> {
  const params = new URLSearchParams({
    limit: String(p.limit ?? 24),
    offset: String(p.offset ?? 0),
  });
  if (p.course) params.set('course', p.course);
  // Collections fold the back-compat single `collection` into the list; the
  // backend reads `collection` as a comma-separated multi-select.
  const collectionSlugs = [...(p.collection ? [p.collection] : []), ...(p.collections ?? [])];
  if (collectionSlugs.length) params.set('collection', collectionSlugs.join(','));
  if (p.diets?.length) params.set('diet', p.diets.join(','));
  if (p.flags?.length) params.set('flag', p.flags.join(','));
  if (p.cuisines?.length) params.set('cuisine', p.cuisines.join(','));
  if (p.maxTime != null) params.set('max_time', String(p.maxTime));
  if (p.sort) params.set('sort', p.sort);
  if (p.q && p.q.trim()) params.set('q', p.q.trim());
  { const l = getLocale(); if (l && l !== 'en') params.set('locale', l); }
  const data = await healthRequest<{ recipes?: HealthRecipeSummary[]; total?: number }>(
    `/health/recipes?${params.toString()}`,
  );
  return { recipes: data.recipes ?? [], total: data.total ?? 0 };
}

/** Full detail for one exercise. Returns null when the slug isn't
 *  found (or is a non-published row the caller can't see). */
export async function loadExerciseDetail(slug: string): Promise<HealthExerciseDetail | null> {
  const l = getLocale();
  const qs = l && l !== 'en' ? `?locale=${encodeURIComponent(l)}` : '';
  const data = await healthRequest<{ exercise?: HealthExerciseDetail | null }>(
    `/health/exercises/${encodeURIComponent(slug)}${qs}`,
  );
  return data.exercise ?? null;
}

/** Full detail for one recipe (all skill-level versions). */
export async function loadRecipeDetail(slug: string): Promise<HealthRecipeDetail | null> {
  const l = getLocale();
  const qs = l && l !== 'en' ? `?locale=${encodeURIComponent(l)}` : '';
  const data = await healthRequest<{ recipe?: HealthRecipeDetail | null }>(
    `/health/recipes/${encodeURIComponent(slug)}${qs}`,
  );
  return data.recipe ?? null;
}

/** The taxonomy lists (allergens, cuisines, diets, collections, …) — public,
 *  used to populate the contribution flow's pickers + the recipe filters.
 *  Every axis is normalised to an array so a missing field (older API builds
 *  don't return `collections`) can never crash a `.length` read downstream. */
export async function loadTaxonomies(): Promise<HealthTaxonomies> {
  const raw = await healthRequest<Partial<HealthTaxonomies>>('/health/taxonomies');
  return {
    allergens: raw.allergens ?? [],
    contraindications: raw.contraindications ?? [],
    cuisines: raw.cuisines ?? [],
    diets: raw.diets ?? [],
    dietary_flags: raw.dietary_flags ?? [],
    collections: raw.collections ?? [],
  };
}

// ── Contribution / submission flow ────────────────────────────────────────

export interface HealthExerciseSubmissionPayload {
  name: string;
  exercise_type: HealthExerciseType;
  workout_type: HealthWorkoutType;
  difficulty: number;
  description: string | null;
  beginner_detail: string | null;
  common_mistakes: string | null;
  steps: string[];
  contraindication_slugs: string[];
}

export interface HealthRecipeVersionStepPayload {
  action: string;
  notes: string | null;
  technique_term: string | null;
  time_estimate_seconds: number | null;
  tricky_flag: boolean;
}

export interface HealthRecipeVersionEquipmentPayload {
  name: string;
  notes: string | null;
  optional: boolean;
}

export interface HealthRecipeVersionPayload {
  level: HealthRecipeSkillLevel;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  default_servings: number | null;
  steps: HealthRecipeVersionStepPayload[];
  equipment: HealthRecipeVersionEquipmentPayload[];
  diet_slugs: string[];
  dietary_flag_slugs: string[];
}

export interface HealthRecipeSubmissionPayload {
  name: string;
  cuisine_slug: string | null;
  course: string | null;
  origin_country: string | null;
  overview: string | null;
  ingredients: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
    optional: boolean;
    notes: string | null;
  }>;
  allergen_slugs: string[];
  versions: HealthRecipeVersionPayload[];
}

export interface HealthMySubmissionExercise {
  id: string;
  slug: string;
  name: string;
  status: HealthSubmissionStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  exercise_type: string;
  workout_type: string;
}

export interface HealthMySubmissionRecipe {
  id: string;
  slug: string;
  name: string;
  status: HealthSubmissionStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  course: string | null;
}

export interface HealthMySubmissions {
  exercises: HealthMySubmissionExercise[];
  recipes: HealthMySubmissionRecipe[];
}

/** The row the server echoes back for a freshly-accepted submission. */
export interface HealthSubmissionRow {
  id: string;
  slug: string;
  name: string;
  status: HealthSubmissionStatus;
}

/** Submit an exercise for review. Auth optional — signed-in callers
 *  get full attribution, anonymous callers a device-id pseudonym. */
export async function submitExercise(
  payload: HealthExerciseSubmissionPayload,
): Promise<HealthSubmissionRow> {
  const data = await healthRequest<{ submission: HealthSubmissionRow }>(
    '/health/submissions/exercise',
    { method: 'POST', body: payload, timeoutMs: 15000 },
  );
  return data.submission;
}

/** Submit a recipe for review. */
export async function submitRecipe(
  payload: HealthRecipeSubmissionPayload,
): Promise<HealthSubmissionRow> {
  const data = await healthRequest<{ submission: HealthSubmissionRow }>(
    '/health/submissions/recipe',
    { method: 'POST', body: payload, timeoutMs: 15000 },
  );
  return data.submission;
}

/** Load the caller's own submissions — pending, rejected and
 *  published — so they can track what they've contributed. */
export async function loadMySubmissions(): Promise<HealthMySubmissions> {
  const data = await healthRequest<Partial<HealthMySubmissions>>('/health/submissions/mine');
  return { exercises: data.exercises ?? [], recipes: data.recipes ?? [] };
}

/** Clear the caller's rejected submissions from their list. */
export async function clearRejectedSubmissions(): Promise<void> {
  await healthRequest('/health/submissions/mine', { method: 'DELETE' });
}

// ── Morning brief ─────────────────────────────────────────────────────────

export interface MorningBriefContext {
  date: string;
  profile: HealthProfile;
  log: HealthDailyLog;
}

/** Ask Ava to write today's morning-brief paragraph from a snapshot
 *  of the local profile + log. The profile stays local; only this
 *  snapshot travels, and only when the operator clicks generate.
 *  Needs a connected account (the route is sk-ava authed). Long
 *  timeout — first-token latency + cold start can run to ~60s. */
export async function generateMorningBrief(context: MorningBriefContext): Promise<string> {
  const data = await healthRequest<{ brief?: string }>('/health/morning-brief', {
    method: 'POST',
    body: { context },
    timeoutMs: 120000,
  });
  return data.brief ?? '';
}
