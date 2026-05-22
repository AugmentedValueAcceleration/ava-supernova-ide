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
import type {
  HealthPlan, HealthPlanSummary, HealthPlanType, HealthPlanStatus,
  HealthPlanDay, HealthPlanExercise, HealthPlanMeal,
} from '../lib/health-plans-store';

// ── Palette ───────────────────────────────────────────────────────────
const ACCENT = '#a855f7';
const TEXT = '#cdd6f4';
const TEXT2 = '#a6adc8';
const MUTED = '#585b70';
const BORDER = 'rgba(168,85,247,0.14)';
const BORDER_SOFT = 'rgba(168,85,247,0.08)';
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
    border: `1px solid ${enabled ? 'rgba(168,85,247,0.4)' : BORDER}`,
    background: enabled ? 'rgba(168,85,247,0.12)' : 'transparent',
    color: enabled ? ACCENT : MUTED, cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.6,
  };
}

const PLAN_TYPE_META: Record<HealthPlanType, { label: string; accent: string; blurb: string }> = {
  fitness:  { label: 'Fitness',  accent: ACCENT,    blurb: 'Training weeks — exercises, sets, progression.' },
  meal:     { label: 'Meal',     accent: AMBER,     blurb: 'Nutrition weeks — meals, servings, day totals.' },
  combined: { label: 'Combined', accent: '#34d399', blurb: 'Training and meals woven together.' },
};
const PLAN_STATUS_LABEL: Record<HealthPlanStatus, string> = {
  draft: 'Draft', active: 'Active', completed: 'Completed', archived: 'Archived',
};
const DURATION_PRESETS = [
  { days: 1, label: '1 day' }, { days: 7, label: '1 week' },
  { days: 28, label: '4 weeks' }, { days: 56, label: '8 weeks' }, { days: 84, label: '12 weeks' },
];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ── Helpers ───────────────────────────────────────────────────────────
function durationLabel(days: number): string {
  if (days <= 1) return '1 day';
  const w = Math.round(days / 7);
  return w === 1 ? '1 week' : `${w} weeks`;
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
  return { id: newId('ml'), slot, ref: null, name: '', servings: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, notes: null };
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
    title: `New ${PLAN_TYPE_META[type].label.toLowerCase()} plan`,
    goal: null, source: 'manual', status: 'draft', duration_days: durationDays,
    start_date: todayISO(), profile_snapshot: null, days: [],
    created_at: new Date().toISOString(), updated_at: null,
  };
}

// ── Nutrition derivation ──────────────────────────────────────────────
const MACRO_FIELDS: Array<{ key: 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'; label: string; unit: string }> = [
  { key: 'calories', label: 'Cal', unit: '' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
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
      <BasePlansTab plans={plans} onNew={() => setSetupOpen(true)} onOpen={onOpenPlan} onDelete={onDeletePlan} />
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
function BasePlansTab({ plans, onNew, onOpen, onDelete }: {
  plans: HealthPlanSummary[];
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<'calendar' | 'programs'>('calendar');
  const [month, setMonth] = useState<Date>(() => {
    const dated = plans.find(p => p.start_date);
    return dated?.start_date ? new Date(`${dated.start_date}T00:00:00`) : new Date();
  });

  // Mark every day each plan spans — training (accent) / meals (amber) —
  // so created plans actually show on the calendar (was hardcoded empty).
  const planMarks = useMemo(() => {
    const map = new Map<string, { training: boolean; meals: boolean }>();
    for (const p of plans) {
      if (!p.start_date) continue;
      const start = new Date(`${p.start_date}T00:00:00`);
      if (isNaN(start.getTime())) continue;
      const training = p.type === 'fitness' || p.type === 'combined';
      const meals = p.type === 'meal' || p.type === 'combined';
      for (let i = 0; i < p.duration_days; i++) {
        const d = new Date(start); d.setDate(d.getDate() + i);
        const key = ymd(d);
        const prev = map.get(key) ?? { training: false, meals: false };
        map.set(key, { training: prev.training || training, meals: prev.meals || meals });
      }
    }
    return map;
  }, [plans]);
  // Which plan covers a date? Prefer active, then most recently updated.
  const planForDate = useCallback((key: string): HealthPlanSummary | null => {
    const sel = new Date(`${key}T00:00:00`).getTime();
    const covering = plans.filter(p => {
      if (!p.start_date) return false;
      const s = new Date(`${p.start_date}T00:00:00`).getTime();
      if (isNaN(s)) return false;
      return sel >= s && sel <= s + (p.duration_days - 1) * 86400000;
    });
    if (covering.length === 0) return null;
    covering.sort((a, b) => {
      if ((a.status === 'active') !== (b.status === 'active')) return a.status === 'active' ? -1 : 1;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    });
    return covering[0];
  }, [plans]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={sectionCap}>Your plans</div>
          <p style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: MUTED }}>
            Multi-week fitness, meal, and combined programs — built day by day from the recipe and exercise library.
          </p>
        </div>
        <button type="button" onClick={onNew} style={{ ...accentBtn(true), padding: '6px 12px', fontSize: 11 }}>+ New plan</button>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}` }}>
        {([['calendar', 'Calendar'], ['programs', `Programs${plans.length ? ` · ${plans.length}` : ''}`]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', background: 'transparent',
            color: tab === key ? TEXT : MUTED,
            borderBottom: tab === key ? `2px solid ${ACCENT}` : '2px solid transparent',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'calendar' ? (
        <MonthCalendar month={month} onMonthChange={setMonth} marks={planMarks} selected={null} onSelectDate={(key) => { const p = planForDate(key); if (p) onOpen(p.id); else onNew(); }} />
      ) : plans.length === 0 ? (
        <div style={{ borderRadius: 8, border: `1px dashed ${BORDER}`, padding: '40px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: TEXT2 }}>No programs yet</div>
          <div style={{ margin: '6px auto 0', maxWidth: 360, fontSize: 10, fontStyle: 'italic', lineHeight: 1.5, color: MUTED }}>
            Start one with “+ New plan” — pick a type and a length, then fill the days.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {plans.map(p => <PlanCard key={p.id} plan={p} onOpen={() => onOpen(p.id)} onDelete={() => onDelete(p.id)} />)}
        </div>
      )}
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
          <span style={{ borderRadius: 4, border: `1px solid ${m.accent}`, padding: '1px 6px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: m.accent }}>{m.label}</span>
          <span style={{ borderRadius: 4, padding: '1px 6px', fontSize: 9, background: 'rgba(168,85,247,0.12)', color: TEXT2 }}>{PLAN_STATUS_LABEL[plan.status]}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: TEXT }}>{plan.title}</div>
        <div style={{ marginTop: 4, fontSize: 10, color: MUTED }}>{durationLabel(plan.duration_days)} · built by you</div>
      </button>
      {confirming ? (
        <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', gap: 6, alignItems: 'center', borderRadius: 6, border: '1px solid rgba(243,139,168,0.3)', background: INPUT_BG, padding: '4px 8px' }}>
          <span style={{ fontSize: 10, color: TEXT2 }}>Delete?</span>
          <button type="button" onClick={() => { onDelete(); setConfirming(false); }} style={{ border: 'none', background: 'transparent', fontSize: 10, fontWeight: 600, color: RED, cursor: 'pointer' }}>Yes</button>
          <button type="button" onClick={() => setConfirming(false)} style={{ border: 'none', background: 'transparent', fontSize: 10, color: MUTED, cursor: 'pointer' }}>No</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} title="Delete plan" style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'transparent', padding: 4, color: MUTED, cursor: 'pointer' }}>✕</button>
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
        display: 'flex', flexDirection: 'column', height: '100%', width: '100%', maxWidth: 1180,
        overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(168,85,247,0.25)', background: PANEL_BG,
        boxShadow: '0 0 80px rgba(168,85,247,0.15)',
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
          <div style={{ fontSize: 15, fontWeight: 600, color: TEXT }}>New plan</div>
          <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>Pick a type and a length — then build it day by day.</div>
        </div>
        <button type="button" onClick={onCancel} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>Cancel</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div style={{ ...sectionCap, marginBottom: 8 }}>Type</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {(['fitness', 'meal', 'combined'] as HealthPlanType[]).map(t => {
              const m = PLAN_TYPE_META[t];
              const on = type === t;
              return (
                <button key={t} type="button" onClick={() => setType(t)} style={{
                  borderRadius: 8, padding: 16, textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'rgba(168,85,247,0.1)' : 'transparent',
                }}>
                  <div style={{ marginBottom: 8, height: 3, width: 40, borderRadius: 2, background: m.accent }} />
                  <div style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>{m.label}</div>
                  <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5, color: MUTED }}>{m.blurb}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ ...sectionCap, marginBottom: 8 }}>Length</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DURATION_PRESETS.map(p => {
              const on = duration === p.days;
              return (
                <button key={p.days} type="button" onClick={() => setDuration(p.days)} style={{
                  borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'rgba(168,85,247,0.1)' : 'transparent',
                  color: on ? ACCENT : MUTED,
                }}>{p.label}</button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: `1px solid ${BORDER}`, padding: '16px 24px' }}>
        <button type="button" disabled={!type} onClick={() => { if (type) onCreate(blankPlan(type, duration)); }} style={accentBtn(!!type)}>
          Start building →
        </button>
        {!type && <span style={{ fontSize: 10, fontStyle: 'italic', color: MUTED }}>Pick a type first.</span>}
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
  const [month, setMonth] = useState<Date>(() => new Date(`${plan.start_date ?? todayISO()}T00:00:00`));
  const [confirming, setConfirming] = useState(false);
  const [picker, setPicker] = useState<'exercise' | 'recipe' | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const prefilled = useRef<Set<string>>(new Set());

  useEffect(() => {
    setDraft(plan);
    setSelectedDay(1);
    setMonth(new Date(`${plan.start_date ?? todayISO()}T00:00:00`));
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

  const startISO = draft.start_date ?? todayISO();
  const dateForDay = useCallback((dayIndex: number): string => {
    const d = new Date(`${startISO}T00:00:00`);
    d.setDate(d.getDate() + dayIndex - 1);
    return ymd(d);
  }, [startISO]);
  const dayForDate = useCallback((key: string): number | null => {
    const start = new Date(`${startISO}T00:00:00`);
    const sel = new Date(`${key}T00:00:00`);
    const idx = Math.round((sel.getTime() - start.getTime()) / 86400000) + 1;
    return idx >= 1 && idx <= draft.duration_days ? idx : null;
  }, [startISO, draft.duration_days]);
  const calendarMarks = useMemo(() => {
    const map = new Map<string, { training: boolean; meals: boolean }>();
    for (const d of draft.days) {
      map.set(dateForDay(d.day_index), {
        training: showTraining && d.training.length > 0,
        meals: showMeals && d.meals.length > 0,
      });
    }
    return map;
  }, [draft.days, dateForDay, showTraining, showMeals]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button type="button" onClick={closeWithFlush} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>← All plans</button>
          <span style={{ fontSize: 10, color: MUTED }}>Changes save automatically</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ borderRadius: 4, border: `1px solid ${m.accent}`, padding: '1px 6px', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: m.accent }}>{m.label}</span>
          <input value={draft.title} onChange={e => commit({ ...draft, title: e.target.value })} placeholder="Plan title"
            style={{ ...inputStyle, flex: 1, minWidth: 180, fontSize: 14 }} />
          <select value={draft.status} onChange={e => commit({ ...draft, status: e.target.value as HealthPlanStatus })} style={inputStyle}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
          <select value={draft.duration_days} onChange={e => setDuration(Number(e.target.value))} style={inputStyle}>
            {DURATION_PRESETS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
        </div>
        <input value={draft.goal ?? ''} onChange={e => commit({ ...draft, goal: e.target.value || null })}
          placeholder="Goal — e.g. lose 4 kg, first 5 k, build pressing strength" style={{ ...inputStyle, width: '100%' }} />
      </div>

      {/* Body — calendar + day editor side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden', padding: 24 }}>
        <div style={{ minHeight: 0, overflowY: 'auto' }}>
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            marks={calendarMarks}
            selected={dateForDay(selectedDay)}
            onSelectDate={(key) => { const idx = dayForDate(key); if (idx != null) setSelectedDay(idx); }}
          />
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto' }}>
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
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${BORDER}`, padding: '12px 24px' }}>
        {confirming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: TEXT2 }}>Delete this plan permanently?</span>
            <button type="button" onClick={() => { onDelete(draft.id); onClose(); }} style={{ borderRadius: 6, border: '1px solid rgba(243,139,168,0.3)', background: 'rgba(243,139,168,0.1)', padding: '6px 12px', fontSize: 11, fontWeight: 600, color: RED, cursor: 'pointer' }}>Delete</button>
            <button type="button" onClick={() => setConfirming(false)} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>Delete plan</button>
        )}
      </div>
    </div>
  );
}

// ── Month calendar ────────────────────────────────────────────────────
function MonthCalendar({ month, onMonthChange, marks, selected, onSelectDate }: {
  month: Date;
  onMonthChange: (d: Date) => void;
  marks: Map<string, { training: boolean; meals: boolean }>;
  selected: string | null;
  onSelectDate: (key: string) => void;
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
  const monthLabel = new Date(year, mon, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const navBtn: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28, width: 28,
    borderRadius: 6, border: 'none', background: 'rgba(168,85,247,0.1)', color: TEXT2, fontSize: 14, cursor: 'pointer',
  };

  return (
    <div style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(168,85,247,0.18)', background: PANEL_BG }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${BORDER}`, background: 'rgba(168,85,247,0.05)', padding: '8px 16px' }}>
        <button type="button" aria-label="Previous month" onClick={() => onMonthChange(new Date(year, mon - 1, 1))} style={navBtn}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{monthLabel}</span>
        <button type="button" aria-label="Next month" onClick={() => onMonthChange(new Date(year, mon + 1, 1))} style={navBtn}>›</button>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
          {WEEKDAY_INITIAL.map((w, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: MUTED }}>{w}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const key = ymd(date);
            const mk = marks.get(key);
            const isToday = key === today;
            const isSelected = key === selected;
            const hasContent = !!mk && (mk.training || mk.meals);
            return (
              <button key={i} type="button" onClick={() => onSelectDate(key)} style={{
                display: 'flex', flexDirection: 'column', gap: 4, minHeight: 54, borderRadius: 8, padding: 6, textAlign: 'left', cursor: 'pointer',
                border: `1px solid ${isSelected ? ACCENT : hasContent ? 'rgba(168,85,247,0.22)' : BORDER_SOFT}`,
                background: isSelected ? 'rgba(168,85,247,0.15)' : hasContent ? 'rgba(168,85,247,0.05)' : 'transparent',
              }}>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 17, width: 17, borderRadius: 9, fontSize: 10,
                  background: isToday ? ACCENT : 'transparent',
                  color: isToday ? '#fff' : isSelected ? ACCENT : TEXT2,
                  fontWeight: isToday ? 700 : isSelected ? 600 : 500,
                }}>{date.getDate()}</span>
                <span style={{ marginTop: 'auto', display: 'flex', gap: 3 }}>
                  {mk?.training && <span style={{ height: 6, width: 6, borderRadius: 3, background: ACCENT }} />}
                  {mk?.meals && <span style={{ height: 6, width: 6, borderRadius: 3, background: AMBER }} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Day editor ────────────────────────────────────────────────────────
function DayPanel({ day, startDate, showTraining, showMeals, recipeDetails, exerciseDetails, onChange, onAddExercises, onAddMeals }: {
  day: HealthPlanDay;
  startDate: string | null;
  showTraining: boolean;
  showMeals: boolean;
  recipeDetails: Record<string, HealthRecipeDetail>;
  exerciseDetails: Record<string, HealthExerciseDetail>;
  onChange: (day: HealthPlanDay) => void;
  onAddExercises: () => void;
  onAddMeals: () => void;
}) {
  const date = planDate(startDate, day.day_index);
  const { totals, estimated } = useMemo(() => dayTotals(day, recipeDetails), [day, recipeDetails]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 8, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)', padding: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
          {date ? `${WEEKDAY[date.getDay()]} ${date.getDate()} — Day ${day.day_index}` : `Day ${day.day_index}`}
        </span>
        <select value={day.kind} onChange={e => onChange({ ...day, kind: e.target.value as HealthPlanDay['kind'] })} style={inputStyle}>
          <option value="training">Training</option>
          <option value="rest">Rest</option>
          <option value="active_recovery">Active recovery</option>
        </select>
        <input value={day.title ?? ''} onChange={e => onChange({ ...day, title: e.target.value || null })}
          placeholder="Day title — e.g. Upper body, Long run" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
      </div>

      {showTraining && (
        <DaySection title="Training" addLabel="+ Add exercises" empty={day.training.length === 0} onAdd={onAddExercises}
          emptyHint="Pick exercises from the library — sets and reps fill in from each one's routine.">
          {day.training.map(ex => (
            <ExerciseRow key={ex.id} ex={ex} detail={ex.ref ? exerciseDetails[ex.ref.slug] : undefined}
              onChange={next => onChange({ ...day, training: day.training.map(e => e.id === ex.id ? next : e) })}
              onRemove={() => onChange({ ...day, training: day.training.filter(e => e.id !== ex.id) })} />
          ))}
        </DaySection>
      )}

      {showMeals && (
        <DaySection title="Meals" addLabel="+ Add recipes" empty={day.meals.length === 0} onAdd={onAddMeals}
          emptyHint="Pick recipes from the library — nutrition is worked out from servings.">
          {day.meals.map(meal => (
            <MealRow key={meal.id} meal={meal} recipeDetails={recipeDetails}
              onChange={next => onChange({ ...day, meals: day.meals.map(mm => mm.id === meal.id ? next : mm) })}
              onRemove={() => onChange({ ...day, meals: day.meals.filter(mm => mm.id !== meal.id) })} />
          ))}
          {day.meals.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderRadius: 6, border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.05)', padding: '8px 12px' }}>
              <span style={{ ...labelCap, color: 'rgba(251,191,36,0.8)' }}>Day total</span>
              {MACRO_FIELDS.map(f => (
                <span key={f.key} style={{ fontSize: 11, color: TEXT2 }}>
                  {f.label} <span style={{ fontWeight: 600, color: TEXT }}>{totals[f.key] ?? 0}{f.unit}</span>
                </span>
              ))}
              {estimated && <span style={{ fontSize: 9, fontStyle: 'italic', color: MUTED }}>estimated</span>}
            </div>
          )}
        </DaySection>
      )}

      <textarea value={day.notes ?? ''} onChange={e => onChange({ ...day, notes: e.target.value || null })}
        placeholder="Day notes (optional)" rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
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

function ExerciseRow({ ex, detail, onChange, onRemove }: {
  ex: HealthPlanExercise;
  detail: HealthExerciseDetail | undefined;
  onChange: (e: HealthPlanExercise) => void;
  onRemove: () => void;
}) {
  const recSets = routineSets(detail);
  const recRest = detail?.routine?.rest_seconds ?? null;
  const warnings: string[] = [];
  if (recSets != null && ex.sets != null && ex.sets > recSets) warnings.push(`${ex.sets} sets is above the recommended ${recSets}`);
  if (recRest != null && ex.rest_seconds != null && ex.rest_seconds < recRest) warnings.push(`${ex.rest_seconds}s rest is shorter than the recommended ${recRest}s`);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 6, border: `1px solid ${BORDER}`, background: INPUT_BG, padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input value={ex.name} onChange={e => onChange({ ...ex, name: e.target.value })} placeholder="Exercise name" style={{ ...inputStyle, flex: 1 }} />
        <button type="button" onClick={onRemove} title="Remove" style={{ border: 'none', background: 'transparent', padding: '0 4px', color: MUTED, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <NumInput label="Sets" value={ex.sets} onChange={v => onChange({ ...ex, sets: v })} />
        <TextField label="Reps" value={ex.reps} placeholder="8-12" onChange={v => onChange({ ...ex, reps: v })} />
        <TextField label="Weight" value={ex.weight} placeholder="60 kg / RPE 7" onChange={v => onChange({ ...ex, weight: v })} />
        <NumInput label="Rest (s)" value={ex.rest_seconds} onChange={v => onChange({ ...ex, rest_seconds: v })} />
      </div>
      <input value={ex.notes ?? ''} onChange={e => onChange({ ...ex, notes: e.target.value || null })} placeholder="Notes — tempo, cues (optional)" style={{ ...inputStyle, width: '100%' }} />
      {warnings.length > 0 && (
        <div style={{ borderRadius: 4, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.1)', padding: '6px 8px', fontSize: 10, lineHeight: 1.5, color: AMBER }}>
          ⚠ {warnings.join('; ')}. More isn't always better — give your body room to recover.
        </div>
      )}
    </div>
  );
}

function MealRow({ meal, recipeDetails, onChange, onRemove }: {
  meal: HealthPlanMeal;
  recipeDetails: Record<string, HealthRecipeDetail>;
  onChange: (m: HealthPlanMeal) => void;
  onRemove: () => void;
}) {
  const isRecipe = !!meal.ref;
  const { macros, estimated, pending } = mealMacros(meal, recipeDetails);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 6, border: `1px solid ${BORDER}`, background: INPUT_BG, padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select value={meal.slot} onChange={e => onChange({ ...meal, slot: e.target.value as HealthPlanMeal['slot'] })} style={inputStyle}>
          <option value="breakfast">Breakfast</option>
          <option value="lunch">Lunch</option>
          <option value="dinner">Dinner</option>
          <option value="snack">Snack</option>
        </select>
        <input value={meal.name} onChange={e => onChange({ ...meal, name: e.target.value })} placeholder="Meal name" style={{ ...inputStyle, flex: 1 }} />
        <button type="button" onClick={onRemove} title="Remove" style={{ border: 'none', background: 'transparent', padding: '0 4px', color: MUTED, cursor: 'pointer' }}>✕</button>
      </div>
      {isRecipe ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NumInput label="Servings" value={meal.servings} onChange={v => onChange({ ...meal, servings: v })} />
          <div style={{ flex: 1 }}>
            <div style={labelCap}>Per this meal{estimated ? ' · estimated' : ''}</div>
            {pending ? (
              <div style={{ marginTop: 4, fontSize: 11, fontStyle: 'italic', color: MUTED }}>Loading nutrition…</div>
            ) : macros.calories == null ? (
              <div style={{ marginTop: 4, fontSize: 11, fontStyle: 'italic', color: MUTED }}>No nutrition for this recipe yet.</div>
            ) : (
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {MACRO_FIELDS.map(f => (
                  <span key={f.key} style={{ fontSize: 11, color: TEXT2 }}>
                    {f.label} <span style={{ fontWeight: 600, color: TEXT }}>{macros[f.key] ?? 0}{f.unit}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <NumInput label="Cal" value={meal.calories} onChange={v => onChange({ ...meal, calories: v })} />
          <NumInput label="Protein g" value={meal.protein_g} onChange={v => onChange({ ...meal, protein_g: v })} />
          <NumInput label="Carbs g" value={meal.carbs_g} onChange={v => onChange({ ...meal, carbs_g: v })} />
          <NumInput label="Fat g" value={meal.fat_g} onChange={v => onChange({ ...meal, fat_g: v })} />
        </div>
      )}
      <input value={meal.notes ?? ''} onChange={e => onChange({ ...meal, notes: e.target.value || null })} placeholder="Notes (optional)" style={{ ...inputStyle, width: '100%' }} />
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
  const noun = kind === 'exercise' ? 'exercise' : 'recipe';
  const categories = kind === 'exercise' ? EXERCISE_CATEGORIES : RECIPE_CATEGORIES;

  useEffect(() => {
    const t = window.setTimeout(() => onSearch({ q: query.trim(), offset: page * PICKER_PAGE_SIZE, category }), query ? 300 : 0);
    return () => clearTimeout(t);
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
      return [e.workout_type, e.difficulty ? `difficulty ${e.difficulty}` : null].filter(Boolean).join(' · ');
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
        border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'rgba(168,85,247,0.15)' : 'transparent', color: on ? ACCENT : MUTED,
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
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>← Back to plan</button>
        <span style={{ fontSize: 13, fontWeight: 500, color: TEXT }}>Add {noun}s — tick as many as you need</span>
        <span style={{ width: 80 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderBottom: `1px solid ${BORDER_SOFT}`, padding: '12px 24px' }}>
        <input autoFocus value={query} onChange={e => changeQuery(e.target.value)} placeholder={`Search the ${noun} library…`} style={{ ...inputStyle, width: '100%' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chip('All', null)}
          {categories.map(c => chip(c, c))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 24px' }}>
        {searching && results.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 11, color: MUTED }}>Searching…</div>
        ) : results.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 11, color: MUTED }}>
            {query ? `No ${noun}s match “${query}”.` : `No ${noun}s found.`}
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
                  border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'rgba(168,85,247,0.1)' : 'transparent',
                }}>
                  <div style={{ aspectRatio: '4 / 3', width: '100%', overflow: 'hidden', background: 'rgba(168,85,247,0.08)' }}>
                    {img ? (
                      <img src={img} alt="" loading="lazy" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: 'rgba(168,85,247,0.4)' }}>
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
          + Add a custom {noun} instead
        </button>
        {total > PICKER_PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: MUTED }}>
            <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} style={pageBtn(page > 0)}>‹ Prev</button>
            <span>{fromN}–{toN} of {total}</span>
            <button type="button" disabled={page >= lastPage} onClick={() => setPage(p => Math.min(lastPage, p + 1))} style={pageBtn(page < lastPage)}>Next ›</button>
          </div>
        )}
        <button type="button" disabled={picked.size === 0} onClick={() => onConfirm(Array.from(picked.values()))} style={accentBtn(picked.size > 0)}>
          Add {picked.size > 0 ? picked.size : ''} to this day
        </button>
      </div>
    </div>
  );
}
