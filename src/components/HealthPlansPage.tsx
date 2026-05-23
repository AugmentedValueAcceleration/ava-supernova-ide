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
import { t, useLocale } from '../lib/i18n';
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
              style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: 'none', cursor: 'pointer', borderRadius: 4, padding: '6px 10px', fontSize: 12, textAlign: 'left', background: o.value === value ? 'rgba(168,85,247,0.1)' : 'transparent', color: o.value === value ? TEXT : TEXT2 }}>
              <span style={{ whiteSpace: 'nowrap' }}>{o.label}</span>
              {o.value === value && <span style={{ color: ACCENT }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <MonthCalendar month={month} onMonthChange={setMonth} marks={planMarks} selected={null} onSelectDate={(key) => { const p = planForDate(key); if (p) onOpen(p.id); else onNew(); }} />
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
          <span style={{ borderRadius: 4, padding: '1px 6px', fontSize: 9, background: 'rgba(168,85,247,0.12)', color: TEXT2 }}>{planStatusLabel(plan.status)}</span>
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
                  border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'rgba(168,85,247,0.1)' : 'transparent',
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
                  border: `1px solid ${on ? ACCENT : BORDER}`, background: on ? 'rgba(168,85,247,0.1)' : 'transparent',
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
            onLoadExerciseDetail={onLoadExerciseDetail}
            onLoadRecipeDetail={onLoadRecipeDetail}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${BORDER}`, padding: '12px 24px' }}>
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
        <button type="button" aria-label={t('health.plans.prev_month')} onClick={() => onMonthChange(new Date(year, mon - 1, 1))} style={navBtn}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{monthLabel}</span>
        <button type="button" aria-label={t('health.plans.next_month')} onClick={() => onMonthChange(new Date(year, mon + 1, 1))} style={navBtn}>›</button>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: MUTED }}>{weekdayInitial(i)}</div>
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
  const wrapStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 8, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)', padding: 16 };
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

const dChip: CSSProperties = { borderRadius: 999, border: `1px solid ${BORDER}`, padding: '1px 8px', fontSize: 10, textTransform: 'capitalize', color: MUTED };
const dHd: CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: MUTED };

function ItemDetailModal({ detail, exercise, recipe, onClose }: {
  detail: { kind: 'exercise' | 'recipe'; slug: string; name: string };
  exercise: HealthExerciseDetail | undefined;
  recipe: HealthRecipeDetail | undefined;
  onClose: () => void;
}) {
  const loaded = detail.kind === 'exercise' ? !!exercise : !!recipe;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh', width: '100%', maxWidth: 640, overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(168,85,247,0.25)', background: 'linear-gradient(to bottom right, #100d1a, #181327)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(168,85,247,0.14)', padding: '12px 20px' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{detail.name}</span>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 14, color: MUTED, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!loaded ? <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 12, fontStyle: 'italic', color: MUTED }}>{t('health.plans.loading')}</div>
            : exercise ? <ExerciseDetailBody ex={exercise} />
              : recipe ? <RecipeDetailBody rec={recipe} />
                : <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 12, fontStyle: 'italic', color: MUTED }}>{t('health.plans.no_detail')}</div>}
        </div>
      </div>
    </div>
  );
}

function ExerciseDetailBody({ ex }: { ex: HealthExerciseDetail }) {
  const r = ex.routine;
  const routineParts = [
    r.sets != null ? t('health.plans.n_sets', { n: r.sets }) : null,
    r.reps_target ? t('health.plans.n_reps', { n: r.reps_target }) : null,
    r.rest_seconds != null ? t('health.plans.n_rest', { n: r.rest_seconds }) : null,
    r.tempo ? t('health.plans.tempo', { v: r.tempo }) : null,
    r.frequency_per_week ? t('health.plans.per_week', { n: r.frequency_per_week }) : null,
  ].filter(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 12, lineHeight: 1.5, color: TEXT2 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span style={dChip}>{ex.exercise_type}</span>
        <span style={dChip}>{ex.workout_type}</span>
        {typeof ex.difficulty === 'number' && <span style={dChip}>{t('health.plans.difficulty', { n: ex.difficulty })}</span>}
      </div>
      {ex.thumbnail_url && <img src={ex.thumbnail_url} alt="" style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }} />}
      {ex.description && <p style={{ margin: 0 }}>{ex.description}</p>}
      {routineParts.length > 0 && <div><div style={dHd}>{t('health.plans.routine')}</div><p style={{ margin: '4px 0 0' }}>{routineParts.join('  ·  ')}{r.progression ? ` — ${r.progression}` : ''}</p></div>}
      {ex.steps.length > 0 && <div><div style={dHd}>{t('health.plans.how_to')}</div><ol style={{ margin: '4px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{ex.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>}
      {ex.common_mistakes && <div><div style={dHd}>{t('health.plans.common_mistakes')}</div><p style={{ margin: '4px 0 0' }}>{ex.common_mistakes}</p></div>}
      {ex.muscles.length > 0 && <div><div style={dHd}>{t('health.plans.muscles')}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{ex.muscles.map(mu => <span key={mu.slug} style={dChip}>{mu.name}{mu.role === 'secondary' ? ` ${t('health.plans.secondary_suffix')}` : ''}</span>)}</div></div>}
      {ex.equipment.length > 0 && <div><div style={dHd}>{t('health.plans.equipment')}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{ex.equipment.map(eq => <span key={eq.slug} style={dChip}>{eq.name}</span>)}</div></div>}
      {ex.demo_video_url && <a href={ex.demo_video_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ACCENT }}>{t('health.plans.watch_demo')}</a>}
    </div>
  );
}

function RecipeDetailBody({ rec }: { rec: HealthRecipeDetail }) {
  const version = rec.versions.find(v => v.level === 'intermediate') ?? rec.versions[0];
  const n = version?.nutrition;
  const timeParts = version ? [
    version.prep_time_minutes != null ? t('health.plans.m_prep', { n: version.prep_time_minutes }) : null,
    version.cook_time_minutes != null ? t('health.plans.m_cook', { n: version.cook_time_minutes }) : null,
  ].filter(Boolean) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 12, lineHeight: 1.5, color: TEXT2 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {rec.course && <span style={dChip}>{rec.course}</span>}
        {rec.cuisine_name && <span style={dChip}>{rec.cuisine_name}</span>}
        {version?.default_servings != null && <span style={dChip}>{t('health.plans.n_servings', { n: version.default_servings })}</span>}
      </div>
      {rec.hero_image_url && <img src={rec.hero_image_url} alt="" style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }} />}
      {(rec.overview || version?.description) && <p style={{ margin: 0 }}>{rec.overview ?? version?.description}</p>}
      {timeParts.length > 0 && <p style={{ margin: 0, color: MUTED }}>{timeParts.join('  ·  ')}</p>}
      {n && typeof n.calories === 'number' && (
        <div><div style={dHd}>{n.source === 'verified' ? t('health.plans.nutrition_per_serving') : t('health.plans.nutrition_per_serving_est')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
            {n.calories != null && <span>{t('health.plans.macro.cal')} <span style={{ fontWeight: 600, color: TEXT }}>{n.calories}</span></span>}
            {n.protein_g != null && <span>{t('health.plans.macro.protein')} <span style={{ fontWeight: 600, color: TEXT }}>{n.protein_g}g</span></span>}
            {n.carbs_g != null && <span>{t('health.plans.macro.carbs')} <span style={{ fontWeight: 600, color: TEXT }}>{n.carbs_g}g</span></span>}
            {n.fat_g != null && <span>{t('health.plans.macro.fat')} <span style={{ fontWeight: 600, color: TEXT }}>{n.fat_g}g</span></span>}
          </div>
        </div>
      )}
      {rec.ingredients.length > 0 && <div><div style={dHd}>{t('health.plans.ingredients')}</div><ul style={{ margin: '4px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>{[...rec.ingredients].sort((a, b) => a.sort_order - b.sort_order).map((ing, i) => <li key={i}>{[ing.quantity != null ? ing.quantity : null, ing.unit, ing.name].filter(v => v != null && v !== '').join(' ')}{ing.optional ? ` ${t('health.plans.optional_suffix')}` : ''}</li>)}</ul></div>}
      {version && version.steps.length > 0 && <div><div style={dHd}>{t('health.plans.method')}</div><ol style={{ margin: '4px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{[...version.steps].sort((a, b) => a.sort_order - b.sort_order).map((s, i) => <li key={i}>{s.action}</li>)}</ol></div>}
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
  if (recSets != null && ex.sets != null && ex.sets > recSets) warnings.push(t('health.plans.warn_sets', { sets: ex.sets, rec: recSets }));
  if (recRest != null && ex.rest_seconds != null && ex.rest_seconds < recRest) warnings.push(t('health.plans.warn_rest', { rest: ex.rest_seconds, rec: recRest }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 6, border: `1px solid ${BORDER}`, background: INPUT_BG, padding: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input value={ex.name} onChange={e => onChange({ ...ex, name: e.target.value })} placeholder={t('health.plans.exercise_name_placeholder')} style={{ ...inputStyle, flex: 1 }} />
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
        <PlanSelect value={meal.slot} onChange={v => onChange({ ...meal, slot: v as HealthPlanMeal['slot'] })}
          options={[{ value: 'breakfast', label: mealSlotLabel('breakfast') }, { value: 'lunch', label: mealSlotLabel('lunch') }, { value: 'dinner', label: mealSlotLabel('dinner') }, { value: 'snack', label: mealSlotLabel('snack') }]} />
        <input value={meal.name} onChange={e => onChange({ ...meal, name: e.target.value })} placeholder={t('health.plans.meal_name_placeholder')} style={{ ...inputStyle, flex: 1 }} />
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
