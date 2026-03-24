import { useState, useEffect, useRef, useCallback } from 'react';
import type { BottomTab } from '../App';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { getPlatformKey, apiStreamUrl } from '../lib/api';
import { t } from '../lib/i18n';

interface Props {
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
  onClose: () => void;
}

const tabKeys: { id: BottomTab; key: string }[] = [
  { id: 'terminal', key: 'dash.panel.terminal' },
  { id: 'ava', key: 'dash.panel.ava' },
  { id: 'problems', key: 'dash.panel.problems' },
  { id: 'output', key: 'dash.panel.output' },
  { id: 'debug-console', key: 'dash.panel.debug' },
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

// ── Ava CLI Panel ──────────────────────────────────────────────────────────

interface CliLine {
  type: 'user' | 'ava' | 'tool' | 'error' | 'system';
  text: string;
}

function AvaCliPanel() {
  const [lines, setLines] = useState<CliLine[]>([
    { type: 'system', text: 'Ava | Supernova CLI — type a message and press Enter' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentResponse = useRef('');

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [lines]);

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const appendLine = useCallback((line: CliLine) => {
    setLines((prev) => [...prev, line]);
  }, []);

  const updateLastAva = useCallback((text: string) => {
    setLines((prev) => {
      const copy = [...prev];
      const lastIdx = copy.length - 1;
      if (lastIdx >= 0 && copy[lastIdx].type === 'ava') {
        copy[lastIdx] = { ...copy[lastIdx], text };
      }
      return copy;
    });
  }, []);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setInput('');
    setBusy(true);

    appendLine({ type: 'user', text: trimmed });
    currentResponse.current = '';

    const sidecar = getSidecar();

    // Try local sidecar first
    if (sidecar.isReady) {
      appendLine({ type: 'ava', text: '' });

      const handler = (event: SidecarEvent) => {
        switch (event.event) {
          case 'stream_delta':
            if (event.content) {
              currentResponse.current += event.content;
              updateLastAva(currentResponse.current);
            }
            break;
          case 'tool_call_start':
            appendLine({ type: 'tool', text: `[tool] ${event.toolName}` });
            appendLine({ type: 'ava', text: '' });
            currentResponse.current = '';
            break;
          case 'tool_call_end':
            setLines((prev) => {
              const copy = [...prev];
              let toolIdx = -1;
              for (let i = copy.length - 1; i >= 0; i--) {
                if (copy[i].type === 'tool' && copy[i].text.includes(event.toolName || '')) { toolIdx = i; break; }
              }
              if (toolIdx >= 0) {
                copy[toolIdx] = { ...copy[toolIdx], text: `[tool] ${event.toolName} — ${event.success ? 'done' : 'error'}` };
              }
              return copy;
            });
            break;
          case 'done':
            sidecar.offAny(handler);
            setBusy(false);
            inputRef.current?.focus();
            break;
          case 'error':
          case 'agent_error':
            appendLine({ type: 'error', text: event.message || 'Error' });
            sidecar.offAny(handler);
            setBusy(false);
            inputRef.current?.focus();
            break;
          case 'cancelled':
            sidecar.offAny(handler);
            setBusy(false);
            inputRef.current?.focus();
            break;
        }
      };

      sidecar.onAny(handler);

      try {
        await sidecar.sendMessage(trimmed);
      } catch (err: any) {
        appendLine({ type: 'error', text: err.message });
        sidecar.offAny(handler);
        setBusy(false);
      }
    }
    // Fallback: cloud API
    else {
      appendLine({ type: 'ava', text: '' });
      try {
        const key = getPlatformKey();
        if (!key) {
          appendLine({ type: 'error', text: 'No platform key. Connect account or start local sidecar.' });
          setBusy(false);
          return;
        }

        const response = await fetch(apiStreamUrl('/chat'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen-flash',
            messages: [{ role: 'user', content: trimmed }],
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          const text = json.choices?.[0]?.message?.content || json.content || json.text || '';
          updateLastAva(text || '(empty response)');
        } else {
          const reader = response.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const sseLines = buffer.split('\n');
              buffer = sseLines.pop() || '';
              for (const line of sseLines) {
                const t = line.trim();
                if (t.startsWith('data: ') && t !== 'data: [DONE]') {
                  try {
                    const json = JSON.parse(t.slice(6));
                    const c = json.choices?.[0]?.delta?.content || json.delta?.content || '';
                    if (c) { currentResponse.current += c; updateLastAva(currentResponse.current); }
                  } catch { /* */ }
                }
              }
            }
          }
        }
      } catch (err: any) {
        appendLine({ type: 'error', text: err.message });
      }
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [input, busy, appendLine, updateLastAva]);

  const lineColors: Record<CliLine['type'], string> = {
    user: '#89b4fa',
    ava: '#cdd6f4',
    tool: '#a855f7',
    error: '#f38ba8',
    system: '#6c7086',
  };

  const linePrefix: Record<CliLine['type'], string> = {
    user: '>> ',
    ava: '',
    tool: '',
    error: '! ',
    system: '# ',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Output */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {lines.map((line, i) => (
          <div key={i} style={{
            color: lineColors[line.type],
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            <span style={{ opacity: 0.5 }}>{linePrefix[line.type]}</span>
            {line.text}
            {line.type === 'ava' && busy && i === lines.length - 1 && <BlinkingCursor />}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 14px',
        borderTop: '1px solid #313244', background: '#181825',
      }}>
        <span style={{
          color: '#a855f7', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          fontSize: 13, marginRight: 4, fontWeight: 600,
        }}>{'>'}</span>
        <span style={{
          color: '#6c7086', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
          fontSize: 13, marginRight: 6,
        }}>{'>'}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder={busy ? t('dash.panel.ava_working') : t('dash.panel.ava_placeholder')}
          disabled={busy}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#cdd6f4', fontSize: 13, fontFamily: "'Cascadia Code', 'Fira Code', monospace",
            opacity: busy ? 0.5 : 1,
          }}
        />
      </div>
    </div>
  );
}

// ── Main Bottom Panel ──────────────────────────────────────────────────────

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
          {tabKeys.map((tab) => {
            const isActive = activeTab === tab.id;
            const isAva = tab.id === 'ava';
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
                  color: isActive ? (isAva ? '#a855f7' : '#cdd6f4') : '#6c7086',
                  fontSize: 12,
                  fontWeight: isAva ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#a6adc8'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = isActive ? (isAva ? '#a855f7' : '#cdd6f4') : '#6c7086'; }}
              >
                {isAva && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                )}
                {t(tab.key)}
              </button>
            );
          })}
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            style={{
              width: 24, height: 24, background: 'transparent', border: 'none',
              color: '#6c7086', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; e.currentTarget.style.background = '#313244'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            onClick={onClose}
            style={{
              width: 24, height: 24, background: 'transparent', border: 'none',
              color: '#6c7086', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: 4,
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
          overflow: 'hidden',
          fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {activeTab === 'terminal' && (
          <div style={{ padding: '8px 14px', height: '100%' }}>
            <div style={{ color: '#6c7086', marginBottom: 8, fontSize: 12 }}>
              {t('dash.panel.terminal_title')}
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

        {activeTab === 'ava' && <AvaCliPanel />}

        {activeTab === 'problems' && (
          <div style={{ color: '#6c7086', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
            {t('dash.panel.no_problems')}
          </div>
        )}

        {activeTab === 'output' && (
          <div style={{ color: '#6c7086', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
            {t('dash.panel.no_output')}
          </div>
        )}

        {activeTab === 'debug-console' && (
          <div style={{ color: '#6c7086', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
            {t('dash.panel.debug_hint')}
          </div>
        )}
      </div>
    </div>
  );
}
