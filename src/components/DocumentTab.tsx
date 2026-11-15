// A document in its own IDE tab (Documents 1.0 Part 4 — "a separate tab …
// the cleaner option"). Opened like any file (the 'ava-open-document' event);
// EditorArea's FileViewer hands PDF, Word and spreadsheets here. The bytes are
// read from disk by Tauri; a spreadsheet is read by the sidecar, where the
// spreadsheet library runs. Nothing leaves the computer.

import { useEffect, useState } from 'react';
import { DocumentViewer, viewerKind, type ViewerSource } from './DocumentViewer';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import type { ViewSheet } from '@ava/core/authoring/sheet-view';

const MAX_BYTES = 60 * 1024 * 1024;

export function isViewerDocument(path: string): boolean {
  return viewerKind(path) !== 'other';
}

/** Files a document tool made that the viewer can show — same rule as the
 *  extension's chat ("Built → C:\…\overview.pdf", "Created spreadsheet: …"). */
export function viewableFiles(name: string, result: string | undefined): string[] {
  if (!result || (name !== 'document_author' && name !== 'document_manage')) return [];
  const found = result.match(/(?:[A-Za-z]:[\\/]|\/)[^\n"'`|]*?\.(?:pdf|docx|xlsx|ods|csv)\b/gi) ?? [];
  return [...new Set(found.map((p) => p.trim()))];
}

export function DocumentTab({ path }: { path: string }) {
  const [source, setSource] = useState<ViewerSource | null>(null);
  const name = path.split(/[\\/]/).pop() || path;
  const folder = (() => {
    const parts = path.split(/[\\/]/);
    return parts.length > 1 ? parts[parts.length - 2] : undefined;
  })();

  useEffect(() => {
    let alive = true;
    setSource(null);
    const kind = viewerKind(path);
    if (kind === 'other') { setSource({ kind: 'other' }); return; }

    if (kind === 'sheet') {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sc = getSidecar();
      const onEvent = (e: SidecarEvent) => {
        const m = e as unknown as { event: string; id?: string; sheets?: ViewSheet[]; error?: string };
        if (m.event !== 'document_sheet_result' || m.id !== id || !alive) return;
        setSource(m.sheets ? { kind: 'sheet', sheets: m.sheets } : { kind: 'error', message: m.error || 'This spreadsheet could not be read.' });
      };
      sc.onAny(onEvent);
      void sc.documentSheet(path, id).catch(() => { if (alive) setSource({ kind: 'error', message: 'This spreadsheet could not be read.' }); });
      return () => { alive = false; sc.offAny(onEvent); };
    }

    void (async () => {
      try {
        const { readFile, stat } = await import('@tauri-apps/plugin-fs');
        const st = await stat(path);
        if (Number(st.size ?? 0) > MAX_BYTES) { if (alive) setSource({ kind: 'other' }); return; }
        const bytes = await readFile(path);
        if (alive) setSource({ kind, bytes });
      } catch (e) {
        if (alive) setSource({ kind: 'error', message: `This file could not be opened: ${e instanceof Error ? e.message : String(e)}` });
      }
    })();
    return () => { alive = false; };
  }, [path]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <DocumentViewer
        name={name}
        folder={folder}
        source={source}
        onOpenInApp={() => { void import('@tauri-apps/plugin-opener').then(({ openPath }) => openPath(path)).catch(() => {}); }}
        onShowInFolder={() => { void import('@tauri-apps/plugin-opener').then(({ revealItemInDir }) => revealItemInDir(path)).catch(() => {}); }}
      />
    </div>
  );
}
