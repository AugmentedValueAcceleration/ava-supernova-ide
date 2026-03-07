import * as React from '@theia/core/shared/react';

export interface AvaMemoryBrowserProps {
  globalMemory: string | null;
  projectMemory: string | null;
  onSave: (scope: 'global' | 'project', content: string) => void;
  onClear: (scope: 'global' | 'project') => void;
  onBack: () => void;
}

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
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
  pre: {
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'var(--theia-editor-font-family, monospace)',
    fontSize: '12px',
    lineHeight: '1.5',
    color: 'var(--theia-foreground)',
    opacity: 0.9,
  },
  textarea: {
    width: '100%',
    height: '100%',
    minHeight: '200px',
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
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '120px',
    opacity: 0.5,
    fontSize: '12px',
  },
  actions: {
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
  spacer: { flex: 1 },
  pathHint: {
    fontSize: '10px',
    opacity: 0.4,
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
};

export const AvaMemoryBrowser: React.FC<AvaMemoryBrowserProps> = ({
  globalMemory,
  projectMemory,
  onSave,
  onClear,
  onBack,
}) => {
  const [activeTab, setActiveTab] = React.useState<'global' | 'project'>('global');
  const [editing, setEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState('');
  const [confirmClear, setConfirmClear] = React.useState(false);

  const currentContent = activeTab === 'global' ? globalMemory : projectMemory;

  const handleEdit = () => {
    setEditContent(currentContent ?? '');
    setEditing(true);
  };

  const handleSave = () => {
    onSave(activeTab, editContent);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setConfirmClear(false);
  };

  const handleClear = () => {
    if (confirmClear) {
      onClear(activeTab);
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const handleTabSwitch = (tab: 'global' | 'project') => {
    setActiveTab(tab);
    setEditing(false);
    setConfirmClear(false);
  };

  return (
    <div style={s.container}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <button style={s.backBtn} onClick={onBack}>Back</button>
        <span style={s.title}>Memory</span>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        <button style={s.tab(activeTab === 'global')} onClick={() => handleTabSwitch('global')}>
          Global
        </button>
        <button style={s.tab(activeTab === 'project')} onClick={() => handleTabSwitch('project')}>
          Project
        </button>
      </div>

      {/* Content */}
      <div style={s.content}>
        {editing ? (
          <textarea
            autoFocus
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={s.textarea}
          />
        ) : currentContent ? (
          <pre style={s.pre}>{currentContent}</pre>
        ) : (
          <div style={s.emptyState}>
            {activeTab === 'global'
              ? 'No global memories yet. Ava will save memories as you work together.'
              : 'No project memories yet. Ava will save project-specific patterns here.'}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={s.actions}>
        {editing ? (
          <>
            <button style={s.btn} onClick={handleSave}>Save</button>
            <button style={s.btnSecondary} onClick={handleCancel}>Cancel</button>
          </>
        ) : (
          <>
            <button style={s.btn} onClick={handleEdit}>Edit</button>
            {currentContent && (
              <button
                style={confirmClear ? s.btnDanger : s.btnSecondary}
                onClick={handleClear}
              >
                {confirmClear ? 'Confirm Clear' : 'Clear'}
              </button>
            )}
          </>
        )}
        <div style={s.spacer} />
        <span style={s.pathHint}>
          {activeTab === 'global' ? '~/.ava/memory.md' : '.ava/memory.md'}
        </span>
      </div>
    </div>
  );
};
