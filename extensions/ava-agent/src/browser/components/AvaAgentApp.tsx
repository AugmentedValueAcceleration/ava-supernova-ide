import * as React from '@theia/core/shared/react';
import type { ChatState, UIMessage, ToolCallDisplay } from '../ava-agent-client';
import type { AvaAttachment, AvaMode, AvaModelInfo } from '../../common/ava-agent-protocol';
import { AvaHistoryBrowser } from './AvaHistoryBrowser';
import { AvaMemoryBrowser } from './AvaMemoryBrowser';
import { AvaSessionReplay } from './AvaSessionReplay';
import { AvaDocsBrowser } from './AvaDocsBrowser';
import { MarkdownContent } from './MarkdownContent';

// ── Suggestion chips + mode hints ────────────────────────────────────────────

const SUGGESTIONS = [
  { label: 'Explain this code', prompt: 'Explain what this code does in detail.' },
  { label: 'Find a bug', prompt: 'Review this code and identify any bugs or issues.' },
  { label: 'Write tests', prompt: 'Write comprehensive tests for this code.' },
  { label: 'Refactor code', prompt: 'Suggest refactoring improvements for this code.' },
];

const MODE_HINTS = [
  { prefix: '>>', name: 'Code', desc: 'Write and edit code' },
  { prefix: '::', name: 'Plan', desc: 'Analyze and plan changes' },
  { prefix: '..', name: 'Chat', desc: 'General conversation' },
  { prefix: '!!', name: 'Security', desc: 'Security analysis' },
];

// ── Props ───────────────────────────────────────────────────────────────────

export interface ContextSummary {
  activeFile: string | null;
  activeLanguage: string | null;
  openTabCount: number;
  pinnedCount: number;
  pinnedPaths: string[];
}

export interface AvaAgentAppProps {
  state: ChatState;
  contextSummary?: ContextSummary;
  onSend: (text: string, mode: AvaMode, attachments?: AvaAttachment[]) => void;
  onCancel: () => void;
  onNewChat: () => void;
  onSwitchModel: (modelId: string) => void;
  onConfirmTool: (
    confirmationId: string,
    approved: boolean,
    options?: { alwaysAllow?: boolean; allowAll?: boolean; userResponse?: string },
  ) => void;
  // Open dashboard for setup
  onOpenDashboard?: () => void;
  // Context compression
  onCompress?: () => void;
  // Phase 5 — Session management
  onShowHistory?: () => void;
  onSearchHistory?: (query: string) => void;
  onResumeConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onRenameConversation?: (id: string, newTitle: string) => void;
  onPinConversation?: (id: string, pinned: boolean) => void;
  onExportConversation?: (id: string, format: 'json' | 'markdown') => void;
  onImportSession?: () => void;
  onStartReplay?: (id: string) => void;
  onReplayStep?: (direction: 'forward' | 'backward') => void;
  onReplayJump?: (index: number) => void;
  onBackToChat?: () => void;
  // Memory management
  onShowMemory?: () => void;
  onSaveMemory?: (scope: 'global' | 'project', content: string) => void;
  onClearMemory?: (scope: 'global' | 'project') => void;
  // Documentation
  onShowDocs?: () => void;
}

// ── Styles (Theia CSS variables) ────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    fontFamily: 'var(--theia-ui-font-family)',
    color: 'var(--theia-foreground)',
    fontSize: '13px',
    background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(168, 85, 247, 0.06) 0%, transparent 70%), var(--theia-editor-background, #0d0d14)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(168, 85, 247, 0.1)',
    flexShrink: 0 as const,
    background: 'var(--theia-sideBar-background, #0a0a10)',
  },
  headerTitle: {
    fontSize: '15px',
    fontWeight: 700 as const,
  },
  headerSub: {
    fontSize: '9px',
    fontWeight: 600 as const,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    opacity: 0.5,
  },
  headerActions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: '4px',
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    minHeight: 0,
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
    textAlign: 'center' as const,
    lineHeight: 1.6,
    padding: '24px',
  },
  inputArea: {
    flexShrink: 0 as const,
    padding: '8px 12px',
    borderTop: '1px solid rgba(168, 85, 247, 0.1)',
    display: 'flex',
    gap: '6px',
    alignItems: 'flex-end',
    background: 'var(--theia-sideBar-background, #0a0a10)',
  },
  textarea: {
    flex: 1,
    padding: '8px 10px',
    border: '1px solid rgba(168, 85, 247, 0.15)',
    borderRadius: '6px',
    background: 'var(--theia-input-background, #141020)',
    color: 'var(--theia-input-foreground)',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '13px',
    resize: 'none' as const,
    outline: 'none',
    minHeight: '36px',
    maxHeight: '120px',
  },
  button: {
    padding: '6px 12px',
    border: '1px solid var(--theia-button-border, transparent)',
    borderRadius: '4px',
    background: 'var(--ava-accent, #A855F7)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  buttonSecondary: {
    padding: '4px 8px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    fontSize: '11px',
    cursor: 'pointer',
  },
  modeBar: {
    display: 'flex',
    gap: '2px',
    padding: '4px 12px',
    borderTop: '1px solid rgba(168, 85, 247, 0.08)',
    flexShrink: 0 as const,
    background: 'var(--theia-sideBar-background, #0a0a10)',
  },
  modeButton: (active: boolean) => ({
    padding: '3px 8px',
    border: 'none',
    borderRadius: '3px',
    background: active ? 'var(--ava-accent, #A855F7)' : 'transparent',
    color: active ? '#fff' : 'var(--theia-foreground)',
    fontSize: '11px',
    cursor: 'pointer',
    opacity: active ? 1 : 0.7,
  }),
  // Welcome view (empty state)
  welcomeOuter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    gap: '20px',
    textAlign: 'center' as const,
  },
  welcomeTitle: {
    fontSize: '15px',
    fontWeight: 600 as const,
    opacity: 0.55,
  },
  welcomeSub: {
    fontSize: '11px',
    opacity: 0.3,
    marginTop: '2px',
  },
  chipsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
    gap: '6px',
  },
  chip: {
    padding: '5px 12px',
    borderRadius: '16px',
    fontSize: '11px',
    border: '1px solid var(--theia-input-border)',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    cursor: 'pointer',
    opacity: 0.55,
  },
  modesBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
    fontSize: '11px',
    opacity: 0.3,
  },
  modeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'center',
  },
  modePrefix: {
    fontFamily: 'monospace',
    fontWeight: 700 as const,
    fontSize: '12px',
    color: 'var(--ava-accent, #A855F7)',
    opacity: 0.8,
    width: '20px',
    textAlign: 'right' as const,
  },
  modelBadge: {
    fontSize: '10px',
    opacity: 0.25,
  },
  contextBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 12px',
    fontSize: '11px',
    opacity: 0.5,
    borderTop: '1px solid rgba(168, 85, 247, 0.08)',
    flexShrink: 0 as const,
  },
  contextFile: {
    fontWeight: 500 as const,
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  contextPinned: {
    color: 'var(--ava-accent, #A855F7)',
  },
};

// ── Message components ──────────────────────────────────────────────────────

function UserMessage({ msg }: { msg: UIMessage }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--theia-input-background, #141020)', alignSelf: 'flex-end', maxWidth: '85%' }}>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
      {msg.images && msg.images.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
          {msg.images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Attachment ${i + 1}`}
              style={{
                maxWidth: '200px', maxHeight: '150px',
                borderRadius: '6px', objectFit: 'contain',
                border: '1px solid var(--theia-input-border)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div style={{
      fontSize: '11px', opacity: 0.5, fontStyle: 'italic', marginBottom: '4px',
      borderLeft: '2px solid var(--ava-accent, #A855F7)', paddingLeft: '8px',
    }}>
      <div
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontSize: '8px', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>&#9654;</span>
        <span>Thinking{!expanded && text.length > 80 ? ` (${text.length} chars)` : ''}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.9 }}>
          {text}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ msg, onConfirmTool }: { msg: UIMessage; onConfirmTool: AvaAgentAppProps['onConfirmTool'] }) {
  return (
    <div style={{ maxWidth: '95%' }}>
      {msg.thinking && (
        <ThinkingBlock text={msg.thinking} />
      )}
      {msg.content && (
        <MarkdownContent content={msg.content} />
      )}
      {msg.toolCalls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          {msg.toolCalls.map(tc => (
            <ToolCallCard key={tc.id} tc={tc} onConfirmTool={onConfirmTool} />
          ))}
        </div>
      )}
      {msg.isStreaming && !msg.content && msg.toolCalls.length === 0 && (
        <div style={{ opacity: 0.5 }}>Thinking...</div>
      )}
      {msg.isStreaming && msg.content && msg.toolCalls.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', opacity: 0.4, fontSize: '11px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A855F7', display: 'inline-block', animation: 'ava-pulse 1.5s infinite' }} />
          Working...
        </div>
      )}
      {!msg.isStreaming && msg.cost != null && msg.cost > 0 && (
        <div style={{ fontSize: '10px', opacity: 0.35, marginTop: '4px' }}>
          ${msg.cost.toFixed(4)}
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ tc, onConfirmTool }: { tc: ToolCallDisplay; onConfirmTool: AvaAgentAppProps['onConfirmTool'] }) {
  const [expanded, setExpanded] = React.useState(tc.name === 'present_plan');
  const [userResponse, setUserResponse] = React.useState('');

  const statusColors: Record<string, string> = {
    running: '#f59e0b',
    success: '#22c55e',
    failed: '#ef4444',
    pending_confirmation: '#A855F7',
  };

  return (
    <div style={{
      border: '1px solid rgba(168, 85, 247, 0.15)',
      borderRadius: '6px',
      padding: '8px 10px',
      fontSize: '12px',
      background: 'rgba(168, 85, 247, 0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: statusColors[tc.status] || '#888',
          display: 'inline-block',
          ...(tc.status === 'running' ? { animation: 'ava-pulse 1.5s infinite' } : {}),
        }} />
        <span style={{ fontWeight: 600 }}>{tc.name}</span>
        <span style={{ opacity: 0.5, fontSize: '11px' }}>{tc.summary || ''}</span>
        {tc.result && (
          <button
            style={{ ...styles.buttonSecondary, marginLeft: 'auto', fontSize: '10px', padding: '2px 6px' }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        )}
      </div>

      {tc.status === 'pending_confirmation' && !tc.isAskUser && tc.confirmationId && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button style={styles.button} onClick={() => onConfirmTool(tc.confirmationId!, true)}>
            Approve
          </button>
          <button style={styles.buttonSecondary} onClick={() => onConfirmTool(tc.confirmationId!, false)}>
            Deny
          </button>
          <button
            style={{ ...styles.buttonSecondary, fontSize: '10px' }}
            onClick={() => onConfirmTool(tc.confirmationId!, true, { alwaysAllow: true })}
          >
            Always Allow
          </button>
        </div>
      )}

      {tc.status === 'pending_confirmation' && tc.isAskUser && tc.confirmationId && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ marginBottom: '6px', opacity: 0.8 }}>{tc.summary}</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              value={userResponse}
              onChange={e => setUserResponse(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && userResponse.trim()) {
                  onConfirmTool(tc.confirmationId!, true, { userResponse: userResponse.trim() });
                }
              }}
              placeholder="Type your response..."
              style={{
                flex: 1, padding: '6px 8px',
                border: '1px solid var(--theia-input-border)',
                borderRadius: '4px',
                background: 'var(--theia-input-background)',
                color: 'var(--theia-input-foreground)',
                fontSize: '12px', outline: 'none',
              }}
            />
            <button
              style={styles.button}
              onClick={() => {
                if (userResponse.trim()) {
                  onConfirmTool(tc.confirmationId!, true, { userResponse: userResponse.trim() });
                }
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {expanded && tc.result && (
        <pre style={{
          marginTop: '6px', padding: '6px 8px',
          background: 'var(--theia-editor-background, #0d0d14)',
          borderRadius: '4px',
          fontSize: '11px', overflow: 'auto',
          maxHeight: '200px', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {tc.result.length > 2000 ? tc.result.slice(0, 2000) + '\n... (truncated)' : tc.result}
        </pre>
      )}
    </div>
  );
}

function ErrorMessage({ msg }: { msg: UIMessage }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: '6px',
      background: 'rgba(239, 68, 68, 0.1)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#ef4444',
    }}>
      <div>{msg.content}</div>
      {msg.errorSuggestion && (
        <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>{msg.errorSuggestion}</div>
      )}
    </div>
  );
}

function SystemMessage({ msg }: { msg: UIMessage }) {
  return (
    <div style={{ textAlign: 'center', fontSize: '11px', opacity: 0.5, padding: '4px 0' }}>
      {msg.content}
    </div>
  );
}

// ── Welcome view (empty state) ──────────────────────────────────────────────

function WelcomeView({ state, onSend }: {
  state: ChatState;
  onSend: (text: string, mode: AvaMode, attachments?: AvaAttachment[]) => void;
}) {
  const activeModelName = state.models.find(m => m.id === state.activeModel)?.name;

  return (
    <div style={styles.welcomeOuter}>
      <div>
        <div style={styles.welcomeTitle}>Ask Ava anything about your codebase</div>
        <div style={styles.welcomeSub}>AI-powered coding assistant</div>
      </div>

      <div style={styles.chipsRow}>
        {SUGGESTIONS.map(s => (
          <button
            key={s.label}
            style={styles.chip}
            onClick={() => onSend(s.prompt, 'code')}
            onMouseEnter={e => {
              const el = e.currentTarget;
              el.style.opacity = '0.9';
              el.style.borderColor = 'var(--ava-accent, #A855F7)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget;
              el.style.opacity = '0.55';
              el.style.borderColor = 'var(--theia-input-border)';
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={styles.modesBlock}>
        {MODE_HINTS.map(m => (
          <div key={m.name} style={styles.modeRow}>
            <span style={styles.modePrefix}>{m.prefix}</span>
            <span style={{ fontWeight: 600 }}>{m.name}</span>
            <span>{m.desc}</span>
          </div>
        ))}
      </div>

      {activeModelName && (
        <div style={styles.modelBadge}>Using {activeModelName}</div>
      )}
    </div>
  );
}

// ── Model selector ──────────────────────────────────────────────────────────

function ModelSelector({ models, activeModel, onSwitch }: {
  models: AvaModelInfo[];
  activeModel: string | null;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (models.length === 0) return null;

  const activeModelName = models.find(m => m.id === activeModel)?.name ?? 'Select model';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          border: '1px solid var(--theia-input-border)',
          borderRadius: '4px',
          background: 'var(--theia-input-background)',
          color: 'var(--theia-input-foreground)',
          fontSize: '11px',
          cursor: 'pointer',
          outline: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0 }} />
        {activeModelName}
        <span style={{ fontSize: '8px', opacity: 0.5, marginLeft: '2px' }}>&#9662;</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          minWidth: '180px',
          background: 'var(--theia-input-background)',
          border: '1px solid var(--theia-input-border)',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 10px', fontSize: '10px', opacity: 0.4, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Models
          </div>
          {models.map(m => (
            <button
              key={m.id}
              onClick={() => { onSwitch(m.id); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 10px',
                border: 'none',
                background: m.id === activeModel ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                color: 'var(--theia-input-foreground)',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                if (m.id !== activeModel) e.currentTarget.style.background = 'rgba(168, 85, 247, 0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = m.id === activeModel ? 'rgba(168, 85, 247, 0.15)' : 'transparent';
              }}
            >
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
                background: m.id === activeModel ? '#A855F7' : 'rgba(255,255,255,0.15)',
              }} />
              <span style={{ fontWeight: m.id === activeModel ? 600 : 400 }}>{m.name}</span>
              <span style={{ fontSize: '10px', opacity: 0.35, marginLeft: 'auto' }}>{m.provider}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Context usage bar ────────────────────────────────────────────────────────

function ContextUsageBar({ contextUsage, isCompressing, onCompress, disabled }: {
  contextUsage: { used: number; limit: number; percent: number };
  isCompressing: boolean;
  onCompress?: () => void;
  disabled?: boolean;
}) {
  const { percent } = contextUsage;

  const barColor =
    percent >= 80 ? '#ef4444'
    : percent >= 60 ? '#f59e0b'
    : '#22c55e';

  const labelColor =
    percent >= 80 ? '#ef4444'
    : percent >= 60 ? '#f59e0b'
    : 'var(--theia-foreground)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 12px',
        borderTop: '1px solid rgba(168, 85, 247, 0.08)',
        flexShrink: 0,
        cursor: isCompressing || disabled ? 'default' : 'pointer',
        opacity: isCompressing || disabled ? 0.6 : 1,
      }}
      onClick={() => {
        if (!isCompressing && !disabled && onCompress) onCompress();
      }}
      title={isCompressing ? 'Compressing...' : 'Click to compress context'}
    >
      <div style={{
        flex: 1,
        height: '4px',
        borderRadius: '2px',
        background: 'var(--theia-input-background, #141020)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          borderRadius: '2px',
          background: barColor,
          width: `${Math.min(percent, 100)}%`,
          transition: 'width 0.3s, background 0.3s',
        }} />
      </div>
      <span style={{
        fontSize: '10px',
        fontWeight: 500,
        color: labelColor,
        opacity: percent >= 60 ? 1 : 0.5,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {isCompressing ? 'Compressing...' : `Context ${percent}%`}
        {!isCompressing && percent >= 80 ? ' \u26A0' : ''}
      </span>
    </div>
  );
}

// ── Main app ────────────────────────────────────────────────────────────────

export function AvaAgentApp(props: AvaAgentAppProps) {
  const { state, onSend, onCancel, onNewChat, onSwitchModel, onConfirmTool,
    onOpenDashboard, onShowHistory, onSearchHistory, onResumeConversation, onDeleteConversation,
    onRenameConversation, onPinConversation, onExportConversation, onImportSession,
    onStartReplay, onReplayStep, onReplayJump, onBackToChat,
    onShowMemory, onSaveMemory, onClearMemory, onShowDocs } = props;
  const [input, setInput] = React.useState('');
  const [mode, setMode] = React.useState<AvaMode>('code');
  const [attachments, setAttachments] = React.useState<AvaAttachment[]>([]);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const messagesRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10 MB
  const MAX_ATTACHMENTS = 5;

  // Auto-scroll to bottom on new messages
  const justLoadedRef = React.useRef(false);
  React.useEffect(() => {
    if (state.justLoaded) justLoadedRef.current = true;
  }, [state.justLoaded]);

  React.useEffect(() => {
    const el = messagesRef.current;
    if (!el || state.messages.length === 0) return;
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      // Restored conversation: poll until scroll actually works.
      // On initial app load the Theia widget may not be laid out yet,
      // so fixed delays are unreliable. Retry every 50ms up to 2s.
      let attempts = 0;
      const maxAttempts = 40; // 40 × 50ms = 2s
      const poll = () => {
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        attempts++;
        // Stop once we've scrolled near the bottom, or hit max attempts
        if (attempts < maxAttempts && el.scrollTop < el.scrollHeight - el.clientHeight - 5) {
          setTimeout(poll, 50);
        }
      };
      requestAnimationFrame(poll);
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [state.messages, state.isStreaming]);

  const addImageFile = React.useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_IMAGE_SIZE) return;

    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const name = file.name || `pasted-${Date.now()}.png`;
      setAttachments(prev => {
        if (prev.length >= MAX_ATTACHMENTS) return prev;
        return [...prev, { type: 'image', data, name }];
      });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSend = React.useCallback(() => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (state.isStreaming) return;
    setInput('');
    setAttachments([]);
    onSend(text || '(image)', mode, attachments.length > 0 ? attachments : undefined);
  }, [input, mode, state.isStreaming, onSend, attachments]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handlePaste = React.useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) addImageFile(file);
        return;
      }
    }
  }, [addImageFile]);

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = React.useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files) {
      Array.from(files).forEach(addImageFile);
    }
  }, [addImageFile]);

  const handleFileChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(addImageFile);
    }
    e.target.value = '';
  }, [addImageFile]);

  // Loading — backend hasn't responded yet
  if (!state.initialized) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>Ava</span>
          <span style={styles.headerSub}>Supernova</span>
        </div>
        <div style={{ ...styles.emptyState, opacity: 0.5 }}>
          Loading...
        </div>
      </div>
    );
  }

  // Setup prompt — no API keys or account configured
  if (state.needsSetup) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>Ava</span>
          <span style={styles.headerSub}>Supernova</span>
        </div>
        <div style={styles.emptyState}>
          <div style={{ opacity: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', opacity: 0.9 }}>
              Welcome to Ava
            </div>
            <div style={{ fontSize: '13px', opacity: 0.6, marginBottom: '20px', lineHeight: 1.6 }}>
              Connect a model provider to start coding with AI.
            </div>
            <button
              style={{
                ...styles.button,
                padding: '8px 20px',
                fontSize: '13px',
              }}
              onClick={() => onOpenDashboard?.()}
            >
              Open Dashboard
            </button>
            <div style={{ fontSize: '11px', opacity: 0.4, marginTop: '12px' }}>
              Or press <kbd style={{
                background: 'var(--theia-input-background)',
                padding: '1px 5px',
                borderRadius: '3px',
                border: '1px solid var(--theia-input-border)',
                fontSize: '10px',
              }}>Ctrl+Shift+D</kbd>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Ava</span>
        <span style={styles.headerSub}>Supernova</span>
        <div style={styles.headerActions}>
          <ModelSelector models={state.models} activeModel={state.activeModel} onSwitch={onSwitchModel} />
          {onShowHistory && (
            <button
              style={styles.buttonSecondary}
              onClick={state.view === 'history' ? onBackToChat : onShowHistory}
              title="Session history (Ctrl+Shift+H)"
            >
              {state.view === 'history' ? 'Back' : 'History'}
            </button>
          )}
          {onShowMemory && (
            <button
              style={styles.buttonSecondary}
              onClick={state.view === 'memory' ? onBackToChat : onShowMemory}
              title="View and edit persistent memory"
            >
              {state.view === 'memory' ? 'Back' : 'Memory'}
            </button>
          )}
          {onShowDocs && (
            <button
              style={styles.buttonSecondary}
              onClick={state.view === 'docs' ? onBackToChat : onShowDocs}
              title="Documentation"
            >
              {state.view === 'docs' ? 'Back' : 'Docs'}
            </button>
          )}
          <button style={styles.buttonSecondary} onClick={onNewChat} title="New chat">
            New
          </button>
        </div>
      </div>

      {/* History view */}
      {state.view === 'history' && onSearchHistory && onResumeConversation && onDeleteConversation && onRenameConversation && onPinConversation && onExportConversation && onStartReplay && onImportSession && onBackToChat && (
        <AvaHistoryBrowser
          entries={state.history.entries}
          searchQuery={state.history.searchQuery}
          isLoading={state.history.isLoading}
          onSearch={onSearchHistory}
          onResume={onResumeConversation}
          onDelete={onDeleteConversation}
          onRename={onRenameConversation}
          onPin={onPinConversation}
          onExport={onExportConversation}
          onReplay={onStartReplay}
          onImport={onImportSession}
          onBack={onBackToChat}
        />
      )}

      {/* Replay view */}
      {state.view === 'replay' && state.replay && onReplayStep && onReplayJump && onBackToChat && (
        <AvaSessionReplay
          replay={state.replay}
          onStepForward={() => onReplayStep('forward')}
          onStepBackward={() => onReplayStep('backward')}
          onJumpTo={onReplayJump}
          onBack={onBackToChat}
        />
      )}

      {/* Memory view */}
      {state.view === 'memory' && onSaveMemory && onClearMemory && onBackToChat && (
        <AvaMemoryBrowser
          globalMemory={state.memory.global}
          projectMemory={state.memory.project}
          onSave={onSaveMemory}
          onClear={onClearMemory}
          onBack={onBackToChat}
        />
      )}

      {/* Docs view */}
      {state.view === 'docs' && onBackToChat && (
        <AvaDocsBrowser onBack={onBackToChat} />
      )}

      {/* Chat view */}
      {state.view === 'chat' && (
        <>
          {/* Messages */}
          <div ref={messagesRef} style={styles.messages}>
            {state.messages.length === 0 ? (
              <WelcomeView state={state} onSend={onSend} />
            ) : (
              state.messages.map(msg => {
                switch (msg.role) {
                  case 'user':
                    return <UserMessage key={msg.id} msg={msg} />;
                  case 'assistant':
                    return <AssistantMessage key={msg.id} msg={msg} onConfirmTool={onConfirmTool} />;
                  case 'error':
                    return <ErrorMessage key={msg.id} msg={msg} />;
                  case 'system':
                    return <SystemMessage key={msg.id} msg={msg} />;
                  default:
                    return null;
                }
              })
            )}
            {state.isThinking && (
              <div style={{ opacity: 0.5, fontSize: '12px' }}>Thinking...</div>
            )}
          </div>

          {/* Context usage bar */}
          {state.contextUsage && state.contextUsage.percent > 0 && (
            <ContextUsageBar
              contextUsage={state.contextUsage}
              isCompressing={state.isCompressing}
              onCompress={props.onCompress}
              disabled={state.isStreaming}
            />
          )}

          {/* Context indicator */}
          {props.contextSummary && (
            <div style={styles.contextBar}>
              <span style={styles.contextFile}>
                {props.contextSummary.activeFile || 'No file open'}
              </span>
              {props.contextSummary.openTabCount > 0 && (
                <span>{props.contextSummary.openTabCount} tabs</span>
              )}
              {props.contextSummary.pinnedCount > 0 && (
                <span style={styles.contextPinned}>
                  {props.contextSummary.pinnedCount} pinned
                </span>
              )}
            </div>
          )}

          {/* Mode bar */}
          <div style={styles.modeBar}>
            {(['code', 'plan', 'chat', 'security'] as AvaMode[]).map(m => (
              <button key={m} style={styles.modeButton(mode === m)} onClick={() => setMode(m)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
            {state.sessionUsage.totalCost > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.4, alignSelf: 'center' }} title={`${state.sessionUsage.requestCount} requests, ${state.sessionUsage.totalTokens.toLocaleString()} tokens`}>
                Session: ${state.sessionUsage.totalCost.toFixed(4)}
              </span>
            )}
          </div>

          {/* Input area */}
      <div style={{ ...styles.inputArea, flexDirection: 'column', gap: '4px' }}>
        {/* Thumbnail strip */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', padding: '2px 0', flexWrap: 'wrap' }}>
            {attachments.map((att, i) => (
              <div key={i} style={{ position: 'relative', width: '48px', height: '48px' }}>
                <img
                  src={att.data}
                  alt={att.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }}
                />
                <button
                  onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                  style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#ef4444',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    fontSize: '10px', lineHeight: '16px', padding: 0,
                  }}
                >x</button>
              </div>
            ))}
          </div>
        )}
        {/* Text input + buttons row */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', width: '100%' }}>
          <textarea
            style={{ ...styles.textarea, ...(isDragOver ? { borderColor: 'var(--theia-focusBorder, #A855F7)' } : {}) }}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            placeholder={isDragOver ? 'Drop image here...' : 'Ask Ava something... (Ctrl+V to paste image)'}
            rows={1}
            disabled={state.isStreaming}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            style={{
              padding: '6px 8px',
              border: '1px solid var(--theia-input-border)',
              borderRadius: '4px',
              background: 'transparent',
              color: 'var(--theia-foreground)',
              fontSize: '14px',
              cursor: 'pointer',
              opacity: state.isStreaming || attachments.length >= MAX_ATTACHMENTS ? 0.3 : 0.6,
            }}
            onClick={() => fileInputRef.current?.click()}
            disabled={state.isStreaming || attachments.length >= MAX_ATTACHMENTS}
            title="Attach image"
          >
            &#128206;
          </button>
          {state.isStreaming ? (
            <button style={{ ...styles.button, background: '#ef4444' }} onClick={onCancel}>
              Stop
            </button>
          ) : (
            <button style={styles.button} onClick={handleSend} disabled={!input.trim() && attachments.length === 0}>
              Send
            </button>
          )}
        </div>
      </div>
        </>
      )}

      {/* Pulse animation for running tool indicators */}
      <style>{`
        @keyframes ava-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
