import { useState, useEffect, useCallback, useRef } from 'react';
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
  type HealthWorkoutType,
  loadMySubmissions,
  clearRejectedSubmissions,
  type HealthMySubmissions,
  type HealthSubmissionStatus,
} from '../lib/health-catalog';
import {
  loadHealthProfile,
  saveHealthProfile,
  type HealthProfile,
} from '../lib/health-store';

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
        {tab === 'mine' && <MySubmissionsTab />}
        {tab === 'profile' && <ProfileTab />}
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
  const [modalSlug, setModalSlug] = useState<string | null>(null);

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
                <Card key={ex.id} onClick={() => setModalSlug(ex.slug)}>
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
                </Card>
              );
            })}
          </CardGrid>
          <Pagination total={total} offset={offset} loading={loading} onPage={fetchPage} />
        </>
      )}

      {modalSlug && <ExerciseDetailModal slug={modalSlug} onClose={() => setModalSlug(null)} />}
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
  const [modalSlug, setModalSlug] = useState<string | null>(null);

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
              <Card key={r.id} onClick={() => setModalSlug(r.slug)}>
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
              </Card>
            ))}
          </CardGrid>
          <Pagination total={total} offset={offset} loading={loading} onPage={fetchPage} />
        </>
      )}

      {modalSlug && <RecipeDetailModal slug={modalSlug} onClose={() => setModalSlug(null)} />}
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

function CenterNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: '#6c7086' }}>
      {children}
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

// ── Detail modals ─────────────────────────────────────────────────────────

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
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
          position: 'relative', width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto',
          background: 'linear-gradient(160deg, #0f0f17, #1a1625)',
          border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: 16,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
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

function sectionLabel(text: string): React.ReactElement {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086', marginBottom: 8 }}>
      {text}
    </div>
  );
}

// ── Exercise detail ───────────────────────────────────────────────────────

function ExerciseDetailModal({ slug, onClose }: { slug: string; onClose: () => void }) {
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
    <ModalShell onClose={onClose}>
      <div style={{ padding: '28px 28px 32px' }}>
        {loading
          ? <CenterNote>Loading exercise…</CenterNote>
          : failed || !detail
            ? <CenterNote>Couldn&apos;t load this exercise.</CenterNote>
            : <ExerciseDetailBody ex={detail} />}
      </div>
    </ModalShell>
  );
}

function ExerciseDetailBody({ ex }: { ex: HealthExerciseDetail }) {
  const accent = WORKOUT_ACCENT[ex.workout_type];
  const routine: Array<[string, string]> = [];
  if (ex.routine.sets != null) routine.push(['Sets', String(ex.routine.sets)]);
  if (ex.routine.reps_target) routine.push(['Reps', ex.routine.reps_target]);
  if (ex.routine.rest_seconds != null) routine.push(['Rest', `${ex.routine.rest_seconds}s`]);
  if (ex.routine.tempo) routine.push(['Tempo', ex.routine.tempo]);
  if (ex.routine.frequency_per_week) routine.push(['Freq.', ex.routine.frequency_per_week]);
  const primaries = ex.muscles.filter(m => m.role === 'primary');
  const secondaries = ex.muscles.filter(m => m.role === 'secondary');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2.5, color: accent, marginBottom: 6 }}>
          {WORKOUT_LABEL[ex.workout_type]}
        </div>
        <h2 style={{ fontSize: 21, fontWeight: 300, color: '#cdd6f4', margin: 0 }}>{ex.name}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 11, color: '#9b8caa' }}>
          <span style={{ textTransform: 'capitalize', background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: 6 }}>{ex.exercise_type}</span>
          <Dots value={ex.difficulty} accent={accent} />
          <span>Difficulty {ex.difficulty}/5</span>
        </div>
      </div>

      {ex.description && (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#cdd6f4', margin: 0 }}>{ex.description}</p>
      )}

      {ex.steps.length > 0 && (
        <div>
          {sectionLabel('How to do it')}
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ex.steps.map((s, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4' }}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      {routine.length > 0 && (
        <div>
          {sectionLabel('How to use it')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
            {routine.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086' }}>{k}</div>
                <div style={{ fontSize: 14, color: '#cdd6f4', marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          {ex.routine.progression && (
            <p style={{ fontSize: 12, fontStyle: 'italic', color: '#9b8caa', marginTop: 10, marginBottom: 0 }}>{ex.routine.progression}</p>
          )}
        </div>
      )}

      {ex.beginner_detail && (
        <div>
          {sectionLabel("If you're new to this")}
          <p style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4', margin: 0 }}>{ex.beginner_detail}</p>
        </div>
      )}

      {ex.common_mistakes && (
        <div>
          {sectionLabel('Common mistakes')}
          <p style={{ fontSize: 13, lineHeight: 1.55, color: '#cdd6f4', margin: 0 }}>{ex.common_mistakes}</p>
        </div>
      )}

      {(primaries.length > 0 || secondaries.length > 0) && (
        <div>
          {sectionLabel('Muscles')}
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
          {sectionLabel('Equipment')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ex.equipment.map(e => (
              <span key={e.slug} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(168,85,247,0.08)', color: '#9b8caa', textTransform: 'capitalize' }}>{e.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recipe detail ─────────────────────────────────────────────────────────

function RecipeDetailModal({ slug, onClose }: { slug: string; onClose: () => void }) {
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
    <ModalShell onClose={onClose}>
      <div style={{ padding: '28px 28px 32px' }}>
        {loading
          ? <CenterNote>Loading recipe…</CenterNote>
          : failed || !detail
            ? <CenterNote>Couldn&apos;t load this recipe.</CenterNote>
            : <RecipeDetailBody r={detail} />}
      </div>
    </ModalShell>
  );
}

// ── My submissions tab ────────────────────────────────────────────────────

const STATUS_STYLE: Record<HealthSubmissionStatus, { fg: string; label: string }> = {
  pending: { fg: '#fbbf24', label: 'Pending review' },
  rejected: { fg: '#f38ba8', label: 'Rejected' },
  published: { fg: '#34d399', label: 'Published' },
};

function StatusBadge({ status }: { status: HealthSubmissionStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1,
      padding: '2px 8px', borderRadius: 999,
      color: s.fg, background: `${s.fg}1f`, border: `1px solid ${s.fg}55`,
    }}>
      {s.label}
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
          ? `Submitted ${new Date(row.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : 'Submitted'}
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
function MySubmissionsTab() {
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

  if (loading) return <CenterNote>Loading your submissions…</CenterNote>;

  const d = data ?? { exercises: [], recipes: [] };
  const rows: SubmissionRowData[] = [
    ...d.exercises.map(e => ({ key: `e-${e.id}`, name: e.name, kind: 'Exercise', status: e.status, at: e.submitted_at, notes: e.review_notes })),
    ...d.recipes.map(r => ({ key: `r-${r.id}`, name: r.name, kind: 'Recipe', status: r.status, at: r.submitted_at, notes: r.review_notes })),
  ];

  if (rows.length === 0) {
    return <CenterNote>You haven&apos;t submitted anything yet — use Contribute to add an exercise or recipe.</CenterNote>;
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
            {clearing ? 'Clearing…' : 'Clear rejected'}
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
function ProfileTab() {
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedTick, setSavedTick] = useState(0);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    loadHealthProfile().then(p => { if (live) { setProfile(p); setLoading(false); } });
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
      saveHealthProfile(next)
        .then(() => setSavedTick(t => t + 1))
        .catch(() => { /* non-fatal — retried on next edit */ });
    }, 600);
  }, []);

  if (loading || !profile) return <CenterNote>Loading profile…</CenterNote>;
  const p = profile;

  return (
    <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p style={{ fontSize: 12, color: '#9b8caa', margin: 0 }}>
        Stored on this machine. Ava reads it to shape your daily brief and plan.
        {savedTick > 0 && <span style={{ color: '#34d399', marginLeft: 8 }}>Saved</span>}
      </p>

      <ProfileSection title="Body">
        <FieldRow>
          <Field label="Sex">
            <select
              value={p.body.sex ?? ''}
              onChange={e => update({ ...p, body: { ...p.body, sex: (e.target.value || null) as HealthProfile['body']['sex'] } })}
              style={fieldInputStyle}
            >
              <option value="">—</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Date of birth">
            <input type="date" value={p.body.date_of_birth ?? ''}
              onChange={e => update({ ...p, body: { ...p.body, date_of_birth: e.target.value || null } })}
              style={fieldInputStyle} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Height (cm)">
            <input type="number" inputMode="numeric" value={p.body.height_cm ?? ''}
              onChange={e => update({ ...p, body: { ...p.body, height_cm: parseNum(e.target.value) } })}
              style={fieldInputStyle} />
          </Field>
          <Field label="Weight (kg)">
            <input type="number" inputMode="numeric" value={p.body.weight_kg ?? ''}
              onChange={e => update({ ...p, body: { ...p.body, weight_kg: parseNum(e.target.value) } })}
              style={fieldInputStyle} />
          </Field>
          <Field label="Body fat (%)">
            <input type="number" inputMode="numeric" value={p.body.body_fat_pct ?? ''}
              onChange={e => update({ ...p, body: { ...p.body, body_fat_pct: parseNum(e.target.value) } })}
              style={fieldInputStyle} />
          </Field>
        </FieldRow>
      </ProfileSection>

      <ProfileSection title="Goals">
        <FieldRow>
          <Field label="Primary goal">
            <select
              value={p.goals.primary ?? ''}
              onChange={e => update({ ...p, goals: { ...p.goals, primary: (e.target.value || null) as HealthProfile['goals']['primary'] } })}
              style={fieldInputStyle}
            >
              <option value="">—</option>
              <option value="fat_loss">Fat loss</option>
              <option value="muscle_gain">Muscle gain</option>
              <option value="maintenance">Maintenance</option>
              <option value="athletic">Athletic performance</option>
              <option value="recovery">Recovery</option>
              <option value="longevity">Longevity</option>
            </select>
          </Field>
          <Field label="This week's focus">
            <input type="text" value={p.goals.weekly_focus ?? ''} placeholder="e.g. deload week"
              onChange={e => update({ ...p, goals: { ...p.goals, weekly_focus: e.target.value || null } })}
              style={fieldInputStyle} />
          </Field>
        </FieldRow>
      </ProfileSection>

      <ProfileSection title="Constraints">
        <Field label="Allergens (comma-separated)">
          <input type="text" value={p.constraints.allergens.join(', ')}
            onChange={e => update({ ...p, constraints: { ...p.constraints, allergens: csv(e.target.value) } })}
            style={fieldInputStyle} />
        </Field>
        <Field label="Dietary (comma-separated)">
          <input type="text" value={p.constraints.dietary.join(', ')} placeholder="e.g. vegan, gluten_free"
            onChange={e => update({ ...p, constraints: { ...p.constraints, dietary: csv(e.target.value) } })}
            style={fieldInputStyle} />
        </Field>
        <Field label="Injuries / limiting conditions (comma-separated)">
          <input type="text" value={p.constraints.injuries.join(', ')}
            onChange={e => update({ ...p, constraints: { ...p.constraints, injuries: csv(e.target.value) } })}
            style={fieldInputStyle} />
        </Field>
        <Field label="Equipment available (comma-separated)">
          <input type="text" value={p.constraints.equipment_available.join(', ')} placeholder="e.g. dumbbells, pull_up_bar"
            onChange={e => update({ ...p, constraints: { ...p.constraints, equipment_available: csv(e.target.value) } })}
            style={fieldInputStyle} />
        </Field>
        <Field label="Minutes per day available">
          <input type="number" inputMode="numeric" value={p.constraints.minutes_per_day_target ?? ''}
            onChange={e => update({ ...p, constraints: { ...p.constraints, minutes_per_day_target: parseNum(e.target.value) } })}
            style={fieldInputStyle} />
        </Field>
      </ProfileSection>

      <ProfileSection title="Schedule">
        <FieldRow>
          <Field label="Training — start">
            <input type="time" value={p.schedule.training_window.start ?? ''}
              onChange={e => update({ ...p, schedule: { ...p.schedule, training_window: { ...p.schedule.training_window, start: e.target.value || null } } })}
              style={fieldInputStyle} />
          </Field>
          <Field label="Training — end">
            <input type="time" value={p.schedule.training_window.end ?? ''}
              onChange={e => update({ ...p, schedule: { ...p.schedule, training_window: { ...p.schedule.training_window, end: e.target.value || null } } })}
              style={fieldInputStyle} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Breakfast">
            <input type="time" value={p.schedule.meal_times.breakfast ?? ''}
              onChange={e => update({ ...p, schedule: { ...p.schedule, meal_times: { ...p.schedule.meal_times, breakfast: e.target.value || null } } })}
              style={fieldInputStyle} />
          </Field>
          <Field label="Lunch">
            <input type="time" value={p.schedule.meal_times.lunch ?? ''}
              onChange={e => update({ ...p, schedule: { ...p.schedule, meal_times: { ...p.schedule.meal_times, lunch: e.target.value || null } } })}
              style={fieldInputStyle} />
          </Field>
          <Field label="Dinner">
            <input type="time" value={p.schedule.meal_times.dinner ?? ''}
              onChange={e => update({ ...p, schedule: { ...p.schedule, meal_times: { ...p.schedule.meal_times, dinner: e.target.value || null } } })}
              style={fieldInputStyle} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Bedtime">
            <input type="time" value={p.schedule.sleep_target.bedtime ?? ''}
              onChange={e => update({ ...p, schedule: { ...p.schedule, sleep_target: { ...p.schedule.sleep_target, bedtime: e.target.value || null } } })}
              style={fieldInputStyle} />
          </Field>
          <Field label="Wake">
            <input type="time" value={p.schedule.sleep_target.wake ?? ''}
              onChange={e => update({ ...p, schedule: { ...p.schedule, sleep_target: { ...p.schedule.sleep_target, wake: e.target.value || null } } })}
              style={fieldInputStyle} />
          </Field>
        </FieldRow>
      </ProfileSection>
    </div>
  );
}

/** Split a comma-separated input into a trimmed, de-emptied string array. */
function csv(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086', marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ flex: '1 1 160px', minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#9b8caa' }}>{label}</span>
      {children}
    </label>
  );
}

function RecipeDetailBody({ r }: { r: HealthRecipeDetail }) {
  const levels = r.versions.map(v => v.level);
  const [level, setLevel] = useState<HealthRecipeSkillLevel>(levels[0] ?? 'beginner');
  const v = r.versions.find(vv => vv.level === level) ?? r.versions[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        {r.cuisine_name && (
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2.5, color: '#fbbf24', marginBottom: 6 }}>
            {r.cuisine_name}
          </div>
        )}
        <h2 style={{ fontSize: 21, fontWeight: 300, color: '#cdd6f4', margin: 0 }}>{r.name}</h2>
        {(r.origin_country || r.course) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 11, color: '#9b8caa' }}>
            {r.origin_country && <span style={{ background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: 6 }}>{r.origin_country}</span>}
            {r.course && <span style={{ background: 'rgba(168,85,247,0.1)', padding: '2px 8px', borderRadius: 6, textTransform: 'capitalize' }}>{r.course}</span>}
          </div>
        )}
      </div>

      {r.overview && (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: '#cdd6f4', margin: 0 }}>{r.overview}</p>
      )}

      {r.ingredients.length > 0 && (
        <div>
          {sectionLabel('Ingredients')}
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {r.ingredients.map((ing, i) => (
              <li key={i} style={{ fontSize: 13, color: '#cdd6f4' }}>
                <span style={{ color: '#9b8caa', fontFamily: 'monospace', fontSize: 11, marginRight: 8 }}>
                  {ing.quantity != null ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''}` : (ing.unit ?? '—')}
                </span>
                {ing.name}{ing.optional && <span style={{ color: '#6c7086' }}> (optional)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.versions.length > 0 && v && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {sectionLabel('Method')}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {(['beginner', 'intermediate', 'expert'] as HealthRecipeSkillLevel[]).filter(l => levels.includes(l)).map(l => (
                <button key={l} onClick={() => setLevel(l)} style={{
                  padding: '3px 10px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
                  borderRadius: 6, border: 'none',
                  background: l === level ? 'rgba(251,191,36,0.18)' : 'transparent',
                  color: l === level ? '#fbbf24' : '#6c7086',
                }}>{l}</button>
              ))}
            </div>
          </div>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
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
    </div>
  );
}
