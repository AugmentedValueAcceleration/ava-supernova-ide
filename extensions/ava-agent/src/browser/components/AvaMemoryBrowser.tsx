import * as React from '@theia/core/shared/react';
import type { AvaMemoryEntryUI } from '../../common/ava-agent-protocol';

export interface AvaMemoryBrowserProps {
  globalEntries: AvaMemoryEntryUI[];
  projectEntries: AvaMemoryEntryUI[];
  onSave: (scope: 'global' | 'project', content: string) => void;
  onClear: (scope: 'global' | 'project') => void;
  onArchive: (scope: 'global' | 'project', id: string) => void;
  onRestore: (scope: 'global' | 'project', id: string) => void;
  onDelete: (scope: 'global' | 'project', id: string) => void;
  onBack: () => void;
}

type ScopeTab = 'global' | 'project';
type ViewMode = 'active' | 'archived';

const CATEGORY_COLORS: Record<string, string> = {
  pattern: '#3b82f6',
  preference: '#8b5cf6',
  architecture: '#06b6d4',
  'bug-fix': '#ef4444',
  convention: '#f59e0b',
  'tool-config': '#10b981',
  decision: '#f97316',
  person: '#ec4899',
  general: '#6b7280',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  backBtn: {
    padding: '5px 10px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '5px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '12px',
  },
  title: {
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--theia-foreground)',
    flex: 1,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: '8px 12px',
    border: 'none',
    borderBottom: active ? '2px solid var(--theia-focusBorder)' : '2px solid transparent',
    background: active ? 'var(--theia-editor-background)' : 'transparent',
    color: 'var(--theia-foreground)',
    opacity: active ? 1 : 0.6,
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '12px',
    textAlign: 'center' as const,
  }),
  viewToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    borderBottom: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  viewBtn: (active: boolean) => ({
    padding: '3px 8px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    fontFamily: 'var(--theia-ui-font-family)',
    background: active ? 'var(--theia-button-background)' : 'transparent',
    color: active ? 'var(--theia-button-foreground)' : 'var(--theia-foreground)',
    opacity: active ? 1 : 0.5,
  }),
  addBtn: {
    padding: '3px 8px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    fontFamily: 'var(--theia-ui-font-family)',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    opacity: 0.5,
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '120px',
    opacity: 0.5,
    fontSize: '12px',
  },
  entryCard: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--theia-panel-border)',
  },
  entryTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
  },
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '0 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 500 as const,
    fontFamily: 'var(--theia-ui-font-family)',
    backgroundColor: color + '22',
    color: color,
  }),
  entryContent: {
    fontSize: '12px',
    lineHeight: '1.5',
    opacity: 0.9,
    cursor: 'pointer',
  },
  entryPre: {
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'var(--theia-editor-font-family, monospace)',
    fontSize: '12px',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '6px',
  },
  statText: {
    fontSize: '10px',
    opacity: 0.3,
  },
  timeText: {
    fontSize: '10px',
    opacity: 0.4,
  },
  actionBtn: (danger: boolean) => ({
    padding: '2px 6px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    fontFamily: 'var(--theia-ui-font-family)',
    background: danger ? 'var(--theia-errorForeground, #e53935)' : 'transparent',
    color: danger ? '#fff' : 'var(--theia-foreground)',
    opacity: danger ? 1 : 0.4,
  }),
  spacer: { flex: 1 },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderTop: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  btn: {
    padding: '5px 12px',
    border: 'none',
    borderRadius: '4px',
    background: 'var(--theia-button-background)',
    color: 'var(--theia-button-foreground)',
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '12px',
  },
  btnSecondary: {
    padding: '5px 12px',
    border: '1px solid var(--theia-panel-border)',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '12px',
  },
  btnDanger: {
    padding: '5px 12px',
    border: 'none',
    borderRadius: '4px',
    background: 'var(--theia-errorForeground, #e53935)',
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '12px',
  },
  textarea: {
    width: '100%',
    minHeight: '80px',
    padding: '8px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '4px',
    background: 'var(--theia-input-background)',
    color: 'var(--theia-input-foreground)',
    fontFamily: 'var(--theia-editor-font-family, monospace)',
    fontSize: '12px',
    lineHeight: '1.5',
    resize: 'none' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  pathHint: {
    fontSize: '10px',
    opacity: 0.4,
  },
};

// ── Main Component ────────────────────────────────────────────────────────────

export const AvaMemoryBrowser: React.FC<AvaMemoryBrowserProps> = ({
  globalEntries,
  projectEntries,
  onSave,
  onClear,
  onArchive,
  onRestore,
  onDelete,
  onBack,
}) => {
  const [scopeTab, setScopeTab] = React.useState<ScopeTab>('global');
  const [viewMode, setViewMode] = React.useState<ViewMode>('active');
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newContent, setNewContent] = React.useState('');

  const entries = scopeTab === 'global' ? globalEntries : projectEntries;
  const activeEntries = React.useMemo(() => entries.filter(e => !e.archived), [entries]);
  const archivedEntries = React.useMemo(() => entries.filter(e => e.archived), [entries]);
  const displayEntries = viewMode === 'active' ? activeEntries : archivedEntries;

  const handleScopeSwitch = (tab: ScopeTab) => {
    setScopeTab(tab);
    setViewMode('active');
    setConfirmDelete(null);
    setConfirmClear(false);
    setAdding(false);
  };

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      onDelete(scopeTab, id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const handleClear = () => {
    if (confirmClear) {
      onClear(scopeTab);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const handleAdd = () => {
    if (newContent.trim()) {
      onSave(scopeTab, newContent.trim());
      setNewContent('');
      setAdding(false);
    }
  };

  return (
    <div style={s.container}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <button style={s.backBtn} onClick={onBack}>Back</button>
        <span style={s.title}>Memory v2</span>
      </div>

      {/* Scope Tabs */}
      <div style={s.tabs}>
        {(['global', 'project'] as const).map(tab => (
          <button key={tab} style={s.tab(scopeTab === tab)} onClick={() => handleScopeSwitch(tab)}>
            {tab === 'global' ? 'Global' : 'Project'}
            <span style={{ marginLeft: '4px', opacity: 0.5 }}>
              ({(tab === 'global' ? globalEntries : projectEntries).filter(e => !e.archived).length})
            </span>
          </button>
        ))}
      </div>

      {/* View Mode Toggle */}
      <div style={s.viewToggle}>
        {(['active', 'archived'] as const).map(mode => (
          <button key={mode} style={s.viewBtn(viewMode === mode)} onClick={() => setViewMode(mode)}>
            {mode === 'active' ? `Active (${activeEntries.length})` : `Archived (${archivedEntries.length})`}
          </button>
        ))}
        <div style={s.spacer} />
        {viewMode === 'active' && (
          <button style={s.addBtn} onClick={() => setAdding(true)} title="Add memory">+ Add</button>
        )}
      </div>

      {/* Content */}
      <div style={s.content}>
        {/* Add new entry form */}
        {adding && (
          <div style={{ padding: '12px', borderBottom: '1px solid var(--theia-panel-border)' }}>
            <textarea
              autoFocus
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Enter memory content..."
              style={s.textarea}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button style={s.btn} onClick={handleAdd}>Save</button>
              <button style={s.btnSecondary} onClick={() => { setAdding(false); setNewContent(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {displayEntries.length === 0 ? (
          <div style={s.emptyState}>
            {viewMode === 'archived'
              ? 'No archived memories.'
              : scopeTab === 'global'
                ? 'No global memories yet. Ava saves memories as you work together.'
                : 'No project memories yet. Ava saves project-specific patterns here.'}
          </div>
        ) : (
          displayEntries.map(entry => (
            <MemoryEntryCard
              key={entry.id}
              entry={entry}
              isArchived={viewMode === 'archived'}
              isConfirmDelete={confirmDelete === entry.id}
              onArchive={() => onArchive(scopeTab, entry.id)}
              onRestore={() => onRestore(scopeTab, entry.id)}
              onDelete={() => handleDelete(entry.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={s.footer}>
        {activeEntries.length > 0 && viewMode === 'active' && (
          <button
            style={confirmClear ? s.btnDanger : { ...s.btnSecondary, opacity: 0.6 }}
            onClick={handleClear}
          >
            {confirmClear ? 'Confirm Clear All' : 'Clear All'}
          </button>
        )}
        <div style={s.spacer} />
        <span style={s.pathHint}>
          {scopeTab === 'global' ? '~/.ava/memory.json' : '.ava/memory.json'}
        </span>
      </div>
    </div>
  );
};

// ── Entry Card ────────────────────────────────────────────────────────────────

function MemoryEntryCard({
  entry,
  isArchived,
  isConfirmDelete,
  onArchive,
  onRestore,
  onDelete,
}: {
  entry: AvaMemoryEntryUI;
  isArchived: boolean;
  isConfirmDelete: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const categoryColor = CATEGORY_COLORS[entry.category] ?? '#6b7280';
  const isLong = entry.content.length > 120;

  return (
    <div style={s.entryCard}>
      {/* Top row: category badge + branch + tags + time */}
      <div style={s.entryTopRow}>
        <span style={s.badge(categoryColor)}>{entry.category}</span>
        {entry.branch && (
          <span style={s.badge('#8b5cf6')}>{entry.branch}</span>
        )}
        {entry.tags?.map(tag => (
          <span key={tag} style={{ ...s.statText, opacity: 0.5 }}>#{tag}</span>
        ))}
        <div style={s.spacer} />
        <span style={s.timeText} title={entry.updatedAt}>{timeAgo(entry.updatedAt)}</span>
      </div>

      {/* Content */}
      <div style={s.entryContent} onClick={() => isLong && setExpanded(!expanded)}>
        <pre style={s.entryPre}>
          {isLong && !expanded ? entry.content.slice(0, 120) + '...' : entry.content}
        </pre>
      </div>

      {/* Stats + Actions */}
      <div style={s.statsRow}>
        <span style={s.statText}>recalled {entry.recallCount}x</span>
        {entry.lastRecalledAt && (
          <span style={s.statText}>last: {timeAgo(entry.lastRecalledAt)}</span>
        )}
        <div style={s.spacer} />

        {isArchived ? (
          <>
            <button style={s.actionBtn(false)} onClick={onRestore}>Restore</button>
            <button style={s.actionBtn(isConfirmDelete)} onClick={onDelete}>
              {isConfirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </>
        ) : (
          <>
            <button style={s.actionBtn(false)} onClick={onArchive}>Archive</button>
            <button style={s.actionBtn(isConfirmDelete)} onClick={onDelete}>
              {isConfirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
