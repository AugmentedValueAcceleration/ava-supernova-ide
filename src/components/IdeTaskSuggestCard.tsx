import { useState } from 'react';
import { Combobox } from './Combobox';
import { DateField } from './MiniDatePicker';

/**
 * Task-suggestion card (IDE) — "Ava suggests, you decide".
 *
 * Rendered in the main chat's confirm flow when Ava calls task_suggest. The
 * task is NEVER written until the user taps Add; Dismiss persists nothing.
 * Mirrors the extension's TaskSuggestCard (inline-styled for the IDE).
 */

interface Props {
  args: Record<string, unknown>;
  onAdd: (payload: Record<string, unknown>) => void;
  onDismiss: () => void;
}

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const CATEGORY_OPTIONS = ['personal', 'coding', 'admin', 'meeting', 'health', 'finance', 'errands', 'study', 'home'];
const RECURRENCE_OPTIONS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];
const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: -1, label: 'No reminder' }, { value: 0, label: 'At time' }, { value: 10, label: '10 min before' },
  { value: 30, label: '30 min before' }, { value: 60, label: '1 hour before' }, { value: 1440, label: '1 day before' },
];
const REMINDER_ENUM_TO_MIN: Record<string, number> = { at_time: 0, '10m': 10, '30m': 30, '1h': 60, '1d': 1440 };

const INPUT: React.CSSProperties = {
  background: 'rgba(49, 34, 68, 0.5)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 6,
  color: '#cdd6f4', fontSize: 11, padding: '5px 8px', outline: 'none',
};

export function IdeTaskSuggestCard({ args, onAdd, onDismiss }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(String(args.title ?? ''));
  const [priority, setPriority] = useState(String(args.priority ?? 'medium'));
  const [category, setCategory] = useState(String(args.category ?? 'personal'));
  const [dueDate, setDueDate] = useState(String(args.due_date ?? ''));
  const [dueTime, setDueTime] = useState(String(args.due_time ?? ''));
  const [recurrence, setRecurrence] = useState(String(args.recurrence ?? 'none'));
  const [reminderLead, setReminderLead] = useState<number>(
    typeof args.reminder === 'string' && args.reminder in REMINDER_ENUM_TO_MIN ? REMINDER_ENUM_TO_MIN[args.reminder as string] : -1,
  );
  const note = typeof args.note === 'string' ? args.note : undefined;
  const subtasks = Array.isArray(args.subtasks) ? (args.subtasks as unknown[]).map(String) : [];
  const small: React.CSSProperties = { ...INPUT, flex: 1, minWidth: 0, fontSize: 10, cursor: 'pointer' };

  const add = () => onAdd({
    title: title.trim() || String(args.title ?? ''),
    description: note,
    priority, category,
    due_date: dueDate || undefined,
    due_time: dueTime || undefined,
    reminder_lead: reminderLead >= 0 ? reminderLead : undefined,
    recurrence: recurrence !== 'none' ? recurrence : undefined,
    subtasks: subtasks.length ? subtasks : undefined,
  });

  const chip = (label: string) => (
    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 600, color: '#bac2de', background: 'color-mix(in srgb, var(--accent) 14%, transparent)' }}>{label}</span>
  );

  return (
    <div style={{ borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'color-mix(in srgb, var(--accent) 7%, transparent)', padding: 14, maxWidth: 420 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>🗒️</span>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--accent)' }}>Ava suggests a task</span>
      </div>

      {!editing ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{title || String(args.title ?? '')}</div>
          {note && <div style={{ marginTop: 3, fontSize: 11, color: '#a6adc8' }}>{note}</div>}
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {category && chip(category)}
            {priority !== 'medium' && chip(priority)}
            {dueDate && chip(`${dueDate}${dueTime ? ` · ${dueTime}` : ''}`)}
            {!dueDate && dueTime && chip(dueTime)}
            {recurrence !== 'none' && chip(`↻ ${recurrence}`)}
            {reminderLead >= 0 && chip(`🔔 ${REMINDER_OPTIONS.find(o => o.value === reminderLead)?.label}`)}
            {subtasks.length > 0 && chip(`☑ ${subtasks.length}`)}
          </div>
          {subtasks.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 4, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {subtasks.map((s, i) => (
                <li key={i} style={{ fontSize: 11, color: '#a6adc8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block', flexShrink: 0 }} /> {s}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...INPUT, width: '100%' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={small}>
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p} style={{ background: '#1a1028' }}>{p}</option>)}
            </select>
            {/* Themed Combobox rather than <input list> + <datalist>, whose
                dropdown the browser draws (light, unstyleable). Still free-form. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Combobox value={category} onChange={setCategory} options={CATEGORY_OPTIONS} style={{ ...small, flex: undefined, width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Our MiniDatePicker, not the native (light) browser calendar. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <DateField value={dueDate || null} onChange={(iso) => setDueDate(iso ?? '')} style={{ ...small, flex: undefined, width: '100%' }} />
            </div>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} style={small} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} style={small}>
              {RECURRENCE_OPTIONS.map(r => <option key={r} value={r} style={{ background: '#1a1028' }}>{r}</option>)}
            </select>
            <select value={reminderLead} onChange={(e) => setReminderLead(Number(e.target.value))} style={small}>
              {REMINDER_OPTIONS.map(r => <option key={r.value} value={r.value} style={{ background: '#1a1028' }}>{r.label}</option>)}
            </select>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={add} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: 'white', cursor: 'pointer' }}>Add</button>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'transparent', cursor: 'pointer' }}>Edit &amp; add</button>
        )}
        <button onClick={onDismiss} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 500, background: 'transparent', color: '#a6adc8', cursor: 'pointer' }}>Dismiss</button>
      </div>
    </div>
  );
}
