// Log a training session after the fact.
//
// The IDE mirror of the extension's LogSessionSheet — same behaviour, none of
// the markup, because this surface is inline-style React and that one is
// Tailwind.
//
// Two rules shape the whole thing:
//
//   Pre-fill from the plan's targets, so the common case — did it as written —
//   is a few clicks and only the DIFFERENCES need typing. A log that is work to
//   fill in is a log nobody fills in.
//
//   Skipping must be exactly as easy as logging. Blank means unrecorded and
//   skipped means skipped; they are different facts and everything downstream
//   depends on telling them apart. If skipping is buried, people leave the row
//   blank instead and the distinction is lost at the source.
//
// One difference from the extension, deliberate: skipped is written to the
// typed `state` field, not the legacy `notes === 'skipped'` magic string. Core's
// summariser reads `state` first and falls back to the string for old records,
// so this is the forward path and the extension's sheet is the one still to
// move.

import { useMemo, useState } from 'react';
import { freshGymSession, gymExerciseFromPlan, newGymItemId, type GymSession, type GymExercise, type GymSet } from '@ava/core/health/session-types';
import type { HealthPlanDay } from '../lib/health-plans-store';
import { t } from '../lib/i18n';

const ACCENT = 'var(--accent)';
const TEXT = '#cdd6f4';
const MUTED = '#585b70';
const AMBER = '#fbbf24';
const BORDER = 'color-mix(in srgb, var(--accent) 14%, transparent)';

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box', padding: '4px 8px', fontSize: 11,
  background: 'rgba(12, 8, 20, 0.5)', color: TEXT,
  border: `1px solid ${BORDER}`, borderRadius: 4, outline: 'none', colorScheme: 'dark',
};

function num(v: string): number | null {
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Seed the session from the plan's targets so the common case — did it as
 *  written — is a single click, and only the differences need typing. */
export function seedFrom(day: HealthPlanDay, planId: string | null, date: string): GymSession {
  return {
    ...freshGymSession({
      date,
      source: planId ? 'plan' : 'freestyle',
      title: day.title,
      plan_id: planId,
      day_index: day.day_index,
    }),
    status: 'in-progress',
    exercises: day.training.map(gymExerciseFromPlan),
  };
}

export function LogSessionSheet({ day, planId, date, existing, onSave, onClose }: {
  day: HealthPlanDay;
  planId: string | null;
  date: string;
  /** A session already logged for this day, reopened for editing. */
  existing: GymSession | null;
  onSave: (session: GymSession) => void;
  onClose: () => void;
}) {
  const [session, setSession] = useState<GymSession>(() => existing ?? seedFrom(day, planId, date));
  const [saved, setSaved] = useState(false);

  const patchExercise = (id: string, next: Partial<GymExercise>) =>
    setSession(s => ({ ...s, exercises: s.exercises.map(e => (e.id === id ? { ...e, ...next } : e)) }));

  const addSet = (ex: GymExercise) => {
    const last = ex.sets[ex.sets.length - 1];
    patchExercise(ex.id, {
      sets: [...ex.sets, {
        id: newGymItemId('set'),
        // Carry the previous set forward — the second set of five is usually
        // the same as the first, and retyping it is the friction that stops
        // people logging at all.
        weight: last?.weight ?? null,
        reps: last?.reps ?? (ex.target_reps && /^\d+$/.test(ex.target_reps) ? Number(ex.target_reps) : null),
        rpe: null,
        notes: null,
        completed_at: new Date().toISOString(),
      } as GymSet],
    });
  };

  const patchSet = (ex: GymExercise, setId: string, next: Partial<GymSet>) =>
    patchExercise(ex.id, { sets: ex.sets.map(s => (s.id === setId ? { ...s, ...next } : s)) });

  const removeSet = (ex: GymExercise, setId: string) =>
    patchExercise(ex.id, { sets: ex.sets.filter(s => s.id !== setId) });

  /** Skipped is an explicit fact, not an empty row. Toggling it off restores
   *  the sets rather than discarding them — a mis-tap that destroys typing is
   *  how a log stops being trusted. */
  const toggleSkipped = (ex: GymExercise) => {
    const skipped = ex.state === 'skipped';
    patchExercise(ex.id, { state: skipped ? null : 'skipped', sets: skipped ? ex.sets : [] });
  };

  const loggedCount = useMemo(
    () => session.exercises.filter(e => e.sets.length > 0 || e.state === 'done').length,
    [session.exercises],
  );

  const save = () => {
    const now = new Date().toISOString();
    const anyLogged = session.exercises.some(e => e.sets.length > 0 || e.state === 'done');
    const anySkipped = session.exercises.some(e => e.state === 'skipped');
    onSave({
      ...session,
      // Only a session with something in it counts as completed. One where
      // everything was skipped is 'skipped', and one nobody touched stays
      // in-progress rather than claiming to be a finished workout.
      status: anyLogged ? 'completed' : anySkipped ? 'skipped' : 'in-progress',
      completed_at: anyLogged ? now : null,
      updated_at: now,
    });
    setSaved(true);
    setTimeout(onClose, 500);
  };

  const empty = !day.training.length;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 560, maxHeight: 'min(760px, 88vh)', overflow: 'hidden', borderRadius: 16, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'linear-gradient(to bottom right, #0f0f17, #1a1625)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{t('health.log.title')}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>{day.title ?? date}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ flexShrink: 0, height: 28, width: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {empty ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>{t('health.log.nothing')}</div>
          ) : (
            <>
              <p style={{ margin: '0 0 12px', fontSize: 11, lineHeight: 1.6, color: MUTED }}>{t('health.log.prefill_note')}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {session.exercises.map(ex => {
                  const skipped = ex.state === 'skipped';
                  const target = [
                    ex.target_sets != null ? `${ex.target_sets}×${ex.target_reps ?? '?'}` : ex.target_reps,
                    ex.target_weight,
                  ].filter(Boolean).join(' · ');
                  return (
                    <div key={ex.id} style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: skipped ? 'transparent' : 'rgba(12, 8, 20, 0.3)', padding: '10px 12px', opacity: skipped ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: skipped ? MUTED : TEXT, textDecoration: skipped ? 'line-through' : 'none' }}>{ex.name}</div>
                          {target && <div style={{ marginTop: 2, fontSize: 10, color: MUTED }}>{target} {t('health.log.planned')}</div>}
                        </div>
                        {/* As easy as logging — see the note at the top of this file. */}
                        <button type="button" onClick={() => toggleSkipped(ex)}
                          style={{
                            flexShrink: 0, borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 500, cursor: 'pointer',
                            background: skipped ? 'color-mix(in srgb, #fbbf24 12%, transparent)' : 'transparent',
                            color: skipped ? AMBER : MUTED,
                            border: `1px solid ${skipped ? AMBER : BORDER}`,
                          }}>
                          {t('health.log.skipped')}
                        </button>
                      </div>

                      {!skipped && (
                        <>
                          {ex.sets.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {ex.sets.map((s, i) => (
                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ width: 14, flexShrink: 0, fontSize: 10, fontVariantNumeric: 'tabular-nums', color: MUTED }}>{i + 1}</span>
                                  <input inputMode="decimal" value={s.weight ?? ''} placeholder="—"
                                    onChange={e => patchSet(ex, s.id, { weight: num(e.target.value) })}
                                    style={{ ...inputStyle, width: 64 }} />
                                  <span style={{ fontSize: 10, color: MUTED }}>{t('health.log.weight')}</span>
                                  <input inputMode="numeric" value={s.reps ?? ''} placeholder="—"
                                    onChange={e => patchSet(ex, s.id, { reps: num(e.target.value) })}
                                    style={{ ...inputStyle, width: 56 }} />
                                  <span style={{ fontSize: 10, color: MUTED }}>{t('health.log.reps')}</span>
                                  <button type="button" onClick={() => removeSet(ex, s.id)} title={t('health.log.remove_set')}
                                    style={{ marginLeft: 'auto', border: 'none', background: 'transparent', padding: '0 4px', color: MUTED, cursor: 'pointer', fontSize: 14 }}>×</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button type="button" onClick={() => addSet(ex)}
                            style={{ marginTop: 8, borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', padding: '4px 10px', fontSize: 10, fontWeight: 500, color: ACCENT, cursor: 'pointer' }}>
                            + {t('health.log.add_set')}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTED }}>{t('health.log.notes')}</div>
                <textarea rows={2} value={session.notes ?? ''}
                  onChange={e => setSession(s => ({ ...s, notes: e.target.value || null }))}
                  placeholder={t('health.log.notes_placeholder')}
                  style={{ ...inputStyle, width: '100%', padding: '8px 12px', fontSize: 12, borderRadius: 8, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              <p style={{ margin: '12px 0 0', fontSize: 10, lineHeight: 1.6, color: MUTED }}>{t('health.log.skipped_hint')}</p>
            </>
          )}
        </div>

        {!empty && (
          <div style={{ padding: 16, borderTop: `1px solid ${BORDER}` }}>
            <button type="button" onClick={save} disabled={saved}
              style={{
                width: '100%', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 500,
                border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                color: ACCENT, cursor: saved ? 'default' : 'pointer', opacity: saved ? 0.5 : 1,
              }}>
              {saved ? t('health.log.saved') : `${t('health.log.save')}${loggedCount ? ` · ${loggedCount} ${t('health.log.logged_count')}` : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
