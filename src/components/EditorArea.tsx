import {
  CommandCentrePage,
  AvaChatPage,
  ChatHistoryPage,
  MemoryPage,
  TasksPage,
  JournalPage,
  LearningPage,
  LearningLibraryPage,
  CreativeStudioPage,
  LibraryPage,
  PersonalityPage,
  CloudSyncPage,
  UsagePage,
  BillingPage,
  SettingsPage,
  ConnectionsPage,
  SupportPage,
  ReleaseNotesPage,
  RoadmapPage,
  PlannerPage,
  AccountPage,
  HelpPage,
} from './DashboardPages';
import { DocumentationPage } from './DocumentationPage';
import { HealthPage } from './HealthPage';
import { useState, useEffect } from 'react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  | 'learning-library'
  | 'creative-studio'
  | 'library'
  | 'health'
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
  'learning-library': '\uD83D\uDCDA',
  'creative-studio': '\uD83C\uDFA8',
  'library': '\uD83D\uDDBC\uFE0F',
  'health': '\uD83C\uDFCB\uFE0F',
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
  'learning-library': 'dash.nav.learning_library',
  'creative-studio': 'dash.nav.creative_studio',
  'library': 'dash.nav.library',
  'health': 'dash.nav.health',
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
  'learning-library': LearningLibraryPage,
  'creative-studio': CreativeStudioPage,
  'library': LibraryPage,
  'health': HealthPage,
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

// Basic syntax token colours by extension
const KEYWORD_COLORS: Record<string, { keywords: RegExp; strings: RegExp; comments: RegExp; types?: RegExp }> = {
  cpp: {
    keywords: /\b(if|else|for|while|return|class|struct|public|private|protected|virtual|override|const|static|void|int|float|double|bool|char|auto|nullptr|new|delete|this|true|false|include|define|pragma)\b/g,
    strings: /(["'])(?:(?=(\\?))\2.)*?\1/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    types: /\b(FString|FVector|FRotator|AActor|UObject|UPROPERTY|UFUNCTION|UCLASS|USTRUCT|UENUM|TArray|TMap|TSubclassOf|int32|uint8|FName|FText|EInputActionValueType)\b/g,
  },
  ts: {
    keywords: /\b(import|export|from|const|let|var|function|return|if|else|for|while|class|interface|type|extends|implements|new|this|async|await|try|catch|throw|typeof|instanceof|default|switch|case|break|continue|true|false|null|undefined|void)\b/g,
    strings: /(["'`])(?:(?=(\\?))\2.)*?\1/g,
    comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm,
    types: /\b(string|number|boolean|any|never|unknown|Record|Array|Promise|Partial|Omit|Pick)\b/g,
  },
  py: {
    keywords: /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|in|not|and|or|is|True|False|None|self|lambda|yield|raise|pass|break|continue)\b/g,
    strings: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
    comments: /(#.*$)/gm,
  },
};

// Map file extensions to syntax rules
function getSyntax(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (['cpp', 'cc', 'cxx', 'c', 'h', 'hpp'].includes(ext)) return KEYWORD_COLORS.cpp;
  if (['ts', 'tsx', 'js', 'jsx', 'mjs'].includes(ext)) return KEYWORD_COLORS.ts;
  if (['py', 'pyw'].includes(ext)) return KEYWORD_COLORS.py;
  return null;
}

function highlightLine(line: string, syntax: typeof KEYWORD_COLORS['cpp'] | null): React.ReactNode {
  if (!syntax) return line;

  // Comments take priority
  const commentMatch = line.match(/^(\s*)(\/\/.*|#.*)$/);
  if (commentMatch) {
    return <>{commentMatch[1]}<span style={{ color: '#6c7086', fontStyle: 'italic' }}>{commentMatch[2]}</span></>;
  }

  // Simple token-based highlighting (not perfect, but good enough)
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  while (remaining.length > 0) {
    let earliest = { idx: remaining.length, len: 0, color: '', match: '' };

    // Check strings
    const strMatch = remaining.match(syntax.strings);
    if (strMatch) {
      const idx = remaining.indexOf(strMatch[0]);
      if (idx < earliest.idx) earliest = { idx, len: strMatch[0].length, color: '#a6e3a1', match: strMatch[0] };
    }

    // Check keywords
    const kwMatch = remaining.match(syntax.keywords);
    if (kwMatch) {
      const idx = remaining.indexOf(kwMatch[0]);
      if (idx < earliest.idx) earliest = { idx, len: kwMatch[0].length, color: '#cba6f7', match: kwMatch[0] };
    }

    // Check types
    if (syntax.types) {
      const tyMatch = remaining.match(syntax.types);
      if (tyMatch) {
        const idx = remaining.indexOf(tyMatch[0]);
        if (idx < earliest.idx) earliest = { idx, len: tyMatch[0].length, color: '#89b4fa', match: tyMatch[0] };
      }
    }

    if (earliest.idx === remaining.length) {
      parts.push(remaining);
      break;
    }

    if (earliest.idx > 0) parts.push(remaining.slice(0, earliest.idx));
    parts.push(<span key={key++} style={{ color: earliest.color }}>{earliest.match}</span>);
    remaining = remaining.slice(earliest.idx + earliest.len);
  }

  return <>{parts}</>;
}

// Lift authoring front-matter / ::: directives so the preview reads cleanly.
function stripAuthoring(md: string): string {
  const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(md);
  let title = '';
  if (fm) {
    const tm = /^title:[ \t]*(.+)$/m.exec(fm[1]);
    if (tm) title = tm[1].trim().replace(/^["']|["']$/g, '');
    md = md.slice(fm[0].length);
  }
  md = md.replace(/^:::[ \t]*pagebreak[ \t]*$/gim, '\n---\n');
  md = md.replace(/^:::[ \t]*(\w+)(?:\{([^}]*)\})?[ \t]*\r?\n([\s\S]*?)\r?\n:::[ \t]*$/gim, (_m, variant: string, attrs: string, inner: string) => {
    const tm = /title="([^"]*)"/.exec(attrs || '');
    const label = tm ? tm[1] : variant.charAt(0).toUpperCase() + variant.slice(1);
    return `> **${label}**\n${inner.split(/\r?\n/).map(l => '> ' + l).join('\n')}`;
  });
  md = md.replace(/^:::[ \t]*$/gim, '');
  return title ? `# ${title}\n\n${md}` : md;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const MD_COMPONENTS: Record<string, any> = {
  h1: (p: any) => <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', margin: '0 0 14px', lineHeight: 1.25 }}>{p.children}</h1>,
  h2: (p: any) => <h2 style={{ fontSize: 19, fontWeight: 600, color: '#cba6f7', margin: '26px 0 10px', paddingBottom: 6, borderBottom: '1px solid rgba(168,85,247,0.15)' }}>{p.children}</h2>,
  h3: (p: any) => <h3 style={{ fontSize: 16, fontWeight: 600, color: '#cdd6f4', margin: '20px 0 8px' }}>{p.children}</h3>,
  h4: (p: any) => <h4 style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', margin: '16px 0 6px' }}>{p.children}</h4>,
  p: (p: any) => <p style={{ margin: '0 0 12px' }}>{p.children}</p>,
  ul: (p: any) => <ul style={{ margin: '0 0 12px', paddingLeft: 22 }}>{p.children}</ul>,
  ol: (p: any) => <ol style={{ margin: '0 0 12px', paddingLeft: 22 }}>{p.children}</ol>,
  li: (p: any) => <li style={{ margin: '4px 0' }}>{p.children}</li>,
  a: (p: any) => <a href={p.href} target="_blank" rel="noreferrer" style={{ color: '#89b4fa', textDecoration: 'none' }}>{p.children}</a>,
  strong: (p: any) => <strong style={{ fontWeight: 700, color: '#fff' }}>{p.children}</strong>,
  em: (p: any) => <em style={{ fontStyle: 'italic' }}>{p.children}</em>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(168,85,247,0.18)', margin: '20px 0' }} />,
  blockquote: (p: any) => <blockquote style={{ borderLeft: '3px solid #7c3aed', margin: '12px 0', padding: '4px 14px', color: '#bac2de' }}>{p.children}</blockquote>,
  code: ({ className, children, ...rest }: any) =>
    /language-/.test(className || '')
      ? <code className={className} style={{ fontFamily: 'Consolas, monospace', fontSize: 12.5 }} {...rest}>{children}</code>
      : <code style={{ background: 'rgba(168,85,247,0.12)', padding: '2px 6px', borderRadius: 4, fontSize: 12.5, fontFamily: 'Consolas, monospace' }} {...rest}>{children}</code>,
  pre: (p: any) => <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(168,85,247,0.14)', borderRadius: 6, padding: 12, overflow: 'auto', margin: '0 0 12px' }}>{p.children}</pre>,
  table: (p: any) => <table style={{ borderCollapse: 'collapse', width: '100%', margin: '0 0 14px', fontSize: 13 }}>{p.children}</table>,
  th: (p: any) => <th style={{ border: '1px solid rgba(168,85,247,0.2)', padding: '6px 10px', textAlign: 'left', background: 'rgba(168,85,247,0.08)', fontWeight: 600 }}>{p.children}</th>,
  td: (p: any) => <td style={{ border: '1px solid rgba(168,85,247,0.15)', padding: '6px 10px' }}>{p.children}</td>,
  img: (p: any) => <img src={p.src} alt={p.alt} style={{ maxWidth: '100%', borderRadius: 6, margin: '8px 0' }} />,
};

function MdToggle({ mode, onMode }: { mode: 'preview' | 'source'; onMode: (m: 'preview' | 'source') => void }) {
  const btn = (m: 'preview' | 'source', label: string) => (
    <button type="button" onClick={() => onMode(m)} style={{
      padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 5,
      border: `1px solid ${mode === m ? 'rgba(168,85,247,0.5)' : 'rgba(168,85,247,0.15)'}`,
      background: mode === m ? 'rgba(168,85,247,0.18)' : 'transparent',
      color: mode === m ? '#cdd6f4' : '#6c7086',
    }}>{label}</button>
  );
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'flex-end', gap: 4, padding: '6px 10px', background: 'rgba(15,10,26,0.85)', borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
      {btn('preview', 'Preview')}
      {btn('source', 'Source')}
    </div>
  );
}

function FileViewer({ path }: { path: string }) {
  const [content, setContent] = useState<string>('Loading...');
  const [error, setError] = useState(false);
  const isMarkdown = /\.(md|markdown)$/i.test(path);
  const [mdMode, setMdMode] = useState<'preview' | 'source'>('preview');

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

  // Rendered markdown preview (the document authoring view).
  if (isMarkdown && mdMode === 'preview') {
    return (
      <div style={{ flex: 1, overflow: 'auto', background: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)' }}>
        <MdToggle mode={mdMode} onMode={setMdMode} />
        <div style={{ maxWidth: 740, margin: '0 auto', padding: '28px 26px', color: '#cdd6f4', fontSize: 14, lineHeight: 1.7 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{stripAuthoring(content)}</ReactMarkdown>
        </div>
      </div>
    );
  }

  const lines = content.split('\n');
  const gutterWidth = String(lines.length).length * 9 + 20;
  const syntax = getSyntax(path);

  return (
    <div style={{
      flex: 1, overflow: 'auto',
      background: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)',
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      fontSize: 13, lineHeight: '20px', tabSize: 4,
    }}>
      {isMarkdown && <MdToggle mode={mdMode} onMode={setMdMode} />}
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', minHeight: 20 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{
            width: gutterWidth, minWidth: gutterWidth, textAlign: 'right', paddingRight: 16,
            color: '#45475a', userSelect: 'none', flexShrink: 0,
          }}>
            {i + 1}
          </span>
          <span style={{ color: '#cdd6f4', whiteSpace: 'pre', flex: 1 }}>
            {highlightLine(line, syntax)}
          </span>
        </div>
      ))}
    </div>
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
