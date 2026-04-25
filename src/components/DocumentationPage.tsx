// Documentation page for the desktop IDE. Renders the canonical corpus from @ava/core/docs
// through a RendererAdapter<React.ReactNode> using the IDE's Catppuccin-ish inline-style palette.
// Sidebar is scroll-anchored (matches the extension). Audience toggle collapses power-only pages.

import React, { useMemo, useState } from 'react';
import {
  type RendererAdapter,
  type DocBlock,
  type DocPage,
  type FactsData,
  TOOLS,
  CATEGORY_LABELS,
  PROVIDERS,
  MODES,
  PERSONAS,
  PERMISSION_MODES,
  PERMISSION_LABELS,
  SHORTCUTS,
  filterBySurface,
  filterByAudience,
  buildSidebar,
  anchorFor,
  getPages,
} from '@ava/core/docs';

// ── Palette (matches DashboardPages.tsx) ────────────────────────────────────

const ACCENT = '#a855f7';
const HEADING = '#cdd6f4';
const TEXT = '#a6adc8';
const MUTED = '#6c7086';
const CARD = 'rgba(26, 16, 40, 0.6)';
const BORDER = 'rgba(168, 85, 247, 0.12)';

// ── Adapter ─────────────────────────────────────────────────────────────────

function makeAdapter(): RendererAdapter<React.ReactNode> {
  let keySeed = 0;
  const k = () => `k${++keySeed}`;

  return {
    paragraph: (text) => <p key={k()} style={{ color: TEXT, lineHeight: 1.7, marginBottom: 10 }}>{text}</p>,

    heading: (level, text, anchor) => {
      const style: React.CSSProperties = level === 2
        ? { fontSize: 18, fontWeight: 600, color: HEADING, marginTop: 20, marginBottom: 12 }
        : level === 3
          ? { fontSize: 14, fontWeight: 600, color: HEADING, marginTop: 16, marginBottom: 6 }
          : { fontSize: 12, fontWeight: 600, color: ACCENT, marginTop: 12, marginBottom: 4 };
      const Tag = `h${level}` as const;
      return <Tag key={k()} id={anchor} style={style}>{text}</Tag>;
    },

    list: (items, ordered) => {
      const Tag = ordered ? 'ol' : 'ul';
      return (
        <Tag key={k()} style={{ color: TEXT, fontSize: 13, lineHeight: 1.8, paddingLeft: 20, margin: '8px 0 12px 0' }}>
          {items.map((i, idx) => <li key={idx} style={{ marginBottom: 4 }}>{i}</li>)}
        </Tag>
      );
    },

    code: (text) => (
      <pre key={k()} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 12px', fontSize: 12, color: TEXT, overflowX: 'auto', margin: '8px 0' }}>
        <code>{text}</code>
      </pre>
    ),

    callout: (text, variant) => {
      const colour = variant === 'warning' ? '#f9a825' : variant === 'tip' ? '#a6e3a1' : ACCENT;
      const label = variant === 'tip' ? 'Tip' : variant === 'warning' ? 'Warning' : 'Note';
      return (
        <div key={k()} style={{ borderLeft: `3px solid ${colour}`, background: CARD, padding: '10px 14px', margin: '12px 0', borderRadius: 4, fontSize: 12, color: TEXT }}>
          <strong style={{ color: colour }}>{label}:</strong> {text}
        </div>
      );
    },

    link: (text, href, external) => (
      <a key={k()} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} style={{ color: ACCENT, textDecoration: 'none' }}>
        {text}
      </a>
    ),

    tools: (items) => {
      const grouped = groupBy(items, t => t.category);
      return (
        <div key={k()}>
          {Array.from(grouped.entries()).map(([cat, tools]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 6 }}>{CATEGORY_LABELS[cat]}</div>
              <FactsTable headers={['Tool', 'Risk', 'What it does']} rows={tools.sort((a, b) => a.name.localeCompare(b.name)).map(t => [
                <code key="n" style={{ background: CARD, padding: '1px 5px', borderRadius: 3 }}>{t.name}</code>,
                <RiskPill key="r" risk={t.risk} />,
                <span key="d">{t.description}</span>,
              ])} />
            </div>
          ))}
        </div>
      );
    },

    providers: (items) => (
      <div key={k()}>
        {items.map(p => (
          <div key={p.id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: HEADING, marginBottom: 4 }}>
              {p.name}{p.notes ? <span style={{ color: MUTED, fontSize: 11, fontWeight: 400 }}> — {p.notes}</span> : null}
            </div>
            <FactsTable headers={['Model', 'Context', 'Input / Output per 1M', 'Capabilities']} rows={p.models.map(m => {
              const price = m.inputPricePerM === 0 && m.outputPricePerM === 0
                ? 'Free'
                : `$${m.inputPricePerM.toFixed(2)} / $${m.outputPricePerM.toFixed(2)}`;
              return [
                <span key="n">{m.displayName}</span>,
                <span key="c">{formatContext(m.contextWindow)}</span>,
                <span key="p">{price}</span>,
                <span key="cap">{m.capabilities.map((c, i) => <Pill key={i}>{c}</Pill>)}</span>,
              ];
            })} />
          </div>
        ))}
      </div>
    ),

    modes: (items) => (
      <FactsTable key={k()} headers={['Prefix', 'Mode', 'Mindset', 'Summary']} rows={items.map(m => [
        <code key="p" style={{ background: CARD, padding: '1px 5px', borderRadius: 3, color: ACCENT }}>{m.prefix}</code>,
        <strong key="n" style={{ color: HEADING }}>{m.displayName}</strong>,
        <span key="m">{m.mindset}</span>,
        <span key="s" style={{ color: MUTED }}>{m.summary}</span>,
      ])} />
    ),

    personas: (items) => {
      const grouped = groupBy(items, p => p.mode);
      return (
        <div key={k()}>
          {Array.from(grouped.entries()).map(([mode, personas]) => (
            <div key={mode} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 6, textTransform: 'capitalize' }}>{mode} team</div>
              <ol style={{ color: TEXT, fontSize: 13, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
                {personas.sort((a, b) => a.order - b.order).map(p => (
                  <li key={p.id}><strong style={{ color: HEADING }}>{p.name}</strong> — {p.role}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      );
    },

    permissions: (items) => {
      const categories = Object.keys(items[0].categories) as Array<keyof typeof items[0]['categories']>;
      const headers = ['Category', ...items.map(m => m.displayName)];
      const rows = categories.map<React.ReactNode[]>(cat => [
        <strong key="c" style={{ color: HEADING }}>{(CATEGORY_LABELS as Record<string, string>)[cat] ?? String(cat)}</strong>,
        ...items.map(m => <PermPill key={m.id} perm={m.categories[cat]} />),
      ]);
      rows.push([
        <span key="sum"></span>,
        ...items.map(m => <span key={m.id} style={{ color: MUTED, fontSize: 11 }}>{m.summary}</span>),
      ]);
      return <FactsTable key={k()} headers={headers} rows={rows} />;
    },

    shortcuts: (items) => (
      <FactsTable key={k()} headers={['Action', 'Windows / macOS', 'Surface', 'Description']} rows={items.map(s => [
        <span key="a">{s.action}</span>,
        <span key="k"><Kbd>{s.keysWin}</Kbd> <span style={{ color: MUTED }}>/</span> <Kbd>{s.keysMac}</Kbd></span>,
        <span key="s">{s.surfaces.map((x, i) => <Pill key={i}>{x}</Pill>)}</span>,
        <span key="d" style={{ color: MUTED }}>{s.description}</span>,
      ])} />
    ),

    page: (title, blocks, anchor) => (
      <section key={anchor} id={`doc-${anchor}`} style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: ACCENT, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${BORDER}` }}>{title}</h2>
        {blocks}
      </section>
    ),

    document: () => null, // Not used — we compose the outer layout in the React component below.
  };
}

// ── Small helpers ───────────────────────────────────────────────────────────

function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const x of arr) {
    const kk = key(x);
    if (!map.has(kk)) map.set(kk, []);
    map.get(kk)!.push(x);
  }
  return map;
}

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function FactsTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, margin: '8px 0' }}>
      <thead>
        <tr>{headers.map((h, i) => (
          <th key={i} style={{ padding: '6px 8px', textAlign: 'left', color: MUTED, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
        ))}</tr>
      </thead>
      <tbody>{rows.map((row, i) => (
        <tr key={i}>{row.map((cell, j) => (
          <td key={j} style={{ padding: '6px 8px', borderBottom: `1px solid ${BORDER}`, color: TEXT, verticalAlign: 'top' }}>{cell}</td>
        ))}</tr>
      ))}</tbody>
    </table>
  );
}

function RiskPill({ risk }: { risk: 'safe' | 'write' | 'dangerous' }) {
  const bg = risk === 'safe' ? 'rgba(166, 227, 161, 0.15)' : risk === 'write' ? 'rgba(137, 180, 250, 0.15)' : 'rgba(243, 139, 168, 0.15)';
  const fg = risk === 'safe' ? '#a6e3a1' : risk === 'write' ? '#89b4fa' : '#f38ba8';
  return <span style={{ background: bg, color: fg, padding: '1px 6px', borderRadius: 3, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.04 }}>{risk}</span>;
}

function PermPill({ perm }: { perm: 'auto' | 'first_time' | 'always_ask' }) {
  const bg = perm === 'auto' ? 'rgba(166, 227, 161, 0.15)' : perm === 'first_time' ? 'rgba(249, 168, 37, 0.15)' : 'rgba(243, 139, 168, 0.15)';
  const fg = perm === 'auto' ? '#a6e3a1' : perm === 'first_time' ? '#f9a825' : '#f38ba8';
  return <span style={{ background: bg, color: fg, padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>{PERMISSION_LABELS[perm]}</span>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={{ background: CARD, padding: '1px 5px', borderRadius: 3, fontSize: 10, color: MUTED, marginRight: 4 }}>{children}</span>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: 11, color: TEXT }}>{children}</kbd>;
}

// ── Block dispatch (inline, avoids importing the deeper adapter walker) ─────

function renderBlock(block: DocBlock, adapter: RendererAdapter<React.ReactNode>, data: FactsData): React.ReactNode {
  switch (block.type) {
    case 'paragraph': return adapter.paragraph(block.text);
    case 'heading':   return adapter.heading(block.level, block.text, block.anchor);
    case 'list':      return adapter.list(block.items, block.ordered);
    case 'code':      return adapter.code(block.text, block.language);
    case 'callout':   return adapter.callout(block.text, block.variant);
    case 'link':      return adapter.link(block.text, block.href, block.external ?? false);
    case 'facts': {
      switch (block.kind) {
        case 'tools': {
          const f = block.filter;
          const filtered = data.tools.filter(t => (!f?.category || t.category === f.category) && (!f?.risk || t.risk === f.risk));
          return adapter.tools(filtered, block);
        }
        case 'providers': {
          const f = block.filter;
          const filtered = f?.kind ? data.providers.filter(p => p.kind === f.kind) : data.providers;
          return adapter.providers(filtered, block);
        }
        case 'modes': return adapter.modes(data.modes);
        case 'personas': {
          const f = block.filter;
          const filtered = f?.mode ? data.personas.filter(p => p.mode === f.mode) : data.personas;
          return adapter.personas(filtered, block);
        }
        case 'permissions': return adapter.permissions(data.permissions);
        case 'shortcuts': {
          const f = block.filter;
          const filtered = f?.surface ? data.shortcuts.filter(s => s.surfaces.includes(f.surface!)) : data.shortcuts;
          return adapter.shortcuts(filtered, block);
        }
      }
    }
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export function DocumentationPage() {
  const [showPower, setShowPower] = useState(true);
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { pages, sidebar } = useMemo(() => {
    const all = filterBySurface(getPages(), 'ide');
    const audienceFiltered = filterByAudience(all, showPower ? 'everything' : 'newcomer');
    const searched = query.trim()
      ? audienceFiltered.filter(p => matchesSearch(p, query.toLowerCase()))
      : audienceFiltered;
    return { pages: searched, sidebar: buildSidebar(searched) };
  }, [showPower, query]);

  const data: FactsData = {
    tools: TOOLS, providers: PROVIDERS, modes: MODES, personas: PERSONAS,
    permissions: PERMISSION_MODES, shortcuts: SHORTCUTS,
  };

  const adapter = makeAdapter();

  return (
    <div style={{ flex: 1, display: 'flex', background: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)', overflow: 'hidden' }}>
      {/* Sidebar (collapsible) */}
      {sidebarOpen ? (
        <aside style={{ width: 240, minWidth: 240, borderRight: `1px solid ${BORDER}`, background: 'rgba(15, 10, 26, 0.5)', padding: 16, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: HEADING }}>Documentation</div>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Collapse sidebar"
              style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = HEADING; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = MUTED; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
          </div>

          <input
          type="text"
          placeholder="Search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ width: '100%', height: 30, background: 'rgba(49, 34, 68, 0.5)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '0 10px', color: HEADING, fontSize: 12, outline: 'none', marginBottom: 10 }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: MUTED, marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={showPower} onChange={e => setShowPower(e.target.checked)} />
          Show reference / power-user pages
        </label>

        {sidebar.map(section => (
          <div key={section.id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.1, marginBottom: 4, padding: '0 6px' }}>{section.title}</div>
            {section.pages.map(p => (
              <a
                key={p.id}
                href={`#doc-${p.anchor}`}
                style={{ display: 'block', padding: '4px 6px', fontSize: 12, color: TEXT, textDecoration: 'none', borderRadius: 4 }}
                onClick={() => {
                  const el = document.getElementById(`doc-${p.anchor}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {p.title}
              </a>
            ))}
          </div>
        ))}
        </aside>
      ) : (
        <div style={{ padding: 12, borderRight: `1px solid ${BORDER}`, background: 'rgba(15, 10, 26, 0.5)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Expand sidebar"
            style={{ background: CARD, border: `1px solid ${BORDER}`, color: MUTED, cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = HEADING; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(168,85,247,0.5)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = MUTED; (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: HEADING, marginBottom: 6 }}>Ava Supernova</h1>
        <p style={{ fontSize: 13, color: MUTED, marginBottom: 32 }}>Everything you need to know — clean, searchable, kept in sync with the agent itself.</p>

        {pages.map(page => {
          const blocks = page.body.map(b => renderBlock(b, adapter, data));
          return adapter.page(page.title, blocks, anchorFor(page.id));
        })}

        {pages.length === 0 && (
          <p style={{ color: MUTED, fontSize: 13 }}>No pages match your search.</p>
        )}
      </div>
    </div>
  );
}

function matchesSearch(page: DocPage, q: string): boolean {
  if (page.title.toLowerCase().includes(q)) return true;
  for (const block of page.body) {
    if ('text' in block && typeof block.text === 'string' && block.text.toLowerCase().includes(q)) return true;
    if (block.type === 'list' && block.items.some(i => i.toLowerCase().includes(q))) return true;
  }
  return false;
}
