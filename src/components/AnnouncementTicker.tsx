import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../lib/i18n';

// ─── Announcement ticker (IDE) ───────────────────────────────────────────────
//
// A subtle line of hub-set messages in the global top bar — the same feed as the
// website banner and the extension header (GET /api/announcement, backed by the
// hub's platform_settings). Self-fetching here: the Tauri webview reaches the API
// directly (CSP connect-src already allows avasupernova.com), refreshing every
// 10 min. Cycles every 8s, truncates so it never crowds the title/status, and is
// dismissible. Renders nothing when there are no messages.

const FEED = 'https://avasupernova.com/api/announcement';
const REFRESH_MS = 10 * 60 * 1000;

export function AnnouncementTicker({ fallback }: { fallback?: ReactNode }) {
  const [messages, setMessages] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Pull the feed on mount + on a slow interval. Failures are silent — offline or
  // a blocked request just shows nothing, never an error in the chrome.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(FEED, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { messages?: unknown };
        const msgs = Array.isArray(data?.messages) ? data.messages.map(String).filter(Boolean) : [];
        if (!cancelled) setMessages(msgs);
      } catch { /* offline / blocked — show nothing */ }
    };
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const sig = messages.join('|');
  // Reset when the feed changes (a hub update re-shows even if dismissed).
  useEffect(() => { setI(0); setDismissed(false); }, [sig]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => setI(p => (p + 1) % messages.length), 8000);
    return () => clearInterval(id);
  }, [messages.length]);

  // No live announcement (or dismissed) → yield the slot back to the caller's
  // fallback (the TitleBar shows the folder name there).
  if (dismissed || messages.length === 0) return <>{fallback ?? null}</>;

  return (
    <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 12px', fontSize: 11 }}>
      <span style={{ height: 6, width: 6, flexShrink: 0, borderRadius: '50%', background: 'var(--accent)', animation: 'avaTickerPulse 1.6s ease-in-out infinite' }} aria-hidden="true" />
      <span key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#a6adc8' }} title={messages[i]}>{messages[i]}</span>
      <button
        onClick={() => setDismissed(true)}
        style={{ flexShrink: 0, background: 'none', border: 'none', color: '#8b8398', cursor: 'pointer', lineHeight: 1, fontSize: 13, padding: 0 }}
        aria-label={t('ide.ticker.dismiss')}
      >×</button>
      <style>{'@keyframes avaTickerPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }'}</style>
    </div>
  );
}
