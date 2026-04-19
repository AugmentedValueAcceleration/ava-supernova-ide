import { useState, useCallback } from 'react';
import { SignInPanel } from './SignInPanel';
import type { SignInAccount } from '../lib/sign-in';

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

// Mode = mindset. This is the single most useful concept to hand a
// new user — once they get "modes change how Ava thinks", everything
// else clicks. Shown as a 6-card picker that previews a real example
// prompt per mode, instead of a generic welcome splash.
const MODES = [
  { id: 'code',       name: 'Work',       prefix: '>>', tagline: 'Builder. Ships code.',                  example: 'add a cancel button to the upload form' },
  { id: 'plan',       name: 'Plan',       prefix: '::', tagline: 'Strategist. Read-only. Thinks first.',  example: 'should I extract this logic into a service?' },
  { id: 'chat',       name: 'Chat',       prefix: '..', tagline: 'Friend. No tools. Just talk.',           example: 'how do I feel about this launch date?' },
  { id: 'teach',      name: 'Teach',      prefix: '??', tagline: 'Tutor. Builds a curriculum for you.',   example: 'teach me Rust async from zero' },
  { id: 'security',   name: 'Security',   prefix: '!!', tagline: 'Auditor. OWASP scan + report.',          example: 'audit this API for injection risks' },
  { id: 'brainstorm', name: 'Brainstorm', prefix: '**', tagline: 'Ideator. Challenges your ideas.',         example: 'what should I build with 2 weeks free?' },
];

export default function WelcomeOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [consentChecked, setConsentChecked] = useState(false);

  // Step 1: the mode picker is a teaching tool, not a setting. We
  // persist the selection locally so if they pick Plan we can land
  // them in Plan mode when they click "Open Ava Chat" on the final
  // step. Default Work — most users start with a ship-something task.
  const [selectedMode, setSelectedMode] = useState(MODES[0]);

  const [platformStatus, setPlatformStatus] = useState<'idle' | 'valid'>('idle');
  const [platformEmail, setPlatformEmail] = useState('');
  const [byokProvider, setByokProvider] = useState('Qwen');
  const [byokKey, setByokKey] = useState('');
  const [byokSaved, setByokSaved] = useState(false);

  // Name state (shown after platform connect)
  const [userName, setUserName] = useState('');

  const [workStart, setWorkStart] = useState(9);
  const [workEnd, setWorkEnd] = useState(17);

  // Consent → Modes → Desktop Automation → Connect → Hours → Ready.
  // Desktop Automation is its own step because it's the biggest
  // capability that separates the IDE from the VS Code extension —
  // treating it as a footnote would undersell the differentiator.
  const totalSteps = 6;

  // OAuth sign-in completed (the SignInPanel handles the browser + deep-link
  // round-trip + localStorage persistence itself; all we do here is pick up
  // the account for the "What should Ava call you?" UI and flip the step
  // indicator so the user knows they're connected).
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
    } catch {}
  }, [byokProvider, byokKey]);

  const handleWorkHours = useCallback((s: number, e: number) => {
    setWorkStart(s);
    setWorkEnd(e);
    localStorage.setItem('ava-ide-work-start', String(s));
    localStorage.setItem('ava-ide-work-end', String(e));
  }, []);

  const finish = useCallback((navigateTo?: string) => {
    localStorage.setItem('ava-ide-onboarded', 'true');
    // Persist the picked mode so the chat opens in the right mindset
    // the first time — users who chose Plan on step 1 don't want to
    // land in Work and have to switch. Chat surfaces read this key
    // on mount; if it's not set they default to Work.
    try { localStorage.setItem('ava-ide-initial-mode', selectedMode.id); } catch { /* non-fatal */ }
    onComplete(navigateTo);
  }, [onComplete, selectedMode]);

  const recordConsent = useCallback(() => {
    const timestamp = new Date().toISOString();
    localStorage.setItem('ava-ide-consent-accepted', timestamp);
    // Record consent server-side if connected
    const key = localStorage.getItem('ava-ide-platform-key');
    if (key) {
      fetch('https://ava-supernova.com/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'X-Ava-Platform': 'ide' },
        body: JSON.stringify({ platform: 'ide', appVersion: '1.0.0', acceptedAt: timestamp, termsVersion: '1.0', privacyVersion: '1.0' }),
      }).catch(() => { /* non-critical */ });
    }
  }, []);

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 38, background: 'rgba(49, 34, 68, 0.5)', border: '1px solid rgba(168, 85, 247, 0.12)',
    borderRadius: 8, padding: '0 12px', fontSize: 13, color: '#cdd6f4', outline: 'none',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)', borderRadius: 16, maxWidth: 560, width: '90%',
        padding: '40px 36px', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        border: '1px solid rgba(168,85,247,0.15)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i === step ? '#a855f7' : i < step ? '#7c3aed' : 'rgba(49, 34, 68, 0.5)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* Step 0: Consent Gate (GDPR) */}
        {step === 0 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>Before You Begin</h2>
              <p style={{ fontSize: 12, color: '#6c7086' }}>Please review our terms and privacy policy</p>
            </div>

            <div style={{
              background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)',
              borderRadius: 12, padding: 20, marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: '#a6adc8', lineHeight: 1.8 }}>
                <p style={{ marginBottom: 8 }}>
                  Ava is built by <span style={{ color: '#cdd6f4', fontWeight: 500 }}>Augmented Value Acceleration Ltd</span>, registered in England and Wales.
                </p>
                <ul style={{ paddingLeft: 16, margin: 0 }}>
                  <li style={{ marginBottom: 4 }}>All data is <span style={{ color: '#a6e3a1' }}>stored locally</span> on your machine by default</li>
                  <li style={{ marginBottom: 4 }}>Cloud sync is <span style={{ color: '#a6e3a1' }}>opt-in only</span></li>
                  <li style={{ marginBottom: 4 }}>Your code is <span style={{ color: '#a6e3a1' }}>never used to train AI models</span></li>
                  <li style={{ marginBottom: 4 }}>API keys are stored securely, <span style={{ color: '#a6e3a1' }}>never transmitted</span> to our servers</li>
                  <li>No third-party analytics or tracking</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
              <a href="https://ava-supernova.com/terms" target="_blank" rel="noopener"
                 style={{ fontSize: 11, color: '#a855f7', textDecoration: 'none' }}>Terms of Service</a>
              <span style={{ color: '#585b70' }}>|</span>
              <a href="https://ava-supernova.com/privacy" target="_blank" rel="noopener"
                 style={{ fontSize: 11, color: '#a855f7', textDecoration: 'none' }}>Privacy Policy</a>
            </div>

            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
              background: consentChecked ? 'rgba(168, 85, 247, 0.08)' : 'rgba(26, 16, 40, 0.4)',
              border: consentChecked ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(168, 85, 247, 0.08)',
              borderRadius: 10, padding: '12px 14px', transition: 'all 0.15s',
            }}>
              <input type="checkbox" checked={consentChecked} onChange={e => setConsentChecked(e.target.checked)}
                     style={{ marginTop: 2, accentColor: '#a855f7' }} />
              <span style={{ fontSize: 11, color: '#a6adc8', lineHeight: 1.5 }}>
                I have read and agree to the <span style={{ color: '#cdd6f4', fontWeight: 500 }}>Terms of Service</span> and <span style={{ color: '#cdd6f4', fontWeight: 500 }}>Privacy Policy</span>
              </span>
            </label>
          </div>
        )}

        {/* Step 1: Modes — six-card picker. Teaches the mindset
            metaphor before we ask them for anything. Clicking a mode
            previews an example prompt so the concept lands concretely. */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <img src="/icon.png" width={40} height={40} style={{ borderRadius: 10, margin: '0 auto 12px', display: 'block' }} alt="Ava" />
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>Pick the mindset you&rsquo;re in</h2>
              <p style={{ fontSize: 12, color: '#6c7086' }}>
                Modes change how Ava thinks — the tools she uses, the risks she takes. Switch any time.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMode(m)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: selectedMode.id === m.id ? 'rgba(168, 85, 247, 0.12)' : 'rgba(26, 16, 40, 0.6)',
                    border: selectedMode.id === m.id ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid rgba(168, 85, 247, 0.12)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#a855f7' }}>{m.prefix}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{m.name}</span>
                  </div>
                  <p style={{ fontSize: 10, color: '#6c7086', marginTop: 3, marginBottom: 0 }}>{m.tagline}</p>
                </button>
              ))}
            </div>

            <div style={{
              borderRadius: 10, background: 'rgba(26, 16, 40, 0.6)',
              border: '1px solid rgba(168, 85, 247, 0.12)', padding: '10px 12px',
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: '#6c7086', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
                Try this in {selectedMode.name} mode
              </div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#a6adc8' }}>
                <span style={{ color: '#a855f7' }}>{selectedMode.prefix}</span> {selectedMode.example}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Desktop Automation — the IDE's unique differentiator
            vs the VS Code extension. The extension has every tool the
            IDE has EXCEPT native OS control. Calling this out explicitly
            so users understand why they'd run the IDE instead of (or
            alongside) the extension. */}
        {step === 2 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🖥️</div>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>Ava has hands here</h2>
              <p style={{ fontSize: 12, color: '#6c7086', maxWidth: 400, margin: '0 auto' }}>
                This is what separates the IDE from the extension — she can drive your desktop.
              </p>
            </div>

            <div style={{
              background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)',
              borderRadius: 12, padding: 18, marginBottom: 12,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>📸</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>See your screen</div>
                  <p style={{ fontSize: 10, color: '#6c7086', lineHeight: 1.5, margin: 0 }}>
                    Ask her to describe what&rsquo;s open, review a design, or spot the bug you&rsquo;re staring at.
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>🖱️</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>Drive any app</div>
                  <p style={{ fontSize: 10, color: '#6c7086', lineHeight: 1.5, margin: 0 }}>
                    Keyboard, mouse, other windows. Automate the boring five-click workflows.
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>🌐</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>Run a browser for you</div>
                  <p style={{ fontSize: 10, color: '#6c7086', lineHeight: 1.5, margin: 0 }}>
                    Research, fill forms, reproduce bugs. Playwright-backed, visible window.
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>🛑</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>You stay in charge</div>
                  <p style={{ fontSize: 10, color: '#6c7086', lineHeight: 1.5, margin: 0 }}>
                    Opt in per session. One-shot plan approval. Ctrl+Alt+K kill switch.
                  </p>
                </div>
              </div>
            </div>

            <div style={{
              border: '1px solid rgba(166, 227, 161, 0.25)', background: 'rgba(166, 227, 161, 0.06)',
              borderRadius: 10, padding: '10px 12px',
            }}>
              <p style={{ fontSize: 11, color: '#a6e3a1', margin: 0, lineHeight: 1.5 }}>
                Opt in when you want it — from the chat header. Off by default, kill-switch always one hotkey away.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Get Connected */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4', marginBottom: 6, textAlign: 'center' }}>Get Connected</h2>
            <p style={{ fontSize: 12, color: '#6c7086', textAlign: 'center', marginBottom: 20 }}>Choose how you want to use Ava</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Platform — OAuth sign-in (GitHub / Email) */}
              {platformStatus === 'valid' ? (
                <div style={{ background: 'rgba(166, 227, 161, 0.08)', border: '1px solid rgba(166, 227, 161, 0.3)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#a6e3a1', marginBottom: 4 }}>Connected ✓</div>
                  <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 12 }}>
                    {platformEmail ? `Signed in as ${platformEmail}` : 'Signed in'}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#cba6f7', marginBottom: 6 }}>What should Ava call you?</div>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={userName}
                    onChange={e => {
                      setUserName(e.target.value);
                      if (e.target.value.trim()) localStorage.setItem('ava-ide-user-name', e.target.value.trim());
                    }}
                    style={{ ...inputStyle, height: 34, fontSize: 12 }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)'; }}
                  />
                </div>
              ) : (
                <SignInPanel
                  onSignedIn={handleSignedIn}
                  onSkipAccount={() => { /* BYOK column is right there — no-op */ }}
                />
              )}

              {/* BYOK */}
              <div style={{ background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#a6e3a1', marginBottom: 4 }}>BYOK — No Account</div>
                <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 12 }}>Your keys, full local AI</div>
                <select
                  value={byokProvider}
                  onChange={e => { setByokProvider(e.target.value); setByokSaved(false); }}
                  style={{ ...inputStyle, height: 34, fontSize: 12, marginBottom: 8, appearance: 'auto' as any }}
                >
                  {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input
                  type="text"
                  value={byokKey}
                  onChange={e => { setByokKey(e.target.value); setByokSaved(false); }}
                  placeholder={PROVIDERS.find(p => p.id === byokProvider)?.placeholder}
                  style={{ ...inputStyle, height: 34, fontSize: 12, marginBottom: 8 }}
                />
                <button
                  onClick={handleSaveByok}
                  disabled={!byokKey.trim()}
                  style={{
                    width: '100%', height: 32, borderRadius: 6, border: 'none',
                    background: byokSaved ? '#a6e3a1' : '#a6e3a1',
                    color: '#11111b', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    opacity: !byokKey.trim() ? 0.4 : 1,
                  }}
                >
                  {byokSaved ? 'Saved!' : 'Save Key'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Working Hours */}
        {step === 4 && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>Set Your Hours</h2>
            <p style={{ fontSize: 12, color: '#6c7086', marginBottom: 24 }}>
              Tell Ava when you work. She'll never suggest stopping during your hours.
            </p>

            {/* Simple hour pickers instead of the full SVG clock for onboarding simplicity */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>Start</div>
                <select
                  value={workStart}
                  onChange={e => handleWorkHours(Number(e.target.value), workEnd)}
                  style={{ ...inputStyle, width: 100, height: 38, textAlign: 'center', appearance: 'auto' as any }}
                >
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{fmt(i)}</option>)}
                </select>
              </div>
              <span style={{ fontSize: 20, color: '#585b70', marginTop: 16 }}>—</span>
              <div>
                <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>End</div>
                <select
                  value={workEnd}
                  onChange={e => handleWorkHours(workStart, Number(e.target.value))}
                  style={{ ...inputStyle, width: 100, height: 38, textAlign: 'center', appearance: 'auto' as any }}
                >
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{fmt(i)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#a855f7', fontWeight: 500 }}>
              {fmt(workStart)} — {fmt(workEnd)}
            </div>
            <div style={{ fontSize: 10, color: '#585b70', marginTop: 4 }}>
              You can change this anytime from the Command Centre clock.
            </div>
          </div>
        )}

        {/* Step 5: Ready */}
        {step === 5 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>You&rsquo;re ready</h2>
            <p style={{ fontSize: 13, color: '#6c7086', marginBottom: 20 }}>
              {selectedMode.id !== 'code'
                ? `Start in ${selectedMode.name} mode — switch any time with the pill in the chat header.`
                : 'Ava is waiting. Where do you want to start?'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Open Ava Chat', icon: '💬', nav: 'Ava Chat' },
                { label: 'Documentation', icon: '📖', nav: 'Documentation' },
                { label: 'Command Centre', icon: '⚡', nav: 'Command Centre' },
                { label: 'Meet Ava', icon: '✨', nav: 'meet-ava-external' },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => {
                    // "Meet Ava" opens the brand page in the user's
                    // browser and still closes onboarding. Other
                    // buttons navigate to an internal page.
                    if (a.nav === 'meet-ava-external') {
                      try { window.open('https://ava-supernova.com/meet-ava', '_blank'); } catch { /* non-fatal */ }
                      finish();
                    } else {
                      finish(a.nav);
                    }
                  }}
                  style={{
                    background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)', borderRadius: 10,
                    padding: '16px 8px', cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.12)')}
                >
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{a.icon}</div>
                  <div style={{ fontSize: 11, color: '#cdd6f4', fontWeight: 500 }}>{a.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{ background: 'none', border: 'none', color: '#6c7086', fontSize: 12, cursor: 'pointer' }}
            >Back</button>
          ) : <div />}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* Skip not available on consent step */}
            {step > 0 && (
              <button
                onClick={() => finish()}
                style={{ background: 'none', border: 'none', color: '#585b70', fontSize: 11, cursor: 'pointer' }}
              >Skip</button>
            )}

            {step < totalSteps - 1 && (
              <button
                onClick={() => {
                  if (step === 0) recordConsent();
                  setStep(s => s + 1);
                }}
                disabled={step === 0 && !consentChecked}
                style={{
                  padding: '8px 24px', background: '#a855f7', border: 'none',
                  borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  opacity: (step === 0 && !consentChecked) ? 0.3 : 1,
                }}
              >{step === 0 ? 'I Agree' : 'Next'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
