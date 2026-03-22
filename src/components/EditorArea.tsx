export default function EditorArea() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div
        style={{
          height: 36,
          background: '#181825',
          display: 'flex',
          alignItems: 'stretch',
          flexShrink: 0,
          borderBottom: '1px solid #313244',
        }}
      >
        {/* Active tab */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 12px',
            background: '#1e1e2e',
            borderTop: '1px solid #a855f7',
            borderRight: '1px solid #313244',
            cursor: 'pointer',
            minWidth: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span style={{ fontSize: 13, color: '#cdd6f4', whiteSpace: 'nowrap' }}>Welcome</span>
          <button
            style={{
              width: 18,
              height: 18,
              background: 'transparent',
              border: 'none',
              color: '#6c7086',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: 4,
              marginLeft: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#313244'; e.currentTarget.style.color = '#cdd6f4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6c7086'; }}
          >
            <svg width="8" height="8" viewBox="0 0 10 10">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor content: Welcome page */}
      <div
        style={{
          flex: 1,
          background: '#1e1e2e',
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
          padding: '48px 24px',
        }}
      >
        <div style={{ maxWidth: 640, width: '100%' }}>
          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <img
              src="/icon.png"
              width="72"
              height="72"
              style={{ borderRadius: 16, margin: '0 auto 20px', display: 'block', boxShadow: '0 8px 32px rgba(168,85,247,0.25)' }}
              alt="Ava | Supernova"
            />
            <h1 style={{
              fontSize: 28,
              fontWeight: 300,
              color: '#cdd6f4',
              letterSpacing: -0.5,
              marginBottom: 6,
            }}>
              Welcome to <span style={{ fontWeight: 600 }}>Ava</span> <span style={{ color: '#a855f7', fontWeight: 600 }}>|</span> <span style={{ fontWeight: 600 }}>Supernova IDE</span>
            </h1>
            <p style={{ fontSize: 14, color: '#6c7086', marginBottom: 4 }}>
              The AI-native development environment
            </p>
            <span style={{
              display: 'inline-block',
              fontSize: 11,
              color: '#a855f7',
              background: 'rgba(168,85,247,0.1)',
              padding: '3px 10px',
              borderRadius: 10,
              marginTop: 8,
            }}>
              v0.1.0-alpha
            </span>
          </div>

          {/* Quick Actions */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              Quick Actions
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { icon: 'folder', label: 'Open Folder', shortcut: 'Ctrl+K Ctrl+O' },
                { icon: 'file', label: 'New File', shortcut: 'Ctrl+N' },
                { icon: 'terminal', label: 'Open Terminal', shortcut: 'Ctrl+`' },
              ].map((action) => (
                <button
                  key={action.label}
                  style={{
                    background: '#181825',
                    border: '1px solid #313244',
                    borderRadius: 8,
                    padding: '16px 12px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.background = '#1e1e2e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#313244'; e.currentTarget.style.background = '#181825'; }}
                >
                  <div style={{ marginBottom: 8, color: '#a855f7' }}>
                    {action.icon === 'folder' && (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
                      </svg>
                    )}
                    {action.icon === 'file' && (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                    )}
                    {action.icon === 'terminal' && (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#cdd6f4', fontWeight: 500, marginBottom: 4 }}>{action.label}</div>
                  <div style={{ fontSize: 11, color: '#6c7086' }}>{action.shortcut}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Recent Projects */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              Recent Projects
            </h2>
            <div style={{ background: '#181825', border: '1px solid #313244', borderRadius: 8, overflow: 'hidden' }}>
              {[
                { name: 'ava-supernova', path: '~/projects/ava-supernova' },
                { name: 'ava-supernova-companion', path: '~/projects/ava-supernova-companion' },
                { name: 'ava-supernova-platform', path: '~/projects/ava-supernova-platform' },
              ].map((project, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: i < 2 ? '1px solid #313244' : 'none',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.05)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#cdd6f4', fontWeight: 500 }}>{project.name}</div>
                    <div style={{ fontSize: 11, color: '#6c7086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.path}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6c7086" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* Ava Tips */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              Ava Tips
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { tip: 'Press Ctrl+Shift+A to open Ava chat anywhere', icon: 'chat' },
                { tip: 'Use >> to switch to Work mode for full tool access', icon: 'mode' },
                { tip: 'Type ?? to enter Teach mode — free AI tutoring for everyone', icon: 'teach' },
                { tip: 'Ava remembers your preferences across sessions', icon: 'memory' },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    background: '#181825',
                    border: '1px solid #313244',
                    borderRadius: 8,
                  }}
                >
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: 'rgba(168,85,247,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {item.icon === 'chat' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                    )}
                    {item.icon === 'mode' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                    )}
                    {item.icon === 'teach' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
                      </svg>
                    )}
                    {item.icon === 'memory' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2z" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: '#a6adc8' }}>{item.tip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', paddingBottom: 32 }}>
            <p style={{ fontSize: 12, color: '#6c7086' }}>
              Built with purpose. Open source.{' '}
              <span style={{ color: '#a855f7' }}>Augmented Value Acceleration</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
