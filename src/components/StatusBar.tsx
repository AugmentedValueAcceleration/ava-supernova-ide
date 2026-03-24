import { APP_VERSION } from './UpdateChecker';
import { t } from '../lib/i18n';

interface Props {
  onToggleTerminal: () => void;
  mode: string;
  onCycleMode?: () => void;
}

const MODE_SYMBOLS: Record<string, string> = {
  Work: '>>', Plan: '::', Chat: '..', Teach: '??', Security: '!!', Brainstorm: '**',
};

export default function StatusBar({ onToggleTerminal, mode, onCycleMode }: Props) {

  return (
    <div
      style={{
        height: 24,
        background: '#a855f7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Left section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Version */}
        <span
          onClick={() => window.dispatchEvent(new CustomEvent('ava-check-updates'))}
          style={{ fontSize: 11, color: '#fff', cursor: 'pointer', fontWeight: 500, opacity: 0.9 }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; }}
          title={t('dash.status.check_updates')}
        >
          v{APP_VERSION}
        </span>

        {/* Git branch */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 01-9 9" />
          </svg>
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 500 }}>main</span>
        </div>

        {/* Errors & warnings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span style={{ fontSize: 11, color: '#fff' }}>0</span>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: 11, color: '#fff' }}>0</span>
          </div>
        </div>
      </div>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Ava mode — click to cycle */}
        <div
          onClick={onCycleMode}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.15)',
            padding: '1px 8px',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          title={t('dash.status.cycle_mode', { mode })}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>
            {MODE_SYMBOLS[mode] || '>>'} {mode}
          </span>
        </div>

        {/* Language */}
        <span
          style={{ fontSize: 11, color: '#fff', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          TypeScript
        </span>

        {/* Encoding */}
        <span
          style={{ fontSize: 11, color: '#fff', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          UTF-8
        </span>

        {/* Line/Col */}
        <span
          style={{ fontSize: 11, color: '#fff', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          Ln 1, Col 1
        </span>

        {/* Terminal toggle */}
        <button
          onClick={onToggleTerminal}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
