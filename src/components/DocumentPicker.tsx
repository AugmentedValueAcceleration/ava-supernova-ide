/**
 * Find a document to work on — search, not a file dialog.
 *
 * The first draft of this design put the picker in the workspace pane's header,
 * which cannot work: the pane does not exist until a document is open, so there
 * was nowhere to click. The entry point lives on the chat page's top bar next
 * to + New Chat, and this is what it opens.
 *
 * Ordered by what is actually wanted, not by what is easiest to list:
 *
 *   1. Recent — what Ava just made, or what was open yesterday. This covers
 *      most opens, so it is the view before anything is typed.
 *   2. Everything the project holds, filtered as you type.
 *   3. Browse… — the OS picker, for anything outside the scanned roots.
 *
 * The list comes from the SAME scan the Library uses. A second index would
 * eventually disagree with the first, which is the fault this codebase keeps
 * repeating — one fact, two lists, and the quiet one is wrong.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { t } from '../lib/i18n';

export interface DocumentCandidate {
  path: string;
  name: string;
  /** Relative to the project root, for disambiguating two files with one name. */
  relPath: string;
  /** Epoch ms, for the recent ordering. */
  modifiedAt?: number;
}

export interface DocumentPickerProps {
  candidates: DocumentCandidate[];
  /** Paths opened before, newest first. Shown above everything else. */
  recentPaths: string[];
  onPick: (doc: DocumentCandidate) => void;
  onBrowse: () => void;
  onClose: () => void;
}

export function DocumentPicker({ candidates, recentPaths, onPick, onBrowse, onClose }: DocumentPickerProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Nothing typed: recents first, in the order they were opened, then
      // everything else by modified time. Someone who opens this without
      // typing almost always wants the thing they had open last.
      const byPath = new Map(candidates.map((c) => [c.path, c]));
      const recent = recentPaths.map((p) => byPath.get(p)).filter(Boolean) as DocumentCandidate[];
      const rest = candidates
        .filter((c) => !recentPaths.includes(c.path))
        .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0));
      return [...recent, ...rest].slice(0, 40);
    }
    return candidates
      .filter((c) => c.name.toLowerCase().includes(q) || c.relPath.toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, candidates, recentPaths]);

  useEffect(() => { setActive(0); }, [query]);

  const choose = (i: number) => {
    const doc = results[i];
    if (doc) onPick(doc);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter') { e.preventDefault(); choose(active); }
  };

  const showingRecents = query.trim() === '' && recentPaths.length > 0;

  return (
    <>
      {/* Scrim — clicking away closes, like every other picker in the app. */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200 }}
      />
      <div
        role="dialog"
        aria-label={t('doc.open_title')}
        style={{
          position: 'fixed', top: 90, left: '50%', transform: 'translateX(-50%)',
          width: 560, maxWidth: '90vw', maxHeight: '60vh', zIndex: 201,
          display: 'flex', flexDirection: 'column',
          background: '#0f0a1a', borderRadius: 12,
          border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('doc.open_placeholder')}
          style={{
            padding: '12px 16px', background: 'transparent', border: 'none', outline: 'none',
            color: '#cdd6f4', fontSize: 13,
            borderBottom: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)',
          }}
        />

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {showingRecents && (
            <div style={{ padding: '8px 16px 4px', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, color: '#6c7086' }}>
              {t('doc.recent')}
            </div>
          )}

          {results.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#6c7086' }}>
              {candidates.length === 0 ? t('doc.none_found') : t('doc.no_match')}
            </div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.path}
                onClick={() => choose(i)}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  padding: '8px 16px',
                  background: i === active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                  color: '#cdd6f4',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: i === active ? 600 : 400 }}>{c.name}</div>
                <div style={{ fontSize: 10, color: '#6c7086', marginTop: 1 }}>{c.relPath}</div>
              </button>
            ))
          )}
        </div>

        {/* The escape hatch, always last: documents that live outside the
            scanned roots are rare but they exist, and a picker with no way
            out is a picker people stop trusting. */}
        <button
          onClick={onBrowse}
          style={{
            padding: '10px 16px', textAlign: 'left', border: 'none', cursor: 'pointer',
            background: 'transparent', color: '#9399b2', fontSize: 11.5,
            borderTop: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)',
          }}
        >
          {t('doc.browse')}
        </button>
      </div>
    </>
  );
}
