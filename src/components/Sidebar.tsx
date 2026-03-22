import { useState, type ReactNode } from 'react';
import type { ActivityItem } from '../App';

interface Props {
  activePanel: ActivityItem;
}

const panelTitles: Record<ActivityItem, string> = {
  explorer: 'EXPLORER',
  search: 'SEARCH',
  git: 'SOURCE CONTROL',
  ava: 'AVA',
  extensions: 'EXTENSIONS',
  debug: 'RUN AND DEBUG',
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

export default function Sidebar({ activePanel }: Props) {
  const panels: Record<ActivityItem, () => ReactNode> = {
    explorer: ExplorerPanel,
    search: SearchPanel,
    git: GitPanel,
    ava: AvaPanel,
    extensions: ExtensionsPanel,
    debug: DebugPanel,
  };

  const Panel = panels[activePanel];

  return (
    <div
      style={{
        width: 260,
        background: '#181825',
        borderRight: '1px solid #313244',
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

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Panel />
      </div>
    </div>
  );
}
