import { useMemo, useState } from 'react';
import { t, useLocale } from '../lib/i18n';
import {
  CheckCircle as PhCheckCircle,
  Circle as PhCircle,
  Lock as PhLock,
  CaretRight as PhCaretRight,
  CaretLeft as PhCaretLeft,
} from '@phosphor-icons/react';

/**
 * Course-path sidebar — the "you are here" map beside the Ava learning chat.
 * Shows the active course's modules → lessons with status glyphs and the current
 * lesson highlighted, so the learner (and Ava) always know where they are.
 * Clicking a lesson seeds the chat ("Let's do: …") via the 'ava-learning-seed'
 * window event, which the mounted LearningRoomChat picks up. Collapsible.
 * Mirrors the extension's CoursePath in the IDE's inline-style idiom.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export function CoursePath({ curriculum }: { curriculum: any | null }) {
  useLocale();
  const [collapsed, setCollapsed] = useState(false);

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

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title={t('learning.path.expand')}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 6px', border: 'none', borderLeft: '1px solid var(--border, #2a2440)', background: 'transparent', color: '#6c7086', cursor: 'pointer' }}
      >
        <PhCaretLeft size={16} weight="duotone" />
      </button>
    );
  }

  return (
    <aside style={{ display: 'flex', width: 240, flexShrink: 0, flexDirection: 'column', borderLeft: '1px solid var(--border, #2a2440)', background: 'rgba(12, 8, 20, 0.4)', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border, #2a2440)', padding: '8px 12px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#6c7086' }}>{t('learning.path.title')}</span>
        <button onClick={() => setCollapsed(true)} title={t('learning.path.collapse')} style={{ display: 'flex', border: 'none', background: 'transparent', color: '#6c7086', cursor: 'pointer', padding: 0 }}>
          <PhCaretRight size={16} weight="duotone" />
        </button>
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
