// Copy a day or a week forward, optionally stepped up.
//
// The IDE mirror of the extension's sheet. The copying and the progression both
// live in @ava/core/health/duplicate; this draws the choice and shows what it
// will cost before it happens.
//
// Two things this is careful about, and both are core's rules rather than
// this file's:
//
//   The COPY is stepped, never the source. Repeating week one unchanged for a
//   month is what progression exists to prevent, but stepping the source would
//   rewrite work already done.
//
//   Volume, not load. Weight is free text in this system — adding 2.5% to
//   "bodyweight" is nonsense — so an extra rep or an extra set is what can be
//   offered honestly, and it is an explicit choice rather than a silent rule.
//   Warm-ups, cool-downs, mobility and whole recovery days are left alone;
//   quietly turning a recovery day into a session is exactly the mistake that
//   day was scheduled to prevent. That guard reads meta.session_role, which is
//   why capture had to land before this sheet did.

import { useMemo, useState } from 'react';
import {
  duplicateDay, duplicateWeek, progressDays, weekCount, daysInWeek, type Progression,
} from '@ava/core/health/duplicate';
import type { HealthPlan } from '../lib/health-plans-store';
import { t } from '../lib/i18n';

const ACCENT = 'var(--accent)';
const TEXT = '#cdd6f4';
const MUTED = '#585b70';
const AMBER = '#fbbf24';
const BORDER = 'color-mix(in srgb, var(--accent) 14%, transparent)';

const fieldInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12,
  background: 'rgba(12, 8, 20, 0.5)', color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 6, outline: 'none', colorScheme: 'dark',
};

export function DuplicateSheet({ plan, fromDay, onApply, onClose }: {
  plan: HealthPlan;
  fromDay: number;
  onApply: (next: HealthPlan) => void;
  onClose: () => void;
}) {
  const weeks = weekCount(plan);
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [targetDays, setTargetDays] = useState<Set<number>>(() => new Set());
  const [targetWeek, setTargetWeek] = useState<number | null>(null);
  const [progression, setProgression] = useState<Progression>('same');

  const sourceWeek = Math.floor((fromDay - 1) / 7) + 1;
  const source = plan.days.find(d => d.day_index === fromDay);
  const sourceEmpty = !source || (source.training.length === 0 && source.meals.length === 0);

  const hasContent = (index: number) => {
    const d = plan.days.find(x => x.day_index === index);
    return !!d && (d.training.length > 0 || d.meals.length > 0);
  };

  // Counted up front and shown on the button — not discovered afterwards.
  const willReplace = useMemo(() => {
    if (mode === 'day') return [...targetDays].filter(hasContent).length;
    if (targetWeek == null) return 0;
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const target = (targetWeek - 1) * 7 + 1 + i;
      const src = (sourceWeek - 1) * 7 + 1 + i;
      if (plan.days.some(d => d.day_index === src) && hasContent(target)) n++;
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, targetDays, targetWeek, plan, sourceWeek]);

  const canApply = mode === 'day' ? targetDays.size > 0 : targetWeek != null;

  const apply = () => {
    if (!canApply) return;
    // Copy first, then step the COPY forward — never the source.
    if (mode === 'day') {
      const targets = [...targetDays];
      onApply(progressDays(duplicateDay(plan, fromDay, targets), targets, progression));
    } else if (targetWeek != null) {
      const copied = duplicateWeek(plan, sourceWeek, targetWeek);
      onApply(progressDays(copied, daysInWeek(copied, targetWeek), progression));
    }
    onClose();
  };

  const allDays = plan.days.map(d => d.day_index).filter(i => i !== fromDay);

  const pill = (active: boolean): React.CSSProperties => ({
    borderRadius: 999, padding: '4px 12px', fontSize: 11, cursor: 'pointer',
    background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
    color: active ? ACCENT : MUTED,
    border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : BORDER}`,
  });

  const chip = (active: boolean): React.CSSProperties => ({
    borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: 'pointer',
    background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
    color: active ? ACCENT : MUTED,
    border: `1px solid ${active ? ACCENT : BORDER}`,
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 520, maxHeight: 'min(760px, 88vh)', overflow: 'hidden', borderRadius: 16, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'linear-gradient(to bottom right, #0f0f17, #1a1625)' }}>

        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{t('health.dup.title')}</div>
            {source?.title && <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>{source.title}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ flexShrink: 0, height: 28, width: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {sourceEmpty ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>{t('health.dup.nothing_to_copy')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Week mode only exists once there is a second week. */}
              {weeks > 1 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['day', 'week'] as const).map(mo => (
                    <button key={mo} type="button" onClick={() => setMode(mo)} style={pill(mode === mo)}>
                      {t(mo === 'day' ? 'health.dup.mode_day' : 'health.dup.mode_week')}
                    </button>
                  ))}
                </div>
              )}

              {mode === 'day' ? (
                <div>
                  <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTED }}>
                    {t('health.dup.pick_days', { n: fromDay })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {allDays.map(i => {
                      const on = targetDays.has(i);
                      const occupied = hasContent(i);
                      return (
                        <button key={i} type="button"
                          title={occupied ? t('health.dup.has_content') : undefined}
                          onClick={() => setTargetDays(prev => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i); else next.add(i);
                            return next;
                          })}
                          style={chip(on)}>
                          {t('health.dup.day_n', { n: i })}
                          {/* Marked BEFORE the copy, so nothing is lost by surprise. */}
                          {occupied && <span style={{ marginLeft: 4, color: AMBER }}>•</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTED }}>
                    {t('health.dup.pick_week', { n: sourceWeek })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Array.from({ length: weeks }, (_, i) => i + 1).filter(w => w !== sourceWeek).map(w => (
                      <button key={w} type="button" onClick={() => setTargetWeek(w)} style={chip(targetWeek === w)}>
                        {t('health.dup.week_n', { n: w })}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* An explicit choice, never a silent rule. */}
              <div>
                <div style={{ marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTED }}>{t('health.dup.progression')}</div>
                <select value={progression} onChange={e => setProgression(e.target.value as Progression)} style={fieldInputStyle}>
                  <option value="same">{t('health.dup.prog_same')}</option>
                  <option value="one_more_rep">{t('health.dup.prog_rep')}</option>
                  <option value="one_more_set">{t('health.dup.prog_set')}</option>
                </select>
                <p style={{ margin: '4px 0 0', fontSize: 10, lineHeight: 1.6, color: MUTED }}>{t('health.dup.prog_hint')}</p>
              </div>

              {willReplace > 0 && (
                <p style={{ margin: 0, borderRadius: 8, border: `1px solid color-mix(in srgb, ${AMBER} 25%, transparent)`, background: `color-mix(in srgb, ${AMBER} 6%, transparent)`, padding: '8px 12px', fontSize: 11, lineHeight: 1.6, color: AMBER }}>
                  {willReplace === 1
                    ? t('health.dup.will_replace_one')
                    : t('health.dup.will_replace_many', { n: willReplace })}
                </p>
              )}

              <button type="button" onClick={apply} disabled={!canApply}
                style={{
                  width: '100%', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 500,
                  border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  color: ACCENT, cursor: canApply ? 'pointer' : 'default', opacity: canApply ? 1 : 0.4,
                }}>
                {t('health.dup.apply')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
