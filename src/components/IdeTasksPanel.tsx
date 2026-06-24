import { useState, useEffect, useRef, useCallback } from 'react';
import { t, useLocale } from '../lib/i18n';

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

export interface TaskSubtaskUI { id: string; title: string; done: boolean }
export interface TaskContextUI { kind: 'chat' | 'file' | 'plan' | 'lesson' | 'other'; ref: string; label?: string }

export interface TodayTaskUI {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in-progress' | 'done';
  dueDate?: string;
  dueTime?: string;
  category: string;
  recurrence?: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
  reminderLead?: number;
  subtasks?: TaskSubtaskUI[];
  context?: TaskContextUI;
}

/** Payload for a manually created task from the panel quick-add. */
export interface CreateTaskInput {
  title: string;
  priority?: string;
  category?: string;
  due_date?: string;
  due_time?: string;
  recurrence?: string;
  reminder_lead?: number;
  subtasks?: string[];
}

/** Fields the detail editor can change on an existing task. */
export interface UpdateTaskInput {
  title?: string;
  priority?: string;
  category?: string;
  due_date?: string;
  due_time?: string;
  recurrence?: string;
  reminder_lead?: number;
}

/** Preset categories that seed the picker. Default is neutral, not coding —
 *  and the field is free-form, so a user can type ANY label (fitness, garden…). */
const CATEGORY_OPTIONS = ['personal', 'coding', 'admin', 'meeting', 'health', 'finance', 'errands', 'study', 'home'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const RECURRENCE_OPTIONS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
/** Reminder lead presets — minutes before due. -1 = none, 0 = at the due time.
 *  `key` is the stable i18n key (shared with the extension panel); `label` is
 *  the English fallback used when a locale hasn't translated it yet. */
const REMINDER_OPTIONS: { value: number; key: string; label: string }[] = [
  { value: -1, key: 'tasks.reminder_none', label: 'No reminder' },
  { value: 0, key: 'tasks.reminder_at_time', label: 'At time' },
  { value: 10, key: 'tasks.reminder_10m', label: '10 min before' },
  { value: 30, key: 'tasks.reminder_30m', label: '30 min before' },
  { value: 60, key: 'tasks.reminder_1h', label: '1 hour before' },
  { value: 1440, key: 'tasks.reminder_1d', label: '1 day before' },
];
function recurrenceLabel(r?: string): string | null { return !r || r === 'none' ? null : t(`tasks.recurrence_${r}`); }
function reminderLabel(lead?: number): string | null {
  if (lead === undefined || lead < 0) return null;
  const opt = REMINDER_OPTIONS.find(o => o.value === lead);
  return opt ? t(opt.key) : null;
}

interface Props {
  sessionTasks: SessionTaskUI[];
  avaCompletedTasks: AvaCompletedTaskUI[];
  todayTasks: TodayTaskUI[];
  allTasks: TodayTaskUI[];
  onClose: () => void;
  onToggleTask: (taskId: string) => void;
  onCreateTask: (task: CreateTaskInput) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTask: (taskId: string, updates: UpdateTaskInput) => void;
  onOpenFolder: () => void;
  width: number;
  onWidthChange: (w: number) => void;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('tasks.just_now');
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
  useLocale();
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

function TaskItem({ task, onToggle, onToggleSubtask, onUpdateTask }: {
  task: TodayTaskUI;
  onToggle: (id: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTask: (taskId: string, updates: UpdateTaskInput) => void;
}) {
  useLocale();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const isDone = task.status === 'done';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!task.dueDate && !isDone && task.dueDate < today;
  const dueToday = !!task.dueDate && !isDone && task.dueDate === today;
  const subs = task.subtasks ?? [];
  const subDone = subs.filter(s => s.done).length;
  const recurs = recurrenceLabel(task.recurrence);
  const remind = reminderLabel(task.reminderLead);
  const hasMeta = !isDone && (task.category || task.dueDate || task.dueTime || recurs || subs.length > 0 || remind || task.context);
  const expandable = !isDone || !!task.description || subs.length > 0 || !!task.context;
  const chip = (bg: string, color: string): React.CSSProperties => ({ fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 600, background: bg, color });

  return (
    <div style={{ borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', opacity: isDone ? 0.55 : 1 }}>
        <span
          onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}
          style={{
            width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            border: isDone ? '1.5px solid #a6e3a1' : '1.5px solid #585b70',
            background: isDone ? 'rgba(166,227,161,0.15)' : 'transparent',
            fontSize: 10, color: isDone ? '#a6e3a1' : 'transparent', flexShrink: 0, marginTop: 1,
          }}
        >
          {isDone ? '✓' : ''}
        </span>
        <div
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, cursor: expandable ? 'pointer' : 'default' }}
          onClick={() => expandable && setExpanded(x => !x)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 12, color: '#cdd6f4', flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: isDone ? 'line-through' : 'none',
            }}>
              {task.title}
            </span>
            {!isDone && task.priority !== 'medium' && task.priority !== 'low' && (
              <span style={chip(`${PRIORITY_COLORS[task.priority]}20`, PRIORITY_COLORS[task.priority])}>{task.priority}</span>
            )}
          </div>
          {hasMeta && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {task.category && <span style={chip(`${categoryColor(task.category)}1a`, categoryColor(task.category))}>{task.category}</span>}
              {task.dueDate && (
                <span style={{ fontSize: 9, color: overdue ? '#ef4444' : dueToday ? '#f59e0b' : '#585b70' }}>
                  {formatDueShort(task.dueDate)}{task.dueTime ? ` · ${task.dueTime}` : ''}{overdue ? ' · overdue' : ''}
                </span>
              )}
              {!task.dueDate && task.dueTime && <span style={{ fontSize: 9, color: '#585b70' }}>{task.dueTime}</span>}
              {recurs && <span style={{ fontSize: 9, color: '#6c7086' }}>↻ {recurs}</span>}
              {remind && <span style={{ fontSize: 9, color: '#6c7086' }}>🔔 {remind}</span>}
              {subs.length > 0 && <span style={{ fontSize: 9, color: '#6c7086' }}>☑ {subDone}/{subs.length}</span>}
              {task.context && <span style={{ fontSize: 9, color: '#585b70', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📎 {task.context.label || task.context.kind}</span>}
            </div>
          )}
        </div>
        {expandable && (
          <span
            onClick={() => setExpanded(x => !x)}
            style={{ fontSize: 8, color: '#585b70', cursor: 'pointer', marginTop: 3, transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
          >▶</span>
        )}
      </div>

      {expanded && (
        <div style={{ paddingLeft: 24, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {task.description && <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: '#a6adc8', whiteSpace: 'pre-wrap' }}>{task.description}</p>}
          {subs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {subs.map(s => (
                <div key={s.id} onClick={() => onToggleSubtask(task.id, s.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '1px 0' }}>
                  <span style={{
                    width: 13, height: 13, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8,
                    border: s.done ? '1.5px solid #a6e3a1' : '1.5px solid #585b70', color: s.done ? '#a6e3a1' : 'transparent',
                  }}>✓</span>
                  <span style={{ fontSize: 11, color: '#a6adc8', textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.5 : 1 }}>{s.title}</span>
                </div>
              ))}
            </div>
          )}
          {task.context && <div style={{ fontSize: 10, color: '#585b70' }}>📎 {t('tasks.from')} {task.context.label || task.context.kind}</div>}
          {!isDone && (
            editing ? (
              <TaskEditForm task={task} onSave={(u) => { onUpdateTask(task.id, u); setEditing(false); }} onCancel={() => setEditing(false)} />
            ) : (
              <button
                onClick={() => setEditing(true)}
                style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, cursor: 'pointer', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.06)' }}
              >{t('tasks.edit')}</button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** Inline editor for an existing task — mirrors the QuickAdd field set. */
function TaskEditForm({ task, onSave, onCancel }: {
  task: TodayTaskUI; onSave: (u: UpdateTaskInput) => void; onCancel: () => void;
}) {
  useLocale();
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState(task.priority);
  const [category, setCategory] = useState(task.category || 'personal');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [dueTime, setDueTime] = useState(task.dueTime || '');
  const [recurrence, setRecurrence] = useState(task.recurrence || 'none');
  const [reminderLead, setReminderLead] = useState<number>(task.reminderLead ?? -1);
  const small: React.CSSProperties = { ...INPUT_STYLE, flex: 1, minWidth: 0, fontSize: 10, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...INPUT_STYLE, width: '100%' }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={priority} onChange={(e) => setPriority(e.target.value as TodayTaskUI['priority'])} style={small}>
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p} style={{ background: '#1a1028' }}>{t(`tasks.priority_${p}`)}</option>)}
        </select>
        <input list="ide-edit-cats" value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...small, cursor: 'text' }} />
        <datalist id="ide-edit-cats">{CATEGORY_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={small} />
        <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={small} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly')} style={small}>
          {RECURRENCE_OPTIONS.map(r => <option key={r} value={r} style={{ background: '#1a1028' }}>{t(`tasks.recurrence_${r}`)}</option>)}
        </select>
        <select value={reminderLead} onChange={(e) => setReminderLead(Number(e.target.value))} style={small}>
          {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value} style={{ background: '#1a1028' }}>{t(r.key)}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onSave({ title: title.trim() || task.title, priority, category, due_date: dueDate || undefined, due_time: dueTime || undefined, recurrence, reminder_lead: reminderLead })}
          style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, background: '#a855f7', color: 'white', cursor: 'pointer' }}>{t('tasks.save')}</button>
        <button onClick={onCancel} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 500, background: 'transparent', color: '#a6adc8', cursor: 'pointer' }}>{t('tasks.cancel')}</button>
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
  useLocale();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('personal');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [recurrence, setRecurrence] = useState('none');
  const [reminderLead, setReminderLead] = useState(-1);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subInput, setSubInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  const reset = () => {
    setTitle(''); setPriority('medium'); setCategory('personal'); setDueDate('');
    setDueTime(''); setRecurrence('none'); setReminderLead(-1); setSubtasks([]); setSubInput('');
  };

  const addSub = () => { const v = subInput.trim(); if (!v) return; setSubtasks(s => [...s, v]); setSubInput(''); };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const due = dueDate || (defaultDueToday ? new Date().toISOString().slice(0, 10) : undefined);
    onCreate({
      title: trimmed, priority, category, due_date: due,
      due_time: dueTime || undefined,
      recurrence: recurrence !== 'none' ? recurrence : undefined,
      reminder_lead: reminderLead >= 0 ? reminderLead : undefined,
      subtasks: subtasks.length ? subtasks : undefined,
    });
    reset();
    setOpen(false);
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
        {t('tasks.add_task')}
      </button>
    );
  }

  const mInput: React.CSSProperties = { ...INPUT_STYLE, width: '100%', fontSize: 12, padding: '8px 10px' };
  const fieldLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086', marginBottom: 5, display: 'block' };

  // A clean, centred overlay — roomy, every field on show (no "More" toggle).
  return (
    <div
      onClick={cancel}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,6,18,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(30,18,46,0.99) 0%, rgba(22,14,36,1) 100%)',
          border: '1px solid rgba(168,85,247,0.3)', borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)', padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#cdd6f4' }}>{t('tasks.new_task')}</span>
          <button onClick={cancel} aria-label={t('tasks.cancel')} style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.04)', color: '#a6adc8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') cancel(); }}
          placeholder={t('tasks.add_placeholder')}
          style={{ ...mInput, fontSize: 15, padding: '11px 12px' }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={fieldLabel}>{t('tasks.priority')}</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ ...mInput, cursor: 'pointer' }}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p} style={{ background: '#1a1028' }}>{t(`tasks.priority_${p}`)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <span style={fieldLabel}>{t('tasks.category')}</span>
            <input list="ide-quickadd-categories" value={category} onChange={(e) => setCategory(e.target.value)} style={mInput} />
            <datalist id="ide-quickadd-categories">{CATEGORY_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={fieldLabel}>{t('tasks.due_date')}</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ ...mInput, cursor: 'pointer' }} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={fieldLabel}>{t('tasks.due_time')}</span>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={{ ...mInput, cursor: 'pointer' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={fieldLabel}>{t('tasks.recurrence')}</span>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} style={{ ...mInput, cursor: 'pointer' }}>
              {RECURRENCE_OPTIONS.map(r => <option key={r} value={r} style={{ background: '#1a1028' }}>{t(`tasks.recurrence_${r}`)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <span style={fieldLabel}>{t('tasks.reminder')}</span>
            <select value={reminderLead} onChange={(e) => setReminderLead(Number(e.target.value))} style={{ ...mInput, cursor: 'pointer' }}>
              {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value} style={{ background: '#1a1028' }}>{t(r.key)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <span style={fieldLabel}>{t('tasks.subtasks')}</span>
          {subtasks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {subtasks.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 13, height: 13, borderRadius: 3, border: '1.5px solid #585b70', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#a6adc8' }}>{s}</span>
                  <button onClick={() => setSubtasks(arr => arr.filter((_, j) => j !== i))} aria-label="Remove" style={{ background: 'none', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={subInput} onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }} placeholder={t('tasks.add_step')} style={{ ...mInput, flex: 1 }} />
            <button onClick={addSub} style={{ padding: '0 14px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', color: '#a855f7', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t('tasks.add')}</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={submit}
            disabled={!title.trim()}
            style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 600, background: '#a855f7', color: 'white', cursor: title.trim() ? 'pointer' : 'default', opacity: title.trim() ? 1 : 0.4 }}
          >
            {t('tasks.create_task')}
          </button>
          <button onClick={cancel} style={{ padding: '11px 18px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 500, background: 'rgba(255,255,255,0.05)', color: '#a6adc8', cursor: 'pointer' }}>{t('tasks.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Ava band — sticky live-work indicator ───────────────────────────────── */

function AvaBand({ sessionTasks }: { sessionTasks: SessionTaskUI[] }) {
  useLocale();
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
            {t('tasks.ava')}
          </span>
          <span style={{ fontSize: 10, color: '#6c7086', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {allDone ? t('tasks.all_complete') : current?.title}
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

function YourTasks({ todayTasks, allTasks, filter, onFilterChange, onToggle, onToggleSubtask, onUpdateTask }: {
  todayTasks: TodayTaskUI[]; allTasks: TodayTaskUI[];
  filter: 'today' | 'all'; onFilterChange: (f: 'today' | 'all') => void; onToggle: (id: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUpdateTask: (taskId: string, updates: UpdateTaskInput) => void;
}) {
  useLocale();
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
            {f === 'today' ? t('tasks.filter_today') : t('tasks.filter_all')}
          </button>
        ))}
      </div>

      {active.length > 0 && (
        <CollapsibleSection title={t('tasks.section_active')} count={active.length} defaultOpen>
          {active.map(t => <TaskItem key={t.id} task={t} onToggle={onToggle} onToggleSubtask={onToggleSubtask} onUpdateTask={onUpdateTask} />)}
        </CollapsibleSection>
      )}

      {done.length > 0 && (
        <CollapsibleSection title={t('tasks.section_done')} count={done.length} defaultOpen={false}>
          {done.map(t => <TaskItem key={t.id} task={t} onToggle={onToggle} onToggleSubtask={onToggleSubtask} onUpdateTask={onUpdateTask} />)}
        </CollapsibleSection>
      )}

      {tasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
          <div style={{ fontSize: 12, color: '#6c7086' }}>
            {filter === 'today' ? t('tasks.empty_today') : t('tasks.empty_all')}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Ava recent work — collapsible history at the bottom ──────────────────── */

function AvaRecentWork({ avaCompletedTasks }: { avaCompletedTasks: AvaCompletedTaskUI[] }) {
  useLocale();
  return (
    <div style={{ padding: '4px 12px 12px', borderTop: '1px solid rgba(168,85,247,0.08)' }}>
      <CollapsibleSection title={t('tasks.ava_recent_work')} count={avaCompletedTasks.length} defaultOpen={false}>
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
  useLocale();
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
        title={t('tasks.open_tasks')}
        aria-label={t('tasks.open_tasks')}
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
        title={t('tasks.open_tasks')}
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
          {t('tasks.tasks')}
        </span>
      </button>
    </div>
  );
}

/* ── Main Panel ──────────────────────────────────────────────────────────── */

export default function IdeTasksPanel({
  sessionTasks, avaCompletedTasks, todayTasks, allTasks,
  onClose, onToggleTask, onCreateTask, onToggleSubtask, onUpdateTask, onOpenFolder, width, onWidthChange,
}: Props) {
  useLocale();
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
        title={t('tasks.collapse')}
        aria-label={t('tasks.collapse')}
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
          {t('tasks.tasks')}
        </span>
        {/* Open the on-disk tasks folder — mirrors the Library's open-folder. */}
        <button
          onClick={onOpenFolder}
          title={t('tasks.open_folder')}
          aria-label={t('tasks.open_folder')}
          style={{ marginLeft: 'auto', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: 'none', background: 'transparent', color: '#6c7086', cursor: 'pointer' }}
          onMouseOver={(e) => { e.currentTarget.style.color = '#a855f7'; e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = '#6c7086'; e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.75 3.5A1.75 1.75 0 0 1 3.5 1.75h2.19c.46 0 .9.18 1.23.51l.82.82h4.51c.97 0 1.75.78 1.75 1.75v7.41c0 .97-.78 1.75-1.75 1.75H3.5a1.75 1.75 0 0 1-1.75-1.75V3.5z" />
          </svg>
        </button>
      </div>

      {/* Quick add — pinned under the header. */}
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        <QuickAdd onCreate={onCreateTask} defaultDueToday={filter === 'today'} />
      </div>

      {/* Body — your tasks fill it; Ava's live work pins to the top when she's
          working; her recent work tucks away at the bottom. */}
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
        {sessionTasks.length > 0 && <AvaBand sessionTasks={sessionTasks} />}
        <YourTasks todayTasks={todayTasks} allTasks={allTasks} filter={filter} onFilterChange={setFilter} onToggle={onToggleTask} onToggleSubtask={onToggleSubtask} onUpdateTask={onUpdateTask} />
        {avaCompletedTasks.length > 0 && <AvaRecentWork avaCompletedTasks={avaCompletedTasks} />}
      </div>
    </div>
  );
}
