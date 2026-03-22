import { useState, useEffect, useRef } from 'react';
import type { BottomTab } from '../App';

interface Props {
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
  onClose: () => void;
}

const tabs: { id: BottomTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'debug-console', label: 'Debug Console' },
];

function BlinkingCursor() {
  const [visible, setVisible] = useState(true);
  const ref = useRef<number>(0);

  useEffect(() => {
    ref.current = window.setInterval(() => setVisible((v) => !v), 530);
    return () => { clearInterval(ref.current); };
  }, []);

  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 14,
        background: visible ? '#cdd6f4' : 'transparent',
        marginLeft: 2,
        verticalAlign: 'middle',
      }}
    />
  );
}

export default function BottomPanel({ activeTab, onTabChange, onClose }: Props) {
  const [panelHeight, setPanelHeight] = useState(250);
  const resizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(250);

  const onMouseDown = (e: React.MouseEvent) => {
    resizing.current = true;
    startY.current = e.clientY;
    startHeight.current = panelHeight;

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const delta = startY.current - ev.clientY;
      const newH = Math.min(Math.max(startHeight.current + delta, 100), 600);
      setPanelHeight(newH);
    };

    const onMouseUp = () => {
      resizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      style={{
        height: panelHeight,
        background: '#181825',
        borderTop: '1px solid #313244',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          height: 3,
          cursor: 'ns-resize',
          background: 'transparent',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#a855f7'; }}
        onMouseLeave={(e) => { if (!resizing.current) e.currentTarget.style.background = 'transparent'; }}
      />

      {/* Tab bar + close */}
      <div
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  height: 36,
                  padding: '0 12px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #a855f7' : '2px solid transparent',
                  color: isActive ? '#cdd6f4' : '#6c7086',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#a6adc8'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#6c7086'; }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Maximize */}
          <button
            style={{
              width: 24,
              height: 24,
              background: 'transparent',
              border: 'none',
              color: '#6c7086',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; e.currentTarget.style.background = '#313244'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              width: 24,
              height: 24,
              background: 'transparent',
              border: 'none',
              color: '#6c7086',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; e.currentTarget.style.background = '#313244'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        style={{
          flex: 1,
          background: '#11111b',
          overflow: 'auto',
          padding: activeTab === 'terminal' ? '8px 14px' : '12px 14px',
          fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {activeTab === 'terminal' && (
          <div>
            <div style={{ color: '#6c7086', marginBottom: 8, fontSize: 12 }}>
              Ava Supernova IDE Terminal
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#a855f7' }}>ava</span>
              <span style={{ color: '#6c7086' }}>:</span>
              <span style={{ color: '#89b4fa' }}>~/project</span>
              <span style={{ color: '#cdd6f4', marginLeft: 4 }}>$ </span>
              <BlinkingCursor />
            </div>
          </div>
        )}

        {activeTab === 'problems' && (
          <div style={{ color: '#6c7086', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
            No problems detected in workspace.
          </div>
        )}

        {activeTab === 'output' && (
          <div style={{ color: '#6c7086', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
            No output to display.
          </div>
        )}

        {activeTab === 'debug-console' && (
          <div style={{ color: '#6c7086', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
            Debug console is available when a debug session is running.
          </div>
        )}
      </div>
    </div>
  );
}
