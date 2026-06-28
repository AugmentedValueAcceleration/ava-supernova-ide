import { useState } from 'react';
import { t, useLocale } from '../lib/i18n';
// Shared field registry — same source the sidecar saves from, so "what Ava
// asks", "what this card renders", and "where it saves" never drift. Pure data
// (no node deps), imported from the built core like the i18n strings.
import { HEALTH_PROFILE_FIELDS, humaniseSlug } from '../../../core/dist/health/profile-fields.js';
import { TimeField } from './TimeField';
import { CookingTimeGrid, type CookTime } from './CookingTimeGrid';

/**
 * Profile-field card for the IDE Health room — the structured "Ava fills your
 * profile" control. When Ava calls health_profile_ask({ field }), the room
 * renders this with the matching control (goal cards, equipment chips, a number
 * box), pre-selected from whatever's saved. The answer goes back through
 * getSidecar().confirm(id, true, JSON.stringify({ field, value })); the sidecar
 * saves it to ~/.ava general.json / health/profile.json and tells Ava what
 * landed. Mirror of the extension's ProfileFieldCard (inline-styled for the IDE).
 */

interface Props {
  field: string;
  question: string;
  currentValue?: unknown;
  onSubmit: (value: unknown) => void;
  onSkip: () => void;
}

const accent = 'var(--accent)';
const border = 'color-mix(in srgb, var(--accent) 25%, transparent)';

export function ProfileFieldCard({ field, question, currentValue, onSubmit, onSkip }: Props) {
  useLocale();
  const def = HEALTH_PROFILE_FIELDS[field];

  const [multi, setMulti] = useState<string[]>(Array.isArray(currentValue) ? currentValue.map(String) : []);
  const [text, setText] = useState<string>(
    def?.asArray && Array.isArray(currentValue) ? currentValue.join('\n')
    : currentValue != null && !Array.isArray(currentValue) && def?.control !== 'cooking_grid' ? String(currentValue) : '',
  );
  const [grid, setGrid] = useState<CookTime>(
    currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue) && (currentValue as CookTime).by_day
      ? (currentValue as CookTime)
      : { by_day: {} },
  );

  if (!def) {
    // Unknown field — fall back to a plain text answer so we never hang.
    return (
      <Shell question={question}>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} style={inputStyle} placeholder={t('health.fill.text_placeholder')} />
        <Actions onSave={() => onSubmit(text)} onSkip={onSkip} />
      </Shell>
    );
  }

  const optLabel = (o: { value: string; labelKey?: string }) => (o.labelKey ? t(o.labelKey) : humaniseSlug(o.value));
  const hasHints = !!def.options?.some((o) => o.hintKey);

  return (
    <Shell question={question} label={t(def.labelKey)}>
      {def.control === 'select' && (
        <div style={{ display: hasHints ? 'grid' : 'flex', gridTemplateColumns: hasHints ? '1fr 1fr' : undefined, flexWrap: hasHints ? undefined : 'wrap', gap: 8 }}>
          {(def.options ?? []).map((o) => {
            const active = currentValue === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onSubmit(o.value)}
                style={{
                  textAlign: 'left', borderRadius: 8, padding: 10, cursor: 'pointer',
                  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  border: `1px solid ${active ? accent : border}`,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: active ? accent : '#cdd6f4' }}>{optLabel(o)}</div>
                {o.hintKey && <div style={{ marginTop: 2, fontSize: 10, lineHeight: 1.4, color: '#8b8398' }}>{t(o.hintKey)}</div>}
              </button>
            );
          })}
        </div>
      )}

      {def.control === 'multiselect' && (
        <>
          <div style={{ fontSize: 10, color: '#8b8398', marginBottom: 6 }}>{t('health.fill.multi_hint')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(def.options ?? []).map((o) => {
              const on = multi.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setMulti((cur) => (on ? cur.filter((v) => v !== o.value) : [...cur, o.value]))}
                  style={{
                    borderRadius: 999, padding: '5px 11px', fontSize: 11, cursor: 'pointer',
                    background: on ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
                    border: `1px solid ${on ? accent : border}`,
                    color: on ? accent : '#a6adc8',
                  }}
                >
                  {optLabel(o)}
                </button>
              );
            })}
          </div>
          <Actions onSave={() => onSubmit(multi)} onSkip={onSkip} />
        </>
      )}

      {def.control === 'cooking_grid' && (
        <>
          <div style={{ fontSize: 10, color: '#8b8398', marginBottom: 8 }}>{t('health.fill.cooking_grid_hint')}</div>
          <CookingTimeGrid value={grid} onChange={setGrid} />
          <Actions onSave={() => onSubmit(grid)} onSkip={onSkip} />
        </>
      )}

      {def.control === 'number' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" inputMode="numeric" autoFocus value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) onSubmit(text.trim()); }}
              style={{ ...inputStyle, width: 110 }}
            />
            {def.unit && <span style={{ fontSize: 12, color: '#8b8398' }}>{def.unit}</span>}
          </div>
          <Actions onSave={() => onSubmit(text.trim())} onSkip={onSkip} disabled={!text.trim()} />
        </>
      )}

      {def.control === 'time' && (
        <>
          <TimeField value={text || null} onChange={(v) => setText(v ?? '')} />
          <Actions onSave={() => onSubmit(text)} onSkip={onSkip} disabled={!text} />
        </>
      )}

      {def.control === 'date' && (
        <>
          <input type="date" value={text} onChange={(e) => setText(e.target.value)} style={inputStyle} />
          <Actions onSave={() => onSubmit(text)} onSkip={onSkip} disabled={!text} />
        </>
      )}

      {def.control === 'text' && (
        <>
          {def.multiline ? (
            <textarea
              autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={field === 'injuries' ? t('health.fill.injuries_placeholder') : t('health.fill.text_placeholder')}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          ) : (
            <input
              autoFocus value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(text); }}
              placeholder={t('health.fill.text_placeholder')} style={inputStyle}
            />
          )}
          <Actions onSave={() => onSubmit(text)} onSkip={onSkip} />
        </>
      )}
    </Shell>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', borderRadius: 8, border: `1px solid ${border}`, background: 'rgba(26,16,40,0.5)',
  color: '#cdd6f4', padding: '8px 11px', fontSize: 13, outline: 'none',
};

function Shell({ question, label, children }: { question: string; label?: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 12, border: `1px solid ${accent}66`, overflow: 'hidden', background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px' }}>
        <span style={{ fontSize: 13 }}>🧩</span>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8b8398' }}>
          {label ?? t('health.fill.field.goal')}
        </span>
      </div>
      {question && <div style={{ padding: '0 14px 8px', fontSize: 13, color: '#cdd6f4' }}>{question}</div>}
      <div style={{ padding: '0 14px 14px' }}>{children}</div>
    </div>
  );
}

function Actions({ onSave, onSkip, disabled }: { onSave: () => void; onSkip: () => void; disabled?: boolean }) {
  useLocale();
  return (
    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button" disabled={disabled} onClick={onSave}
        style={{ borderRadius: 8, border: 'none', background: disabled ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : accent, color: '#fff', padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer' }}
      >
        {t('health.fill.save')}
      </button>
      <button
        type="button" onClick={onSkip}
        style={{ borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: '#a6adc8', padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
      >
        {t('health.fill.skip')}
      </button>
    </div>
  );
}
