import { useState, type ReactNode } from 'react';
import type { ActivityItem, SidebarPosition } from '../App';
import { validateKey, getStoredEmail, getStoredTier } from '../lib/api';

interface Props {
  activePanel: ActivityItem;
  position?: SidebarPosition;
  onTogglePosition?: () => void;
  onDashboardSelect?: (page: string) => void;
  activeDashboardPage?: string | null;
}

const panelTitles: Record<ActivityItem, string> = {
  explorer: 'EXPLORER',
  search: 'SEARCH',
  git: 'SOURCE CONTROL',
  ava: 'AVA',
  extensions: 'EXTENSIONS',
  debug: 'RUN AND DEBUG',
  dashboard: 'DASHBOARD',
};

/* ---------- File tree placeholder ---------- */
const fileTree = [
  { name: 'src', type: 'folder' as const, depth: 0, open: true },
  { name: 'components', type: 'folder' as const, depth: 1, open: true },
  { name: 'TitleBar.tsx', type: 'file' as const, depth: 2 },
  { name: 'ActivityBar.tsx', type: 'file' as const, depth: 2 },
  { name: 'Sidebar.tsx', type: 'file' as const, depth: 2 },
  { name: 'EditorArea.tsx', type: 'file' as const, depth: 2 },
  { name: 'BottomPanel.tsx', type: 'file' as const, depth: 2 },
  { name: 'StatusBar.tsx', type: 'file' as const, depth: 2 },
  { name: 'App.tsx', type: 'file' as const, depth: 1 },
  { name: 'main.tsx', type: 'file' as const, depth: 1 },
  { name: 'index.css', type: 'file' as const, depth: 1 },
  { name: 'package.json', type: 'file' as const, depth: 0 },
  { name: 'tsconfig.json', type: 'file' as const, depth: 0 },
  { name: 'vite.config.ts', type: 'file' as const, depth: 0 },
];

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a6adc8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
    </svg>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop();
  let color = '#a6adc8';
  if (ext === 'tsx' || ext === 'ts') color = '#89b4fa';
  if (ext === 'css') color = '#a6e3a1';
  if (ext === 'json') color = '#f9e2af';
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ExplorerPanel() {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#cdd6f4', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Ava-Supernova-IDE
      </div>
      {fileTree.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            paddingLeft: 8 + item.depth * 16,
            fontSize: 13,
            color: '#cdd6f4',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#313244'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {item.type === 'folder' ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d={item.open ? 'M2 4l4 4 4-4' : 'M4 2l4 4-4 4'} stroke="#a6adc8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <FolderIcon />
            </>
          ) : (
            <>
              <span style={{ width: 12 }} />
              <FileIcon name={item.name} />
            </>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        </div>
      ))}
    </div>
  );
}

function SearchPanel() {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search"
          style={{
            width: '100%',
            height: 28,
            background: '#313244',
            border: '1px solid #313244',
            borderRadius: 4,
            padding: '0 8px',
            fontSize: 13,
            color: '#cdd6f4',
            outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
        />
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <input
          type="text"
          placeholder="Replace"
          style={{
            flex: 1,
            height: 28,
            background: '#313244',
            border: '1px solid #313244',
            borderRadius: 4,
            padding: '0 8px',
            fontSize: 13,
            color: '#cdd6f4',
            outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
        />
      </div>
      <div style={{ marginTop: 16, fontSize: 12, color: '#6c7086', textAlign: 'center' }}>
        Search to find results across your workspace.
      </div>
    </div>
  );
}

function GitPanel() {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Message (Ctrl+Enter to commit)"
          style={{
            flex: 1,
            height: 28,
            background: '#313244',
            border: '1px solid #313244',
            borderRadius: 4,
            padding: '0 8px',
            fontSize: 13,
            color: '#cdd6f4',
            outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
        />
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Changes
      </div>
      <div style={{ fontSize: 12, color: '#6c7086', textAlign: 'center', padding: '16px 0' }}>
        No changes detected.
      </div>
    </div>
  );
}

function AvaPanel() {
  const [messages] = useState([
    { role: 'ava' as const, text: 'Hello! I\'m Ava, your AI coding assistant. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {msg.role === 'ava' ? (
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              ) : (
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#313244',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cdd6f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: msg.role === 'ava' ? '#a855f7' : '#cdd6f4' }}>
                {msg.role === 'ava' ? 'Ava' : 'You'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#cdd6f4', lineHeight: 1.5, paddingLeft: 28 }}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #313244' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Ava..."
            style={{
              flex: 1,
              height: 32,
              background: '#313244',
              border: '1px solid #313244',
              borderRadius: 6,
              padding: '0 10px',
              fontSize: 13,
              color: '#cdd6f4',
              outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
          />
          <button
            style={{
              width: 32,
              height: 32,
              background: '#a855f7',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtensionsPanel() {
  const extensions = [
    { name: 'Ava Intelligence', publisher: 'Augmented Value Acceleration', installed: true },
    { name: 'Python', publisher: 'Microsoft', installed: true },
    { name: 'Rust Analyzer', publisher: 'rust-lang', installed: false },
    { name: 'Prettier', publisher: 'Prettier', installed: true },
    { name: 'ESLint', publisher: 'Microsoft', installed: true },
  ];

  return (
    <div style={{ padding: 12 }}>
      <input
        type="text"
        placeholder="Search Extensions..."
        style={{
          width: '100%',
          height: 28,
          background: '#313244',
          border: '1px solid #313244',
          borderRadius: 4,
          padding: '0 8px',
          fontSize: 13,
          color: '#cdd6f4',
          outline: 'none',
          marginBottom: 12,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
      />
      <div style={{ fontSize: 11, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Installed
      </div>
      {extensions.map((ext, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 4px',
            cursor: 'pointer',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#313244'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            background: ext.name === 'Ava Intelligence' ? 'linear-gradient(135deg, #a855f7, #6366f1)' : '#313244',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cdd6f4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#cdd6f4', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ext.name}
            </div>
            <div style={{ fontSize: 11, color: '#6c7086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ext.publisher}
            </div>
          </div>
          {ext.installed && (
            <div style={{ fontSize: 10, color: '#a6e3a1', padding: '2px 6px', background: 'rgba(166,227,161,0.1)', borderRadius: 3 }}>
              Installed
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DebugPanel() {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <select
          style={{
            flex: 1,
            height: 28,
            background: '#313244',
            border: '1px solid #313244',
            borderRadius: 4,
            padding: '0 8px',
            fontSize: 13,
            color: '#cdd6f4',
            outline: 'none',
          }}
        >
          <option>No Configuration</option>
        </select>
        <button
          style={{
            width: 28,
            height: 28,
            background: '#a6e3a1',
            border: 'none',
            borderRadius: 4,
            color: '#11111b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#6c7086', textAlign: 'center', padding: '32px 0' }}>
        To customize Run and Debug, create a launch.json file.
      </div>
    </div>
  );
}

/* ---------- Auth + BYOK Section ---------- */
function AuthSection() {
  const [platformKey, setPlatformKey] = useState(() => {
    try { return localStorage.getItem('ava-ide-platform-key') || ''; } catch { return ''; }
  });
  const [email, setEmail] = useState(() => getStoredEmail() || '');
  const [tier, setTier] = useState(() => getStoredTier() || 'free');
  const [showConnect, setShowConnect] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [usePlatform, setUsePlatform] = useState(true);

  const isConnected = platformKey.startsWith('sk-ava-');

  const providers = ['DeepSeek', 'Moonshot', 'Qwen', 'Zhipu', 'Mistral'];
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('ava-ide-byok'); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });

  const saveKey = (provider: string, value: string) => {
    const next = { ...keys, [provider]: value };
    setKeys(next);
    try { localStorage.setItem('ava-ide-byok', JSON.stringify(next)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('ava-byok-changed'));
  };

  const tierColors: Record<string, string> = {
    free: '#a6adc8', pro: '#a855f7', ultra: '#f9e2af', enterprise: '#89b4fa', admin: '#f38ba8',
  };

  const handleConnect = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed.startsWith('sk-ava-')) { setError('Key must start with sk-ava-'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await validateKey(trimmed);
      if (!result.valid) {
        setError(result.error || 'Invalid API key');
        setLoading(false);
        return;
      }
      setPlatformKey(trimmed);
      setEmail(result.email || '');
      setTier(result.tier || 'free');
      try {
        localStorage.setItem('ava-ide-platform-key', trimmed);
        if (result.email) localStorage.setItem('ava-ide-email', result.email);
        if (result.tier) localStorage.setItem('ava-ide-tier', result.tier);
      } catch { /* */ }
      setShowConnect(false);
      setKeyInput('');
      window.dispatchEvent(new CustomEvent('ava-auth-changed'));
    } catch {
      setError('Could not reach platform');
    }
    setLoading(false);
  };

  const handleDisconnect = () => {
    setPlatformKey('');
    setEmail('');
    setTier('free');
    try {
      localStorage.removeItem('ava-ide-platform-key');
      localStorage.removeItem('ava-ide-email');
      localStorage.removeItem('ava-ide-tier');
    } catch { /* */ }
    window.dispatchEvent(new CustomEvent('ava-auth-changed'));
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 28, background: '#313244', border: '1px solid #313244',
    borderRadius: 4, padding: '0 8px', fontSize: 12, color: '#cdd6f4', outline: 'none',
  };

  return (
    <div style={{ borderTop: '1px solid #313244', padding: '10px 12px' }}>
      {isConnected ? (
        <>
          {/* Connected state */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {(() => {
              const av = localStorage.getItem('ava-ide-user-avatar');
              return (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: av ? 'transparent' : 'linear-gradient(135deg, #a855f7, #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  {av ? (
                    <img src={av} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
              );
            })()}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#cdd6f4', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email || platformKey.slice(0, 12) + '...'}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, color: tierColors[tier] || '#a6e3a1', background: `${tierColors[tier] || '#a6e3a1'}18`, padding: '1px 6px', borderRadius: 3, textTransform: 'capitalize' as const }}>
                {tier}
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              style={{ background: 'transparent', border: '1px solid #313244', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: '#6c7086', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f38ba8'; e.currentTarget.style.color = '#f38ba8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#313244'; e.currentTarget.style.color = '#6c7086'; }}
            >
              Disconnect
            </button>
          </div>

          {/* Platform / API Key toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {['Platform', 'API Key'].map((label) => {
              const active = label === 'Platform' ? usePlatform : !usePlatform;
              return (
                <button key={label} onClick={() => setUsePlatform(label === 'Platform')}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: active ? '#a855f7' : '#313244', color: active ? '#fff' : '#6c7086' }}>
                  {label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {!showConnect ? (
            <>
              <button
                onClick={() => setShowConnect(true)}
                style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: 'none', background: '#a855f7', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', marginBottom: 6 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#a855f7'; }}
              >
                Connect Account
              </button>
              <div style={{ fontSize: 10, color: '#6c7086', textAlign: 'center', marginBottom: 8 }}>
                Using your own API keys
              </div>
            </>
          ) : (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#a6adc8', marginBottom: 6 }}>
                1. Sign up at ava-supernova.com<br/>
                2. Dashboard → API Keys<br/>
                3. Paste your sk-ava-... key below
              </div>
              <input
                type="password"
                placeholder="sk-ava-..."
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
                style={{ ...inputStyle, marginBottom: 4, fontFamily: 'monospace', fontSize: 11 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
              />
              {error && <div style={{ fontSize: 10, color: '#f38ba8', marginBottom: 4 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleConnect} disabled={loading}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 4, border: 'none', background: '#a855f7', color: '#fff', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                  {loading ? 'Connecting...' : 'Connect'}
                </button>
                <button onClick={() => { setShowConnect(false); setKeyInput(''); setError(''); }}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 4, border: '1px solid #313244', background: 'transparent', color: '#6c7086', fontSize: 11, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* API Keys (BYOK) — always available */}
      <button
        onClick={() => setShowKeys(!showKeys)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', background: 'transparent', border: 'none', color: '#6c7086', fontSize: 11, cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; }}
      >
        <span style={{ fontWeight: 600 }}>API Keys (BYOK)</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: showKeys ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {showKeys && (
        <div style={{ paddingTop: 6 }}>
          {providers.map((p) => (
            <div key={p} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 2 }}>{p}</div>
              <input type="password" placeholder={`${p} API key`} value={keys[p] || ''}
                onChange={(e) => saveKey(p, e.target.value)}
                style={{ ...inputStyle, height: 24, fontSize: 11 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#a855f7'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#313244'; }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Dashboard Panel ---------- */

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8,
  color: '#585b70', padding: '10px 10px 4px', userSelect: 'none',
};

const sections = [
  {
    items: [
      { icon: '\u26A1', label: 'Command Centre', desc: 'Overview of everything' },
      { icon: '\uD83D\uDCAC', label: 'Ava Chat', desc: 'Full-width AI chat' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { icon: '\uD83D\uDCDC', label: 'Chat History', desc: 'Past conversations' },
      { icon: '\uD83E\uDDE0', label: 'Memory', desc: 'View and manage memories' },
      { icon: '\u2705', label: 'Tasks', desc: 'Your task list' },
      { icon: '\uD83D\uDCD3', label: 'Journal', desc: 'Daily entries' },
      { icon: '\uD83C\uDF93', label: 'Learning', desc: 'Curriculums and progress' },
      { icon: '\uD83D\uDDBC\uFE0F', label: 'Library', desc: 'Images and documents' },
    ],
  },
  {
    title: 'Personalise',
    items: [
      { icon: '\uD83C\uDFA8', label: 'Personality', desc: 'Design your AI' },
      { icon: '\u2601\uFE0F', label: 'Cloud Sync', desc: 'Push to cloud' },
    ],
  },
  {
    title: 'Account',
    items: [
      { icon: '\uD83D\uDCCA', label: 'Usage', desc: 'Token usage and stats' },
      { icon: '\uD83D\uDCB3', label: 'Billing', desc: 'Plan and top-ups' },
      { icon: '\u2699\uFE0F', label: 'Settings', desc: 'Preferences and keys' },
      { icon: '\uD83D\uDD17', label: 'Connections', desc: 'GitHub, Slack, Discord' },
    ],
  },
  {
    title: 'Help',
    items: [
      { icon: '\uD83C\uDD98', label: 'Support', desc: 'Get help' },
      { icon: '\uD83D\uDCD6', label: 'Documentation', desc: 'Guides and reference' },
      { icon: '\uD83D\uDCCB', label: 'Release Notes', desc: 'What\'s new' },
    ],
  },
];

function DashboardPanel({ onDashboardSelect, activePage }: { onDashboardSelect?: (page: string) => void; activePage?: string | null }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { const s = localStorage.getItem('ava-ide-sidebar-collapsed'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

  const toggleSection = (title: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [title]: !prev[title] };
      try { localStorage.setItem('ava-ide-sidebar-collapsed', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {sections.map((section, si) => {
          const isCollapsed = section.title ? !!collapsed[section.title] : false;
          const hasActive = section.items.some(item => activePage === item.label);
          return (
            <div key={si}>
              {section.title && (
                <button
                  onClick={() => toggleSection(section.title!)}
                  style={{
                    ...sectionLabelStyle,
                    display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: hasActive && isCollapsed ? '#a855f7' : '#585b70',
                  }}
                >
                  <span style={{
                    fontSize: 7, transition: 'transform 0.15s',
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                  }}>▶</span>
                  {section.title}
                  {hasActive && isCollapsed && <span style={{ fontSize: 7, color: '#a855f7' }}>●</span>}
                </button>
              )}
              {!isCollapsed && section.items.map((item) => {
                const isActive = activePage === item.label;
                return (
                  <button
                    key={item.label}
                    onClick={() => onDashboardSelect?.(item.label)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '7px 10px', borderRadius: 6, border: 'none',
                      background: isActive ? '#313244' : 'transparent',
                      color: isActive ? '#cba6f7' : '#cdd6f4', cursor: 'pointer',
                      fontSize: 13, textAlign: 'left', transition: 'background 0.15s',
                      borderLeft: isActive ? '2px solid #a855f7' : '2px solid transparent',
                    }}
                    onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = '#313244'; }}
                    onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 12 }}>{item.label}</div>
                      <div style={{ fontSize: 10, color: '#585b70', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Auth + BYOK section at the bottom */}
      <AuthSection />
    </div>
  );
}

export default function Sidebar({ activePanel, position = 'left', onTogglePosition, onDashboardSelect, activeDashboardPage }: Props) {
  const panels: Record<ActivityItem, (props?: { onDashboardSelect?: (page: string) => void }) => ReactNode> = {
    explorer: ExplorerPanel,
    search: SearchPanel,
    git: GitPanel,
    ava: AvaPanel,
    extensions: ExtensionsPanel,
    debug: DebugPanel,
    dashboard: () => <DashboardPanel onDashboardSelect={onDashboardSelect} activePage={activeDashboardPage} />,
  };

  const Panel = panels[activePanel];

  return (
    <div
      style={{
        width: 260,
        background: '#181825',
        borderRight: position === 'left' ? '1px solid #313244' : 'none',
        borderLeft: position === 'right' ? '1px solid #313244' : 'none',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {panelTitles[activePanel]}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {onTogglePosition && (
            <button
              onClick={onTogglePosition}
              title={`Move sidebar to ${position === 'left' ? 'right' : 'left'}`}
              style={{
                width: 22, height: 22, background: 'transparent', border: 'none',
                color: '#6c7086', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, padding: 0,
              }}
              onMouseOver={(e) => e.currentTarget.style.color = '#cdd6f4'}
              onMouseOut={(e) => e.currentTarget.style.color = '#6c7086'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: position === 'left' ? 'none' : 'scaleX(-1)' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          )}
        <button
          style={{
            width: 22,
            height: 22,
            background: 'transparent',
            border: 'none',
            color: '#6c7086',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Panel />
      </div>
    </div>
  );
}
