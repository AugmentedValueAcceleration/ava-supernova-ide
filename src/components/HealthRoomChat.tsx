import { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip as PhPaperclip } from '@phosphor-icons/react';
import { t, useLocale } from '../lib/i18n';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { ProfileFieldCard } from './ProfileFieldCard';
import { RoomModelPicker } from './RoomModelPicker';

interface RoomAttachment { name: string; dataUri: string; mimeType: string }

/**
 * Ava Health & Fitness room — a purpose-built, slim chat surface for the IDE
 * Health page. It is NOT the main AvaChatPage: it runs on the health lane (its
 * own sidecar conversation thread), is locked to health (no mode switch, no
 * Tasks, no model picker), and renders only its own stream by filtering events
 * for `lane === 'health'`. Mirrors the extension's focused room.
 *
 * Sends via getSidecar().sendMessage(content, undefined, undefined, 'health').
 * The sidecar applies getHealthRoomPrefix + the profile summary and replies on
 * the health lane; AvaChatPage ignores lane==='health' so the two never cross.
 */

interface ToolChip { name: string; status: 'running' | 'done' | 'error' }
interface RoomMessage {
  id: string;
  role: 'user' | 'ava' | 'error';
  text: string;
  toolCalls?: ToolChip[];
}
interface PendingConfirm { id: string; toolName: string; question: string; profileField?: { field: string; question: string; currentValue?: unknown } }

let _rid = 0;
const rid = () => `hr-${++_rid}-${Date.now()}`;

/**
 * Persistence for the Health room's messages. The HealthPage (and this room)
 * unmounts on navigation AND a full webview reload wipes JS memory — both would
 * otherwise clear the conversation. Two layers: a module cache for instant
 * restore across navigation, and sessionStorage of the messages so a reload
 * survives too (it clears when the webview truly closes, lining up with the
 * sidecar starting a fresh healthConversation). Cleared by the Clear button.
 */
let healthRoomMessagesCache: RoomMessage[] | null = null;
const HR_MSGS_KEY = 'ava-health-room-messages';

// Main-chat → Health room handoff seed (the user's specific request, carried
// from open_health_room's `primer`). Set by the handoff button before
// navigating; drained on mount/activation and auto-sent so the conversation
// continues. Module-level to survive the post-navigation mount. Consume-once,
// empty-thread only.
let pendingHealthSeed: string | null = null;
export function seedHealthRoom(primer: string): void { pendingHealthSeed = primer ? primer.trim() : null; }
function readRoomMessages(): RoomMessage[] | null {
  try { const raw = sessionStorage.getItem(HR_MSGS_KEY); const v = raw ? JSON.parse(raw) : null; return Array.isArray(v) && v.length ? v : null; } catch { return null; }
}
function writeRoomMessages(messages: RoomMessage[]): void {
  try { sessionStorage.setItem(HR_MSGS_KEY, JSON.stringify(messages)); } catch { /* quota / unavailable */ }
}
function clearRoomMessages(): void {
  try { sessionStorage.removeItem(HR_MSGS_KEY); } catch { /* ignore */ }
}

const STARTERS: Array<{ icon: string; labelKey: string; promptKey: string }> = [
  { icon: '🏋', labelKey: 'health.room.starter.fitness',   promptKey: 'health.room.starter.fitness_prompt' },
  { icon: '🍳', labelKey: 'health.room.starter.meal',      promptKey: 'health.room.starter.meal_prompt' },
  { icon: '🔥', labelKey: 'health.room.starter.combined',  promptKey: 'health.room.starter.combined_prompt' },
  { icon: '🩹', labelKey: 'health.room.starter.injury',    promptKey: 'health.room.starter.injury_prompt' },
  { icon: '🥗', labelKey: 'health.room.starter.nutrition', promptKey: 'health.room.starter.nutrition_prompt' },
  { icon: '💪', labelKey: 'health.room.starter.exercise',  promptKey: 'health.room.starter.exercise_prompt' },
];

export function HealthRoomChat({ active }: { active: boolean }) {
  useLocale();
  // Rehydrate so the conversation survives navigation (module cache) and a
  // full reload (sessionStorage messages).
  const [messages, setMessages] = useState<RoomMessage[]>(() => healthRoomMessagesCache ?? readRoomMessages() ?? []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [attachments, setAttachments] = useState<RoomAttachment[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Snapshot messages (cheap module cache for navigation); persist to
  // sessionStorage once a turn settles (gated on !streaming to avoid a
  // serialize-per-token storm) so a reload restores them.
  useEffect(() => {
    healthRoomMessagesCache = messages;
    if (!streaming) writeRoomMessages(messages);
  }, [messages, streaming]);

  // Mirror of `messages` for the send path. `messages` changes on every stream
  // token, so reading it through a ref keeps send() out of that churn instead
  // of rebuilding the callback hundreds of times a turn.
  const messagesRef = useRef<RoomMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Subscribe to the sidecar, processing ONLY health-lane events.
  useEffect(() => {
    const handler = (event: SidecarEvent) => {
      if (event.lane !== 'health') return;
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
          // health_profile_ask (and ask_user) need user input in the room.
          // Render an inline card; the answer resolves the sidecar's pending
          // confirmation. Without this the agent would hang on the health lane.
          if (event.id) {
            const pf = event.profileField;
            const question = pf?.question || (event.args?.question as string) || '';
            setPendingConfirm({ id: event.id, toolName: event.toolName || '', question, profileField: pf });
          }
          break;
        case 'tool_call_start':
          // The profile-fill card IS the surface for health_profile_ask — don't
          // also show a tool chip for it.
          if (event.toolName === 'health_profile_ask') break;
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
    // Replay the restored conversation — the room rehydrates its bubbles from
    // sessionStorage / the module cache, but the sidecar's health thread is
    // IN-MEMORY, so a fresh sidecar would be answering about a conversation it
    // has never seen. Same contract the main chat and the Design dock use;
    // `messagesRef` is still pre-update here, so this is everything BEFORE the
    // new turn, which goes as `content`.
    const history = messagesRef.current
      .filter((m) => (m.role === 'user' || m.role === 'ava') && m.text.trim())
      .map((m) => ({ role: m.role === 'ava' ? 'assistant' : 'user', text: m.text }));
    getSidecar().sendMessage(text || '(see attachment)', atts, history.length ? history : undefined, 'health').catch(() => setStreaming(false));
  }, [streaming, attachments]);

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

  // Drain the main-chat handoff seed on mount/activation: if this is a fresh
  // thread, auto-send the user's carried request so Ava continues the
  // conversation. Consume-once (null after) + empty-thread guard. The user's
  // message shows immediately so it never looks frozen, but the actual send
  // waits for the in-flight main-chat turn to finish — otherwise the sidecar
  // would fold it into that turn as an interjection.
  useEffect(() => {
    if (active && pendingHealthSeed && messages.length === 0) {
      const seed = pendingHealthSeed;
      pendingHealthSeed = null;
      setMessages([{ id: rid(), role: 'user', text: seed }, { id: rid(), role: 'ava', text: '', toolCalls: [] }]);
      setStreaming(true);
      getSidecar().waitForIdle().then(() => {
        getSidecar().sendMessage(seed, undefined, undefined, 'health').catch(() => setStreaming(false));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Answer / skip a profile-fill (or generic) confirmation card.
  const respondConfirm = useCallback((value: unknown) => {
    // Side effect OUTSIDE the setState updater — StrictMode double-invokes
    // updaters in dev, which double-fired confirm() → "No pending confirmation".
    const pc = pendingConfirm;
    if (!pc) return;
    setPendingConfirm(null);
    if (pc.toolName === 'health_profile_ask' && pc.profileField) {
      getSidecar().confirm(pc.id, true, JSON.stringify({ field: pc.profileField.field, value })).catch(() => {});
    } else {
      getSidecar().confirm(pc.id, true, typeof value === 'string' ? value : JSON.stringify(value)).catch(() => {});
    }
  }, [pendingConfirm]);
  const skipConfirm = useCallback(() => {
    const pc = pendingConfirm;
    if (!pc) return;
    setPendingConfirm(null);
    if (pc.toolName === 'health_profile_ask' && pc.profileField) {
      getSidecar().confirm(pc.id, true, JSON.stringify({ field: pc.profileField.field, skipped: true })).catch(() => {});
    } else {
      getSidecar().confirm(pc.id, false).catch(() => {});
    }
  }, [pendingConfirm]);

  // Clear ONLY this room's thread (the health lane). The main chat is untouched.
  const clearRoom = useCallback(() => {
    setMessages([]);
    setPendingConfirm(null);
    healthRoomMessagesCache = null;
    clearRoomMessages();
    getSidecar().clear('health').catch(() => {});
  }, []);

  const hasSpoken = messages.some((m) => m.role === 'user');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Safety disclaimer + model picker + Clear chat */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border, #2a2440)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', padding: '8px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, fontSize: 11, lineHeight: 1.4, color: 'var(--text-muted, #8b8398)' }}>
          {t('health.room.disclaimer')}{' '}
          <button
            type="button"
            onClick={() => { try { window.open('https://avasupernova.com/health/safety', '_blank'); } catch { /* no window */ } }}
            style={{ border: 'none', background: 'transparent', padding: 0, color: '#a78bfa', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', fontSize: 11 }}
          >
            {t('health.browse.safety_link')}
          </button>
        </div>
        <RoomModelPicker />
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearRoom}
            title={t('header.clear_chat')}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            {t('header.clear_chat')}
          </button>
        )}
      </div>

      {/* Stream */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {/* Full-width content, matching the extension room (w-full). */}
        {!hasSpoken ? (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#cdd6f4' }}>{t('health.room.greeting', { name: '' })}</span>
            </div>
            <div style={{ borderRadius: 14, padding: 16, marginTop: 10, background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), rgba(96,165,250,0.04))', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>{t('health.room.starter.heading')}</div>
              <p style={{ fontSize: 12, lineHeight: 1.5, color: '#a6adc8', margin: '0 0 14px' }}>{t('health.room.starter.subheading')}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STARTERS.map((s) => (
                  <button
                    key={s.labelKey}
                    type="button"
                    onClick={() => { setInput(t(s.promptKey)); inputRef.current?.focus(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'rgba(26,16,40,0.5)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: '#cdd6f4', cursor: 'pointer' }}
                  >
                    <span aria-hidden>{s.icon}</span>{t(s.labelKey)}
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
                    fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', padding: '10px 14px', borderRadius: 10,
                    background: m.role === 'user' ? 'color-mix(in srgb, #60a5fa 13%, transparent)' : m.role === 'error' ? 'rgba(243,139,168,0.12)' : 'color-mix(in srgb, var(--accent) 6%, transparent)',
                    border: m.role === 'error' ? '1px solid rgba(243,139,168,0.3)' : 'none',
                    borderLeft: m.role === 'user' ? '2px solid color-mix(in srgb, #60a5fa 55%, transparent)' : m.role === 'error' ? undefined : '2px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                    borderRight: m.role === 'user' ? '2px solid color-mix(in srgb, #60a5fa 55%, transparent)' : m.role === 'error' ? undefined : '2px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                    color: m.role === 'error' ? '#f38ba8' : '#cdd6f4',
                  }}>
                    {m.text}
                  </div>
                )}
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.text === '' && !pendingConfirm && (
              <div style={{ fontSize: 12, color: '#8b8398', fontStyle: 'italic' }}>{t('health.room.mode_label')} · …</div>
            )}
          </div>
        )}
        {/* Inline confirmation — the profile-fill card (or a generic prompt) */}
        {pendingConfirm && (
          <div style={{ marginTop: 12 }}>
            <ProfileFieldCard
              field={pendingConfirm.profileField?.field ?? ''}
              question={pendingConfirm.question}
              currentValue={pendingConfirm.profileField?.currentValue}
              onSubmit={respondConfirm}
              onSkip={skipConfirm}
            />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer — locked to health. Minimal action set: attach + send only. */}
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
            {t('health.room.mode_label')}
          </span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={t('health.room.starter.subheading')}
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
