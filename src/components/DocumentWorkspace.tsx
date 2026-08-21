/**
 * The document workspace — a document open beside the conversation about it.
 *
 * Ava can plan a document, draft it, edit it surgically and build it to docx or
 * pdf. What she could not do was SHOW it to you while you worked on it: the
 * extension had a preview panel you opened a file into, the IDE had nothing at
 * all, and in both cases the document and the discussion of the document lived
 * in different places.
 *
 * Why a split inside the chat rather than "open the .md in the editor beside
 * it": that only works where there IS an editor. VS Code has one, this app has
 * one, the web companion and the dashboard have none. The split is the only
 * shape that works everywhere, and it matches how the Design Studio and Health
 * room already work — the work happens IN Ava, not in a tab next to her.
 *
 * Decisions, all settled with the operator on 2026-08-21:
 *
 * - **Free edit, always.** Not read-only-first. On the web there is no other
 *   editor, so a read-only pane means the user cannot fix their own typo.
 * - **Autosave on a short debounce.** Ava reads the file from DISK, so an
 *   unsaved buffer means she is working from an older version than the one on
 *   screen — which is exactly the failure where she looks unreliable while the
 *   file is fine.
 * - **The Tasks rail yields** while a document is open and returns on close.
 *   Document + chat + tasks is three columns and too tight on a laptop.
 * - **Markdown is the source of truth**, so this edits Markdown text. docx and
 *   pdf are exports built from it and are never edited here.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { t } from '../lib/i18n';

export interface OpenDocument {
  /** Absolute path on disk. */
  path: string;
  /** Display name — the file name, not the whole path. */
  name: string;
}

export interface DocumentWorkspaceProps {
  doc: OpenDocument;
  /** Close the pane. The Tasks rail comes back. */
  onClose: () => void;
  /** Swap to a different document — opens the same picker the top bar uses. */
  onSwitch: () => void;
  /**
   * The user changed the file. Ava must be told, because she carries whatever
   * she last read: without this she eventually says something that does not
   * match the screen, which reads as unreliability even though the file is fine.
   */
  onUserEdited: (path: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
}

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
/** Long enough not to write on every keystroke, short enough that Ava is never
 *  more than a moment behind what is on screen. */
const AUTOSAVE_MS = 800;

export function DocumentWorkspace({
  doc, onClose, onSwitch, onUserEdited, width, onWidthChange,
}: DocumentWorkspaceProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);

  const saveTimer = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  /** Guards the load: setting state from disk must not look like a user edit. */
  const loadedPath = useRef<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        const body = await readTextFile(doc.path);
        if (cancelled) return;
        loadedPath.current = doc.path;
        setText(body);
        setSaved(true);
      } catch (err) {
        if (cancelled) return;
        // A document that has moved or been deleted must not throw a dialog at
        // someone who had forgotten it was open — say so in the pane and stop.
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [doc.path]);

  // ── Autosave ────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((body: string) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(doc.path, body);
        setSaved(true);
        // Tell Ava only AFTER the bytes are on disk. Telling her earlier would
        // send her to re-read a file that still holds the old text.
        onUserEdited(doc.path);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, AUTOSAVE_MS);
  }, [doc.path, onUserEdited]);

  // Flush a pending save when the pane closes or the document changes —
  // otherwise the last thing typed dies with the component.
  useEffect(() => () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
  }, []);

  const handleChange = (body: string) => {
    setText(body);
    setSaved(false);
    if (loadedPath.current === doc.path) scheduleSave(body);
  };

  // ── Drag to resize ──────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width, onWidthChange]);

  return (
    <div style={{
      width, minWidth: MIN_WIDTH, flexShrink: 0, height: '100%',
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
      background: 'rgba(20, 12, 32, 0.6)', position: 'relative',
    }}>
      {/* Drag handle — inner edge, matching the Tasks rail's. */}
      <div
        onMouseDown={onDragStart}
        style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 5 }}
      />

      {/* ── Header: which document, switch, close ──────────────────────── */}
      <div style={{
        height: 40, minHeight: 40, flexShrink: 0, display: 'flex', alignItems: 'center',
        gap: 8, padding: '0 10px 0 14px',
        borderBottom: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#cdd6f4', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={doc.path}>
          {doc.name}
        </span>

        {/* Save state. Quiet when saved — a permanent green tick is noise; the
            only moment worth reporting is when the file is BEHIND the screen. */}
        {!saved && (
          <span style={{ fontSize: 9.5, color: '#6c7086' }}>{t('doc.saving')}</span>
        )}

        <button
          onClick={onSwitch}
          title={t('doc.switch')}
          style={{
            padding: '3px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer',
            background: 'transparent', color: '#9399b2',
            border: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)',
          }}
        >
          {t('doc.switch')}
        </button>
        <button
          onClick={onClose}
          title={t('doc.close')}
          aria-label={t('doc.close')}
          style={{
            width: 22, height: 22, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'transparent', color: '#6c7086', fontSize: 14, lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 20, fontSize: 12, color: '#6c7086' }}>{t('doc.loading')}</div>
      ) : error ? (
        <div style={{ padding: 20, fontSize: 12, color: '#f38ba8', lineHeight: 1.6 }}>
          {t('doc.unavailable')}
          <div style={{ marginTop: 6, fontSize: 11, color: '#6c7086', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {doc.path}
          </div>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck
          style={{
            flex: 1, width: '100%', resize: 'none', border: 'none', outline: 'none',
            padding: '16px 18px', background: 'transparent', color: '#cdd6f4',
            fontSize: 13, lineHeight: 1.7,
            // Markdown is the source of truth, so this is a text editor, not a
            // word processor. Monospace keeps tables and front-matter legible.
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
          }}
        />
      )}
    </div>
  );
}
