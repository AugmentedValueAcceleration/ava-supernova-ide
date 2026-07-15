// First-run welcome — adaptive, immersive, for-everyone. Mirrors the extension
// dashboard's WelcomeOnboarding (same steps/paths/copy), in the IDE's idiom.
// Opens with "What brings you to Ava?" and tailors the tour, then reveals the
// breadth; keeps the IDE-only consent, desktop-automation and work-hours steps.
// Shows on every startup while the "show on startup" preference is on.
// Shared data: ../onboarding/flow. Copy: onboarding.* (core i18n, via t()).

import { useState, useCallback, useEffect } from 'react';
import { SignInPanel } from './SignInPanel';
import type { SignInAccount } from '../lib/sign-in';
import { t, useLocale, getLocale, languageOptions, setLanguage } from '../lib/i18n';
import { Select } from './Select';
import { PATHS, MODES, BREADTH, stepsFor, pathById, type Destination, type OnboardingPath } from '../onboarding/flow';

interface Props {
  onComplete: (navigateTo?: string) => void;
}

const PROVIDERS = [
  { id: 'Qwen', name: 'Qwen (Alibaba)', placeholder: 'sk-...' },
  { id: 'DeepSeek', name: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'Moonshot', name: 'Kimi (Moonshot)', placeholder: 'sk-...' },
  { id: 'Zhipu', name: 'Zhipu AI (GLM)', placeholder: '...' },
  { id: 'Mistral', name: 'Mistral', placeholder: '...' },
];

const STEPS = stepsFor('ide'); // consent, identity, path, tailored, breadth, connect, desktop, hours, ready
const ACCENT = 'var(--accent)';

const DEST_PAGE: Record<Destination, string> = {
  chat: 'ava-chat', journal: 'journal', learning: 'learning', health: 'health', home: 'command-centre',
};

// House button — the chat "New Chat" pill: translucent purple, purple border + text.
function btnStyle(disabled?: boolean): React.CSSProperties {
  return {
    padding: '8px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: ACCENT,
    opacity: disabled ? 0.4 : 1, transition: 'background 0.15s',
  };
}
const btnHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 20%, transparent)'; },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)'; },
};

export default function WelcomeOverlay({ onComplete }: Props) {
  useLocale();
  const [idx, setIdx] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);
  const [pathId, setPathId] = useState<string | null>(null);
  // Seed from an existing platform login on mount so the connect step shows
  // "Connected ✓ / Signed in as …" instead of the sign-in buttons when the
  // user is already signed in. Mirrors isConnected() — platform-key presence
  // is the connected signal; email + name pre-fill from their cached values.
  const [platformStatus, setPlatformStatus] = useState<'idle' | 'valid'>(() => {
    try { return localStorage.getItem('ava-ide-platform-key') ? 'valid' : 'idle'; } catch { return 'idle'; }
  });
  const [platformEmail, setPlatformEmail] = useState(() => {
    try { return localStorage.getItem('ava-ide-email') || ''; } catch { return ''; }
  });
  const [userName, setUserName] = useState(() => {
    try { return localStorage.getItem('ava-ide-user-name') || ''; } catch { return ''; }
  });
  const [byokProvider, setByokProvider] = useState('Qwen');
  const [byokKey, setByokKey] = useState('');
  const [byokSaved, setByokSaved] = useState(false);
  const [workStart, setWorkStart] = useState(9);
  const [workEnd, setWorkEnd] = useState(17);
  const [welcomeOnStartup, setWelcomeOnStartup] = useState(() => localStorage.getItem('ava-ide-welcome-on-startup') !== 'false');

  const step = STEPS[idx]?.id ?? 'ready';
  const path = pathId ? pathById(pathId) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathId]);

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 38, background: 'rgba(49, 34, 68, 0.5)', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
    borderRadius: 8, padding: '0 12px', fontSize: 13, color: '#cdd6f4', outline: 'none',
  };

  const recordConsent = useCallback(() => {
    const timestamp = new Date().toISOString();
    localStorage.setItem('ava-ide-consent-accepted', timestamp);
    const key = localStorage.getItem('ava-ide-platform-key');
    if (key) {
      fetch('https://ava-supernova.com/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'X-Ava-Platform': 'ide' },
        body: JSON.stringify({ platform: 'ide', appVersion: '1.0.0', acceptedAt: timestamp, termsVersion: '1.0', privacyVersion: '1.0' }),
      }).catch(() => { /* non-critical */ });
    }
  }, []);

  const handleSignedIn = useCallback((account: SignInAccount) => {
    setPlatformStatus('valid');
    setPlatformEmail(account.email || '');
    if (account.name && !userName) {
      setUserName(account.name);
      try { localStorage.setItem('ava-ide-user-name', account.name); } catch { /* non-fatal */ }
    }
  }, [userName]);

  const handleSaveByok = useCallback(() => {
    if (!byokKey.trim()) return;
    try {
      const existing = JSON.parse(localStorage.getItem('ava-ide-byok') || '{}');
      existing[byokProvider] = byokKey.trim();
      localStorage.setItem('ava-ide-byok', JSON.stringify(existing));
      window.dispatchEvent(new CustomEvent('ava-byok-changed'));
      setByokSaved(true);
    } catch { /* non-fatal */ }
  }, [byokProvider, byokKey]);

  const handleWorkHours = useCallback((s: number, e: number) => {
    setWorkStart(s); setWorkEnd(e);
    localStorage.setItem('ava-ide-work-start', String(s));
    localStorage.setItem('ava-ide-work-end', String(e));
  }, []);

  const toggleStartup = (v: boolean) => {
    setWelcomeOnStartup(v);
    try { localStorage.setItem('ava-ide-welcome-on-startup', v ? 'true' : 'false'); } catch { /* non-fatal */ }
  };

  const finish = useCallback((navigateTo?: string) => {
    localStorage.setItem('ava-ide-onboarded', 'true');
    // Persist the picked mode to the key the chat actually reads
    // (ava-ide-chat-mode) using the canonical mode id, and notify listeners.
    const p = pathId ? pathById(pathId) : undefined;
    if (p) {
      try {
        localStorage.setItem('ava-ide-chat-mode', p.recommendedMode);
        window.dispatchEvent(new CustomEvent('ava-mode-changed'));
      } catch { /* non-fatal */ }
    }
    onComplete(navigateTo);
  }, [onComplete, pathId]);

  const next = () => {
    if (step === 'consent') recordConsent();
    setIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const back = () => setIdx((i) => Math.max(i - 1, 0));
  const choosePath = (p: OnboardingPath) => { setPathId(p.id); setIdx((i) => Math.min(i + 1, STEPS.length - 1)); };
  const launch = () => finish(path ? DEST_PAGE[path.destination] : undefined);

  const canNext = (step !== 'consent' || consentChecked) && (step !== 'path' || !!pathId);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: 'min(1100px, 94vw)', height: 'min(760px, 92vh)', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(160deg, #1a1020 0%, #120c1a 100%)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
        borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Top bar: progress + skip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {STEPS.map((s, i) => (
            <span key={s.id} style={{ height: 5, width: i === idx ? 28 : 8, borderRadius: 999, background: i <= idx ? ACCENT : 'rgba(255,255,255,0.15)', transition: 'all 0.2s' }} />
          ))}
          <div style={{ flex: 1 }} />
          {/* Language picker, present from the first screen so the whole tour —
              and everything after — is in the user's language. The sidecar isn't
              running yet during onboarding, so setLanguage (persist + UI) is
              enough; boot reads the stored value. */}
          <Select
            value={getLocale()}
            onChange={(v) => setLanguage(v)}
            options={languageOptions()}
            size="sm"
            title={t('dash.settings.language')}
            menuZIndex={10001}
          />
          {step !== 'consent' && <button onClick={() => finish()} style={{ background: 'none', border: 'none', color: '#6c7086', fontSize: 12, cursor: 'pointer' }}>{t('onboarding.skip')}</button>}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', minHeight: 0 }}>
          {step === 'consent' && <ConsentStep checked={consentChecked} onCheck={setConsentChecked} />}
          {step === 'identity' && <IdentityStep />}
          {step === 'path' && <PathStep selected={pathId} onPick={choosePath} />}
          {step === 'tailored' && path && <TailoredStep path={path} />}
          {step === 'breadth' && <BreadthStep />}
          {step === 'connect' && (
            <ConnectStep
              platformStatus={platformStatus} platformEmail={platformEmail} userName={userName} setUserName={setUserName}
              byokProvider={byokProvider} setByokProvider={setByokProvider} byokKey={byokKey} setByokKey={setByokKey}
              byokSaved={byokSaved} setByokSaved={setByokSaved} onSignedIn={handleSignedIn} onSaveByok={handleSaveByok} inputStyle={inputStyle}
            />
          )}
          {step === 'desktop' && <DesktopStep />}
          {step === 'hours' && <HoursStep workStart={workStart} workEnd={workEnd} onChange={handleWorkHours} fmt={fmt} inputStyle={inputStyle} />}
          {step === 'ready' && <ReadyStep path={path} onFinish={finish} />}
        </div>

        {/* Footer nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={back} disabled={idx === 0} style={btnStyle(idx === 0)} {...btnHover}>{t('onboarding.back')}</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6c7086', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={welcomeOnStartup} onChange={(e) => toggleStartup(e.target.checked)} />
            {t('onboarding.show_on_startup')}
          </label>
          <div style={{ flex: 1 }} />
          {step === 'ready' ? (
            <button onClick={launch} style={btnStyle()} {...btnHover}>{t('onboarding.ready.go')}</button>
          ) : (
            <button onClick={next} disabled={!canNext} style={btnStyle(!canNext)} {...btnHover}>{step === 'consent' ? t('onboarding.agree') : t('onboarding.next')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function ConsentStep({ checked, onCheck }: { checked: boolean; onCheck: (v: boolean) => void }) {
  const bullets = ['onboarding.consent.local', 'onboarding.consent.sync', 'onboarding.consent.train', 'onboarding.consent.keys', 'onboarding.consent.track'];
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4', marginBottom: 6, textAlign: 'center' }}>{t('onboarding.consent.title')}</h2>
      <p style={{ fontSize: 12, color: '#6c7086', textAlign: 'center', marginBottom: 20 }}>{t('onboarding.consent.body')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {bullets.map((b) => (
          <div key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#a6adc8' }}>
            <span style={{ color: '#a6e3a1' }}>✓</span>{t(b)}
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cdd6f4', cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
        {t('onboarding.consent.agree')}
      </label>
    </div>
  );
}

function IdentityStep() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ width: 88, height: 88, borderRadius: '50%', marginBottom: 24, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, background: 'linear-gradient(135deg, var(--accent), #6366f1)', border: `1px solid ${ACCENT}55` }}>
        <img src="/ava-avatar.jpeg" alt="Ava" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      </div>
      <h1 style={{ fontSize: 34, fontWeight: 600, color: '#cdd6f4', marginBottom: 16 }}>{t('onboarding.identity.title')}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: '#a6adc8' }}>{t('onboarding.identity.body')}</p>
    </div>
  );
}

function PathStep({ selected, onPick }: { selected: string | null; onPick: (p: OnboardingPath) => void }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, color: '#cdd6f4', textAlign: 'center', marginBottom: 4 }}>{t('onboarding.path.title')}</h2>
      <p style={{ fontSize: 13, color: '#6c7086', textAlign: 'center', marginBottom: 24 }}>{t('onboarding.path.subtitle')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {PATHS.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} style={{
            textAlign: 'left', padding: 16, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12,
            background: selected === p.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent', border: `1px solid ${selected === p.id ? ACCENT : 'rgba(255,255,255,0.1)'}`,
          }}>
            <span style={{ fontSize: 26 }}>{p.icon}</span>
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 2 }}>{t(p.labelKey)}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#6c7086', lineHeight: 1.5 }}>{t(p.blurbKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TailoredStep({ path }: { path: OnboardingPath }) {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 28 }}>{path.icon}</span>
        <h2 style={{ fontSize: 24, fontWeight: 600, color: '#cdd6f4' }}>{t(path.labelKey)}</h2>
      </div>
      <p style={{ fontSize: 13, color: '#6c7086', marginBottom: 24 }}>{t('onboarding.tailored.heading')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {path.tailoredKeys.map((base) => (
          <div key={base} style={{ padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>{t(`${base}.title`)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086' }}>{t('onboarding.try_this')}</span>
              <code style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: ACCENT }}>{t(`${base}.example`)}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreadthStep() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, color: '#cdd6f4', textAlign: 'center', marginBottom: 4 }}>{t('onboarding.breadth.title')}</h2>
      <p style={{ fontSize: 13, color: '#6c7086', textAlign: 'center', marginBottom: 24 }}>{t('onboarding.breadth.subtitle')}</p>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086', marginBottom: 8 }}>{t('onboarding.breadth.group.modes')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {MODES.map((m) => (
            <div key={m.id} style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ fontSize: 12, color: ACCENT }}>{m.prefix}</code>
              <span style={{ fontSize: 12, color: '#a6adc8' }}>{t(m.labelKey)}</span>
            </div>
          ))}
        </div>
      </div>
      {BREADTH.filter((g) => g.surfaces.includes('ide')).map((g) => (
        <div key={g.titleKey} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c7086', marginBottom: 8 }}>{t(g.titleKey)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {g.items.map((it) => (
              <div key={it.labelKey} style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{it.icon}</span>
                <span>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cdd6f4' }}>{t(it.labelKey)}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#6c7086' }}>{t(it.blurbKey)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConnectStep(props: {
  platformStatus: 'idle' | 'valid'; platformEmail: string; userName: string; setUserName: (v: string) => void;
  byokProvider: string; setByokProvider: (v: string) => void; byokKey: string; setByokKey: (v: string) => void;
  byokSaved: boolean; setByokSaved: (v: boolean) => void; onSignedIn: (a: SignInAccount) => void; onSaveByok: () => void;
  inputStyle: React.CSSProperties;
}) {
  const { platformStatus, platformEmail, userName, setUserName, byokProvider, setByokProvider, byokKey, setByokKey, byokSaved, setByokSaved, onSignedIn, onSaveByok, inputStyle } = props;
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4', textAlign: 'center', marginBottom: 4 }}>{t('onboarding.connect.title')}</h2>
      <p style={{ fontSize: 12, color: '#6c7086', textAlign: 'center', marginBottom: 20 }}>{t('onboarding.connect.subtitle')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {platformStatus === 'valid' ? (
          <div style={{ background: 'rgba(166, 227, 161, 0.08)', border: '1px solid rgba(166, 227, 161, 0.3)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a6e3a1', marginBottom: 4 }}>Connected ✓</div>
            <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 12 }}>{platformEmail ? `Signed in as ${platformEmail}` : 'Signed in'}</div>
            <input type="text" placeholder="Your name" value={userName}
              onChange={(e) => { setUserName(e.target.value); if (e.target.value.trim()) localStorage.setItem('ava-ide-user-name', e.target.value.trim()); }}
              style={{ ...inputStyle, height: 34, fontSize: 12 }} />
          </div>
        ) : (
          <SignInPanel onSignedIn={onSignedIn} onSkipAccount={() => { /* BYOK column is right there */ }} />
        )}
        <div style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a6e3a1', marginBottom: 4 }}>BYOK — No Account</div>
          <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 12 }}>Your keys, full local AI</div>
          <select value={byokProvider} onChange={(e) => { setByokProvider(e.target.value); setByokSaved(false); }} style={{ ...inputStyle, height: 34, fontSize: 12, marginBottom: 8, appearance: 'auto' as React.CSSProperties['appearance'] }}>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="text" value={byokKey} onChange={(e) => { setByokKey(e.target.value); setByokSaved(false); }} placeholder={PROVIDERS.find((p) => p.id === byokProvider)?.placeholder} style={{ ...inputStyle, height: 34, fontSize: 12, marginBottom: 8 }} />
          <button onClick={onSaveByok} disabled={!byokKey.trim()} style={{ width: '100%', height: 32, borderRadius: 6, border: 'none', background: '#a6e3a1', color: '#11111b', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: !byokKey.trim() ? 0.4 : 1 }}>
            {byokSaved ? 'Saved!' : 'Save Key'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DesktopStep() {
  const cards = [
    { icon: '📸', titleKey: 'onboarding.desktop.see.title', bodyKey: 'onboarding.desktop.see.body' },
    { icon: '🖱️', titleKey: 'onboarding.desktop.drive.title', bodyKey: 'onboarding.desktop.drive.body' },
    { icon: '🌐', titleKey: 'onboarding.desktop.browse.title', bodyKey: 'onboarding.desktop.browse.body' },
    { icon: '🛑', titleKey: 'onboarding.desktop.control.title', bodyKey: 'onboarding.desktop.control.body' },
  ];
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 34, marginBottom: 12 }}>🖥️</div>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>{t('onboarding.desktop.title')}</h2>
      <p style={{ fontSize: 13, color: '#6c7086', marginBottom: 20 }}>{t('onboarding.desktop.body')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'left', marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.titleKey} style={{ padding: 14, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t(c.titleKey)}</div>
            <div style={{ fontSize: 11, color: '#6c7086' }}>{t(c.bodyKey)}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#a6e3a1', background: 'rgba(166,227,161,0.08)', border: '1px solid rgba(166,227,161,0.2)', borderRadius: 8, padding: '8px 12px' }}>{t('onboarding.desktop.note')}</div>
    </div>
  );
}

function HoursStep({ workStart, workEnd, onChange, fmt, inputStyle }: { workStart: number; workEnd: number; onChange: (s: number, e: number) => void; fmt: (h: number) => string; inputStyle: React.CSSProperties }) {
  return (
    <div style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>{t('onboarding.hours.title')}</h2>
      <p style={{ fontSize: 13, color: '#6c7086', marginBottom: 24 }}>{t('onboarding.hours.body')}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>{t('onboarding.hours.start')}</div>
          <select value={workStart} onChange={(e) => onChange(Number(e.target.value), workEnd)} style={{ ...inputStyle, width: 100, height: 38, textAlign: 'center', appearance: 'auto' as React.CSSProperties['appearance'] }}>
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{fmt(i)}</option>)}
          </select>
        </div>
        <span style={{ fontSize: 20, color: '#585b70', marginTop: 16 }}>—</span>
        <div>
          <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>{t('onboarding.hours.end')}</div>
          <select value={workEnd} onChange={(e) => onChange(workStart, Number(e.target.value))} style={{ ...inputStyle, width: 100, height: 38, textAlign: 'center', appearance: 'auto' as React.CSSProperties['appearance'] }}>
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{fmt(i)}</option>)}
          </select>
        </div>
      </div>
      <div style={{ fontSize: 12, color: ACCENT, fontWeight: 500 }}>{fmt(workStart)} — {fmt(workEnd)}</div>
      <div style={{ fontSize: 10, color: '#585b70', marginTop: 4 }}>{t('onboarding.hours.note')}</div>
    </div>
  );
}

function ReadyStep({ path, onFinish }: { path: OnboardingPath | undefined; onFinish: (nav?: string) => void }) {
  const pathLabel = path ? t(path.labelKey) : t('onboarding.path.explore.label');
  const cards = [
    { label: t('onboarding.ready.docs'), icon: '📘', nav: 'documentation' },
    { label: t('onboarding.ready.create'), icon: '🎨', nav: 'creative-studio' },
    { label: t('onboarding.ready.settings'), icon: '⚙️', nav: 'settings' },
  ];
  return (
    <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
      <h2 style={{ fontSize: 26, fontWeight: 600, color: '#cdd6f4', marginBottom: 12 }}>{t('onboarding.ready.title')}</h2>
      <p style={{ fontSize: 13, color: '#6c7086', marginBottom: 28 }}>{t('onboarding.ready.body').replace('{path}', pathLabel)}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {cards.map((c) => (
          <button key={c.nav} onClick={() => onFinish(c.nav)} style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: 10, padding: '16px 8px', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 40%, transparent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 12%, transparent)')}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
            <div style={{ fontSize: 11, color: '#cdd6f4', fontWeight: 500 }}>{c.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
