// Curated starters — a good week on day one, without building it yourself.
//
// The IDE mirror of the extension's sheet. The copy rules live in
// @ava/core/health/starters (planFromCurated, orderForProfile, shapeOf); the
// fetching is in lib/curated-plans.ts; this is the browse and the decision.
//
// The shape of the screen follows one rule: nobody starts a plan they have not
// seen. The whole week is on screen — every day, rest days included — before
// the button exists. That is what makes landing the plan ACTIVE rather than as
// a draft defensible, and a starter sitting in drafts helps nobody.

import { useEffect, useMemo, useState } from 'react';
import {
  planFromCurated, orderForProfile, shapeOf, weekdayNumbers,
  type CuratedPlanSummary, type CuratedPlanDetail,
} from '@ava/core/health/starters';
import { loadCuratedPlans, loadCuratedPlan, reportCuratedStart } from '../lib/curated-plans';
import { DateField } from './MiniDatePicker';
import type { HealthPlan } from '../lib/health-plans-store';
import type { HealthProfile } from '../lib/health-store';
import { t } from '../lib/i18n';

const ACCENT = 'var(--accent)';
const TEXT = '#cdd6f4';
const MUTED = '#585b70';
const BORDER = 'color-mix(in srgb, var(--accent) 14%, transparent)';

// Mirrors the extension's exactly. A one-day plan is a SINGLE SESSION, not a
// short plan and not an authoring mistake — it is a deliberate shape on the
// shelf, and labelling it "1 days" would read as a bug in the data.
function durationLabel(days: number): string {
  if (days === 1) return t('health.starters.single_session');
  if (days === 7) return t('health.starters.one_week');
  return `${days} ${t('health.starters.days')}`;
}

/** YYYY-MM-DD in LOCAL terms. NOT toISOString().slice(0,10) — that renders the
 *  instant in UTC, so local midnight comes back as yesterday east of Greenwich
 *  and the plan starts a day early. */
function localYmd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localYmd(d);
}

/** The next Monday strictly after today — "next Monday" on a Monday means the
 *  one coming, not this morning. */
function nextMonday(from: string): string {
  const d = new Date(`${from}T00:00:00`);
  const delta = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return localYmd(d);
}

export function StartersSheet({ profile, onStart, onClose, initialOpenId = null }: {
  profile: HealthProfile | null;
  /** Saves the copy. The caller owns persistence, which keeps the copy rules
   *  themselves pure. */
  onStart: (plan: HealthPlan) => void;
  onClose: () => void;
  /** Opened straight onto this template — a card on the shelf leads to the
   *  plan it shows, not back to a list of all of them. */
  initialOpenId?: string | null;
}) {
  const [plans, setPlans] = useState<CuratedPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [detail, setDetail] = useState<CuratedPlanDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    loadCuratedPlans()
      .then(setPlans)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    setDetailLoading(true);
    let cancelled = false;
    loadCuratedPlan(openId)
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [openId]);

  // Their stated goal first — NOT a filter. Somebody whose profile says muscle
  // gain should still see the recovery week, because the reason they need it
  // may be the reason they stopped training.
  const ordered = useMemo(
    () => orderForProfile(plans, profile?.goals?.primary ?? null),
    [plans, profile],
  );

  const open = openId && detail?.id === openId ? detail : null;

  const shell = (title: string, subtitle: string | null, body: React.ReactNode) => (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 580, maxHeight: 'min(800px, 90vh)', overflow: 'hidden', borderRadius: 16, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'linear-gradient(to bottom right, #0f0f17, #1a1625)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{title}</div>
            {subtitle && <div style={{ marginTop: 2, fontSize: 11, lineHeight: 1.5, color: MUTED }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ flexShrink: 0, height: 28, width: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>{body}</div>
      </div>
    </div>
  );

  // ── One template, in full ───────────────────────────────────────────────
  if (openId) {
    return shell(t('health.starters.title'), null, (
      <>
        <button type="button" onClick={() => setOpenId(null)}
          style={{ marginBottom: 12, border: 'none', background: 'transparent', padding: 0, fontSize: 11, color: MUTED, cursor: 'pointer' }}>
          ← {t('health.starters.back')}
        </button>

        <StarterDetailBody
          open={open}
          detailLoading={detailLoading}
          profile={profile}
          starting={starting}
          onStart={(placements) => {
            if (!open || starting) return;
            setStarting(true);
            const plan = planFromCurated(open, {
              id: `plan${Date.now()}${Math.floor(Math.random() * 1000)}`,
              startDate: placements[0]?.date ?? localYmd(new Date()),
              placements,
            });
            onStart(plan as unknown as HealthPlan);
            void reportCuratedStart(open.id);
            onClose();
          }}
        />
      </>
    ));
  }

  // ── The shelf ───────────────────────────────────────────────────────────
  return shell(t('health.starters.title'), t('health.starters.subtitle'), (
    loading ? (
      <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>{t('health.starters.loading')}</div>
    ) : error ? (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{t('health.starters.failed')}</p>
        <button type="button" onClick={load} style={{ marginTop: 8, border: 'none', background: 'transparent', fontSize: 11, color: ACCENT, cursor: 'pointer' }}>
          {t('health.starters.retry')}
        </button>
      </div>
    ) : !ordered.length ? (
      <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>{t('health.starters.empty')}</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ordered.map(p => (
          <button key={p.id} type="button" onClick={() => setOpenId(p.id)}
            style={{ display: 'flex', gap: 12, borderRadius: 10, border: `1px solid ${BORDER}`, background: 'rgba(12, 8, 20, 0.3)', padding: 12, textAlign: 'left', cursor: 'pointer' }}>
            {p.cover_image_url && (
              <img src={p.cover_image_url} alt="" style={{ height: 56, width: 56, flexShrink: 0, borderRadius: 8, objectFit: 'cover' }} />
            )}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12, color: TEXT }}>{p.title}</span>
              {p.summary && <span style={{ display: 'block', marginTop: 2, fontSize: 11, lineHeight: 1.5, color: MUTED }}>{p.summary}</span>}
              <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: MUTED }}>
                {[
                  durationLabel(p.duration_days),
                  p.days_per_week ? `${p.days_per_week}/wk` : null,
                  p.minutes_per_session ? `${p.minutes_per_session} ${t('health.starters.minutes')}` : null,
                ].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        ))}
      </div>
    )
  ));
}

/**
 * One ready-made plan, in full — the same content whether it appears in the
 * modal (the "New plan" flow) or in page (the room's Ready-made tab, where an
 * exercise appears the same way).
 *
 * Extracted rather than written twice: the copy note, the "not adapted" note,
 * the day list and the start picker are all decisions about what somebody is
 * agreeing to, and two copies is how one of them goes stale.
 */
export function StarterDetailBody({
  open, detailLoading, profile, starting, onStart,
}: {
  open: CuratedPlanDetail | null;
  detailLoading: boolean;
  profile: HealthProfile | null;
  starting: boolean;
  /** A date for every session, in template order. Rest is derived from the
   *  gaps, so it is not passed. */
  onStart: (placements: Array<{ day_index: number; date: string }>) => void;
}) {
  const today = localYmd(new Date());

  /** The days you actually DO something: training and active recovery. Plain
   *  rest is not placed — it is what the gaps between these already mean. */
  const sessions = useMemo(
    () => (open?.days ?? []).filter(d => d.kind !== 'rest'),
    [open],
  );

  /** date per template day_index, seeded from the profile's training days. */
  const [dates, setDates] = useState<Record<number, string>>({});
  /** Rows moved by hand. A later default must not shove these. */
  const [pinned, setPinned] = useState<Set<number>>(new Set());

  const weekdays = useMemo(
    () => weekdayNumbers(profile?.training?.training_days),
    [profile],
  );

  useEffect(() => {
    if (!sessions.length) return;
    setPinned(new Set());
    const seeded: Record<number, string> = {};
    let cursor = today;
    for (const d of sessions) {
      if (weekdays.length) {
        let guard = 0;
        while (guard < 14 && !weekdays.includes(new Date(`${cursor}T00:00:00`).getDay())) {
          cursor = addDays(cursor, 1);
          guard++;
        }
      }
      seeded[d.day_index] = cursor;
      cursor = addDays(cursor, 1);
    }
    setDates(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, sessions.length]);

  const setOne = (dayIndex: number, value: string) => {
    setPinned(prev => new Set(prev).add(dayIndex));
    setDates(prev => ({ ...prev, [dayIndex]: value }));
  };

  /** Shift everything not placed by hand, keeping the spacing. */
  const shiftTo = (firstDate: string) => {
    const first = sessions[0];
    if (!first) return;
    const oldFirst = dates[first.day_index];
    if (!oldFirst) return;
    const delta = Math.round(
      (new Date(`${firstDate}T00:00:00`).getTime() - new Date(`${oldFirst}T00:00:00`).getTime()) / 86400000,
    );
    if (!delta) return;
    setDates(prev => {
      const next = { ...prev };
      for (const d of sessions) {
        if (pinned.has(d.day_index) && d.day_index !== first.day_index) continue;
        const cur = prev[d.day_index];
        if (cur) next[d.day_index] = addDays(cur, delta);
      }
      return next;
    });
  };

  const chosen = sessions.map(d => dates[d.day_index]).filter(Boolean) as string[];
  const clash = new Set(chosen).size !== chosen.length;
  const sortedDates = [...chosen].sort();
  const spanDays = sortedDates.length
    ? Math.round((new Date(`${sortedDates[sortedDates.length - 1]}T00:00:00`).getTime() - new Date(`${sortedDates[0]}T00:00:00`).getTime()) / 86400000) + 1
    : 0;
  const shape = open ? shapeOf(open.days) : null;

  return (
    <>
      {!open ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>
          {detailLoading ? t('health.starters.loading') : t('health.starters.failed')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              durationLabel(open.duration_days),
              shape ? `${shape.training} ${t('health.starters.sessions')}` : null,
              shape && shape.rest > 0 ? `${shape.rest} ${t('health.starters.rest_days')}` : null,
              open.minutes_per_session ? `${open.minutes_per_session} ${t('health.starters.minutes')}` : null,
            ].filter(Boolean).map(bit => (
              <span key={bit as string} style={{ borderRadius: 999, border: `1px solid ${BORDER}`, padding: '2px 10px', fontSize: 10, color: MUTED }}>{bit}</span>
            ))}
          </div>

          {open.description && (
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: TEXT }}>{open.description}</p>
          )}

          <div>
            <div style={{ marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTED }}>{t('health.starters.equipment')}</div>
            <p style={{ margin: 0, fontSize: 12, color: TEXT }}>
              {open.equipment.length ? open.equipment.join(', ') : t('health.starters.no_equipment')}
            </p>
          </div>

          {/* The whole week, before the button. */}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {open.days.map(d => {
              const rest = (d.training?.length ?? 0) === 0;
              return (
                <li key={d.day_index} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, borderRadius: 8, border: `1px solid ${BORDER}`, padding: '8px 12px' }}>
                  <span style={{ minWidth: 0, fontSize: 12, color: TEXT }}>
                    {t('health.starters.day')} {d.day_index}{d.title ? ` — ${d.title}` : ''}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 11, color: rest ? MUTED : TEXT }}>
                    {rest ? t('health.starters.rest') : `${d.training.length} ${t('health.starters.exercises')}`}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Both said BEFORE the button. What starting does, and what it
              deliberately does not do. */}
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: MUTED }}>{t('health.starters.copy_note')}</p>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: MUTED }}>{t('health.starters.not_adapted')}</p>

          {/* Every session is yours to place. Rest is not a row: a rest day
              says "do not train", and the gaps between these dates already say
              it. What IS a row is anything you actually do — training and
              active recovery alike. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 8, border: `1px solid ${BORDER}`, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: MUTED }}>{t('health.starters.when')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
                {([
                  [today, t('health.starters.when_today')],
                  [addDays(today, 1), t('health.starters.when_tomorrow')],
                  [nextMonday(today), t('health.starters.when_next_monday')],
                ] as Array<[string, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => shiftTo(value)}
                    style={{
                      borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED,
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sessions.map((d, i) => (
                <li key={d.day_index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ minWidth: 0, fontSize: 12, color: TEXT }}>
                    <span style={{ color: MUTED }}>{t('health.starters.session_n', { n: i + 1 })}</span>
                    {d.title ? ` · ${d.title}` : ''}
                    {d.kind === 'active_recovery' && (
                      <span style={{ marginLeft: 6, borderRadius: 999, border: `1px solid ${BORDER}`, padding: '1px 6px', fontSize: 9, color: MUTED }}>
                        {t('health.starters.active_recovery')}
                      </span>
                    )}
                  </span>
                  <DateField value={dates[d.day_index] ?? null} onChange={(v) => v && setOne(d.day_index, v)} />
                </li>
              ))}
            </ul>

            {/* Where "3 sessions" becoming "runs 6 days" stops being a surprise
                after the fact. */}
            {spanDays > 0 && (
              <p style={{ margin: 0, fontSize: 10, lineHeight: 1.6, color: MUTED }}>
                {t('health.starters.runs_for', { days: spanDays, sessions: sessions.length })}
              </p>
            )}
            {clash && (
              <p style={{ margin: 0, fontSize: 10, lineHeight: 1.6, color: '#f38ba8' }}>{t('health.starters.same_day')}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onStart(sessions.map(d => ({ day_index: d.day_index, date: dates[d.day_index] })).filter(p => p.date))}
            disabled={starting || clash || chosen.length !== sessions.length}
            style={{ width: '100%', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '8px 12px', fontSize: 12, fontWeight: 500, color: ACCENT, cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.5 : 1 }}>
            {starting ? t('health.starters.starting') : t('health.starters.start')}
          </button>
        </div>
      )}
    </>
  );
}
