import { useState, useCallback, useEffect } from 'react';
import { initLocale, useLocale } from './lib/i18n';
import TitleBar from './components/TitleBar';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import EditorArea from './components/EditorArea';
import type { DashboardPageId } from './components/EditorArea';
import BottomPanel from './components/BottomPanel';
import StatusBar from './components/StatusBar';
import WelcomeOverlay from './components/WelcomeOverlay';
import UpdateChecker from './components/UpdateChecker';

export type ActivityItem = 'explorer' | 'search' | 'git' | 'ava' | 'extensions' | 'debug' | 'dashboard';
export type BottomTab = 'terminal' | 'problems' | 'output' | 'debug-console' | 'ava';
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
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('ava-ide-onboarded') !== 'true');
  const [activeActivity, setActiveActivity] = useState<ActivityItem>(() => load('activity', 'dashboard'));
  const [sidebarOpen, setSidebarOpen] = useState(() => load('sidebarOpen', true));
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => load('sidebarPos', 'left'));
  const [bottomPanelOpen, setBottomPanelOpen] = useState(() => load('panelOpen', false));
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>(() => load('panelTab', 'terminal'));
  const [dashboardPage, setDashboardPage] = useState<DashboardPageId | null>(() => load('dashPage', 'command-centre'));

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

  // Listen for navigation events from dashboard widgets
  useEffect(() => {
    const handler = (e: Event) => {
      const page = (e as CustomEvent).detail;
      if (page) handleDashboardSelect(page);
    };
    window.addEventListener('ava-navigate-dashboard', handler);
    return () => window.removeEventListener('ava-navigate-dashboard', handler);
  }, [handleDashboardSelect]);

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

  // Mode state — synced with chat via localStorage + events
  const MODES = ['work', 'plan', 'chat', 'teach', 'security', 'brainstorm'];
  const MODE_LABELS: Record<string, string> = { work: 'Work', plan: 'Plan', chat: 'Chat', teach: 'Teach', security: 'Security', brainstorm: 'Brainstorm' };
  const [currentMode, setCurrentMode] = useState(() => localStorage.getItem('ava-ide-chat-mode') || 'work');

  // i18n — init on mount, re-render on locale change
  useLocale();
  useEffect(() => { initLocale(); }, []);

  useEffect(() => {
    const handler = () => setCurrentMode(localStorage.getItem('ava-ide-chat-mode') || 'work');
    window.addEventListener('ava-mode-changed', handler);
    return () => window.removeEventListener('ava-mode-changed', handler);
  }, []);

  const cycleMode = useCallback(() => {
    const idx = MODES.indexOf(currentMode);
    const next = MODES[(idx + 1) % MODES.length];
    setCurrentMode(next);
    localStorage.setItem('ava-ide-chat-mode', next);
    window.dispatchEvent(new CustomEvent('ava-mode-changed'));
  }, [currentMode]);

  const activityBar = (
    <ActivityBar active={activeActivity} onSelect={toggleActivity} sidebarOpen={sidebarOpen} />
  );

  const sidebar = sidebarOpen ? (
    <Sidebar
      activePanel={activeActivity}
      position={sidebarPosition}
      onTogglePosition={toggleSidebarPosition}
      onDashboardSelect={handleDashboardSelect}
      activeDashboardPage={dashboardPage}
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
      <StatusBar onToggleTerminal={toggleBottomPanel} mode={MODE_LABELS[currentMode] || 'Work'} onCycleMode={cycleMode} />
      <UpdateChecker />
      {showWelcome && (
        <WelcomeOverlay onComplete={(navigateTo) => {
          setShowWelcome(false);
          if (navigateTo) {
            setDashboardPage(navigateTo as DashboardPageId);
            save('dashPage', navigateTo);
            setActiveActivity('dashboard');
            setSidebarOpen(true);
          }
        }} />
      )}
    </div>
  );
}
