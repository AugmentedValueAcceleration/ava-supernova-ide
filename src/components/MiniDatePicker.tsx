import React, { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';

/**
 * A compact, dark-themed month calendar mirroring the sidebar calendar look so
 * date pickers across the IDE share one design instead of falling back to the
 * native (light) browser date input. Year nav (« ») makes far-back dates such
 * as a date of birth reachable without month-by-month stepping.
 */

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function MiniDatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });

  const todayStr = new Date().toISOString().slice(0, 10);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const label = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const step = (delta: number) => setView(v => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const stepYear = (delta: number) => setView(v => ({ y: v.y + delta, m: v.m }));

  const navBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', padding: '0 4px', lineHeight: 1 };

  return (
    <div style={{ width: 224, padding: 12, borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', background: '#15101f', boxShadow: '0 18px 40px rgba(0,0,0,0.55)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={() => stepYear(-1)} title={t('ide.datepicker.prev_year')} style={{ ...navBtn, fontSize: 13 }}>{'«'}</button>
          <button onClick={() => step(-1)} title={t('ide.datepicker.prev_month')} style={{ ...navBtn, fontSize: 11 }}>{'‹'}</button>
        </span>
        <span style={{ fontSize: 11, fontWeight: 500, color: '#a6adc8' }}>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <button onClick={() => step(1)} title={t('ide.datepicker.next_month')} style={{ ...navBtn, fontSize: 11 }}>{'›'}</button>
          <button onClick={() => stepYear(1)} title={t('ide.datepicker.next_year')} style={{ ...navBtn, fontSize: 13 }}>{'»'}</button>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center', marginBottom: 4 }}>
        {DOW.map((d, i) => <span key={i} style={{ fontSize: 9, color: '#6c7086' }}>{d}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {days.map(day => {
          const iso = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = iso === todayStr;
          const isSelected = iso === value;
          return (
            <button
              key={day}
              onClick={() => onChange(iso)}
              style={{
                width: 24, height: 24, margin: '0 auto', borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isSelected ? 'var(--accent)' : isToday ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'transparent',
                color: isSelected ? '#fff' : isToday ? 'var(--accent)' : '#a6adc8',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Themed date field: a button showing the picked date (or "—") that opens the
 * MiniDatePicker popover. Drop-in replacement for `<input type="date">`.
 */
export function DateField({ value, onChange, style }: { value: string | null; onChange: (iso: string | null) => void; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const pretty = value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  return (
    <div style={{ position: 'relative' }} ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ color: value ? '#cdd6f4' : '#6c7086' }}>{pretty}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', left: 0, marginTop: 4, zIndex: 40 }}>
          <MiniDatePicker value={value ?? ''} onChange={(iso) => { onChange(iso || null); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}
