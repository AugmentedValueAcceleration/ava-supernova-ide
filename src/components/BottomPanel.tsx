import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { BottomTab } from '../App';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { getPlatformKey, apiStreamUrl, fetchPlatformModels, getCachedModels, type PlatformModel } from '../lib/api';
import { useModeAvailability } from '../lib/mode-availability';
import { t, useLocale } from '../lib/i18n';
import ModelDropdown, { type IdeModelOption } from './ModelDropdown';

// Tier + auth state are now sourced via useModeAvailability — see
// lib/mode-availability.ts. The local readTier helper is retired.

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
    { type: 'system', text: 'Ava Supernova CLI — type a message and press Enter' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentResponse = useRef('');

  // Model selector state. Defaults to Maestro (auto) — matches the
  // extension's default. Persisted to localStorage so the choice survives
  // panel re-mounts.
  const [activeModel, setActiveModel] = useState<string>(() => {
    try { return localStorage.getItem('ava-ide-active-model') || 'auto'; } catch { return 'auto'; }
  });
  const [platformModels, setPlatformModels] = useState<PlatformModel[]>(() => getCachedModels() || []);
  // Mode availability — Aurora / Supernova / Maestro gated via the
  // shared lib so this picker stays in lockstep with the dashboard
  // chat picker. Hook handles ava-auth-changed / ava-byok-changed /
  // ava-tier-changed internally.
  const { state: modeState, availability: modeAvailability } = useModeAvailability();

  // Lazy-load the platform model list (1-hour cache inside fetchPlatformModels).
  // Falls back silently when offline / unauthenticated — orchestrated modes
  // still appear because they're injected client-side below.
  useEffect(() => {
    let cancelled = false;
    fetchPlatformModels().then((m) => {
      if (!cancelled && m) setPlatformModels(m);
    });
    return () => { cancelled = true; };
  }, []);

  // Build the dropdown's model list: orchestrated entries (Maestro always
  // available, Supernova admin-gated to match v0.50.0 release notes — admin
  // gets it active, everyone else sees "In development") + raw platform
  // models (BYOK + managed) sourced from /api/models.
  const dropdownModels: IdeModelOption[] = useMemo(() => {
    // Three orchestrated modes — gated identically to the dashboard
    // chat picker via mode-availability lib. Plan path lights up
    // Maestro for everyone, Aurora/Supernova for admins; BYOK path
    // lights each one up the moment the right keys are present.
    const orchestrated: IdeModelOption[] = [
      { id: 'aurora',    name: 'Aurora',    provider: 'platform', available: modeAvailability.aurora },
      { id: 'supernova', name: 'Supernova', provider: 'platform', available: modeAvailability.supernova },
      { id: 'auto',      name: 'Maestro',   provider: 'platform', available: modeAvailability.maestro },
    ];
    // Raw individual models are now BYOK-only. Plans surface only the
    // 3 modes; raw model selection is a BYOK-side power-user path.
    // section==='byok' means the server returned this model because
    // the user has the relevant provider key configured.
    const raw: IdeModelOption[] = platformModels
      .filter((m) => m.section === 'byok')
      .map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        available: true,
      }));
    return [...orchestrated, ...raw];
  }, [platformModels, modeAvailability]);
  // Surface modeState so the orchestrated subtitles can explain unlock
  // paths (e.g. "Add Mistral key" / "Connect or add DeepSeek + Qwen").
  // Read here so eslint sees it as used; ModelDropdown is the consumer.
  void modeState;

  const handleSwitchModel = useCallback((modelId: string) => {
    setActiveModel(modelId);
    try { localStorage.setItem('ava-ide-active-model', modelId); } catch { /* ignore */ }
    // If the sidecar is up, hot-swap the model in the running agent so
    // 'auto' / 'supernova' actually reach AutoCoordinator. Without this,
    // the dropdown changed UI state only and the sidecar kept whatever
    // model it was initialised with — Supernova would be a no-op.
    const sidecar = getSidecar();
    if (sidecar.isReady) {
      sidecar.setModel(modelId).catch(() => { /* surfaced via sidecar event stream */ });
    }
  }, []);

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

    // `@@` prefix → run this single turn in desktop mode. The terminal
    // panel doesn't persist chat mode (the main chat does that); here
    // we just prepend the desktop tag so the agent picks up the mode
    // for this message.
    let effectiveText = trimmed;
    if (trimmed.startsWith('@@')) {
      const preset = trimmed.slice(2).trim();
      if (!preset) { setInput(''); setBusy(false); return; }
      effectiveText = `[Desktop Automation Mode] ${preset}`;
    }

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
        await sidecar.sendMessage(effectiveText);
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
            // Orchestrated modes ('auto' = Maestro, 'supernova') resolve
            // server-side to the right coordinator. Raw model ids pass
            // through untouched. Falls back to qwen3.5-flash only if no
            // model has been picked yet (shouldn't happen — default is
            // 'auto' from initial state).
            model: activeModel || 'qwen3.5-flash',
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
    tool: 'var(--accent)',
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

      {/* Model selector row — sits above the prompt so the active model
          is visible while typing. Same Maestro/Supernova/raw-model split
          the extension uses. */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 14px 0 14px',
        background: 'rgba(15, 10, 26, 0.95)',
      }}>
        <ModelDropdown
          models={dropdownModels}
          activeModel={activeModel}
          onSwitch={handleSwitchModel}
        />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 14px',
        borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'rgba(15, 10, 26, 0.95)',
      }}>
        <span style={{
          color: 'var(--accent)', fontFamily: "'Cascadia Code', 'Fira Code', monospace",
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
  useLocale();
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
        background: 'rgba(15, 10, 26, 0.95)',
        borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
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
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
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
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  color: isActive ? (isAva ? 'var(--accent)' : '#cdd6f4') : '#6c7086',
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
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = isActive ? (isAva ? 'var(--accent)' : '#cdd6f4') : '#6c7086'; }}
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
            onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
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
            onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
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
          background: 'rgba(10, 6, 18, 0.8)',
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
              <span style={{ color: 'var(--accent)' }}>ava</span>
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
