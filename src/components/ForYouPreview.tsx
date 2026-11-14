// The look before a change from For you (Health Part 4, his ask 14 Nov 2026):
// nothing is saved until they confirm. Mirrors the extension's
// ForYouPreview.tsx — the same three views, in this package's inline styles.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { t, tt, useLocale } from '../lib/i18n';
import type { ForYouAction } from '@ava/core/health/for-you-plan';
import type { ForYouResult, ForYouExtra } from '@ava/core/health/for-you';

const stripLead = (why: string) => why.replace(/^(If you swap tonight|A lunch for today|A snack for today|Same kind of training as today) · /, '');
const slotName = (slot: string) => t(`health.plans.slot.${slot}`);
const SLOT_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];

const border = '1px solid color-mix(in srgb, var(--accent) 16%, transparent)';
const rowS: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, borderRadius: 6, border, padding: '8px 12px', fontSize: 12, color: '#a6adc8', background: 'transparent', textAlign: 'left' };
const freshS: CSSProperties = { ...rowS, border: '1px solid rgba(166,227,161,0.6)', background: 'rgba(166,227,161,0.10)', color: '#cdd6f4' };
const btnS: CSSProperties = { minHeight: 36, borderRadius: 6, padding: '0 16px', fontSize: 12, cursor: 'pointer' };
const label: CSSProperties = { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: '#6c7086' };

function Pic({ src, kind, h = 96 }: { src?: string | null; kind: 'recipe' | 'exercise'; h?: number }) {
  return (
    <div style={{ height: h, width: '100%', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,6,18,0.6)' }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span aria-hidden style={{ opacity: 0.3, fontSize: 20 }}>{kind === 'recipe' ? '🍽' : '🏋'}</span>}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, border, background: 'linear-gradient(135deg,#100d1a,#181327)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 20px', borderBottom: border }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#cdd6f4' }}>{title}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6c7086' }}>{tt('health.foryou.p.nothing_saved', 'Nothing changes until you confirm.')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ background: 'transparent', border: 'none', color: '#6c7086', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px' }}>{children}</div>
      </div>
    </div>
  );
}

export function ForYouPreview({ x, result, onConfirm, onClose }: {
  x: ForYouExtra;
  result: ForYouResult;
  onConfirm: (a: ForYouAction) => void;
  onClose: () => void;
}) {
  useLocale();
  const items = result.todayItems ?? { training: [], meals: [] };
  const [mode, setMode] = useState<'end' | 'replace'>('end');
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const a = x.action;

  const footer = (text: string, action: ForYouAction | null, cancel: string) => (
    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button type="button" style={{ ...btnS, border, background: 'transparent', color: '#cdd6f4' }} onClick={onClose}>{cancel}</button>
      <button type="button" disabled={!action} style={{ ...btnS, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, opacity: action ? 1 : 0.4 }} onClick={() => action && onConfirm(action)}>{text}</button>
    </div>
  );

  if (a.type === 'swap_meal') {
    const old = result.dinner;
    const rest = items.meals.filter((m) => m.id !== a.mealId);
    return (
      <Modal title={tt('health.foryou.p.swap_title', 'Swap tonight’s dinner?')} onClose={onClose}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...label, color: '#f38ba8' }}>{tt('health.foryou.p.goes', 'Goes')}</span>
            <Pic src={old?.image} kind="recipe" />
            <span style={{ fontSize: 13, color: '#a6adc8', textDecoration: 'line-through' }}>{old?.name}</span>
            {old?.why && <span style={{ fontSize: 11, color: '#6c7086' }}>{old.why}</span>}
          </div>
          <span aria-hidden style={{ marginTop: 48, fontSize: 18, color: '#6c7086' }}>→</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ ...label, color: '#a6e3a1' }}>{tt('health.foryou.p.comes', 'Comes in')}</span>
            <Pic src={x.image} kind="recipe" />
            <span style={{ fontSize: 13, color: '#cdd6f4' }}>{x.name}</span>
            <span style={{ fontSize: 11, color: '#a6e3a1' }}>{stripLead(x.why)}</span>
          </div>
        </div>
        {rest.length > 0 && (
          <>
            <div style={{ ...label, margin: '20px 0 8px' }}>{tt('health.foryou.p.rest_today', 'The rest of today')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rest.map((m) => <div key={m.id} style={rowS}><span style={{ width: 64, fontSize: 10, textTransform: 'uppercase' }}>{slotName(m.slot)}</span>{m.name}</div>)}
            </div>
          </>
        )}
        {footer(tt('health.foryou.p.swap_it', 'Swap it'), a, tt('health.foryou.p.keep_dinner', 'Keep my dinner'))}
      </Modal>
    );
  }

  if (a.type === 'add_meal') {
    const all = [...items.meals.map((m) => ({ ...m, isNew: false })), { id: 'new', slot: a.slot as string, name: x.name, isNew: true }]
      .sort((p, q) => SLOT_ORDER.indexOf(p.slot) - SLOT_ORDER.indexOf(q.slot));
    return (
      <Modal title={tt('health.foryou.p.add_meal_title', 'Add {name} to today?').replace('{name}', x.name)} onClose={onClose}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <Pic src={x.image} kind="recipe" h={80} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, color: '#cdd6f4' }}>{x.name}</span>
            <span style={{ fontSize: 11, color: '#a6e3a1' }}>{stripLead(x.why)}</span>
          </div>
        </div>
        <div style={{ ...label, marginBottom: 8 }}>{tt('health.foryou.p.today_meals', 'Today’s meals')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {all.map((m) => (
            <div key={m.id} style={m.isNew ? freshS : rowS}>
              <span style={{ width: 64, fontSize: 10, textTransform: 'uppercase' }}>{slotName(m.slot)}</span>{m.name}
              {m.isNew && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#a6e3a1' }}>{tt('health.foryou.p.new', 'New')}</span>}
            </div>
          ))}
        </div>
        {footer(tt('health.foryou.p.save', 'Save to my plan'), a, tt('health.foryou.p.cancel', 'Cancel'))}
      </Modal>
    );
  }

  const replaced = mode === 'replace' ? items.training.find((e) => e.id === replaceId) : null;
  const action: ForYouAction | null = mode === 'end'
    ? a
    : replaced ? { type: 'replace_exercise', planId: a.planId, dayIndex: a.dayIndex, exerciseId: replaced.id, slug: x.slug, name: x.name } : null;
  const tab = (on: boolean): CSSProperties => ({ ...btnS, flex: 1, border: on ? '1px solid var(--accent)' : border, background: on ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', color: on ? '#cdd6f4' : '#a6adc8' });
  const setsOf = (e: { sets: number | null; reps: string | null }) => (e.sets ? `${e.sets} × ${e.reps ?? ''}`.trim() : '');

  return (
    <Modal title={tt('health.foryou.p.add_ex_title', 'Add {name} to today’s session?').replace('{name}', x.name)} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" style={tab(mode === 'end')} onClick={() => { setMode('end'); setReplaceId(null); }}>{tt('health.foryou.p.at_end', 'Add it at the end')}</button>
        <button type="button" style={tab(mode === 'replace')} disabled={!items.training.length} onClick={() => setMode('replace')}>{tt('health.foryou.p.replace_one', 'Replace one')}</button>
      </div>
      {mode === 'replace' && <p style={{ margin: '0 0 8px', fontSize: 11, color: '#a6adc8' }}>{tt('health.foryou.p.tap_one', 'Tap the exercise it replaces. It keeps that one’s sets and reps.')}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.training.map((e, i) => {
          const isOut = replaced?.id === e.id;
          const inner = (
            <>
              <span style={{ width: 20, fontSize: 10, color: '#6c7086' }}>{i + 1}</span>
              <span style={{ textDecoration: isOut ? 'line-through' : 'none' }}>{e.name}</span>
              {isOut && <span style={{ color: '#a6e3a1' }}>→ {x.name}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6c7086' }}>{setsOf(e)}</span>
            </>
          );
          return mode === 'replace' ? (
            <button key={e.id} type="button" onClick={() => setReplaceId(e.id)} style={{ ...rowS, cursor: 'pointer', ...(isOut ? { border: '1px solid rgba(243,139,168,0.6)', color: '#cdd6f4' } : {}) }}>{inner}</button>
          ) : (
            <div key={e.id} style={rowS}>{inner}</div>
          );
        })}
        {mode === 'end' && (
          <div style={freshS}>
            <span style={{ width: 20, fontSize: 10 }}>{items.training.length + 1}</span>{x.name}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#a6e3a1' }}>3 × 10 · {tt('health.foryou.p.new', 'New')}</span>
          </div>
        )}
      </div>
      {footer(tt('health.foryou.p.save', 'Save to my plan'), action, tt('health.foryou.p.cancel', 'Cancel'))}
    </Modal>
  );
}
