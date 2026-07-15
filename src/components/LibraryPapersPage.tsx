import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { t } from '../lib/i18n';

/**
 * Library → Papers page for the IDE. Mirrors the extension's
 * `LibraryPapers.tsx` but in IDE conventions (inline styles + CSS
 * vars, direct fetch to platform endpoints, CustomEvent dispatch
 * for the Read-with-Ava handoff).
 *
 * Three sub-tabs (Featured / Trending / Latest), 12 discipline
 * pivot chips (All / AI & CS / Biology / Medicine / Physics /
 * Chemistry / Earth Sciences / Social Sciences / Economics /
 * Engineering / Math / Other), live OpenAlex search via
 * /api/papers/search.
 *
 * "Read with Ava" dispatches `ava-read-paper-with-ava` on the window;
 * the chat panel (DashboardPages.tsx) listens, switches mode to
 * 'teach', and sends the four-layer-pass primer via the sidecar.
 */

type PaperDiscipline =
  | 'ai_cs' | 'biology' | 'medicine' | 'physics' | 'chemistry'
  | 'earth_sciences' | 'social_sciences' | 'economics' | 'engineering'
  | 'math' | 'other';

type PapersTab = 'featured' | 'trending' | 'latest';

interface PaperAuthor { name: string; orcid?: string }

interface LibraryPaper {
  id?: string;
  doi?: string;
  arxiv_id?: string;
  openalex_id?: string;
  title: string;
  authors: PaperAuthor[];
  abstract?: string;
  year?: number;
  primary_url?: string;
  oa_pdf_url?: string;
  discipline?: PaperDiscipline;
  source?: string;
  featured_note?: string;
  citation_count?: number;
  retracted?: boolean;
}

const DISCIPLINES: { id: 'all' | PaperDiscipline }[] = [
  { id: 'all' },
  { id: 'ai_cs' },
  { id: 'biology' },
  { id: 'medicine' },
  { id: 'physics' },
  { id: 'chemistry' },
  { id: 'earth_sciences' },
  { id: 'social_sciences' },
  { id: 'economics' },
  { id: 'engineering' },
  { id: 'math' },
  { id: 'other' },
];

const TABS: { id: PapersTab }[] = [
  { id: 'featured' },
  { id: 'trending' },
  { id: 'latest' },
];

const MEDICAL_DISCIPLINES = new Set<PaperDiscipline>(['medicine']);

const DISCIPLINE_LABELS: Record<PaperDiscipline, string> = {
  ai_cs: 'AI/CS', biology: 'Biology', medicine: 'Medicine',
  physics: 'Physics', chemistry: 'Chemistry', earth_sciences: 'Earth Sci',
  social_sciences: 'Social Sci', economics: 'Economics',
  engineering: 'Engineering', math: 'Math', other: 'Other',
};

function authorLine(authors: PaperAuthor[]): string {
  if (!authors || authors.length === 0) return '';
  if (authors.length <= 3) return authors.map(a => a.name).join(', ');
  return `${authors.slice(0, 3).map(a => a.name).join(', ')}, et al.`;
}

export function LibraryPapersPage() {
  const [tab, setTab] = useState<PapersTab>('featured');
  const [discipline, setDiscipline] = useState<'all' | PaperDiscipline>('all');
  const [searchInput, setSearchInput] = useState('');
  const [papersByTab, setPapersByTab] = useState<Record<PapersTab, LibraryPaper[]>>({
    featured: [], trending: [], latest: [],
  });
  const [tabLoading, setTabLoading] = useState<Record<PapersTab, boolean>>({
    featured: false, trending: false, latest: false,
  });
  const [searchResults, setSearchResults] = useState<LibraryPaper[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [selected, setSelected] = useState<LibraryPaper | null>(null);

  const debounceRef = useRef<number | null>(null);

  // Tab + discipline → fetch /api/papers/featured. Stable handler so the
  // effect below doesn't loop on render identity.
  const loadTab = useCallback(async (t: PapersTab, d: 'all' | PaperDiscipline) => {
    setTabLoading(prev => ({ ...prev, [t]: true }));
    try {
      const params = new URLSearchParams();
      params.set('tab', t);
      if (d !== 'all') params.set('discipline', d);
      params.set('limit', '20');
      const res = await fetch(`https://ava-supernova.com/api/papers/featured?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        setPapersByTab(prev => ({ ...prev, [t]: [] }));
        return;
      }
      const data = await res.json() as { papers?: LibraryPaper[] };
      setPapersByTab(prev => ({ ...prev, [t]: data.papers ?? [] }));
    } catch {
      setPapersByTab(prev => ({ ...prev, [t]: [] }));
    } finally {
      setTabLoading(prev => ({ ...prev, [t]: false }));
    }
  }, []);

  // Search handler — same upstream proxy, different endpoint.
  const runSearch = useCallback(async (q: string, d: 'all' | PaperDiscipline) => {
    setSearchLoading(true);
    setSearchActive(true);
    try {
      const params = new URLSearchParams();
      params.set('q', q);
      if (d !== 'all') params.set('discipline', d);
      params.set('per_page', '25');
      const res = await fetch(`https://ava-supernova.com/api/papers/search?${params.toString()}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        setSearchResults([]);
        return;
      }
      const data = await res.json() as { papers?: LibraryPaper[] };
      setSearchResults(data.papers ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Initial + tab/discipline-change loads.
  useEffect(() => {
    loadTab(tab, discipline);
  }, [tab, discipline, loadTab]);

  // Debounced search — 300ms after last keystroke.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!searchInput.trim()) {
      setSearchResults([]);
      setSearchActive(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      runSearch(searchInput.trim(), discipline);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [searchInput, discipline, runSearch]);

  const activeList = searchActive ? searchResults : papersByTab[tab];
  const isLoading = searchActive ? searchLoading : tabLoading[tab];
  const hasMedicalInList = useMemo(
    () => activeList.some(p => p.discipline && MEDICAL_DISCIPLINES.has(p.discipline)),
    [activeList],
  );

  const onReadWithAva = useCallback((paper: LibraryPaper) => {
    // Bump read_count on stored rows. Fire-and-forget.
    if (paper.id) {
      void fetch(`https://ava-supernova.com/api/papers/${paper.id}`, { method: 'POST' })
        .catch(() => { /* non-fatal */ });
    }
    // Dispatch to the chat panel — listener in DashboardPages.tsx
    // switches mode to 'teach' and sends the four-layer-pass primer.
    window.dispatchEvent(new CustomEvent('ava-read-paper-with-ava', { detail: { paper } }));
    setSelected(null);
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: '20px 32px',
      }}>
        {/* Search + discipline pivots */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder={t('ide.papers.search_ph')}
              style={{
                width: '100%',
                padding: '10px 36px 10px 14px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
              }}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  fontSize: 14, cursor: 'pointer', padding: 4,
                }}
                aria-label={t('ide.papers.clear_search')}
              >
                ×
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DISCIPLINES.map(d => {
              const active = discipline === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDiscipline(d.id)}
                  style={{
                    padding: '4px 12px',
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 9999,
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                    color: active ? '#c084fc' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {t(`ide.papers.disc.${d.id}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-tabs (hidden when search active — search displaces tabs) */}
        {!searchActive && (
          <div style={{
            display: 'flex',
            gap: 2,
            borderBottom: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
            marginBottom: 16,
          }}>
            {TABS.map(tb => {
              const active = tab === tb.id;
              return (
                <button
                  key={tb.id}
                  onClick={() => setTab(tb.id)}
                  title={t(`ide.papers.tab.${tb.id}_hint`)}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    color: active ? '#c084fc' : '#6c7086',
                    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {t(`ide.papers.tab.${tb.id}`)}
                </button>
              );
            })}
          </div>
        )}

        {/* Medical-paper "not advice" banner — surfaces only when a
            medical paper appears in the current list. The Tutor's
            four-layer pass handles this internally too; this is the
            explicit surface reminder before the user clicks. */}
        {hasMedicalInList && (
          <div style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(245, 158, 11, 0.3)',
            background: 'rgba(245, 158, 11, 0.05)',
            fontSize: 11,
            color: 'rgba(252, 211, 77, 0.9)',
          }}>
            Some papers in this list are clinical or medical. Ava will summarise — that is not medical advice. Check with a healthcare professional before acting on anything you read here.
          </div>
        )}

        {/* List */}
        {isLoading && activeList.length === 0 && (
          <div style={{
            padding: 32,
            textAlign: 'center',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'rgba(15, 10, 26, 0.4)',
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '1.5px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                borderTopColor: 'var(--accent)',
                animation: 'avaPapersIdeSpin 0.85s linear infinite',
                display: 'inline-block',
              }} />
              {searchActive ? 'Searching OpenAlex…' : 'Loading papers…'}
            </div>
            <style>{`@keyframes avaPapersIdeSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!isLoading && activeList.length === 0 && (
          <div style={{
            padding: 40,
            textAlign: 'center',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'rgba(15, 10, 26, 0.4)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.6 }}>
              {searchActive ? '🔍' : '📚'}
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              {searchActive ? `No papers found for "${searchInput.trim()}"` : 'No papers in this tab yet'}
            </p>
            <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              {searchActive ? 'Try different keywords or remove the discipline filter.' : 'New picks land regularly. Try the search bar to find something specific.'}
            </p>
          </div>
        )}

        {activeList.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeList.map((paper, i) => (
              <PaperCard
                key={paper.id ?? paper.arxiv_id ?? paper.doi ?? paper.openalex_id ?? `${i}-${paper.title}`}
                paper={paper}
                onSelect={() => setSelected(paper)}
                onReadWithAva={() => onReadWithAva(paper)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <PaperDetailModal
          paper={selected}
          onClose={() => setSelected(null)}
          onReadWithAva={() => onReadWithAva(selected)}
        />
      )}
    </div>
  );
}

function PaperCard({
  paper,
  onSelect,
  onReadWithAva,
}: {
  paper: LibraryPaper;
  onSelect: () => void;
  onReadWithAva: () => void;
}) {
  const disciplineLabel = paper.discipline ? DISCIPLINE_LABELS[paper.discipline] : null;
  const abstractPreview = paper.abstract
    ? paper.abstract.length > 240 ? paper.abstract.slice(0, 240).trim() + '…' : paper.abstract
    : null;

  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid var(--border)',
      background: 'rgba(15, 10, 26, 0.4)',
      padding: 16,
      transition: 'border-color 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <button
          onClick={onSelect}
          style={{
            flex: 1, textAlign: 'left', background: 'transparent', border: 'none',
            padding: 0, cursor: 'pointer', minWidth: 0, color: 'inherit',
          }}
        >
          <h3 style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            margin: 0, lineHeight: 1.4,
          }}>
            {paper.title}
            {paper.retracted && (
              <span style={{
                marginLeft: 8, padding: '2px 6px',
                borderRadius: 4, fontSize: 9, fontWeight: 700,
                background: 'rgba(248, 113, 113, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(248, 113, 113, 0.3)',
              }}>
                RETRACTED
              </span>
            )}
          </h3>
          <div style={{
            marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            gap: '4px 8px', fontSize: 11, color: 'var(--text-muted)',
          }}>
            {paper.authors.length > 0 && <span>{authorLine(paper.authors)}</span>}
            {paper.year && <span>· {paper.year}</span>}
            {disciplineLabel && (
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>· {disciplineLabel}</span>
            )}
            {paper.citation_count != null && paper.citation_count > 0 && (
              <span>· {paper.citation_count.toLocaleString()} citations</span>
            )}
          </div>
          {paper.featured_note && (
            <p style={{
              marginTop: 8, fontSize: 11, fontStyle: 'italic',
              color: 'color-mix(in srgb, var(--accent) 85%, transparent)', lineHeight: 1.5,
            }}>
              {paper.featured_note}
            </p>
          )}
          {abstractPreview && !paper.featured_note && (
            <p style={{
              marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
            }}>
              {abstractPreview}
            </p>
          )}
        </button>
        <button
          onClick={onReadWithAva}
          style={{
            flexShrink: 0, padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            color: '#c084fc',
            fontSize: 11, fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 20%, transparent)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)'; }}
        >
          Read with Ava
        </button>
      </div>
    </div>
  );
}

function PaperDetailModal({
  paper,
  onClose,
  onReadWithAva,
}: {
  paper: LibraryPaper;
  onClose: () => void;
  onReadWithAva: () => void;
}) {
  const disciplineLabel = paper.discipline ? DISCIPLINE_LABELS[paper.discipline] : null;
  const isMedical = paper.discipline ? MEDICAL_DISCIPLINES.has(paper.discipline) : false;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 720, maxHeight: '85vh',
          overflowY: 'auto',
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: 'rgba(15, 10, 26, 0.98)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 10,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.4)', border: 'none',
            color: 'white', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label={t('ide.papers.close')}
        >
          ×
        </button>

        <div style={{ padding: 24 }}>
          <h2 style={{
            fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
            margin: 0, paddingRight: 32, lineHeight: 1.4,
          }}>
            {paper.title}
            {paper.retracted && (
              <span style={{
                marginLeft: 8, padding: '2px 6px',
                borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: 'rgba(248, 113, 113, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(248, 113, 113, 0.3)',
                verticalAlign: 'middle',
              }}>
                RETRACTED
              </span>
            )}
          </h2>

          <div style={{
            marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            gap: '4px 8px', fontSize: 11, color: 'var(--text-muted)',
          }}>
            {paper.authors.length > 0 && (
              <span>{paper.authors.map(a => a.name).join(', ')}</span>
            )}
            {paper.year && <span>· {paper.year}</span>}
            {disciplineLabel && (
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>· {disciplineLabel}</span>
            )}
            {paper.citation_count != null && paper.citation_count > 0 && (
              <span>· {paper.citation_count.toLocaleString()} citations</span>
            )}
          </div>

          {paper.featured_note && (
            <p style={{
              marginTop: 16, padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
              background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
              fontSize: 12, fontStyle: 'italic',
              color: 'color-mix(in srgb, var(--accent) 95%, transparent)', lineHeight: 1.5,
            }}>
              {paper.featured_note}
            </p>
          )}

          {paper.abstract && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{
                fontSize: 10, fontWeight: 500, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.6px',
                margin: '0 0 6px 0',
              }}>{t('ide.papers.abstract')}</h3>
              <p style={{
                fontSize: 12.5, color: 'var(--text-secondary)',
                lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0,
              }}>
                {paper.abstract}
              </p>
            </div>
          )}

          {isMedical && (
            <p style={{
              marginTop: 16, padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid rgba(245, 158, 11, 0.3)',
              background: 'rgba(245, 158, 11, 0.05)',
              fontSize: 11,
              color: 'rgba(252, 211, 77, 0.9)', lineHeight: 1.5,
            }}>
              <strong>{t('ide.papers.not_medical_advice')}</strong> {t('ide.papers.not_medical_advice_body')}
            </p>
          )}

          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={onReadWithAva}
              style={{
                padding: '6px 12px', borderRadius: 8,
                border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                color: '#c084fc',
                fontSize: 12, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Read with Ava
            </button>
            {paper.primary_url && (
              <a
                href={paper.primary_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 500,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Original (publisher)
              </a>
            )}
            {paper.oa_pdf_url && paper.oa_pdf_url !== paper.primary_url && (
              <a
                href={paper.oa_pdf_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 500,
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Open-access PDF
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
