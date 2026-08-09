import { useState } from 'react';
import { tt } from '../lib/i18n';

/**
 * Thumbs up or down on one of Ava's replies, in the IDE.
 *
 * The IDE had no way to say a reply was wrong. The extension has had one for
 * months, so this is not a new idea being introduced — it is the desktop app
 * catching up with the surface beside it, which is the whole point of the two
 * being kept in step.
 *
 * Codes on the wire, words on screen: the extension used to send the translated
 * label it had just rendered, so one complaint counted as several depending on
 * the reader's language. This one has never done that and must not learn to.
 *
 * A thumbs-down can carry a note. Five chips cannot say "it invented a function
 * that does not exist", which is the feedback worth reading. Optional, and
 * skippable with a keystroke — asked only on the negative path, because asking
 * someone who just said "perfect" to elaborate is how you teach people to stop
 * rating things.
 */

const POSITIVE: Array<[string, string, string]> = [
  ['perfect', 'feedback.perfect', 'Perfect'],
  ['helpful', 'feedback.helpful', 'Helpful'],
  ['creative', 'feedback.creative', 'Creative'],
  ['good-explanation', 'feedback.good_explanation', 'Good explanation'],
];

const NEGATIVE: Array<[string, string, string]> = [
  ['wrong', 'feedback.wrong', 'Wrong'],
  ['incomplete', 'feedback.incomplete', 'Incomplete'],
  ['too-verbose', 'feedback.too_verbose', 'Too verbose'],
  ['didnt-understand', 'feedback.didnt_understand', "Didn't understand me"],
  ['off-topic', 'feedback.off_topic', 'Off topic'],
];

const NOTE_MAX = 2000;

/** Stable per install, stored locally. Deliberately a random id rather than a
 *  hardware fingerprint: it exists to stop one person's rating counting twice,
 *  not to recognise anyone. Shared with ContentRating so a single install is
 *  one rater everywhere in the app. */
function localDeviceId(): string {
  const KEY = 'ava.device-id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch {
    return 'session-' + Math.random().toString(36).slice(2, 14);
  }
}

interface Props {
  messageId: string;
  model?: string | null;
  mode?: string | null;
  conversationId?: string | null;
  /** Hidden until the message is hovered, like the copy button beside it. */
  visible: boolean;
}

export function MessageFeedback({ messageId, model, mode, conversationId, visible }: Props) {
  const [picking, setPicking] = useState<'up' | 'down' | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(rating: 'up' | 'down', reason?: string, text?: string) {
    try {
      const res = await fetch('https://avasupernova.com/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId, rating, reason: reason ?? null, note: text ?? null,
          model: model ?? null, mode: mode ?? null,
          conversationId: conversationId ?? null,
          deviceId: localDeviceId(),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || `Could not send that (${res.status}).`);
        return false;
      }
      return true;
    } catch {
      // Shown, never swallowed. Silent failure here means someone tells us
      // five times that a reply was wrong and we hear none of it.
      setError(tt('feedback.send_failed', 'Could not reach the server.'));
      return false;
    }
  }

  async function pick(code: string) {
    if (picking === 'down') {
      // Recorded NOW rather than held until the note is dealt with: someone who
      // picks a reason and then closes the box has still told us something.
      await send('down', code);
      setDetailFor(code);
      setPicking(null);
      return;
    }
    if (await send('up', code)) setDone(true);
  }

  async function finish(text?: string) {
    if (text && detailFor) await send('down', detailFor, text);
    setDetailFor(null);
    setDone(true);
  }

  if (done) {
    return (
      <div style={{ fontSize: 10, color: '#6c7086', padding: '4px 0 0 2px' }}>
        {tt('feedback.thanks', 'Thanks')} ✓
      </div>
    );
  }

  const chipStyle: React.CSSProperties = {
    padding: '3px 9px', borderRadius: 999, fontSize: 10, cursor: 'pointer',
    border: '1px solid #45475a', background: 'rgba(49,34,68,0.4)', color: '#a6adc8',
  };

  return (
    <div style={{ position: 'relative', paddingTop: 4 }}>
      {!picking && !detailFor && (
        <div style={{
          display: 'flex', gap: 4, alignItems: 'center',
          opacity: visible ? 1 : 0, transition: 'opacity 0.15s',
          pointerEvents: visible ? 'auto' : 'none',
        }}>
          <button
            onClick={() => setPicking('up')}
            title={tt('feedback.good', 'Good response')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c7086', padding: 2, lineHeight: 1 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button
            onClick={() => setPicking('down')}
            title={tt('feedback.bad', 'Bad response')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6c7086', padding: 2, lineHeight: 1 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>
        </div>
      )}

      {picking && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', maxWidth: 420 }}>
          <span style={{ fontSize: 10, color: '#6c7086', marginRight: 2 }}>
            {picking === 'up'
              ? tt('feedback.what_good', 'What was good?')
              : tt('feedback.what_wrong', 'What went wrong?')}
          </span>
          {(picking === 'up' ? POSITIVE : NEGATIVE).map(([code, key, fallback]) => (
            <button key={code} onClick={() => pick(code)} style={chipStyle}>{tt(key, fallback)}</button>
          ))}
          {picking === 'up' && (
            <button
              onClick={async () => { if (await send('up')) setDone(true); }}
              style={{ ...chipStyle, borderColor: 'transparent', fontStyle: 'italic', color: '#6c7086' }}
            >{tt('feedback.skip_reason', 'Skip reason')}</button>
          )}
          <button
            onClick={() => setPicking(null)}
            style={{ ...chipStyle, borderColor: 'transparent', color: '#6c7086' }}
          >{tt('feedback.cancel', 'Cancel')}</button>
        </div>
      )}

      {detailFor && (
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 4 }}>
            {tt('feedback.detail_heading', 'What happened?')}
          </div>
          <textarea
            autoFocus
            rows={3}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish(note.trim() || undefined);
              if (e.key === 'Escape') finish();
            }}
            placeholder={tt('feedback.detail_placeholder', 'Optional — what did it get wrong?')}
            style={{
              width: '100%', resize: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 11,
              background: 'rgba(30,20,42,0.6)', color: '#cdd6f4', border: '1px solid #45475a',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <button
              onClick={() => finish()}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#6c7086' }}
            >{tt('feedback.detail_skip', 'Skip')}</button>
            <button
              onClick={() => finish(note.trim() || undefined)}
              disabled={!note.trim()}
              style={{
                padding: '4px 12px', borderRadius: 8, fontSize: 11, border: 'none',
                cursor: note.trim() ? 'pointer' : 'default',
                background: note.trim() ? 'var(--accent)' : 'rgba(69,71,90,0.5)',
                color: note.trim() ? '#fff' : '#6c7086',
              }}
            >{tt('feedback.detail_send', 'Send')}</button>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 10, color: '#f38ba8', marginTop: 4 }}>{error}</div>}
    </div>
  );
}
