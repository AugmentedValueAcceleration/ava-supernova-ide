import { useState, useEffect } from 'react';
import { t, useLocale } from '../lib/i18n';
import { loadHealthPlanIndex, loadHealthPlan, type HealthPlan } from '../lib/health-plans-store';

/**
 * This week at a glance — the Command Center health tab. Pulls the active
 * fitness / meal / combined plans and lays this week's training sessions + meals
 * onto a 7-day grid (Mon–Sun), today highlighted. When nothing's active, nudges
 * the user to build a plan in the Ava room. Read-only; the plans themselves live
 * in Account → "{name}'s profile".
 */

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function planDayDateKey(startDate: string, dayIndex: number): string {
  const d = new Date(`${startDate}T00:00:00`);
  d.setDate(d.getDate() + dayIndex - 1);
  return ymd(d);
}

interface DayCell {
  date: Date;
  key: string;
  training: string[]; // exercise / session names
  trainingTitle: string | null; // the day's title (e.g. "Push day")
  meals: Array<{ slot: string; name: string }>;
}

export function WeeklyPlanView({ view = 'week' }: { view?: 'today' | 'week' }) {
  useLocale();
  const [loading, setLoading] = useState(true);
  const [cells, setCells] = useState<DayCell[]>([]);
  const [hasActive, setHasActive] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const week: DayCell[] = [];
      const monday = startOfWeek(new Date());
      const todayKey = ymd(new Date());
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        week.push({ date, key: ymd(date), training: [], trainingTitle: null, meals: [] });
      }
      const byKey = new Map(week.map(c => [c.key, c]));

      let activeCount = 0;
      try {
        const index = await loadHealthPlanIndex();
        const actives = index.filter(p => p.status === 'active' && p.start_date);
        const plans = (await Promise.all(actives.map(s => loadHealthPlan(s.id)))).filter(Boolean) as HealthPlan[];
        for (const plan of plans) {
          if (!plan.start_date) continue;
          activeCount++;
          for (const day of plan.days) {
            const cell = byKey.get(planDayDateKey(plan.start_date, day.day_index));
            if (!cell) continue;
            if (plan.type === 'fitness' || plan.type === 'combined') {
              if (day.title && !cell.trainingTitle) cell.trainingTitle = day.title;
              for (const ex of day.training) if (ex.name) cell.training.push(ex.name);
            }
            if (plan.type === 'meal' || plan.type === 'combined') {
              for (const m of day.meals) if (m.name) cell.meals.push({ slot: m.slot, name: m.name });
            }
          }
        }
      } catch { /* no plans — empty week */ }

      if (live) {
        void todayKey;
        setCells(week);
        setHasActive(activeCount > 0);
        setLoading(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const todayKey = ymd(new Date());

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#6c7086' }}>{t('health.week.loading')}</div>;
  }

  if (!hasActive) {
    return (
      <div style={{
        border: '1px solid rgba(168,85,247,0.25)', background: 'rgba(168,85,247,0.05)',
        borderRadius: 10, padding: '28px 24px', textAlign: 'center', maxWidth: 520, margin: '8px auto',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🗓️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>{t('health.week.empty.title')}</div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: '#9b8caa', margin: 0 }}>{t('health.week.empty.body')}</p>
      </div>
    );
  }

  // ── Today — a fuller single-day view ────────────────────────────────────
  if (view === 'today') {
    const today = cells.find(c => c.key === todayKey);
    const tr = today?.training ?? [];
    const ml = today?.meals ?? [];
    const nothing = tr.length === 0 && ml.length === 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 13, color: '#9b8caa' }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          {today?.trainingTitle && <span style={{ color: '#cdd6f4', fontWeight: 600 }}> · {today.trainingTitle}</span>}
        </div>
        {tr.length > 0 && (
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086', marginBottom: 8 }}>{t('health.week.training')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tr.map((name, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#cdd6f4', padding: '8px 12px', borderRadius: 8, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                  <span aria-hidden>🏋</span>{name}
                </div>
              ))}
            </div>
          </div>
        )}
        {ml.length > 0 && (
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086', marginBottom: 8 }}>{t('health.week.meals')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ml.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#cdd6f4', padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.14)' }}>
                  <span aria-hidden>🍽</span><span style={{ fontSize: 10, textTransform: 'uppercase', color: '#9b8caa', letterSpacing: 1 }}>{m.slot}</span>{m.name}
                </div>
              ))}
            </div>
          </div>
        )}
        {nothing && (
          <div style={{ fontSize: 12, color: '#6c7086', fontStyle: 'italic', padding: '20px 0' }}>{t('health.week.today_rest')}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
        {cells.map((cell) => {
          const isToday = cell.key === todayKey;
          const rest = cell.training.length === 0 && cell.meals.length === 0;
          return (
            <div key={cell.key} style={{
              display: 'flex', flexDirection: 'column', gap: 8, minHeight: 150,
              borderRadius: 10, padding: 10,
              border: isToday ? '1px solid rgba(168,85,247,0.6)' : '1px solid rgba(168,85,247,0.12)',
              background: isToday ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.015)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: isToday ? '#c084fc' : '#6c7086' }}>
                  {cell.date.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? '#fff' : '#9b8caa' }}>
                  {cell.date.getDate()}
                </span>
              </div>

              {cell.trainingTitle && (
                <div style={{ fontSize: 11, fontWeight: 600, color: '#cdd6f4' }}>{cell.trainingTitle}</div>
              )}

              {cell.training.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {cell.training.slice(0, 4).map((name, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#a6adc8', lineHeight: 1.3, display: 'flex', gap: 4 }}>
                      <span aria-hidden style={{ opacity: 0.7 }}>🏋</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    </div>
                  ))}
                  {cell.training.length > 4 && <div style={{ fontSize: 9, color: '#6c7086' }}>+{cell.training.length - 4} more</div>}
                </div>
              )}

              {cell.meals.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 'auto' }}>
                  {cell.meals.slice(0, 4).map((m, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#a6adc8', lineHeight: 1.3, display: 'flex', gap: 4 }}>
                      <span aria-hidden style={{ opacity: 0.7 }}>🍽</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    </div>
                  ))}
                  {cell.meals.length > 4 && <div style={{ fontSize: 9, color: '#6c7086' }}>+{cell.meals.length - 4} more</div>}
                </div>
              )}

              {rest && <div style={{ fontSize: 10, color: '#585b70', fontStyle: 'italic', marginTop: 4 }}>{t('health.week.rest')}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
