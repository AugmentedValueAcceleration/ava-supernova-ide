import * as React from '@theia/core/shared/react';
import type { AvaHistoryEntry } from '../../common/ava-agent-protocol';

// ── Props ────────────────────────────────────────────────────────────────────

export interface AvaHistoryBrowserProps {
  entries: AvaHistoryEntry[];
  searchQuery: string;
  isLoading: boolean;
  onSearch: (query: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onExport: (id: string, format: 'json' | 'markdown') => void;
  onReplay: (id: string) => void;
  onImport: () => void;
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
  toolbar: {
    display: 'flex',
    gap: '6px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  searchInput: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '5px',
    background: 'var(--theia-input-background)',
    color: 'var(--theia-input-foreground)',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '12px',
    outline: 'none',
  },
  importBtn: {
    padding: '6px 10px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '5px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    fontSize: '11px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 12px',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    opacity: 0.4,
    marginBottom: '6px',
    marginTop: '8px',
  },
  item: {
    padding: '8px 10px',
    borderRadius: '6px',
    marginBottom: '4px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  itemTitle: {
    fontSize: '13px',
    fontWeight: 500 as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  itemMeta: {
    fontSize: '10px',
    opacity: 0.4,
    marginTop: '2px',
    display: 'flex',
    gap: '8px',
  },
  itemActions: {
    display: 'flex',
    gap: '4px',
    marginTop: '4px',
  },
  actionBtn: {
    padding: '2px 6px',
    border: 'none',
    borderRadius: '3px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    fontSize: '10px',
    cursor: 'pointer',
    opacity: 0.5,
  },
  empty: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    opacity: 0.4,
    fontSize: '13px',
    lineHeight: 1.6,
  },
  loading: {
    textAlign: 'center' as const,
    padding: '40px',
    opacity: 0.4,
    fontSize: '12px',
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── History Item ─────────────────────────────────────────────────────────────

function HistoryItem({
  entry,
  onResume,
  onDelete,
  onRename,
  onPin,
  onExport,
  onReplay,
}: {
  entry: AvaHistoryEntry;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onExport: (id: string, format: 'json' | 'markdown') => void;
  onReplay: (id: string) => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(entry.title);
  const [confirming, setConfirming] = React.useState(false);
  const [showExport, setShowExport] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== entry.title) {
      onRename(entry.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      style={{
        ...s.item,
        background: hovered ? 'rgba(168, 85, 247, 0.06)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowExport(false); setConfirming(false); }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={handleRename}
          style={{ ...s.searchInput, fontSize: '13px', width: '100%' }}
        />
      ) : (
        <div style={s.itemTitle} onClick={() => onResume(entry.id)} title={entry.title}>
          {entry.pinned && '$(codicon-pin) '}
          {entry.title}
        </div>
      )}

      <div style={s.itemMeta}>
        <span>{relativeTime(entry.updatedAt)}</span>
        <span>{entry.messageCount} messages</span>
      </div>

      {hovered && !editing && (
        <div style={s.itemActions}>
          <button
            style={s.actionBtn}
            onClick={e => { e.stopPropagation(); onReplay(entry.id); }}
            title="Replay"
          >
            Replay
          </button>
          <button
            style={s.actionBtn}
            onClick={e => { e.stopPropagation(); setEditing(true); setEditValue(entry.title); }}
            title="Rename"
          >
            Rename
          </button>
          <button
            style={s.actionBtn}
            onClick={e => { e.stopPropagation(); onPin(entry.id, !entry.pinned); }}
            title={entry.pinned ? 'Unpin' : 'Pin'}
          >
            {entry.pinned ? 'Unpin' : 'Pin'}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              style={s.actionBtn}
              onClick={e => { e.stopPropagation(); setShowExport(!showExport); }}
              title="Export"
            >
              Export
            </button>
            {showExport && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                background: 'var(--theia-editorWidget-background)',
                border: '1px solid var(--theia-panel-border)',
                borderRadius: '4px',
                padding: '4px',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}>
                <button
                  style={{ ...s.actionBtn, opacity: 1, whiteSpace: 'nowrap' }}
                  onClick={e => { e.stopPropagation(); onExport(entry.id, 'json'); setShowExport(false); }}
                >
                  JSON
                </button>
                <button
                  style={{ ...s.actionBtn, opacity: 1, whiteSpace: 'nowrap' }}
                  onClick={e => { e.stopPropagation(); onExport(entry.id, 'markdown'); setShowExport(false); }}
                >
                  Markdown
                </button>
              </div>
            )}
          </div>
          <button
            style={{ ...s.actionBtn, color: confirming ? '#ef4444' : undefined }}
            onClick={e => {
              e.stopPropagation();
              if (confirming) {
                onDelete(entry.id);
                setConfirming(false);
              } else {
                setConfirming(true);
              }
            }}
            title="Delete"
          >
            {confirming ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AvaHistoryBrowser(props: AvaHistoryBrowserProps) {
  const { entries, searchQuery, isLoading, onSearch, onResume, onDelete, onRename, onPin, onExport, onReplay, onImport, onBack } = props;
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout>>();

  const handleSearchChange = (value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => onSearch(value), 300);
  };

  const pinned = entries.filter(e => e.pinned);
  const recent = entries.filter(e => !e.pinned);

  return (
    <div style={s.container}>
      <div style={s.toolbar}>
        <input
          style={s.searchInput}
          placeholder="Search sessions..."
          defaultValue={searchQuery}
          onChange={e => handleSearchChange(e.target.value)}
        />
        <button style={s.importBtn} onClick={onImport} title="Import a session from JSON file">
          Import
        </button>
      </div>

      <div style={s.list}>
        {isLoading && (
          <div style={s.loading}>Loading history...</div>
        )}

        {!isLoading && entries.length === 0 && (
          <div style={s.empty}>
            No conversations yet.<br />
            Start chatting with Ava to build your history.
          </div>
        )}

        {!isLoading && pinned.length > 0 && (
          <>
            <div style={s.sectionLabel}>Pinned</div>
            {pinned.map(entry => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                onResume={onResume}
                onDelete={onDelete}
                onRename={onRename}
                onPin={onPin}
                onExport={onExport}
                onReplay={onReplay}
              />
            ))}
          </>
        )}

        {!isLoading && recent.length > 0 && (
          <>
            <div style={s.sectionLabel}>Recent</div>
            {recent.map(entry => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                onResume={onResume}
                onDelete={onDelete}
                onRename={onRename}
                onPin={onPin}
                onExport={onExport}
                onReplay={onReplay}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
