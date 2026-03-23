import { getCurrentWindow } from '@tauri-apps/api/window';

export default function TitleBar() {
  const win = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 32,
        background: '#11111b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        userSelect: 'none',
        // @ts-expect-error Tauri window drag region CSS property
        WebkitAppRegion: 'drag',
        borderBottom: '1px solid #313244',
        flexShrink: 0,
      }}
    >
      {/* Left: Logo + Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src="/icon.png" width="18" height="18" style={{ borderRadius: 4 }} alt="Ava" />
        <span style={{ fontSize: 12, color: '#cdd6f4', fontWeight: 500, letterSpacing: 0.3 }}>
          Ava | Supernova IDE
        </span>
      </div>

      {/* Centre: Current file */}
      <div
        data-tauri-drag-region
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 12,
          color: '#a6adc8',
        }}
      >
        Welcome
      </div>

      {/* Right: Window controls */}
      {/* @ts-expect-error Tauri window no-drag region CSS property */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, WebkitAppRegion: 'no-drag' }}>
        {/* Minimize */}
        <button
          onClick={() => win.minimize()}
          style={{
            width: 46,
            height: 32,
            background: 'transparent',
            border: 'none',
            color: '#a6adc8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#313244'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        {/* Maximize */}
        <button
          onClick={() => win.toggleMaximize()}
          style={{
            width: 46,
            height: 32,
            background: 'transparent',
            border: 'none',
            color: '#a6adc8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#313244'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={() => win.close()}
          style={{
            width: 46,
            height: 32,
            background: 'transparent',
            border: 'none',
            color: '#a6adc8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e81123'; e.currentTarget.style.color = '#ffffff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a6adc8'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
