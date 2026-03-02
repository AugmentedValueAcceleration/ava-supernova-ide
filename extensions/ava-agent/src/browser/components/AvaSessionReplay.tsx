import * as React from '@theia/core/shared/react';
import type { ReplayState } from '../ava-agent-client';
import type { AvaReplayMessage } from '../../common/ava-agent-protocol';

// ── Props ────────────────────────────────────────────────────────────────────

export interface AvaSessionReplayProps {
  replay: ReplayState;
  onStepForward: () => void;
  onStepBackward: () => void;
  onJumpTo: (index: number) => void;
  onBack: () => void;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  headerTitle: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 600 as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  headerMeta: {
    fontSize: '11px',
    opacity: 0.5,
    whiteSpace: 'nowrap' as const,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderTop: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  btn: {
    padding: '4px 10px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    fontSize: '11px',
    cursor: 'pointer',
  },
  slider: {
    flex: 1,
    accentColor: 'var(--ava-accent, #A855F7)',
  },
  messageNode: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0 as const,
    marginTop: '5px',
  },
  messageBody: {
    flex: 1,
    minWidth: 0,
  },
  roleLabel: {
    fontSize: '10px',
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    marginBottom: '2px',
  },
  content: {
    fontSize: '13px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  thinking: {
    fontSize: '12px',
    opacity: 0.4,
    fontStyle: 'italic' as const,
    marginBottom: '4px',
    borderLeft: '2px solid var(--ava-accent, #A855F7)',
    paddingLeft: '8px',
  },
  toolCall: {
    fontSize: '11px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgba(168, 85, 247, 0.06)',
    marginTop: '4px',
  },
  toolName: {
    fontWeight: 600 as const,
    fontSize: '11px',
  },
  toolResult: {
    fontSize: '11px',
    opacity: 0.5,
    maxHeight: '60px',
    overflow: 'hidden' as const,
    whiteSpace: 'pre-wrap' as const,
    marginTop: '2px',
  },
  currentHighlight: {
    borderLeft: '2px solid var(--ava-accent, #A855F7)',
    paddingLeft: '8px',
    marginLeft: '-10px',
  },
};

// ── Role colors ──────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  user: 'var(--ava-accent, #A855F7)',
  assistant: '#22C55E',
  tool: '#6B7280',
  system: '#6B7280',
};

const ROLE_LABELS: Record<string, string> = {
  user: 'User',
  assistant: 'Ava',
  tool: 'Tool',
  system: 'System',
};

// ── Message node ─────────────────────────────────────────────────────────────

function ReplayMessageNode({ message, isCurrent }: { message: AvaReplayMessage; isCurrent: boolean }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div style={{
      ...s.messageNode,
      ...(isCurrent ? s.currentHighlight : {}),
    }}>
      <div style={{
        ...s.dot,
        background: ROLE_COLORS[message.role] || '#6B7280',
      }} />
      <div style={s.messageBody}>
        <div style={{
          ...s.roleLabel,
          color: ROLE_COLORS[message.role] || 'var(--theia-foreground)',
        }}>
          {ROLE_LABELS[message.role] || message.role}
        </div>

        {message.thinking && (
          <div style={s.thinking}>{message.thinking.slice(0, 200)}{message.thinking.length > 200 ? '...' : ''}</div>
        )}

        {message.content && (
          <div style={s.content}>{message.content}</div>
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div>
            {message.toolCalls.map((tc, i) => (
              <div key={i} style={s.toolCall}>
                <div style={s.toolName}>{tc.name}</div>
                {expanded && tc.result && (
                  <div style={s.toolResult}>{tc.result}</div>
                )}
              </div>
            ))}
            {message.toolCalls.some(tc => tc.result) && (
              <button
                style={{ ...s.btn, fontSize: '10px', padding: '2px 6px', marginTop: '4px' }}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Hide results' : 'Show results'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AvaSessionReplay(props: AvaSessionReplayProps) {
  const { replay, onStepForward, onStepBackward, onJumpTo, onBack } = props;
  const messagesRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll when stepping forward
  React.useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [replay.currentIndex]);

  // Keyboard navigation
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onStepForward();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onStepBackward();
      } else if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onStepForward, onStepBackward, onBack]);

  const visibleMessages = replay.messages.slice(0, replay.currentIndex + 1);

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerTitle} title={replay.title}>{replay.title}</div>
        <div style={s.headerMeta}>
          {replay.currentIndex + 1} / {replay.totalMessages}
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesRef} style={s.messages}>
        {visibleMessages.map((msg, i) => (
          <ReplayMessageNode
            key={msg.index}
            message={msg}
            isCurrent={i === visibleMessages.length - 1}
          />
        ))}
      </div>

      {/* Controls */}
      <div style={s.controls}>
        <button
          style={s.btn}
          onClick={onStepBackward}
          disabled={replay.currentIndex <= 0}
          title="Previous (Left Arrow)"
        >
          Prev
        </button>
        <input
          type="range"
          min={0}
          max={replay.totalMessages - 1}
          value={replay.currentIndex}
          onChange={e => onJumpTo(parseInt(e.target.value))}
          style={s.slider}
        />
        <button
          style={s.btn}
          onClick={onStepForward}
          disabled={replay.currentIndex >= replay.totalMessages - 1}
          title="Next (Right Arrow)"
        >
          Next
        </button>
        <button style={s.btn} onClick={onBack} title="Back to chat (Escape)">
          Done
        </button>
      </div>
    </div>
  );
}
