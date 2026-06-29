import { useState, useEffect, useRef, useCallback } from 'react';
import { t, useLocale } from '../lib/i18n';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { RoomModelPicker } from './RoomModelPicker';
import {
  GraduationCap as PhGraduationCap,
  BookOpen as PhBookOpen,
  Lightbulb as PhLightbulb,
  ArrowsClockwise as PhArrowsClockwise,
  Paperclip as PhPaperclip,
} from '@phosphor-icons/react';

interface RoomAttachment { name: string; dataUri: string; mimeType: string }

/**
 * Ava Learning room — the IDE Learning page's "Ava" tab. A slim, focused chat
 * surface that runs on the *learning* lane (its own per-course sidecar thread),
 * is locked to Teach mode (no mode switch / Tasks / model picker), and renders
 * only its own stream by filtering events for `lane === 'learning'`. Mirrors the
 * extension's focused Learning room.
 *
 * Per-course threading: each course owns its own conversation. The `courseId`
 * prop keys both the sidecar thread (sent on every turn) and this component's
 * message persistence, so switching the active course swaps the whole chat. The
 * page remounts this component via a React `key` on courseId, so internal state
 * is naturally scoped per course; the caches below are the cross-navigation /
 * reload safety net. `__lobby__` is the no-active-course landing thread.
 */

interface ToolChip { name: string; status: 'running' | 'done' | 'error' }
interface RoomMessage {
  id: string;
  role: 'user' | 'ava' | 'error';
  text: string;
  toolCalls?: ToolChip[];
}
interface PendingConfirm { id: string; toolName: string; question: string }

let _rid = 0;
const rid = () => `lr-${++_rid}-${Date.now()}`;

const LOBBY = '__lobby__';

// Main-chat → Learning room handoff seed. The handoff button sets this (the
// user's specific request, carried from open_learning_room's `primer`) right
// before navigating; the room drains it on mount and auto-sends it so the
// conversation continues instead of starting cold. Module-level so it survives
// the page mount that happens after navigation. Consumed once, only into an
// empty thread.
let pendingLearningSeed: string | null = null;
export function seedLearningRoom(primer: string): void { pendingLearningSeed = primer ? primer.trim() : null; }

// Per-course message persistence. A module cache gives instant restore across
// navigation; sessionStorage (keyed by course) survives a full webview reload,
// lining up with the sidecar keeping a per-course conversation alive. Cleared
// by the Clear button for that course only.
const roomCache = new Map<string, RoomMessage[]>();
const msgsKey = (courseId?: string) => `ava-learning-room-messages:${courseId || LOBBY}`;
function readRoomMessages(courseId?: string): RoomMessage[] | null {
  try { const raw = sessionStorage.getItem(msgsKey(courseId)); const v = raw ? JSON.parse(raw) : null; return Array.isArray(v) && v.length ? v : null; } catch { return null; }
}
function writeRoomMessages(courseId: string | undefined, messages: RoomMessage[]): void {
  try { sessionStorage.setItem(msgsKey(courseId), JSON.stringify(messages)); } catch { /* quota / unavailable */ }
}

const STARTERS: Array<{ Icon: typeof PhBookOpen; labelKey: string; promptKey: string }> = [
  { Icon: PhGraduationCap,    labelKey: 'learning.room.starter.course',  promptKey: 'learning.room.starter.course_prompt' },
  { Icon: PhArrowsClockwise,  labelKey: 'learning.room.starter.resume',  promptKey: 'learning.room.starter.resume_prompt' },
  { Icon: PhLightbulb,        labelKey: 'learning.room.starter.explain', promptKey: 'learning.room.starter.explain_prompt' },
  { Icon: PhBookOpen,         labelKey: 'learning.room.starter.learn',   promptKey: 'learning.room.starter.learn_prompt' },
];

export function LearningRoomChat({ active, courseId }: { active: boolean; courseId?: string }) {
  useLocale();
  const [messages, setMessages] = useState<RoomMessage[]>(() => roomCache.get(courseId || LOBBY) ?? readRoomMessages(courseId) ?? []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [attachments, setAttachments] = useState<RoomAttachment[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Snapshot to the module cache every change; persist to sessionStorage once a
  // turn settles (gated on !streaming to avoid a serialize-per-token storm).
  useEffect(() => {
    roomCache.set(courseId || LOBBY, messages);
    if (!streaming) writeRoomMessages(courseId, messages);
  }, [messages, streaming, courseId]);

  // Subscribe to the sidecar, processing ONLY learning-lane events.
  useEffect(() => {
    const handler = (event: SidecarEvent) => {
      if (event.lane !== 'learning') return;
      switch (event.event) {
        case 'stream_delta':
          if (event.content) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'ava') copy[copy.length - 1] = { ...last, text: last.text + event.content };
              return copy;
            });
          }
          break;
        case 'confirm_required':
          // ask_user needs an answer in the room — without this the agent hangs.
          if (event.id) {
            const question = (event.args?.question as string) || '';
            setPendingConfirm({ id: event.id, toolName: event.toolName || '', question });
            setConfirmText('');
          }
          break;
        case 'tool_call_start':
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'ava') {
              copy[copy.length - 1] = { ...last, toolCalls: [...(last.toolCalls || []), { name: event.toolName || 'tool', status: 'running' }] };
            }
            return copy;
          });
          break;
        case 'tool_call_end':
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'ava' && last.toolCalls) {
              const tools = [...last.toolCalls];
              const idx = tools.findIndex((tc) => tc.name === event.toolName && tc.status === 'running');
              if (idx >= 0) { tools[idx] = { ...tools[idx], status: event.success ? 'done' : 'error' }; copy[copy.length - 1] = { ...last, toolCalls: tools }; }
            }
            return copy;
          });
          break;
        case 'done':
        case 'stopped':
        case 'cancelled':
          setStreaming(false);
          break;
        case 'error':
          setMessages((prev) => [...prev, { id: rid(), role: 'error', text: event.message || 'Something went wrong.' }]);
          setStreaming(false);
          break;
      }
    };
    getSidecar().onAny(handler);
    return () => { getSidecar().offAny(handler); };
  }, []);

  useEffect(() => { if (active) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, active, pendingConfirm]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if ((!text && attachments.length === 0) || streaming) return;
    const atts = attachments.length ? attachments : undefined;
    setMessages((prev) => [...prev, { id: rid(), role: 'user', text: text || '(attachment)' }, { id: rid(), role: 'ava', text: '', toolCalls: [] }]);
    setStreaming(true);
    setInput('');
    setAttachments([]);
    getSidecar().sendMessage(text || '(see attachment)', atts, undefined, 'learning', courseId).catch(() => setStreaming(false));
  }, [streaming, courseId, attachments]);

  const handleAttach = useCallback(() => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*,.pdf,.docx,.xlsx,.pptx,.csv,.txt,.md';
    picker.multiple = true;
    picker.onchange = () => {
      if (!picker.files) return;
      for (const file of Array.from(picker.files)) {
        const reader = new FileReader();
        reader.onload = () => setAttachments((prev) => [...prev, { name: file.name, dataUri: reader.result as string, mimeType: file.type }]);
        reader.readAsDataURL(file);
      }
    };
    picker.click();
  }, []);
  const removeAttachment = useCallback((idx: number) => setAttachments((prev) => prev.filter((_, i) => i !== idx)), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  // Course-path sidebar seeds a lesson via this window event — send it straight
  // to Ava so clicking a lesson delivers it in the chat.
  useEffect(() => {
    const onSeed = (e: Event) => {
      const text = (e as CustomEvent).detail as string;
      if (text) send(text);
    };
    window.addEventListener('ava-learning-seed', onSeed);
    return () => window.removeEventListener('ava-learning-seed', onSeed);
  }, [send]);

  // Drain the main-chat handoff seed on mount/activation: if this is a fresh
  // thread, auto-send the user's carried request so Ava continues the
  // conversation. Consume-once (null after) + empty-thread guard. The user's
  // message + a streaming placeholder show immediately so it never looks frozen,
  // but the actual send waits for the in-flight main-chat turn to finish —
  // otherwise the sidecar would fold it into that turn as an interjection.
  useEffect(() => {
    if (active && pendingLearningSeed && messages.length === 0) {
      const seed = pendingLearningSeed;
      pendingLearningSeed = null;
      setMessages([{ id: rid(), role: 'user', text: seed }, { id: rid(), role: 'ava', text: '', toolCalls: [] }]);
      setStreaming(true);
      getSidecar().waitForIdle().then(() => {
        getSidecar().sendMessage(seed, undefined, undefined, 'learning', courseId).catch(() => setStreaming(false));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const respondConfirm = useCallback(() => {
    setPendingConfirm((pc) => {
      if (!pc) return null;
      getSidecar().confirm(pc.id, true, confirmText.trim()).catch(() => {});
      return null;
    });
    setConfirmText('');
  }, [confirmText]);
  const skipConfirm = useCallback(() => {
    setPendingConfirm((pc) => {
      if (!pc) return null;
      getSidecar().confirm(pc.id, false).catch(() => {});
      return null;
    });
    setConfirmText('');
  }, []);

  const hasSpoken = messages.some((m) => m.role === 'user');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header — mode badge + model picker. No "clear chat": the Learning room
          is course-based (the thread IS the course), so clearing it isn't offered. */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border, #2a2440)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, lineHeight: 1.4, color: 'var(--text-muted, #8b8398)' }}>
          <PhGraduationCap size={14} weight="duotone" style={{ color: 'var(--accent)' }} />
          {t('learning.room.intro')}
        </div>
        <RoomModelPicker />
      </div>

      {/* Stream */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {!hasSpoken ? (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#cdd6f4' }}>{t('learning.room.greeting')}</span>
            </div>
            <div style={{ borderRadius: 14, padding: 16, marginTop: 10, background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), rgba(96,165,250,0.04))', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>{t('learning.room.starter.heading')}</div>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: '#a6adc8', margin: '0 0 14px' }}>{t('learning.room.starter.subheading')}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STARTERS.map((s) => (
                  <button
                    key={s.labelKey}
                    type="button"
                    onClick={() => { setInput(t(s.promptKey)); inputRef.current?.focus(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'rgba(26,16,40,0.5)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: '#cdd6f4', cursor: 'pointer' }}
                  >
                    <s.Icon size={14} weight="duotone" style={{ color: 'var(--accent)' }} />{t(s.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    {m.toolCalls.map((tc, i) => (
                      <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: tc.status === 'error' ? '#f38ba8' : tc.status === 'done' ? '#a6e3a1' : '#a78bfa' }}>
                        {tc.status === 'done' ? '✓' : tc.status === 'error' ? '✕' : '⋯'} {tc.name}
                      </span>
                    ))}
                  </div>
                )}
                {(m.text || m.role !== 'ava') && (
                  <div style={{
                    fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', padding: '10px 14px', borderRadius: 12,
                    background: m.role === 'user' ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : m.role === 'error' ? 'rgba(243,139,168,0.12)' : 'rgba(255,255,255,0.03)',
                    border: m.role === 'error' ? '1px solid rgba(243,139,168,0.3)' : '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
                    color: m.role === 'error' ? '#f38ba8' : '#cdd6f4',
                  }}>
                    {m.text}
                  </div>
                )}
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.text === '' && !pendingConfirm && (
              <div style={{ fontSize: 12, color: '#8b8398', fontStyle: 'italic' }}>{t('learning.room.mode_label')} · …</div>
            )}
          </div>
        )}
        {/* Inline ask_user confirmation */}
        {pendingConfirm && (
          <div style={{ marginTop: 12, borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
            {pendingConfirm.question && <div style={{ fontSize: 13, color: '#cdd6f4', marginBottom: 10 }}>{pendingConfirm.question}</div>}
            <textarea
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); respondConfirm(); } }}
              rows={2}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', resize: 'none', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'rgba(26,16,40,0.5)', color: '#cdd6f4', padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={respondConfirm} disabled={!confirmText.trim()} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: confirmText.trim() ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 25%, transparent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: confirmText.trim() ? 'pointer' : 'default' }}>{t('ask.submit')}</button>
              <button type="button" onClick={skipConfirm} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'transparent', color: 'var(--text-muted, #8b8398)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t('ask.skip')}</button>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer — locked to Teach. Minimal action set: attach + send only. */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border, #2a2440)', padding: 10 }}>
        {/* Pending attachments preview */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {attachments.map((att, idx) => (
              <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'rgba(26, 16, 40, 0.6)' }}>
                {att.mimeType.startsWith('image/') && att.dataUri?.startsWith('data:') ? (
                  <img src={att.dataUri} alt={att.name} style={{ height: 48, maxWidth: 100, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: '#6c7086', display: 'flex', alignItems: 'center', gap: 6 }}><PhPaperclip size={12} weight="duotone" /> {att.name}</div>
                )}
                <button onClick={() => removeAttachment(idx)} style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <span style={{ flexShrink: 0, alignSelf: 'center', padding: '5px 10px', borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),#7c3aed)', color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {t('learning.room.mode_label')}
          </span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={t('learning.room.starter.subheading')}
            style={{ flex: 1, resize: 'none', minHeight: 38, maxHeight: 160, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'rgba(26,16,40,0.5)', color: '#cdd6f4', padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            type="button"
            onClick={handleAttach}
            title={t('dash.chat.attach_file')}
            aria-label={t('dash.chat.attach_file')}
            style={{ flexShrink: 0, alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', color: '#a6adc8', cursor: 'pointer' }}
          >
            <PhPaperclip size={17} weight="duotone" />
          </button>
          <button
            type="button"
            disabled={streaming || (!input.trim() && attachments.length === 0)}
            onClick={() => send(input)}
            style={{ flexShrink: 0, alignSelf: 'center', padding: '8px 16px', borderRadius: 8, border: 'none', background: streaming || (!input.trim() && attachments.length === 0) ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: streaming || (!input.trim() && attachments.length === 0) ? 'default' : 'pointer' }}
          >
            {streaming ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
