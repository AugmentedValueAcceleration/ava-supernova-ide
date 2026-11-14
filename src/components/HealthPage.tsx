import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTabTransition } from '../lib/useTabTransition';
import { TabSpinner } from './TabSpinner';
import { HealthRoomChat } from './HealthRoomChat';
import { TimeField } from './TimeField';
import { DateField } from './MiniDatePicker';
import {
  loadExercises,
  loadRecipes,
  loadExerciseDetail,
  loadRecipeDetail,
  type HealthExerciseSummary,
  type HealthExerciseDetail,
  type HealthRecipeSummary,
  type HealthRecipeDetail,
  type HealthWorkoutType,
  loadTaxonomies,
  type HealthTaxonomies,
} from '../lib/health-catalog';
import {
  loadHealthProfile,
  saveHealthProfile,
  loadGeneralProfile,
  saveGeneralProfile,
  type HealthProfile,
  type GeneralProfile,
} from '../lib/health-store';
import { t, tt, useLocale } from '../lib/i18n';
import { CookingTimeGrid, type CookTime } from './CookingTimeGrid';
import { ContentRating } from './ContentRating';
import { UserAvatarPanel } from './UserAvatarPanel';
import HealthPlansPage from './HealthPlansPage';
import { ShoppingTab } from './ShoppingTab';
import { StarterShelf } from './StarterShelf';
import { StarterDetailBody } from './StartersSheet';
import { planFromCurated, type CuratedPlanDetail } from '@ava/core/health/starters';
import { loadCuratedPlan, reportCuratedStart } from '../lib/curated-plans';
import { saveHealthPlan } from '../lib/health-plans-store';
import { todayLocal } from '@ava/core/dates';
import { libraryFit, orderByPreference, type FitVerdict } from '@ava/core/health/library-fit';
import { useLibraryFit, FitBar, FitMark } from './LibraryFit';

/**
 * Health & Nutrition page for the IDE — the public exercise + recipe
 * library. Self-contained (the IDE renders pages as prop-less
 * components); data comes through the health-catalog fetch layer.
 *
 * Step 2b: page shell + Exercises / Recipes grids. The My-submissions
 * and Profile tabs are placeholders until 2d / 2e; click-to-open
 * detail modals land in 2c.
 */

// Same five as the extension, in the same order. A shared room that opens on
// a different tab depending on which app you launched is one room in name only.
type HealthTab = 'plans' | 'shopping' | 'starters' | 'exercises' | 'recipes' | 'profile' | 'ava';

// Set when something elsewhere (the main-chat → Health room handoff) wants the
// page to open on the Ava room tab. Read on mount; the live event covers the
// already-mounted case.
let pendingHealthRoomOpen = false;
export function requestHealthRoomTab(): void { pendingHealthRoomOpen = true; }

// Set by the command centre's For you (Health Part 4): open on a tab, with a
// dish or exercise open, or the new-plan wizard holding a first item.
type HealthOpenRequest = {
  tab: 'plans' | 'exercises' | 'recipes' | 'profile';
  item?: { kind: 'recipe' | 'exercise'; slug: string };
  seed?: { kind: 'recipe' | 'exercise'; slug: string; name: string; course?: string | null };
};
let pendingHealthOpen: HealthOpenRequest | null = null;
export function requestHealthOpen(req: HealthOpenRequest): void { pendingHealthOpen = req; }

const PAGE_SIZE = 24;

const WORKOUT_TYPES: HealthWorkoutType[] = [
  'strength', 'hypertrophy', 'conditioning', 'hiit',
  'mobility', 'yoga', 'pilates', 'recovery', 'running', 'cycling', 'hybrid',
];

// Browse-tab workout-type label — looked up live so it follows the locale.
const workoutLabel = (type: HealthWorkoutType): string => t(`health.browse.workout.${type}`);

const WORKOUT_ACCENT: Record<HealthWorkoutType, string> = {
  strength: '#a8a8b3', hypertrophy: '#c084fc', conditioning: '#34d399',
  hiit: '#fb923c', mobility: '#60a5fa', yoga: '#fbbf24', pilates: '#f472b6',
  recovery: '#94a3b8', running: '#22d3ee', cycling: '#a78bfa', hybrid: '#f87171',
};

const COURSES = ['breakfast', 'main', 'starter', 'side', 'snack', 'dessert'] as const;
// Browse-tab course label — looked up live so it follows the locale.
const courseLabel = (course: string): string => t(`health.browse.course.${course}`);
const exerciseTypeLabel = (type: string): string => t(`health.submit.ex_type.${type}`);

// ── Page ──────────────────────────────────────────────────────────────────

export function HealthPage() {
  useLocale();
  // Opens on your plans, like the extension. What you came for is what you
  // are working towards, not the catalogue.
  // `current` is destructured as `tab` so every `tab === '...'` render check in
  // this file is untouched. setNow for programmatic jumps (the pending-room
  // effect, and the handler below that lands you on Plans after an action):
  // nobody clicked a tab there, so there is nothing to acknowledge.
  const { current: tab, pending: tabPending, switchTo: setTabUser, setNow: setTab } =
    useTabTransition<HealthTab>(pendingHealthRoomOpen ? 'ava' : pendingHealthOpen?.tab ?? 'plans');
  // What For you asked to open, taken once.
  const [openReq] = useState<HealthOpenRequest | null>(() => { const r = pendingHealthOpen; pendingHealthOpen = null; return r; });
  /** The day view's "Shopping list" opens the Shopping tab (13 Nov 2026). */
  const [shoppingPlanId, setShoppingPlanId] = useState<string | null>(null);
  /** Recipes and Exercises show only what fits their rules until switched (Health Part 3). */
  const [fitsOnly, setFitsOnly] = useState(true);
  /** A card opened from the Ready-made tab, shown as its full week. */
  const [starterOpenId, setStarterOpenId] = useState<string | null>(null);
  const [starterDetail, setStarterDetail] = useState<CuratedPlanDetail | null>(null);
  const [starterLoading, setStarterLoading] = useState(false);
  useEffect(() => {
    if (!starterOpenId) { setStarterDetail(null); return; }
    setStarterLoading(true);
    let cancelled = false;
    loadCuratedPlan(starterOpenId)
      .then(d => { if (!cancelled) setStarterDetail(d); })
      .catch(() => { if (!cancelled) setStarterDetail(null); })
      .finally(() => { if (!cancelled) setStarterLoading(false); });
    return () => { cancelled = true; };
  }, [starterOpenId]);
  /** The shelf orders by your stated goal, so it needs the profile. */
  const [starterProfile, setStarterProfile] = useState<HealthProfile | null>(null);
  useEffect(() => { loadHealthProfile().then(setStarterProfile).catch(() => { /* unordered shelf still works */ }); }, []);

  // Open the Ava room tab on the handoff request — the module flag covers a
  // fresh mount, the event covers an already-mounted page.
  useEffect(() => {
    if (pendingHealthRoomOpen) { pendingHealthRoomOpen = false; setTab('ava'); }
    const onOpenRoom = () => setTab('ava');
    window.addEventListener('ava-open-health-room', onOpenRoom);
    return () => window.removeEventListener('ava-open-health-room', onOpenRoom);
  }, []);

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 0, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: active ? 600 : 500,
    background: 'transparent',
    color: active ? '#c084fc' : '#6c7086',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    marginBottom: -1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '20px 32px 0', flexShrink: 0, position: 'relative',
        borderBottom: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
        background: 'rgba(12, 8, 20, 0.4)',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#cdd6f4', margin: 0, marginBottom: 2 }}>
            {t('health.browse.title')}
          </h1>
          <p style={{ fontSize: 12, color: '#9b8caa', margin: 0, marginBottom: 16 }}>
            {t('health.browse.subtitle')}
          </p>
        </div>
        {/* Contribute removed 11 Nov 2026 (no accounts: not something we offer). */}
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setTabUser('plans')} style={tabBtnStyle(tab === 'plans')}>{t('health.browse.tab.plans')}{tabPending === 'plans' && <TabSpinner />}</button>
          <button onClick={() => setTabUser('shopping')} style={tabBtnStyle(tab === 'shopping')}>{tt('health.browse.tab.shopping', 'Shopping')}{tabPending === 'shopping' && <TabSpinner />}</button>
          <button onClick={() => setTabUser('starters')} style={tabBtnStyle(tab === 'starters')}>{t('health.browse.tab.starters')}{tabPending === 'starters' && <TabSpinner />}</button>
          <button onClick={() => setTabUser('exercises')} style={tabBtnStyle(tab === 'exercises')}>{t('health.browse.tab.exercises')}{tabPending === 'exercises' && <TabSpinner />}</button>
          <button onClick={() => setTabUser('recipes')} style={tabBtnStyle(tab === 'recipes')}>{t('health.browse.tab.recipes')}{tabPending === 'recipes' && <TabSpinner />}</button>
          <button onClick={() => setTabUser('profile')} style={tabBtnStyle(tab === 'profile')}>{t('health.browse.tab.profile')}{tabPending === 'profile' && <TabSpinner />}</button>
          <button onClick={() => setTabUser('ava')} style={tabBtnStyle(tab === 'ava')}>{t('health.browse.tab.ava')}{tabPending === 'ava' && <TabSpinner />}</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Non-Ava tabs — padded scroll area. */}
        <div style={{ height: '100%', overflowY: 'auto', padding: tab === 'shopping' ? 0 : '20px 32px', display: tab === 'ava' ? 'none' : 'block' }}>
          {/* Ready-made plans: their own tab, so they are a thing people know
              exists rather than something found by pressing "New plan". */}
          {tab === 'starters' && (
            starterOpenId ? (
              // In page, with a back button — the same shape an exercise takes
              // in this room. It used to open as a centred modal, which made
              // one room produce two kinds of screen.
              <DetailPageView onBack={() => setStarterOpenId(null)} backLabel={t('health.browse.tab.starters')}>
                <div style={{ height: '100%', overflowY: 'auto', padding: '16px 32px 32px' }}>
                  <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <StarterDetailBody
                      open={starterDetail}
                      detailLoading={starterLoading}
                      profile={starterProfile}
                      starting={false}
                      onStart={(placements) => {
                        if (!starterDetail) return;
                        const plan = planFromCurated(starterDetail, {
                          id: `plan${Date.now()}${Math.floor(Math.random() * 1000)}`,
                          // start_date comes from the earliest placement.
                          startDate: placements[0]?.date ?? todayLocal(),
                          placements,
                        });
                        void saveHealthPlan(plan as never);
                        void reportCuratedStart(starterDetail.id);
                        setStarterOpenId(null);
                        setTab('plans');
                      }}
                    />
                  </div>
                </div>
              </DetailPageView>
            ) : (
              <StarterShelf profile={starterProfile} onOpen={setStarterOpenId} />
            )
          )}
          {tab === 'plans' && <HealthPlansPage seed={openReq?.seed ?? null} onOpenShopping={(planId) => { setShoppingPlanId(planId); setTab('shopping'); }} />}
          {tab === 'shopping' && <ShoppingTab initialPlanId={shoppingPlanId} />}
          {tab === 'exercises' && <ExercisesGrid initialSlug={openReq?.item?.kind === 'exercise' ? openReq.item.slug : null} fitsOnly={fitsOnly} onToggleFit={() => setFitsOnly((v) => !v)} onProfile={() => setTabUser('profile')} />}
          {tab === 'recipes' && <RecipesGrid initialSlug={openReq?.item?.kind === 'recipe' ? openReq.item.slug : null} fitsOnly={fitsOnly} onToggleFit={() => setFitsOnly((v) => !v)} onProfile={() => setTabUser('profile')} />}
          {tab === 'profile' && <ProfileTab />}
        </div>
        {/* Ava room — always mounted so its conversation survives tab switches;
            full-bleed (the chat owns its own scroll). */}
        <div style={{ height: '100%', display: tab === 'ava' ? 'block' : 'none' }}>
          <HealthRoomChat active={tab === 'ava'} />
        </div>
      </div>
    </div>
  );
}

// ── Exercises grid ────────────────────────────────────────────────────────

/** "Only what fits me" — shared by both browse tabs (Health Part 3). */
interface GridFitProps { fitsOnly: boolean; onToggleFit: () => void; onProfile: () => void; initialSlug?: string | null }

function ExercisesGrid({ fitsOnly, onToggleFit, onProfile, initialSlug }: GridFitProps) {
  const [items, setItems] = useState<HealthExerciseSummary[]>([]);
  const fit = useLibraryFit();
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<'all' | HealthWorkoutType>('all');
  const [view, setView] = useBrowseView();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [modalSlug, setModalSlug] = useState<string | null>(initialSlug ?? null);

  const fetchPage = useCallback(async (off: number) => {
    setLoading(true);
    setFailed(false);
    try {
      const r = await loadExercises({
        limit: PAGE_SIZE,
        offset: off,
        workoutType: filter === 'all' ? undefined : filter,
        q: search.trim() || undefined,
      });
      setItems(r.exercises);
      setTotal(r.total);
      setOffset(off);
    } catch {
      setItems([]);
      setTotal(0);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  // Refetch (page 0) on filter / search change — search debounced 300ms.
  useEffect(() => {
    const timer = setTimeout(() => { void fetchPage(0); }, search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  // Each page is checked against their rules on this machine.
  useEffect(() => { if (fit.rules) fit.check([], items.map((i) => i.slug)); }, [fit.rules, fit.check, items]);
  const fitView = libraryFit(items, fit.state, { rules: fit.rules, fitsOnly });

  // Detail opens as a full page in place of the grid (not an overlay).
  if (modalSlug) {
    return <ExerciseDetailView slug={modalSlug} onBack={() => setModalSlug(null)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <BrowseToolbar search={search} onSearch={setSearch} placeholder={t('health.browse.search_exercises_placeholder')} view={view} onView={setView} />
      <FilterRow>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>{t('health.browse.filter.all')}</FilterChip>
        {WORKOUT_TYPES.map(w => (
          <FilterChip key={w} active={filter === w} onClick={() => setFilter(w)}>{workoutLabel(w)}</FilterChip>
        ))}
      </FilterRow>
      {!loading && !failed && <FitBar rules={fit.rules} fitsOnly={fitsOnly} view={fitView} onToggle={onToggleFit} onProfile={onProfile} />}

      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <CenterNote>{t('health.browse.loading_exercises')}</CenterNote>
        ) : failed ? (
          <LoadError noun={t('health.browse.noun.exercises')} onRetry={() => { fit.retry(); void fetchPage(0); }} />
        ) : fitView.shown.length === 0 ? (
          <CenterNote>{items.length > 0 ? tt('health.fit.none_on_page', 'Nothing on this page fits your rules. Try the next page, or show everything.') : search ? t('health.browse.no_exercises_match_q', { q: search }) : t('health.browse.no_exercises_found')}</CenterNote>
        ) : (
          <CardGrid view={view}>
            {fitView.shown.map(ex => (
              <ExerciseCardItem key={ex.id} ex={ex} view={view} onOpen={setModalSlug} fit={fit.rules ? fit.state.results[ex.slug] : undefined} />
            ))}
          </CardGrid>
        )}
      </div>
      {items.length > 0 && <Pagination total={total} offset={offset} loading={loading} onPage={(o) => { fit.retry(); void fetchPage(o); }} />}
    </div>
  );
}

// ── Recipes grid ──────────────────────────────────────────────────────────

function RecipesGrid({ fitsOnly, onToggleFit, onProfile, initialSlug }: GridFitProps) {
  const [items, setItems] = useState<HealthRecipeSummary[]>([]);
  const fit = useLibraryFit();
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [course, setCourse] = useState<'all' | string>('all');
  // Structured filter selections. Collections + course live in the always-on
  // Tier-1 strip; diets / dietary-flags (free-from) / cuisines / max-time / sort
  // live in the Tier-2 "Filters" panel. All slugs; multi-select OR within an
  // axis, AND across axes — the backend resolves and intersects them.
  const [collections, setCollections] = useState<Set<string>>(new Set());
  const [diets, setDiets] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [cuisines, setCuisines] = useState<Set<string>>(new Set());
  const [maxTime, setMaxTime] = useState<number | null>(null);
  const [sort, setSort] = useState<'curated' | 'name'>('curated');
  const [tax, setTax] = useState<HealthTaxonomies | null>(null);
  const [view, setView] = useBrowseView();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [modalSlug, setModalSlug] = useState<string | null>(initialSlug ?? null);

  // Taxonomies (collections / diets / flags / cuisines) load once to populate
  // the filter chips. Silent on failure — filters just stay empty.
  useEffect(() => {
    let alive = true;
    loadTaxonomies().then((tx) => { if (alive) setTax(tx); }).catch(() => { /* filters degrade gracefully */ });
    return () => { alive = false; };
  }, []);

  const fetchPage = useCallback(async (off: number) => {
    setLoading(true);
    setFailed(false);
    try {
      const r = await loadRecipes({
        limit: PAGE_SIZE,
        offset: off,
        course: course === 'all' ? undefined : course,
        collections: collections.size ? [...collections] : undefined,
        diets: diets.size ? [...diets] : undefined,
        flags: flags.size ? [...flags] : undefined,
        cuisines: cuisines.size ? [...cuisines] : undefined,
        maxTime: maxTime ?? undefined,
        sort: sort === 'curated' ? undefined : sort,
        q: search.trim() || undefined,
      });
      setItems(r.recipes);
      setTotal(r.total);
      setOffset(off);
    } catch {
      setItems([]);
      setTotal(0);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [course, collections, diets, flags, cuisines, maxTime, sort, search]);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchPage(0); }, search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, collections, diets, flags, cuisines, maxTime, sort, search]);

  // Each page is checked against their rules on this machine; preferences
  // (likes, dislikes, cuisines) only change the order.
  useEffect(() => { if (fit.rules) fit.check(items.map((i) => i.slug), []); }, [fit.rules, fit.check, items]);
  const ordered = useMemo(() => orderByPreference(items, fit.profile), [items, fit.profile]);
  const fitView = libraryFit(ordered, fit.state, { rules: fit.rules, fitsOnly });

  // Toggle a slug in a multi-select axis (immutable Set so React re-renders).
  const toggleIn = (set: Set<string>, setSet: (s: Set<string>) => void) => (slug: string) => {
    const next = new Set(set);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    setSet(next);
  };
  const tier2Count = collections.size + diets.size + flags.size + cuisines.size + (maxTime != null ? 1 : 0) + (sort !== 'curated' ? 1 : 0);
  const clearAll = () => { setCollections(new Set()); setDiets(new Set()); setFlags(new Set()); setCuisines(new Set()); setMaxTime(null); setSort('curated'); };

  // Detail opens as a full page in place of the grid (not an overlay).
  if (modalSlug) {
    return <RecipeDetailView slug={modalSlug} onBack={() => setModalSlug(null)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <BrowseToolbar search={search} onSearch={setSearch} placeholder={t('health.browse.search_recipes_placeholder')} view={view} onView={setView} />

      {/* Course — the meal-type tabs (single-select), kept inline. */}
      <FilterRow>
        <FilterChip active={course === 'all'} onClick={() => setCourse('all')}>{t('health.browse.filter.all')}</FilterChip>
        {COURSES.map((c) => (
          <FilterChip key={c} active={course === c} onClick={() => setCourse(c)}>{courseLabel(c)}</FilterChip>
        ))}
      </FilterRow>

      {/* Filter categories — one compact multi-select dropdown each, inline.
          Keeps every axis visible without a wall of chips, no hidden overlay. */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {tax && tax.collections.length > 0 && (
          <RecipeFilterDropdown label="Collections" options={tax.collections} selected={collections} onToggle={toggleIn(collections, setCollections)} />
        )}
        {tax && tax.diets.length > 0 && (
          <RecipeFilterDropdown label="Diet" options={tax.diets} selected={diets} onToggle={toggleIn(diets, setDiets)} />
        )}
        {tax && tax.dietary_flags.length > 0 && (
          <RecipeFilterDropdown label="Dietary needs" options={tax.dietary_flags} selected={flags} onToggle={toggleIn(flags, setFlags)} />
        )}
        {tax && tax.cuisines.length > 0 && (
          <RecipeFilterDropdown label="Cuisine" options={tax.cuisines} selected={cuisines} onToggle={toggleIn(cuisines, setCuisines)} />
        )}
        <RecipeFilterDropdown
          label="Time"
          options={[15, 30, 45, 60].map((m) => ({ slug: String(m), name: `≤ ${m} min` }))}
          selected={new Set(maxTime != null ? [String(maxTime)] : [])}
          onToggle={(s) => setMaxTime(maxTime === Number(s) ? null : Number(s))}
          valueLabel={maxTime != null ? `≤ ${maxTime} min` : undefined}
        />
        <RecipeFilterDropdown
          label="Sort"
          options={[{ slug: 'curated', name: 'Curated' }, { slug: 'name', name: 'A–Z' }]}
          selected={new Set([sort])}
          onToggle={(s) => setSort(s as 'curated' | 'name')}
          valueLabel={sort === 'name' ? 'A–Z' : 'Curated'}
        />
        {tier2Count > 0 && (
          <button onClick={clearAll} style={{ marginLeft: 4, background: 'transparent', border: 'none', color: '#6c7086', fontSize: 11, cursor: 'pointer' }}>Clear filters</button>
        )}
      </div>

      {!loading && !failed && <FitBar rules={fit.rules} fitsOnly={fitsOnly} view={fitView} onToggle={onToggleFit} onProfile={onProfile} />}

      {/* Results fill the remaining height so pagination is pushed to the foot
          of the page even when only a few cards land. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <CenterNote>{t('health.browse.loading_recipes')}</CenterNote>
        ) : failed ? (
          <LoadError noun={t('health.browse.noun.recipes')} onRetry={() => { fit.retry(); void fetchPage(0); }} />
        ) : fitView.shown.length === 0 ? (
          <CenterNote>{items.length > 0 ? tt('health.fit.none_on_page', 'Nothing on this page fits your rules. Try the next page, or show everything.') : search ? t('health.browse.no_recipes_match_q', { q: search }) : t('health.browse.no_recipes_found')}</CenterNote>
        ) : (
          <CardGrid view={view}>
            {fitView.shown.map((r) => (
              <RecipeCardItem key={r.id} r={r} view={view} onOpen={setModalSlug} fit={fit.rules ? fit.state.results[r.slug] : undefined} />
            ))}
          </CardGrid>
        )}
      </div>
      {items.length > 0 && <Pagination total={total} offset={offset} loading={loading} onPage={(o) => { fit.retry(); void fetchPage(o); }} />}
    </div>
  );
}

/** One filter axis as a compact multi-select dropdown — replaces the old modal
 *  so every axis stays visible inline without a wall of chips or a hidden
 *  overlay. Opaque popover (solid bg, not the translucent card token); closes
 *  on outside-click or Escape. `valueLabel` shows a single value (time / sort)
 *  instead of a selected count. */
function RecipeFilterDropdown({ label, options, selected, onToggle, valueLabel }: {
  label: string;
  options: { slug: string; name: string }[];
  selected: Set<string>;
  onToggle: (slug: string) => void;
  valueLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const count = selected.size;
  const active = valueLabel ? valueLabel !== 'Curated' : count > 0;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          padding: '4px 11px', fontSize: 11, fontWeight: 500, borderRadius: 999,
          border: `1px solid ${active ? 'var(--accent)' : '#313244'}`,
          background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
          color: active ? '#c084fc' : '#6c7086',
        }}
      >
        {valueLabel ? `${label}: ${valueLabel}` : `${label}${count > 0 ? ` · ${count}` : ''}`}
        <span aria-hidden style={{ fontSize: 8, opacity: 0.7 }}>&#9662;</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, zIndex: 50, marginTop: 6, maxHeight: 288, width: 240, overflowY: 'auto', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: '#1a1028', padding: 6, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          {options.map((o) => {
            const on = selected.has(o.slug);
            return (
              <button
                key={o.slug}
                onClick={() => onToggle(o.slug)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 10,
                  borderRadius: 8, border: 'none', background: 'transparent',
                  padding: '6px 10px', textAlign: 'left', fontSize: 12, cursor: 'pointer',
                  color: on ? '#c084fc' : '#9b8caa',
                }}
              >
                <span style={{ display: 'flex', width: 14, height: 14, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 8, color: '#fff', border: `1px solid ${on ? 'var(--accent)' : '#45475a'}`, background: on ? 'var(--accent)' : 'transparent' }}>{on ? '✓' : ''}</span>
                {o.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'rgba(26, 16, 40, 0.6)',
  border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
  borderRadius: 8,
  overflow: 'hidden',
};

// ── Browse view (grid/list) — shared + persisted across both tabs ──────────

type View = 'grid' | 'list';
const HEALTH_VIEW_KEY = 'ava-ide-health-view';

/** Grid/list view, persisted to localStorage. The two browse grids mount one
 *  at a time, so reading localStorage on mount keeps them in sync. */
function useBrowseView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => {
    try { return localStorage.getItem(HEALTH_VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  const change = (v: View) => {
    setView(v);
    try { localStorage.setItem(HEALTH_VIEW_KEY, v); } catch { /* unavailable */ }
  };
  return [view, change];
}

function ViewToggle({ view, onView }: { view: View; onView: (v: View) => void }) {
  const btn = (v: View, title: string, icon: React.ReactNode) => {
    const active = view === v;
    return (
      <button
        type="button" onClick={() => onView(v)} aria-pressed={active} title={title}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
          borderRadius: 6, cursor: 'pointer', transition: 'all 0.12s',
          border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 50%, transparent)' : 'color-mix(in srgb, var(--accent) 14%, transparent)'}`,
          background: active ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
          color: active ? '#cdd6f4' : '#6c7086',
        }}
      >
        {icon}
      </button>
    );
  };
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {btn('grid', 'Grid view', <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.2" /><rect x="9" y="1" width="6" height="6" rx="1.2" /><rect x="1" y="9" width="6" height="6" rx="1.2" /><rect x="9" y="9" width="6" height="6" rx="1.2" /></svg>)}
      {btn('list', 'List view', <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2.5" width="14" height="2.4" rx="1.2" /><rect x="1" y="6.8" width="14" height="2.4" rx="1.2" /><rect x="1" y="11.1" width="14" height="2.4" rx="1.2" /></svg>)}
    </div>
  );
}

/** Toolbar row: search (flex) + the grid/list toggle. */
function BrowseToolbar({ search, onSearch, placeholder, view, onView }: { search: string; onSearch: (v: string) => void; placeholder: string; view: View; onView: (v: View) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1 }}><SearchInput value={search} onChange={onSearch} placeholder={placeholder} /></div>
      <div style={{ marginBottom: 12 }}><ViewToggle view={view} onView={onView} /></div>
    </div>
  );
}

function CardGrid({ view, children }: { view: View; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: view === 'list'
        ? 'repeat(auto-fill, minmax(320px, 1fr))'
        // Fixed 6 columns so a 24-per-page load fills evenly (4 rows), and
        // cards stay a readable size instead of packing 9 across.
        : 'repeat(6, minmax(0, 1fr))',
      gap: 10,
    }}>
      {children}
    </div>
  );
}

/** Clickable catalog card — opens the detail modal. */
function Card({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...cardStyle,
        cursor: 'pointer',
        borderColor: hover ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'color-mix(in srgb, var(--accent) 12%, transparent)',
        transition: 'border-color 0.12s',
      }}
    >
      {children}
    </div>
  );
}

// ── Browse cards (compact-hero grid + dense list variants) ─────────────────

function ExerciseCardItem({ ex, view, onOpen, fit }: { ex: HealthExerciseSummary; view: View; onOpen: (slug: string) => void; fit?: FitVerdict }) {
  const accent = WORKOUT_ACCENT[ex.workout_type];
  const img = ex.thumbnail_url
    ? <img src={ex.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <span style={{ fontSize: 22, opacity: 0.3 }}>🏋</span>;

  if (view === 'list') {
    return (
      <Card onClick={() => onOpen(ex.slug)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}>
          <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: `linear-gradient(135deg, ${accent}33, ${accent}11)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {img}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: accent }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.4, color: accent }}>{workoutLabel(ex.workout_type)}</div>
            <div style={{ fontSize: 13, color: '#cdd6f4', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ex.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}><Dots value={ex.difficulty} accent={accent} /><span style={{ fontSize: 10, color: '#6c7086', textTransform: 'capitalize' }}>{exerciseTypeLabel(ex.exercise_type)}</span></div>
          </div>
          <FitMark fit={fit} />
        </div>
      </Card>
    );
  }
  return (
    <Card onClick={() => onOpen(ex.slug)}>
      <div style={{ position: 'relative', aspectRatio: '3 / 2', overflow: 'hidden', background: `linear-gradient(135deg, ${accent}33, ${accent}11)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {img}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: accent }} />
        <FitMark fit={fit} floating />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%', background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.3) 50%, transparent)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.6, color: accent, marginBottom: 2 }}>{workoutLabel(ex.workout_type)}</div>
          <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.25 }}>{ex.name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 10px' }}>
        <Dots value={ex.difficulty} accent={accent} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'capitalize' }}>{exerciseTypeLabel(ex.exercise_type)}</span>
          <CardRating average={ex.average_rating} />
        </div>
      </div>
    </Card>
  );
}

/** "From Scratch" badge — marks a recipe in the curated `unprocessed`
 *  collection. `floating` is the absolute variant for the grid card photo. */
function FromScratchBadge({ floating }: { floating?: boolean }) {
  const label = t('health.browse.from_scratch');
  if (floating) {
    return (
      <div style={{ position: 'absolute', left: 6, top: 6, zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <span aria-hidden>✦</span>{label}
      </div>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: '#c084fc', fontSize: 9, fontWeight: 500 }}>
      <span aria-hidden>✦</span>{label}
    </span>
  );
}

function RecipeCardItem({ r, view, onOpen, fit }: { r: HealthRecipeSummary; view: View; onOpen: (slug: string) => void; fit?: FitVerdict }) {
  const footer = r.course || r.origin_country || r.cuisine_name || '';
  const img = r.hero_image_url
    ? <img src={r.hero_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <span style={{ fontSize: 22, opacity: 0.3 }}>🍽</span>;

  if (view === 'list') {
    return (
      <Card onClick={() => onOpen(r.slug)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}>
          <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{img}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {r.cuisine_name && <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.4, color: '#fbbf24' }}>{r.cuisine_name}</div>}
            <div style={{ fontSize: 13, color: '#cdd6f4', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 }}>
              {r.course && <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'capitalize' }}>{r.course}</span>}
              {r.from_scratch && <FromScratchBadge />}
            </div>
          </div>
          <FitMark fit={fit} />
        </div>
      </Card>
    );
  }
  return (
    <Card onClick={() => onOpen(r.slug)}>
      <div style={{ position: 'relative', aspectRatio: '3 / 2', overflow: 'hidden', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {img}
        {r.from_scratch && <FromScratchBadge floating />}
        <FitMark fit={fit} floating />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%', background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.3) 50%, transparent)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8 }}>
          {r.cuisine_name && <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.6, color: '#fbbf24', marginBottom: 2 }}>{r.cuisine_name}</div>}
          <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.25 }}>{r.name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 10px' }}>
        <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{footer}</span>
        <CardRating average={r.average_rating} />
      </div>
    </Card>
  );
}

/**
 * The rating on a card. Always rendered, 0 when unrated — hiding it left those
 * cards one item short of their neighbours, so the grid read as ragged and the
 * rated ones looked like the only real entries.
 */
function CardRating({ average }: { average?: number | null }) {
  return (
    <span style={{ fontSize: 10, flexShrink: 0, color: average ? '#fbbf24' : '#6c7086' }}>
      {'★'} {average ?? 0}
    </span>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#6c7086' }}>
      {children}
    </div>
  );
}

// Shown when a catalog fetch failed — distinct from a genuinely empty
// result. Reassures the user it's a network hiccup, not lost data, and
// offers an explicit retry.
function LoadError({ noun, onRetry }: { noun: string; onRetry: () => void }) {
  return (
    <div style={{ padding: '44px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#cdd6f4', marginBottom: 4 }}>{t('health.browse.load_error', { noun })}</div>
      <div style={{ fontSize: 11, color: '#6c7086', maxWidth: 300, margin: '0 auto 12px', lineHeight: 1.5 }}>
        {t('health.browse.load_error_hint')}
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          cursor: 'pointer', borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 600,
          border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: '#cba6f7',
        }}
      >
        {t('health.browse.retry')}
      </button>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box', marginBottom: 12,
        padding: '8px 12px', fontSize: 12,
        background: 'rgba(12, 8, 20, 0.5)', color: '#cdd6f4',
        border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', borderRadius: 8, outline: 'none',
      }}
    />
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
        borderRadius: 999,
        background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
        color: active ? '#c084fc' : '#6c7086',
        border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'color-mix(in srgb, var(--accent) 12%, transparent)'}`,
      }}
    >
      {children}
    </button>
  );
}

function Dots({ value, accent }: { value: number; accent: string }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }} aria-label={t('health.browse.difficulty_of_5', { n: value })}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: n <= value ? accent : 'color-mix(in srgb, var(--accent) 15%, transparent)',
        }} />
      ))}
    </span>
  );
}

function Pagination({ total, offset, loading, onPage }: {
  total: number; offset: number; loading: boolean; onPage: (off: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const atStart = offset === 0;
  const atEnd = currentPage >= totalPages;
  const btn = (disabled: boolean): React.CSSProperties => ({
    padding: '5px 12px', fontSize: 11, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
    background: 'transparent', color: disabled ? '#45475a' : '#9b8caa',
    border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 24 }}>
      <button disabled={atStart || loading} style={btn(atStart || loading)}
        onClick={() => !atStart && !loading && onPage(Math.max(0, offset - PAGE_SIZE))}>‹ {t('health.browse.prev')}</button>
      <span style={{ fontSize: 11, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 1 }}>
        {t('health.browse.page_of', { current: currentPage, total: totalPages })}
      </span>
      <button disabled={atEnd || loading} style={btn(atEnd || loading)}
        onClick={() => !atEnd && !loading && onPage(offset + PAGE_SIZE)}>{t('health.browse.next')} ›</button>
    </div>
  );
}

/** Full-page detail view inside the Health tab — a back bar over the detail
 *  body (which owns its own scroll). Replaces the old modal overlay for a
 *  page-style UX (navigate in, "← Back"); Esc also goes back. */
function DetailPageView({ onBack, backLabel, children }: { onBack: () => void; backLabel: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 'none', borderBottom: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', paddingBottom: 10, marginBottom: 6 }}>
        <button
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'transparent', color: '#9b8caa', fontSize: 11, fontWeight: 600, padding: '5px 10px' }}
        >
          ← {backLabel}
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function sectionLabel(text: string): React.ReactElement {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086', marginBottom: 8 }}>
      {text}
    </div>
  );
}

// ── Exercise detail ───────────────────────────────────────────────────────

function ExerciseDetailView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [detail, setDetail] = useState<HealthExerciseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    loadExerciseDetail(slug)
      .then(d => { if (live) { setDetail(d); setFailed(!d); } })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [slug]);

  return (
    <DetailPageView onBack={onBack} backLabel={t('health.browse.tab.exercises')}>
      {loading
        ? <DetailCentered>{t('health.browse.loading_exercise')}</DetailCentered>
        : failed || !detail
          ? <DetailCentered>{t('health.browse.couldnt_load_exercise')}</DetailCentered>
          : <ExerciseDetailBody ex={detail} />}
    </DetailPageView>
  );
}

/** Centred loading / error state that fills the fixed-height detail modal. */
function DetailCentered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <CenterNote>{children}</CenterNote>
    </div>
  );
}

export function ExerciseDetailBody({ ex }: { ex: HealthExerciseDetail }) {
  // Single-scroll, matching the hub's redesigned exercise view. Contraindications
  // above the method. No operator diagnostics.
  const accent = WORKOUT_ACCENT[ex.workout_type];
  const primaries = ex.muscles.filter(m => m.role === 'primary');
  const secondaries = ex.muscles.filter(m => m.role === 'secondary');

  const routine: Array<[string, string]> = [];
  if (ex.routine.sets != null) routine.push([t('health.browse.routine.sets'), String(ex.routine.sets)]);
  if (ex.routine.reps_target) routine.push([t('health.browse.routine.reps'), ex.routine.reps_target]);
  if (ex.routine.rest_seconds != null) routine.push([t('health.browse.routine.rest'), ex.routine.rest_seconds + 's']);
  if (ex.routine.tempo) routine.push([t('health.browse.routine.tempo'), ex.routine.tempo]);
  if (ex.routine.rpe != null) routine.push(['RPE', String(ex.routine.rpe)]);
  else if (ex.routine.percent_1rm) routine.push(['%1RM', ex.routine.percent_1rm]);
  if (ex.routine.seconds_per_set != null) routine.push([t('health.browse.per_set'), '~' + ex.routine.seconds_per_set + 's']);
  if (ex.routine.frequency_per_week) routine.push([t('health.browse.routine.freq'), ex.routine.frequency_per_week]);

  const cardio: Array<[string, string]> = [];
  const c = ex.cardio;
  if (c) {
    if (c.style) cardio.push([t('health.browse.cardio.style'), c.style]);
    if (c.duration_minutes != null) cardio.push([t('health.browse.cardio.duration'), c.duration_minutes + ' min']);
    if (c.heart_rate_zone) cardio.push([t('health.browse.cardio.zone'), c.heart_rate_zone]);
    if (c.work_seconds != null) cardio.push([t('health.browse.cardio.work'), c.work_seconds + 's']);
    if (c.rest_seconds != null) cardio.push([t('health.browse.cardio.rest'), c.rest_seconds + 's']);
    if (c.rounds != null) cardio.push([t('health.browse.cardio.rounds'), String(c.rounds)]);
  }
  const alternatives = [
    ...(ex.regression ? [{ ...ex.regression, kind: t('health.browse.easier') }] : []),
    ...(ex.progression ? [{ ...ex.progression, kind: t('health.browse.harder') }] : []),
    ...((ex.substitutions ?? []).map(s => ({ ...s, kind: t('health.browse.instead') }))),
  ];
  const SEV: Record<string, string> = { avoid: '#f87171', modify: '#fbbf24', caution: '#fbbf24' };
  const grid = (rows: Array<[string, string]>) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
      {rows.map(([k, val]) => (
        <div key={k}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086' }}>{k}</div>
          <div style={{ fontSize: 14, color: '#cdd6f4', marginTop: 2 }}>{val}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {ex.thumbnail_url && (
        <div style={{ flexShrink: 0, height: 184, overflow: 'hidden', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}>
          <img src={ex.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2.5, color: accent, marginBottom: 6 }}>{workoutLabel(ex.workout_type)}</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <h2 style={{ fontSize: 21, fontWeight: 300, color: '#cdd6f4', margin: 0 }}>{ex.name}</h2>
              {/* Rated after doing it — "too hard" is the signal the
                  progression loop actually wants. */}
              <ContentRating subjectType="exercise" subjectId={ex.id} average={ex.average_rating} count={ex.rating_count} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 11, color: '#9b8caa', flexWrap: 'wrap' }}>
              <span style={{ textTransform: 'capitalize', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '2px 8px', borderRadius: 6 }}>{exerciseTypeLabel(ex.exercise_type)}</span>
              <Dots value={ex.difficulty} accent={accent} />
              <span>{t('health.browse.difficulty_n', { n: ex.difficulty })}</span>
              {ex.movement_pattern && <span style={{ textTransform: 'capitalize', opacity: 0.7 }}>{ex.movement_pattern.replace(/_/g, ' ')}</span>}
              {ex.session_role && <span style={{ textTransform: 'capitalize', opacity: 0.7 }}>{ex.session_role}</span>}
              {ex.laterality && <span style={{ textTransform: 'capitalize', opacity: 0.7 }}>{ex.laterality}</span>}
            </div>
          </div>

          {(ex.contraindications?.length ?? 0) > 0 && (
            <div style={{ borderRadius: 8, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.06)', padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2.5, color: '#f87171', marginBottom: 8 }}>{t('health.browse.take_care')}</div>
              {ex.contraindications!.map(cc => (
                <div key={cc.slug} style={{ fontSize: 12, lineHeight: 1.6, color: '#cdd6f4' }}>
                  <span style={{ fontWeight: 600, textTransform: 'uppercase', color: SEV[cc.severity] ?? '#fbbf24' }}>{cc.severity}</span>
                  {' · '}{cc.name}{cc.note ? ' — ' + cc.note : ''}
                </div>
              ))}
            </div>
          )}

          {ex.description && <p style={{ fontSize: 14, lineHeight: 1.6, color: '#cdd6f4', margin: 0 }}>{ex.description}</p>}

          {(primaries.length > 0 || secondaries.length > 0) && (
            <div>
              {sectionLabel(t('health.browse.muscles'))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {primaries.map(m => <span key={m.slug} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: accent + '26', color: accent }}>{m.name}</span>)}
                {secondaries.map(m => <span key={m.slug} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: '#9b8caa' }}>{m.name}</span>)}
              </div>
            </div>
          )}
          {ex.equipment.length > 0 && (
            <div>
              {sectionLabel(t('health.browse.equipment'))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ex.equipment.map(e => <span key={e.slug} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: '#9b8caa', textTransform: 'capitalize' }}>{e.name}</span>)}
              </div>
            </div>
          )}

          {ex.steps.length > 0 && (
            <div>
              {sectionLabel(t('health.browse.howto'))}
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ex.steps.map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, fontSize: 13, lineHeight: 1.6 }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid ' + accent, fontSize: 11, fontWeight: 500, color: accent }}>{i + 1}</span>
                    <span style={{ flex: 1, color: '#cdd6f4' }}>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {(ex.coaching_cues?.length ?? 0) > 0 && (
            <div>
              {sectionLabel(t('health.browse.cues'))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ex.coaching_cues!.map((cue, i) => <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: '#cdd6f4' }}>{cue}</span>)}
              </div>
            </div>
          )}

          {(routine.length > 0 || ex.routine.progression) && (
            <div>
              {sectionLabel(t('health.browse.routine'))}
              {grid(routine)}
              {ex.routine.progression && <p style={{ fontSize: 12, fontStyle: 'italic', color: '#9b8caa', marginTop: 14, marginBottom: 0 }}>{ex.routine.progression}</p>}
            </div>
          )}

          {cardio.length > 0 && (
            <div>
              {sectionLabel(t('health.browse.cardio'))}
              {grid(cardio)}
            </div>
          )}

          {alternatives.length > 0 && (
            <div>
              {sectionLabel(t('health.browse.easier_harder_instead'))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {alternatives.map(a => (
                  <span key={a.slug} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', color: '#9b8caa' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.6 }}>{a.kind}</span> {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {ex.beginner_detail && (
            <div>
              {sectionLabel(t('health.browse.if_youre_new'))}
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4', margin: 0 }}>{ex.beginner_detail}</p>
            </div>
          )}
          {ex.advanced_detail && (
            <div>
              {sectionLabel(t('health.browse.going_further'))}
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4', margin: 0 }}>{ex.advanced_detail}</p>
            </div>
          )}
          {ex.common_mistakes && (
            <div>
              {sectionLabel(t('health.browse.common_mistakes'))}
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4', margin: 0 }}>{ex.common_mistakes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Recipe detail ─────────────────────────────────────────────────────────

function RecipeDetailView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [detail, setDetail] = useState<HealthRecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    loadRecipeDetail(slug)
      .then(d => { if (live) { setDetail(d); setFailed(!d); } })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [slug]);

  return (
    <DetailPageView onBack={onBack} backLabel={t('health.browse.tab.recipes')}>
      {loading
        ? <DetailCentered>{t('health.browse.loading_recipe')}</DetailCentered>
        : failed || !detail
          ? <DetailCentered>{t('health.browse.couldnt_load_recipe')}</DetailCentered>
          : <RecipeDetailBody r={detail} />}
    </DetailPageView>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────

const fieldInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12,
  background: 'rgba(12, 8, 20, 0.5)', color: '#cdd6f4',
  border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', borderRadius: 6, outline: 'none',
  colorScheme: 'dark',
};

// Mon-first for display; the slugs are what the profile stores. Note this is
// NOT the 0–6 Sun-first keying the cooking grid uses — two different fields,
// two different orders, and mixing them silently shifts a training week by a day.
const WEEKDAYS: { slug: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'; labelKey: string }[] = [
  { slug: 'mon', labelKey: 'health.plans.weekday.1' },
  { slug: 'tue', labelKey: 'health.plans.weekday.2' },
  { slug: 'wed', labelKey: 'health.plans.weekday.3' },
  { slug: 'thu', labelKey: 'health.plans.weekday.4' },
  { slug: 'fri', labelKey: 'health.plans.weekday.5' },
  { slug: 'sat', labelKey: 'health.plans.weekday.6' },
  { slug: 'sun', labelKey: 'health.plans.weekday.0' },
];

/**
 * The coarse weekday/weekend pair written into the canonical grid (decision 25,
 * 28 Jul). Two numbers fill twenty-one cells; the grid stays the single truth.
 *
 * Deliberately an explicit action rather than an effect on every keystroke —
 * typing "2" on the way to "20" must not wipe cells somebody set by hand. And
 * it only writes days the pair actually covers: an unset weekend leaves Sat/Sun
 * exactly as they were rather than clearing them, because no answer is not the
 * answer "no limit". Mirrors the extension's fillGridFromMinutes exactly.
 */
type CookGrid = NonNullable<HealthProfile['schedule']['cooking_time']>;
function fillGridFromMinutes(current: CookGrid | undefined, weekday: number | null, weekend: number | null): CookGrid {
  // Round UP to the tier that still honours the stated ceiling: 45 minutes is a
  // ≤60 slot, not a ≤30 one, so the plan is never given LESS time than stated.
  const tier = (mins: number): string => (mins <= 15 ? '15' : mins <= 30 ? '30' : mins <= 60 ? '60' : '60+');
  const by_day: CookGrid['by_day'] = { ...(current?.by_day ?? {}) };
  const apply = (days: number[], mins: number | null) => {
    if (mins == null || !Number.isFinite(mins) || mins <= 0) return;
    const v = tier(mins);
    for (const d of days) by_day[String(d)] = { breakfast: v, lunch: v, dinner: v };
  };
  apply([1, 2, 3, 4, 5], weekday);
  apply([6, 0], weekend);
  return { by_day };
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Profile form — body stats, goals, constraints, schedule. Reads /
 *  writes the local-first health-store with debounced autosave. */
// ── Health-profile option lists — mirror the extension's HealthProfilePage so
// the IDE profile reads identically. `slug` is persisted; labels resolve via
// t() (the keys live in core, shared with the extension). Allergens load from
// the live taxonomy at runtime — the same source the extension uses.
const GOAL_OPTIONS: Array<{ value: NonNullable<HealthProfile['goals']['primary']>; labelKey: string; hintKey: string }> = [
  { value: 'fat_loss',    labelKey: 'health.profile.goal.fat_loss',    hintKey: 'health.profile.goal.fat_loss.hint' },
  { value: 'muscle_gain', labelKey: 'health.profile.goal.muscle_gain', hintKey: 'health.profile.goal.muscle_gain.hint' },
  { value: 'maintenance', labelKey: 'health.profile.goal.maintenance', hintKey: 'health.profile.goal.maintenance.hint' },
  { value: 'athletic',    labelKey: 'health.profile.goal.athletic',    hintKey: 'health.profile.goal.athletic.hint' },
  { value: 'recovery',    labelKey: 'health.profile.goal.recovery',    hintKey: 'health.profile.goal.recovery.hint' },
  { value: 'longevity',   labelKey: 'health.profile.goal.longevity',   hintKey: 'health.profile.goal.longevity.hint' },
];

const DIETARY_OPTIONS: Array<{ slug: string; labelKey: string }> = [
  { slug: 'vegan', labelKey: 'health.profile.diet.vegan' },
  { slug: 'vegetarian', labelKey: 'health.profile.diet.vegetarian' },
  { slug: 'pescatarian', labelKey: 'health.profile.diet.pescatarian' },
  { slug: 'gluten_free', labelKey: 'health.profile.diet.gluten_free' },
  { slug: 'dairy_free', labelKey: 'health.profile.diet.dairy_free' },
  { slug: 'low_fodmap', labelKey: 'health.profile.diet.low_fodmap' },
  { slug: 'keto', labelKey: 'health.profile.diet.keto' },
  { slug: 'mediterranean', labelKey: 'health.profile.diet.mediterranean' },
  { slug: 'halal', labelKey: 'health.profile.diet.halal' },
  { slug: 'kosher', labelKey: 'health.profile.diet.kosher' },
];

const EQUIPMENT_OPTIONS: Array<{ slug: string; labelKey: string }> = [
  { slug: 'bodyweight', labelKey: 'health.profile.equip.bodyweight' },
  { slug: 'dumbbells', labelKey: 'health.profile.equip.dumbbells' },
  { slug: 'barbell', labelKey: 'health.profile.equip.barbell' },
  { slug: 'kettlebell', labelKey: 'health.profile.equip.kettlebell' },
  { slug: 'pull_up_bar', labelKey: 'health.profile.equip.pull_up_bar' },
  { slug: 'bench', labelKey: 'health.profile.equip.bench' },
  { slug: 'squat_rack', labelKey: 'health.profile.equip.squat_rack' },
  { slug: 'cable_machine', labelKey: 'health.profile.equip.cable_machine' },
  { slug: 'rowing_machine', labelKey: 'health.profile.equip.rowing_machine' },
  { slug: 'treadmill', labelKey: 'health.profile.equip.treadmill' },
  { slug: 'exercise_bike', labelKey: 'health.profile.equip.exercise_bike' },
  { slug: 'mat', labelKey: 'health.profile.equip.mat' },
  { slug: 'resistance_bands', labelKey: 'health.profile.equip.resistance_bands' },
  { slug: 'foam_roller', labelKey: 'health.profile.equip.foam_roller' },
];

// Global cuisines — single-word slugs humanise to a clean chip label (no i18n
// key needed), matching the catalogue's worldwide recipe set.
const CUISINE_OPTIONS: Array<{ slug: string; label: string }> = [
  'italian', 'french', 'spanish', 'greek', 'mediterranean', 'indian', 'thai',
  'vietnamese', 'chinese', 'japanese', 'korean', 'mexican', 'american',
  'caribbean', 'moroccan', 'lebanese', 'turkish', 'british', 'brazilian', 'ethiopian',
].map(slug => ({ slug, label: slug.charAt(0).toUpperCase() + slug.slice(1) }));

/** Pill chips — the IDE mirror of the extension's PickerChips. */
function Chips({ selected, options, onToggle, emptyHint }: {
  selected: string[];
  options: Array<{ slug: string; label: string }>;
  onToggle: (slug: string) => void;
  emptyHint?: string;
}) {
  if (options.length === 0) {
    return <div style={{ fontSize: 10, fontStyle: 'italic', color: '#9b8caa' }}>{emptyHint ?? ''}</div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const active = selected.includes(o.slug);
        return (
          <button key={o.slug} type="button" onClick={() => onToggle(o.slug)} style={{
            borderRadius: 999, padding: '4px 10px', fontSize: 10, cursor: 'pointer', transition: 'all 0.15s',
            border: `1px solid ${active ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 20%, transparent)'}`,
            background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
            color: active ? '#c084fc' : '#9b8caa',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

export function ProfileTab() {
  useLocale();
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [allergenOpts, setAllergenOpts] = useState<Array<{ slug: string; label: string }>>([]);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    loadHealthProfile().then(p => { if (live) { setProfile(p); setLoading(false); } });
    // Allergen chips come from the live taxonomy — same source the extension uses.
    loadTaxonomies()
      .then(tax => { if (live) setAllergenOpts((tax.allergens ?? []).map(a => ({ slug: a.slug, label: a.name }))); })
      .catch(() => { /* offline / BYOK — chips show the loading hint */ });
    return () => {
      live = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Debounced autosave — 600ms after the last edit.
  const update = useCallback((next: HealthProfile) => {
    setProfile(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveHealthProfile(next).catch(() => { /* non-fatal — retried on next edit */ });
    }, 600);
  }, []);

  if (loading || !profile) return <CenterNote>{t('health.profile.loading')}</CenterNote>;
  const p = profile;
  const c = p.constraints;
  const f = p.food ?? { likes: [], dislikes: [], cuisines: [] };
  // Training and kitchen are optional on the type — core, the IDE and every
  // legacy profile.json predate them. Read through a full default rather than
  // `?? {}`: a profile Ava filled in has PARTIAL sections (the fill card writes
  // one leaf and creates its parent as `{}`), so a `?? {}` fallback never fires
  // and every sibling field reads undefined. Spread the defaults under it.
  const tr = { experience: null, days_per_week: null, training_days: [], baseline_lifts: [], ...(p.training ?? {}) } as NonNullable<HealthProfile['training']>;
  const kt = { level: null, minutes_weekday: null, minutes_weekend: null, household_size: null, cost_tier: null, ...(p.kitchen ?? {}) } as NonNullable<HealthProfile['kitchen']>;
  const patchTraining = (next: Partial<NonNullable<HealthProfile['training']>>) =>
    update({ ...p, training: { ...tr, ...next } });
  const patchKitchen = (next: Partial<NonNullable<HealthProfile['kitchen']>>) =>
    update({ ...p, kitchen: { ...kt, ...next } });
  const toggle = (list: string[], slug: string) => (list.includes(slug) ? list.filter(s => s !== slug) : [...list, slug]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: '#e9e2f4', margin: 0 }}>{t('health.profile.your_profile')}</h2>
        <p style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6, color: '#9b8caa', maxWidth: '70ch' }}>{t('health.profile.intro_blurb')}</p>
      </div>

      {/* Never — the hard rules (Health Part 2, mockup approved 14 Nov 2026),
          kept apart from preferences so people can see which are guarantees. */}
      <RuleSection kind="never" title={tt('health.profile.never.title', 'Never')}
        body={tt('health.profile.never.body', 'Ava keeps to these everywhere: plans she builds, the wizard, the library, For you. Anything that breaks one is never offered. Checked on this computer.')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Field label={tt('health.profile.never.allergies', 'Allergies')} hint={tt('health.profile.never.allergies_hint', 'Fish, sesame, mustard and a few others can only be checked from the ingredients. Ava will say so when that is all there is.')}>
          <Chips selected={c.allergens} options={allergenOpts}
            onToggle={slug => update({ ...p, constraints: { ...c, allergens: toggle(c.allergens, slug) } })}
            emptyHint={t('health.profile.allergens_loading')} />
        </Field>
        <Field label={tt('health.profile.never.diet', 'Diet')}>
          <Chips selected={c.dietary} options={DIETARY_OPTIONS.map(o => ({ slug: o.slug, label: t(o.labelKey) }))}
            onToggle={slug => update({ ...p, constraints: { ...c, dietary: toggle(c.dietary, slug) } })} />
          <button type="button" onClick={() => { void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl('https://avasupernova.com/guides/diets-explained')).catch(() => {}); }}
            style={{ marginTop: 8, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--accent)' }}>
            {tt('health.profile.never.diet_link', 'What do these mean?')}
          </button>
        </Field>
        <Field label={t('health.profile.injuries')} hint={tt('health.profile.never.injuries_hint', 'Exercises to avoid are left out. Ones to take care with stay, marked, with an easier version.')}>
          <textarea rows={2} value={c.injuries.join('\n')}
            placeholder={t('health.profile.injuries_placeholder')}
            onChange={e => update({ ...p, constraints: { ...c, injuries: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })}
            style={{ ...fieldInputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }} />
        </Field>
        <Field label={tt('health.profile.never.kit', 'Kit you have')} hint={tt('health.profile.never.kit_hint', 'Bodyweight is always included. Leave this empty and nothing is filtered by kit.')}>
          <Chips selected={c.equipment_available} options={EQUIPMENT_OPTIONS.map(o => ({ slug: o.slug, label: t(o.labelKey) }))}
            onToggle={slug => update({ ...p, constraints: { ...c, equipment_available: toggle(c.equipment_available, slug) } })} />
        </Field>
        </div>
      </RuleSection>

      {/* Prefer — steers, never hides. */}
      <RuleSection kind="prefer" title={tt('health.profile.prefer.title', 'Prefer')}
        body={tt('health.profile.prefer.body', 'Ava leans this way: what you like comes first, what you dislike comes last. Nothing is hidden for these.')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <Field label={tt('health.profile.prefer.likes', 'Foods you like')}>
          <textarea rows={2} value={f.likes.join('\n')}
            placeholder={t('health.profile.likes_placeholder')}
            onChange={e => update({ ...p, food: { ...f, likes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })}
            style={{ ...fieldInputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }} />
        </Field>
        <Field label={tt('health.profile.prefer.dislikes', 'Foods you\'d rather not')}>
          <textarea rows={2} value={f.dislikes.join('\n')}
            placeholder={t('health.profile.dislikes_placeholder')}
            onChange={e => update({ ...p, food: { ...f, dislikes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })}
            style={{ ...fieldInputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }} />
        </Field>
        <Field label={tt('health.profile.prefer.cuisines', 'Favourite cuisines')}>
          <Chips selected={f.cuisines} options={CUISINE_OPTIONS}
            onToggle={slug => update({ ...p, food: { ...f, cuisines: toggle(f.cuisines, slug) } })} />
        </Field>
        </div>
      </RuleSection>

      {/* About you — how Ava shapes a plan. */}
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#cdd6f4' }}>{tt('health.profile.about.title', 'About you')}</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6c7086' }}>{tt('health.profile.about.body', 'How Ava shapes a plan around you.')}</p>
      </div>

      {/* Goals — selectable cards, like the extension. */}
      <ProfileSection title={t('health.profile.goals')} subtitle={t('health.profile.goals_subtitle')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {GOAL_OPTIONS.map(g => {
            const active = p.goals.primary === g.value;
            return (
              <button key={g.value} type="button"
                onClick={() => update({ ...p, goals: { ...p.goals, primary: active ? null : g.value } })}
                style={{
                  textAlign: 'left', borderRadius: 10, padding: 12, cursor: 'pointer', transition: 'all 0.15s',
                  border: `1px solid ${active ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 18%, transparent)'}`,
                  background: active ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: active ? '#c084fc' : '#e9e2f4' }}>{t(g.labelKey)}</div>
                <div style={{ fontSize: 10, color: '#9b8caa', marginTop: 4, lineHeight: 1.5 }}>{t(g.hintKey)}</div>
              </button>
            );
          })}
        </div>
        <Field label={t('health.profile.weekly_focus')}>
          <input type="text" value={p.goals.weekly_focus ?? ''} maxLength={120}
            placeholder={t('health.profile.weekly_focus_placeholder')}
            onChange={e => update({ ...p, goals: { ...p.goals, weekly_focus: e.target.value || null } })}
            style={fieldInputStyle} />
        </Field>
      </ProfileSection>

      {/* Training — how often, and WHICH days. The training window said when in
          the day; nothing said Mon/Wed/Fri, and you cannot shape a week without
          it. Both fields already reach generation; only the editor was missing. */}
      <ProfileSection title={t('health.profile.training')} subtitle={t('health.profile.training_subtitle')}>
        <FieldRow>
          <Field label={t('health.profile.experience')}>
            <select value={tr.experience ?? ''} style={fieldInputStyle}
              onChange={e => patchTraining({ experience: (e.target.value || null) as NonNullable<HealthProfile['training']>['experience'] })}>
              <option value="">{t('health.profile.unset')}</option>
              <option value="beginner">{t('health.profile.level.beginner')}</option>
              <option value="intermediate">{t('health.profile.level.intermediate')}</option>
              <option value="advanced">{t('health.profile.level.advanced')}</option>
            </select>
          </Field>
          <Field label={t('health.profile.days_per_week')}>
            <select value={tr.days_per_week != null ? String(tr.days_per_week) : ''} style={fieldInputStyle}
              onChange={e => patchTraining({ days_per_week: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t('health.profile.unset')}</option>
              {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={String(n)}>{n}</option>)}
            </select>
          </Field>
        </FieldRow>
        <div style={{ marginTop: 12 }}>
          <Field label={t('health.profile.training_days')}>
            <div style={{ display: 'flex', gap: 6 }}>
              {WEEKDAYS.map(({ slug, labelKey }) => {
                const on = (tr.training_days ?? []).includes(slug);
                return (
                  <button key={slug} type="button"
                    onClick={() => patchTraining({
                      training_days: on ? (tr.training_days ?? []).filter(d => d !== slug) : [...(tr.training_days ?? []), slug],
                    })}
                    style={{
                      flex: 1, padding: '7px 0', fontSize: 11, borderRadius: 8, cursor: 'pointer',
                      background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                      color: on ? 'var(--accent)' : '#9b8caa',
                      border: `1px solid ${on ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 18%, transparent)'}`,
                    }}>
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <Field label={t('health.profile.minutes_per_day')}>
          <input type="number" inputMode="numeric" value={c.minutes_per_day_target ?? ''} placeholder="45"
            onChange={e => update({ ...p, constraints: { ...c, minutes_per_day_target: parseNum(e.target.value) } })}
            style={fieldInputStyle} />
        </Field>
      </ProfileSection>

      {/* Kitchen — household size drives servings and therefore every quantity
          on a shopping list; the two time budgets are a shortcut into the
          cooking grid in Schedule, which is canonical (decision 25). */}
      <ProfileSection title={t('health.profile.kitchen')} subtitle={t('health.profile.kitchen_subtitle')}>
        <FieldRow>
          <Field label={t('health.profile.household')}>
            <select value={kt.household_size != null ? String(kt.household_size) : ''} style={fieldInputStyle}
              onChange={e => patchKitchen({ household_size: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t('health.profile.unset')}</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={String(n)}>{n}</option>)}
            </select>
          </Field>
          <Field label={t('health.profile.cooking_level')}>
            <select value={kt.level ?? ''} style={fieldInputStyle}
              onChange={e => patchKitchen({ level: (e.target.value || null) as NonNullable<HealthProfile['kitchen']>['level'] })}>
              <option value="">{t('health.profile.unset')}</option>
              <option value="beginner">{t('health.profile.level.beginner')}</option>
              <option value="intermediate">{t('health.profile.level.intermediate')}</option>
              <option value="expert">{t('health.profile.level.expert')}</option>
            </select>
          </Field>
          <Field label={t('health.profile.minutes_weekday')}>
            <input type="number" inputMode="numeric" value={kt.minutes_weekday ?? ''} placeholder="20"
              onChange={e => patchKitchen({ minutes_weekday: parseNum(e.target.value) })} style={fieldInputStyle} />
          </Field>
          <Field label={t('health.profile.minutes_weekend')}>
            <input type="number" inputMode="numeric" value={kt.minutes_weekend ?? ''} placeholder="60"
              onChange={e => patchKitchen({ minutes_weekend: parseNum(e.target.value) })} style={fieldInputStyle} />
          </Field>
        </FieldRow>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <p style={{ flex: 1, margin: 0, fontSize: 11, lineHeight: 1.6, color: '#6c7086' }}>{t('health.profile.minutes_fill_hint')}</p>
          <button type="button"
            disabled={kt.minutes_weekday == null && kt.minutes_weekend == null}
            onClick={() => update({
              ...p,
              schedule: { ...p.schedule, cooking_time: fillGridFromMinutes(p.schedule.cooking_time, kt.minutes_weekday, kt.minutes_weekend) },
            })}
            style={{
              flexShrink: 0, padding: '6px 12px', fontSize: 11, fontWeight: 500, borderRadius: 6,
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
              cursor: kt.minutes_weekday == null && kt.minutes_weekend == null ? 'default' : 'pointer',
              opacity: kt.minutes_weekday == null && kt.minutes_weekend == null ? 0.4 : 1,
            }}>
            {t('health.profile.minutes_fill_action')}
          </button>
        </div>
      </ProfileSection>

      {/* Schedule — time pickers in a 3-column grid. */}
      <ProfileSection title={t('health.profile.schedule')} subtitle={t('health.profile.schedule_subtitle')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <Field label={t('health.profile.training_start')}>
            <TimeField value={p.schedule.training_window.start}
              onChange={v => update({ ...p, schedule: { ...p.schedule, training_window: { ...p.schedule.training_window, start: v } } })} />
          </Field>
          <Field label={t('health.profile.training_end')}>
            <TimeField value={p.schedule.training_window.end}
              onChange={v => update({ ...p, schedule: { ...p.schedule, training_window: { ...p.schedule.training_window, end: v } } })} />
          </Field>
          <Field label={t('health.profile.breakfast')}>
            <TimeField value={p.schedule.meal_times.breakfast}
              onChange={v => update({ ...p, schedule: { ...p.schedule, meal_times: { ...p.schedule.meal_times, breakfast: v } } })} />
          </Field>
          <Field label={t('health.profile.lunch')}>
            <TimeField value={p.schedule.meal_times.lunch}
              onChange={v => update({ ...p, schedule: { ...p.schedule, meal_times: { ...p.schedule.meal_times, lunch: v } } })} />
          </Field>
          <Field label={t('health.profile.dinner')}>
            <TimeField value={p.schedule.meal_times.dinner}
              onChange={v => update({ ...p, schedule: { ...p.schedule, meal_times: { ...p.schedule.meal_times, dinner: v } } })} />
          </Field>
          <Field label={t('health.profile.bedtime')}>
            <TimeField value={p.schedule.sleep_target.bedtime}
              onChange={v => update({ ...p, schedule: { ...p.schedule, sleep_target: { ...p.schedule.sleep_target, bedtime: v } } })} />
          </Field>
          <Field label={t('health.profile.wake')}>
            <TimeField value={p.schedule.sleep_target.wake}
              onChange={v => update({ ...p, schedule: { ...p.schedule, sleep_target: { ...p.schedule.sleep_target, wake: v } } })} />
          </Field>
        </div>
        <CookingTimeField value={p.schedule.cooking_time} onChange={v => update({ ...p, schedule: { ...p.schedule, cooking_time: v } })} />
      </ProfileSection>
    </div>
  );
}

// ── Cooking-time field — how long the user has to cook, set per day AND per
// meal type (Breakfast/Lunch/Dinner), each defaulting to "Any". A 7-day grid:
// rows = days, columns = meals. This per-slot granularity is the data Ava needs
// to slot the right recipe into each real meal — a quick weekday breakfast, a
// longer weekend dinner — instead of one blunt time for the whole day.
function CookingTimeField({ value, onChange }: { value: CookTime | undefined; onChange: (v: CookTime) => void }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('health.profile.cooking_time')}</div>
      <p style={{ fontSize: 11, color: '#6c7086', marginTop: 4 }}>{t('health.profile.cooking_time_hint')}</p>
      <div style={{ marginTop: 12 }}>
        <CookingTimeGrid value={value} onChange={onChange} />
      </div>
    </div>
  );
}

/** General profile editor — identity + body basics, stored at account level
 *  (general.json). The General sub-tab of "{name}'s profile" in Account. */
export function GeneralProfilePage() {
  const [profile, setProfile] = useState<GeneralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedTick, setSavedTick] = useState(0);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    loadGeneralProfile().then(p => { if (live) { setProfile(p); setLoading(false); } });
    return () => { live = false; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  const update = useCallback((next: GeneralProfile) => {
    setProfile(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveGeneralProfile(next).then(() => setSavedTick(s => s + 1)).catch(() => { /* retried next edit */ });
    }, 600);
  }, []);

  if (loading || !profile) return <CenterNote>{t('health.profile.loading')}</CenterNote>;
  const p = profile;
  const accountName = (() => { try { return localStorage.getItem('ava-ide-user-name') || ''; } catch { return ''; } })();

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p style={{ fontSize: 12, color: '#9b8caa', margin: 0 }}>
        {t('general.profile.intro')}
        {savedTick > 0 && <span style={{ color: '#34d399', marginLeft: 8 }}>{t('health.profile.saved')}</span>}
      </p>

      {/* Your picture. It sat on the Personality page -- Ava's style -- until
          2026-08-10, in a section headed "Avatars" that was meant to hold hers
          too. Hers is brand-locked, so the only editable thing in there was
          yours, filed under her. The storage key had been saying so all along:
          `ava-ide-user-avatar`. */}
      <ProfileSection title={t('dash.settings.avatar')}>
        <UserAvatarPanel fallbackName={profile?.display_name ?? null} />
      </ProfileSection>

      <ProfileSection title={t('general.profile.identity')}>
        <Field label={t('general.profile.display_name')}>
          <input type="text" value={p.display_name ?? ''} placeholder={accountName || t('general.profile.display_name_placeholder')} maxLength={60}
            onChange={e => update({ ...p, display_name: e.target.value || null })} style={fieldInputStyle} />
        </Field>
        <FieldRow>
          <Field label={t('health.profile.sex')}>
            <select value={p.sex ?? ''} onChange={e => update({ ...p, sex: (e.target.value || null) as GeneralProfile['sex'] })} style={fieldInputStyle}>
              <option value="">—</option>
              <option value="female">{t('health.profile.sex.female')}</option>
              <option value="male">{t('health.profile.sex.male')}</option>
              <option value="other">{t('health.profile.sex.other_short')}</option>
            </select>
          </Field>
          <Field label={t('health.profile.date_of_birth')}>
            <DateField value={p.date_of_birth ?? null} onChange={v => update({ ...p, date_of_birth: v })} style={fieldInputStyle} />
          </Field>
        </FieldRow>
      </ProfileSection>

      <ProfileSection title={t('general.profile.body')}>
        <FieldRow>
          <Field label={t('health.profile.height_cm')}>
            <input type="number" inputMode="numeric" value={p.height_cm ?? ''} onChange={e => update({ ...p, height_cm: parseNum(e.target.value) })} style={fieldInputStyle} />
          </Field>
          <Field label={t('health.profile.weight_kg')}>
            <input type="number" inputMode="numeric" value={p.weight_kg ?? ''} onChange={e => update({ ...p, weight_kg: parseNum(e.target.value) })} style={fieldInputStyle} />
          </Field>
          <Field label={t('health.profile.body_fat_pct')}>
            <input type="number" inputMode="numeric" value={p.body_fat_pct ?? ''} onChange={e => update({ ...p, body_fat_pct: parseNum(e.target.value) })} style={fieldInputStyle} />
          </Field>
        </FieldRow>
      </ProfileSection>
    </div>
  );
}

function ProfileSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  // Mirrors the extension's Section: sentence-case medium title + muted
  // subtitle, content below.
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#e9e2f4' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#9b8caa', marginTop: 2, lineHeight: 1.5 }}>{subtitle}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>{children}</div>
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  // Responsive grid that fills the full-width tab without stretching fields.
  // auto-FILL (not auto-fit) keeps empty tracks, so a 2-field row stays compact
  // (~180px each) instead of each field ballooning to half the window. Mirrors
  // the extension's FieldGrid density across the wide IDE tab.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      {children}
    </div>
  );
}

// A <div>, NOT a <label>: a label forwards clicks anywhere in its box to the
// first control inside, which for the custom TimeField/chip buttons popped the
// wrong thing open. The label is uppercase + tracked to match the extension.
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9b8caa', marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <p style={{ margin: '4px 0 0', fontSize: 10, lineHeight: 1.5, color: '#9b8caa' }}>{hint}</p>}
    </div>
  );
}

/** Never (green, a shield) and Prefer (blue, a heart) — mirrors the extension. */
function RuleSection({ kind, title, body, children }: { kind: 'never' | 'prefer'; title: string; body: string; children: React.ReactNode }) {
  const never = kind === 'never';
  return (
    <section style={{ borderRadius: 12, padding: 20, border: `1px solid ${never ? '#5f8f5a' : '#5a5f8f'}`, background: never ? 'rgba(166,227,161,0.06)' : 'rgba(137,180,250,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        {never ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a6e3a1" strokeWidth="2" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#89b4fa" strokeWidth="2" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#cdd6f4' }}>{title}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 11, lineHeight: 1.5, color: '#a6adc8' }}>{body}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Tab bar for the detail overlays — separates the sections that used to
 *  stack in one long scroll. Underline-style, matching the page's chrome. */

type NutritionDisplayKey = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g' | 'sugar_g' | 'sodium_mg' | 'saturated_fat_g';
const NUTRITION_DISPLAY: Array<[NutritionDisplayKey, string]> = [
  ['calories', 'Calories (kcal)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)'],
  ['fibre_g', 'Fibre (g)'], ['sugar_g', 'Sugar (g)'], ['sodium_mg', 'Sodium (mg)'], ['saturated_fat_g', 'Saturated fat (g)'],
];

/** Per-serving nutrition as a table — one row per skill level. Columns with no
 *  data on any level are dropped. */

export function RecipeDetailBody({ r }: { r: HealthRecipeDetail }) {
  // Single-scroll, matching the hub's redesigned recipe view. Skill-level tabs
  // drive everything below; the shopping list splits into shared plus "just for
  // this level". No operator diagnostics.
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'expert'>('beginner');
  const v = r.versions.find(vv => vv.level === level) || r.versions[0];
  const st = r.storage;
  const nut = v?.nutrition ?? null;
  // Sauces, marinades and condiments go INTO something — no "serves", and
  // their figures are per 100 g / per tablespoon. One without that basis
  // still carries an old per-serving guess, so it is not shown.
  const isTopping = r.course === 'sauce' || r.course === 'condiment';
  const showNut = !!nut && (!isTopping || !!nut.per);
  const nutPer = nut?.per === '100g' ? t('health.browse.per_100g_est') : nut?.per === 'tbsp' ? t('health.browse.per_tbsp_est') : t('health.browse.per_serving_est');
  const cuisineLine = (r.cuisines && r.cuisines.length ? r.cuisines.join(' · ') : r.cuisine_name) || '';
  const shared = r.ingredients.filter(ing => !ing.level);
  const own = r.ingredients.filter(ing => ing.level && ing.level === level);
  const qty = (ing: HealthRecipeDetail['ingredients'][number]) =>
    ing.quantity != null ? String(ing.quantity) + (ing.unit ? ' ' + ing.unit : '') : (ing.unit ?? '');
  const levels = (['beginner', 'intermediate', 'expert'] as const).filter(l => r.versions.some(vv => vv.level === l));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {r.hero_image_url && (
        <div style={{ flexShrink: 0, height: 184, overflow: 'hidden', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}>
          <img src={r.hero_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            {cuisineLine && <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2.5, color: '#fbbf24', marginBottom: 6 }}>{cuisineLine}</div>}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <h2 style={{ fontSize: 21, fontWeight: 300, color: '#cdd6f4', margin: 0 }}>{r.name}</h2>
              {/* Cooked it? The rating is public; anything typed is private. */}
              <ContentRating subjectType="recipe" subjectId={r.id} average={r.average_rating} count={r.rating_count} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {r.course && <span style={{ fontSize: 11, textTransform: 'capitalize', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '2px 8px', borderRadius: 6, color: '#9b8caa' }}>{courseLabel(r.course)}</span>}
              {r.origin_country && <span style={{ fontSize: 11, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '2px 8px', borderRadius: 6, color: '#9b8caa' }}>{r.origin_country}</span>}
            </div>
          </div>

          {r.overview && <p style={{ fontSize: 14, lineHeight: 1.6, color: '#cdd6f4', margin: 0 }}>{r.overview}</p>}

          {levels.length > 1 && (
            <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)' }}>
              {levels.map(l => (
                <button key={l} type="button" onClick={() => setLevel(l)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '8px 14px',
                    color: l === level ? '#fbbf24' : '#9b8caa',
                    borderBottom: l === level ? '2px solid #fbbf24' : '2px solid transparent', marginBottom: -1 }}>
                  {t('health.browse.level.' + l)}
                </button>
              ))}
            </div>
          )}

          {v && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 12, color: '#9b8caa' }}>
              {v.prep_time_minutes != null && <span>{t('health.browse.prep')} <strong style={{ color: '#cdd6f4' }}>{v.prep_time_minutes}m</strong></span>}
              {v.cook_time_minutes != null && <span>{t('health.browse.cook')} <strong style={{ color: '#cdd6f4' }}>{v.cook_time_minutes}m</strong></span>}
              {v.total_time_minutes != null && <span>{t('health.browse.total')} <strong style={{ color: '#cdd6f4' }}>{v.total_time_minutes}m</strong></span>}
              {v.default_servings != null && !isTopping && <span>{t('health.browse.serves')} <strong style={{ color: '#cdd6f4' }}>{v.default_servings}</strong></span>}
              {st?.keeps_fridge_days != null && <span>{t('health.storage.fridge')} <strong style={{ color: '#cdd6f4' }}>{st.keeps_fridge_days}d</strong></span>}
              {st?.keeps_freezer_months != null && <span>{t('health.storage.freezer')} <strong style={{ color: '#cdd6f4' }}>{st.keeps_freezer_months}mo</strong></span>}
            </div>
          )}

          {v?.description && <p style={{ fontSize: 12, fontStyle: 'italic', lineHeight: 1.6, color: '#9b8caa', margin: 0 }}>{v.description}</p>}

          {r.ingredients.length > 0 && (
            <div>
              {sectionLabel(t('health.browse.ingredients'))}
              <div style={{ fontSize: 13, lineHeight: 1.9, color: '#cdd6f4' }}>
                {shared.map((ing, i) => (
                  <div key={'s' + i}>{qty(ing) && <span style={{ color: '#6c7086' }}>{qty(ing)} </span>}{ing.name}{ing.optional && <span style={{ color: '#6c7086' }}> {t('health.browse.opt')}</span>}</div>
                ))}
                {own.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086', marginTop: 10, marginBottom: 2 }}>{t('health.browse.just_for_level')} {t('health.browse.level.' + level)}</div>
                    {own.map((ing, i) => (
                      <div key={'o' + i}>{qty(ing) && <span style={{ color: '#6c7086' }}>{qty(ing)} </span>}{ing.name}{ing.optional && <span style={{ color: '#6c7086' }}> {t('health.browse.opt')}</span>}</div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {v?.equipment && v.equipment.length > 0 && (
            <div>
              {sectionLabel(t('health.browse.equipment'))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {v.equipment.map((e, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: '#9b8caa' }}>{e.name}{e.optional ? ' ' + t('health.browse.optional') : ''}</span>
                ))}
              </div>
            </div>
          )}

          {((v?.diets && v.diets.length > 0) || (v?.dietary_flags && v.dietary_flags.length > 0)) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {v?.diets?.map(d => <span key={'d' + d} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, padding: '3px 10px', borderRadius: 9999, border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', color: '#c084fc' }}>{d}</span>)}
              {v?.dietary_flags?.map(f => <span key={'f' + f} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, padding: '3px 10px', borderRadius: 9999, border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>{f}</span>)}
            </div>
          )}

          {v && v.steps.length > 0 && (
            <div>
              {sectionLabel(t('health.browse.method'))}
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {v.steps.map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid #fbbf24', fontSize: 11, fontWeight: 500, color: '#fbbf24' }}>{i + 1}</span>
                    <div style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>
                      <span style={{ color: '#cdd6f4' }}>{s.action}</span>
                      {s.tricky_flag && <span style={{ marginLeft: 8, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', padding: '1px 6px', borderRadius: 3 }}>{t('health.browse.tricky')}</span>}
                      {s.technique_term && <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(251,191,36,0.8)', marginTop: 3 }}>{s.technique_term}</div>}
                      {s.notes && <div style={{ fontSize: 12, fontStyle: 'italic', color: '#9b8caa', marginTop: 3 }}>{s.notes}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {showNut && nut && Object.keys(nut).length > 0 && (
            <div>
              {sectionLabel(t('health.browse.nutrition') + ' · ' + nutPer)}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12, color: '#9b8caa' }}>
                {NUTRITION_DISPLAY.map(([k, label]) => typeof nut[k] === 'number' && (
                  <span key={k}>{label} <strong style={{ color: '#cdd6f4' }}>{nut[k]}</strong></span>
                ))}
              </div>
            </div>
          )}

          {st?.from_frozen_notes && (
            <div>
              {sectionLabel(t('health.storage.cooking_frozen'))}
              <p style={{ fontSize: 13, lineHeight: 1.6, color: '#cdd6f4', margin: 0 }}>{st.from_frozen_notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
