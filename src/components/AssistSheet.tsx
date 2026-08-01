// ─── Ask Ava — help with THIS day ───────────────────────────────────────────
//
// The hybrid the whole builder is for. Not "AI writes it all", not "you are on
// your own": you drive, and Ava is there for exactly the parts you want.
//
// Three rules shape this screen, and they are the reason it is not just a
// prompt box:
//
//   1. It PROPOSES. Nothing is saved until you accept. The current day is shown
//      beside the suggestion so you can see precisely what changed before it
//      touches your work.
//   2. It says what it did, in a sentence. A change you cannot see the
//      reasoning for is a change you cannot trust.
//   3. It is honest about the wait. This takes the better part of a minute, so
//      the screen says so rather than showing a spinner and hoping.

import { useState } from 'react';
import type { HealthPlan, HealthPlanDay, HealthPlanType } from '../lib/health-plans-store';
import type { HealthProfile } from '../lib/health-store';
import { getPlatformKey } from '../lib/api';
import { t } from '../lib/i18n';

const ACCENT = 'var(--accent)';
const TEXT = '#cdd6f4';
const MUTED = '#585b70';
const AMBER = '#fbbf24';
const RED = '#f38ba8';
const BORDER = 'color-mix(in srgb, var(--accent) 14%, transparent)';

/** Openers for the things people actually want, so nobody faces a blank box.
 *  Each is a real sentence they can then edit, not a mode. */
const PROMPTS: Array<{ key: string; forType: HealthPlanType[] }> = [
  { key: 'fill', forType: ['fitness', 'meal', 'combined'] },
  { key: 'finisher', forType: ['fitness', 'combined'] },
  { key: 'warmup', forType: ['fitness', 'combined'] },
  { key: 'easier', forType: ['fitness', 'combined'] },
  { key: 'protein', forType: ['meal', 'combined'] },
  { key: 'quicker', forType: ['meal', 'combined'] },
];

/** The calendar date a plan day falls on, or null for a plan that has not
 *  started. Day 1 IS the start date; day_index is 1-based. Exact, not assumed —
 *  it is what lets the server use that weekday's real cooking ceiling. */
export function dayDate(plan: HealthPlan, day: HealthPlanDay): string | null {
  if (!plan.start_date) return null;
  const start = Date.parse(`${plan.start_date}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  return new Date(start + (day.day_index - 1) * 86_400_000).toISOString().slice(0, 10);
}

export interface DayProposal {
  day: HealthPlanDay;
  note: string;
  credits: number;
  unverifiable: string[];
}

/**
 * Ask the platform for a proposed day.
 *
 * Mirrors the extension's `generate_health_day`: a platform account spends
 * credits, and a BYOK key spends nothing but must be sent, because without
 * either there is nothing to run the request on and saying so up front beats a
 * server round-trip that fails.
 *
 * It PROPOSES — the reply is a day the operator accepts or discards, never a
 * write.
 */
export async function askForDay(opts: {
  plan: HealthPlan;
  day: HealthPlanDay;
  profile: HealthProfile | null;
  instruction: string;
  byokKey?: string | null;
}): Promise<DayProposal> {
  const platformKey = getPlatformKey();
  const byokKey = opts.byokKey ?? null;
  if (!platformKey && !byokKey) {
    throw new Error(t('health.assist.needs_account'));
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (platformKey) headers.Authorization = `Bearer ${platformKey}`;
  if (!platformKey && byokKey) headers['X-BYOK-Key'] = byokKey;

  const res = await fetch('https://avasupernova.com/api/health/generate/day', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: opts.plan.type,
      goal: opts.plan.goal,
      profile: opts.profile,
      day: opts.day,
      week: Math.floor((opts.day.day_index - 1) / 7) + 1,
      instruction: opts.instruction,
      date: dayDate(opts.plan, opts.day),
      ...(byokKey && !platformKey ? { providerApiKey: byokKey } : {}),
    }),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    // Keep `detail`. The route puts a friendly line in error and the real
    // cause in detail; reading only error is what made a night of failures
    // undiagnosable on the other surface.
    const d = data as { error?: string; detail?: string };
    throw new Error([d.error || `HTTP ${res.status}`, d.detail].filter(Boolean).join(' — '));
  }
  const d = data as { day?: HealthPlanDay; note?: string; credits_charged?: number; unverifiable_allergens?: string[] };
  if (!d.day) throw new Error(`HTTP ${res.status}`);
  return {
    day: d.day,
    note: d.note ?? '',
    credits: d.credits_charged ?? 0,
    unverifiable: d.unverifiable_allergens ?? [],
  };
}

export function AssistSheet({ plan, day, busy, error, proposal, onAsk, onApply, onDiscard, onClose }: {
  plan: HealthPlan;
  day: HealthPlanDay;
  busy: boolean;
  error: string | null;
  proposal: DayProposal | null;
  onAsk: (instruction: string) => void;
  onApply: (day: HealthPlanDay) => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState('');
  const prompts = PROMPTS.filter(p => p.forType.includes(plan.type));

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onAsk(trimmed);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 660, maxHeight: 'min(800px, 90vh)', overflow: 'hidden', borderRadius: 16, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'linear-gradient(to bottom right, #0f0f17, #1a1625)' }}>

        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{t('health.assist.title')}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>{day.title ?? t('health.plans.day_n', { n: day.day_index })}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ flexShrink: 0, height: 28, width: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {proposal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* What she did, in her own sentence, above the diff. */}
              {proposal.note && (
                <p style={{ margin: 0, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', padding: '8px 12px', fontSize: 12, lineHeight: 1.6, color: TEXT }}>
                  {proposal.note}
                </p>
              )}

              {/* Side by side, so nothing changes that you did not see change. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <DayColumn label={t('health.assist.current')} day={day} />
                <DayColumn label={t('health.assist.proposed')} day={proposal.day} highlight />
              </div>

              {/* Absence of evidence, said as such. These were NOT cleared — the
                  library simply holds nothing either way, and saying nothing
                  would let a day look checked when it was only unchecked. */}
              {proposal.unverifiable.length > 0 && (
                <div style={{ borderRadius: 8, border: `1px solid color-mix(in srgb, ${AMBER} 25%, transparent)`, background: `color-mix(in srgb, ${AMBER} 6%, transparent)`, padding: '8px 12px' }}>
                  <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: AMBER }}>{t('health.assist.unverifiable')}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: TEXT }}>{proposal.unverifiable.join(', ')}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => { onApply(proposal.day); onClose(); }}
                  style={{ flex: 1, borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '8px 12px', fontSize: 12, fontWeight: 500, color: ACCENT, cursor: 'pointer' }}>
                  {t('health.assist.accept')}
                </button>
                <button type="button" onClick={onDiscard}
                  style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', padding: '8px 12px', fontSize: 12, color: MUTED, cursor: 'pointer' }}>
                  {t('health.assist.discard')}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {prompts.map(p => (
                  <button key={p.key} type="button" disabled={busy}
                    onClick={() => { const s = t(`health.assist.prompt.${p.key}`); setInstruction(s); ask(s); }}
                    style={{ borderRadius: 999, border: `1px solid ${BORDER}`, background: 'transparent', padding: '4px 12px', fontSize: 11, color: MUTED, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.4 : 1 }}>
                    {t(`health.assist.prompt.${p.key}`)}
                  </button>
                ))}
              </div>

              <textarea rows={3} value={instruction} onChange={e => setInstruction(e.target.value)}
                placeholder={t('health.assist.placeholder')} disabled={busy}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'rgba(12, 8, 20, 0.5)', padding: '8px 12px', fontSize: 12, fontFamily: 'inherit', color: TEXT, outline: 'none', opacity: busy ? 0.5 : 1 }} />

              {error && (
                <p style={{ margin: 0, borderRadius: 8, border: `1px solid color-mix(in srgb, ${RED} 25%, transparent)`, background: `color-mix(in srgb, ${RED} 5%, transparent)`, padding: '8px 12px', fontSize: 11, lineHeight: 1.6, color: RED }}>
                  {t('health.assist.failed')} {error}
                </p>
              )}

              {/* Said plainly rather than implied by a spinner. */}
              {busy && <p style={{ margin: 0, fontSize: 11, color: MUTED }}>{t('health.assist.working')}</p>}

              <button type="button" onClick={() => ask(instruction)} disabled={busy || !instruction.trim()}
                style={{
                  width: '100%', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)', padding: '8px 12px',
                  fontSize: 12, fontWeight: 500, color: ACCENT,
                  cursor: busy || !instruction.trim() ? 'default' : 'pointer',
                  opacity: busy || !instruction.trim() ? 0.4 : 1,
                }}>
                {t('health.assist.ask')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DayColumn({ label, day, highlight }: { label: string; day: HealthPlanDay; highlight?: boolean }) {
  const empty = day.training.length === 0 && day.meals.length === 0;
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${highlight ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : BORDER}`, background: highlight ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'transparent', padding: '10px 12px' }}>
      <div style={{ marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: highlight ? ACCENT : MUTED }}>{label}</div>
      {empty ? (
        <p style={{ margin: 0, fontSize: 11, fontStyle: 'italic', color: MUTED }}>{t('health.assist.empty_day')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {day.training.map(ex => (
            <div key={ex.id} style={{ fontSize: 11, color: TEXT }}>
              {ex.name}
              {(ex.sets != null || ex.reps) && (
                <span style={{ color: MUTED }}> · {[ex.sets != null ? `${ex.sets}×` : '', ex.reps ?? ''].join('')}</span>
              )}
            </div>
          ))}
          {day.meals.map(m => (
            <div key={m.id} style={{ fontSize: 11, color: TEXT }}>
              {m.name}
              <span style={{ color: MUTED }}> · {m.slot}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
