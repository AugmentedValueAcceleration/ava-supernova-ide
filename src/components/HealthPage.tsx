import { useState, useEffect, useCallback } from 'react';
import {
  loadExercises,
  loadRecipes,
  type HealthExerciseSummary,
  type HealthRecipeSummary,
  type HealthWorkoutType,
} from '../lib/health-catalog';

/**
 * Health & Nutrition page for the IDE — the public exercise + recipe
 * library. Self-contained (the IDE renders pages as prop-less
 * components); data comes through the health-catalog fetch layer.
 *
 * Step 2b: page shell + Exercises / Recipes grids. The My-submissions
 * and Profile tabs are placeholders until 2d / 2e; click-to-open
 * detail modals land in 2c.
 */

type HealthTab = 'exercises' | 'recipes' | 'mine' | 'profile';

const PAGE_SIZE = 24;

const WORKOUT_TYPES: HealthWorkoutType[] = [
  'strength', 'hypertrophy', 'conditioning', 'hiit',
  'mobility', 'yoga', 'pilates', 'recovery', 'running', 'cycling', 'hybrid',
];

const WORKOUT_LABEL: Record<HealthWorkoutType, string> = {
  strength: 'Strength', hypertrophy: 'Hypertrophy', conditioning: 'Conditioning',
  hiit: 'HIIT', mobility: 'Mobility', yoga: 'Yoga', pilates: 'Pilates',
  recovery: 'Recovery', running: 'Running', cycling: 'Cycling', hybrid: 'Hybrid',
};

const WORKOUT_ACCENT: Record<HealthWorkoutType, string> = {
  strength: '#a8a8b3', hypertrophy: '#c084fc', conditioning: '#34d399',
  hiit: '#fb923c', mobility: '#60a5fa', yoga: '#fbbf24', pilates: '#f472b6',
  recovery: '#94a3b8', running: '#22d3ee', cycling: '#a78bfa', hybrid: '#f87171',
};

const COURSES = ['breakfast', 'main', 'starter', 'side', 'snack', 'dessert'] as const;
const COURSE_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', main: 'Mains', starter: 'Starters',
  side: 'Sides', snack: 'Snacks', dessert: 'Desserts',
};

// ── Page ──────────────────────────────────────────────────────────────────

export function HealthPage() {
  const [tab, setTab] = useState<HealthTab>('exercises');

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
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#cdd6f4', margin: 0, marginBottom: 2 }}>
          Health &amp; Nutrition
        </h1>
        <p style={{ fontSize: 12, color: '#9b8caa', margin: 0, marginBottom: 16 }}>
          A free, open library of exercises and recipes. Informational only.
        </p>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => setTab('exercises')} style={tabBtnStyle(tab === 'exercises')}>Exercises</button>
          <button onClick={() => setTab('recipes')} style={tabBtnStyle(tab === 'recipes')}>Recipes</button>
          <button onClick={() => setTab('mine')} style={tabBtnStyle(tab === 'mine')}>My submissions</button>
          <button onClick={() => setTab('profile')} style={tabBtnStyle(tab === 'profile')}>Profile</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 32px' }}>
        {tab === 'exercises' && <ExercisesGrid />}
        {tab === 'recipes' && <RecipesGrid />}
        {tab === 'mine' && <ComingSoon label="My submissions — the contribution flow lands in a follow-up." />}
        {tab === 'profile' && <ComingSoon label="Profile — your body stats, goals and constraints. Lands next." />}
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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async (off: number) => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  // Refetch (page 0) on filter / search change — search debounced 300ms.
  useEffect(() => {
    const t = setTimeout(() => { void fetchPage(0); }, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search exercises — e.g. 'squat'" />
      <FilterRow>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
        {WORKOUT_TYPES.map(w => (
          <FilterChip key={w} active={filter === w} onClick={() => setFilter(w)}>{WORKOUT_LABEL[w]}</FilterChip>
        ))}
      </FilterRow>

      {loading ? (
        <CenterNote>Loading exercises…</CenterNote>
      ) : items.length === 0 ? (
        <CenterNote>{search ? `No exercises match "${search}".` : 'No exercises found.'}</CenterNote>
      ) : (
        <>
          <CardGrid>
            {items.map(ex => {
              const accent = WORKOUT_ACCENT[ex.workout_type];
              return (
                <div key={ex.id} style={cardStyle}>
                  <div style={{ height: 3, background: accent, borderRadius: '8px 8px 0 0' }} />
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.6, color: accent, marginBottom: 4 }}>
                      {WORKOUT_LABEL[ex.workout_type]}
                    </div>
                    <div style={{ fontSize: 13, color: '#cdd6f4', lineHeight: 1.3 }}>{ex.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <Dots value={ex.difficulty} accent={accent} />
                      <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'capitalize' }}>{ex.exercise_type}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardGrid>
          <Pagination total={total} offset={offset} loading={loading} onPage={fetchPage} />
        </>
      )}
    </div>
  );
}

// ── Recipes grid ──────────────────────────────────────────────────────────

function RecipesGrid() {
  const [items, setItems] = useState<HealthRecipeSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async (off: number) => {
    setLoading(true);
    try {
      const r = await loadRecipes({
        limit: PAGE_SIZE,
        offset: off,
        course: filter === 'all' ? undefined : filter,
        q: search.trim() || undefined,
      });
      setItems(r.recipes);
      setTotal(r.total);
      setOffset(off);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = setTimeout(() => { void fetchPage(0); }, search ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder="Search recipes — e.g. 'chicken'" />
      <FilterRow>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
        {COURSES.map(c => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>{COURSE_LABEL[c]}</FilterChip>
        ))}
      </FilterRow>

      {loading ? (
        <CenterNote>Loading recipes…</CenterNote>
      ) : items.length === 0 ? (
        <CenterNote>{search ? `No recipes match "${search}".` : 'No recipes found.'}</CenterNote>
      ) : (
        <>
          <CardGrid>
            {items.map(r => (
              <div key={r.id} style={cardStyle}>
                <div style={{
                  aspectRatio: '4 / 3', background: 'rgba(168,85,247,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '8px 8px 0 0', overflow: 'hidden',
                }}>
                  {r.hero_image_url
                    ? <img src={r.hero_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 26, opacity: 0.3 }}>🍽</span>}
                </div>
                <div style={{ padding: 14 }}>
                  {r.cuisine_name && (
                    <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.6, color: '#fbbf24', marginBottom: 4 }}>
                      {r.cuisine_name}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: '#cdd6f4', lineHeight: 1.3 }}>{r.name}</div>
                </div>
              </div>
            ))}
          </CardGrid>
          <Pagination total={total} offset={offset} loading={loading} onPage={fetchPage} />
        </>
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

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
      gap: 12,
    }}>
      {children}
    </div>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#6c7086' }}>
      {children}
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{
      border: '1px dashed rgba(168, 85, 247, 0.2)', borderRadius: 12,
      padding: '40px 24px', textAlign: 'center', fontSize: 12, color: '#9b8caa',
    }}>
      {label}
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
    <span style={{ display: 'inline-flex', gap: 3 }} aria-label={`Difficulty ${value} of 5`}>
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
        onClick={() => !atStart && !loading && onPage(Math.max(0, offset - PAGE_SIZE))}>← Prev</button>
      <span style={{ fontSize: 11, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 1 }}>
        Page {currentPage} of {totalPages}
      </span>
      <button disabled={atEnd || loading} style={btn(atEnd || loading)}
        onClick={() => !atEnd && !loading && onPage(offset + PAGE_SIZE)}>Next →</button>
    </div>
  );
}
