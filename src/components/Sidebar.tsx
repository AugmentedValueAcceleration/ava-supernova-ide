import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { readDir } from '@tauri-apps/plugin-fs';
import { loadHealthPlanIndex } from '../lib/health-plans-store';
import { Tooltip } from './Tooltip';
import {
  Lightning as PhCommand,
  ChatCircleDots as PhChat,
  ClipboardText as PhPlanner,
  GraduationCap as PhLearning,
  BookOpen as PhLibrary,
  Barbell as PhHealth,
  Palette as PhCreative,
  Brain as PhMemory,
  ChartLineUp as PhHistory,
  GearSix as PhAccount,
  Question as PhHelp,
  ArrowsLeftRight as PhFlip,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
} from '@phosphor-icons/react';
import type { ActivityItem, SidebarPosition } from '../App';
import { getStoredEmail, getStoredTier, isConnected, disconnectAccount, apiFetch } from '../lib/api';
import { t, useLocale, getLocale } from '../lib/i18n';
import { SignInPanel } from './SignInPanel';

type PhIconType = React.ComponentType<{ size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }>;

interface Props {
  activePanel: ActivityItem;
  position?: SidebarPosition;
  onTogglePosition?: () => void;
  /** Collapse / expand the panel. Rendered as a handle on the border facing the
   *  content — the SAME handle in both states, so the control doesn't move on you
   *  the moment you use it. */
  onToggleCollapse?: () => void;
  onDashboardSelect?: (page: string) => void;
  activeDashboardPage?: string | null;
  onFileOpen?: (path: string) => void;
  /** Render the icons-only narrow rail instead of the full panel.
   *  Mirrors the extension NavSidebar's collapsed mode — clicking the
   *  same activity icon hides the labels but keeps the page nav
   *  reachable. Only the Dashboard panel has a sensible collapsed
   *  representation; other activity panels (Explorer / Search etc.)
   *  hide entirely when collapsed since their content has no icon
   *  shorthand. */
  collapsed?: boolean;
}

function getPanelTitle(item: ActivityItem): string {
  const titles: Record<ActivityItem, string> = {
    explorer: t('dash.sidebar.explorer'),
    search: t('dash.sidebar.search'),
    git: t('dash.sidebar.git'),
    ava: t('dash.sidebar.ava'),
    extensions: t('dash.sidebar.extensions'),
    debug: t('dash.sidebar.debug'),
    dashboard: t('dash.sidebar.dashboard'),
  };
  return titles[item] || item.toUpperCase();
}

/* ---------- Hidden folders/files to skip ---------- */
const HIDDEN = new Set(['.git', 'node_modules', '.next', '__pycache__', '.venv', 'dist', '.DS_Store', 'Thumbs.db', '.idea', '.vs']);

/** Recursively update children for a directory in the tree */
function updateChildren(tree: FsEntry[], dirPath: string, children: FsEntry[]): FsEntry[] {
  return tree.map(e => {
    if (e.path === dirPath) return { ...e, children };
    if (e.children) return { ...e, children: updateChildren(e.children, dirPath, children) };
    return e;
  });
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a6adc8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
    </svg>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop();
  let color = '#a6adc8';
  if (ext === 'tsx' || ext === 'ts') color = '#89b4fa';
  if (ext === 'css') color = '#a6e3a1';
  if (ext === 'json') color = '#f9e2af';
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

interface FsEntry {
  name: string;
  isDir: boolean;
  path: string;
  children?: FsEntry[];
}

function FileTreeNode({ entry, depth, expandedDirs, onToggle, onFileOpen }: { entry: FsEntry; depth: number; expandedDirs: Set<string>; onToggle: (path: string) => void; onFileOpen?: (path: string) => void }) {
  const isOpen = expandedDirs.has(entry.path);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          paddingLeft: 8 + depth * 16,
          fontSize: 13,
          color: '#cdd6f4',
          cursor: 'pointer',
        }}
        onClick={() => { if (entry.isDir) onToggle(entry.path); else onFileOpen?.(entry.path); }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {entry.isDir ? (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d={isOpen ? 'M2 4l4 4 4-4' : 'M4 2l4 4-4 4'} stroke="#a6adc8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <FolderIcon />
          </>
        ) : (
          <>
            <span style={{ width: 12 }} />
            <FileIcon name={entry.name} />
          </>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
      </div>
      {entry.isDir && isOpen && entry.children?.map((child) => (
        <FileTreeNode key={child.path} entry={child} depth={depth + 1} expandedDirs={expandedDirs} onToggle={onToggle} onFileOpen={onFileOpen} />
      ))}
    </>
  );
}

function ExplorerPanel({ onFileOpen }: { onFileOpen?: (path: string) => void }) {
  useLocale(); // re-render on locale change; `t` is a direct import
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [projectFolder, setProjectFolder] = useState<string | null>(localStorage.getItem('ava-ide-project-folder'));

  const loadDir = useCallback(async (dirPath: string): Promise<FsEntry[]> => {
    try {
      const items = await readDir(dirPath);
      const result: FsEntry[] = [];
      for (const item of items) {
        if (HIDDEN.has(item.name)) continue;
        const fullPath = dirPath.replace(/\\/g, '/') + '/' + item.name;
        result.push({
          name: item.name,
          isDir: item.isDirectory,
          path: fullPath,
          children: item.isDirectory ? [] : undefined,
        });
      }
      // Sort: folders first, then alphabetical
      result.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return result;
    } catch {
      return [];
    }
  }, []);

  // Load root when folder changes
  useEffect(() => {
    if (!projectFolder) { setEntries([]); return; }
    loadDir(projectFolder).then(setEntries);
  }, [projectFolder, loadDir]);

  // Listen for folder changes
  useEffect(() => {
    const handler = (e: Event) => {
      const folder = (e as CustomEvent).detail;
      setProjectFolder(folder);
      setExpandedDirs(new Set());
    };
    window.addEventListener('ava-folder-changed', handler);
    return () => window.removeEventListener('ava-folder-changed', handler);
  }, []);

  const handleToggle = useCallback(async (dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
    // Lazy load children if not loaded yet
    setEntries(prev => {
      const loadChildren = async () => {
        const children = await loadDir(dirPath);
        setEntries(current => updateChildren(current, dirPath, children));
      };
      // Check if this dir's children are empty (not yet loaded)
      const findEntry = (list: FsEntry[]): FsEntry | null => {
        for (const e of list) {
          if (e.path === dirPath) return e;
          if (e.children) {
            const found = findEntry(e.children);
            if (found) return found;
          }
        }
        return null;
      };
      const entry = findEntry(prev);
      if (entry && entry.children && entry.children.length === 0) {
        loadChildren();
      }
      return prev;
    });
  }, [loadDir]);

  const folderName = projectFolder ? projectFolder.split(/[/\\]/).pop() : null;

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 600, color: '#cdd6f4', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {folderName || t('dash.sidebar.no_folder')}
      </div>
      {!projectFolder && (
        <div style={{ padding: '12px 16px', fontSize: 12, color: '#6c7086' }}>
          Use File &gt; Open Folder to get started.
        </div>
      )}
      {entries.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} depth={0} expandedDirs={expandedDirs} onToggle={handleToggle} onFileOpen={onFileOpen} />
      ))}
    </div>
  );
}

// Real workspace search panel — invokes the Tauri `search_workspace`
// command which uses the same `ignore` engine ripgrep is built on
// (respects .gitignore, hidden files, etc.). Replaces the previous
// stub-input panel that didn't actually search anything.
function SearchPanel({ onFileOpen }: { onFileOpen?: (path: string) => void } = {}) {
  useLocale(); // re-render on locale change; `t` is a direct import
  const [query, setQuery] = useState('');
  const [glob, setGlob] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<{ path: string; line: number; column: number; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run search debounced 250ms after the user stops typing — keeps the
  // panel responsive without firing a directory walk on every keystroke.
  useEffect(() => {
    if (!query.trim()) { setResults([]); setError(null); setTouched(false); return; }
    setTouched(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBusy(true); setError(null);
      try {
        const root = localStorage.getItem('ava-ide-project-folder');
        if (!root) {
          setError(t('dash.sidebar.search_needs_folder'));
          setResults([]);
          return;
        }
        const { invoke } = await import('@tauri-apps/api/core');
        const hits = await invoke<typeof results>('search_workspace', {
          root,
          query,
          options: { caseSensitive, isRegex, wholeWord, fileGlob: glob || null },
        });
        setResults(hits);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, glob, caseSensitive, isRegex, wholeWord]);

  // Group hits by file so the user sees "12 matches in 3 files" rather
  // than an unstructured wall of lines.
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof results>();
    for (const r of results) {
      const list = groups.get(r.path) ?? [];
      list.push(r);
      groups.set(r.path, list);
    }
    return [...groups.entries()];
  }, [results]);

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 28,
    background: 'rgba(49, 34, 68, 0.5)',
    border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
    borderRadius: 4, padding: '0 8px',
    fontSize: 13, color: '#cdd6f4', outline: 'none',
  };
  const toggleStyle = (on: boolean): React.CSSProperties => ({
    width: 24, height: 24, borderRadius: 4, border: 'none',
    background: on ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'transparent',
    color: on ? '#cba6f7' : '#6c7086',
    cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
  });

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('dash.sidebar.search_placeholder')}
          style={{ ...inputStyle, flex: 1 }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 12%, transparent)'; }}
        />
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
        <Tooltip content={t('dash.sidebar.match_case')}><button onClick={() => setCaseSensitive(v => !v)} style={toggleStyle(caseSensitive)}>Aa</button></Tooltip>
        <Tooltip content={t('dash.sidebar.whole_word')}><button onClick={() => setWholeWord(v => !v)} style={toggleStyle(wholeWord)}>ab</button></Tooltip>
        <Tooltip content={t('dash.sidebar.regex')}><button onClick={() => setIsRegex(v => !v)} style={toggleStyle(isRegex)}>.*</button></Tooltip>
        <input
          type="text"
          value={glob}
          onChange={(e) => setGlob(e.target.value)}
          placeholder={t('dash.sidebar.files_to_include')}
          style={{ ...inputStyle, flex: 1, fontSize: 11, height: 24 }}
        />
      </div>

      <div style={{ marginTop: 12, flex: 1, overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(243,139,168,0.08)', color: '#f9b3c4', fontSize: 11, lineHeight: 1.5 }}>
            {error}
          </div>
        )}
        {!error && busy && results.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: '#6c7086', fontSize: 12 }}>{t('dash.sidebar.searching')}</div>
        )}
        {!error && !busy && touched && results.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: '#6c7086', fontSize: 12 }}>{t('dash.sidebar.no_matches')}</div>
        )}
        {!error && !touched && results.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: '#6c7086', fontSize: 12 }}>
            Type to search across your workspace.<br />
            <span style={{ fontSize: 10, opacity: 0.7 }}>Respects .gitignore. Skips binary + large files.</span>
          </div>
        )}
        {results.length > 0 && (
          <div style={{ fontSize: 10, color: '#6c7086', padding: '4px 4px 8px' }}>
            {results.length} match{results.length === 1 ? '' : 'es'} in {grouped.length} file{grouped.length === 1 ? '' : 's'}
            {results.length >= 1000 && ' (capped at 1000 — refine the query)'}
          </div>
        )}
        {grouped.map(([path, hits]: [string, typeof results]) => {
          const fileName = path.split(/[/\\]/).pop() || path;
          const folder = path.replace(/[/\\][^/\\]+$/, '');
          return (
            <div key={path} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#a6adc8', padding: '4px 4px', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 500, color: '#cdd6f4' }}>{fileName}</span>
                <span style={{ fontSize: 9, color: '#585b70', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: '#6c7086' }}>{hits.length}</span>
              </div>
              {hits.map((h: typeof results[number], i: number) => (
                <button
                  key={i}
                  onClick={() => onFileOpen?.(path)}
                  title={`${path}:${h.line}:${h.column}`}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '3px 8px 3px 16px', border: 'none',
                    background: 'transparent', color: '#a6adc8', cursor: 'pointer',
                    fontSize: 11, fontFamily: 'monospace', borderRadius: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ color: '#6c7086', marginRight: 6 }}>{h.line}:</span>
                  {h.text.trim()}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Real Source Control panel — shells out to system `git` via the
// Tauri Rust commands. Replaces the previous stub which had a commit
// input but never actually ran git. Surfaces the same workflow VS
// Code's git panel does: branch + ahead/behind, three sections
// (Staged / Changes / Untracked), per-file stage / unstage / discard,
// commit message + button, expandable diff per row.
interface GitFileEntry {
  section: 'staged' | 'unstaged' | 'untracked';
  path: string;
  code: string;
}
interface GitStatusReport {
  branch: string;
  ahead: number | null;
  behind: number | null;
  files: GitFileEntry[];
}
function GitPanel({ onFileOpen }: { onFileOpen?: (path: string) => void } = {}) {
  useLocale(); // re-render on locale change; `t` is a direct import
  const [status, setStatus] = useState<GitStatusReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [diff, setDiff] = useState<{ path: string; staged: boolean; text: string } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const projectFolder = useMemo(() => {
    try { return localStorage.getItem('ava-ide-project-folder'); } catch { return null; }
  }, []);

  const refresh = useCallback(async () => {
    if (!projectFolder) { setStatus(null); setError(null); return; }
    setBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const report = await invoke<GitStatusReport>('git_status', { repo: projectFolder });
      setStatus(report);
      setError(null);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [projectFolder]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Re-poll every 5s while panel is open so external git operations
  // (terminal commits, branch switches) reflect without manual refresh.
  // Cheap because git status is a sub-100ms call on most repos.
  useEffect(() => {
    if (!projectFolder) return;
    const interval = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(interval);
  }, [projectFolder, refresh]);

  const stage = async (paths: string[]) => {
    setBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('git_stage', { repo: projectFolder, paths });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };
  const unstage = async (paths: string[]) => {
    setBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('git_unstage', { repo: projectFolder, paths });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };
  const discard = async (paths: string[]) => {
    if (!confirm(`Discard local changes to ${paths.length === 1 ? paths[0] : `${paths.length} files`}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('git_discard', { repo: projectFolder, paths });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!commitMessage.trim()) return;
    setBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('git_commit', { repo: projectFolder, message: commitMessage });
      setCommitMessage('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };
  const showDiff = async (path: string, staged: boolean) => {
    if (diff?.path === path && diff.staged === staged) { setDiff(null); return; }
    setDiffLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const text = await invoke<string>('git_diff', { repo: projectFolder, path, staged });
      setDiff({ path, staged, text: text || '(no diff)' });
    } catch (err) {
      setDiff({ path, staged, text: `Error loading diff: ${err instanceof Error ? err.message : String(err)}` });
    } finally { setDiffLoading(false); }
  };

  if (!projectFolder) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: '#6c7086', textAlign: 'center' }}>
        Open a folder to use Source Control.
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(243,139,168,0.08)', color: '#f9b3c4', fontSize: 11, lineHeight: 1.6 }}>
          {error}
        </div>
        <button onClick={() => void refresh()} style={{ marginTop: 12, width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', background: 'rgba(49,34,68,0.5)', color: '#cdd6f4', fontSize: 11, cursor: 'pointer' }}>{t('dash.sidebar.retry')}</button>
      </div>
    );
  }
  if (!status) {
    return <div style={{ padding: 16, fontSize: 12, color: '#6c7086', textAlign: 'center' }}>{t('dash.sidebar.loading')}</div>;
  }

  const staged = status.files.filter(f => f.section === 'staged');
  const unstaged = status.files.filter(f => f.section === 'unstaged');
  const untracked = status.files.filter(f => f.section === 'untracked');
  const hasChanges = status.files.length > 0;

  const inputStyle: React.CSSProperties = {
    width: '100%', minHeight: 60, resize: 'vertical' as const,
    background: 'rgba(49, 34, 68, 0.5)', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
    borderRadius: 4, padding: 8, fontSize: 12, color: '#cdd6f4', outline: 'none',
    fontFamily: 'inherit',
  };
  const sectionHeader: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: '#6c7086', letterSpacing: 0.5, textTransform: 'uppercase' as const,
    marginTop: 12, marginBottom: 6, display: 'flex', justifyContent: 'space-between',
  };
  const codeColors: Record<string, string> = { M: '#f9e2af', A: '#a6e3a1', D: '#f38ba8', R: '#89dceb', '?': '#6c7086', '!': '#f38ba8' };
  const fileRow = (f: GitFileEntry, actions: React.ReactNode) => {
    const fileName = f.path.split(/[/\\]/).pop() || f.path;
    const folder = f.path.replace(/[/\\][^/\\]+$/, '');
    const indicator = f.section === 'staged' ? f.code[0] : f.section === 'untracked' ? 'U' : f.code[1];
    const isDiffOpen = diff?.path === f.path && diff.staged === (f.section === 'staged');
    return (
      <div key={`${f.section}-${f.path}`} style={{ borderRadius: 4, marginBottom: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(49,34,68,0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ width: 14, textAlign: 'center', fontSize: 10, fontFamily: 'monospace', color: codeColors[indicator] || '#a6adc8', flexShrink: 0 }}>{indicator}</span>
          <button onClick={() => onFileOpen?.(`${projectFolder}/${f.path}`)}
            title={f.path}
            style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: '#cdd6f4', cursor: 'pointer', padding: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}{folder && <span style={{ fontSize: 10, color: '#585b70', marginLeft: 6 }}>{folder}</span>}
          </button>
          {f.section !== 'untracked' && (
            <Tooltip content={isDiffOpen ? 'Hide diff' : 'Show diff'}>
              <button onClick={() => void showDiff(f.path, f.section === 'staged')}
                style={{ width: 22, height: 20, padding: 0, border: 'none', background: 'transparent', color: isDiffOpen ? '#cba6f7' : '#6c7086', cursor: 'pointer', fontSize: 11 }}>±</button>
            </Tooltip>
          )}
          {actions}
        </div>
        {isDiffOpen && (
          <pre style={{ margin: '4px 8px 8px 22px', padding: 8, background: 'rgba(15,10,26,0.7)', borderRadius: 4, fontSize: 10, fontFamily: 'monospace', color: '#a6adc8', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {diffLoading && diff?.path !== f.path ? '…' : (diff?.text || '')}
          </pre>
        )}
      </div>
    );
  };
  const actionBtn = (label: string, onClick: () => void, color = '#a6adc8'): React.ReactNode => (
    <Tooltip content={label}>
      <button onClick={(e) => { e.stopPropagation(); onClick(); }}
        style={{ width: 22, height: 20, padding: 0, border: 'none', background: 'transparent', color, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>
        {label === 'stage' ? '+' : label === 'unstage' ? '−' : '×'}
      </button>
    </Tooltip>
  );

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Branch + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cdd6f4', marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'monospace', color: '#cba6f7', fontWeight: 600 }}>⎇ {status.branch}</span>
        {status.ahead != null && status.ahead > 0 && <Tooltip content={t('dash.sidebar.commits_ahead')}><span style={{ color: '#a6e3a1' }}>↑{status.ahead}</span></Tooltip>}
        {status.behind != null && status.behind > 0 && <Tooltip content={t('dash.sidebar.commits_behind')}><span style={{ color: '#f9e2af' }}>↓{status.behind}</span></Tooltip>}
        <button onClick={() => void refresh()} disabled={busy}
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', background: 'rgba(49,34,68,0.5)', color: '#a6adc8', fontSize: 10, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
          ↻
        </button>
      </div>

      {/* Commit composer */}
      <textarea value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void commit(); } }}
        placeholder={t('dash.sidebar.commit_placeholder')}
        style={inputStyle}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 12%, transparent)'; }}
      />
      <button
        onClick={() => void commit()}
        disabled={busy || staged.length === 0 || !commitMessage.trim()}
        style={{
          marginTop: 6, width: '100%', padding: '6px 10px', borderRadius: 4,
          border: 'none', background: staged.length > 0 && commitMessage.trim() ? 'var(--accent)' : 'rgba(49,34,68,0.5)',
          color: staged.length > 0 && commitMessage.trim() ? '#fff' : '#6c7086', fontSize: 12,
          cursor: staged.length > 0 && commitMessage.trim() ? 'pointer' : 'default', fontWeight: 500,
        }}>
        Commit{staged.length > 0 ? ` (${staged.length})` : ''}
      </button>

      {/* File sections */}
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 4 }}>
        {!hasChanges && (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: '#6c7086' }}>
            Nothing to commit. Working tree clean.
          </div>
        )}
        {staged.length > 0 && (
          <>
            <div style={sectionHeader}>
              <span>Staged ({staged.length})</span>
              <Tooltip content={t('dash.sidebar.unstage_all')}><button onClick={() => void unstage(staged.map(f => f.path))}
                style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 11 }}>−</button></Tooltip>
            </div>
            {staged.map(f => fileRow(f, actionBtn('unstage', () => void unstage([f.path]))))}
          </>
        )}
        {unstaged.length > 0 && (
          <>
            <div style={sectionHeader}>
              <span>Changes ({unstaged.length})</span>
              <span style={{ display: 'flex', gap: 4 }}>
                <Tooltip content={t('dash.sidebar.discard_all')}><button onClick={() => void discard(unstaged.map(f => f.path))}
                  style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 13 }}>×</button></Tooltip>
                <Tooltip content={t('dash.sidebar.stage_all')}><button onClick={() => void stage(unstaged.map(f => f.path))}
                  style={{ background: 'transparent', border: 'none', color: '#a6e3a1', cursor: 'pointer', fontSize: 13 }}>+</button></Tooltip>
              </span>
            </div>
            {unstaged.map(f => fileRow(f, <>
              {actionBtn('discard', () => void discard([f.path]), '#f38ba8')}
              {actionBtn('stage', () => void stage([f.path]), '#a6e3a1')}
            </>))}
          </>
        )}
        {untracked.length > 0 && (
          <>
            <div style={sectionHeader}>
              <span>Untracked ({untracked.length})</span>
              <Tooltip content={t('dash.sidebar.stage_all')}><button onClick={() => void stage(untracked.map(f => f.path))}
                style={{ background: 'transparent', border: 'none', color: '#a6e3a1', cursor: 'pointer', fontSize: 13 }}>+</button></Tooltip>
            </div>
            {untracked.map(f => fileRow(f, actionBtn('stage', () => void stage([f.path]), '#a6e3a1')))}
          </>
        )}
      </div>
    </div>
  );
}

function AvaPanel() {
  useLocale();
  const [messages] = useState([
    { role: 'ava' as const, text: t('dash.sidebar.ava_greeting') },
  ]);
  const [input, setInput] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {msg.role === 'ava' ? (
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent), #6366f1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              ) : (
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'rgba(49, 34, 68, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cdd6f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: msg.role === 'ava' ? 'var(--accent)' : '#cdd6f4' }}>
                {msg.role === 'ava' ? 'Ava' : 'You'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#cdd6f4', lineHeight: 1.5, paddingLeft: 28 }}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('dash.sidebar.ask_ava')}
            style={{
              flex: 1,
              height: 32,
              background: 'rgba(49, 34, 68, 0.5)',
              border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
              borderRadius: 6,
              padding: '0 10px',
              fontSize: 13,
              color: '#cdd6f4',
              outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 12%, transparent)'; }}
          />
          <button
            style={{
              width: 32,
              height: 32,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtensionsPanel() {
  useLocale(); // re-render on locale change; `t` is a direct import
  const extensions = [
    { name: 'Ava Intelligence', publisher: 'Augmented Value Acceleration', installed: true },
    { name: 'Python', publisher: 'Microsoft', installed: true },
    { name: 'Rust Analyzer', publisher: 'rust-lang', installed: false },
    { name: 'Prettier', publisher: 'Prettier', installed: true },
    { name: 'ESLint', publisher: 'Microsoft', installed: true },
  ];

  return (
    <div style={{ padding: 12 }}>
      <input
        type="text"
        placeholder={t('dash.sidebar.search_extensions')}
        style={{
          width: '100%',
          height: 28,
          background: 'rgba(49, 34, 68, 0.5)',
          border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
          borderRadius: 4,
          padding: '0 8px',
          fontSize: 13,
          color: '#cdd6f4',
          outline: 'none',
          marginBottom: 12,
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 12%, transparent)'; }}
      />
      <div style={{ fontSize: 11, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Installed
      </div>
      {extensions.map((ext, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 4px',
            cursor: 'pointer',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 4,
            background: ext.name === 'Ava Intelligence' ? 'linear-gradient(135deg, var(--accent), #6366f1)' : 'rgba(49, 34, 68, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cdd6f4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#cdd6f4', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ext.name}
            </div>
            <div style={{ fontSize: 11, color: '#6c7086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ext.publisher}
            </div>
          </div>
          {ext.installed && (
            <div style={{ fontSize: 10, color: '#a6e3a1', padding: '2px 6px', background: 'rgba(166,227,161,0.1)', borderRadius: 3 }}>
              Installed
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DebugPanel() {
  useLocale(); // re-render on locale change; `t` is a direct import
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <select
          style={{
            flex: 1,
            height: 28,
            background: 'rgba(49, 34, 68, 0.5)',
            border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
            borderRadius: 4,
            padding: '0 8px',
            fontSize: 13,
            color: '#cdd6f4',
            outline: 'none',
          }}
        >
          <option>{t('dash.sidebar.no_configuration')}</option>
        </select>
        <button
          style={{
            width: 28,
            height: 28,
            background: '#a6e3a1',
            border: 'none',
            borderRadius: 4,
            color: '#11111b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#6c7086', textAlign: 'center', padding: '32px 0' }}>
        To customize Run and Debug, create a launch.json file.
      </div>
    </div>
  );
}

/* ---------- Auth + BYOK Section ---------- */
function AuthSection({ collapsed = false }: { collapsed?: boolean } = {}) {
  useLocale(); // re-render on locale change; `t` is a direct import
  const [platformKey, setPlatformKey] = useState(() => {
    try { return localStorage.getItem('ava-ide-platform-key') || ''; } catch { return ''; }
  });
  const [email, setEmail] = useState(() => getStoredEmail() || '');
  const [tier, setTier] = useState(() => getStoredTier() || 'free');
  const [showConnect, setShowConnect] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [usePlatform, setUsePlatform] = useState(() => {
    try { return localStorage.getItem('ava-ide-use-platform') !== '0'; } catch { return true; }
  });

  // Re-read account state whenever sign-in/out fires anywhere — e.g. the
  // onboarding overlay's own SignInPanel. Without this the sidebar holds the
  // stale logged-out state it read on mount, so onboarding login looks ignored.
  useEffect(() => {
    const refresh = () => {
      try {
        setPlatformKey(localStorage.getItem('ava-ide-platform-key') || '');
        setEmail(getStoredEmail() || '');
        setTier(getStoredTier() || 'free');
      } catch { /* non-fatal */ }
    };
    window.addEventListener('ava-auth-changed', refresh);
    return () => window.removeEventListener('ava-auth-changed', refresh);
  }, []);

  const isConnected = platformKey.startsWith('sk-ava-');

  // Collapsed rail: just the avatar (or initial) at the bottom of the
  // narrow nav. Mirrors the extension NavSidebar's collapsed footer.
  if (collapsed) {
    const initial = (email || 'A')[0].toUpperCase();
    return (
      <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <Tooltip content={isConnected ? `${email} (${tier})` : 'Not connected — expand sidebar to sign in'} placement="top">
          <div
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: isConnected ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'rgba(49,34,68,0.5)',
              color: isConnected ? '#cba6f7' : '#6c7086',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, userSelect: 'none',
            }}
          >
            {initial}
          </div>
        </Tooltip>
      </div>
    );
  }

  // The nine BYOK providers Ava actually supports — mirrors the extension's
  // Settings PROVIDERS list. This was stuck at five, and because
  // buildModelCatalogue() derives `available` from the same set, Anthropic,
  // Xiaomi, Tencent and NVIDIA could never be used with a BYOK key at all: you
  // could hold a valid key and the models stayed greyed out. (MiniMax is
  // deliberately absent — it's retired.)
  //
  // `key` is the localStorage field in `ava-ide-byok` and MUST NOT change for
  // the original five, or existing saved keys are orphaned. `label` is display
  // only, and matches the extension's wording.
  const providers: Array<{ key: string; label: string }> = [
    { key: 'Anthropic', label: 'Anthropic (Claude)' },
    { key: 'DeepSeek', label: 'DeepSeek' },
    { key: 'Moonshot', label: 'Kimi (Moonshot)' },
    { key: 'Zhipu', label: 'GLM (Zhipu AI)' },
    { key: 'Qwen', label: 'Qwen (Alibaba)' },
    { key: 'Mistral', label: 'Mistral AI' },
    { key: 'Xiaomi', label: 'Xiaomi (MiMo)' },
    { key: 'Tencent', label: 'Tencent Hunyuan' },
    { key: 'NVIDIA', label: 'NVIDIA' },
  ];
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('ava-ide-byok'); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });

  const saveKey = (provider: string, value: string) => {
    const next = { ...keys, [provider]: value };
    setKeys(next);
    try { localStorage.setItem('ava-ide-byok', JSON.stringify(next)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('ava-byok-changed'));
  };

  const tierColors: Record<string, string> = {
    free: '#a6adc8', pro: 'var(--accent)', ultra: '#f9e2af', enterprise: '#89b4fa', admin: '#f38ba8',
  };

  // OAuth sign-in completed via SignInPanel — it persists the key to
  // localStorage + ~/.ava/config.json and dispatches `ava-auth-changed`
  // itself, so we just refresh our visible state and close the panel.
  const handleSignedIn = useCallback((account: { email?: string; tier?: string; name?: string }) => {
    try {
      const stored = localStorage.getItem('ava-ide-platform-key') || '';
      setPlatformKey(stored);
    } catch { /* non-fatal */ }
    if (account.email) setEmail(account.email);
    if (account.tier) setTier(account.tier);
    setShowConnect(false);
  }, [setPlatformKey, setEmail, setTier]);

  const handleDisconnect = () => {
    disconnectAccount();
    setPlatformKey('');
    setEmail('');
    setTier('free');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 28, background: 'rgba(49, 34, 68, 0.5)', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
    borderRadius: 4, padding: '0 8px', fontSize: 12, color: '#cdd6f4', outline: 'none',
  };

  return (
    <div style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', padding: '10px 12px' }}>
      {isConnected ? (
        <>
          {/* Connected state */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {(() => {
              const av = localStorage.getItem('ava-ide-user-avatar');
              return (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: av ? 'transparent' : 'linear-gradient(135deg, var(--accent), #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  {av ? (
                    <img src={av} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
              );
            })()}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#cdd6f4', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email || platformKey.slice(0, 12) + '...'}
              </div>
              <span style={{ fontSize: 9, fontWeight: 600, color: tierColors[tier] || '#a6e3a1', background: `${tierColors[tier] || '#a6e3a1'}18`, padding: '1px 6px', borderRadius: 3, textTransform: 'capitalize' as const }}>
                {tier}
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              style={{ background: 'transparent', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: 4, padding: '3px 8px', fontSize: 10, color: '#6c7086', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f38ba8'; e.currentTarget.style.color = '#f38ba8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 12%, transparent)'; e.currentTarget.style.color = '#6c7086'; }}
            >
              {t('dash.settings.disconnect')}
            </button>
          </div>

          {/* Platform / API Key toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {[{ key: 'Platform', labelKey: 'dash.auth.platform' }, { key: 'API Key', labelKey: 'dash.auth.api_key' }].map(({ key, labelKey }) => {
              const active = key === 'Platform' ? usePlatform : !usePlatform;
              return (
                <button key={key} onClick={() => {
                  const next = key === 'Platform';
                  setUsePlatform(next);
                  try { localStorage.setItem('ava-ide-use-platform', next ? '1' : '0'); } catch { /* */ }
                  // Re-init the sidecar so routing actually switches — mirrors the
                  // extension's set_provider_source -> session re-init. BYOK ('0')
                  // withholds the platform key so the persona team runs on the
                  // user's own model.
                  window.dispatchEvent(new Event('ava-ide-source-changed'));
                }}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: active ? 'var(--accent)' : 'rgba(49, 34, 68, 0.5)', color: active ? '#fff' : '#6c7086' }}>
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {!showConnect ? (
            <>
              <button
                onClick={() => setShowConnect(true)}
                style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', marginBottom: 6 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#9333ea'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
              >
                {t('dash.auth.connect')}
              </button>
              <div style={{ fontSize: 10, color: '#6c7086', textAlign: 'center', marginBottom: 8 }}>
                {t('dash.auth.byok_hint')}
              </div>
            </>
          ) : (
            <div style={{ marginBottom: 8 }}>
              <SignInPanel
                onSignedIn={handleSignedIn}
                onSkipAccount={() => setShowConnect(false)}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button onClick={() => setShowConnect(false)}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', background: 'transparent', color: '#6c7086', fontSize: 11, cursor: 'pointer' }}>
                  {t('dash.support.cancel')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* API Keys (BYOK) — always available */}
      <button
        onClick={() => setShowKeys(!showKeys)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', background: 'transparent', border: 'none', color: '#6c7086', fontSize: 11, cursor: 'pointer' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; }}
      >
        <span style={{ fontWeight: 600 }}>{t('dash.settings.section.api_keys')}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: showKeys ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {showKeys && (
        <div style={{ paddingTop: 6 }}>
          {providers.map((p) => (
            <div key={p.key} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 2 }}>{p.label}</div>
              <input type="password" placeholder={`${p.label} API key`} value={keys[p.key] || ''}
                onChange={(e) => saveKey(p.key, e.target.value)}
                style={{ ...inputStyle, height: 24, fontSize: 11 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 12%, transparent)'; }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Dashboard Panel ---------- */

/**
 * "Early Access" — shipped, usable, and still moving under your feet.
 *
 * Not a warning label and not an apology: it's the honest state of a surface that
 * works but hasn't settled. Telling someone up front costs nothing; letting them
 * find out by being surprised costs their trust.
 */
function EarlyAccessBadge() {
  useLocale();
  return (
    <span style={{
      flexShrink: 0,
      padding: '1px 5px',
      borderRadius: 4,
      border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
      color: 'var(--accent)',
      fontSize: 8,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      lineHeight: 1.5,
      whiteSpace: 'nowrap',
    }}>
      {t('dash.cc.early_access')}
    </span>
  );
}

// Flat nav — Phosphor duotone icons replacing the previous emoji glyphs.
// Same lineup the extension sidebar uses; identity-mapped one-to-one.
//
// `earlyAccess` marks the rooms that are shipped and usable but still evolving:
// Health & Nutrition, Learning, Creative Studio (and, in the mode picker, Desktop
// Automation). It's not a warning — it tells someone where a feature actually is
// in its development, which is exactly what we'd want to be told. Keep this in
// step with the extension's NavSidebar.
/**
 * Order + naming mirror the extension sidebar exactly (Health before Learning;
 * "Ava Chat", "Usage & History", extension descriptions).
 *
 * Labels are i18n KEYS resolved at render time, not strings. Holding resolved
 * text here would freeze it at module load — the nav would keep the language it
 * was first built in and never follow a locale change.
 */
const NAV_ITEMS: { id: string; Icon: PhIconType; labelKey: string; descKey: string; earlyAccess?: boolean }[] = [
  { id: 'command-centre',  Icon: PhCommand,  labelKey: 'dash.nav.command_centre',  descKey: 'dash.nav.command_centre_desc' },
  { id: 'ava-chat',        Icon: PhChat,     labelKey: 'dash.nav.ava_chat',        descKey: 'dash.nav.ava_chat_desc' },
  { id: 'planner',         Icon: PhPlanner,  labelKey: 'dash.nav.planner',         descKey: 'dash.nav.planner_desc' },
  { id: 'library',         Icon: PhLibrary,  labelKey: 'dash.nav.library',         descKey: 'dash.nav.library_desc' },
  { id: 'health',          Icon: PhHealth,   labelKey: 'dash.nav.health',          descKey: 'dash.nav.health_desc', earlyAccess: true },
  { id: 'learning',        Icon: PhLearning, labelKey: 'dash.nav.learning',        descKey: 'dash.nav.learning_desc', earlyAccess: true },
  { id: 'creative-studio', Icon: PhCreative, labelKey: 'dash.nav.creative_studio', descKey: 'dash.nav.creative_studio_desc', earlyAccess: true },
  { id: 'memory',          Icon: PhMemory,   labelKey: 'dash.nav.memory',          descKey: 'dash.nav.memory_desc' },
  { id: 'chat-history',    Icon: PhHistory,  labelKey: 'dash.nav.usage_history',   descKey: 'dash.nav.history_desc' },
  { id: 'account',         Icon: PhAccount,  labelKey: 'dash.nav.account',         descKey: 'dash.nav.account_desc' },
  { id: 'help',            Icon: PhHelp,     labelKey: 'dash.nav.help',            descKey: 'dash.nav.help_desc' },
];

function DashboardPanel({ onDashboardSelect, activePage, collapsed = false }: { onDashboardSelect?: (page: string) => void; activePage?: string | null; collapsed?: boolean }) {
  useLocale();
  const [, setAuthVersion] = useState(0);
  useEffect(() => {
    const handler = () => setAuthVersion(v => v + 1);
    window.addEventListener('ava-auth-changed', handler);
    return () => window.removeEventListener('ava-auth-changed', handler);
  }, []);

  // ── Collapsed icons-only rail ─────────────────────────────────────
  // Mirrors the extension NavSidebar's collapsed mode: 9 stacked icon
  // buttons centered in a narrow column with the label as a tooltip.
  // Active page gets a brighter colour + left accent so the user can
  // still see where they are without the label text.
  if (collapsed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', padding: '8px 0', gap: 2 }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', width: '100%' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <Tooltip key={item.id} content={`${t(item.labelKey)} — ${t(item.descKey)}`} placement="top">
              <button
                type="button"
                onClick={() => onDashboardSelect?.(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 36, height: 36, borderRadius: 8, border: 'none',
                  background: isActive ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
                  color: isActive ? '#cba6f7' : '#a6adc8',
                  cursor: 'pointer', position: 'relative',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseOver={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; e.currentTarget.style.color = '#cdd6f4'; } }}
                onMouseOut={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#a6adc8'; } }}
              >
                <item.Icon size={20} weight="duotone" />
                {item.id === 'help' && (() => {
                  try {
                    const count = Number(localStorage.getItem('ava-support-unread') || 0);
                    if (count > 0) return (
                      <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
                    );
                  } catch { /* */ }
                  return null;
                })()}
              </button>
              </Tooltip>
            );
          })}
        </div>
        {/* Auth shows as a single avatar at the bottom of the rail */}
        <AuthSection collapsed />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onDashboardSelect?.(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '7px 10px', borderRadius: 6, border: 'none',
                background: isActive ? 'rgba(49, 34, 68, 0.5)' : 'transparent',
                color: isActive ? '#cba6f7' : '#cdd6f4', cursor: 'pointer',
                fontSize: 13, textAlign: 'left', transition: 'background 0.15s',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
              onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', color: isActive ? '#cba6f7' : '#a6adc8' }}>
                <item.Icon size={20} weight="duotone" />
                {item.id === 'help' && (() => {
                  try {
                    const count = Number(localStorage.getItem('ava-support-unread') || 0);
                    if (count > 0) return (
                      <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{count}</span>
                    );
                  } catch { /* */ }
                  return null;
                })()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 500, fontSize: 12 }}>{t(item.labelKey)}</span>
                  {item.earlyAccess && <EarlyAccessBadge />}
                </div>
                <div style={{ fontSize: 10, color: '#585b70', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(item.descKey)}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Auth section moved out of this panel — now renders below the
          SidebarCalendar in the main Sidebar return so the calendar sits
          directly under the nav items and the account / billing footer
          anchors the very bottom of the rail. */}
    </div>
  );
}

export default function Sidebar({ activePanel, position = 'left', onTogglePosition, onToggleCollapse, onDashboardSelect, activeDashboardPage, onFileOpen, collapsed = false }: Props) {
  // Collapsed mode: render the icons-only dashboard rail and skip the
  // header/resizer entirely. Other panels (Explorer / Search / Git etc.)
  // have no icon shorthand so they render nothing in collapsed mode —
  // the user re-clicks the activity icon to expand.
  if (collapsed) {
    if (activePanel !== 'dashboard') return null;
    const RAIL_WIDTH = 56;
    return (
      <div style={{
        position: 'relative',
        width: RAIL_WIDTH, height: '100%', flexShrink: 0,
        background: '#181028', borderRight: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Expand — the SAME handle, in the SAME place, as the collapse control on
            the expanded panel. There was no expand control here at all: once you
            collapsed, the only way back was the activity bar. */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={t('dash.sidebar.expand')}
            style={{
              position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 20,
              [position === 'left' ? 'right' : 'left']: 0,
              width: 14, height: 56,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(30, 30, 46, 0.9)',
              border: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)',
              [position === 'left' ? 'borderRight' : 'borderLeft']: 'none',
              borderRadius: position === 'left' ? '4px 0 0 4px' : '0 4px 4px 0',
              color: '#6c7086', cursor: 'pointer', padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#cdd6f4'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6c7086'; }}
          >
            {position === 'left'
              ? <PhCaretRight size={11} weight="bold" />
              : <PhCaretLeft size={11} weight="bold" />}
          </button>
        )}
        <DashboardPanel collapsed onDashboardSelect={onDashboardSelect} activePage={activeDashboardPage} />
      </div>
    );
  }

  const panels: Record<ActivityItem, (props?: { onDashboardSelect?: (page: string) => void }) => ReactNode> = {
    explorer: () => <ExplorerPanel onFileOpen={onFileOpen} />,
    search: () => <SearchPanel onFileOpen={onFileOpen} />,
    git: () => <GitPanel onFileOpen={onFileOpen} />,
    ava: AvaPanel,
    extensions: ExtensionsPanel,
    debug: DebugPanel,
    dashboard: () => <DashboardPanel onDashboardSelect={onDashboardSelect} activePage={activeDashboardPage} />,
  };

  const Panel = panels[activePanel];

  // Resizable sidebar width — persisted
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('ava-ide-sidebar-width');
    return saved ? Math.max(180, Math.min(450, Number(saved))) : 260;
  });
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(260);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;

    const isRight = position === 'right';

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const newWidth = Math.max(180, Math.min(450, dragStartWidth.current + (isRight ? -delta : delta)));
      setSidebarWidth(newWidth);
    };

    const onUp = () => {
      isDragging.current = false;
      localStorage.setItem('ava-ide-sidebar-width', String(sidebarWidth));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth, position]);

  useEffect(() => {
    localStorage.setItem('ava-ide-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);

  return (
    <div
      style={{
        width: sidebarWidth,
        background: 'rgba(15, 10, 26, 0.95)',
        borderRight: position === 'left' ? '1px solid color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
        borderLeft: position === 'right' ? '1px solid color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          position: 'absolute', top: 0, bottom: 0, width: 4, zIndex: 10,
          cursor: 'col-resize',
          [position === 'left' ? 'right' : 'left']: 0,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 30%, transparent)')}
        onMouseLeave={e => { if (!isDragging.current) e.currentTarget.style.background = 'transparent'; }}
      />

      {/* Collapse — a handle on the border facing the content, halfway down.
          Sits INSIDE the edge because the panel clips its overflow. The arrow
          points the way the panel will actually go: left when docked left, right
          when flipped. Mirrors the extension. */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          title={t('dash.sidebar.collapse')}
          style={{
            position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 20,
            [position === 'left' ? 'right' : 'left']: 0,
            width: 14, height: 56,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(30, 30, 46, 0.9)',
            border: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)',
            [position === 'left' ? 'borderRight' : 'borderLeft']: 'none',
            borderRadius: position === 'left' ? '4px 0 0 4px' : '0 4px 4px 0',
            color: '#6c7086', cursor: 'pointer', padding: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#cdd6f4'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6c7086'; }}
        >
          {position === 'left'
            ? <PhCaretLeft size={11} weight="bold" />
            : <PhCaretRight size={11} weight="bold" />}
        </button>
      )}

      {/* Header */}
      <div
        style={{
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {getPanelTitle(activePanel)}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {onTogglePosition && (
            <Tooltip content={`Move sidebar to ${position === 'left' ? 'right' : 'left'}`} placement="bottom">
              <button
                onClick={onTogglePosition}
                style={{
                  width: 22, height: 22, background: 'transparent', border: 'none',
                  color: '#6c7086', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, padding: 0,
                }}
                onMouseOver={(e) => e.currentTarget.style.color = '#cdd6f4'}
                onMouseOut={(e) => e.currentTarget.style.color = '#6c7086'}
              >
                {/* Phosphor duotone, same pack as the nav below. It used to be the
                    PANEL glyph — which is the icon the extension used for COLLAPSE.
                    Same picture, two meanings, across two surfaces. */}
                <PhFlip size={15} weight="duotone" />
              </button>
            </Tooltip>
          )}
        <button
          style={{
            width: 22,
            height: 22,
            background: 'transparent',
            border: 'none',
            color: '#6c7086',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#cdd6f4'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6c7086'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Panel />
      </div>

      {/* Mini Calendar — always visible */}
      <SidebarCalendar onDashboardSelect={onDashboardSelect} />

      {/* Auth + BYOK section — anchored at the very bottom of the rail,
          below the calendar. Only shown when the dashboard panel is the
          active surface; the file-tree / search / git panels don't need
          the account footer. */}
      {activePanel === 'dashboard' && <AuthSection />}
    </div>
  );
}

/* ── Sidebar Calendar ──────────────────────────────────────────────────── */

function SidebarCalendar({ onDashboardSelect }: { onDashboardSelect?: (page: string) => void }) {
  useLocale(); // re-render on locale change; `t` is a direct import
  const [monthOffset, setMonthOffset] = useState(0);
  const [taskDates, setTaskDates] = useState<Set<string>>(new Set());
  const [planMarks, setPlanMarks] = useState<Map<string, { training: boolean; meals: boolean }>>(new Map());
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('ava.ideSidebarCalCollapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () => setCollapsed(c => {
    const next = !c;
    try { localStorage.setItem('ava.ideSidebarCalCollapsed', next ? '1' : '0'); } catch { /* */ }
    return next;
  });

  // Plan dots — load summaries once and mark training (accent) / meals
  // (amber), matching the Plans calendar.
  useEffect(() => {
    loadHealthPlanIndex().then(plans => {
      const map = new Map<string, { training: boolean; meals: boolean }>();
      for (const p of plans) {
        if (!p.start_date) continue;
        const start = new Date(`${p.start_date}T00:00:00`);
        if (isNaN(start.getTime())) continue;
        const training = p.type === 'fitness' || p.type === 'combined';
        const meals = p.type === 'meal' || p.type === 'combined';
        for (let i = 0; i < p.duration_days; i++) {
          const d = new Date(start); d.setDate(d.getDate() + i);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const prev = map.get(key) ?? { training: false, meals: false };
          map.set(key, { training: prev.training || training, meals: prev.meals || meals });
        }
      }
      setPlanMarks(map);
    }).catch(() => {});
  }, []);

  // Fetch task dates
  useEffect(() => {
    if (!isConnected()) {
      try {
        const raw = localStorage.getItem('ava-ide-tasks');
        if (raw) {
          const tasks = JSON.parse(raw);
          const dates = new Set<string>();
          for (const t of (Array.isArray(tasks) ? tasks : tasks?.tasks || [])) {
            if (t.due_date && t.status !== 'done' && !t.done) dates.add(t.due_date.slice(0, 10));
          }
          setTaskDates(dates);
        }
      } catch { /* */ }
      return;
    }
    apiFetch('/tasks?status=todo,in-progress').then((data: any) => {
      const list = Array.isArray(data) ? data : data?.tasks || data?.data || [];
      const dates = new Set<string>();
      for (const t of list) {
        if (t.due_date) dates.add(t.due_date.slice(0, 10));
      }
      setTaskDates(dates);
    }).catch(() => {});
  }, [monthOffset]);

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const month = target.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const label = target.toLocaleDateString(getLocale(), { month: 'short', year: 'numeric' });
  const todayStr = now.toISOString().slice(0, 10);
  // Narrow weekday initials in the user's language, Sunday-first to match the
  // grid (firstDay = getDay(), 0 = Sunday). Jan 1 2023 was a Sunday.
  const weekdayNarrow = Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, 1 + i).toLocaleDateString(getLocale(), { weekday: 'narrow' }));

  if (collapsed) {
    return (
      <div style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', padding: '10px 14px', flexShrink: 0 }}>
        <button onClick={toggleCollapsed} title={t('dash.sidebar.show_calendar')} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', color: '#a6adc8' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 600 }}>{now.getDate()}</span>
            <span style={{ fontSize: 11 }}>{now.toLocaleDateString(getLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          </span>
          <span style={{ fontSize: 9, color: '#6c7086' }}>{'▼'}</span>
        </button>
      </div>
    );
  }

  function handleDayClick(day: number) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'tasks' }));
    window.dispatchEvent(new CustomEvent('ava-task-date-selected', { detail: iso }));
    onDashboardSelect?.('tasks');
  }

  return (
    <div style={{
      borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
      padding: '10px 14px',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 10, padding: 2 }}>{'\u25C0'}</button>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#a6adc8' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setMonthOffset(o => o + 1)} style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 10, padding: 2 }}>{'\u25B6'}</button>
          <button onClick={toggleCollapsed} title={t('dash.sidebar.hide_calendar')} style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', fontSize: 9, padding: 2 }}>{'\u25B2'}</button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4, fontSize: 7, color: '#6c7086' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />{t('dash.sidebar.legend_training')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f59e0b' }} />{t('dash.sidebar.legend_meals')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#38bdf8' }} />{t('dash.sidebar.legend_tasks')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, textAlign: 'center', marginBottom: 2 }}>
        {weekdayNarrow.map((d, i) => (
          <span key={i} style={{ fontSize: 8, color: '#45475a', fontWeight: 600 }}>{d}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {days.map(day => {
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = iso === todayStr;
          const mk = planMarks.get(iso);
          const dots: string[] = [];
          if (mk?.training) dots.push('var(--accent)');
          if (mk?.meals) dots.push('#f59e0b');
          if (taskDates.has(iso)) dots.push('#38bdf8');
          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              style={{
                width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: isToday ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'transparent',
                color: isToday ? 'var(--accent)' : '#a6adc8',
                fontSize: 9, fontWeight: isToday ? 600 : 400,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}
            >
              {day}
              {dots.length > 0 && (
                <span style={{ position: 'absolute', bottom: 1, display: 'flex', gap: 1 }}>
                  {dots.map((c, di) => <span key={di} style={{ width: 4, height: 4, borderRadius: '50%', background: c }} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
