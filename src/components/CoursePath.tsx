import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLocale } from '../lib/i18n';
import {
  CheckCircle as PhCheckCircle,
  Circle as PhCircle,
  Lock as PhLock,
  // Still the "current lesson" glyph in the list — the collapse/expand
  // chevrons are now inline SVGs matching the Tasks rail's grip.
  CaretRight as PhCaretRight,
} from '@phosphor-icons/react';

/**
 * Course-path sidebar — the "you are here" map beside the Ava learning chat.
 * Shows the active course's modules → lessons with status glyphs and the current
 * lesson highlighted, so the learner (and Ava) always know where they are.
 * Clicking a lesson seeds the chat ("Let's do: …") via the 'ava-learning-seed'
 * window event, which the mounted LearningRoomChat picks up.
 *
 * Collapse + resize mirror the chat's Tasks rail (IdeTasksPanel / IdeTasksSpine):
 * a drag handle on the inner edge, a grip that never moves between states, and a
 * self-advertising rail when collapsed. Width and collapsed state persist.
 */

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 240;
const RAIL_WIDTH = 34; // matches IdeTasksSpine
const WIDTH_KEY = 'ava-ide-course-path-width';
const COLLAPSED_KEY = 'ava-ide-course-path-collapsed';

/** Progress ring — mirrors IdeTasksPanel's SpineRing so the rails read alike. */
function PathRing({ percent }: { percent: number }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, percent / 100));
  const allDone = pct >= 1;
  const color = allDone ? '#34d399' : 'var(--accent)';
  return (
    <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="12" cy="12" r={r} fill="none" stroke="color-mix(in srgb, var(--accent) 18%, transparent)" strokeWidth="2.5" />
        <circle
          cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={`${pct * circ} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <span style={{ position: 'absolute', fontSize: 8, fontWeight: 600, color }}>
        {allDone ? '✓' : Math.round(percent)}
      </span>
    </span>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CoursePath({ curriculum }: { curriculum: any | null }) {
  useLocale();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [width, setWidth] = useState(() => {
    try {
      const raw = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(raw) && raw > 0) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw));
    } catch { /* ignore */ }
    return DEFAULT_WIDTH;
  });

  const setCollapsedPersist = useCallback((next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  // ── Drag resize — mirrors IdeTasksPanel's handle. Persist on mouseup. ──
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const widthRef = useRef(width);
  useEffect(() => { widthRef.current = width; }, [width]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: widthRef.current };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      // Panel sits on the right edge, so dragging left widens it.
      const delta = dragRef.current.startX - ev.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta));
      requestAnimationFrame(() => setWidth(next));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(WIDTH_KEY, String(widthRef.current)); } catch { /* ignore */ }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // The "current" lesson = first not-completed lesson in document order.
  const currentLessonId = useMemo(() => {
    if (!curriculum) return null;
    for (const m of curriculum.modules ?? []) {
      for (const l of m.lessons ?? []) if (l.status !== 'completed') return l.id || l.title;
    }
    return null;
  }, [curriculum]);

  const seedLesson = (title: string) => {
    try { window.dispatchEvent(new CustomEvent('ava-learning-seed', { detail: `Let's do: ${title}` })); } catch { /* no window */ }
  };

  const gripStyle: React.CSSProperties = {
    position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)', zIndex: 20,
    width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', background: '#0f0a1a', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
    color: 'var(--accent)', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
  };

  if (collapsed) {
    return (
      <div style={{
        width: RAIL_WIDTH, flexShrink: 0, height: '100%', position: 'relative',
        borderLeft: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
        background: 'radial-gradient(ellipse 120% 40% at 50% 0%, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%), linear-gradient(180deg, rgba(26,16,40,0.9) 0%, rgba(20,13,34,0.95) 100%)',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Grip — same spot the expanded panel's sits, so it never jumps. */}
        <button onClick={() => setCollapsedPersist(false)} title={t('learning.path.expand')} aria-label={t('learning.path.expand')} style={{ ...gripStyle, zIndex: 10 }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.354 3.646a.5.5 0 0 1 0 .708L6.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0z" />
          </svg>
        </button>
        <button
          onClick={() => setCollapsedPersist(false)}
          title={t('learning.path.expand')}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', height: '100%', paddingTop: 12, background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          {curriculum ? <PathRing percent={Number(curriculum.progress_percent) || 0} /> : <span style={{ fontSize: 14, color: '#585b70' }}>☰</span>}
          <span style={{ writingMode: 'vertical-rl', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086' }}>
            {t('learning.path.title')}
          </span>
        </button>
      </div>
    );
  }

  return (
    <aside style={{ display: 'flex', width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH, flexShrink: 0, flexDirection: 'column', borderLeft: '1px solid var(--border, #2a2440)', background: 'rgba(12, 8, 20, 0.4)', minHeight: 0, position: 'relative' }}>
      {/* Drag handle — inner edge, same as IdeTasksPanel. */}
      <div
        onMouseDown={onDragStart}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, cursor: 'col-resize', zIndex: 10 }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 40%, transparent)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
      />

      {/* Grip — same spot as the spine's, points right to collapse. */}
      <button onClick={() => setCollapsedPersist(true)} title={t('learning.path.collapse')} aria-label={t('learning.path.collapse')} style={gripStyle}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708z" />
        </svg>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border, #2a2440)', padding: '8px 12px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086' }}>{t('learning.path.title')}</span>
      </div>

      {!curriculum ? (
        <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 11, lineHeight: 1.6, color: '#6c7086' }}>
          {t('learning.path.empty')}
        </div>
      ) : (
        <div style={{ minHeight: 0, flex: 1, overflowY: 'auto' }}>
          {/* Course header + progress */}
          <div style={{ borderBottom: '1px solid var(--border, #2a2440)', padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4' }}>{curriculum.title}</div>
            {curriculum.subject && <div style={{ marginTop: 2, fontSize: 10, color: '#6c7086' }}>{curriculum.subject}</div>}
            <div style={{ marginTop: 8, height: 4, overflow: 'hidden', borderRadius: 999, background: 'rgba(49, 34, 68, 0.5)' }}>
              <div style={{ height: '100%', borderRadius: 999, background: 'var(--accent)', width: `${curriculum.progress_percent ?? 0}%` }} />
            </div>
            <div style={{ marginTop: 4, fontSize: 9, color: '#6c7086' }}>{Math.round(curriculum.progress_percent ?? 0)}%</div>
          </div>

          {/* Modules → lessons */}
          <div style={{ padding: '6px' }}>
            {(curriculum.modules ?? []).map((mod: any, mi: number) => (
              <div key={mod.id || mi} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 11, fontWeight: 500, color: '#a6adc8' }}>
                  <span style={{ width: 12, fontSize: 9, color: '#6c7086' }}>{mi + 1}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.title}</span>
                  {mod.status === 'completed' && <PhCheckCircle size={13} weight="duotone" style={{ color: '#34d399' }} />}
                  {mod.status === 'locked' && <PhLock size={13} weight="duotone" style={{ color: '#6c7086' }} />}
                </div>
                {(mod.lessons ?? []).map((lesson: any, li: number) => {
                  const lid = lesson.id || lesson.title;
                  const isCurrent = lid === currentLessonId;
                  const done = lesson.status === 'completed';
                  const Glyph = done ? PhCheckCircle : isCurrent || lesson.status === 'in_progress' ? PhCaretRight : PhCircle;
                  const glyphColor = done ? '#34d399' : isCurrent ? 'var(--accent)' : '#6c7086';
                  return (
                    <button
                      key={lid || li}
                      onClick={() => seedLesson(lesson.title)}
                      title={t('learning.path.start_lesson')}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center', gap: 6, borderRadius: 6,
                        padding: '4px 6px 4px 20px', textAlign: 'left', fontSize: 11, border: 'none', cursor: 'pointer',
                        background: isCurrent ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                        color: isCurrent ? 'var(--accent)' : '#a6adc8',
                        fontWeight: isCurrent ? 600 : 400,
                      }}
                      onMouseEnter={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'rgba(49, 34, 68, 0.5)'; }}
                      onMouseLeave={e => { if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <span style={{ display: 'flex', width: 16, justifyContent: 'center', color: glyphColor }}><Glyph size={13} weight="duotone" /></span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.7 : 1 }}>{lesson.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
