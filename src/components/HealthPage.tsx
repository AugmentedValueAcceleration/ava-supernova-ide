import { useState, useEffect, useCallback, useRef } from 'react';
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
  type HealthRecipeSkillLevel,
  type HealthExerciseType,
  type HealthWorkoutType,
  loadMySubmissions,
  clearRejectedSubmissions,
  type HealthMySubmissions,
  type HealthSubmissionStatus,
  loadTaxonomies,
  submitExercise,
  submitRecipe,
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
import { t, useLocale } from '../lib/i18n';

/**
 * Health & Nutrition page for the IDE — the public exercise + recipe
 * library. Self-contained (the IDE renders pages as prop-less
 * components); data comes through the health-catalog fetch layer.
 *
 * Step 2b: page shell + Exercises / Recipes grids. The My-submissions
 * and Profile tabs are placeholders until 2d / 2e; click-to-open
 * detail modals land in 2c.
 */

type HealthTab = 'exercises' | 'recipes' | 'ava';

// Set when something elsewhere (the main-chat → Health room handoff) wants the
// page to open on the Ava room tab. Read on mount; the live event covers the
// already-mounted case.
let pendingHealthRoomOpen = false;
export function requestHealthRoomTab(): void { pendingHealthRoomOpen = true; }

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
  const [tab, setTab] = useState<HealthTab>(pendingHealthRoomOpen ? 'ava' : 'exercises');

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
    borderBottom: active ? '2px solid #a855f7' : '2px solid transparent',
    marginBottom: -1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '20px 32px 0', flexShrink: 0,
        borderBottom: '1px solid rgba(168, 85, 247, 0.12)',
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
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setTab('exercises')} style={tabBtnStyle(tab === 'exercises')}>{t('health.browse.tab.exercises')}</button>
          <button onClick={() => setTab('recipes')} style={tabBtnStyle(tab === 'recipes')}>{t('health.browse.tab.recipes')}</button>
          <button onClick={() => setTab('ava')} style={tabBtnStyle(tab === 'ava')}>{t('health.browse.tab.ava')}</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Non-Ava tabs — padded scroll area. */}
        <div style={{ height: '100%', overflowY: 'auto', padding: '20px 32px', display: tab === 'ava' ? 'none' : 'block' }}>
          {tab === 'exercises' && <ExercisesGrid />}
          {tab === 'recipes' && <RecipesGrid />}
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

function ExercisesGrid() {
  const [items, setItems] = useState<HealthExerciseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<'all' | HealthWorkoutType>('all');
  const [view, setView] = useBrowseView();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [modalSlug, setModalSlug] = useState<string | null>(null);

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

      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <CenterNote>{t('health.browse.loading_exercises')}</CenterNote>
        ) : failed ? (
          <LoadError noun={t('health.browse.noun.exercises')} onRetry={() => void fetchPage(0)} />
        ) : items.length === 0 ? (
          <CenterNote>{search ? t('health.browse.no_exercises_match_q', { q: search }) : t('health.browse.no_exercises_found')}</CenterNote>
        ) : (
          <CardGrid view={view}>
            {items.map(ex => (
              <ExerciseCardItem key={ex.id} ex={ex} view={view} onOpen={setModalSlug} />
            ))}
          </CardGrid>
        )}
      </div>
      {items.length > 0 && <Pagination total={total} offset={offset} loading={loading} onPage={fetchPage} />}
    </div>
  );
}

// ── Recipes grid ──────────────────────────────────────────────────────────

function RecipesGrid() {
  const [items, setItems] = useState<HealthRecipeSummary[]>([]);
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
  const [modalSlug, setModalSlug] = useState<string | null>(null);

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

      {/* Results fill the remaining height so pagination is pushed to the foot
          of the page even when only a few cards land. */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <CenterNote>{t('health.browse.loading_recipes')}</CenterNote>
        ) : failed ? (
          <LoadError noun={t('health.browse.noun.recipes')} onRetry={() => void fetchPage(0)} />
        ) : items.length === 0 ? (
          <CenterNote>{search ? t('health.browse.no_recipes_match_q', { q: search }) : t('health.browse.no_recipes_found')}</CenterNote>
        ) : (
          <CardGrid view={view}>
            {items.map((r) => (
              <RecipeCardItem key={r.id} r={r} view={view} onOpen={setModalSlug} />
            ))}
          </CardGrid>
        )}
      </div>
      {items.length > 0 && <Pagination total={total} offset={offset} loading={loading} onPage={fetchPage} />}
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
          border: `1px solid ${active ? '#a855f7' : '#313244'}`,
          background: active ? 'rgba(168,85,247,0.15)' : 'transparent',
          color: active ? '#c084fc' : '#6c7086',
        }}
      >
        {valueLabel ? `${label}: ${valueLabel}` : `${label}${count > 0 ? ` · ${count}` : ''}`}
        <span aria-hidden style={{ fontSize: 8, opacity: 0.7 }}>&#9662;</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, zIndex: 50, marginTop: 6, maxHeight: 288, width: 240, overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(168,85,247,0.2)', background: '#1a1028', padding: 6, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
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
                <span style={{ display: 'flex', width: 14, height: 14, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 8, color: '#fff', border: `1px solid ${on ? '#a855f7' : '#45475a'}`, background: on ? '#a855f7' : 'transparent' }}>{on ? '✓' : ''}</span>
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
  border: '1px solid rgba(168, 85, 247, 0.12)',
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
          border: `1px solid ${active ? 'rgba(168,85,247,0.5)' : 'rgba(168,85,247,0.14)'}`,
          background: active ? 'rgba(168,85,247,0.18)' : 'transparent',
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
        borderColor: hover ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.12)',
        transition: 'border-color 0.12s',
      }}
    >
      {children}
    </div>
  );
}

// ── Browse cards (compact-hero grid + dense list variants) ─────────────────

function ExerciseCardItem({ ex, view, onOpen }: { ex: HealthExerciseSummary; view: View; onOpen: (slug: string) => void }) {
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
        </div>
      </Card>
    );
  }
  return (
    <Card onClick={() => onOpen(ex.slug)}>
      <div style={{ position: 'relative', aspectRatio: '3 / 2', overflow: 'hidden', background: `linear-gradient(135deg, ${accent}33, ${accent}11)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {img}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: accent }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%', background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.3) 50%, transparent)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.6, color: accent, marginBottom: 2 }}>{workoutLabel(ex.workout_type)}</div>
          <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.25 }}>{ex.name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px' }}>
        <Dots value={ex.difficulty} accent={accent} />
        <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'capitalize' }}>{exerciseTypeLabel(ex.exercise_type)}</span>
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
      <div style={{ position: 'absolute', left: 6, top: 6, zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, background: '#a855f7', color: '#fff', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <span aria-hidden>✦</span>{label}
      </div>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 999, background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontSize: 9, fontWeight: 500 }}>
      <span aria-hidden>✦</span>{label}
    </span>
  );
}

function RecipeCardItem({ r, view, onOpen }: { r: HealthRecipeSummary; view: View; onOpen: (slug: string) => void }) {
  const footer = r.course || r.origin_country || r.cuisine_name || '';
  const img = r.hero_image_url
    ? <img src={r.hero_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <span style={{ fontSize: 22, opacity: 0.3 }}>🍽</span>;

  if (view === 'list') {
    return (
      <Card onClick={() => onOpen(r.slug)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}>
          <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: 'rgba(168,85,247,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{img}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {r.cuisine_name && <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.4, color: '#fbbf24' }}>{r.cuisine_name}</div>}
            <div style={{ fontSize: 13, color: '#cdd6f4', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 }}>
              {r.course && <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'capitalize' }}>{r.course}</span>}
              {r.from_scratch && <FromScratchBadge />}
            </div>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card onClick={() => onOpen(r.slug)}>
      <div style={{ position: 'relative', aspectRatio: '3 / 2', overflow: 'hidden', background: 'rgba(168,85,247,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {img}
        {r.from_scratch && <FromScratchBadge floating />}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '66%', background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.3) 50%, transparent)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8 }}>
          {r.cuisine_name && <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.6, color: '#fbbf24', marginBottom: 2 }}>{r.cuisine_name}</div>}
          <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.25 }}>{r.name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '7px 10px' }}>
        <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{footer}</span>
      </div>
    </Card>
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
          border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.12)', color: '#cba6f7',
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
        border: '1px solid rgba(168, 85, 247, 0.18)', borderRadius: 8, outline: 'none',
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
        background: active ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
        color: active ? '#c084fc' : '#6c7086',
        border: `1px solid ${active ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.12)'}`,
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
          background: n <= value ? accent : 'rgba(168, 85, 247, 0.15)',
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
    border: '1px solid rgba(168, 85, 247, 0.15)',
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

// ── Detail modals ─────────────────────────────────────────────────────────

function ModalShell({ onClose, children, fillHeight }: { onClose: () => void; children: React.ReactNode; fillHeight?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 640,
          background: 'linear-gradient(160deg, #0f0f17, #1a1625)',
          border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: 16,
          // fillHeight: a consistent modal size (so detail overlays don't
          // resize per tab) with the body flexing + scrolling inside. Otherwise
          // the modal grows to fit its content up to 85vh.
          ...(fillHeight
            ? { height: 'min(760px, 86vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
            : { maxHeight: '85vh', overflowY: 'auto' }),
        }}
      >
        <button
          onClick={onClose}
          aria-label={t('health.browse.close')}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1,
            width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
            border: 'none', background: 'rgba(0, 0, 0, 0.4)', color: '#cdd6f4', fontSize: 16, lineHeight: 1,
          }}
        >×</button>
        {children}
      </div>
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
      <div style={{ flex: 'none', borderBottom: '1px solid rgba(168,85,247,0.12)', paddingBottom: 10, marginBottom: 6 }}>
        <button
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 6, border: '1px solid rgba(168,85,247,0.25)', background: 'transparent', color: '#9b8caa', fontSize: 11, fontWeight: 600, padding: '5px 10px' }}
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
  const accent = WORKOUT_ACCENT[ex.workout_type];
  const routine: Array<[string, string]> = [];
  if (ex.routine.sets != null) routine.push([t('health.browse.routine.sets'), String(ex.routine.sets)]);
  if (ex.routine.reps_target) routine.push([t('health.browse.routine.reps'), ex.routine.reps_target]);
  if (ex.routine.rest_seconds != null) routine.push([t('health.browse.routine.rest'), `${ex.routine.rest_seconds}s`]);
  if (ex.routine.tempo) routine.push([t('health.browse.routine.tempo'), ex.routine.tempo]);
  if (ex.routine.frequency_per_week) routine.push([t('health.browse.routine.freq'), ex.routine.frequency_per_week]);
  const primaries = ex.muscles.filter(m => m.role === 'primary');
  const secondaries = ex.muscles.filter(m => m.role === 'secondary');

  type ExTab = 'overview' | 'howto';
  const hasRoutine = routine.length > 0 || !!ex.routine.progression;
  const hasMuscles = primaries.length > 0 || secondaries.length > 0 || ex.equipment.length > 0;
  // Routine + Muscles & kit now live inside Overview (less tab clutter).
  const tabs: { key: ExTab; label: string }[] = [
    { key: 'overview', label: t('health.browse.overview') },
    ...(ex.steps.length > 0 ? [{ key: 'howto' as ExTab, label: t('health.browse.howto') }] : []),
  ];
  const [tab, setTab] = useState<ExTab>('overview');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Hero image — leads the overlay, like the recipe detail. */}
      {ex.thumbnail_url && (
        <div style={{ flexShrink: 0, height: 184, overflow: 'hidden', background: 'rgba(168,85,247,0.06)' }}>
          <img src={ex.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <div style={{ flexShrink: 0, padding: '24px 28px 0' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2.5, color: accent, marginBottom: 6 }}>
            {workoutLabel(ex.workout_type)}
          </div>
          <h2 style={{ fontSize: 21, fontWeight: 300, color: '#cdd6f4', margin: 0 }}>{ex.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 11, color: '#9b8caa' }}>
            <span style={{ textTransform: 'capitalize', background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: 6 }}>{exerciseTypeLabel(ex.exercise_type)}</span>
            <Dots value={ex.difficulty} accent={accent} />
            <span>{t('health.browse.difficulty_n', { n: ex.difficulty })}</span>
          </div>
        </div>
        <DetailTabBar tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 28px 26px' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {ex.description && <p style={{ fontSize: 13, lineHeight: 1.6, color: '#cdd6f4', margin: 0 }}>{ex.description}</p>}
            {ex.beginner_detail && (
              <div>
                {sectionLabel(t('health.browse.if_youre_new'))}
                <p style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4', margin: 0 }}>{ex.beginner_detail}</p>
              </div>
            )}
            {ex.common_mistakes && (
              <div>
                {sectionLabel(t('health.browse.common_mistakes'))}
                <p style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4', margin: 0 }}>{ex.common_mistakes}</p>
              </div>
            )}
            {hasRoutine && (
              <div>
                {sectionLabel(t('health.browse.routine'))}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
                  {routine.map(([k, val]) => (
                    <div key={k}>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086' }}>{k}</div>
                      <div style={{ fontSize: 14, color: '#cdd6f4', marginTop: 2 }}>{val}</div>
                    </div>
                  ))}
                </div>
                {ex.routine.progression && (
                  <p style={{ fontSize: 12, fontStyle: 'italic', color: '#9b8caa', marginTop: 14, marginBottom: 0 }}>{ex.routine.progression}</p>
                )}
              </div>
            )}
            {(primaries.length > 0 || secondaries.length > 0) && (
              <div>
                {sectionLabel(t('health.browse.muscles'))}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {primaries.map(m => (
                    <span key={m.slug} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: `${accent}26`, color: accent }}>{m.name}</span>
                  ))}
                  {secondaries.map(m => (
                    <span key={m.slug} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(168,85,247,0.08)', color: '#9b8caa' }}>{m.name}</span>
                  ))}
                </div>
              </div>
            )}
            {ex.equipment.length > 0 && (
              <div>
                {sectionLabel(t('health.browse.equipment'))}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ex.equipment.map(e => (
                    <span key={e.slug} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(168,85,247,0.08)', color: '#9b8caa', textTransform: 'capitalize' }}>{e.name}</span>
                  ))}
                </div>
              </div>
            )}
            {!ex.description && !ex.beginner_detail && !ex.common_mistakes && !hasRoutine && !hasMuscles && (
              <p style={{ fontSize: 13, color: '#6c7086', margin: 0 }}>{t('health.browse.nothing_here')}</p>
            )}
          </div>
        )}

        {tab === 'howto' && (
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ex.steps.map((s, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4' }}>{s}</li>
            ))}
          </ol>
        )}
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

// ── My submissions tab ────────────────────────────────────────────────────

const STATUS_STYLE: Record<HealthSubmissionStatus, { fg: string; labelKey: string }> = {
  pending: { fg: '#fbbf24', labelKey: 'health.mysubs.status.pending' },
  rejected: { fg: '#f38ba8', labelKey: 'health.mysubs.status.rejected' },
  published: { fg: '#34d399', labelKey: 'health.mysubs.status.published' },
};

function StatusBadge({ status }: { status: HealthSubmissionStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1,
      padding: '2px 8px', borderRadius: 999,
      color: s.fg, background: `${s.fg}1f`, border: `1px solid ${s.fg}55`,
    }}>
      {t(s.labelKey)}
    </span>
  );
}

interface SubmissionRowData {
  key: string;
  name: string;
  kind: string;
  status: HealthSubmissionStatus;
  at: string | null;
  notes: string | null;
}

function SubmissionRow({ row }: { row: SubmissionRowData }) {
  return (
    <div style={{
      ...cardStyle, padding: 14,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, color: '#6c7086' }}>{row.kind}</span>
        <span style={{ fontSize: 13, color: '#cdd6f4', flex: 1, minWidth: 0 }}>{row.name}</span>
        <StatusBadge status={row.status} />
      </div>
      <div style={{ fontSize: 10, color: '#6c7086' }}>
        {row.at
          ? t('health.mysubs.submitted', { date: new Date(row.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) })
          : t('health.mysubs.submitted_no_date')}
      </div>
      {row.status === 'rejected' && row.notes && (
        <div style={{
          fontSize: 11, color: '#9b8caa', lineHeight: 1.5,
          borderLeft: '2px solid rgba(243,139,168,0.4)', paddingLeft: 8, marginTop: 2,
        }}>
          {row.notes}
        </div>
      )}
    </div>
  );
}

/** The caller's own submissions — pending / rejected / published —
 *  with a "clear rejected" action. Reads through the submission data
 *  layer; the submit modal that creates these lands in 2e-3. */
export function MySubmissionsTab() {
  const [data, setData] = useState<HealthMySubmissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    loadMySubmissions()
      .then(setData)
      .catch(() => setData({ exercises: [], recipes: [] }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const clearRejected = useCallback(async () => {
    setClearing(true);
    try {
      await clearRejectedSubmissions();
      reload();
    } catch {
      /* non-fatal — the list just stays as-is */
    } finally {
      setClearing(false);
    }
  }, [reload]);

  if (loading) return <CenterNote>{t('health.mysubs.loading')}</CenterNote>;

  const d = data ?? { exercises: [], recipes: [] };
  const rows: SubmissionRowData[] = [
    ...d.exercises.map(e => ({ key: `e-${e.id}`, name: e.name, kind: t('health.submit.kind.exercise'), status: e.status, at: e.submitted_at, notes: e.review_notes })),
    ...d.recipes.map(r => ({ key: `r-${r.id}`, name: r.name, kind: t('health.submit.kind.recipe'), status: r.status, at: r.submitted_at, notes: r.review_notes })),
  ];

  if (rows.length === 0) {
    return <CenterNote>{t('health.mysubs.empty_use_contribute')}</CenterNote>;
  }

  const hasRejected = rows.some(r => r.status === 'rejected');

  return (
    <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hasRejected && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={clearRejected}
            disabled={clearing}
            style={{
              padding: '5px 12px', fontSize: 11, cursor: clearing ? 'wait' : 'pointer',
              borderRadius: 6, background: 'transparent', color: '#f38ba8',
              border: '1px solid rgba(243,139,168,0.3)',
            }}
          >
            {clearing ? t('health.mysubs.clearing') : t('health.mysubs.clear_rejected_short')}
          </button>
        </div>
      )}
      {rows.map(row => <SubmissionRow key={row.key} row={row} />)}
    </div>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────

const fieldInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12,
  background: 'rgba(12, 8, 20, 0.5)', color: '#cdd6f4',
  border: '1px solid rgba(168, 85, 247, 0.18)', borderRadius: 6, outline: 'none',
  colorScheme: 'dark',
};

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
            border: `1px solid ${active ? '#a855f7' : 'rgba(168,85,247,0.2)'}`,
            background: active ? 'rgba(168,85,247,0.15)' : 'transparent',
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
  const toggle = (list: string[], slug: string) => (list.includes(slug) ? list.filter(s => s !== slug) : [...list, slug]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: '#e9e2f4', margin: 0 }}>{t('health.profile.your_profile')}</h2>
        <p style={{ marginTop: 4, fontSize: 12, lineHeight: 1.6, color: '#9b8caa', maxWidth: '70ch' }}>{t('health.profile.intro_blurb')}</p>
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
                  border: `1px solid ${active ? '#a855f7' : 'rgba(168,85,247,0.18)'}`,
                  background: active ? 'rgba(168,85,247,0.10)' : 'transparent',
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

      {/* Constraints — chips + textarea, full-width stacked. */}
      <ProfileSection title={t('health.profile.constraints')} subtitle={t('health.profile.constraints_subtitle')}>
        <Field label={t('health.profile.allergens')}>
          <Chips selected={c.allergens} options={allergenOpts}
            onToggle={slug => update({ ...p, constraints: { ...c, allergens: toggle(c.allergens, slug) } })}
            emptyHint={t('health.profile.allergens_loading')} />
        </Field>
        <Field label={t('health.profile.dietary')}>
          <Chips selected={c.dietary} options={DIETARY_OPTIONS.map(o => ({ slug: o.slug, label: t(o.labelKey) }))}
            onToggle={slug => update({ ...p, constraints: { ...c, dietary: toggle(c.dietary, slug) } })} />
        </Field>
        <Field label={t('health.profile.equipment')}>
          <Chips selected={c.equipment_available} options={EQUIPMENT_OPTIONS.map(o => ({ slug: o.slug, label: t(o.labelKey) }))}
            onToggle={slug => update({ ...p, constraints: { ...c, equipment_available: toggle(c.equipment_available, slug) } })} />
        </Field>
        <Field label={t('health.profile.injuries')}>
          <textarea rows={2} value={c.injuries.join('\n')}
            placeholder={t('health.profile.injuries_placeholder')}
            onChange={e => update({ ...p, constraints: { ...c, injuries: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })}
            style={{ ...fieldInputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }} />
        </Field>
        <Field label={t('health.profile.minutes_per_day')}>
          <input type="number" inputMode="numeric" value={c.minutes_per_day_target ?? ''} placeholder="45"
            onChange={e => update({ ...p, constraints: { ...c, minutes_per_day_target: parseNum(e.target.value) } })}
            style={fieldInputStyle} />
        </Field>
      </ProfileSection>

      {/* Food & taste — steers meal plans toward what they enjoy. */}
      <ProfileSection title={t('health.profile.food_taste')} subtitle={t('health.profile.food_taste_subtitle')}>
        <Field label={t('health.profile.likes')}>
          <textarea rows={2} value={f.likes.join('\n')}
            placeholder={t('health.profile.likes_placeholder')}
            onChange={e => update({ ...p, food: { ...f, likes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })}
            style={{ ...fieldInputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }} />
        </Field>
        <Field label={t('health.profile.dislikes')}>
          <textarea rows={2} value={f.dislikes.join('\n')}
            placeholder={t('health.profile.dislikes_placeholder')}
            onChange={e => update({ ...p, food: { ...f, dislikes: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) } })}
            style={{ ...fieldInputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }} />
        </Field>
        <Field label={t('health.profile.cuisines')}>
          <Chips selected={f.cuisines} options={CUISINE_OPTIONS}
            onToggle={slug => update({ ...p, food: { ...f, cuisines: toggle(f.cuisines, slug) } })} />
        </Field>
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
      </ProfileSection>
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
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9b8caa', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

/** Tab bar for the detail overlays — separates the sections that used to
 *  stack in one long scroll. Underline-style, matching the page's chrome. */
function DetailTabBar<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string }[]; active: T; onChange: (k: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid rgba(168,85,247,0.12)' }}>
      {tabs.map(tb => (
        <button key={tb.key} onClick={() => onChange(tb.key)} style={{
          padding: '8px 14px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          background: 'transparent', border: 'none', marginBottom: -1,
          color: active === tb.key ? '#cdd6f4' : '#6c7086',
          borderBottom: active === tb.key ? '2px solid #a855f7' : '2px solid transparent',
        }}>{tb.label}</button>
      ))}
    </div>
  );
}

type NutritionDisplayKey = 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g' | 'sugar_g' | 'sodium_mg' | 'saturated_fat_g';
const NUTRITION_DISPLAY: Array<[NutritionDisplayKey, string]> = [
  ['calories', 'Calories (kcal)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)'],
  ['fibre_g', 'Fibre (g)'], ['sugar_g', 'Sugar (g)'], ['sodium_mg', 'Sodium (mg)'], ['saturated_fat_g', 'Saturated fat (g)'],
];
// i18n key per nutrient for the compact table header (units dropped).
const NUTRI_LABEL_KEY: Record<NutritionDisplayKey, string> = {
  calories: 'health.browse.nutri.calories', protein_g: 'health.browse.nutri.protein',
  carbs_g: 'health.browse.nutri.carbs', fat_g: 'health.browse.nutri.fat',
  fibre_g: 'health.browse.nutri.fibre', sugar_g: 'health.browse.nutri.sugar',
  sodium_mg: 'health.browse.nutri.sodium', saturated_fat_g: 'health.browse.nutri.sat_fat',
};

/** Per-serving nutrition as a table — one row per skill level. Columns with no
 *  data on any level are dropped. */
function NutritionTable({ versions }: { versions: HealthRecipeDetail['versions'] }) {
  const cols = NUTRITION_DISPLAY.filter(([k]) => versions.some((vv) => typeof vv.nutrition?.[k] === 'number'));
  if (cols.length === 0) return null;
  const cell: React.CSSProperties = { padding: '7px 12px', fontSize: 12, color: '#cdd6f4' };
  const th: React.CSSProperties = { padding: '7px 12px', fontSize: 11, fontWeight: 600, color: '#6c7086', textAlign: 'left', whiteSpace: 'nowrap' };
  return (
    <div>
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(168,85,247,0.18)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.18)' }}>
              <th style={th}>{t('health.browse.per_serving')}</th>
              {cols.map(([k]) => <th key={k} style={th}>{t(NUTRI_LABEL_KEY[k])}</th>)}
            </tr>
          </thead>
          <tbody>
            {versions.map((vv, i) => (
              <tr key={vv.level} style={i < versions.length - 1 ? { borderBottom: '1px solid rgba(168,85,247,0.10)' } : undefined}>
                <td style={{ ...cell, textTransform: 'capitalize', color: '#9b8caa' }}>{t(`health.browse.level.${vv.level}`)}</td>
                {cols.map(([k]) => <td key={k} style={cell}>{typeof vv.nutrition?.[k] === 'number' ? vv.nutrition[k] : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 10, color: '#6c7086' }}>{t('health.browse.per_serving_estimated')}</p>
    </div>
  );
}

export function RecipeDetailBody({ r }: { r: HealthRecipeDetail }) {
  const levels = r.versions.map(v => v.level);
  const [level, setLevel] = useState<HealthRecipeSkillLevel>(levels[0] ?? 'beginner');
  const v = r.versions.find(vv => vv.level === level) ?? r.versions[0];

  type RTab = 'overview' | 'ingredients' | 'method' | 'storage';
  const hasNutrition = r.versions.some((vv) => NUTRITION_DISPLAY.some(([k]) => typeof vv.nutrition?.[k] === 'number'));
  const st = r.storage;
  const hasStorage = !!st && (st.keeps_fridge_days != null || st.keeps_freezer_months != null || !!st.from_frozen_notes);
  const tabs: { key: RTab; label: string }[] = [
    { key: 'overview', label: t('health.browse.overview') },
    ...(r.ingredients.length > 0 ? [{ key: 'ingredients' as RTab, label: t('health.browse.ingredients') }] : []),
    ...(r.versions.length > 0 ? [{ key: 'method' as RTab, label: t('health.browse.method') }] : []),
    ...(hasStorage ? [{ key: 'storage' as RTab, label: t('health.browse.storage') }] : []),
  ];
  const [tab, setTab] = useState<RTab>('overview');

  const levelPills = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
      {(['beginner', 'intermediate', 'expert'] as HealthRecipeSkillLevel[]).filter(l => levels.includes(l)).map(l => (
        <button key={l} onClick={() => setLevel(l)} style={{
          padding: '3px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
          borderRadius: 6, border: 'none',
          background: l === level ? 'rgba(251,191,36,0.18)' : 'transparent',
          color: l === level ? '#fbbf24' : '#6c7086',
        }}>{t(`health.browse.level.${l}`)}</button>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Hero image — leads the overlay, bleeds to the modal edges. */}
      {r.hero_image_url && (
        <div style={{ flexShrink: 0, height: 184, overflow: 'hidden', background: 'rgba(168,85,247,0.06)' }}>
          <img src={r.hero_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}

      {/* Fixed header + tabs. */}
      <div style={{ flexShrink: 0, padding: '20px 28px 0' }}>
        <div style={{ marginBottom: 14 }}>
          {r.cuisine_name && (
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2.5, color: '#fbbf24', marginBottom: 6 }}>
              {r.cuisine_name}
            </div>
          )}
          <h2 style={{ fontSize: 21, fontWeight: 300, color: '#cdd6f4', margin: 0 }}>{r.name}</h2>
          {(r.origin_country || r.course) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 11, color: '#9b8caa' }}>
              {r.origin_country && <span style={{ background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: 6 }}>{r.origin_country}</span>}
              {r.course && <span style={{ background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: 6, textTransform: 'capitalize' }}>{courseLabel(r.course)}</span>}
            </div>
          )}
        </div>
        <DetailTabBar tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Content — flexes to fill the consistent modal height, scrolls. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 28px 26px' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {r.overview
              ? <p style={{ fontSize: 13, lineHeight: 1.6, color: '#cdd6f4', margin: 0 }}>{r.overview}</p>
              : <p style={{ fontSize: 13, color: '#6c7086', margin: 0 }}>{t('health.browse.no_overview')}</p>}
            {hasNutrition && (
              <div>
                {sectionLabel(t('health.browse.nutrition'))}
                <NutritionTable versions={r.versions} />
              </div>
            )}
          </div>
        )}

        {tab === 'ingredients' && (
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {r.ingredients.map((ing, i) => (
              <li key={i} style={{ fontSize: 13, color: '#cdd6f4' }}>
                <span style={{ color: '#9b8caa', fontFamily: 'monospace', fontSize: 11, marginRight: 8 }}>
                  {ing.quantity != null ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : (ing.unit ?? '—')}
                </span>
                {ing.name}{ing.optional && <span style={{ color: '#6c7086' }}> ({t('health.browse.optional')})</span>}
              </li>
            ))}
          </ul>
        )}

        {tab === 'method' && v && (
          <div>
            {levelPills}
            {v.description && (
              <p style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4', marginTop: 0, marginBottom: 12 }}>{v.description}</p>
            )}
            <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {v.steps.map((s, i) => (
                <li key={i} style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4' }}>
                  {s.action}
                  {s.notes && <span style={{ display: 'block', fontSize: 12, fontStyle: 'italic', color: '#9b8caa', marginTop: 2 }}>{s.notes}</span>}
                </li>
              ))}
            </ol>
            {((v.diets && v.diets.length > 0) || (v.dietary_flags && v.dietary_flags.length > 0)) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                {v.diets.map(d => (
                  <span key={`d-${d}`} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}>{d}</span>
                ))}
                {v.dietary_flags.map(f => (
                  <span key={`f-${f}`} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>{f}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'storage' && st && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(st.keeps_fridge_days != null || st.keeps_freezer_months != null) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {st.keeps_fridge_days != null && (
                  <div style={{ borderRadius: 8, border: '1px solid rgba(168,85,247,0.18)', padding: 16 }}>
                    <div style={{ fontSize: 18 }} aria-hidden>❄️</div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086', marginTop: 4 }}>{t('health.storage.fridge')}</div>
                    <div style={{ fontSize: 19, fontWeight: 300, color: '#cdd6f4', marginTop: 2 }}>{st.keeps_fridge_days} {t(st.keeps_fridge_days === 1 ? 'health.storage.day' : 'health.storage.days')}</div>
                  </div>
                )}
                {st.keeps_freezer_months != null && (
                  <div style={{ borderRadius: 8, border: '1px solid rgba(168,85,247,0.18)', padding: 16 }}>
                    <div style={{ fontSize: 18 }} aria-hidden>🧊</div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086', marginTop: 4 }}>{t('health.storage.freezer')}</div>
                    <div style={{ fontSize: 19, fontWeight: 300, color: '#cdd6f4', marginTop: 2 }}>{st.keeps_freezer_months} {t(st.keeps_freezer_months === 1 ? 'health.storage.month' : 'health.storage.months')}</div>
                  </div>
                )}
              </div>
            )}
            {st.from_frozen_notes && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086', marginBottom: 8 }}>{t('health.storage.cooking_frozen')}</div>
                <p style={{ margin: 0, borderRadius: 8, border: '1px solid rgba(168,85,247,0.18)', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#cdd6f4' }}>{st.from_frozen_notes}</p>
              </div>
            )}
            <p style={{ margin: 0, fontSize: 10, color: '#6c7086' }}>{t('health.storage.disclaimer')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Contribute modal ──────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  padding: '7px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8,
  background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc',
  border: '1px solid rgba(168, 85, 247, 0.4)', cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
  background: 'transparent', color: '#9b8caa', border: '1px solid rgba(168, 85, 247, 0.15)',
};

const EXERCISE_TYPES: HealthExerciseType[] = [
  'compound', 'isolation', 'bodyweight', 'plyometric',
  'mobility', 'cardio', 'isometric', 'stretching', 'breathing',
];

export function ContributeModal({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'exercise' | 'recipe'>('exercise');
  const [taxonomies, setTaxonomies] = useState<HealthTaxonomies | null>(null);

  useEffect(() => {
    let live = true;
    loadTaxonomies().then(t => { if (live) setTaxonomies(t); }).catch(() => { /* pickers degrade gracefully */ });
    return () => { live = false; };
  }, []);

  const kindBtn = (k: 'exercise' | 'recipe', label: string) => (
    <button onClick={() => setKind(k)} style={{
      flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 8,
      background: kind === k ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
      color: kind === k ? '#c084fc' : '#6c7086',
      border: `1px solid ${kind === k ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.12)'}`,
    }}>{label}</button>
  );

  return (
    <ModalShell onClose={onClose}>
      <div style={{ padding: '28px 28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 300, color: '#cdd6f4', margin: 0 }}>{t('health.submit.contribute_short')}</h2>
          <p style={{ fontSize: 12, color: '#9b8caa', margin: '4px 0 0' }}>
            {t('health.submit.contribute_short_blurb')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {kindBtn('exercise', t('health.submit.kind.exercise'))}
          {kindBtn('recipe', t('health.submit.kind.recipe'))}
        </div>
        {kind === 'exercise'
          ? <ExerciseSubmissionForm taxonomies={taxonomies} onDone={onClose} />
          : <RecipeSubmissionForm taxonomies={taxonomies} onDone={onClose} />}
      </div>
    </ModalShell>
  );
}

function ExerciseSubmissionForm({ taxonomies, onDone }: { taxonomies: HealthTaxonomies | null; onDone: () => void }) {
  const [name, setName] = useState('');
  const [exerciseType, setExerciseType] = useState<HealthExerciseType>('compound');
  const [workoutType, setWorkoutType] = useState<HealthWorkoutType>('strength');
  const [difficulty, setDifficulty] = useState(3);
  const [description, setDescription] = useState('');
  const [beginnerDetail, setBeginnerDetail] = useState('');
  const [commonMistakes, setCommonMistakes] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [contraindications, setContraindications] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const canSubmit = name.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const row = await submitExercise({
        name: name.trim(),
        exercise_type: exerciseType,
        workout_type: workoutType,
        difficulty,
        description: description.trim() || null,
        beginner_detail: beginnerDetail.trim() || null,
        common_mistakes: commonMistakes.trim() || null,
        steps: steps.map(s => s.trim()).filter(Boolean),
        contraindication_slugs: contraindications,
      });
      setResult({
        ok: true,
        msg: row.status === 'published' ? t('health.submit.published_thanks') : t('health.submit.submitted_thanks'),
      });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : t('health.submit.submission_failed') });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.ok) {
    return (
      <div>
        <CenterNote>{result.msg}</CenterNote>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={onDone} style={primaryBtn}>{t('health.submit.done')}</button>
        </div>
      </div>
    );
  }

  const area: React.CSSProperties = { ...fieldInputStyle, resize: 'vertical' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label={t('health.submit.name')}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('health.submit.ex_name_ph')} style={fieldInputStyle} />
      </Field>
      <FieldRow>
        <Field label={t('health.submit.exercise_type')}>
          <select value={exerciseType} onChange={e => setExerciseType(e.target.value as HealthExerciseType)} style={fieldInputStyle}>
            {EXERCISE_TYPES.map(et => <option key={et} value={et}>{t(`health.submit.ex_type.${et}`)}</option>)}
          </select>
        </Field>
        <Field label={t('health.submit.workout_type')}>
          <select value={workoutType} onChange={e => setWorkoutType(e.target.value as HealthWorkoutType)} style={fieldInputStyle}>
            {WORKOUT_TYPES.map(w => <option key={w} value={w}>{t(`health.submit.wk_type.${w}`)}</option>)}
          </select>
        </Field>
        <Field label={t('health.submit.difficulty_1_5')}>
          <select value={difficulty} onChange={e => setDifficulty(Number(e.target.value))} style={fieldInputStyle}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </FieldRow>
      <Field label={t('health.submit.description')}>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} style={area} />
      </Field>
      <Field label={t('health.submit.how_to_do_it_steps')}>
        <StepsEditor steps={steps} onChange={setSteps} />
      </Field>
      <Field label={t('health.submit.ex_beginner_label_short')}>
        <textarea value={beginnerDetail} onChange={e => setBeginnerDetail(e.target.value)} rows={2} style={area} />
      </Field>
      <Field label={t('health.submit.ex_mistakes_label_short')}>
        <textarea value={commonMistakes} onChange={e => setCommonMistakes(e.target.value)} rows={2} style={area} />
      </Field>
      {taxonomies && taxonomies.contraindications.length > 0 && (
        <Field label={t('health.submit.contraindications_label')}>
          <ChipSelect
            options={taxonomies.contraindications.map(c => ({ slug: c.slug, name: c.name }))}
            selected={contraindications}
            onChange={setContraindications}
          />
        </Field>
      )}
      {result && !result.ok && (
        <div style={{ fontSize: 12, color: '#f38ba8' }}>{result.msg}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          {submitting ? t('health.submit.submitting') : t('health.submit.submit_for_review')}
        </button>
      </div>
    </div>
  );
}

/** A string[] list editor — numbered rows with add / remove. */
function StepsEditor({ steps, onChange }: { steps: string[]; onChange: (next: string[]) => void }) {
  const set = (i: number, v: string) => onChange(steps.map((s, idx) => (idx === i ? v : s)));
  const add = () => onChange([...steps, '']);
  const remove = (i: number) => onChange(steps.length > 1 ? steps.filter((_, idx) => idx !== i) : ['']);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#6c7086', width: 16, textAlign: 'right' }}>{i + 1}</span>
          <input value={s} onChange={e => set(i, e.target.value)} placeholder={t('health.submit.step_n_placeholder', { n: i + 1 })} style={{ ...fieldInputStyle, flex: 1 }} />
          <button onClick={() => remove(i)} aria-label={t('health.submit.remove_step')} style={{ width: 26, border: 'none', background: 'transparent', color: '#6c7086', cursor: 'pointer', fontSize: 15 }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ ...ghostBtn, alignSelf: 'flex-start' }}>{t('health.submit.add_step')}</button>
    </div>
  );
}

/** Multi-select chip group over a slug/name option list. */
function ChipSelect({ options, selected, onChange }: {
  options: Array<{ slug: string; name: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (slug: string) =>
    onChange(selected.includes(slug) ? selected.filter(s => s !== slug) : [...selected, slug]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const on = selected.includes(o.slug);
        return (
          <button key={o.slug} onClick={() => toggle(o.slug)} style={{
            padding: '3px 9px', fontSize: 10, cursor: 'pointer', borderRadius: 999,
            background: on ? 'rgba(168, 85, 247, 0.18)' : 'transparent',
            color: on ? '#c084fc' : '#6c7086',
            border: `1px solid ${on ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.12)'}`,
          }}>{o.name}</button>
        );
      })}
    </div>
  );
}

// ── Recipe submission form ────────────────────────────────────────────────

interface IngredientDraft {
  name: string;
  quantity: string;
  unit: string;
  optional: boolean;
}

const emptyIngredient = (): IngredientDraft => ({ name: '', quantity: '', unit: '', optional: false });

function RecipeSubmissionForm({ taxonomies, onDone }: { taxonomies: HealthTaxonomies | null; onDone: () => void }) {
  const [name, setName] = useState('');
  const [cuisineSlug, setCuisineSlug] = useState('');
  const [course, setCourse] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [overview, setOverview] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [method, setMethod] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const canSubmit = name.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const cleanIngredients = ingredients
        .filter(i => i.name.trim())
        .map(i => ({
          name: i.name.trim(),
          quantity: parseNum(i.quantity),
          unit: i.unit.trim() || null,
          optional: i.optional,
          notes: null,
        }));
      const cleanSteps = method.map(s => s.trim()).filter(Boolean);
      // One method version when steps are filled in; the schema also
      // accepts an empty versions array (operator composes the
      // skill-level versions post-approval).
      const versions = cleanSteps.length > 0
        ? [{
            level: 'intermediate' as HealthRecipeSkillLevel,
            description: null,
            prep_time_minutes: null,
            cook_time_minutes: null,
            total_time_minutes: null,
            default_servings: null,
            steps: cleanSteps.map(action => ({
              action, notes: null, technique_term: null, time_estimate_seconds: null, tricky_flag: false,
            })),
            equipment: [],
            diet_slugs: [],
            dietary_flag_slugs: [],
          }]
        : [];
      const row = await submitRecipe({
        name: name.trim(),
        cuisine_slug: cuisineSlug || null,
        course: course || null,
        origin_country: originCountry.trim() || null,
        overview: overview.trim() || null,
        ingredients: cleanIngredients,
        allergen_slugs: allergens,
        versions,
      });
      setResult({
        ok: true,
        msg: row.status === 'published' ? t('health.submit.published_thanks') : t('health.submit.submitted_thanks'),
      });
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : t('health.submit.submission_failed') });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.ok) {
    return (
      <div>
        <CenterNote>{result.msg}</CenterNote>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={onDone} style={primaryBtn}>{t('health.submit.done')}</button>
        </div>
      </div>
    );
  }

  const area: React.CSSProperties = { ...fieldInputStyle, resize: 'vertical' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label={t('health.submit.name')}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('health.submit.rc_name_ph')} style={fieldInputStyle} />
      </Field>
      <FieldRow>
        <Field label={t('health.submit.cuisine')}>
          <select value={cuisineSlug} onChange={e => setCuisineSlug(e.target.value)} style={fieldInputStyle}>
            <option value="">—</option>
            {(taxonomies?.cuisines ?? []).map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </Field>
        <Field label={t('health.submit.rc_course_label')}>
          <select value={course} onChange={e => setCourse(e.target.value)} style={fieldInputStyle}>
            <option value="">—</option>
            {COURSES.map(c => <option key={c} value={c}>{courseLabel(c)}</option>)}
          </select>
        </Field>
        <Field label={t('health.submit.origin_country')}>
          <input value={originCountry} onChange={e => setOriginCountry(e.target.value)} style={fieldInputStyle} />
        </Field>
      </FieldRow>
      <Field label={t('health.submit.overview')}>
        <textarea value={overview} onChange={e => setOverview(e.target.value)} rows={2} style={area} />
      </Field>
      <Field label={t('health.submit.ingredients')}>
        <IngredientsEditor ingredients={ingredients} onChange={setIngredients} />
      </Field>
      <Field label={t('health.submit.method_steps')}>
        <StepsEditor steps={method} onChange={setMethod} />
      </Field>
      {taxonomies && taxonomies.allergens.length > 0 && (
        <Field label={t('health.submit.allergens')}>
          <ChipSelect
            options={taxonomies.allergens.map(a => ({ slug: a.slug, name: a.name }))}
            selected={allergens}
            onChange={setAllergens}
          />
        </Field>
      )}
      {result && !result.ok && (
        <div style={{ fontSize: 12, color: '#f38ba8' }}>{result.msg}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
        >
          {submitting ? t('health.submit.submitting') : t('health.submit.submit_for_review')}
        </button>
      </div>
    </div>
  );
}

/** Ingredient list editor — name / quantity / unit / optional rows. */
function IngredientsEditor({ ingredients, onChange }: {
  ingredients: IngredientDraft[];
  onChange: (next: IngredientDraft[]) => void;
}) {
  const set = (i: number, patch: Partial<IngredientDraft>) =>
    onChange(ingredients.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing)));
  const add = () => onChange([...ingredients, emptyIngredient()]);
  const remove = (i: number) =>
    onChange(ingredients.length > 1 ? ingredients.filter((_, idx) => idx !== i) : [emptyIngredient()]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ingredients.map((ing, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={ing.quantity} onChange={e => set(i, { quantity: e.target.value })} placeholder={t('health.submit.qty')} inputMode="numeric"
            style={{ ...fieldInputStyle, width: 56 }} />
          <input value={ing.unit} onChange={e => set(i, { unit: e.target.value })} placeholder={t('health.submit.unit')}
            style={{ ...fieldInputStyle, width: 72 }} />
          <input value={ing.name} onChange={e => set(i, { name: e.target.value })} placeholder={t('health.submit.ingredient_n_placeholder', { n: i + 1 })}
            style={{ ...fieldInputStyle, flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#6c7086' }}>
            <input type="checkbox" checked={ing.optional} onChange={e => set(i, { optional: e.target.checked })} />
            {t('health.submit.opt_short')}
          </label>
          <button onClick={() => remove(i)} aria-label={t('health.submit.remove_ingredient')}
            style={{ width: 26, border: 'none', background: 'transparent', color: '#6c7086', cursor: 'pointer', fontSize: 15 }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ ...ghostBtn, alignSelf: 'flex-start' }}>{t('health.submit.add_ingredient')}</button>
    </div>
  );
}
