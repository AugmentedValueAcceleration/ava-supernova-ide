import { useState, useCallback, useEffect, useRef } from 'react';
import { initLocale, useLocale } from './lib/i18n';
import { TickEngine } from './lib/tick-engine';
import { refreshTier } from './lib/api';
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
export interface OpenFile { path: string; name: string; }

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
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const handleFileOpen = useCallback((path: string) => {
    const name = path.split('/').pop() || path.split('\\').pop() || path;
    setOpenFiles(prev => {
      if (prev.some(f => f.path === path)) return prev;
      return [...prev, { path, name }];
    });
    setActiveFilePath(path);
  }, []);

  const handleFileClose = useCallback((path: string) => {
    setOpenFiles(prev => {
      const next = prev.filter(f => f.path !== path);
      if (activeFilePath === path) {
        setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null);
        if (next.length === 0) {
          setDashboardPage('command-centre');
          save('dashPage', 'command-centre');
        }
      }
      return next;
    });
  }, [activeFilePath]);

  const toggleActivity = useCallback((item: ActivityItem) => {
    // Keep dashboard page visible — activity bar only controls the sidebar panel

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

  // Desktop Automation mode is now a regular chat mode (7th mode).
  // `@@` prefix switches the chat to desktop mode in AvaChatPage; no
  // fullscreen overlay needed. The old ava-enter-desktop-mode event
  // is retained as a no-op target to avoid breaking external dispatchers.

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

  // Project folder state — persisted
  // Sync both localStorage keys on init to prevent mismatch
  const [projectFolder, setProjectFolder] = useState<string | null>(() => {
    const saved = load('projectFolder', null) as string | null;
    // Ensure the sidecar key always matches the app key
    if (saved) localStorage.setItem('ava-ide-project-folder', saved);
    return saved;
  });
  const handleOpenFolder = useCallback((path: string) => {
    setProjectFolder(path);
    save('projectFolder', path);
    // Notify sidecar and other components — both keys must stay in sync
    localStorage.setItem('ava-ide-project-folder', path);
    window.dispatchEvent(new CustomEvent('ava-folder-changed', { detail: path }));
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

  // Re-fetch tier from the platform on launch and whenever the IDE
  // window regains focus. Covers the common "upgraded on the website,
  // come back to the IDE" flow without requiring a sign-out/sign-in.
  useEffect(() => {
    void refreshTier();
    const onFocus = () => { void refreshTier(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshTier(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
      onFileOpen={handleFileOpen}
    />
  ) : null;

  // ── Tick Engine — background awareness ──────────────────────────────
  const tickRef = useRef<TickEngine | null>(null);
  useEffect(() => {
    if (!tickRef.current) tickRef.current = new TickEngine();
    const interval = setInterval(async () => {
      if (!tickRef.current) return;
      const result = await tickRef.current.tick({
        getTokenBalance: () => {
          try {
            const bal = localStorage.getItem('ava-platform-balance');
            if (bal) { const p = JSON.parse(bal); return { used: p.used, limit: p.limit }; }
          } catch { /* */ }
          return null;
        },
        getSupportUnread: () => {
          try { return Number(localStorage.getItem('ava-support-unread') || 0); } catch { return 0; }
        },
      });
      for (const event of result.events) {
        // Dispatch as custom event for toast/notification display
        window.dispatchEvent(new CustomEvent('ava-tick-event', { detail: event }));
      }
    }, 120_000); // Every 2 minutes
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar onOpenFolder={handleOpenFolder} currentFolder={projectFolder} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {sidebarPosition === 'left' && activityBar}
        {sidebarPosition === 'left' && sidebar}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <EditorArea
            dashboardPage={dashboardPage}
            openFiles={openFiles}
            activeFilePath={activeFilePath}
            onFileSelect={(path) => setActiveFilePath(path || null)}
            onFileClose={handleFileClose}
            onDashboardSelect={(page) => { setActiveFilePath(null); handleDashboardSelect(page); }}
          />
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
