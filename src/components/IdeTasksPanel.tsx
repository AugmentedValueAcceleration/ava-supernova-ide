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

interface Props {
  sessionTasks: SessionTaskUI[];
  avaCompletedTasks: AvaCompletedTaskUI[];
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  onClose: () => void;
  onToggleTask: (taskId: string) => void;
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

/* ── Sub-components ──────────────────────────────────────────────────────── */

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
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer',
        opacity: isDone ? 0.5 : 1,
      }}
      onClick={() => onToggle(task.id)}
    >
      <span style={{
        width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: isDone ? '1.5px solid #a6e3a1' : '1.5px solid #585b70',
        background: isDone ? 'rgba(166,227,161,0.15)' : 'transparent',
        fontSize: 10, color: isDone ? '#a6e3a1' : 'transparent',
      }}>
        {isDone ? '✓' : ''}
      </span>
      <span style={{
        fontSize: 12, color: '#cdd6f4', flex: 1,
        textDecoration: isDone ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>
      {!isDone && task.priority !== 'medium' && task.priority !== 'low' && (
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 600,
          background: `${PRIORITY_COLORS[task.priority]}20`,
          color: PRIORITY_COLORS[task.priority],
        }}>
          {task.priority}
        </span>
      )}
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

/* ── Tabs ─────────────────────────────────────────────────────────────── */

function AvaTab({ sessionTasks, completedTasks }: { sessionTasks: SessionTaskUI[]; completedTasks: AvaCompletedTaskUI[] }) {
  const done = sessionTasks.filter(t => t.status === 'completed').length;
  const total = sessionTasks.length;

  return (
    <div style={{ padding: '8px 12px', overflowY: 'auto', flex: 1 }}>
      {sessionTasks.length > 0 && (
        <CollapsibleSection title="Current" count={total} defaultOpen>
          {/* Progress bar */}
          {total > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#6c7086' }}>{done}/{total} done</span>
                <span style={{ fontSize: 10, color: '#6c7086' }}>{total > 0 ? Math.round((done / total) * 100) : 0}%</span>
              </div>
              <div style={{ height: 4, background: '#313244', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${total > 0 ? (done / total) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, #a855f7, #6366f1)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}
          {sessionTasks.map(t => <SessionItem key={t.id} task={t} />)}
        </CollapsibleSection>
      )}

      {completedTasks.length > 0 && (
        <CollapsibleSection title="Completed" count={completedTasks.length} defaultOpen={sessionTasks.length === 0}>
          {completedTasks.slice(0, 20).map(t => <CompletedItem key={t.id} task={t} />)}
        </CollapsibleSection>
      )}

      {sessionTasks.length === 0 && completedTasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>☆</div>
          <div style={{ fontSize: 12, color: '#6c7086' }}>No tasks yet.</div>
          <div style={{ fontSize: 11, color: '#585b70', marginTop: 4 }}>
            Ava will show her progress here when working on multi-step tasks.
          </div>
        </div>
      )}
    </div>
  );
}

function PersonalTab({ todayTasks, allTasks, onToggle }: {
  todayTasks: TodayTaskUI[]; allTasks: TodayTaskUI[]; onToggle: (id: string) => void;
}) {
  const [filter, setFilter] = useState<'today' | 'all'>('today');
  const tasks = filter === 'today' ? todayTasks : allTasks;
  const active = tasks.filter(t => t.status !== 'done');
  const done = tasks.filter(t => t.status === 'done');

  return (
    <div style={{ padding: '8px 12px', overflowY: 'auto', flex: 1 }}>
      {/* Filter toggle */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
        {(['today', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: filter === f ? '#313244' : 'transparent',
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

/* ── Main Panel ──────────────────────────────────────────────────────────── */

export default function IdeTasksPanel({
  sessionTasks, avaCompletedTasks, todayTasks, allTasks,
  onClose, onToggleTask, width, onWidthChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<'ava' | 'personal'>('ava');
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Auto-switch to Ava tab when session tasks appear
  useEffect(() => {
    if (sessionTasks.length > 0 && activeTab === 'personal') {
      setActiveTab('ava');
    }
  }, [sessionTasks.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      background: '#181825', borderLeft: '1px solid #313244', position: 'relative',
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

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid #313244', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Tasks
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#585b70', cursor: 'pointer', fontSize: 14, padding: 2, lineHeight: 1 }}
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid #313244', flexShrink: 0,
      }}>
        {([
          { id: 'ava' as const, label: 'Ava', badge: sessionTasks.length },
          { id: 'personal' as const, label: 'My Tasks', badge: todayTasks.filter(t => t.status !== 'done').length },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: activeTab === tab.id ? '#cdd6f4' : '#585b70',
              borderBottom: activeTab === tab.id ? '2px solid #a855f7' : '2px solid transparent',
            }}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span style={{
                marginLeft: 5, fontSize: 9, padding: '1px 5px', borderRadius: 8,
                background: activeTab === tab.id ? 'rgba(168,85,247,0.2)' : '#313244',
                color: activeTab === tab.id ? '#a855f7' : '#6c7086',
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'ava' ? (
        <AvaTab sessionTasks={sessionTasks} completedTasks={avaCompletedTasks} />
      ) : (
        <PersonalTab todayTasks={todayTasks} allTasks={allTasks} onToggle={onToggleTask} />
      )}
    </div>
  );
}
