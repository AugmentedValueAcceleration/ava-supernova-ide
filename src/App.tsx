import { useState, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import EditorArea from './components/EditorArea';
import type { DashboardPageId } from './components/EditorArea';
import BottomPanel from './components/BottomPanel';
import StatusBar from './components/StatusBar';

export type ActivityItem = 'explorer' | 'search' | 'git' | 'ava' | 'extensions' | 'debug' | 'dashboard';
export type BottomTab = 'terminal' | 'problems' | 'output' | 'debug-console';
export type SidebarPosition = 'left' | 'right';

// Persist layout to localStorage
function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(`ava-ide-${key}`); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key: string, value: unknown) {
  localStorage.setItem(`ava-ide-${key}`, JSON.stringify(value));
}

export default function App() {
  const [activeActivity, setActiveActivity] = useState<ActivityItem>(() => load('activity', 'explorer'));
  const [sidebarOpen, setSidebarOpen] = useState(() => load('sidebarOpen', true));
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => load('sidebarPos', 'left'));
  const [bottomPanelOpen, setBottomPanelOpen] = useState(() => load('panelOpen', false));
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>(() => load('panelTab', 'terminal'));
  const [dashboardPage, setDashboardPage] = useState<DashboardPageId | null>(() => load('dashPage', null));

  const toggleActivity = useCallback((item: ActivityItem) => {
    // When clicking a non-dashboard activity item, clear the dashboard page
    if (item !== 'dashboard') {
      setDashboardPage(null);
      save('dashPage', null);
    }

    if (activeActivity === item && sidebarOpen) {
      setSidebarOpen(false);
      save('sidebarOpen', false);
    } else {
      setActiveActivity(item);
      setSidebarOpen(true);
      save('activity', item);
      save('sidebarOpen', true);
    }
  }, [activeActivity, sidebarOpen]);

  const handleDashboardSelect = useCallback((page: string) => {
    setDashboardPage(page as DashboardPageId);
    save('dashPage', page);
  }, []);

  const toggleSidebarPosition = useCallback(() => {
    setSidebarPosition(p => {
      const next = p === 'left' ? 'right' : 'left';
      save('sidebarPos', next);
      return next;
    });
  }, []);

  const toggleBottomPanel = useCallback(() => {
    setBottomPanelOpen(p => {
      save('panelOpen', !p);
      return !p;
    });
  }, []);

  const changeBottomTab = useCallback((tab: BottomTab) => {
    setActiveBottomTab(tab);
    save('panelTab', tab);
  }, []);

  const activityBar = (
    <ActivityBar active={activeActivity} onSelect={toggleActivity} sidebarOpen={sidebarOpen} />
  );

  const sidebar = sidebarOpen ? (
    <Sidebar
      activePanel={activeActivity}
      position={sidebarPosition}
      onTogglePosition={toggleSidebarPosition}
      onDashboardSelect={handleDashboardSelect}
    />
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {sidebarPosition === 'left' && activityBar}
        {sidebarPosition === 'left' && sidebar}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <EditorArea dashboardPage={dashboardPage} />
          {bottomPanelOpen && (
            <BottomPanel activeTab={activeBottomTab} onTabChange={changeBottomTab} onClose={toggleBottomPanel} />
          )}
        </div>
        {sidebarPosition === 'right' && sidebar}
        {sidebarPosition === 'right' && activityBar}
      </div>
      <StatusBar onToggleTerminal={toggleBottomPanel} mode="Work" />
    </div>
  );
}
