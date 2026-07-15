import { useState, useRef, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { t, useLocale } from '../lib/i18n';
import { AnnouncementTicker } from './AnnouncementTicker';

interface TitleBarProps {
  onOpenFolder?: (path: string) => void;
  currentFolder?: string | null;
}

export default function TitleBar({ onOpenFolder, currentFolder }: TitleBarProps) {
  useLocale();
  let win: ReturnType<typeof getCurrentWindow> | null = null;
  try { win = getCurrentWindow(); } catch { /* not in Tauri */ }
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleOpenFolder = async () => {
    setMenuOpen(false);
    let selected;
    try { selected = await open({ directory: true, multiple: false, title: t('ide.titlebar.open_folder') }); } catch { return; }
    if (selected && typeof selected === 'string') {
      onOpenFolder?.(selected);
    }
  };

  const menuBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: '#cdd6f4',
    fontSize: 12,
    padding: '4px 10px',
    cursor: 'pointer',
    borderRadius: 4,
    // @ts-expect-error Tauri no-drag
    WebkitAppRegion: 'no-drag',
  };

  const menuItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: '#cdd6f4',
    fontSize: 12,
    padding: '6px 16px',
    cursor: 'pointer',
    textAlign: 'left',
  };

  const folderName = currentFolder ? currentFolder.split(/[/\\]/).pop() : null;

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 32,
        background: 'rgba(10, 6, 18, 0.98)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        userSelect: 'none',
        // @ts-expect-error Tauri window drag region CSS property
        WebkitAppRegion: 'drag',
        borderBottom: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
        flexShrink: 0,
      }}
    >
      {/* Left: Logo + File menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <img src="/icon.png" width="18" height="18" style={{ borderRadius: 4 }} alt="Ava" />
        <span style={{ fontSize: 12, color: '#cdd6f4', fontWeight: 500, letterSpacing: 0.3, marginRight: 4 }}>
          {t('dash.titlebar.title')}
        </span>

        {/* File menu */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              ...menuBtnStyle,
              background: menuOpen ? 'rgba(49, 34, 68, 0.5)' : 'transparent',
            }}
            onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.background = 'rgba(49, 34, 68, 0.3)'; }}
            onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}
          >
            File
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 2,
              background: '#1e1e2e',
              border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
              borderRadius: 6,
              padding: '4px 0',
              minWidth: 200,
              zIndex: 1000,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              // @ts-expect-error Tauri no-drag
              WebkitAppRegion: 'no-drag',
            }}>
              <button
                onClick={handleOpenFolder}
                style={menuItemStyle}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
                </svg>
                {t('ide.titlebar.open_folder')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Centre: hub announcement ticker when there's one, otherwise the current
          folder / welcome. No-drag so the ticker's dismiss button is clickable. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '46%',
          display: 'flex',
          justifyContent: 'center',
          fontSize: 12,
          color: '#a6adc8',
          // @ts-expect-error Tauri no-drag region CSS property
          WebkitAppRegion: 'no-drag',
        }}
      >
        <AnnouncementTicker
          fallback={
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {folderName || t('dash.titlebar.welcome')}
            </span>
          }
        />
      </div>

      {/* Right: Window controls */}
      {/* @ts-expect-error Tauri window no-drag region CSS property */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, WebkitAppRegion: 'no-drag' }}>
        <button
          onClick={() => win?.minimize()}
          style={{ width: 46, height: 32, background: 'transparent', border: 'none', color: '#a6adc8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button
          onClick={() => win?.toggleMaximize()}
          style={{ width: 46, height: 32, background: 'transparent', border: 'none', color: '#a6adc8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" /></svg>
        </button>
        <button
          onClick={() => win?.close()}
          style={{ width: 46, height: 32, background: 'transparent', border: 'none', color: '#a6adc8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#e81123'; e.currentTarget.style.color = '#ffffff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a6adc8'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  );
}
