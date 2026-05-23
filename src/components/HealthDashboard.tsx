import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  loadHealthProfile,
  loadHealthDailyPlan,
  saveHealthDailyPlan,
  emptyHealthDailyPlan,
  type HealthProfile,
  type HealthDailyPlan,
  type HealthDailyLog,
} from '../lib/health-store';
import { generateMorningBrief } from '../lib/health-catalog';
import { t, useLocale } from '../lib/i18n';

/**
 * Health Dashboard — the daily view, rendered as a tab in the IDE's
 * Command Centre (step 3b mounts it). Reads the local-first health
 * store: the profile (Profile tab on the Health page) and today's
 * plan. Self-contained, prop-less.
 *
 * Layout: Ava's morning brief, the status row (readiness / nutrition
 * / training), the quick-log row, and today's plan.
 */

// ── Helpers ───────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 5) return 'health.home.greeting.late_night';
  if (h < 12) return 'health.home.greeting.morning';
  if (h < 17) return 'health.home.greeting.afternoon';
  if (h < 21) return 'health.home.greeting.evening';
  return 'health.home.greeting.late_evening';
}

function longDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function profileIsEmpty(p: HealthProfile | null): boolean {
  if (!p) return true;
  const hasBody = p.body.height_cm != null || p.body.weight_kg != null || p.body.sex != null;
  return !(hasBody || p.goals.primary != null);
}

function formatHours(h: number): string {
  return `${Number(h.toFixed(1))}h`;
}

function targetSleepHours(p: HealthProfile | null): number {
  const parse = (s: string | null): number | null => {
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const bed = parse(p?.schedule.sleep_target.bedtime ?? null);
  const wake = parse(p?.schedule.sleep_target.wake ?? null);
  if (bed == null || wake == null) return 8;
  let mins = wake - bed;
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

interface StatusFigure { value: string; hint: string }

function readiness(p: HealthProfile | null, plan: HealthDailyPlan | null): StatusFigure {
  const sleep = plan?.log.sleep_hours ?? null;
  const mood = plan?.log.mood ?? null;
  if (sleep == null && mood == null) return { value: '—', hint: t('health.home.readiness.empty') };
  const target = targetSleepHours(p);
  let score = 0;
  let weight = 0;
  if (sleep != null) { score += Math.min(sleep / target, 1) * 0.6; weight += 0.6; }
  if (mood != null) { score += (mood / 5) * 0.4; weight += 0.4; }
  const pct = Math.round((score / weight) * 100);
  const word = pct >= 80 ? t('health.home.readiness.strong') : pct >= 60 ? t('health.home.readiness.good') : pct >= 40 ? t('health.home.readiness.fair') : t('health.home.readiness.low');
  const bits: string[] = [];
  if (sleep != null) bits.push(t('health.home.readiness.sleep_of', { actual: formatHours(sleep), target: formatHours(target) }));
  if (mood != null) bits.push(t('health.home.readiness.mood', { n: mood }));
  return { value: word, hint: bits.join(' · ') };
}

function nutrition(plan: HealthDailyPlan | null): StatusFigure {
  const meals = plan?.log.meals ?? [];
  const water = plan?.log.water_ml ?? 0;
  if (meals.length === 0 && water === 0) return { value: '—', hint: t('health.home.nutrition.empty') };
  const protein = meals.reduce((a, m) => a + (m.protein_g ?? 0), 0);
  const bits: string[] = [];
  if (protein > 0) bits.push(t('health.home.nutrition.protein', { n: Math.round(protein) }));
  bits.push(t('health.home.nutrition.water', { n: water }));
  const value = meals.length > 0 ? (meals.length === 1 ? t('health.home.nutrition.meals_one') : t('health.home.nutrition.meals', { n: meals.length })) : '—';
  return { value, hint: bits.join(' · ') };
}

function training(plan: HealthDailyPlan | null): StatusFigure {
  const items = (plan?.items ?? []).filter(i => i.kind === 'workout' || i.kind === 'mobility');
  if (items.length === 0) return { value: t('health.home.training_load.rest_day'), hint: t('health.home.training_load.none') };
  const done = items.filter(i => i.status === 'done').length;
  const min = items.reduce((a, i) => a + (i.duration_minutes ?? 0), 0);
  return {
    value: min > 0
      ? t('health.home.n_min', { n: min })
      : (items.length === 1 ? t('health.home.training_load.sessions_one', { n: items.length }) : t('health.home.training_load.sessions', { n: items.length })),
    hint: items.length === 1
      ? t('health.home.training_load.sessions_done_one', { done })
      : t('health.home.training_load.sessions_done', { done, total: items.length }),
  };
}

// ── Component ─────────────────────────────────────────────────────────────

export function HealthDashboard() {
  useLocale();
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [plan, setPlan] = useState<HealthDailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [innerTab, setInnerTab] = useState<'overview' | 'plans'>('overview');
  const [briefGenerating, setBriefGenerating] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const today = useMemo(() => todayIso(), []);
  const empty = useMemo(() => profileIsEmpty(profile), [profile]);

  useEffect(() => {
    let live = true;
    Promise.all([loadHealthProfile(), loadHealthDailyPlan(today)])
      .then(([p, pl]) => { if (live) { setProfile(p); setPlan(pl); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [today]);

  /** Mutate today's plan's log and persist — mints a fresh plan if
   *  none exists yet so the first quick-log entry has a home. */
  const commitLog = useCallback((mutate: (log: HealthDailyLog) => HealthDailyLog) => {
    setPlan(prev => {
      const base = prev ?? emptyHealthDailyPlan(today);
      const next: HealthDailyPlan = { ...base, log: mutate(base.log) };
      void saveHealthDailyPlan(next).catch(() => { /* non-fatal */ });
      return next;
    });
  }, [today]);

  const writeBrief = useCallback(async () => {
    if (!profile || empty) return;
    setBriefGenerating(true);
    setBriefError(null);
    try {
      const log = plan?.log ?? emptyHealthDailyPlan(today).log;
      const brief = await generateMorningBrief({ date: today, profile, log });
      setPlan(prev => {
        const base = prev ?? emptyHealthDailyPlan(today);
        const next: HealthDailyPlan = { ...base, morning_brief: brief };
        void saveHealthDailyPlan(next).catch(() => {});
        return next;
      });
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : t('health.home.brief.error'));
    } finally {
      setBriefGenerating(false);
    }
  }, [profile, plan, empty, today]);

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', fontSize: 12, color: '#6c7086' }}>{t('health.home.loading')}</div>;
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12,
    fontWeight: active ? 600 : 500, background: 'transparent',
    color: active ? '#c084fc' : '#6c7086',
    borderBottom: active ? '2px solid #a855f7' : '2px solid transparent', marginBottom: -1,
  });

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <header>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086' }}>{longDate()}</div>
        <h1 style={{ fontSize: 20, fontWeight: 300, color: '#cdd6f4', margin: '4px 0 0' }}>{t(greetingKey())}.</h1>
      </header>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(168,85,247,0.12)' }}>
        <button onClick={() => setInnerTab('overview')} style={tabBtn(innerTab === 'overview')}>{t('health.home.tab.overview')}</button>
        <button onClick={() => setInnerTab('plans')} style={tabBtn(innerTab === 'plans')}>{t('health.home.tab.plans')}</button>
      </div>

      {empty && (
        <div style={{
          border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)',
          borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#9b8caa', lineHeight: 1.5,
        }}>
          {t('health.home.empty.before')}<strong style={{ color: '#cdd6f4' }}>{t('health.home.empty.profile')}</strong>{t('health.home.empty.after')}
        </div>
      )}

      {innerTab === 'overview' ? (
        <>
          <Section title={t('health.home.section.brief')}>
            <BriefBlock
              brief={plan?.morning_brief ?? null}
              profileEmpty={empty}
              generating={briefGenerating}
              error={briefError}
              onGenerate={writeBrief}
            />
          </Section>
          <Section title={t('health.home.section.where_you_are')}>
            <StatusRow profile={profile} plan={plan} />
          </Section>
          <Section title={t('health.home.section.quick_log')}>
            <QuickLogRow plan={plan} commitLog={commitLog} />
          </Section>
        </>
      ) : (
        <PlansView plan={plan} />
      )}

      <footer style={{ fontSize: 10, color: '#6c7086', paddingTop: 6 }}>
        {t('health.home.footer', { date: today })}
      </footer>
    </div>
  );
}

// ── Sections + blocks ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086', marginBottom: 10 }}>{title}</div>
      {children}
    </section>
  );
}

function BriefBlock({ brief, profileEmpty, generating, error, onGenerate }: {
  brief: string | null;
  profileEmpty: boolean;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <div>
      {brief ? (
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#cdd6f4', fontWeight: 300, margin: 0 }}>{brief}</p>
      ) : (
        <div style={{
          border: '1px solid rgba(168,85,247,0.12)', borderRadius: 8, padding: '14px 16px',
          fontSize: 12, fontStyle: 'italic', color: '#6c7086', lineHeight: 1.6,
        }}>
          {profileEmpty
            ? t('health.home.brief.empty_profile')
            : t('health.home.brief.empty')}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#f38ba8' }}>{error}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button
          onClick={onGenerate}
          disabled={generating || profileEmpty}
          style={{
            padding: '5px 12px', fontSize: 11, borderRadius: 6,
            background: 'rgba(168,85,247,0.12)', color: '#c084fc',
            border: '1px solid rgba(168,85,247,0.35)',
            cursor: generating || profileEmpty ? 'not-allowed' : 'pointer',
            opacity: generating || profileEmpty ? 0.4 : 1,
          }}
        >
          {generating ? t('health.home.brief.writing') : brief ? t('health.home.brief.rewrite') : t('health.home.brief.write')}
        </button>
        <span style={{ fontSize: 10, color: '#6c7086' }}>
          {t('health.home.brief.snapshot_note')}
        </span>
      </div>
    </div>
  );
}

function StatusRow({ profile, plan }: { profile: HealthProfile | null; plan: HealthDailyPlan | null }) {
  const r = readiness(profile, plan);
  const n = nutrition(plan);
  const tr = training(plan);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      <StatusTile label={t('health.home.status.readiness')} {...r} />
      <StatusTile label={t('health.home.status.nutrition')} {...n} />
      <StatusTile label={t('health.home.status.training_load')} {...tr} />
    </div>
  );
}

function StatusTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ border: '1px solid rgba(168,85,247,0.12)', borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 300, color: '#cdd6f4', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#6c7086', marginTop: 4, lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

// ── Quick log ─────────────────────────────────────────────────────────────

const MOOD_FACE: Record<number, string> = { 1: '😔', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };

function QuickLogRow({ plan, commitLog }: {
  plan: HealthDailyPlan | null;
  commitLog: (mutate: (log: HealthDailyLog) => HealthDailyLog) => void;
}) {
  const [open, setOpen] = useState<'meal' | 'water' | 'sleep' | 'mood' | null>(null);
  const [mealText, setMealText] = useState('');
  const log = plan?.log;
  const water = log?.water_ml ?? 0;
  const sleep = log?.sleep_hours ?? null;
  const mood = log?.mood ?? null;
  const meals = log?.meals ?? [];

  const tile = (k: typeof open, label: string, hint: string) => (
    <button
      onClick={() => setOpen(o => (o === k ? null : k))}
      style={{
        flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
        background: open === k ? 'rgba(168,85,247,0.1)' : 'transparent',
        border: `1px solid ${open === k ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.12)'}`,
      }}
    >
      <div style={{ fontSize: 11, color: open === k ? '#c084fc' : '#9b8caa' }}>+ {label}</div>
      <div style={{ fontSize: 9, color: '#6c7086', marginTop: 2 }}>{hint}</div>
    </button>
  );

  const chip = (onClick: () => void, label: string, disabled = false): React.ReactElement => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '3px 9px', fontSize: 11, borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
      background: 'rgba(12,8,20,0.5)', color: '#9b8caa',
      border: '1px solid rgba(168,85,247,0.18)', opacity: disabled ? 0.4 : 1,
    }}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        {tile('meal', t('health.home.quick.meal'), meals.length > 0 ? t('health.home.quick.meals_logged', { n: meals.length }) : t('health.home.quick.none_yet'))}
        {tile('water', t('health.home.quick.water'), t('health.home.quick.ml', { n: water }))}
        {tile('sleep', t('health.home.quick.sleep'), sleep != null ? formatHours(sleep) : t('health.home.quick.not_set'))}
        {tile('mood', t('health.home.quick.mood'), mood != null ? t('health.home.quick.mood_value', { face: MOOD_FACE[mood], n: mood }) : t('health.home.quick.not_set'))}
      </div>

      {open && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 8,
          border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.04)',
        }}>
          {open === 'water' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#6c7086' }}>{t('health.home.quick.water_today', { n: water })}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {chip(() => commitLog(l => ({ ...l, water_ml: l.water_ml + 250 })), '+250')}
                {chip(() => commitLog(l => ({ ...l, water_ml: l.water_ml + 500 })), '+500')}
                {chip(() => commitLog(l => ({ ...l, water_ml: Math.max(0, l.water_ml - 250) })), '−250', water <= 0)}
              </div>
            </div>
          )}
          {open === 'sleep' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: '#6c7086' }}>{t('health.home.quick.hours_slept')}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {chip(() => commitLog(l => ({ ...l, sleep_hours: Math.max(0, ((l.sleep_hours ?? 7.5) - 0.5)) })), '−')}
                <span style={{ fontSize: 14, color: '#cdd6f4', width: 44, textAlign: 'center' }}>{formatHours(sleep ?? 7.5)}</span>
                {chip(() => commitLog(l => ({ ...l, sleep_hours: Math.min(14, ((l.sleep_hours ?? 7.5) + 0.5)) })), '+')}
              </div>
            </div>
          )}
          {open === 'mood' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#6c7086' }}>{t('health.home.quick.how_feeling')}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {([1, 2, 3, 4, 5] as const).map(m => (
                  <button key={m} onClick={() => { commitLog(l => ({ ...l, mood: m })); setOpen(null); }}
                    style={{
                      width: 34, height: 34, borderRadius: 8, fontSize: 16, cursor: 'pointer',
                      background: mood === m ? 'rgba(168,85,247,0.15)' : 'transparent',
                      border: `1px solid ${mood === m ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.12)'}`,
                    }}>{MOOD_FACE[m]}</button>
                ))}
              </div>
            </div>
          )}
          {open === 'meal' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={mealText}
                onChange={e => setMealText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && mealText.trim()) {
                    const desc = mealText.trim();
                    commitLog(l => ({
                      ...l,
                      meals: [...l.meals, {
                        id: `m_${Date.now().toString(36)}`,
                        time: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
                        description: desc, calories: null, protein_g: null,
                      }],
                    }));
                    setMealText('');
                  }
                }}
                placeholder={t('health.home.quick.meal_placeholder')}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 12, borderRadius: 6,
                  background: 'rgba(12,8,20,0.5)', color: '#cdd6f4',
                  border: '1px solid rgba(168,85,247,0.18)', outline: 'none',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Plans view ────────────────────────────────────────────────────────────

function PlansView({ plan }: { plan: HealthDailyPlan | null }) {
  const items = plan?.items ?? [];
  const meals = items.filter(i => i.kind === 'meal');
  const train = items.filter(i => i.kind === 'workout' || i.kind === 'mobility');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section title={t('health.home.section.todays_meals')}>
        {meals.length === 0
          ? <PlanEmpty body={t('health.home.plans.empty_meals')} />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{meals.map(m => <PlanItem key={m.id} item={m} />)}</div>}
      </Section>
      <Section title={t('health.home.section.todays_training')}>
        {train.length === 0
          ? <PlanEmpty body={t('health.home.plans.empty_training')} />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{train.map(item => <PlanItem key={item.id} item={item} />)}</div>}
      </Section>
    </div>
  );
}

function PlanEmpty({ body }: { body: string }) {
  return (
    <div style={{
      border: '1px dashed rgba(168,85,247,0.18)', borderRadius: 8,
      padding: '20px 16px', textAlign: 'center', fontSize: 11, color: '#6c7086', lineHeight: 1.5,
    }}>
      {body}
    </div>
  );
}

function PlanItem({ item }: { item: HealthDailyPlan['items'][number] }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10,
      border: '1px solid rgba(168,85,247,0.12)', borderRadius: 8, padding: '8px 12px',
    }}>
      <span style={{ fontSize: 13, color: item.status === 'done' ? '#6c7086' : '#cdd6f4', textDecoration: item.status === 'done' ? 'line-through' : 'none', flex: 1 }}>
        {item.title}
      </span>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#6c7086' }}>{item.time}</span>
    </div>
  );
}
