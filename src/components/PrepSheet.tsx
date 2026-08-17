// Where the cooking actually lands.
//
// The IDE mirror of the extension's prep sheet. All the reasoning lives in
// @ava/core/health/prep: hands-on versus unattended minutes, which day carries
// the load, what has to be started the night before, and which dish is worth
// cooking once for two days. This file draws it.
//
// Two rules worth keeping in view while reading:
//
//   A budget nobody has given is NOT a budget of zero. Null means unknown, so
//   nothing is called heavy against a number the user never stated — the sheet
//   says there is no budget rather than colouring the week green against
//   nothing.
//
//   Cook-once is derived from the PLAN — the same dish more than once, inside
//   the days the library says it keeps — never from the batch_portions column,
//   which is a seeded 12 across most of the corpus and a judgement about
//   nothing.

import { useMemo } from 'react';
import { weekPrep, shortDuration, type PrepDay, type CookOnce, type PrepSource } from '@ava/core/health/prep';
import type { HealthPlan } from '../lib/health-plans-store';
import type { HealthProfile } from '../lib/health-store';
import { t } from '../lib/i18n';
import { localYmd } from '@ava/core/dates';

const TEXT = '#cdd6f4';
const MUTED = '#585b70';
const AMBER = '#fbbf24';
const GREEN = '#a6e3a1';
const BORDER = 'color-mix(in srgb, var(--accent) 14%, transparent)';

export function PrepSheet({ plan, profile, onClose }: {
  plan: HealthPlan;
  profile: HealthProfile | null;
  onClose: () => void;
}) {
  // Real dates when the plan is placed in time — that is the only thing that
  // makes weekday-vs-weekend, and therefore a time budget, mean anything.
  const sources = useMemo<PrepSource[]>(() => {
    const start = plan.start_date ? Date.parse(`${plan.start_date}T00:00:00Z`) : NaN;
    return plan.days.map(day => ({
      day,
      date: Number.isNaN(start)
        ? null
        : localYmd(new Date(start + (day.day_index - 1) * 86_400_000)),
    }));
  }, [plan.days, plan.start_date]);

  // Null is UNKNOWN, never zero: with no stated budget nothing is called heavy,
  // because there is nothing to be heavy against.
  const kitchen = profile?.kitchen ?? null;

  const prep = useMemo(() => weekPrep(sources, kitchen), [sources, kitchen]);
  const cooked = prep.days.filter(d => d.minutes > 0);
  const anyBudget = prep.days.some(d => d.budget != null);
  const max = Math.max(...prep.days.map(x => x.minutes), 1);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 620, maxHeight: 'min(800px, 90vh)', overflow: 'hidden', borderRadius: 16, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'linear-gradient(to bottom right, #0f0f17, #1a1625)' }}>

        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{t('health.prep.title')}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>{plan.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ flexShrink: 0, height: 28, width: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {!cooked.length ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>{t('health.prep.nothing')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* The week at a glance */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                <Stat label={t('health.prep.hands_on')} value={shortDuration(prep.totalMinutes)} />
                {prep.heaviest != null && (
                  <Stat label={t('health.prep.heaviest')} value={t('health.plans.day_n', { n: prep.heaviest })} />
                )}
                {prep.minutesSaved > 0 && (
                  <Stat label={t('health.prep.saves')} value={shortDuration(prep.minutesSaved)} tone="good" />
                )}
              </div>

              {/* A budget nobody has given is not a budget of zero — say so
                  rather than colouring every day green against nothing. */}
              {!anyBudget && (
                <p style={{ margin: 0, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '8px 12px', fontSize: 11, lineHeight: 1.6, color: MUTED }}>
                  {t('health.prep.no_budget')}
                </p>
              )}

              {/* Per-day load */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {prep.days.map(d => <DayBar key={d.day_index} day={d} max={max} />)}
              </div>

              {/* Start ahead — unattended time, which is not work but does
                  decide which evening you have to begin. */}
              {prep.days.some(d => d.startAhead.length > 0) && (
                <section>
                  <h3 style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTED }}>{t('health.prep.start_ahead')}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: MUTED }}>{t('health.prep.start_ahead_hint')}</p>
                  <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {prep.days.flatMap(d => d.startAhead.map(s => (
                      <li key={`${d.day_index}-${s.mealId}`} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, borderRadius: 8, border: `1px solid color-mix(in srgb, ${AMBER} 25%, transparent)`, background: `color-mix(in srgb, ${AMBER} 6%, transparent)`, padding: '8px 12px' }}>
                        <span style={{ minWidth: 0, fontSize: 12, color: TEXT }}>{s.name}</span>
                        <span style={{ flexShrink: 0, fontSize: 11, color: AMBER }}>
                          {t('health.plans.day_n', { n: d.day_index })} · {s.daysAhead === 1
                            ? t('health.prep.day_before')
                            : `${s.daysAhead} ${t('health.prep.days_before')}`}
                        </span>
                      </li>
                    )))}
                  </ul>
                </section>
              )}

              {/* Cook once — from the plan, not from batch_portions. */}
              {prep.cookOnce.length > 0 && (
                <section>
                  <h3 style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTED }}>{t('health.prep.cook_once')}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: MUTED }}>{t('health.prep.cook_once_hint')}</p>
                  <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {prep.cookOnce.map(c => <CookOnceRow key={c.slug} c={c} />)}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTED }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 14, fontWeight: 500, color: tone === 'good' ? GREEN : TEXT }}>{value}</div>
    </div>
  );
}

function DayBar({ day, max }: { day: PrepDay; max: number }) {
  const pct = Math.round((day.minutes / max) * 100);
  const over = day.overBy != null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 56, flexShrink: 0, fontSize: 11, color: MUTED }}>
        {t('health.plans.day_n', { n: day.day_index })}
      </span>
      <div style={{ height: 16, minWidth: 0, flex: 1, overflow: 'hidden', borderRadius: 4, background: 'rgba(88, 91, 112, 0.25)' }}>
        {day.minutes > 0 && (
          <div style={{
            height: '100%', borderRadius: 4,
            width: `${Math.max(pct, 4)}%`,
            background: over ? `color-mix(in srgb, ${AMBER} 60%, transparent)` : 'color-mix(in srgb, var(--accent) 50%, transparent)',
          }} />
        )}
      </div>
      <span style={{ width: 88, flexShrink: 0, textAlign: 'right', fontSize: 11, fontVariantNumeric: 'tabular-nums', color: over ? AMBER : TEXT }}>
        {day.minutes > 0 ? shortDuration(day.minutes) : <span style={{ color: MUTED }}>{t('health.prep.no_cooking')}</span>}
      </span>
      {/* Only ever shown against a budget somebody actually stated. */}
      {over && (
        <span style={{ flexShrink: 0, fontSize: 10, color: AMBER }}>
          {shortDuration(day.overBy!)} {t('health.prep.over_budget')}
        </span>
      )}
    </div>
  );
}

function CookOnceRow({ c }: { c: CookOnce }) {
  return (
    <li style={{ borderRadius: 8, border: `1px solid color-mix(in srgb, ${GREEN} 25%, transparent)`, background: `color-mix(in srgb, ${GREEN} 6%, transparent)`, padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ minWidth: 0, fontSize: 12, color: TEXT }}>{c.name}</span>
        <span style={{ flexShrink: 0, fontSize: 11, color: GREEN }}>−{shortDuration(c.minutesSaved)}</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 10, lineHeight: 1.6, color: MUTED }}>
        {t('health.prep.cook_on_day')} {c.cookOn} · {c.servings} {t('health.prep.make_servings')} ·{' '}
        {t('health.prep.covers_days')} {c.covers.join(', ')} · {t('health.prep.keeps_days')} {c.keepsDays}
      </div>
    </li>
  );
}
