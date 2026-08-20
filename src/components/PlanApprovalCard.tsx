/**
 * The plan card — the IDE's half of a decision the extension could already make.
 *
 * `present_plan` carries an `alternatives` array so Ava can offer real choices,
 * and the extension has rendered them as selectable options for a long time.
 * The IDE had no plan card at all: `present_plan` fell through to the generic
 * permission banner, which shows the tool name, a raw-args dropdown and a
 * one-line comment box. So on this surface the choice was never presented.
 *
 * Seen live 2026-08-19 on a real project. Ava proposed "all eleven tasks" or
 * "a minimal four-task core loop first", recommended the second, and asked
 * which the operator wanted. He never got asked — the card had nowhere to put
 * the question — and eleven tasks were dispatched. His words: "we should get a
 * prompt to decide on those options we never got to decide so i guess it also
 * means improving our decision".
 *
 * Two rules this card exists to enforce:
 *
 *   1. If she offered approaches, ONE MUST BE CHOSEN. Approve stays disabled
 *      until it is. A plan offering alternatives is asking a question, and
 *      approving without answering leaves her to pick for you or to splice
 *      them together — which is exactly what it looked like from outside.
 *
 *   2. A note can always be added. The choice is rarely the whole of what
 *      you want to say about it, and it rides along on a rejection too, so
 *      "no" can carry its reason.
 *
 * The result string is built by core's `formatPlanDecision` in the sidecar, not
 * here, so this surface and the extension say the same thing to Ava.
 */
import { useState } from 'react';
import { t } from '../lib/i18n';

interface PlanStep {
  description?: string;
  files?: string[];
  notes?: string;
}

interface PlanAlternative {
  label: string;
  description: string;
}

export interface PlanApprovalCardProps {
  args: Record<string, unknown>;
  /** Approve, carrying the chosen approach and any note. */
  onApprove: (decision: { selection?: string; note?: string }) => void;
  /** Reject, carrying the note as the reason if one was typed. */
  onReject: (note?: string) => void;
}

const ACCENT = 'var(--accent, #a855f7)';
const PANEL = 'rgba(10, 6, 18, 0.6)';

const CONFIDENCE: Record<string, { color: string; bg: string; icon: string }> = {
  high:   { color: '#4caf50', bg: 'rgba(76,175,80,0.12)',  icon: '✔' },
  medium: { color: '#ff9800', bg: 'rgba(255,152,0,0.12)',  icon: '◆' },
  low:    { color: '#f44336', bg: 'rgba(244,67,54,0.12)',  icon: '⚠' },
};

/** Last two path segments — a full repo path swamps the step it belongs to. */
function shortenPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length <= 2 ? p : parts.slice(-2).join('/');
}

export function PlanApprovalCard({ args, onApprove, onReject }: PlanApprovalCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const title = typeof args.title === 'string' ? args.title : t('plan.unavailable');
  const goal = typeof args.goal === 'string' ? args.goal : '';
  const verification = typeof args.verification === 'string' ? args.verification : '';
  const confidence = typeof args.confidence === 'string' ? args.confidence : '';
  const steps: PlanStep[] = Array.isArray(args.steps) ? (args.steps as PlanStep[]) : [];
  const alternatives: PlanAlternative[] = Array.isArray(args.alternatives)
    ? (args.alternatives as PlanAlternative[]).filter((a) => a && typeof a.label === 'string')
    : [];

  // Rule 1. No choice offered, no choice needed — a plan with a single path is
  // approved the way it always was.
  const needsChoice = alternatives.length > 0;
  const canApprove = !needsChoice || selected !== null;

  const conf = CONFIDENCE[confidence];

  return (
    <div style={{
      margin: '0 16px', padding: '14px 18px',
      background: 'rgba(26, 16, 40, 0.6)',
      border: `1px solid color-mix(in srgb, ${ACCENT} 30%, transparent)`,
      borderRadius: 10, borderBottom: 'none',
      borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
      maxHeight: '58vh', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: ACCENT,
          animation: 'avaPulse 1.5s infinite', flexShrink: 0, marginTop: 6,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: '#cdd6f4', fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>
            {steps.length} {t('plan.steps')}
          </div>
        </div>
        {conf && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 10,
            background: conf.bg, color: conf.color, flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            {conf.icon} {t(`plan.confidence.${confidence}`)}
          </span>
        )}
      </div>

      {/* Goal */}
      {goal && (
        <div style={{ marginBottom: 10 }}>
          <div style={LABEL}>{t('plan.goal')}</div>
          <div style={{ fontSize: 12.5, color: '#bac2de', lineHeight: 1.55 }}>{goal}</div>
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div style={{
          padding: '10px 12px', background: PANEL, borderRadius: 8, marginBottom: 10,
          border: `1px solid color-mix(in srgb, ${ACCENT} 18%, transparent)`,
        }}>
          <div style={LABEL}>{t('plan.steps')}</div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {steps.map((step, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, marginBottom: i === steps.length - 1 ? 0 : 8 }}>
                <span style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, marginTop: 1,
                  background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT,
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#bac2de', lineHeight: 1.5 }}>{step.description}</div>
                  {Array.isArray(step.files) && step.files.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                      {step.files.map((f) => (
                        <span key={f} title={f} style={{
                          fontSize: 10, fontFamily: 'monospace', color: '#f5c2e7',
                          background: 'rgba(245,194,231,0.08)', padding: '1px 6px', borderRadius: 4,
                        }}>
                          {shortenPath(f)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Verification */}
      {verification && (
        <div style={{ marginBottom: 10 }}>
          <div style={LABEL}>{t('plan.verification')}</div>
          <div style={{ fontSize: 11.5, color: '#9399b2', lineHeight: 1.5 }}>{verification}</div>
        </div>
      )}

      {/* Rule 1 — the approaches, and the reason Approve is still greyed out. */}
      {needsChoice && (
        <div style={{ marginBottom: 10 }}>
          <div style={LABEL}>
            {t('plan.approaches')}
            <span style={{ color: ACCENT, opacity: 0.9, textTransform: 'none', letterSpacing: 0 }}>
              {' — '}{t('plan.choose_first')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alternatives.map((alt) => {
              const on = selected === alt.label;
              return (
                <button
                  key={alt.label}
                  onClick={() => setSelected(on ? null : alt.label)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 8,
                    cursor: 'pointer', color: '#cdd6f4',
                    background: on ? `color-mix(in srgb, ${ACCENT} 8%, transparent)` : 'transparent',
                    border: `1px solid ${on ? ACCENT : `color-mix(in srgb, ${ACCENT} 14%, transparent)`}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      flexShrink: 0, width: 13, height: 13, borderRadius: '50%',
                      border: `2px solid ${on ? ACCENT : 'rgba(255,255,255,0.2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {on && <span style={{ width: 5, height: 5, borderRadius: '50%', background: ACCENT }} />}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{alt.label}</span>
                  </div>
                  <div style={{ marginLeft: 21, marginTop: 3, fontSize: 11, color: '#9399b2', lineHeight: 1.5 }}>
                    {alt.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rule 2 — a note, on approval or on rejection. */}
      <div style={{ marginBottom: 10 }}>
        <div style={LABEL}>{t('plan.note')}</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={t('plan.note_placeholder')}
          style={{
            width: '100%', padding: '7px 10px', background: 'rgba(10, 6, 18, 0.8)',
            border: `1px solid color-mix(in srgb, ${ACCENT} 12%, transparent)`,
            borderRadius: 6, color: '#cdd6f4', fontSize: 12, outline: 'none',
            resize: 'vertical', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => canApprove && onApprove({
            selection: selected ?? undefined,
            note: note.trim() || undefined,
          })}
          disabled={!canApprove}
          title={canApprove ? undefined : t('plan.choose_first')}
          style={{
            padding: '6px 18px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
            background: canApprove ? ACCENT : `color-mix(in srgb, ${ACCENT} 18%, transparent)`,
            color: canApprove ? '#fff' : '#6c7086',
            cursor: canApprove ? 'pointer' : 'not-allowed',
          }}
        >
          {t('plan.approve')}
        </button>
        <button
          onClick={() => onReject(note.trim() || undefined)}
          style={{
            padding: '6px 16px', background: 'transparent', border: '1px solid #45475a',
            borderRadius: 6, color: '#9399b2', fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}
        >
          {t('plan.reject')}
        </button>
        {needsChoice && !canApprove && (
          <span style={{ fontSize: 11, color: ACCENT, opacity: 0.8 }}>
            {t('plan.choose_first')}
          </span>
        )}
      </div>
    </div>
  );
}

const LABEL: React.CSSProperties = {
  fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.7,
  color: '#6c7086', marginBottom: 5,
};
