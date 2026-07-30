// Health Plans — the multi-week plan builder, the IDE mirror of the
// extension's Planner "Plans" tab.
//
// Self-contained: owns its state and talks straight to health-catalog
// (platform fetch) and health-plans-store (local Tauri-fs storage) —
// the IDE has no host-process hop. Inline-styled to match the rest of
// the IDE dashboard.
//
// The Plans tab is always a calendar. Creating or opening a plan raises
// ONE fixed-size overlay: setup → build → add are phases inside it.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t, useLocale, getLocale } from '../lib/i18n';
import {
  loadExercises, loadRecipes, loadExerciseDetail, loadRecipeDetail,
} from '../lib/health-catalog';
import type {
  HealthExerciseSummary, HealthRecipeSummary, HealthExerciseDetail,
  HealthRecipeDetail, HealthRecipeNutrition,
} from '../lib/health-catalog';
import {
  loadHealthPlanIndex, loadHealthPlan, saveHealthPlan, deleteHealthPlan,
} from '../lib/health-plans-store';
// The rich, tabbed catalogue detail bodies — reused so a recipe/exercise opened
// from a plan or the day view reads identically to the library (skill levels,
// full nutrition, diets, equipment, per-step technique), not a thin copy.
import { ExerciseDetailBody as CatExerciseDetail, RecipeDetailBody as CatRecipeDetail } from './HealthPage';
// session-types, NOT the ./health barrel: the barrel re-exports node-store.js
// (node:fs / node:path / node:os) and cannot be bundled for a browser at all.
import { freshGymSession, gymExerciseFromPlan, type GymSession, type GymExercise } from '@ava/core/health/session-types';
import { sessionsForDate, saveSession } from '../lib/health-sessions-store';
import { LogSessionSheet } from './LogSessionSheet';
import { fillDayMeta } from '../lib/plan-meal-meta';
import { ShoppingListSheet } from './ShoppingListSheet';
import { PrepSheet } from './PrepSheet';
import { DuplicateSheet } from './DuplicateSheet';
import { loadHealthProfile, type HealthProfile } from '../lib/health-store';
import type {
  HealthPlan, HealthPlanSummary, HealthPlanType, HealthPlanStatus,
  HealthPlanDay, HealthPlanExercise, HealthPlanMeal,
} from '../lib/health-plans-store';

// ── Palette ───────────────────────────────────────────────────────────
const ACCENT = 'var(--accent)';
const TEXT = '#cdd6f4';
const TEXT2 = '#a6adc8';
const MUTED = '#585b70';
const BORDER = 'color-mix(in srgb, var(--accent) 14%, transparent)';
const BORDER_SOFT = 'color-mix(in srgb, var(--accent) 8%, transparent)';
const INPUT_BG = 'rgba(49,34,68,0.4)';
const AMBER = '#fbbf24';
const RED = '#f38ba8';
const PANEL_BG = 'linear-gradient(135deg,#100d1a,#181327)';

const PICKER_PAGE_SIZE = 24;
const EXERCISE_CATEGORIES = ['strength', 'hypertrophy', 'conditioning', 'mobility', 'hybrid', 'yoga', 'pilates', 'running', 'cycling', 'recovery', 'hiit'];
const RECIPE_CATEGORIES = ['breakfast', 'starter', 'main', 'side', 'dessert', 'snack', 'beverage', 'sauce', 'bread'];

type PlanSearch = (o: { q: string; offset: number; category: string | null }) => void;

// ── Shared styles ─────────────────────────────────────────────────────
const inputStyle: CSSProperties = {
  borderRadius: 4, border: `1px solid ${BORDER}`, background: INPUT_BG,
  padding: '4px 8px', fontSize: 12, color: TEXT, outline: 'none',
};
const labelCap: CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED };
const sectionCap: CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUTED };

function accentBtn(enabled: boolean): CSSProperties {
  return {
    borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 500,
    border: `1px solid ${enabled ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : BORDER}`,
    background: enabled ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
    color: enabled ? ACCENT : MUTED, cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.6,
  };
}

// Visual-only metadata — labels/blurbs resolve through t() at render via the
// helpers below (module consts evaluate once, so a t() call here would freeze
// to English; the helpers read the live locale instead).
const PLAN_TYPE_META: Record<HealthPlanType, { accent: string }> = {
  fitness:  { accent: ACCENT },
  meal:     { accent: AMBER },
  combined: { accent: '#34d399' },
};
const planTypeLabel = (type: HealthPlanType): string => t(`health.plans.type.${type}`);
const planTypeBlurb = (type: HealthPlanType): string => t(`health.plans.type.${type}.blurb`);
const planStatusLabel = (status: HealthPlanStatus): string => t(`health.plans.status.${status}`);
const mealSlotLabel = (slot: HealthPlanMeal['slot']): string => t(`health.plans.slot.${slot}`);
const weekdayLabel = (dow: number): string => t(`health.plans.weekday.${dow}`);
const weekdayInitial = (dow: number): string => t(`health.plans.weekday_initial.${dow}`);

const DURATION_PRESETS: number[] = [1, 7, 28, 56, 84];

// ── Helpers ───────────────────────────────────────────────────────────
function durationLabel(days: number): string {
  if (days <= 1) return t('health.plans.duration.day_one');
  const w = Math.round(days / 7);
  return w === 1 ? t('health.plans.duration.week_one') : t('health.plans.duration.weeks', { n: w });
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayISO(): string { return ymd(new Date()); }
function planDate(startDate: string | null, dayIndex: number): Date | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + dayIndex - 1);
  return d;
}
function newId(prefix: string): string {
  return crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function emptyExercise(): HealthPlanExercise {
  return { id: newId('ex'), ref: null, name: '', sets: null, reps: null, weight: null, rest_seconds: null, tempo: null, notes: null };
}
function emptyMeal(slot: HealthPlanMeal['slot']): HealthPlanMeal {
  return { id: newId('ml'), slot, ref: null, name: '', servings: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, cook_time_minutes: null, notes: null };
}
function defaultDay(dayIndex: number): HealthPlanDay {
  return { day_index: dayIndex, kind: 'rest', title: null, training: [], meals: [], notes: null };
}
function isEmptyDay(d: HealthPlanDay): boolean {
  return d.kind === 'rest' && d.training.length === 0 && d.meals.length === 0 && !d.title && !d.notes;
}
function blankPlan(type: HealthPlanType, durationDays: number): HealthPlan {
  return {
    schema_version: 1, id: newId('plan'), type,
    title: t('health.plans.new_plan_title', { type: planTypeLabel(type).toLowerCase() }),
    goal: null, source: 'manual', status: 'draft', duration_days: durationDays,
    start_date: todayISO(), profile_snapshot: null, days: [],
    created_at: new Date().toISOString(), updated_at: null,
  };
}

// ── Nutrition derivation ──────────────────────────────────────────────
const MACRO_FIELDS: Array<{ key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'; labelKey: string; unit: string }> = [
  { key: 'calories', labelKey: 'health.plans.macro.cal', unit: '' },
  { key: 'protein_g', labelKey: 'health.plans.macro.protein', unit: 'g' },
  { key: 'carbs_g', labelKey: 'health.plans.macro.carbs', unit: 'g' },
  { key: 'fat_g', labelKey: 'health.plans.macro.fat', unit: 'g' },
];
function recipePerServing(slug: string, recipeDetails: Record<string, HealthRecipeDetail>): HealthRecipeNutrition | null {
  const detail = recipeDetails[slug];
  if (!detail) return null;
  const withData = detail.versions.filter(v => v.nutrition && typeof v.nutrition.calories === 'number');
  if (withData.length === 0) return null;
  return (withData.find(v => v.level === 'intermediate') ?? withData[0]).nutrition;
}
interface MealMacros { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
function mealMacros(meal: HealthPlanMeal, recipeDetails: Record<string, HealthRecipeDetail>): {
  macros: MealMacros; estimated: boolean; pending: boolean;
} {
  if (meal.ref) {
    const per = recipePerServing(meal.ref.slug, recipeDetails);
    if (!per) return { macros: { calories: null, protein_g: null, carbs_g: null, fat_g: null }, estimated: false, pending: true };
    const s = meal.servings ?? 1;
    const scale = (v: number | undefined) => (typeof v === 'number' ? Math.round(v * s * 10) / 10 : null);
    return {
      macros: { calories: scale(per.calories), protein_g: scale(per.protein_g), carbs_g: scale(per.carbs_g), fat_g: scale(per.fat_g) },
      estimated: per.source !== 'verified', pending: false,
    };
  }
  return {
    macros: { calories: meal.calories, protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g },
    estimated: false, pending: false,
  };
}
function dayTotals(day: HealthPlanDay, recipeDetails: Record<string, HealthRecipeDetail>): { totals: MealMacros; estimated: boolean } {
  const totals: MealMacros = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  let estimated = false;
  for (const meal of day.meals) {
    const { macros, estimated: e } = mealMacros(meal, recipeDetails);
    if (e) estimated = true;
    for (const f of MACRO_FIELDS) {
      const v = macros[f.key];
      if (typeof v === 'number') totals[f.key] = (totals[f.key] ?? 0) + v;
    }
  }
  return { totals, estimated };
}

// ── Top component — owns state, talks to catalogue + plan store ───────
export default function HealthPlansPage() {
  useLocale();
  const [plans, setPlans] = useState<HealthPlanSummary[]>([]);
  const [planOpen, setPlanOpen] = useState<HealthPlan | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [exerciseResults, setExerciseResults] = useState<HealthExerciseSummary[]>([]);
  const [recipeResults, setRecipeResults] = useState<HealthRecipeSummary[]>([]);
  const [exerciseTotal, setExerciseTotal] = useState(0);
  const [recipeTotal, setRecipeTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, HealthExerciseDetail>>({});
  const [recipeDetails, setRecipeDetails] = useState<Record<string, HealthRecipeDetail>>({});
  const exSeq = useRef(0);
  const recSeq = useRef(0);

  const searchExercises = useCallback<PlanSearch>(async (o) => {
    exSeq.current += 1;
    const seq = exSeq.current;
    setSearching(true);
    try {
      const { exercises, total } = await loadExercises({ q: o.q, offset: o.offset, workoutType: o.category ?? undefined, limit: PICKER_PAGE_SIZE });
      if (seq === exSeq.current) { setExerciseResults(exercises); setExerciseTotal(total); }
    } catch {
      if (seq === exSeq.current) { setExerciseResults([]); setExerciseTotal(0); }
    } finally {
      if (seq === exSeq.current) setSearching(false);
    }
  }, []);
  const searchRecipes = useCallback<PlanSearch>(async (o) => {
    recSeq.current += 1;
    const seq = recSeq.current;
    setSearching(true);
    try {
      const { recipes, total } = await loadRecipes({ q: o.q, offset: o.offset, course: o.category ?? undefined, limit: PICKER_PAGE_SIZE });
      if (seq === recSeq.current) { setRecipeResults(recipes); setRecipeTotal(total); }
    } catch {
      if (seq === recSeq.current) { setRecipeResults([]); setRecipeTotal(0); }
    } finally {
      if (seq === recSeq.current) setSearching(false);
    }
  }, []);
  const loadExDetail = useCallback(async (slug: string) => {
    const d = await loadExerciseDetail(slug).catch(() => null);
    if (d) setExerciseDetails(prev => ({ ...prev, [slug]: d }));
  }, []);
  const loadRecDetail = useCallback(async (slug: string) => {
    const d = await loadRecipeDetail(slug).catch(() => null);
    if (d) setRecipeDetails(prev => ({ ...prev, [slug]: d }));
  }, []);

  const onSavePlan = useCallback(async (plan: HealthPlan) => {
    setPlans(await saveHealthPlan(plan));
  }, []);
  const onCreatePlan = useCallback(async (plan: HealthPlan) => {
    setPlanOpen(plan);
    setPlans(await saveHealthPlan(plan));
  }, []);
  const onOpenPlan = useCallback(async (id: string) => {
    const p = await loadHealthPlan(id);
    if (p) setPlanOpen(p);
  }, []);
  const onDeletePlan = useCallback(async (id: string) => {
    setPlans(await deleteHealthPlan(id));
    setPlanOpen(prev => (prev && prev.id === id ? null : prev));
  }, []);

  // Mount — load the library, pre-warm the picker's first page.
  useEffect(() => {
    loadHealthPlanIndex().then(setPlans).catch(() => {});
    searchExercises({ q: '', offset: 0, category: null });
    searchRecipes({ q: '', offset: 0, category: null });
  }, [searchExercises, searchRecipes]);

  return (
    <>
      <BasePlansTab plans={plans} onNew={() => setSetupOpen(true)} onOpen={onOpenPlan} onDelete={onDeletePlan} onSavePlan={onSavePlan} />
      {(setupOpen || planOpen) && (
        <PlanOverlay
          planOpen={planOpen}
          onCancelSetup={() => setSetupOpen(false)}
          onCreate={onCreatePlan}
          onClose={() => { setPlanOpen(null); setSetupOpen(false); }}
          onSave={onSavePlan}
          onDelete={onDeletePlan}
          exerciseResults={exerciseResults}
          recipeResults={recipeResults}
          exerciseTotal={exerciseTotal}
          recipeTotal={recipeTotal}
          searching={searching}
          onSearchExercises={searchExercises}
          onSearchRecipes={searchRecipes}
          exerciseDetails={exerciseDetails}
          recipeDetails={recipeDetails}
          onLoadExerciseDetail={loadExDetail}
          onLoadRecipeDetail={loadRecDetail}
        />
      )}
    </>
  );
}

// ── Base tab — Calendar / Programs inner tabs ─────────────────────────
/** Compact custom dropdown for the plan builder — content-width panel so
 *  options never truncate. Mirrors the extension's Select(size="sm"). */
function PlanSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const selected = options.find(o => o.value === value);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ whiteSpace: 'nowrap' }}>{selected?.label ?? value}</span>
        <span style={{ fontSize: 9, color: MUTED, transform: open ? 'rotate(180deg)' : 'none' }}>{'▾'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, marginTop: 4, maxHeight: 240, width: 'max-content', minWidth: '100%', overflowY: 'auto', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#1a1028', padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
              style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: 'none', cursor: 'pointer', borderRadius: 4, padding: '6px 10px', fontSize: 12, textAlign: 'left', background: o.value === value ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent', color: o.value === value ? TEXT : TEXT2 }}>
              <span style={{ whiteSpace: 'nowrap' }}>{o.label}</span>
              {o.value === value && <span style={{ color: ACCENT }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BasePlansTab({ plans, onNew, onOpen, onDelete, onSavePlan }: {
  plans: HealthPlanSummary[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** Persist an edited plan from the calendar day view (refreshes the list). */
  onSavePlan: (plan: HealthPlan) => void;
}) {
  const [tab, setTab] = useState<'calendar' | 'programs'>('calendar');
  // A clicked calendar day opens the DAY view (what's on that date across every
  // plan), not a single plan's editor.
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [month, setMonth] = useState<Date>(() => {
    const dated = plans.find(p => p.start_date);
    return dated?.start_date ? new Date(`${dated.start_date}T00:00:00`) : new Date();
  });

  // Full dated plans → per-date content (session title + move / meal names) so
  // the calendar cells show what's actually on, not just a dot. Mirrors the
  // extension's planContent.
  const [fullPlans, setFullPlans] = useState<HealthPlan[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const dated = plans.filter(p => p.start_date);
        const full = (await Promise.all(dated.map(s => loadHealthPlan(s.id)))).filter(Boolean) as HealthPlan[];
        if (live) setFullPlans(full);
      } catch { /* none loaded — cells fall back to dots */ }
    })();
    return () => { live = false; };
  }, [plans]);

  const planContent = useMemo(() => {
    const map = new Map<string, { title: string | null; training: string[]; meals: string[] }>();
    for (const p of fullPlans) {
      if (!p.start_date) continue;
      const start = new Date(`${p.start_date}T00:00:00`);
      if (isNaN(start.getTime())) continue;
      for (const day of p.days) {
        const d = new Date(start);
        d.setDate(d.getDate() + (day.day_index - 1));
        const key = ymd(d);
        const cur = map.get(key) ?? { title: null as string | null, training: [] as string[], meals: [] as string[] };
        if (day.title && !cur.title) cur.title = day.title;
        if (p.type === 'fitness' || p.type === 'combined') for (const ex of day.training) if (ex.name) cur.training.push(ex.name);
        if (p.type === 'meal' || p.type === 'combined') for (const m of day.meals) if (m.name) cur.meals.push(m.name);
        map.set(key, cur);
      }
    }
    return map;
  }, [fullPlans]);

  // Dots reflect the day's ACTUAL content (from the full dated plans), not just
  // the plan's type/range — so deleting every meal on a day clears its dot.
  const planMarks = useMemo(() => {
    const map = new Map<string, { training: boolean; meals: boolean }>();
    for (const p of fullPlans) {
      if (!p.start_date) continue;
      const start = new Date(`${p.start_date}T00:00:00`);
      if (isNaN(start.getTime())) continue;
      for (const day of p.days) {
        const hasTraining = (p.type === 'fitness' || p.type === 'combined') && day.training.some(e => e.name);
        const hasMeals = (p.type === 'meal' || p.type === 'combined') && day.meals.some(m => m.name);
        if (!hasTraining && !hasMeals) continue;
        const d = new Date(start);
        d.setDate(d.getDate() + (day.day_index - 1));
        const key = ymd(d);
        const prev = map.get(key) ?? { training: false, meals: false };
        map.set(key, { training: prev.training || hasTraining, meals: prev.meals || hasMeals });
      }
    }
    return map;
  }, [fullPlans]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={sectionCap}>{t('health.plans.your_plans')}</div>
          <p style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: MUTED }}>
            {t('health.plans.your_plans_blurb')}
          </p>
        </div>
        <button type="button" onClick={onNew} style={{ ...accentBtn(true), padding: '6px 12px', fontSize: 11 }}>{t('health.plans.new_plan')}</button>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}` }}>
        {([['calendar', t('health.plans.tab.calendar')], ['programs', `${t('health.plans.tab.programs')}${plans.length ? ` · ${plans.length}` : ''}`]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', background: 'transparent',
            color: tab === key ? TEXT : MUTED,
            borderBottom: tab === key ? `2px solid ${ACCENT}` : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'calendar' ? (
        <div style={{ display: 'flex', minHeight: '64vh' }}>
          <MonthCalendar month={month} onMonthChange={setMonth} marks={planMarks} content={planContent} selected={null} onSelectDate={(key) => setDayKey(key)} fill />
        </div>
      ) : plans.length === 0 ? (
        <div style={{ borderRadius: 8, border: `1px dashed ${BORDER}`, padding: '40px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: TEXT2 }}>{t('health.plans.empty_title')}</div>
          <div style={{ margin: '6px auto 0', maxWidth: 360, fontSize: 10, fontStyle: 'italic', lineHeight: 1.5, color: MUTED }}>
            {t('health.plans.empty_hint')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {plans.map(p => <PlanCard key={p.id} plan={p} onOpen={() => onOpen(p.id)} onDelete={() => onDelete(p.id)} />)}
        </div>
      )}

      {dayKey && <HealthDayView dateKey={dayKey} onClose={() => setDayKey(null)} onNewPlan={() => { setDayKey(null); onNew(); }} onSavePlan={onSavePlan} />}
    </div>
  );
}

// ── Day view — a date's agenda, EXTENSIBLE by source ─────────────────────────
// A day belongs to no single plan: it's whatever is scheduled on that DATE,
// gathered from every active plan. The body is a list of SECTIONS, each fed by a
// source. Training + meals today; tasks, learning paths, a journal entry slot in
// tomorrow by adding one builder to `sections` below — the view renders whatever
// sections exist, so new content types never restructure anything.

/** The 1-based day_index a plan assigns to a calendar date, or null when the
 *  date is outside the plan's range. Does NOT require the day object to exist —
 *  so an empty/rest day can still be edited. */
function dayIndexForDate(plan: HealthPlan, dateKey: string): number | null {
  if (!plan.start_date) return null;
  const start = new Date(`${plan.start_date}T00:00:00`).getTime();
  const sel = new Date(`${dateKey}T00:00:00`).getTime();
  if (isNaN(start) || isNaN(sel)) return null;
  const idx = Math.round((sel - start) / 86400000) + 1;
  if (idx < 1 || idx > plan.duration_days) return null;
  return idx;
}

function planDayForDate(plan: HealthPlan, dateKey: string): HealthPlanDay | null {
  const idx = dayIndexForDate(plan, dateKey);
  if (idx == null) return null;
  return plan.days.find(d => d.day_index === idx) ?? null;
}

interface DayAgendaItem { id: string; kind: 'exercise' | 'recipe'; slug?: string; title: string; meta?: string; slot?: string; thumb?: string | null; planTitle: string; planId: string; itemId: string; dayIndex: number }
interface DayAgendaSection { key: string; label: string; icon: string; accent: string; items: DayAgendaItem[] }

function HealthDayView({ dateKey, onClose, onNewPlan, onSavePlan }: { dateKey: string; onClose: () => void; onNewPlan: () => void; onSavePlan: (plan: HealthPlan) => void }) {
  useLocale();
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, HealthExerciseDetail>>({});
  const [recipeDetails, setRecipeDetails] = useState<Record<string, HealthRecipeDetail>>({});
  const [detail, setDetail] = useState<{ kind: 'exercise' | 'recipe'; slug: string; name: string; planId?: string; itemId?: string } | null>(null);
  // The training session for this date, if one exists. Loaded once per date
  // rather than per tick — a tick must not wait on a directory read.
  const [daySession, setDaySession] = useState<GymSession | null>(null);

  // ── Editing: the loaded full plans ARE the working model — edits mutate the
  // matching plan's day and autosave (debounced) through onSavePlan, the same
  // path the plan builder uses. ───────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  // Add / swap happens INLINE inside a section (no second overlay).
  const [inlineSearch, setInlineSearch] = useState<{ section: 'training' | 'meals'; kind: 'exercise' | 'recipe'; mode: 'add' | 'swap'; planId: string; dayIndex: number; itemId?: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const MIN_PANEL_H = 400;
  const [frozenH, setFrozenH] = useState<number | null>(null);
  // Which item's delete is awaiting confirmation — same confirm as deleting a program.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const plansRef = useRef<HealthPlan[]>([]);
  plansRef.current = plans;
  const pendingSave = useRef<Map<string, HealthPlan>>(new Map());
  const saveTimer = useRef<number | undefined>(undefined);
  const flushSaves = () => {
    if (saveTimer.current !== undefined) { clearTimeout(saveTimer.current); saveTimer.current = undefined; }
    for (const p of pendingSave.current.values()) onSavePlan(p);
    pendingSave.current.clear();
  };
  const scheduleSave = (plan: HealthPlan) => {
    pendingSave.current.set(plan.id, plan);
    if (saveTimer.current !== undefined) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSaves, 600);
  };
  useEffect(() => () => flushSaves(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const updatePlanDay = (planId: string, dayIndex: number, mutate: (day: HealthPlanDay) => HealthPlanDay) => {
    const p = plansRef.current.find(x => x.id === planId);
    if (!p) return;
    const existing = p.days.find(d => d.day_index === dayIndex) ?? defaultDay(dayIndex);
    const nextDay = mutate(existing);
    const days = p.days.filter(d => d.day_index !== dayIndex);
    if (!isEmptyDay(nextDay)) days.push(nextDay);
    days.sort((a, b) => a.day_index - b.day_index);
    const nextPlan: HealthPlan = { ...p, days };
    // Update the ref synchronously so rapid successive edits (e.g. two quick
    // deletes) each build on the previous one — otherwise the second read would
    // see pre-edit state and its save would revert the first edit.
    const nextPlans = plansRef.current.map(x => (x.id === planId ? nextPlan : x));
    plansRef.current = nextPlans;
    setPlans(nextPlans);
    scheduleSave(nextPlan);
  };

  // Local catalogue search powering the inline add/swap strip (self-contained).
  const [exResults, setExResults] = useState<HealthExerciseSummary[]>([]);
  const [recResults, setRecResults] = useState<HealthRecipeSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const exSeq = useRef(0);
  const recSeq = useRef(0);
  const searchExercises = useCallback<PlanSearch>(async (o) => {
    exSeq.current += 1; const seq = exSeq.current; setSearching(true);
    try { const { exercises } = await loadExercises({ q: o.q, offset: o.offset, workoutType: o.category ?? undefined, limit: PICKER_PAGE_SIZE }); if (seq === exSeq.current) setExResults(exercises); }
    catch { if (seq === exSeq.current) setExResults([]); }
    finally { if (seq === exSeq.current) setSearching(false); }
  }, []);
  const searchRecipes = useCallback<PlanSearch>(async (o) => {
    recSeq.current += 1; const seq = recSeq.current; setSearching(true);
    try { const { recipes } = await loadRecipes({ q: o.q, offset: o.offset, course: o.category ?? undefined, limit: PICKER_PAGE_SIZE }); if (seq === recSeq.current) setRecResults(recipes); }
    catch { if (seq === recSeq.current) setRecResults([]); }
    finally { if (seq === recSeq.current) setSearching(false); }
  }, []);

  const addTargets = useMemo(() => {
    let training: { planId: string; dayIndex: number } | null = null;
    let meals: { planId: string; dayIndex: number } | null = null;
    for (const p of plans) {
      const idx = dayIndexForDate(p, dateKey);
      if (idx == null) continue;
      if (!training && (p.type === 'fitness' || p.type === 'combined')) training = { planId: p.id, dayIndex: idx };
      if (!meals && (p.type === 'meal' || p.type === 'combined')) meals = { planId: p.id, dayIndex: idx };
    }
    return { training, meals };
  }, [plans, dateKey]);

  const handleInlinePick = (it: { slug: string; name: string }) => {
    if (!inlineSearch) return;
    const { kind, mode, planId, dayIndex, itemId } = inlineSearch;
    if (kind === 'exercise') {
      loadExerciseDetail(it.slug).then(d => { if (d) setExerciseDetails(prev => ({ ...prev, [it.slug]: d })); }).catch(() => {});
      if (mode === 'add') updatePlanDay(planId, dayIndex, day => ({ ...day, kind: day.kind === 'rest' ? 'training' : day.kind, training: [...day.training, { ...emptyExercise(), ref: { kind: 'exercise', slug: it.slug }, name: it.name }] }));
      else if (itemId) updatePlanDay(planId, dayIndex, day => ({ ...day, training: day.training.map(e => (e.id === itemId ? { ...e, ref: { kind: 'exercise', slug: it.slug }, name: it.name } : e)) }));
    } else {
      loadRecipeDetail(it.slug).then(d => { if (d) setRecipeDetails(prev => ({ ...prev, [it.slug]: d })); }).catch(() => {});
      if (mode === 'add') updatePlanDay(planId, dayIndex, day => ({ ...day, meals: [...day.meals, { ...emptyMeal('breakfast'), ref: { kind: 'recipe', slug: it.slug }, name: it.name, servings: 1 }] }));
      else if (itemId) updatePlanDay(planId, dayIndex, day => ({ ...day, meals: day.meals.map(m => (m.id === itemId ? { ...m, ref: { kind: 'recipe', slug: it.slug }, name: it.name } : m)) }));
    }
    setInlineSearch(null);
  };
  const deleteItem = (section: 'training' | 'meals', planId: string, dayIndex: number, itemId: string) => {
    if (section === 'training') updatePlanDay(planId, dayIndex, day => ({ ...day, training: day.training.filter(e => e.id !== itemId) }));
    else updatePlanDay(planId, dayIndex, day => ({ ...day, meals: day.meals.filter(m => m.id !== itemId) }));
  };

  // Self-load the active, dated plans (same as the Command Center week view).
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const index = await loadHealthPlanIndex();
        const actives = index.filter(p => p.status === 'active' && p.start_date);
        const full = (await Promise.all(actives.map(s => loadHealthPlan(s.id)))).filter(Boolean) as HealthPlan[];
        if (live) setPlans(full);
      } catch { /* none */ }
    })();
    return () => { live = false; };
  }, []);

  // Pull catalogue details for the date's items so thumbnails + macros resolve.
  useEffect(() => {
    for (const p of plans) {
      const day = planDayForDate(p, dateKey);
      if (!day) continue;
      for (const ex of day.training) { const s = ex.ref?.slug; if (s && !exerciseDetails[s]) loadExerciseDetail(s).then(d => { if (d) setExerciseDetails(prev => ({ ...prev, [s]: d })); }).catch(() => {}); }
      for (const meal of day.meals) { const s = meal.ref?.slug; if (s && !recipeDetails[s]) loadRecipeDetail(s).then(d => { if (d) setRecipeDetails(prev => ({ ...prev, [s]: d })); }).catch(() => {}); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, dateKey]);

  // Capture and BACKFILL in one place. Whenever a catalogue detail lands — for
  // an item just added, or for a plan written long before capture existed —
  // fill in what the day is missing and persist it.
  //
  // Doing both here rather than at the add site means an old plan is repaired
  // just by being opened, and the person most likely to want a shopping list is
  // exactly the one who already has a plan. fillDayMeta only ever ADDS, and
  // reports changed=false when there is nothing to do, so this settles rather
  // than looping.
  useEffect(() => {
    for (const p of plans) {
      const day = planDayForDate(p, dateKey);
      if (!day) continue;
      const { day: filled, changed } = fillDayMeta(day, recipeDetails, exerciseDetails);
      if (!changed) continue;
      const next = { ...p, days: p.days.map(d => (d.day_index === day.day_index ? filled : d)) };
      setPlans(prev => prev.map(x => (x.id === p.id ? next : x)));
      onSavePlan(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, dateKey, recipeDetails, exerciseDetails]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { sections, mealTotals, mealsEstimated, hasMeals } = useMemo(() => {
    const training: DayAgendaItem[] = [];
    const meals: DayAgendaItem[] = [];
    const allMeals: HealthPlanMeal[] = [];
    for (const p of plans) {
      const idx = dayIndexForDate(p, dateKey);
      if (idx == null) continue;
      const day = p.days.find(d => d.day_index === idx);
      if (!day) continue;
      if (p.type === 'fitness' || p.type === 'combined') {
        for (const ex of day.training) if (ex.name) training.push({ id: `${p.id}:${ex.id}`, planId: p.id, itemId: ex.id, dayIndex: idx, kind: 'exercise', slug: ex.ref?.slug, title: ex.name, meta: exerciseSummary(ex), thumb: ex.ref ? (exerciseDetails[ex.ref.slug]?.thumbnail_url ?? null) : null, planTitle: p.title });
      }
      if (p.type === 'meal' || p.type === 'combined') {
        for (const meal of day.meals) if (meal.name) {
          allMeals.push(meal);
          meals.push({ id: `${p.id}:${meal.id}`, planId: p.id, itemId: meal.id, dayIndex: idx, kind: 'recipe', slug: meal.ref?.slug, title: meal.name, meta: mealSummaryLine(meal, recipeDetails), slot: meal.slot, thumb: meal.ref ? (recipeDetails[meal.ref.slug]?.hero_image_url ?? null) : null, planTitle: p.title });
        }
      }
    }
    const { totals, estimated } = dayTotals({ day_index: 0, kind: 'rest', title: null, training: [], meals: allMeals, notes: null }, recipeDetails);
    const sections: DayAgendaSection[] = [
      { key: 'training', label: t('health.plans.training'), icon: '🏋', accent: 'var(--accent)', items: training },
      { key: 'meals', label: t('health.plans.meals'), icon: '🍽', accent: '#f59e0b', items: meals },
      // ── Future sources plug in here as more sections (tasks, learning, …) ──
    ];
    return { sections, mealTotals: totals, mealsEstimated: estimated, hasMeals: allMeals.length > 0 };
  }, [dateKey, plans, exerciseDetails, recipeDetails]);

  // Load this date's session so a tick patches what is already there rather
  // than seeding a second record for the same day.
  useEffect(() => {
    let cancelled = false;
    sessionsForDate(dateKey)
      .then(list => { if (!cancelled) setDaySession(list.find(s => s.source === 'plan') ?? list[0] ?? null); })
      .catch(() => { if (!cancelled) setDaySession(null); });
    return () => { cancelled = true; };
  }, [dateKey]);

  const openItem = (item: DayAgendaItem) => {
    if (!item.slug) return;
    if (item.kind === 'exercise') loadExerciseDetail(item.slug).then(d => { if (d) setExerciseDetails(prev => ({ ...prev, [item.slug!]: d })); }).catch(() => {});
    else loadRecipeDetail(item.slug).then(d => { if (d) setRecipeDetails(prev => ({ ...prev, [item.slug!]: d })); }).catch(() => {});
    // Carry the plan and item ids: without them the modal can show the guide
    // but has nothing to attach a fact to.
    setDetail({ kind: item.kind, slug: item.slug, name: item.title, planId: item.planId, itemId: item.itemId });
  };

  // ── What actually happened ────────────────────────────────────────────────
  //
  // Two destinations, deliberately:
  //
  //   meals     → the PLAN ROW (`meal.logged`). The plan store exists on every
  //               surface and travels with export/import.
  //   exercises → the SESSION record, which is what the observing loop and
  //               summariseTrainingLog already read. A tick there is the same
  //               fact as a logged set, just without the numbers — so there is
  //               one source of truth about whether Thursday happened.

  const readItemLog = (kind: 'exercise' | 'recipe', planId: string, itemId: string): ItemLogState => {
    if (kind === 'recipe') {
      const plan = plans.find(p => p.id === planId);
      const meal = plan ? planDayForDate(plan, dateKey)?.meals.find(m => m.id === itemId) : null;
      if (meal?.logged) return { state: meal.logged.state, note: meal.logged.note ?? '' };
      return { state: null, note: '' };
    }
    const ex = daySession?.exercises.find(e => e.ref?.slug === detail?.slug);
    if (!ex) return { state: null, note: '' };
    const st = (ex as { state?: string }).state;
    return {
      state: st === 'done' || st === 'skipped' ? st : null,
      // The legacy magic string: 'skipped' used to live in notes before the
      // typed field existed. Never show it back as if the user wrote it.
      note: typeof ex.notes === 'string' && ex.notes !== 'skipped' ? ex.notes : '',
    };
  };

  const saveItemLog = (kind: 'exercise' | 'recipe', planId: string, itemId: string, next: ItemLogState) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    const day = planDayForDate(plan, dateKey);
    if (!day) return;

    if (kind === 'recipe') {
      const meals = day.meals.map(m => m.id === itemId
        ? {
            ...m,
            logged: next.state
              ? { state: next.state as 'ate' | 'skipped' | 'other', note: next.note.trim() || null, at: new Date().toISOString() }
              // Clearing writes null, not a blank record. Unrecorded and
              // "recorded as nothing" are different, and only one is honest.
              : null,
          }
        : m);
      onSavePlan({ ...plan, days: plan.days.map(d => (d.day_index === day.day_index ? { ...day, meals } : d)) });
      setPlans(prev => prev.map(p => (p.id === plan.id
        ? { ...p, days: p.days.map(d => (d.day_index === day.day_index ? { ...day, meals } : d)) }
        : p)));
      return;
    }

    // Exercise: into the SESSION, which is what the observing loop reads. Patch
    // the loaded session when there is one for this date, otherwise seed one
    // from the plan day so a tick works even when nothing has been logged yet.
    const base: GymSession = daySession ?? {
      ...freshGymSession({ date: dateKey, source: 'plan', title: day.title, plan_id: plan.id, day_index: day.day_index }),
      exercises: day.training.map(gymExerciseFromPlan),
    };
    const exercises: GymExercise[] = base.exercises.map(e =>
      (e.ref?.slug && e.ref.slug === detail?.slug)
        ? { ...e, state: next.state === 'done' || next.state === 'skipped' ? next.state : null, notes: next.note.trim() || null }
        : e);
    const anyDone = exercises.some(e => e.state === 'done' || e.sets.length > 0);
    const anySkipped = exercises.some(e => e.state === 'skipped');
    const saved: GymSession = {
      ...base,
      exercises,
      status: anyDone ? 'completed' : anySkipped ? 'skipped' : 'in-progress',
      updated_at: new Date().toISOString(),
    };
    setDaySession(saved);
    saveSession(saved).catch(() => { /* non-fatal — the tick is still on screen */ });
  };

  const date = new Date(`${dateKey}T00:00:00`);
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const anything = sections.some(s => s.items.length > 0);
  const covered = plans.some(p => dayIndexForDate(p, dateKey) != null);

  // The one plan day this date belongs to — what the log sheet is filled from.
  // Training only: a meal-only plan has nothing to log a session against, and
  // offering the sheet there would promise something it cannot deliver.
  const loggableDay = (() => {
    for (const p of plans) {
      if (p.type !== 'fitness' && p.type !== 'combined') continue;
      const day = planDayForDate(p, dateKey);
      if (day?.training.length) return { plan: p, day };
    }
    return null;
  })();
  const [logging, setLogging] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [prepping, setPrepping] = useState(false);
  // Duplicate is per plan-day: which plan's day is being copied has to be
  // unambiguous, so it opens from the covered plan for this date.
  const [duplicating, setDuplicating] = useState<{ plan: HealthPlan; dayIndex: number } | null>(null);
  const dupSource = (() => {
    for (const p of plans) {
      const idx = dayIndexForDate(p, dateKey);
      if (idx != null) return { plan: p, dayIndex: idx };
    }
    return null;
  })();
  // Prep is per PLAN, not per day — it reasons across the week to find what to
  // cook once. The meal plan covering this date is the one it means.
  const preppablePlan = plans.find(p => (p.type === 'meal' || p.type === 'combined') && dayIndexForDate(p, dateKey) != null) ?? null;
  // Household size lives on the profile and is the only thing the list needs
  // from it. Loaded once with the view rather than on open, so the sheet is
  // instant when tapped.
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  useEffect(() => { loadHealthProfile().then(setProfile).catch(() => setProfile(null)); }, []);
  // Hold the modal's size steady while editing (freeze height on entering Edit)
  // with a min height so it never collapses as items are added / deleted.
  const enterEdit = () => { setFrozenH(panelRef.current?.offsetHeight ?? null); setEditing(true); };
  const exitEdit = () => { flushSaves(); setInlineSearch(null); setConfirmingId(null); setFrozenH(null); setEditing(false); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      <div ref={panelRef} onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 760, minHeight: MIN_PANEL_H, maxHeight: '88vh', ...(editing && frozenH ? { height: Math.max(frozenH, MIN_PANEL_H) } : {}), overflow: 'hidden', borderRadius: 14, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'linear-gradient(to bottom right, #100d1a, #181327)', boxShadow: '0 0 80px color-mix(in srgb, var(--accent) 15%, transparent)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)', padding: '12px 24px' }}>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUTED }}>{t('health.plans.on_this_day')}</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: TEXT, margin: 0 }}>{dateLabel}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Logging a future day is a fiction, same rule as the per-item
                recording column. */}
            {dupSource && !editing && (
              <button type="button" onClick={() => setDuplicating(dupSource)} style={{ ...accentBtn(true), padding: '6px 12px', fontSize: 11 }}>
                {t('health.dup.title')}
              </button>
            )}
            {preppablePlan && !editing && (
              <button type="button" onClick={() => setPrepping(true)} style={{ ...accentBtn(true), padding: '6px 12px', fontSize: 11 }}>
                {t('health.prep.title')}
              </button>
            )}
            {hasMeals && !editing && (
              <button type="button" onClick={() => setShopping(true)} style={{ ...accentBtn(true), padding: '6px 12px', fontSize: 11 }}>
                {t('health.shopping.title')}
              </button>
            )}
            {loggableDay && dateKey <= todayISO() && !editing && (
              <button type="button" onClick={() => setLogging(true)} style={{ ...accentBtn(true), padding: '6px 12px', fontSize: 11 }}>
                {t('health.log.open')}
              </button>
            )}
            {covered && (
              <button type="button" onClick={() => (editing ? exitEdit() : enterEdit())} style={{ ...accentBtn(true), padding: '6px 12px', fontSize: 11 }}>
                {editing ? t('health.plans.done') : t('health.plans.edit')}
              </button>
            )}
            <button type="button" onClick={() => { flushSaves(); onClose(); }} aria-label={t('health.plans.cancel')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32, width: 32, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.3)', color: MUTED, fontSize: 15, cursor: 'pointer' }}>×</button>
          </div>
        </div>

        <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!editing && !anything ? (
            <div style={{ borderRadius: 8, border: `1px dashed ${BORDER}`, padding: '48px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: TEXT2 }}>{t('health.plans.day_empty')}</div>
              <button type="button" onClick={onNewPlan} style={{ ...accentBtn(true), margin: '12px auto 0', padding: '6px 12px', fontSize: 11 }}>{t('health.plans.new_plan')}</button>
            </div>
          ) : sections.map(section => {
            const sectionKey = section.key as 'training' | 'meals';
            const addTarget = sectionKey === 'training' ? addTargets.training : addTargets.meals;
            const searchKind: 'exercise' | 'recipe' = sectionKey === 'training' ? 'exercise' : 'recipe';
            const open = editing && inlineSearch?.section === sectionKey;
            return (
              <div key={section.key}>
                <div style={{ marginBottom: 8, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: MUTED }}>
                    <span aria-hidden>{section.icon}</span>{section.label}
                    {section.items.length > 0 && <span style={{ opacity: 0.6 }}>· {section.items.length}</span>}
                  </span>
                  {editing && addTarget && (
                    <button type="button"
                      onClick={() => setInlineSearch(open && inlineSearch?.mode === 'add' ? null : { section: sectionKey, kind: searchKind, mode: 'add', planId: addTarget.planId, dayIndex: addTarget.dayIndex })}
                      style={{ ...accentBtn(true), padding: '4px 10px', fontSize: 11 }}>
                      {sectionKey === 'training' ? t('health.plans.add_exercises') : t('health.plans.add_recipes')}
                    </button>
                  )}
                </div>

                {open && inlineSearch && (
                  <InlineCatalogSearch
                    kind={inlineSearch.kind}
                    mode={inlineSearch.mode}
                    accent={section.accent}
                    results={inlineSearch.kind === 'exercise' ? exResults : recResults}
                    searching={searching}
                    onSearch={inlineSearch.kind === 'exercise' ? searchExercises : searchRecipes}
                    onPick={handleInlinePick}
                    onClose={() => setInlineSearch(null)}
                  />
                )}

                {section.items.length === 0 ? (
                  <div style={{ borderRadius: 6, border: `1px dashed ${BORDER}`, padding: '10px 12px', fontSize: 11, fontStyle: 'italic', color: MUTED }}>
                    {sectionKey === 'training' ? t('health.plans.no_workout') : t('health.plans.no_meals')}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
                    {section.items.map(item => (
                      editing ? (
                        <div key={item.id} title={item.planTitle}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.015)', padding: 8, textAlign: 'left' }}>
                          <AgendaCardInner item={item} icon={section.icon} accent={section.accent} />
                          {confirmingId === item.id ? (
                            <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 6, borderRadius: 6, border: '1px solid rgba(243,139,168,0.3)', background: INPUT_BG, padding: '4px 8px' }}>
                              <span style={{ fontSize: 10, color: TEXT2 }}>{t('health.plans.delete_q')}</span>
                              <button type="button" onClick={() => { deleteItem(sectionKey, item.planId, item.dayIndex, item.itemId); setConfirmingId(null); }} style={{ border: 'none', background: 'transparent', fontSize: 10, fontWeight: 600, color: RED, cursor: 'pointer' }}>{t('health.plans.yes')}</button>
                              <button type="button" onClick={() => setConfirmingId(null)} style={{ border: 'none', background: 'transparent', fontSize: 10, color: MUTED, cursor: 'pointer' }}>{t('health.plans.no')}</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 2 }}>
                              <button type="button" title={t('health.plans.swap')}
                                onClick={() => setInlineSearch({ section: sectionKey, kind: searchKind, mode: 'swap', planId: item.planId, dayIndex: item.dayIndex, itemId: item.itemId })}
                                style={{ display: 'flex', height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', fontSize: 12, color: MUTED, cursor: 'pointer' }}>⇄</button>
                              <button type="button" title={t('health.plans.remove')}
                                onClick={() => setConfirmingId(item.id)}
                                style={{ display: 'flex', height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', fontSize: 12, color: MUTED, cursor: 'pointer' }}>✕</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button key={item.id} type="button" disabled={!item.slug} onClick={() => openItem(item)} title={item.planTitle}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.015)', padding: 8, textAlign: 'left', cursor: item.slug ? 'pointer' : 'default' }}>
                          <AgendaCardInner item={item} icon={section.icon} accent={section.accent} />
                        </button>
                      )
                    ))}
                  </div>
                )}
                {sectionKey === 'meals' && hasMeals && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: 6, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.05)', padding: '8px 12px' }}>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(252,211,77,0.8)' }}>{t('health.plans.day_total')}</span>
                    {MACRO_FIELDS.map(f => (
                      <span key={f.key} style={{ fontSize: 11, color: TEXT2 }}>{t(f.labelKey)} <span style={{ fontWeight: 600, color: TEXT }}>{mealTotals[f.key] ?? 0}{f.unit}</span></span>
                    ))}
                    {mealsEstimated && <span style={{ fontSize: 9, fontStyle: 'italic', color: MUTED }}>{t('health.plans.estimated')}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {duplicating && (
          <DuplicateSheet
            plan={duplicating.plan}
            fromDay={duplicating.dayIndex}
            onApply={next => { setPlans(prev => prev.map(p => (p.id === next.id ? next : p))); onSavePlan(next); }}
            onClose={() => setDuplicating(null)}
          />
        )}

        {prepping && preppablePlan && (
          <PrepSheet plan={preppablePlan} profile={profile} onClose={() => setPrepping(false)} />
        )}

        {shopping && (
          <ShoppingListSheet
            plan={null}
            plans={plans}
            profile={profile}
            onClose={() => setShopping(false)}
          />
        )}

        {logging && loggableDay && (
          <LogSessionSheet
            day={loggableDay.day}
            planId={loggableDay.plan.id}
            date={dateKey}
            existing={daySession}
            onSave={s => { setDaySession(s); saveSession(s).catch(() => { /* non-fatal — it is still on screen */ }); }}
            onClose={() => setLogging(false)}
          />
        )}

        {detail && (
          <ItemDetailModal
            detail={detail}
            exercise={detail.kind === 'exercise' ? exerciseDetails[detail.slug] : undefined}
            recipe={detail.kind === 'recipe' ? recipeDetails[detail.slug] : undefined}
            /* Recording only on a day that has actually been. Ticking tomorrow
               is a fiction, and an item with no plan row has nothing to attach
               a fact to. */
            log={detail.planId && detail.itemId && dateKey <= todayISO()
              ? {
                  current: readItemLog(detail.kind, detail.planId, detail.itemId),
                  onSave: next => saveItemLog(detail.kind, detail.planId!, detail.itemId!, next),
                }
              : undefined}
            onClose={() => setDetail(null)}
          />
        )}
      </div>

    </div>
  );
}

/** Thumbnail + title/meta/plan block — shared by the read card and the edit
 *  card so both look identical (image-1 design); only the trailing control
 *  differs (open-detail vs swap/delete). */
function AgendaCardInner({ item, icon, accent }: { item: DayAgendaItem; icon: string; accent: string }) {
  return (
    <>
      <div style={{ position: 'relative', height: 48, width: 48, flexShrink: 0, overflow: 'hidden', borderRadius: 8, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
        {item.thumb
          ? <img src={item.thumb} alt="" loading="lazy" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
          : <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `linear-gradient(135deg, ${accent}2e, ${accent}0d)` }} aria-hidden>{icon}</div>}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.slot && <span style={{ marginRight: 6, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em', color: MUTED }}>{item.slot}</span>}{item.title}
        </div>
        {item.meta && <div style={{ fontSize: 10, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.meta}</div>}
        <div style={{ fontSize: 9, color: MUTED, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.planTitle}</div>
      </div>
    </>
  );
}

/** Compact catalogue search that drops INLINE inside a section (no overlay).
 *  Picking a result adds it / swaps it in place. */
function InlineCatalogSearch({ kind, mode, accent, results, searching, onSearch, onPick, onClose }: {
  kind: 'exercise' | 'recipe';
  mode: 'add' | 'swap';
  accent: string;
  results: Array<HealthExerciseSummary | HealthRecipeSummary>;
  searching: boolean;
  onSearch: PlanSearch;
  onPick: (it: { slug: string; name: string }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => {
    const tmr = window.setTimeout(() => onSearch({ q: query.trim(), offset: 0, category: null }), query ? 300 : 0);
    return () => clearTimeout(tmr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const icon = kind === 'exercise' ? '🏋' : '🍽';
  return (
    <div style={{ marginBottom: 8, borderRadius: 10, border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', padding: 8 }}>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
          placeholder={kind === 'exercise' ? t('health.plans.picker.search_exercises') : t('health.plans.picker.search_recipes')}
          style={{ ...inputStyle, flex: 1 }} />
        <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ flexShrink: 0, border: 'none', background: 'transparent', padding: '4px 6px', color: MUTED, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ maxHeight: 230, overflowY: 'auto' }}>
        {searching && results.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: MUTED }}>{t('health.plans.searching')}</div>
        ) : results.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: MUTED }}>{kind === 'exercise' ? t('health.plans.picker.no_exercises') : t('health.plans.picker.no_recipes')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 6 }}>
            {results.map(r => {
              const slug = (r as HealthExerciseSummary | HealthRecipeSummary).slug;
              const name = (r as HealthExerciseSummary | HealthRecipeSummary).name;
              const thumb = kind === 'exercise' ? ((r as HealthExerciseSummary).thumbnail_url ?? null) : ((r as HealthRecipeSummary).hero_image_url ?? null);
              return (
                <button key={slug} type="button" onClick={() => onPick({ slug, name })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.015)', padding: 6, textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ position: 'relative', height: 36, width: 36, flexShrink: 0, overflow: 'hidden', borderRadius: 6, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                    {thumb
                      ? <img src={thumb} alt="" loading="lazy" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                      : <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: `linear-gradient(135deg, ${accent}2e, ${accent}0d)` }} aria-hidden>{icon}</div>}
                  </div>
                  <span style={{ minWidth: 0, flex: 1, fontSize: 11, fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ flexShrink: 0, fontSize: 12, color: ACCENT }}>{mode === 'swap' ? '⇄' : '+'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan, onOpen, onDelete }: {
  plan: HealthPlanSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const m = PLAN_TYPE_META[plan.type];
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 8, border: `1px solid ${BORDER}` }}>
      <div style={{ height: 3, background: m.accent }} />
      <button type="button" onClick={onOpen} style={{ display: 'block', width: '100%', border: 'none', background: 'transparent', padding: '10px 14px', textAlign: 'left', cursor: 'pointer' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ borderRadius: 4, border: `1px solid ${m.accent}`, padding: '1px 6px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: m.accent }}>{planTypeLabel(plan.type)}</span>
          <span style={{ borderRadius: 4, padding: '1px 6px', fontSize: 9, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: TEXT2 }}>{planStatusLabel(plan.status)}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: TEXT }}>{plan.title}</div>
        <div style={{ marginTop: 4, fontSize: 10, color: MUTED }}>{durationLabel(plan.duration_days)} · {t('health.plans.built_by_you')}</div>
      </button>
      {confirming ? (
        <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', gap: 6, alignItems: 'center', borderRadius: 6, border: '1px solid rgba(243,139,168,0.3)', background: INPUT_BG, padding: '4px 8px' }}>
          <span style={{ fontSize: 10, color: TEXT2 }}>{t('health.plans.delete_q')}</span>
          <button type="button" onClick={() => { onDelete(); setConfirming(false); }} style={{ border: 'none', background: 'transparent', fontSize: 10, fontWeight: 600, color: RED, cursor: 'pointer' }}>{t('health.plans.yes')}</button>
          <button type="button" onClick={() => setConfirming(false)} style={{ border: 'none', background: 'transparent', fontSize: 10, color: MUTED, cursor: 'pointer' }}>{t('health.plans.no')}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} title={t('health.plans.delete_plan')} style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'transparent', padding: 4, color: MUTED, cursor: 'pointer' }}>✕</button>
      )}
    </div>
  );
}

// ── Overlay — one fixed size, never resizes between phases ────────────
function PlanOverlay(props: {
  planOpen: HealthPlan | null;
  onCancelSetup: () => void;
  onCreate: (plan: HealthPlan) => void;
  onClose: () => void;
  onSave: (plan: HealthPlan) => void;
  onDelete: (id: string) => void;
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  exerciseTotal: number;
  recipeTotal: number;
  searching: boolean;
  onSearchExercises: PlanSearch;
  onSearchRecipes: PlanSearch;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 24 }}>
      <div style={{
        display: 'flex', flexDirection: 'column', maxHeight: '88vh', width: '100%', maxWidth: props.planOpen ? 880 : 720,
        overflow: 'hidden', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: PANEL_BG,
        boxShadow: '0 0 80px color-mix(in srgb, var(--accent) 15%, transparent)',
      }}>
        {props.planOpen
          ? <PlanBuilder
              plan={props.planOpen}
              onClose={props.onClose}
              onSave={props.onSave}
              onDelete={props.onDelete}
              exerciseResults={props.exerciseResults}
              recipeResults={props.recipeResults}
              exerciseTotal={props.exerciseTotal}
              recipeTotal={props.recipeTotal}
              searching={props.searching}
              onSearchExercises={props.onSearchExercises}
              onSearchRecipes={props.onSearchRecipes}
              exerciseDetails={props.exerciseDetails}
              recipeDetails={props.recipeDetails}
              onLoadExerciseDetail={props.onLoadExerciseDetail}
              onLoadRecipeDetail={props.onLoadRecipeDetail}
            />
          : <PlanSetup onCancel={props.onCancelSetup} onCreate={props.onCreate} />}
      </div>
    </div>
  );
}

// ── Setup phase ───────────────────────────────────────────────────────
function PlanSetup({ onCancel, onCreate }: { onCancel: () => void; onCreate: (plan: HealthPlan) => void }) {
  const [type, setType] = useState<HealthPlanType | null>(null);
  const [duration, setDuration] = useState(28);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${BORDER}`, padding: '16px 24px' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>{t('health.plans.new_plan_title_short')}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>{t('health.plans.setup_subtitle')}</div>
        </div>
        <button type="button" onClick={onCancel} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>{t('health.plans.cancel')}</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ ...sectionCap, marginBottom: 8 }}>{t('health.plans.type_label')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {(['fitness', 'meal', 'combined'] as HealthPlanType[]).map(ty => {
              const m = PLAN_TYPE_META[ty];
              const on = type === ty;
              return (
                <button key={ty} type="button" onClick={() => setType(ty)} style={{
                  borderRadius: 8, padding: 16, textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                }}>
                  <div style={{ marginBottom: 8, height: 3, width: 40, borderRadius: 2, background: m.accent }} />
                  <div style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{planTypeLabel(ty)}</div>
                  <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5, color: MUTED }}>{planTypeBlurb(ty)}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ ...sectionCap, marginBottom: 8 }}>{t('health.plans.length_label')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DURATION_PRESETS.map(days => {
              const on = duration === days;
              return (
                <button key={days} type="button" onClick={() => setDuration(days)} style={{
                  borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  color: on ? ACCENT : MUTED,
                }}>{durationLabel(days)}</button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: `1px solid ${BORDER}`, padding: '16px 24px' }}>
        <button type="button" disabled={!type} onClick={() => { if (type) onCreate(blankPlan(type, duration)); }} style={accentBtn(!!type)}>
          {t('health.plans.start_building')}
        </button>
        {!type && <span style={{ fontSize: 10, fontStyle: 'italic', color: MUTED }}>{t('health.plans.pick_type_first')}</span>}
      </div>
    </div>
  );
}

// ── Builder phase ─────────────────────────────────────────────────────
function PlanBuilder(props: {
  plan: HealthPlan;
  onClose: () => void;
  onSave: (plan: HealthPlan) => void;
  onDelete: (id: string) => void;
  exerciseResults: HealthExerciseSummary[];
  recipeResults: HealthRecipeSummary[];
  exerciseTotal: number;
  recipeTotal: number;
  searching: boolean;
  onSearchExercises: PlanSearch;
  onSearchRecipes: PlanSearch;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
}) {
  const { plan, onClose, onSave, onDelete, exerciseDetails, recipeDetails, onLoadExerciseDetail, onLoadRecipeDetail } = props;
  const [draft, setDraft] = useState<HealthPlan>(plan);
  const [selectedDay, setSelectedDay] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [picker, setPicker] = useState<'exercise' | 'recipe' | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const prefilled = useRef<Set<string>>(new Set());

  useEffect(() => {
    setDraft(plan);
    setSelectedDay(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const commit = useCallback((next: HealthPlan) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onSave(next), 700);
  }, [onSave]);
  const closeWithFlush = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); onSave(draft); }
    onClose();
  };

  const m = PLAN_TYPE_META[draft.type];
  const showTraining = draft.type === 'fitness' || draft.type === 'combined';
  const showMeals = draft.type === 'meal' || draft.type === 'combined';

  const dayByIndex = useMemo(() => {
    const map = new Map<number, HealthPlanDay>();
    for (const d of draft.days) map.set(d.day_index, d);
    return map;
  }, [draft.days]);

  // On open, load detail for referenced catalogue items.
  useEffect(() => {
    const ex = new Set<string>();
    const rec = new Set<string>();
    for (const d of plan.days) {
      for (const e of d.training) if (e.ref) ex.add(e.ref.slug);
      for (const ml of d.meals) if (ml.ref) rec.add(ml.ref.slug);
    }
    ex.forEach(s => { if (!exerciseDetails[s]) onLoadExerciseDetail(s); });
    rec.forEach(s => { if (!recipeDetails[s]) onLoadRecipeDetail(s); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);

  // Pre-fill an exercise's routine once its detail arrives.
  useEffect(() => {
    let changed = false;
    const days = draft.days.map(day => {
      let dayChanged = false;
      const training = day.training.map(ex => {
        if (!ex.ref || prefilled.current.has(ex.id)) return ex;
        if (ex.sets != null || ex.reps != null || ex.rest_seconds != null) { prefilled.current.add(ex.id); return ex; }
        const det = exerciseDetails[ex.ref.slug];
        if (!det) return ex;
        prefilled.current.add(ex.id);
        dayChanged = true;
        const r = det.routine;
        const setsNum = typeof r.sets === 'number' ? r.sets : typeof r.sets === 'string' ? (parseInt(r.sets, 10) || null) : null;
        return { ...ex, sets: setsNum, reps: r.reps_target ?? ex.reps, rest_seconds: r.rest_seconds ?? ex.rest_seconds, tempo: r.tempo ?? ex.tempo };
      });
      if (dayChanged) { changed = true; return { ...day, training }; }
      return day;
    });
    if (changed) commit({ ...draft, days });
  }, [exerciseDetails, draft, commit]);

  const upsertDay = (day: HealthPlanDay) => {
    const days = draft.days.filter(d => d.day_index !== day.day_index);
    if (!isEmptyDay(day)) days.push(day);
    days.sort((a, b) => a.day_index - b.day_index);
    commit({ ...draft, days });
  };
  const setDuration = (days: number) => {
    commit({ ...draft, duration_days: days, days: draft.days.filter(d => d.day_index <= days) });
    if (selectedDay > days) setSelectedDay(days);
  };
  const addExercises = (items: Array<{ slug: string; name: string } | null>) => {
    const day = dayByIndex.get(selectedDay) ?? defaultDay(selectedDay);
    const added: HealthPlanExercise[] = items.map(it =>
      it ? { ...emptyExercise(), ref: { kind: 'exercise', slug: it.slug }, name: it.name } : emptyExercise());
    for (const it of items) if (it) onLoadExerciseDetail(it.slug);
    upsertDay({ ...day, kind: day.kind === 'rest' ? 'training' : day.kind, training: [...day.training, ...added] });
    setPicker(null);
  };
  const addMeals = (items: Array<{ slug: string; name: string } | null>) => {
    const day = dayByIndex.get(selectedDay) ?? defaultDay(selectedDay);
    const added: HealthPlanMeal[] = items.map(it =>
      it ? { ...emptyMeal('breakfast'), ref: { kind: 'recipe', slug: it.slug }, name: it.name, servings: 1 } : emptyMeal('breakfast'));
    for (const it of items) if (it) onLoadRecipeDetail(it.slug);
    upsertDay({ ...day, meals: [...day.meals, ...added] });
    setPicker(null);
  };

  const selDay = dayByIndex.get(selectedDay) ?? defaultDay(selectedDay);

  if (picker) {
    return (
      <CatalogPickerPanel
        kind={picker}
        results={picker === 'exercise' ? props.exerciseResults : props.recipeResults}
        total={picker === 'exercise' ? props.exerciseTotal : props.recipeTotal}
        searching={props.searching}
        onSearch={picker === 'exercise' ? props.onSearchExercises : props.onSearchRecipes}
        onConfirm={(items) => { if (picker === 'exercise') addExercises(items); else addMeals(items); }}
        onClose={() => setPicker(null)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div style={{ flexShrink: 0, borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button type="button" onClick={closeWithFlush} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>{t('health.plans.all_plans')}</button>
          <span style={{ fontSize: 10, color: MUTED }}>{t('health.plans.autosave')}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ borderRadius: 4, border: `1px solid ${m.accent}`, padding: '1px 6px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: m.accent }}>{planTypeLabel(draft.type)}</span>
          <input value={draft.title} onChange={e => commit({ ...draft, title: e.target.value })} placeholder={t('health.plans.title_placeholder')}
            style={{ ...inputStyle, flex: 1, minWidth: 180, fontSize: 14 }} />
          <PlanSelect value={draft.status} onChange={v => commit({ ...draft, status: v as HealthPlanStatus })}
            options={[{ value: 'draft', label: planStatusLabel('draft') }, { value: 'active', label: planStatusLabel('active') }, { value: 'completed', label: planStatusLabel('completed') }, { value: 'archived', label: planStatusLabel('archived') }]} />
          <PlanSelect value={String(draft.duration_days)} onChange={v => setDuration(Number(v))}
            options={DURATION_PRESETS.map(days => ({ value: String(days), label: durationLabel(days) }))} />
        </div>
        <input value={draft.goal ?? ''} onChange={e => commit({ ...draft, goal: e.target.value || null })}
          placeholder={t('health.plans.goal_placeholder')} style={{ ...inputStyle, width: '100%' }} />
      </div>

      {/* Body — compact: pick a day from the strip, then its Workouts / Meals
          sections. No calendar; the day strip is the navigation. */}
      <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {draft.days.map(d => {
            const date = planDate(draft.start_date, d.day_index);
            const active = selectedDay === d.day_index;
            const has = (showTraining && d.training.length > 0) || (showMeals && d.meals.length > 0);
            return (
              <button key={d.day_index} type="button" onClick={() => setSelectedDay(d.day_index)}
                style={{ borderRadius: 8, border: `1px solid ${active ? ACCENT : BORDER}`, background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', padding: '6px 10px', textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: active ? ACCENT : TEXT }}>
                  {t('health.plans.day_n', { n: d.day_index })}
                  {has && <span style={{ height: 6, width: 6, borderRadius: 999, background: ACCENT }} aria-hidden />}
                </div>
                <div style={{ marginTop: 4, fontSize: 9, color: MUTED }}>
                  {date ? date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) : (d.kind === 'rest' ? t('health.week.rest') : '·')}
                </div>
              </button>
            );
          })}
        </div>
        <DayPanel
          day={selDay}
          startDate={draft.start_date}
          showTraining={showTraining}
          showMeals={showMeals}
          recipeDetails={recipeDetails}
          exerciseDetails={exerciseDetails}
          onChange={upsertDay}
          onAddExercises={() => setPicker('exercise')}
          onAddMeals={() => setPicker('recipe')}
          onLoadExerciseDetail={onLoadExerciseDetail}
          onLoadRecipeDetail={onLoadRecipeDetail}
        />
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', borderTop: `1px solid ${BORDER}`, padding: '12px 24px' }}>
        {confirming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: TEXT2 }}>{t('health.plans.delete_confirm')}</span>
            <button type="button" onClick={() => { onDelete(draft.id); onClose(); }} style={{ borderRadius: 6, border: '1px solid rgba(243,139,168,0.3)', background: 'rgba(243,139,168,0.1)', padding: '6px 12px', fontSize: 11, fontWeight: 600, color: RED, cursor: 'pointer' }}>{t('health.plans.delete')}</button>
            <button type="button" onClick={() => setConfirming(false)} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>{t('health.plans.cancel')}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>{t('health.plans.delete_plan')}</button>
        )}
      </div>
    </div>
  );
}

// ── Month calendar ────────────────────────────────────────────────────
function MonthCalendar({ month, onMonthChange, marks, content, selected, onSelectDate, fill }: {
  month: Date;
  onMonthChange: (d: Date) => void;
  marks: Map<string, { training: boolean; meals: boolean }>;
  /** Per-date plan content — session title + the day's moves / meals — so cells
   *  show what's on, not just a dot. Falls back to `marks` dots where absent. */
  content?: Map<string, { title: string | null; training: string[]; meals: string[] }>;
  selected: string | null;
  onSelectDate: (key: string) => void;
  /** Fill the container — cells stretch to equal-height squares (auto-rows-fr)
   *  filling a tall calendar, matching the extension's Plans calendar. */
  fill?: boolean;
}) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDow = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, mon, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const today = todayISO();
  const monthLabel = new Date(year, mon, 1).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
  const navBtn: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28, width: 28,
    borderRadius: 6, border: 'none', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: TEXT2, fontSize: 14, cursor: 'pointer',
  };

  return (
    <div style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', background: PANEL_BG, ...(fill ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : {}) }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, background: 'color-mix(in srgb, var(--accent) 5%, transparent)', padding: '8px 16px' }}>
        <button type="button" aria-label={t('health.plans.prev_month')} onClick={() => onMonthChange(new Date(year, mon - 1, 1))} style={navBtn}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{monthLabel}</span>
        <button type="button" aria-label={t('health.plans.next_month')} onClick={() => onMonthChange(new Date(year, mon + 1, 1))} style={navBtn}>›</button>
      </div>
      <div style={{ padding: 12, ...(fill ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : {}) }}>
        <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: MUTED }}>{weekdayInitial(i)}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, ...(fill ? { flex: 1, gridAutoRows: '1fr' } : { gridAutoRows: '62px', alignContent: 'start' }) }}>
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const key = ymd(date);
            const mk = marks.get(key);
            const c = content?.get(key);
            const isToday = key === today;
            const isSelected = key === selected;
            const hasContent = !!mk && (mk.training || mk.meals);
            const items = c ? [
              ...c.training.map(name => ({ icon: '🏋', name })),
              ...c.meals.map(name => ({ icon: '🍽', name })),
            ] : [];
            const shown = items.slice(0, fill ? 4 : 2);
            const extra = items.length - shown.length;
            return (
              <button key={i} type="button" onClick={() => onSelectDate(key)} style={{
                // The grid forces every ROW to a fixed 62px (gridAutoRows), so no
                // day's content can drag its week taller — every cell is identical.
                // minHeight:0 + overflow:hidden lets a busy day clip instead of grow.
                display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0, boxSizing: 'border-box', overflow: 'hidden', borderRadius: 8, padding: 6, textAlign: 'left', cursor: 'pointer',
                border: `1px solid ${isSelected ? ACCENT : hasContent ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : BORDER_SOFT}`,
                background: isSelected ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : hasContent ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', height: 17, width: 17, borderRadius: 9, fontSize: 10,
                    background: isToday ? ACCENT : 'transparent',
                    color: isToday ? '#fff' : isSelected ? ACCENT : TEXT2,
                    fontWeight: isToday ? 700 : isSelected ? 600 : 500,
                  }}>{date.getDate()}</span>
                  {/* Dots only when there's no detailed content to show. */}
                  {!c && (mk?.training || mk?.meals) && (
                    <span style={{ display: 'flex', gap: 3 }}>
                      {mk?.training && <span style={{ height: 6, width: 6, borderRadius: 3, background: ACCENT }} />}
                      {mk?.meals && <span style={{ height: 6, width: 6, borderRadius: 3, background: AMBER }} />}
                    </span>
                  )}
                </div>
                {c && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                    {c.title && <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>}
                    {shown.map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, lineHeight: 1.2, color: TEXT2 }}>
                        <span aria-hidden style={{ flexShrink: 0, opacity: 0.7 }}>{it.icon}</span>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                      </div>
                    ))}
                    {extra > 0 && <div style={{ fontSize: 8, color: MUTED }}>+{extra} more</div>}
                    {c.title && items.length === 0 && <div style={{ fontSize: 9, fontStyle: 'italic', color: MUTED }}>{t('health.week.rest')}</div>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Day editor ────────────────────────────────────────────────────────
function DayPanel({ day, startDate, showTraining, showMeals, recipeDetails, exerciseDetails, onChange, onAddExercises, onAddMeals, onLoadExerciseDetail, onLoadRecipeDetail }: {
  day: HealthPlanDay;
  startDate: string | null;
  showTraining: boolean;
  showMeals: boolean;
  recipeDetails: Record<string, HealthRecipeDetail>;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  onChange: (day: HealthPlanDay) => void;
  onAddExercises: () => void;
  onAddMeals: () => void;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
}) {
  const date = planDate(startDate, day.day_index);
  const { totals, estimated } = useMemo(() => dayTotals(day, recipeDetails), [day, recipeDetails]);
  const [editing, setEditing] = useState(false);
  // Navigating to another day drops back to the calm read view.
  useEffect(() => { setEditing(false); }, [day.day_index]);

  const dayN = t('health.plans.day_n', { n: day.day_index });
  const dateLabel = date ? `${weekdayLabel(date.getDay())} ${date.getDate()} — ${dayN}` : dayN;
  const kindLabel = day.kind === 'training' ? t('health.plans.kind.training') : day.kind === 'active_recovery' ? t('health.plans.kind.active_recovery') : t('health.plans.kind.rest');
  const wrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', padding: 16 };
  const editBtn: CSSProperties = { ...accentBtn(true), padding: '4px 10px', fontSize: 11 };

  if (!editing) {
    return (
      <div style={wrapStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{dateLabel}</span>
          <span style={{ borderRadius: 4, border: `1px solid ${BORDER}`, padding: '1px 6px', fontSize: 10, color: MUTED }}>{kindLabel}</span>
          {day.title && <span style={{ fontSize: 12, color: TEXT2 }}>{day.title}</span>}
          <button type="button" onClick={() => setEditing(true)} style={{ ...editBtn, marginLeft: 'auto' }}>{t('health.plans.edit_day')}</button>
        </div>
        <DayReadView day={day} showTraining={showTraining} showMeals={showMeals} exerciseDetails={exerciseDetails} recipeDetails={recipeDetails} totals={totals} estimated={estimated} onLoadExerciseDetail={onLoadExerciseDetail} onLoadRecipeDetail={onLoadRecipeDetail} />
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{dateLabel}</span>
        <PlanSelect value={day.kind} onChange={v => onChange({ ...day, kind: v as HealthPlanDay['kind'] })}
          options={[{ value: 'training', label: t('health.plans.kind.training') }, { value: 'rest', label: t('health.plans.kind.rest') }, { value: 'active_recovery', label: t('health.plans.kind.active_recovery') }]} />
        <input value={day.title ?? ''} onChange={e => onChange({ ...day, title: e.target.value || null })}
          placeholder={t('health.plans.day_title_placeholder')} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
        <button type="button" onClick={() => setEditing(false)} style={editBtn}>{t('health.plans.done')}</button>
      </div>

      {showTraining && (
        <DaySection title={t('health.plans.training')} addLabel={t('health.plans.add_exercises')} empty={day.training.length === 0} onAdd={onAddExercises}
          emptyHint={t('health.plans.training_empty_hint')}>
          {day.training.map(ex => (
            <ExerciseRow key={ex.id} ex={ex} detail={ex.ref ? exerciseDetails[ex.ref.slug] : undefined}
              onChange={next => onChange({ ...day, training: day.training.map(e => e.id === ex.id ? next : e) })}
              onRemove={() => onChange({ ...day, training: day.training.filter(e => e.id !== ex.id) })} />
          ))}
        </DaySection>
      )}

      {showMeals && (
        <DaySection title={t('health.plans.meals')} addLabel={t('health.plans.add_recipes')} empty={day.meals.length === 0} onAdd={onAddMeals}
          emptyHint={t('health.plans.meals_empty_hint')}>
          {day.meals.map(meal => (
            <MealRow key={meal.id} meal={meal} recipeDetails={recipeDetails}
              onChange={next => onChange({ ...day, meals: day.meals.map(mm => mm.id === meal.id ? next : mm) })}
              onRemove={() => onChange({ ...day, meals: day.meals.filter(mm => mm.id !== meal.id) })} />
          ))}
          {day.meals.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: 6, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.05)', padding: '8px 12px' }}>
              <span style={{ ...labelCap, color: 'rgba(251,191,36,0.8)' }}>{t('health.plans.day_total')}</span>
              {MACRO_FIELDS.map(f => (
                <span key={f.key} style={{ fontSize: 11, color: TEXT2 }}>
                  {t(f.labelKey)} <span style={{ fontWeight: 600, color: TEXT }}>{totals[f.key] ?? 0}{f.unit}</span>
                </span>
              ))}
              {estimated && <span style={{ fontSize: 9, fontStyle: 'italic', color: MUTED }}>{t('health.plans.estimated')}</span>}
            </div>
          )}
        </DaySection>
      )}

      <textarea value={day.notes ?? ''} onChange={e => onChange({ ...day, notes: e.target.value || null })}
        placeholder={t('health.plans.day_notes_placeholder')} rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
    </div>
  );
}

/** One-line readable summary of an exercise — "3 × 12 · bodyweight · 60s rest". */
function exerciseSummary(ex: HealthPlanExercise): string {
  const parts: string[] = [];
  if (ex.sets != null && ex.reps) parts.push(`${ex.sets} × ${ex.reps}`);
  else if (ex.sets != null) parts.push(t('health.plans.n_sets', { n: ex.sets }));
  else if (ex.reps) parts.push(ex.reps);
  if (ex.weight) parts.push(ex.weight);
  if (ex.rest_seconds != null) parts.push(t('health.plans.n_rest', { n: ex.rest_seconds }));
  return parts.join('  ·  ') || '—';
}
/** One-line readable summary of a meal — "1 serving · 350 cal · 30g protein". */
function mealSummaryLine(meal: HealthPlanMeal, recipeDetails: Record<string, HealthRecipeDetail>): string {
  const parts: string[] = [];
  if (meal.servings != null) parts.push(t('health.plans.n_servings', { n: meal.servings }));
  const { macros } = mealMacros(meal, recipeDetails);
  if (macros.calories != null) parts.push(t('health.plans.n_cal', { n: macros.calories }));
  if (macros.protein_g != null) parts.push(t('health.plans.n_protein', { n: macros.protein_g }));
  if (meal.cook_time_minutes != null) parts.push(t('health.plans.n_cook', { n: meal.cook_time_minutes }));
  return parts.join('  ·  ') || '—';
}

/** Calm read view of a day — small clickable cards; tap one for the
 *  exercise's technique guide or the recipe. */
function DayReadView({ day, showTraining, showMeals, exerciseDetails, recipeDetails, totals, estimated, onLoadExerciseDetail, onLoadRecipeDetail }: {
  day: HealthPlanDay;
  showTraining: boolean;
  showMeals: boolean;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  recipeDetails: Record<string, HealthRecipeDetail>;
  totals: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
  estimated: boolean;
  onLoadExerciseDetail: (slug: string) => void;
  onLoadRecipeDetail: (slug: string) => void;
}) {
  const [detail, setDetail] = useState<{ kind: 'exercise' | 'recipe'; slug: string; name: string } | null>(null);
  const openExercise = (ex: HealthPlanExercise) => { if (!ex.ref) return; onLoadExerciseDetail(ex.ref.slug); setDetail({ kind: 'exercise', slug: ex.ref.slug, name: ex.name || t('health.plans.exercise_fallback') }); };
  const openMeal = (meal: HealthPlanMeal) => { if (!meal.ref) return; onLoadRecipeDetail(meal.ref.slug); setDetail({ kind: 'recipe', slug: meal.ref.slug, name: meal.name || t('health.plans.meal_fallback') }); };

  if (day.training.length === 0 && day.meals.length === 0) {
    return <div style={{ borderRadius: 6, border: `1px dashed ${BORDER}`, padding: 16, fontSize: 11, fontStyle: 'italic', color: MUTED }}>{showTraining && showMeals ? t('health.plans.nothing_scheduled_both') : showMeals ? t('health.plans.nothing_scheduled_meals') : t('health.plans.nothing_scheduled_training')}</div>;
  }

  const card = (clickable: boolean): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 6, border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.02)', padding: '8px 12px', textAlign: 'left', cursor: clickable ? 'pointer' : 'default' });
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 };
  const nameStyle: CSSProperties = { fontSize: 12, fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showTraining && day.training.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...labelCap, letterSpacing: '0.14em' }}>{t('health.plans.training')}</span>
          <div style={grid}>
            {day.training.map(ex => {
              const clickable = !!ex.ref;
              return (
                <button key={ex.id} type="button" disabled={!clickable} onClick={() => openExercise(ex)} style={card(clickable)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={nameStyle}>{ex.name || t('health.plans.exercise_fallback')}</span>
                    {clickable && <span style={{ fontSize: 14, color: ACCENT }}>›</span>}
                  </div>
                  <span style={{ fontSize: 10, color: MUTED }}>{exerciseSummary(ex)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {showMeals && day.meals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...labelCap, letterSpacing: '0.14em' }}>{t('health.plans.meals')}</span>
          <div style={grid}>
            {day.meals.map(meal => {
              const clickable = !!meal.ref;
              return (
                <button key={meal.id} type="button" disabled={!clickable} onClick={() => openMeal(meal)} style={card(clickable)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={nameStyle}><span style={{ fontSize: 10, textTransform: 'uppercase', color: MUTED, marginRight: 6 }}>{mealSlotLabel(meal.slot)}</span>{meal.name || t('health.plans.meal_fallback')}</span>
                    {clickable && <span style={{ fontSize: 14, color: ACCENT }}>›</span>}
                  </div>
                  <span style={{ fontSize: 10, color: MUTED }}>{mealSummaryLine(meal, recipeDetails)}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: 6, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.05)', padding: '8px 12px' }}>
            <span style={{ ...labelCap, color: 'rgba(251,191,36,0.8)' }}>{t('health.plans.day_total')}</span>
            {MACRO_FIELDS.map(f => (<span key={f.key} style={{ fontSize: 11, color: TEXT2 }}>{t(f.labelKey)} <span style={{ fontWeight: 600, color: TEXT }}>{totals[f.key] ?? 0}{f.unit}</span></span>))}
            {estimated && <span style={{ fontSize: 9, fontStyle: 'italic', color: MUTED }}>{t('health.plans.estimated')}</span>}
          </div>
        </div>
      )}
      {day.notes && <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, padding: '8px 12px', fontSize: 11, lineHeight: 1.5, color: TEXT2 }}>{day.notes}</div>}

      {detail && (
        <ItemDetailModal
          detail={detail}
          exercise={detail.kind === 'exercise' ? exerciseDetails[detail.slug] : undefined}
          recipe={detail.kind === 'recipe' ? recipeDetails[detail.slug] : undefined}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}


export interface ItemLogState {
  /** 'ate' | 'other' only apply to recipes; 'done' | 'skipped' to exercises. */
  state: 'done' | 'skipped' | 'ate' | 'other' | null;
  note: string;
}

function ItemDetailModal({ detail, exercise, recipe, log, onClose }: {
  detail: { kind: 'exercise' | 'recipe'; slug: string; name: string };
  exercise: HealthExerciseDetail | undefined;
  recipe: HealthRecipeDetail | undefined;
  /** Present ONLY when the item was opened from a dated plan row that has
   *  already happened. Absent in the catalogue (nothing to attach a fact to)
   *  and absent on future days (ticking tomorrow is a fiction). */
  log?: {
    current: ItemLogState;
    onSave: (next: ItemLogState) => void;
  };
  onClose: () => void;
}) {
  const loaded = detail.kind === 'exercise' ? !!exercise : !!recipe;
  const [draft, setDraft] = useState<ItemLogState>(log?.current ?? { state: null, note: '' });
  const dirty = !!log && (draft.state !== log.current.state || draft.note !== log.current.note);

  // The three (or two) things that can be true, in the order they are likeliest.
  const options: { key: NonNullable<ItemLogState['state']>; label: string; tint: string }[] =
    detail.kind === 'recipe'
      ? [
          { key: 'ate', label: t('health.log.ate'), tint: '#a6e3a1' },
          { key: 'other', label: t('health.log.ate_other'), tint: AMBER },
          { key: 'skipped', label: t('health.log.skipped'), tint: MUTED },
        ]
      : [
          { key: 'done', label: t('health.log.did_it'), tint: '#a6e3a1' },
          { key: 'skipped', label: t('health.log.skipped'), tint: MUTED },
        ];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      {/* Wider when there is something to record — the guide keeps its column
          and the recording sits beside it, rather than the guide shrinking to
          make room for a checkbox. */}
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: 'min(820px, 90vh)', width: '100%', maxWidth: log ? 1140 : 820, overflow: 'hidden', borderRadius: 16, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'linear-gradient(to bottom right, #0f0f17, #1a1625)' }}>
        <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32, width: 32, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column' }}>
            {/* The rich, tabbed catalogue detail — same component the library uses. */}
            {!loaded ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontStyle: 'italic', color: MUTED }}>{t('health.plans.loading')}</div>
              : exercise ? <CatExerciseDetail ex={exercise} />
                : recipe ? <CatRecipeDetail r={recipe} />
                  : <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontStyle: 'italic', color: MUTED }}>{t('health.plans.no_detail')}</div>}
          </div>

          {/* WHAT ACTUALLY HAPPENED — recorded here, beside the thing itself.
              Only present when this was opened from a dated plan row that has
              already been; the catalogue has no day to attach a fact to, and a
              future day would let you tick something you have not done. */}
          {log && (
            <div style={{ display: 'flex', width: 320, flexShrink: 0, flexDirection: 'column', gap: 16, overflowY: 'auto', borderLeft: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.2)', padding: 16 }}>
              <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'color-mix(in srgb, var(--accent) 70%, transparent)' }}>
                  {t('health.log.what_happened')}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.6, color: MUTED }}>
                  {t('health.log.what_happened_hint')}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {options.map(o => {
                  const active = draft.state === o.key;
                  return (
                    <button key={o.key} type="button"
                      /* Tapping the active one again clears it — a mis-tap that
                         cannot be undone is how a log stops being trusted. */
                      onClick={() => setDraft(d => ({ ...d, state: active ? null : o.key }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8,
                        padding: '10px 12px', fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer',
                        background: active ? `color-mix(in srgb, ${o.tint} 12%, transparent)` : 'transparent',
                        color: active ? o.tint : MUTED,
                        border: `1px solid ${active ? o.tint : BORDER}`,
                      }}>
                      <span style={{
                        display: 'flex', height: 16, width: 16, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
                        borderRadius: 4, fontSize: 10, border: `1px solid ${active ? 'currentColor' : BORDER}`,
                      }}>{active ? '✓' : ''}</span>
                      {o.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', minHeight: 0, flex: 1, flexDirection: 'column' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.18em', color: MUTED }}>
                  {t('health.log.your_note')}
                </div>
                {/* Say she reads it. People write differently when they know,
                    and finding out afterwards feels like being watched. */}
                <p style={{ margin: '4px 0 6px', fontSize: 11, lineHeight: 1.6, color: MUTED }}>
                  {t('health.log.note_seen')}
                </p>
                <textarea
                  value={draft.note}
                  onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
                  placeholder={t('health.log.note_placeholder')}
                  style={{ minHeight: 110, flex: 1, resize: 'none', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'rgba(12, 8, 20, 0.4)', padding: '8px 12px', fontSize: 12, lineHeight: 1.6, color: TEXT, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>

              <button type="button" disabled={!dirty}
                onClick={() => { log.onSave(draft); onClose(); }}
                style={{
                  borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 500,
                  cursor: dirty ? 'pointer' : 'default',
                  background: dirty ? ACCENT : 'transparent',
                  color: dirty ? '#fff' : MUTED,
                  border: dirty ? 'none' : `1px solid ${BORDER}`,
                  opacity: dirty ? 1 : 0.5,
                }}>
                {t('health.log.save_record')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DaySection({ title, addLabel, empty, emptyHint, onAdd, children }: {
  title: string; addLabel: string; empty: boolean; emptyHint: string; onAdd: () => void; children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...labelCap, letterSpacing: '0.14em' }}>{title}</span>
        <button type="button" onClick={onAdd} style={{ ...accentBtn(true), padding: '4px 10px', fontSize: 11 }}>{addLabel}</button>
      </div>
      {empty
        ? <div style={{ borderRadius: 6, border: `1px dashed ${BORDER}`, padding: 12, fontSize: 10, fontStyle: 'italic', color: MUTED }}>{emptyHint}</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
    </div>
  );
}

function routineSets(detail: HealthExerciseDetail | undefined): number | null {
  const s = detail?.routine?.sets;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null; }
  return null;
}

function ExerciseRow({ ex, detail, onChange, onRemove, onSwap }: {
  ex: HealthPlanExercise;
  detail: HealthExerciseDetail | undefined;
  onChange: (e: HealthPlanExercise) => void;
  onRemove: () => void;
  /** When set, a swap button replaces this exercise with another from the catalogue. */
  onSwap?: () => void;
}) {
  const recSets = routineSets(detail);
  const recRest = detail?.routine?.rest_seconds ?? null;
  const warnings: string[] = [];
  if (recSets != null && ex.sets != null && ex.sets > recSets) warnings.push(t('health.plans.warn_sets', { sets: ex.sets, rec: recSets }));
  if (recRest != null && ex.rest_seconds != null && ex.rest_seconds < recRest) warnings.push(t('health.plans.warn_rest', { rest: ex.rest_seconds, rec: recRest }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 6, border: `1px solid ${BORDER}`, background: INPUT_BG, padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input value={ex.name} onChange={e => onChange({ ...ex, name: e.target.value })} placeholder={t('health.plans.exercise_name_placeholder')} style={{ ...inputStyle, flex: 1 }} />
        {onSwap && <button type="button" onClick={onSwap} title={t('health.plans.swap')} style={{ border: 'none', background: 'transparent', padding: '0 4px', color: MUTED, cursor: 'pointer' }}>⇄</button>}
        <button type="button" onClick={onRemove} title={t('health.plans.remove')} style={{ border: 'none', background: 'transparent', padding: '0 4px', color: MUTED, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <NumInput label={t('health.plans.field.sets')} value={ex.sets} onChange={v => onChange({ ...ex, sets: v })} />
        <TextField label={t('health.plans.field.reps')} value={ex.reps} placeholder="8-12" onChange={v => onChange({ ...ex, reps: v })} />
        <TextField label={t('health.plans.field.weight')} value={ex.weight} placeholder="60 kg / RPE 7" onChange={v => onChange({ ...ex, weight: v })} />
        <NumInput label={t('health.plans.field.rest_s')} value={ex.rest_seconds} onChange={v => onChange({ ...ex, rest_seconds: v })} />
      </div>
      <input value={ex.notes ?? ''} onChange={e => onChange({ ...ex, notes: e.target.value || null })} placeholder={t('health.plans.exercise_notes_placeholder')} style={{ ...inputStyle, width: '100%' }} />
      {warnings.length > 0 && (
        <div style={{ borderRadius: 4, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.1)', padding: '6px 8px', fontSize: 10, lineHeight: 1.5, color: AMBER }}>
          ⚠ {warnings.join('; ')}. {t('health.plans.warn_tail')}
        </div>
      )}
    </div>
  );
}

function MealRow({ meal, recipeDetails, onChange, onRemove, onSwap }: {
  meal: HealthPlanMeal;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onChange: (m: HealthPlanMeal) => void;
  onRemove: () => void;
  /** When set, a swap button replaces this meal with another recipe from the catalogue. */
  onSwap?: () => void;
}) {
  const isRecipe = !!meal.ref;
  const { macros, estimated, pending } = mealMacros(meal, recipeDetails);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 6, border: `1px solid ${BORDER}`, background: INPUT_BG, padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <PlanSelect value={meal.slot} onChange={v => onChange({ ...meal, slot: v as HealthPlanMeal['slot'] })}
          options={[{ value: 'breakfast', label: mealSlotLabel('breakfast') }, { value: 'lunch', label: mealSlotLabel('lunch') }, { value: 'dinner', label: mealSlotLabel('dinner') }, { value: 'snack', label: mealSlotLabel('snack') }]} />
        <input value={meal.name} onChange={e => onChange({ ...meal, name: e.target.value })} placeholder={t('health.plans.meal_name_placeholder')} style={{ ...inputStyle, flex: 1 }} />
        {onSwap && <button type="button" onClick={onSwap} title={t('health.plans.swap')} style={{ border: 'none', background: 'transparent', padding: '0 4px', color: MUTED, cursor: 'pointer' }}>⇄</button>}
        <button type="button" onClick={onRemove} title={t('health.plans.remove')} style={{ border: 'none', background: 'transparent', padding: '0 4px', color: MUTED, cursor: 'pointer' }}>✕</button>
      </div>
      {isRecipe ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NumInput label={t('health.plans.field.servings')} value={meal.servings} onChange={v => onChange({ ...meal, servings: v })} />
          <div style={{ flex: 1 }}>
            <div style={labelCap}>{estimated ? t('health.plans.per_meal_est') : t('health.plans.per_meal')}</div>
            {pending ? (
              <div style={{ marginTop: 4, fontSize: 11, fontStyle: 'italic', color: MUTED }}>{t('health.plans.loading_nutrition')}</div>
            ) : macros.calories == null ? (
              <div style={{ marginTop: 4, fontSize: 11, fontStyle: 'italic', color: MUTED }}>{t('health.plans.no_nutrition')}</div>
            ) : (
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {MACRO_FIELDS.map(f => (
                  <span key={f.key} style={{ fontSize: 11, color: TEXT2 }}>
                    {t(f.labelKey)} <span style={{ fontWeight: 600, color: TEXT }}>{macros[f.key] ?? 0}{f.unit}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <NumInput label={t('health.plans.macro.cal')} value={meal.calories} onChange={v => onChange({ ...meal, calories: v })} />
          <NumInput label={t('health.plans.field.protein_g')} value={meal.protein_g} onChange={v => onChange({ ...meal, protein_g: v })} />
          <NumInput label={t('health.plans.field.carbs_g')} value={meal.carbs_g} onChange={v => onChange({ ...meal, carbs_g: v })} />
          <NumInput label={t('health.plans.field.fat_g')} value={meal.fat_g} onChange={v => onChange({ ...meal, fat_g: v })} />
        </div>
      )}
      <input value={meal.notes ?? ''} onChange={e => onChange({ ...meal, notes: e.target.value || null })} placeholder={t('health.plans.notes_placeholder')} style={{ ...inputStyle, width: '100%' }} />
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelCap}>{label}</span>
      <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
    </label>
  );
}
function TextField({ label, value, placeholder, onChange }: {
  label: string; value: string | null; placeholder?: string; onChange: (v: string | null) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={labelCap}>{label}</span>
      <input value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value || null)} style={inputStyle} />
    </label>
  );
}

// ── Catalogue picker — fills the overlay, categories + pagination ─────
function CatalogPickerPanel({ kind, results, total, searching, onSearch, onConfirm, onClose }: {
  kind: 'exercise' | 'recipe';
  results: Array<HealthExerciseSummary | HealthRecipeSummary>;
  total: number;
  searching: boolean;
  onSearch: PlanSearch;
  onConfirm: (items: Array<{ slug: string; name: string } | null>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Map<string, { slug: string; name: string }>>(new Map());
  const isEx = kind === 'exercise';
  const categories = kind === 'exercise' ? EXERCISE_CATEGORIES : RECIPE_CATEGORIES;

  useEffect(() => {
    const timer = window.setTimeout(() => onSearch({ q: query.trim(), offset: page * PICKER_PAGE_SIZE, category }), query ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, page]);

  const changeQuery = (v: string) => { setQuery(v); setPage(0); };
  const changeCategory = (c: string | null) => { setCategory(c); setPage(0); };
  const toggle = (slug: string, name: string) => {
    setPicked(prev => {
      const next = new Map(prev);
      if (next.has(slug)) next.delete(slug); else next.set(slug, { slug, name });
      return next;
    });
  };
  const subtitle = (r: HealthExerciseSummary | HealthRecipeSummary): string => {
    if (kind === 'exercise') {
      const e = r as HealthExerciseSummary;
      return [e.workout_type, e.difficulty ? t('health.plans.difficulty', { n: e.difficulty }) : null].filter(Boolean).join(' · ');
    }
    const rec = r as HealthRecipeSummary;
    return [rec.course, rec.cuisine_name].filter(Boolean).join(' · ');
  };
  const imageUrl = (r: HealthExerciseSummary | HealthRecipeSummary): string | null =>
    kind === 'exercise' ? ((r as HealthExerciseSummary).thumbnail_url ?? null) : ((r as HealthRecipeSummary).hero_image_url ?? null);

  const chip = (label: string, value: string | null) => {
    const on = category === value;
    return (
      <button key={label} type="button" onClick={() => changeCategory(value)} style={{
        borderRadius: 9999, padding: '2px 10px', fontSize: 10, fontWeight: 500, textTransform: 'capitalize', cursor: 'pointer',
        border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', color: on ? ACCENT : MUTED,
      }}>{label}</button>
    );
  };

  const lastPage = Math.max(0, Math.ceil(total / PICKER_PAGE_SIZE) - 1);
  const fromN = total === 0 ? 0 : page * PICKER_PAGE_SIZE + 1;
  const toN = page * PICKER_PAGE_SIZE + results.length;
  const pageBtn = (enabled: boolean): CSSProperties => ({
    borderRadius: 4, border: `1px solid ${BORDER}`, padding: '2px 8px',
    background: 'transparent', color: MUTED, cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.4,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${BORDER}`, padding: '16px 24px' }}>
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>{t('health.plans.back_to_plan')}</button>
        <span style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{isEx ? t('health.plans.picker.add_exercises_header') : t('health.plans.picker.add_recipes_header')}</span>
        <span style={{ width: 80 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderBottom: `1px solid ${BORDER_SOFT}`, padding: '12px 24px' }}>
        <input autoFocus value={query} onChange={e => changeQuery(e.target.value)} placeholder={isEx ? t('health.plans.picker.search_exercises') : t('health.plans.picker.search_recipes')} style={{ ...inputStyle, width: '100%' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chip(t('health.plans.all'), null)}
          {categories.map(c => chip(c, c))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 24px' }}>
        {searching && results.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 11, color: MUTED }}>{t('health.plans.searching')}</div>
        ) : results.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 11, color: MUTED }}>
            {query ? (isEx ? t('health.plans.picker.no_exercise_match', { query }) : t('health.plans.picker.no_recipe_match', { query })) : (isEx ? t('health.plans.picker.no_exercises') : t('health.plans.picker.no_recipes'))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
            {results.map(r => {
              const on = picked.has(r.slug);
              const sub = subtitle(r);
              const img = imageUrl(r);
              return (
                <button key={r.id} type="button" onClick={() => toggle(r.slug, r.name)} style={{
                  position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                }}>
                  <div style={{ aspectRatio: '4 / 3', width: '100%', overflow: 'hidden', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
                    {img ? (
                      <img src={img} alt="" loading="lazy" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}>
                        {r.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  {on && <span style={{ position: 'absolute', right: 6, top: 6, display: 'flex', height: 16, width: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: ACCENT, fontSize: 9, color: '#fff' }}>✓</span>}
                  <div style={{ padding: '6px 8px' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: TEXT }}>{r.name}</span>
                    {sub && <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, textTransform: 'capitalize', color: MUTED }}>{sub}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: `1px solid ${BORDER}`, padding: '12px 24px' }}>
        <button type="button" onClick={() => onConfirm([null])} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>
          {isEx ? t('health.plans.picker.custom_exercise') : t('health.plans.picker.custom_recipe')}
        </button>
        {total > PICKER_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: MUTED }}>
            <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} style={pageBtn(page > 0)}>{t('health.plans.prev')}</button>
            <span>{t('health.plans.range', { from: fromN, to: toN, total })}</span>
            <button type="button" disabled={page >= lastPage} onClick={() => setPage(p => Math.min(lastPage, p + 1))} style={pageBtn(page < lastPage)}>{t('health.plans.next')}</button>
          </div>
        )}
        <button type="button" disabled={picked.size === 0} onClick={() => onConfirm(Array.from(picked.values()))} style={accentBtn(picked.size > 0)}>
          {t('health.plans.add_to_day', { n: picked.size > 0 ? picked.size : '' })}
        </button>
      </div>
    </div>
  );
}
