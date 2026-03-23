import {
  CommandCentrePage,
  AvaChatPage,
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
} from './DashboardPages';

export type DashboardPageId =
  | 'Command Centre'
  | 'Ava Chat'
  | 'Memory'
  | 'Tasks'
  | 'Journal'
  | 'Learning'
  | 'Library'
  | 'Personality'
  | 'Cloud Sync'
  | 'Usage'
  | 'Billing'
  | 'Settings'
  | 'Connections'
  | 'Support'
  | 'Documentation'
  | 'Release Notes';

interface Props {
  dashboardPage?: DashboardPageId | null;
}

const dashboardIcons: Record<DashboardPageId, string> = {
  'Command Centre': '\u26A1',
  'Ava Chat': '\u2601\uFE0F',
  'Memory': '\uD83E\uDDE0',
  'Tasks': '\u2705',
  'Journal': '\uD83D\uDCD3',
  'Learning': '\uD83C\uDF93',
  'Library': '\uD83D\uDDBC\uFE0F',
  'Personality': '\uD83C\uDFA8',
  'Cloud Sync': '\u2601\uFE0F',
  'Usage': '\uD83D\uDCCA',
  'Billing': '\uD83D\uDCB3',
  'Settings': '\u2699\uFE0F',
  'Connections': '\uD83D\uDD17',
  'Support': '\uD83C\uDD98',
  'Documentation': '\uD83D\uDCD6',
  'Release Notes': '\uD83D\uDCCB',
};

const dashboardComponents: Record<DashboardPageId, React.FC> = {
  'Command Centre': CommandCentrePage,
  'Ava Chat': AvaChatPage,
  'Memory': MemoryPage,
  'Tasks': TasksPage,
  'Journal': JournalPage,
  'Learning': LearningPage,
  'Library': LibraryPage,
  'Personality': PersonalityPage,
  'Cloud Sync': CloudSyncPage,
  'Usage': UsagePage,
  'Billing': BillingPage,
  'Settings': SettingsPage,
  'Connections': ConnectionsPage,
  'Support': SupportPage,
  'Documentation': DocumentationPage,
  'Release Notes': ReleaseNotesPage,
};

export default function EditorArea({ dashboardPage }: Props) {
  const activePage = dashboardPage || 'Command Centre';
  const DashboardComponent = dashboardComponents[activePage];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div
        style={{
          height: 36,
          background: '#181825',
          display: 'flex',
          alignItems: 'stretch',
          flexShrink: 0,
          borderBottom: '1px solid #313244',
        }}
      >
        {/* Active tab */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 12px',
            background: '#1e1e2e',
            borderTop: '1px solid #a855f7',
            borderRight: '1px solid #313244',
            cursor: 'pointer',
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 14 }}>{dashboardIcons[activePage]}</span>
          <span style={{ fontSize: 13, color: '#cdd6f4', whiteSpace: 'nowrap' }}>
            {activePage}
          </span>
          <button
            style={{
              width: 18,
              height: 18,
              background: 'transparent',
              border: 'none',
              color: '#6c7086',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              borderRadius: 4,
              marginLeft: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#313244'; e.currentTarget.style.color = '#cdd6f4'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6c7086'; }}
          >
            <svg width="8" height="8" viewBox="0 0 10 10">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <DashboardComponent />
    </div>
  );
}
