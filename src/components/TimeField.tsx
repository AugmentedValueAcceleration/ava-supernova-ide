import { useState, useRef, useEffect } from 'react';
import { t, useLocale } from '../lib/i18n';

/**
 * Custom time picker for the IDE — replaces the raw <input type="time"> (which
 * renders as basic browser chrome) with our own hour:minute dropdown so the
 * health profile schedule and Ava's profile-fill time cards match the app.
 * Value is 24h "HH:MM" or null. 5-minute steps, with any off-step saved minute
 * kept selectable.
 */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const accent = 'var(--accent)';
const border = 'color-mix(in srgb, var(--accent) 25%, transparent)';

export function TimeField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const [h, m] = value && value.includes(':') ? value.split(':') : ['', ''];
  const minOpts = m && !MINS.includes(m) ? [...MINS, m].sort() : MINS;
  const set = (nh: string, nm: string) => onChange(`${nh || '00'}:${nm || '00'}`);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
          borderRadius: 8, border: `1px solid ${border}`, background: 'rgba(26,16,40,0.5)',
          color: value ? '#cdd6f4' : '#6c7086', padding: '7px 11px', fontSize: 13, cursor: 'pointer',
        }}
      >
        <span>{value || t('health.fill.time_any')}</span>
        <span style={{ opacity: 0.6, fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 60, marginTop: 4, display: 'flex', gap: 4,
          borderRadius: 10, border: `1px solid ${border}`, background: '#1a1028', padding: 6,
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        }}>
          <Col items={HOURS} sel={h} onPick={(v) => set(v, m || '00')} />
          <Col items={minOpts} sel={m} onPick={(v) => set(h || '00', v)} />
        </div>
      )}
    </div>
  );
}

function Col({ items, sel, onPick }: { items: string[]; sel: string; onPick: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 184, overflowY: 'auto', width: 52, scrollbarWidth: 'thin' }}>
      {items.map((it) => {
        const on = it === sel;
        return (
          <button
            key={it}
            type="button"
            onClick={() => onPick(it)}
            style={{
              borderRadius: 6, border: 'none', padding: '5px 0', fontSize: 12, cursor: 'pointer', textAlign: 'center',
              background: on ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
              color: on ? accent : '#a6adc8', fontWeight: on ? 600 : 400,
            }}
          >
            {it}
          </button>
        );
      })}
    </div>
  );
}
