import { useState, useCallback } from 'react';
import { validateKey, getPlatformKey } from '../lib/api';

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

export default function WelcomeOverlay({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  // Step 2 state
  const [platformKey, setPlatformKey] = useState('');
  const [platformStatus, setPlatformStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [platformEmail, setPlatformEmail] = useState('');
  const [byokProvider, setByokProvider] = useState('Qwen');
  const [byokKey, setByokKey] = useState('');
  const [byokSaved, setByokSaved] = useState(false);

  // Step 3 state
  const [workStart, setWorkStart] = useState(9);
  const [workEnd, setWorkEnd] = useState(17);

  const totalSteps = 4;

  const handleValidatePlatform = useCallback(async () => {
    if (!platformKey.startsWith('sk-ava-')) return;
    setPlatformStatus('validating');
    const result = await validateKey(platformKey);
    if (result.valid) {
      localStorage.setItem('ava-ide-platform-key', platformKey);
      if (result.email) localStorage.setItem('ava-ide-email', result.email);
      if (result.tier) localStorage.setItem('ava-ide-tier', result.tier);
      setPlatformStatus('valid');
      setPlatformEmail(result.email || '');
    } else {
      setPlatformStatus('invalid');
    }
  }, [platformKey]);

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
    onComplete(navigateTo);
  }, [onComplete]);

  const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 38, background: '#313244', border: '1px solid #313244',
    borderRadius: 8, padding: '0 12px', fontSize: 13, color: '#cdd6f4', outline: 'none',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1e1e2e', borderRadius: 16, maxWidth: 560, width: '90%',
        padding: '40px 36px', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        border: '1px solid rgba(168,85,247,0.15)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 4,
              background: i === step ? '#a855f7' : i < step ? '#7c3aed' : '#313244',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 0 && (
          <div style={{ textAlign: 'center' }}>
            <img src="/icon.png" width={72} height={72} style={{
              borderRadius: 16, margin: '0 auto 24px', display: 'block',
              boxShadow: '0 8px 32px rgba(168,85,247,0.3)',
              animation: 'avaPulse 2s ease-in-out infinite',
            }} alt="Ava" />
            <h1 style={{ fontSize: 24, fontWeight: 300, color: '#cdd6f4', marginBottom: 8 }}>
              Welcome to <span style={{ fontWeight: 600 }}>Ava</span>{' '}
              <span style={{ color: '#a855f7', fontWeight: 600 }}>|</span>{' '}
              <span style={{ fontWeight: 600 }}>Supernova IDE</span>
            </h1>
            <p style={{ fontSize: 14, color: '#6c7086', lineHeight: 1.7, maxWidth: 400, margin: '0 auto' }}>
              The AI-native development environment. 54 tools. 6 modes. 24 specialists. One brain that remembers you.
            </p>
          </div>
        )}

        {/* Step 2: Get Connected */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#cdd6f4', marginBottom: 6, textAlign: 'center' }}>Get Connected</h2>
            <p style={{ fontSize: 12, color: '#6c7086', textAlign: 'center', marginBottom: 20 }}>Choose how you want to use Ava</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Platform */}
              <div style={{ background: '#181825', border: '1px solid #313244', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#a855f7', marginBottom: 4 }}>Platform Account</div>
                <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 12 }}>Cloud mode, managed tokens, sync</div>
                <input
                  type="text"
                  value={platformKey}
                  onChange={e => { setPlatformKey(e.target.value); setPlatformStatus('idle'); }}
                  placeholder="sk-ava-..."
                  style={{ ...inputStyle, height: 34, fontSize: 12, marginBottom: 8 }}
                />
                <button
                  onClick={handleValidatePlatform}
                  disabled={!platformKey.startsWith('sk-ava-') || platformStatus === 'validating'}
                  style={{
                    width: '100%', height: 32, borderRadius: 6, border: 'none',
                    background: platformStatus === 'valid' ? '#a6e3a1' : '#a855f7',
                    color: platformStatus === 'valid' ? '#11111b' : '#fff',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    opacity: !platformKey.startsWith('sk-ava-') ? 0.4 : 1,
                  }}
                >
                  {platformStatus === 'validating' ? 'Checking...' : platformStatus === 'valid' ? `Connected as ${platformEmail}` : platformStatus === 'invalid' ? 'Invalid key' : 'Connect'}
                </button>
              </div>

              {/* BYOK */}
              <div style={{ background: '#181825', border: '1px solid #313244', borderRadius: 12, padding: 16 }}>
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

        {/* Step 3: Working Hours */}
        {step === 2 && (
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

        {/* Step 4: Ready */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#cdd6f4', marginBottom: 8 }}>You're Ready</h2>
            <p style={{ fontSize: 13, color: '#6c7086', marginBottom: 24 }}>Ava is waiting. Where do you want to start?</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'Open Ava Chat', icon: '💬', nav: 'Ava Chat' },
                { label: 'Documentation', icon: '📖', nav: 'Documentation' },
                { label: 'Command Centre', icon: '⚡', nav: 'Command Centre' },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => finish(a.nav)}
                  style={{
                    background: '#181825', border: '1px solid #313244', borderRadius: 10,
                    padding: '16px 8px', cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#313244')}
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
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{ background: 'none', border: 'none', color: '#6c7086', fontSize: 12, cursor: 'pointer' }}
            >Back</button>
          ) : <div />}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => finish()}
              style={{ background: 'none', border: 'none', color: '#585b70', fontSize: 11, cursor: 'pointer' }}
            >Skip</button>

            {step < totalSteps - 1 && (
              <button
                onClick={() => setStep(s => s + 1)}
                style={{
                  padding: '8px 24px', background: '#a855f7', border: 'none',
                  borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
