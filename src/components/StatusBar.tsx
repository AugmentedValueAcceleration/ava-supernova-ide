import { useEffect, useState } from 'react';
import { APP_VERSION } from './UpdateChecker';
import { t, useLocale } from '../lib/i18n';
import { Tooltip } from './Tooltip';
import { ensureSidecarLog, getSidecarLog, subscribeSidecarLog } from '../lib/sidecar-log';

/**
 * The status bar used to be a mock-up.
 *
 * The branch was the literal string 'main' — it had never read git, so it sat
 * there saying "main" while the operator was on `development`. The error and
 * warning counts were hardcoded zeros. Language was always "TypeScript",
 * encoding always "UTF-8", and the caret was always "Ln 1, Col 1".
 *
 * A coding tool that states the wrong branch with total confidence is worse
 * than one that states nothing, because you believe it right up until you
 * commit to the wrong place. So everything here is now either REAL or GONE:
 *
 *   repo + branch  — real, read from git in the project folder
 *   errors         — real, the same sidecar log the Problems panel shows
 *   language       — real, from the open file's extension
 *   encoding       — shown only while a file is open, which is when it is true
 *   warnings       — REMOVED: the log has info/tool/error and no warning level,
 *                    so nothing could populate it
 *   Ln, Col        — REMOVED: the editor is a read-only viewer with no caret.
 *                    It comes back when the editor can edit, and not before.
 */

interface Props {
  onToggleTerminal: () => void;
  mode: string;
  onCycleMode?: () => void;
  gitInfo?: { repo: string | null; branch: string | null; isRepo: boolean } | null;
  activeFilePath?: string | null;
}

const MODE_SYMBOLS: Record<string, string> = {
  Work: '>>', Plan: '::', Chat: '..', Teach: '??', Security: '!!', Brainstorm: '**',
};

/** The label VS Code would show for this file. Extension only — no sniffing. */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript JSX', js: 'JavaScript', jsx: 'JavaScript JSX',
  mjs: 'JavaScript', cjs: 'JavaScript', json: 'JSON', md: 'Markdown', mdx: 'MDX',
  css: 'CSS', scss: 'SCSS', html: 'HTML', rs: 'Rust', py: 'Python', go: 'Go',
  java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', cs: 'C#', c: 'C', h: 'C',
  cpp: 'C++', hpp: 'C++', swift: 'Swift', sh: 'Shell', bash: 'Shell', ps1: 'PowerShell',
  yml: 'YAML', yaml: 'YAML', toml: 'TOML', xml: 'XML', sql: 'SQL', lua: 'Lua',
  svelte: 'Svelte', vue: 'Vue', dart: 'Dart', ini: 'INI', env: 'Env',
};

function languageFor(path?: string | null): string | null {
  if (!path) return null;
  const base = path.split(/[\\/]/).pop() || '';
  if (!base.includes('.')) return null;
  const ext = base.split('.').pop()!.toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? ext.toUpperCase();
}

export default function StatusBar({ onToggleTerminal, mode, onCycleMode, gitInfo, activeFilePath }: Props) {
  useLocale();

  // Errors, from the one place that actually has any: the sidecar log, which
  // is exactly what the Problems panel renders. Subscribed rather than polled
  // so the count cannot drift from the panel.
  const [errorCount, setErrorCount] = useState(0);
  useEffect(() => {
    ensureSidecarLog();
    const recount = () => setErrorCount(getSidecarLog().filter((e) => e.level === 'error').length);
    recount();
    return subscribeSidecarLog(recount);
  }, []);

  const language = languageFor(activeFilePath);
  return (
    <div
      style={{
        height: 24,
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Left section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Version */}
        <Tooltip content={t('dash.status.check_updates')} placement="top">
          <span
            onClick={() => window.dispatchEvent(new CustomEvent('ava-check-updates'))}
            style={{ fontSize: 11, color: '#fff', cursor: 'pointer', fontWeight: 500, opacity: 0.9 }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.9'; }}
          >
            v{APP_VERSION}
          </span>
        </Tooltip>

        {/* Repository — the name, then the branch, the way VS Code reads.
            Rendered only once git has answered: no folder, or a folder that is
            not a repo, shows less rather than guessing. */}
        {gitInfo?.repo && (
          <Tooltip content={gitInfo.isRepo ? t('dash.status.repo_branch', { repo: gitInfo.repo, branch: gitInfo.branch ?? '' }) : gitInfo.repo} placement="top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                </svg>
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 500 }}>{gitInfo.repo}</span>
              </div>
              {gitInfo.isRepo && gitInfo.branch && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 01-9 9" />
                  </svg>
                  <span style={{ fontSize: 11, color: '#fff', fontWeight: 500 }}>{gitInfo.branch}</span>
                </div>
              )}
            </div>
          </Tooltip>
        )}

        {/* Errors. There is no warning counter beside it: the sidecar log has
            info / tool / error and no warning level, so a warning count could
            only ever have been the zero it was hardcoded to. Clicking opens
            the Problems panel, which lists the very same entries. */}
        <Tooltip content={t('dash.status.errors', { count: errorCount })} placement="top">
          <div
            onClick={onToggleTerminal}
            style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span style={{ fontSize: 11, color: '#fff' }}>{errorCount}</span>
          </div>
        </Tooltip>
      </div>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Ava mode — click to cycle */}
        <Tooltip content={t('dash.status.cycle_mode', { mode })} placement="top">
          <div
            onClick={onCycleMode}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.15)',
              padding: '1px 8px',
              borderRadius: 3,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>
              {MODE_SYMBOLS[mode] || '>>'} {mode}
            </span>
          </div>
        </Tooltip>

        {/* Language and encoding describe the OPEN FILE, so they appear only
            when one is open. They used to read "TypeScript" and "UTF-8" over
            an empty editor, which is a statement about nothing.

            There is no "Ln 1, Col 1" any more. The editor is a read-only
            viewer — no caret exists to report — so the old one was decoration
            that could never become true. It belongs back here the day the
            editor can edit, reading from the real selection and not before. */}
        {language && (
          <span style={{ fontSize: 11, color: '#fff' }}>{language}</span>
        )}
        {activeFilePath && (
          <span style={{ fontSize: 11, color: '#fff' }}>UTF-8</span>
        )}

        {/* Terminal toggle */}
        <button
          onClick={onToggleTerminal}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
