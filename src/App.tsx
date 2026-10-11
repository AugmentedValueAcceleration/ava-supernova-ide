import { useState, useCallback, useEffect, useRef } from 'react';
import { initLocale, useLocale } from './lib/i18n';
import { TickEngine } from './lib/tick-engine';
import { refreshTier } from './lib/api';
import TitleBar from './components/TitleBar';
import { DashboardTopBar } from './components/DashboardTopBar';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import EditorArea from './components/EditorArea';
import type { DashboardPageId } from './components/EditorArea';
import BottomPanel from './components/BottomPanel';
import { ensureSidecarLog } from './lib/sidecar-log';
import { ensureSidecarRunning } from './lib/sidecar-boot';
import { getSidecar } from './lib/sidecar';
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
  // Show on every startup while the "show on startup" preference is on (default
  // true) — for everyone, signed in or not. The overlay's checkbox + the
  // Settings toggle write `ava-ide-welcome-on-startup`.
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('ava-ide-welcome-on-startup') !== 'false');
  const [activeActivity, setActiveActivity] = useState<ActivityItem>(() => load('activity', 'dashboard'));
  const [sidebarOpen, setSidebarOpen] = useState(() => load('sidebarOpen', true));
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => load('sidebarPos', 'left'));
  const [bottomPanelOpen, setBottomPanelOpen] = useState(() => load('panelOpen', false));
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>(() => load('panelTab', 'terminal'));
  // Always open on the Command Centre on a fresh load (matches the extension,
  // which hard-defaults to 'overview'). We intentionally do NOT restore the
  // last page — opening the app is a "where am I today" moment.
  const [dashboardPage, setDashboardPage] = useState<DashboardPageId | null>('command-centre');
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

  // Live document preview — the chat dispatches this when Ava authors/edits a
  // .md (document_author). Open it in the editor; FileViewer renders markdown.
  useEffect(() => {
    const onOpenDoc = (e: Event) => {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path;
      if (typeof path === 'string') handleFileOpen(path);
    };
    window.addEventListener('ava-open-document', onOpenDoc);
    return () => window.removeEventListener('ava-open-document', onOpenDoc);
  }, [handleFileOpen]);

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
  /**
   * What repo and branch the status bar shows.
   *
   * Re-read when the folder changes AND when the window regains focus, because
   * the common case is switching branch in a terminal and tabbing back — if it
   * only refreshed on folder change it would be stale exactly when it matters
   * most. Null until the first answer; the bar renders nothing rather than a
   * placeholder, since a confident wrong branch is what this replaced.
   */
  const [gitInfo, setGitInfo] = useState<{ repo: string | null; branch: string | null; isRepo: boolean } | null>(null);
  const refreshGitInfo = useCallback(() => {
    // Read the key rather than closing over state: the folder can change from
    // several places and localStorage is the one value they all agree on.
    let folder: string | null = null;
    try { folder = localStorage.getItem('ava-ide-project-folder'); } catch { folder = null; }
    return getSidecar().getGitInfo(folder)
      .then((info) => { setGitInfo(info); return info; })
      .catch(() => { setGitInfo(null); return null; });
  }, []);

  useEffect(() => {
    // WAIT for the sidecar, then keep asking until it answers.
    //
    // The first version fired on mount and gave up. The sidecar takes up to
    // 15s to initialise, the request times out at 6, and the only thing that
    // retried was a window-focus listener — so the bar sat empty until the
    // operator happened to click away and back. He timed it at about a
    // minute, which is exactly what "no retry" looks like from the outside.
    //
    // `repo` is non-null even for a folder that is not a repo (it falls back
    // to the folder name), so a null repo means the call genuinely failed.
    // That makes this loop self-limiting rather than endless.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (delay: number) => {
      if (cancelled) return;
      if (!getSidecar().isReady) {
        timer = setTimeout(() => attempt(delay), 400);
        return;
      }
      void refreshGitInfo().then((info) => {
        if (cancelled || (info && info.repo)) return;
        // Back off, but keep trying — capped so a permanently broken sidecar
        // costs one call every few seconds, not a spin.
        timer = setTimeout(() => attempt(Math.min(delay * 2, 5000)), delay);
      });
    };
    attempt(600);

    const onFolder = () => { void refreshGitInfo(); };
    window.addEventListener('ava-folder-changed', onFolder);
    window.addEventListener('focus', onFolder);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('ava-folder-changed', onFolder);
      window.removeEventListener('focus', onFolder);
    };
  }, [refreshGitInfo, projectFolder]);

  const handleOpenFolder = useCallback((path: string) => {
    setProjectFolder(path);
    save('projectFolder', path);
    // Notify sidecar and other components — both keys must stay in sync
    localStorage.setItem('ava-ide-project-folder', path);
    window.dispatchEvent(new CustomEvent('ava-folder-changed', { detail: path }));
  }, []);

  // Mode state — synced with chat via localStorage + events
  const MODES = ['work', 'write', 'plan', 'chat', 'teach', 'security', 'brainstorm'];
  const MODE_LABELS: Record<string, string> = { work: 'Code', write: 'Write', plan: 'Plan', chat: 'Chat', teach: 'Teach', security: 'Security', brainstorm: 'Brainstorm' };
  const [currentMode, setCurrentMode] = useState(() => localStorage.getItem('ava-ide-chat-mode') || 'work');

  // i18n — init on mount, re-render on locale change
  useLocale();
  useEffect(() => { initLocale(); }, []);

  // The projects folder exists from launch, not from the first time somebody
  // starts a project. The storage bar's "Your projects" line and the Settings
  // path both name it already; this is what makes that name true, for installs
  // of any age — a recursive mkdir on an existing folder does nothing.
  //
  // In the RENDERER, not the sidecar: the sidecar only starts when canChat is
  // true, so a user with no chat key and no account — the local-first case this
  // is for — would never reach it. Same trap as wiring the signed-out data
  // folder to the sign-out event rather than to startup.
  useEffect(() => {
    void (async () => {
      try {
        const [{ homeDir }, fs, { readProjectsHomeSetting }, { projectsHomeFrom }] = await Promise.all([
          import('@tauri-apps/api/path'),
          import('@tauri-apps/plugin-fs'),
          import('./lib/shared-config'),
          import('@ava/core/projects/home'),
        ]);
        const configured = await readProjectsHomeSetting();
        const home = projectsHomeFrom(await homeDir(), configured);
        await fs.mkdir(home, { recursive: true });
      } catch { /* unwritable home is not a reason to block startup */ }
    })();
  }, []);
  // Start capturing sidecar activity from launch so the Output/Problems panels
  // have the full history the moment they're opened.
  useEffect(() => { ensureSidecarLog(); }, []);

  // App-level sidecar boot — the sidecar is a singleton shared by every page, so
  // it must NOT be owned by the main chat alone. Ensure it's running from launch
  // and whenever the account/keys change, regardless of which page is open. This
  // is what makes the Design Studio work on a cold load / reload (previously the
  // sidecar only started on the main chat, so design chat found nothing running).
  useEffect(() => {
    let cancelled = false;
    const ensure = () => { if (!cancelled) ensureSidecarRunning().catch(() => {}); };
    ensure();
    window.addEventListener('ava-auth-changed', ensure);
    window.addEventListener('ava-byok-changed', ensure);
    return () => {
      cancelled = true;
      window.removeEventListener('ava-auth-changed', ensure);
      window.removeEventListener('ava-byok-changed', ensure);
    };
  }, []);

  useEffect(() => {
    const handler = () => setCurrentMode(localStorage.getItem('ava-ide-chat-mode') || 'work');
    window.addEventListener('ava-mode-changed', handler);
    return () => window.removeEventListener('ava-mode-changed', handler);
  }, []);

  // Replay the welcome tour (from Settings) — non-destructive.
  useEffect(() => {
    const handler = () => setShowWelcome(true);
    window.addEventListener('ava-open-welcome', handler);
    return () => window.removeEventListener('ava-open-welcome', handler);
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

  // Sidebar always mounts so Dashboard's icons-only rail is reachable
  // when collapsed. The Sidebar component handles the collapsed branch
  // internally — for non-Dashboard panels (Explorer / Search / Git etc.)
  // it returns null because their content has no icon shorthand.
  const sidebar = (
    <Sidebar
      activePanel={activeActivity}
      position={sidebarPosition}
      onTogglePosition={toggleSidebarPosition}
      onToggleCollapse={() => { setSidebarOpen(o => { save('sidebarOpen', !o); return !o; }); }}
      onDashboardSelect={handleDashboardSelect}
      activeDashboardPage={dashboardPage}
      onFileOpen={handleFileOpen}
      collapsed={!sidebarOpen}
    />
  );

  // ── Tick Engine — background awareness ──────────────────────────────
  const tickRef = useRef<TickEngine | null>(null);
  useEffect(() => {
    if (!tickRef.current) tickRef.current = new TickEngine();
    const interval = setInterval(async () => {
      if (!tickRef.current) return;
      const result = await tickRef.current.tick({
        getCreditBalance: () => {
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
      <DashboardTopBar />
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
      <StatusBar
        onToggleTerminal={toggleBottomPanel}
        mode={MODE_LABELS[currentMode] || 'Code'}
        onCycleMode={cycleMode}
        gitInfo={gitInfo}
        activeFilePath={activeFilePath}
      />
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
