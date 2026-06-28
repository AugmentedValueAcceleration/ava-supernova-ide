import { useEffect, useState, type ReactNode } from 'react';
import type { ActivityItem } from '../App';
import { Tooltip } from './Tooltip';

interface Props {
  active: ActivityItem;
  onSelect: (item: ActivityItem) => void;
  sidebarOpen: boolean;
}

const icons: Partial<Record<ActivityItem, { label: string; svg: ReactNode }>> = {
  explorer: {
    label: 'Explorer',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
      </svg>
    ),
  },
  search: {
    label: 'Search',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  git: {
    label: 'Source Control',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 01-9 9" />
      </svg>
    ),
  },
  // Dashboard — moved into the top group (right after Explorer) so it
  // sits with the other primary panels instead of being separated as a
  // bottom-anchored secondary action.
  dashboard: {
    label: 'Dashboard',
    // Supernova star-burst — on-brand for the Command Center, and reads as a
    // distinct "home / overview" mark rather than a generic grid.
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 7.2 L13.4 10.6 L16.8 12 L13.4 13.4 L12 16.8 L10.6 13.4 L7.2 12 L10.6 10.6 Z" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2l1.8 1.8M19 5l-1.8 1.8M6.8 17.2L5 19" />
      </svg>
    ),
  },
  // 'ava' activity removed — superseded by the Dashboard nav (Chat lives
  // in there now). Keeping the AvaPanel component for legacy reference
  // doesn't cost anything since nothing routes to it.
  extensions: {
    label: 'Extensions',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  debug: {
    label: 'Run and Debug',
    svg: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
};

// Dashboard sits right under Explorer — the primary surface; everything
// else (Search/Git/Extensions/Debug) is supporting tooling. 'ava' is
// dropped from the activity bar since the Dashboard's Chat tab covers it.
const order: ActivityItem[] = ['explorer', 'dashboard', 'search', 'git', 'extensions', 'debug'];

export default function ActivityBar({ active, onSelect, sidebarOpen }: Props) {
  // Uncommitted-changes badge on the git icon. Polls git_status every
  // 15 seconds — light enough not to spam the disk, fast enough that
  // the user sees their commit reflected within a turn. Skips entirely
  // when no project folder is open so we don't shell out to git in a
  // homedir or fail noisily without a repo.
  const [gitChangeCount, setGitChangeCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const folder = localStorage.getItem('ava-ide-project-folder');
        if (!folder) { if (!cancelled) setGitChangeCount(null); return; }
        const { invoke } = await import('@tauri-apps/api/core');
        const status = await invoke<{ files: unknown[] }>('git_status', { repo: folder });
        if (!cancelled) setGitChangeCount(status.files.length);
      } catch {
        // Not a git repo, git not installed, or any other error → no
        // badge. Don't surface anything to the user from the badge —
        // the GitPanel itself shows actionable errors when opened.
        if (!cancelled) setGitChangeCount(null);
      }
      if (!cancelled) timer = setTimeout(poll, 15000);
    };
    void poll();
    // Re-poll immediately when the user changes folder.
    const onFolderChange = () => { setGitChangeCount(null); void poll(); };
    window.addEventListener('ava-folder-changed', onFolderChange);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('ava-folder-changed', onFolderChange);
    };
  }, []);

  return (
    <div
      style={{
        width: 48,
        background: 'rgba(15, 10, 26, 0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 4,
        paddingBottom: 4,
        flexShrink: 0,
        borderRight: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
      }}
    >
      {/* Top icons */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        {order.map((item) => {
          const isActive = active === item && sidebarOpen;
          // Show the uncommitted-changes badge on the git icon when
          // there's anything pending. Renders as a small pill in the
          // top-right of the icon's bounding box — same pattern VS
          // Code uses so muscle memory ports.
          const showGitBadge = item === 'git' && gitChangeCount !== null && gitChangeCount > 0;
          const badgeText = gitChangeCount != null && gitChangeCount > 99 ? '99+' : String(gitChangeCount ?? '');
          const titleText = item === 'git' && gitChangeCount != null && gitChangeCount > 0
            ? `${icons[item]?.label} — ${gitChangeCount} uncommitted change${gitChangeCount === 1 ? '' : 's'}`
            : icons[item]?.label;
          return (
            <Tooltip key={item} content={titleText || ''} placement="right">
              <button
                onClick={() => onSelect(item)}
                style={{
                  position: 'relative',
                  width: 48,
                  height: 48,
                  background: 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  color: isActive ? '#cdd6f4' : '#6c7086',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#cdd6f4';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#6c7086';
                }}
              >
                {icons[item]?.svg}
                {showGitBadge && (
                  <span style={{
                    position: 'absolute',
                    top: 6, right: 6,
                    minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, fontFamily: 'system-ui, sans-serif',
                    pointerEvents: 'none',
                  }}>
                    {badgeText}
                  </span>
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Bottom slot intentionally empty now that Dashboard moved up
          into the primary group. The justify-content:space-between on
          the parent still works fine — the top group is the only child
          and stays anchored at the top. */}
    </div>
  );
}
