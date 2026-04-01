import {
  CommandCentrePage,
  AvaChatPage,
  ChatHistoryPage,
  MemoryPage,
  TasksPage,
  JournalPage,
  LearningPage,
  LibraryPage,
  PersonalityPage,
  CloudSyncPage,
  UsagePage,
  BillingPage,
  SettingsPage,
  ConnectionsPage,
  SupportPage,
  DocumentationPage,
  ReleaseNotesPage,
  RoadmapPage,
  PlannerPage,
  AccountPage,
  HelpPage,
} from './DashboardPages';
import { useState, useEffect } from 'react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { t, useLocale } from '../lib/i18n';
import type { OpenFile } from '../App';

export type DashboardPageId =
  | 'command-centre'
  | 'ava-chat'
  | 'chat-history'
  | 'memory'
  | 'tasks'
  | 'journal'
  | 'learning'
  | 'library'
  | 'personality'
  | 'cloud-sync'
  | 'usage'
  | 'billing'
  | 'settings'
  | 'connections'
  | 'support'
  | 'documentation'
  | 'release-notes'
  | 'roadmap'
  | 'planner'
  | 'account'
  | 'help';

interface Props {
  dashboardPage?: DashboardPageId | null;
  openFiles?: OpenFile[];
  activeFilePath?: string | null;
  onFileSelect?: (path: string) => void;
  onFileClose?: (path: string) => void;
  onDashboardSelect?: (page: string) => void;
}

const dashboardIcons: Record<DashboardPageId, string> = {
  'command-centre': '\u26A1',
  'ava-chat': '\uD83D\uDCAC',
  'chat-history': '\uD83D\uDCDC',
  'memory': '\uD83E\uDDE0',
  'tasks': '\u2705',
  'journal': '\uD83D\uDCD3',
  'learning': '\uD83C\uDF93',
  'library': '\uD83D\uDDBC\uFE0F',
  'personality': '\uD83C\uDFA8',
  'cloud-sync': '\u2601\uFE0F',
  'usage': '\uD83D\uDCCA',
  'billing': '\uD83D\uDCB3',
  'settings': '\u2699\uFE0F',
  'connections': '\uD83D\uDD17',
  'support': '\uD83C\uDD98',
  'documentation': '\uD83D\uDCD6',
  'release-notes': '\uD83D\uDCCB',
  'roadmap': '\uD83D\uDDFA\uFE0F',
  'planner': '\uD83D\uDCCB',
  'account': '\u2699\uFE0F',
  'help': '\u2753',
};

// Map stable IDs to i18n keys for tab labels
const dashboardLabelKeys: Record<DashboardPageId, string> = {
  'command-centre': 'dash.nav.command_centre',
  'ava-chat': 'dash.nav.ava_chat',
  'chat-history': 'dash.nav.chat_history',
  'memory': 'dash.nav.memory',
  'tasks': 'dash.nav.tasks',
  'journal': 'dash.nav.journal',
  'learning': 'dash.nav.learning',
  'library': 'dash.nav.library',
  'personality': 'dash.nav.personality',
  'cloud-sync': 'dash.nav.cloud_sync',
  'usage': 'dash.nav.usage',
  'billing': 'dash.nav.billing',
  'settings': 'dash.nav.settings',
  'connections': 'dash.nav.connections',
  'support': 'dash.nav.support',
  'documentation': 'dash.nav.documentation',
  'release-notes': 'dash.nav.release_notes',
  'roadmap': 'dash.nav.roadmap',
  'planner': 'dash.nav.planner',
  'account': 'dash.nav.account',
  'help': 'dash.nav.help',
};

const dashboardComponents: Record<DashboardPageId, React.FC> = {
  'command-centre': CommandCentrePage,
  'ava-chat': AvaChatPage,
  'chat-history': ChatHistoryPage,
  'memory': MemoryPage,
  'tasks': TasksPage,
  'journal': JournalPage,
  'learning': LearningPage,
  'library': LibraryPage,
  'personality': PersonalityPage,
  'cloud-sync': CloudSyncPage,
  'usage': UsagePage,
  'billing': BillingPage,
  'settings': SettingsPage,
  'connections': ConnectionsPage,
  'support': SupportPage,
  'documentation': DocumentationPage,
  'release-notes': ReleaseNotesPage,
  'roadmap': RoadmapPage,
  'planner': PlannerPage,
  'account': AccountPage,
  'help': HelpPage,
};

function FileViewer({ path }: { path: string }) {
  const [content, setContent] = useState<string>('Loading...');
  const [error, setError] = useState(false);

  useEffect(() => {
    setContent('Loading...');
    setError(false);
    readTextFile(path)
      .then(text => setContent(text))
      .catch(() => { setContent(''); setError(true); });
  }, [path]);

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c7086', fontSize: 13 }}>
        Cannot display this file (binary or unreadable)
      </div>
    );
  }

  return (
    <pre style={{
      flex: 1, margin: 0, padding: '16px 20px', overflowY: 'auto',
      background: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)',
      color: '#cdd6f4', fontSize: 13, lineHeight: 1.6, fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      whiteSpace: 'pre', tabSize: 4,
    }}>
      {content}
    </pre>
  );
}

export default function EditorArea({ dashboardPage, openFiles = [], activeFilePath, onFileSelect, onFileClose }: Props) {
  useLocale();
  const showingFile = !!activeFilePath;
  const activePage = dashboardPage || 'command-centre';
  const DashboardComponent = dashboardComponents[activePage] || CommandCentrePage;

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
    background: isActive ? 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)' : 'transparent',
    borderTop: isActive ? '1px solid #a855f7' : '1px solid transparent',
    borderRight: '1px solid rgba(168, 85, 247, 0.12)',
    cursor: 'pointer', minWidth: 0, flexShrink: 0,
  });

  const closeBtn: React.CSSProperties = {
    width: 18, height: 18, background: 'transparent', border: 'none',
    color: '#6c7086', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', borderRadius: 4, marginLeft: 4,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{
        height: 36, background: 'rgba(15, 10, 26, 0.95)',
        display: 'flex', alignItems: 'stretch', flexShrink: 0, overflowX: 'auto',
        borderBottom: '1px solid rgba(168, 85, 247, 0.12)',
      }}>
        {/* Dashboard tab — click to switch back from file view */}
        {dashboardPage && (
          <div
            style={tabStyle(!showingFile)}
            onClick={() => { onFileSelect?.(''); }}
          >
            <span style={{ fontSize: 14 }}>{dashboardIcons[activePage]}</span>
            <span style={{ fontSize: 13, color: '#cdd6f4', whiteSpace: 'nowrap' }}>
              {t(dashboardLabelKeys[activePage] || '')}
            </span>
          </div>
        )}

        {/* File tabs */}
        {openFiles.map(file => {
          const isActive = !!showingFile && activeFilePath === file.path;
          return (
            <div key={file.path} style={tabStyle(isActive)} onClick={() => onFileSelect?.(file.path)}>
              <span style={{ fontSize: 13, color: isActive ? '#cdd6f4' : '#6c7086', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <button
                style={closeBtn}
                onClick={(e) => { e.stopPropagation(); onFileClose?.(file.path); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; e.currentTarget.style.color = '#cdd6f4'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6c7086'; }}
              >
                <svg width="8" height="8" viewBox="0 0 10 10">
                  <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Content */}
      {showingFile && activeFilePath ? (
        <FileViewer path={activeFilePath} />
      ) : (
        <DashboardComponent />
      )}

    </div>
  );
}
