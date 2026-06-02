import { useState, useEffect, useRef, useCallback } from 'react';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface SessionTaskUI {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AvaCompletedTaskUI {
  id: string;
  title: string;
  completedAt: string;
}

export interface TodayTaskUI {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in-progress' | 'done';
  dueDate?: string;
  category: string;
}

/** Payload for a manually created task from the panel quick-add. */
export interface CreateTaskInput {
  title: string;
  priority?: string;
  category?: string;
  due_date?: string;
}

/** Preset categories that seed the picker. Default is neutral, not coding —
 *  and the field is free-form, so a user can type ANY label (fitness, garden…). */
const CATEGORY_OPTIONS = ['personal', 'coding', 'admin', 'meeting', 'health', 'finance', 'errands', 'study', 'home'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

interface Props {
  sessionTasks: SessionTaskUI[];
  avaCompletedTasks: AvaCompletedTaskUI[];
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  onClose: () => void;
  onToggleTask: (taskId: string) => void;
  onCreateTask: (task: CreateTaskInput) => void;
  width: number;
  onWidthChange: (w: number) => void;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  pending: { icon: '○', color: '#6c7086' },
  in_progress: { icon: '◉', color: '#a855f7' },
  completed: { icon: '✓', color: '#a6e3a1' },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#6c7086',
};

// Subtle per-category tint; unknown / user-defined categories fall back to slate.
const CATEGORY_COLORS: Record<string, string> = {
  personal: '#38bdf8',
  coding: '#a855f7',
  admin: '#f59e0b',
  meeting: '#34d399',
  custom: '#94a3b8',
};
function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || '#94a3b8';
}
function formatDueShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ── Item rows ───────────────────────────────────────────────────────────── */

function SessionItem({ task }: { task: SessionTaskUI }) {
  const s = STATUS_ICONS[task.status] || STATUS_ICONS.pending;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
      opacity: task.status === 'completed' ? 0.6 : 1,
    }}>
      <span style={{
        fontSize: 12, color: s.color, fontWeight: 600, width: 16, textAlign: 'center',
        animation: task.status === 'in_progress' ? 'avaSpin 1.5s linear infinite' : 'none',
      }}>
        {s.icon}
      </span>
      <span style={{
        fontSize: 12, color: '#cdd6f4', flex: 1,
        textDecoration: task.status === 'completed' ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>
    </div>
  );
}

function CompletedItem({ task }: { task: AvaCompletedTaskUI }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', opacity: 0.5 }}>
      <span style={{ fontSize: 12, color: '#a6e3a1', width: 16, textAlign: 'center' }}>✓</span>
      <span style={{ fontSize: 11, color: '#a6adc8', flex: 1, textDecoration: 'line-through' }}>
        {task.title}
      </span>
      <span style={{ fontSize: 9, color: '#585b70', whiteSpace: 'nowrap' }}>{timeAgo(task.completedAt)}</span>
    </div>
  );
}

function TaskItem({ task, onToggle }: { task: TodayTaskUI; onToggle: (id: string) => void }) {
  const isDone = task.status === 'done';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!task.dueDate && !isDone && task.dueDate < today;
  const dueToday = !!task.dueDate && !isDone && task.dueDate === today;
  const hasMeta = !isDone && (task.category || task.dueDate);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', cursor: 'pointer',
        opacity: isDone ? 0.5 : 1,
      }}
      onClick={() => onToggle(task.id)}
    >
      <span style={{
        width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: isDone ? '1.5px solid #a6e3a1' : '1.5px solid #585b70',
        background: isDone ? 'rgba(166,227,161,0.15)' : 'transparent',
        fontSize: 10, color: isDone ? '#a6e3a1' : 'transparent', flexShrink: 0, marginTop: 1,
      }}>
        {isDone ? '✓' : ''}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12, color: '#cdd6f4', flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textDecoration: isDone ? 'line-through' : 'none',
          }}>
            {task.title}
          </span>
          {!isDone && task.priority !== 'medium' && task.priority !== 'low' && (
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 600, flexShrink: 0,
              background: `${PRIORITY_COLORS[task.priority]}20`,
              color: PRIORITY_COLORS[task.priority],
            }}>
              {task.priority}
            </span>
          )}
        </div>
        {hasMeta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {task.category && (
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
                color: categoryColor(task.category), background: `${categoryColor(task.category)}1a`,
              }}>
                {task.category}
              </span>
            )}
            {task.dueDate && (
              <span style={{
                fontSize: 9,
                color: overdue ? '#ef4444' : dueToday ? '#f59e0b' : '#585b70',
              }}>
                {formatDueShort(task.dueDate)}{overdue ? ' · overdue' : ''}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, count, defaultOpen = true, children }: {
  title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer',
          color: '#a6adc8', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
        }}
      >
        <span style={{ fontSize: 8, transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        {title}
        {count !== undefined && <span style={{ color: '#585b70', fontWeight: 400 }}>({count})</span>}
      </button>
      {open && <div style={{ paddingLeft: 4 }}>{children}</div>}
    </div>
  );
}

/* ── Quick add ───────────────────────────────────────────────────────────── */

const INPUT_STYLE: React.CSSProperties = {
  background: 'rgba(49, 34, 68, 0.5)',
  border: '1px solid rgba(168, 85, 247, 0.2)',
  borderRadius: 6,
  color: '#cdd6f4',
  fontSize: 12,
  padding: '6px 8px',
  outline: 'none',
};

function QuickAdd({ onCreate, defaultDueToday }: { onCreate: (t: CreateTaskInput) => void; defaultDueToday: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('personal');
  const [dueDate, setDueDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const reset = () => { setTitle(''); setPriority('medium'); setCategory('personal'); setDueDate(''); };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const due = dueDate || (defaultDueToday ? new Date().toISOString().slice(0, 10) : undefined);
    onCreate({ title: trimmed, priority, category, due_date: due });
    reset();
    inputRef.current?.focus();
  };

  const cancel = () => { reset(); setOpen(false); };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '7px 10px', borderRadius: 8,
          border: '1px dashed rgba(168,85,247,0.3)', background: 'transparent',
          color: '#a6adc8', fontSize: 11, fontWeight: 500, cursor: 'pointer',
        }}
      >
        <span style={{ color: '#a855f7', fontSize: 14, lineHeight: 1 }}>+</span>
        Add a task
      </button>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: 8, borderRadius: 8,
      background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)',
    }}>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') cancel(); }}
        placeholder="What needs doing?"
        style={{ ...INPUT_STYLE, width: '100%' }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} title="Priority" style={{ ...INPUT_STYLE, flex: 1, minWidth: 0, fontSize: 10, cursor: 'pointer' }}>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p} style={{ background: '#1a1028' }}>{p}</option>)}
        </select>
        <input list="ide-quickadd-categories" value={category} onChange={(e) => setCategory(e.target.value)} title="Category" placeholder="Category" style={{ ...INPUT_STYLE, flex: 1, minWidth: 0, fontSize: 10 }} />
        <datalist id="ide-quickadd-categories">
          {CATEGORY_OPTIONS.map(c => <option key={c} value={c} />)}
        </datalist>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} title="Due date" style={{ ...INPUT_STYLE, flex: 1, minWidth: 0, fontSize: 10, cursor: 'pointer' }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={submit}
          disabled={!title.trim()}
          style={{
            padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
            background: '#a855f7', color: 'white', cursor: title.trim() ? 'pointer' : 'default',
            opacity: title.trim() ? 1 : 0.3,
          }}
        >
          Add
        </button>
        <button
          onClick={cancel}
          style={{ padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 500, background: 'transparent', color: '#a6adc8', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Ava band — sticky live-work indicator ───────────────────────────────── */

function AvaBand({ sessionTasks }: { sessionTasks: SessionTaskUI[] }) {
  const [expanded, setExpanded] = useState(false);
  const total = sessionTasks.length;
  const done = sessionTasks.filter(t => t.status === 'completed').length;
  const allDone = done === total;
  const current = sessionTasks.find(t => t.status === 'in_progress') ?? sessionTasks.find(t => t.status !== 'completed');

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 10,
      background: 'linear-gradient(180deg, rgba(40,22,58,0.97) 0%, rgba(26,16,40,0.97) 100%)',
      backdropFilter: 'blur(6px)', borderBottom: '1px solid rgba(168,85,247,0.18)',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: allDone ? '#a6e3a1' : '#a855f7', display: 'flex', alignItems: 'center', gap: 4 }}>
            {!allDone && <span style={{ display: 'inline-block', animation: 'avaSpin 1.5s linear infinite' }}>⟳</span>}
            Ava
          </span>
          <span style={{ fontSize: 10, color: '#6c7086', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {allDone ? 'All steps complete' : current?.title}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: allDone ? '#a6e3a1' : '#a855f7', flexShrink: 0 }}>{done}/{total}</span>
          <span style={{ fontSize: 8, color: '#585b70', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        </div>
        <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(168,85,247,0.12)' }}>
          <div style={{ height: '100%', borderRadius: 2, width: `${total > 0 ? (done / total) * 100 : 0}%`, background: allDone ? '#a6e3a1' : 'linear-gradient(90deg, #a855f7, #6366f1)', transition: 'width 0.4s ease' }} />
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 12px 8px' }}>
          {sessionTasks.map(t => <SessionItem key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}

/* ── Your tasks ──────────────────────────────────────────────────────────── */

function YourTasks({ todayTasks, allTasks, filter, onFilterChange, onToggle }: {
  todayTasks: TodayTaskUI[]; allTasks: TodayTaskUI[];
  filter: 'today' | 'all'; onFilterChange: (f: 'today' | 'all') => void; onToggle: (id: string) => void;
}) {
  const tasks = filter === 'today' ? todayTasks : allTasks;
  const active = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div style={{ padding: '8px 12px' }}>
      {/* Filter toggle */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
        {(['today', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: filter === f ? 'rgba(49, 34, 68, 0.5)' : 'transparent',
              color: filter === f ? '#cdd6f4' : '#585b70',
            }}
          >
            {f === 'today' ? 'Today' : 'All'}
          </button>
        ))}
      </div>

      {active.length > 0 && (
        <CollapsibleSection title="Active" count={active.length} defaultOpen>
          {active.map(t => <TaskItem key={t.id} task={t} onToggle={onToggle} />)}
        </CollapsibleSection>
      )}

      {done.length > 0 && (
        <CollapsibleSection title="Done" count={done.length} defaultOpen={false}>
          {done.map(t => <TaskItem key={t.id} task={t} onToggle={onToggle} />)}
        </CollapsibleSection>
      )}

      {tasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
          <div style={{ fontSize: 12, color: '#6c7086' }}>
            {filter === 'today' ? 'No tasks today. Enjoy the clear board!' : 'No tasks yet.'}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Ava recent work — collapsible history at the bottom ──────────────────── */

function AvaRecentWork({ avaCompletedTasks }: { avaCompletedTasks: AvaCompletedTaskUI[] }) {
  return (
    <div style={{ padding: '4px 12px 12px', borderTop: '1px solid rgba(168,85,247,0.08)' }}>
      <CollapsibleSection title="Ava's recent work" count={avaCompletedTasks.length} defaultOpen={false}>
        {avaCompletedTasks.slice(0, 20).map(t => <CompletedItem key={t.id} task={t} />)}
      </CollapsibleSection>
    </div>
  );
}

/* ── Collapsed spine ─────────────────────────────────────────────────────── */

function SpineRing({ done, total }: { done: number; total: number }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const allDone = total > 0 && done === total;
  const color = allDone ? '#a6e3a1' : '#a855f7';
  return (
    <span style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="12" cy="12" r={r} fill="none" stroke="rgba(168,85,247,0.18)" strokeWidth="2.5" />
        <circle cx="12" cy="12" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${pct * circ} ${circ}`} style={{ transition: 'stroke-dasharray 0.4s ease' }} />
      </svg>
      <span style={{ position: 'absolute', fontSize: 8, fontWeight: 600, color }}>{allDone ? '✓' : `${done}/${total}`}</span>
    </span>
  );
}

/** The always-visible Tasks rail shown when the panel is collapsed. */
export function IdeTasksSpine({ activeCount, sessionTasks, onExpand }: {
  activeCount: number; sessionTasks: SessionTaskUI[]; onExpand: () => void;
}) {
  const total = sessionTasks.length;
  const done = sessionTasks.filter(t => t.status === 'completed').length;
  const avaWorking = total > 0 && done < total;

  return (
    <div style={{
      width: 34, flexShrink: 0, height: '100%', position: 'relative',
      borderLeft: '1px solid rgba(168,85,247,0.12)',
      background: 'radial-gradient(ellipse 120% 40% at 50% 0%, rgba(168,85,247,0.08) 0%, transparent 70%), linear-gradient(180deg, rgba(26,16,40,0.9) 0%, rgba(20,13,34,0.95) 100%)',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Grip — straddles the border at mid-height. */}
      <button
        onClick={onExpand}
        title="Open tasks"
        aria-label="Open tasks"
        style={{
          position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
          width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', background: '#0f0a1a', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10.354 3.646a.5.5 0 0 1 0 .708L6.707 8l3.647 3.646a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 0 1 .708 0z" />
        </svg>
      </button>

      {/* Rail body — also fully clickable. */}
      <button
        onClick={onExpand}
        title="Open tasks"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', height: '100%', paddingTop: 12, background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        {avaWorking ? (
          <SpineRing done={done} total={total} />
        ) : activeCount > 0 ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, fontSize: 10, fontWeight: 600, background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
            {activeCount > 99 ? '99+' : activeCount}
          </span>
        ) : (
          <span style={{ fontSize: 14, color: '#585b70' }}>☰</span>
        )}
        <span style={{ writingMode: 'vertical-rl', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086' }}>
          Tasks
        </span>
      </button>
    </div>
  );
}

/* ── Main Panel ──────────────────────────────────────────────────────────── */

export default function IdeTasksPanel({
  sessionTasks, avaCompletedTasks, todayTasks, allTasks,
  onClose, onToggleTask, onCreateTask, width, onWidthChange,
}: Props) {
  const [filter, setFilter] = useState<'today' | 'all'>('today');
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Drag resize
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      const next = Math.min(500, Math.max(200, dragRef.current.startW + delta));
      requestAnimationFrame(() => onWidthChange(next));
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width, onWidthChange]);

  return (
    <div style={{
      width, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%',
      background: 'radial-gradient(ellipse 90% 40% at 50% 0%, rgba(168,85,247,0.10) 0%, transparent 65%), linear-gradient(180deg, rgba(26,16,40,0.95) 0%, rgba(20,13,34,0.97) 100%)',
      backdropFilter: 'blur(12px)',
      borderLeft: '1px solid rgba(168, 85, 247, 0.12)', position: 'relative',
    }}>
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          cursor: 'col-resize', zIndex: 10,
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(168,85,247,0.4)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
      />

      {/* Persistent grip — same spot as the spine's, points right to collapse. */}
      <button
        onClick={onClose}
        title="Collapse"
        aria-label="Collapse"
        style={{
          position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)', zIndex: 20,
          width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', background: '#0f0a1a', border: '1px solid rgba(168,85,247,0.35)', color: '#a855f7',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M5.646 3.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L9.293 8 5.646 4.354a.5.5 0 0 1 0-.708z" />
        </svg>
      </button>

      {/* Header — title only; collapse is the persistent grip on the border. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderBottom: '1px solid rgba(168, 85, 247, 0.12)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Tasks
        </span>
      </div>

      {/* Quick add — pinned under the header. */}
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        <QuickAdd onCreate={onCreateTask} defaultDueToday={filter === 'today'} />
      </div>

      {/* Body — your tasks fill it; Ava's live work pins to the top when she's
          working; her recent work tucks away at the bottom. */}
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
        {sessionTasks.length > 0 && <AvaBand sessionTasks={sessionTasks} />}
        <YourTasks todayTasks={todayTasks} allTasks={allTasks} filter={filter} onFilterChange={setFilter} onToggle={onToggleTask} />
        {avaCompletedTasks.length > 0 && <AvaRecentWork avaCompletedTasks={avaCompletedTasks} />}
      </div>
    </div>
  );
}
