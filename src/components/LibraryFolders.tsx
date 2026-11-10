import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tt } from '../lib/i18n';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';

/** The website guide to store rules. External links go through the opener plugin. */
async function openGuide(): Promise<void> {
  const url = 'https://avasupernova.com/guides/selling-what-you-make';
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Library folders (Library folders and packs plan, Phase 1, 9 Nov 2026).
 *
 * A folder is a NAME holding pointers to work — files never move, one piece can
 * sit in several folders, and deleting a folder never deletes work. The store
 * is core's library-folders.ts (folders.json), shared with the extension; the
 * sidecar runs it. Every change comes back as the whole list, so what is shown
 * is always what is saved.
 *
 * Mirrors the extension's dashboard-ui/src/pages/LibraryFolders.tsx.
 */

export interface LibraryFolderInfo {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  members: Array<{ ref: string; pick?: string[]; addedAt: string }>;
  /** One line on how everything in it looks. Theirs; Ava reads it before every brief. */
  note?: string;
  /** The pack plan, pinned inside the folder (never a real subfolder). */
  plan?: PackPlanInfo;
}

export type PlanItemStateInfo = 'planned' | 'started' | 'in_progress' | 'made';
export interface PackPlanInfo {
  title: string;
  reasoning: string;
  status: 'proposed' | 'agreed';
  proposedAt: string;
  agreedAt?: string;
  editedByPerson?: boolean;
  items: Array<{ id: string; name: string; what: string; tool: 'gimp' | 'blender' | 'other'; folder?: string; work?: { tool: 'gimp' | 'blender'; slug: string; name: string } }>;
}

export type FolderRef = string; // creative:<id> | logo:<group> | file:<absolute path>

export const DRAG_WORK = 'application/x-ava-library-ref';
export const DRAG_FOLDER = 'application/x-ava-library-folder';

/** What uploads take — the same list as core's UPLOAD_KINDS. */
const UPLOAD_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'glb', 'gltf', 'fbx', 'obj', 'blend'];

/** A project file's reference. Same spelling on every surface, so one file is one member. */
export function fileRef(absolutePath: string): FolderRef {
  const p = absolutePath.replace(/\\/g, '/');
  return `file:${/^[a-z]:\//.test(p) ? p[0].toUpperCase() + p.slice(1) : p}`;
}

export function childrenOf(folders: LibraryFolderInfo[], parentId: string | null): LibraryFolderInfo[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function pathTo(folders: LibraryFolderInfo[], id: string | null): LibraryFolderInfo[] {
  const out: LibraryFolderInfo[] = [];
  for (let cur = id; cur; ) {
    const f = folders.find((x) => x.id === cur);
    if (!f || out.includes(f)) break;
    out.unshift(f);
    cur = f.parentId;
  }
  return out;
}

/** Pick their own files and copy them into the Library (and the open folder). */
export async function uploadToLibrary(folderId?: string): Promise<void> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    multiple: true,
    title: tt('library.folders.upload', 'Upload'),
    filters: [{ name: 'Images, video, audio and 3D models', extensions: UPLOAD_EXTENSIONS }],
  });
  const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
  if (paths.length) await getSidecar().libraryUpload(paths.map(String), folderId);
}

// ── Pack plans ───────────────────────────────────────────────────────────────

export type PlanStates = Record<string, Record<string, PlanItemStateInfo>>;

/** "7 of 16 made · 2 in progress · next: Arched window". Mirrors core's planProgressLine. */
export function planProgress(folder: LibraryFolderInfo, states: Record<string, PlanItemStateInfo> = {}): { made: number; total: number; line: string } {
  const items = folder.plan?.items ?? [];
  const made = items.filter((i) => states[i.id] === 'made').length;
  const going = items.filter((i) => states[i.id] === 'in_progress' || states[i.id] === 'started').length;
  const next = items.find((i) => (states[i.id] ?? 'planned') === 'planned');
  const line = `${made} of ${items.length} made${going ? ` · ${going} in progress` : ''}${next ? ` · next: ${next.name}` : made === items.length && items.length ? ' · every piece is made' : ''}`;
  return { made, total: items.length, line };
}

/** The plan and piece a piece of work is making, if any. */
export function planFor(folders: LibraryFolderInfo[], creativeId?: string | null) {
  if (!creativeId) return null;
  for (const f of folders) {
    const item = f.plan?.items.find((i) => i.work && (i.work.tool === 'gimp' ? `gimp_${i.work.slug}` : `model_${i.work.slug}`) === creativeId);
    if (item) return { folder: f, item };
  }
  return null;
}

export function PlanGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </svg>
  );
}

/**
 * What Ava is told when the piece on the stage is in a folder (Phase 3): the
 * folder, how much is in it, its style note, and to look at the set before a
 * brief — so piece 40 matches piece 1. Empty when it is in no folder.
 */
export function folderContextLine(folders: LibraryFolderInfo[], creativeId?: string | null, plans: PlanStates = {}): string {
  if (!creativeId) return '';
  const planned = planFor(folders, creativeId);
  const planBit = planned
    ? ` · WORKING FROM THE PACK PLAN "${planned.folder.plan!.title}": this is "${planned.item.name}" — ${planned.item.what} (${planProgress(planned.folder, plans[planned.folder.id]).line}). Build the brief on that plan line`
    : '';
  const ref = `creative:${creativeId}`;
  const homes = folders.filter((f) => f.members.some((m) => m.ref === ref));
  if (!homes.length) return planBit;
  const parts = homes.map((f) => {
    const path = pathTo(folders, f.id).map((x) => x.name).join(' / ');
    const others = f.members.length - 1;
    return `"${path}" (${others} other piece${others === 1 ? '' : 's'}${f.note ? `; THEIR STYLE NOTE: "${f.note}"` : '; no style note yet'})`;
  });
  return ` · IN FOLDER ${parts.join(' and ')} — look at the set with design_folder (action look) before you propose a brief, and hold what it shares${planBit}`;
}

/** Every folder, kept in step with the sidecar. */
export function useLibraryFolders() {
  const [folders, setFolders] = useState<LibraryFolderInfo[]>([]);
  const [missing, setMissing] = useState<Record<string, string[]>>({});
  const [gimpFinals, setGimpFinals] = useState<Record<string, string[]>>({});
  const [plans, setPlans] = useState<PlanStates>({});
  const [error, setError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  useEffect(() => {
    const sc = getSidecar();
    const onEvent = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; folders?: LibraryFolderInfo[]; missing?: Record<string, string[]>; gimpFinals?: Record<string, string[]>; plans?: PlanStates; error?: string; results?: Array<{ name: string; ok: boolean; error?: string }> };
      if (m.event === 'library_folders') {
        setFolders(m.folders ?? []);
        setMissing(m.missing ?? {});
        setGimpFinals(m.gimpFinals ?? {});
        setPlans(m.plans ?? {});
        setError(m.error ?? null);
      }
      if (m.event === 'library_upload_result' && m.results) {
        const failed = m.results.filter((r) => !r.ok);
        const added = m.results.length - failed.length;
        setUploadNote([
          added ? tt('library.folders.uploaded', '{n} added to the Library.').replace('{n}', String(added)) : '',
          ...failed.map((r) => `${r.name}: ${r.error ?? tt('library.folders.upload_failed', 'not added')}`),
        ].filter(Boolean).join(' '));
      }
    };
    sc.onAny(onEvent);
    sc.foldersLoad().catch(() => {});
    return () => { sc.offAny(onEvent); };
  }, []);
  return { folders, missing, gimpFinals, plans, error, clearError: () => setError(null), uploadNote, clearUploadNote: () => setUploadNote(null) };
}

const sc = () => getSidecar();

function dropped(e: DragEvent): { ref?: FolderRef; folder?: string } {
  const ref = e.dataTransfer.getData(DRAG_WORK);
  const folder = e.dataTransfer.getData(DRAG_FOLDER);
  return { ref: ref || undefined, folder: folder || undefined };
}

// ── Look ─────────────────────────────────────────────────────────────────────

const ACCENT_SOFT = 'color-mix(in srgb, var(--accent) 14%, transparent)';
const ACCENT_EDGE = 'color-mix(in srgb, var(--accent) 35%, transparent)';
const PANEL: CSSProperties = {
  background: 'rgba(26, 16, 40, 0.95)', border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
  borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
};
const INPUT: CSSProperties = {
  flex: 1, minWidth: 0, background: 'transparent', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
  borderRadius: 6, padding: '4px 8px', fontSize: 11.5, color: '#cdd6f4', outline: 'none',
};
const SMALL_BTN: CSSProperties = {
  background: ACCENT_SOFT, color: '#e0b0ff', border: 'none', borderRadius: 6, padding: '4px 10px',
  fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
};

export function FolderGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

// ── The folder button on every card ──────────────────────────────────────────

/** Where the menu goes: under its button, kept on screen. Fixed to the window,
 *  so no card or grid can clip it (a card clips anything that spills out). */
function menuSpot(anchor: HTMLElement | null, width = 240, height = 300): { left: number; top: number } {
  const r = anchor?.getBoundingClientRect();
  if (!r) return { left: 16, top: 16 };
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const below = r.bottom + 4;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 4) : below;
  return { left, top };
}

export function FolderMenu({ folders, itemRef, anchor, onClose }: { folders: LibraryFolderInfo[]; itemRef: FolderRef; anchor: HTMLElement | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const [spot] = useState(() => menuSpot(anchor));
  useEffect(() => {
    // Its own button toggles it, so a press there is not "away".
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // The page moving under a fixed menu would leave it floating off its card.
    const moved = () => onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', moved);
    window.addEventListener('scroll', moved, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', moved);
      window.removeEventListener('scroll', moved, true);
    };
  }, [onClose, anchor]);

  const rows: Array<{ f: LibraryFolderInfo; depth: number }> = [];
  const walk = (parent: string | null, depth: number) => { for (const f of childrenOf(folders, parent)) { rows.push({ f, depth }); walk(f.id, depth + 1); } };
  walk(null, 0);
  const make = () => {
    const n = name.trim();
    if (!n) return;
    sc().folderCreate(n, null, [{ ref: itemRef }]).catch(() => {});
    setName('');
  };

  return createPortal(
    <div
      ref={box}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
      onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
      // Solid, and fixed to the window so no card or grid can clip it.
      style={{ ...PANEL, background: '#1a1028', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', position: 'fixed', left: spot.left, top: spot.top, zIndex: 1000, width: 240, padding: 8 }}
    >
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6c7086', padding: '0 4px 6px' }}>{tt('library.folders.add_to', 'In folders')}</div>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {rows.length === 0 && <div style={{ fontSize: 11.5, color: '#a6adc8', padding: '6px 4px' }}>{tt('library.folders.none_yet', 'No folders yet. Name one below.')}</div>}
        {rows.map(({ f, depth }) => {
          const inIt = f.members.some((m) => m.ref === itemRef);
          return (
            <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `4px 4px 4px ${4 + depth * 12}px`, fontSize: 11.5, color: '#cdd6f4', cursor: 'pointer', borderRadius: 5 }}>
              <input
                type="checkbox"
                checked={inIt}
                onChange={() => { (inIt ? sc().folderRemove(f.id, [itemRef]) : sc().folderAdd(f.id, [{ ref: itemRef }])).catch(() => {}); }}
                style={{ width: 12, height: 12, accentColor: 'var(--accent)' }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingTop: 8, borderTop: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') make(); }} placeholder={tt('library.folders.new_placeholder', 'New folder')} style={INPUT} />
        <button onClick={make} disabled={!name.trim()} style={{ ...SMALL_BTN, opacity: name.trim() ? 1 : 0.4 }}>{tt('library.folders.create', 'Add')}</button>
      </div>
    </div>,
    document.body,
  );
}

/** "In folders" for the piece on a room's stage: which folders it is in, and a menu to change that. */
export function FolderPicker({ folders, itemRef }: { folders: LibraryFolderInfo[]; itemRef: FolderRef }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const homes = folders.filter((f) => f.members.some((m) => m.ref === itemRef));
  return (
    <>
      <button
        ref={btn}
        onClick={() => setOpen((o) => !o)}
        title={tt('library.folders.add_to_folder', 'Add to a folder')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, maxWidth: 260, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
          background: 'transparent', color: homes.length ? '#e0b0ff' : '#a6adc8',
          border: `1px solid ${homes.length ? ACCENT_EDGE : 'color-mix(in srgb, var(--accent) 20%, transparent)'}`,
        }}
      >
        <FolderGlyph size={12} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{homes.length ? homes.map((f) => f.name).join(', ') : tt('library.folders.add_to_folder', 'Add to a folder')}</span>
      </button>
      {open && <FolderMenu folders={folders} itemRef={itemRef} anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The plan's chip in a room: which plan, which piece, how far along. */
export function PlanChip({ folders, plans, creativeId }: { folders: LibraryFolderInfo[]; plans: PlanStates; creativeId?: string | null }) {
  const p = planFor(folders, creativeId);
  if (!p) return null;
  const prog = planProgress(p.folder, plans[p.folder.id]);
  return (
    <span title={p.item.what} style={{
      display: 'flex', alignItems: 'center', gap: 6, maxWidth: 320, padding: '4px 10px', borderRadius: 8, fontSize: 11, color: '#cdd6f4',
      border: `1px solid ${ACCENT_EDGE}`, background: ACCENT_SOFT,
    }}>
      <span style={{ color: 'var(--accent)', display: 'flex' }}><PlanGlyph size={12} /></span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.folder.plan!.title} · {p.item.name} · {prog.made}/{prog.total}</span>
    </span>
  );
}

const STATE_LOOK: Record<PlanItemStateInfo, { label: string; dot: string }> = {
  planned: { label: 'Planned', dot: 'rgba(108,112,134,0.5)' },
  started: { label: 'Started', dot: 'rgba(251,191,36,0.7)' },
  in_progress: { label: 'In progress', dot: '#fbbf24' },
  made: { label: 'Made', dot: '#34d399' },
};

/** The pack plan, opened from its pinned tile: theirs to agree, edit, add to and trim. Mirrors the extension. */
function PlanView({ folder, states, onClose }: { folder: LibraryFolderInfo; states: Record<string, PlanItemStateInfo>; onClose: () => void }) {
  const plan = folder.plan!;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', what: '', tool: 'gimp', folder: '' });
  const [adding, setAdding] = useState(false);
  const [why, setWhy] = useState(plan.status !== 'agreed');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const prog = planProgress(folder, states);
  const groups = new Map<string, typeof plan.items>();
  for (const i of plan.items) { const k = i.folder ?? ''; groups.set(k, [...(groups.get(k) ?? []), i]); }
  const saveEdit = (itemId: string | null) => {
    if (!draft.name.trim()) return;
    sc().planItem(folder.id, itemId, { name: draft.name, what: draft.what, tool: draft.tool, folder: draft.folder }).catch(() => {});
    setEditing(null); setAdding(false);
  };
  const link: CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11.5 };
  const field: CSSProperties = { ...INPUT, flex: 'none', fontSize: 12 };
  const editor = (itemId: string | null) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '6px 0' }}>
      <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={tt('library.plan.piece_name', 'Piece')} style={{ ...field, width: 140, borderColor: 'var(--accent)' }} />
      <input value={draft.what} onChange={(e) => setDraft({ ...draft, what: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(itemId); }} placeholder={tt('library.plan.piece_what', 'What it is, in one line')} style={{ ...field, flex: 1, minWidth: 180 }} />
      <select value={draft.tool} onChange={(e) => setDraft({ ...draft, tool: e.target.value })} style={{ ...field, background: '#1a1028' }}>
        <option value="gimp">GIMP</option><option value="blender">Blender</option><option value="other">{tt('library.plan.other', 'Other')}</option>
      </select>
      <input value={draft.folder} onChange={(e) => setDraft({ ...draft, folder: e.target.value })} placeholder={tt('library.plan.piece_folder', 'Folder (optional)')} style={{ ...field, width: 130 }} />
      <button onClick={() => saveEdit(itemId)} style={SMALL_BTN}>{tt('common.save', 'Save')}</button>
      <button onClick={() => { setEditing(null); setAdding(false); }} style={{ ...link, color: '#6c7086' }}>{tt('common.cancel', 'Cancel')}</button>
    </div>
  );

  return (
    <div style={{ ...PANEL, boxShadow: 'none', background: '#1a1028', border: `1px solid ${ACCENT_EDGE}`, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>
            <span style={{ color: 'var(--accent)', display: 'flex' }}><PlanGlyph size={15} /></span>{plan.title}
            <span style={{
              fontSize: 10, fontWeight: 400, padding: '2px 6px', borderRadius: 4,
              background: plan.status === 'agreed' ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
              color: plan.status === 'agreed' ? '#6ee7b7' : '#fde68a',
            }}>
              {plan.status === 'agreed' ? tt('library.plan.agreed', 'Agreed') : tt('library.plan.waiting', 'Waiting for you to agree it')}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: '#a6adc8' }}>{prog.line}</div>
        </div>
        {plan.status !== 'agreed' && (
          <button onClick={() => { sc().planAgree(folder.id).catch(() => {}); }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {tt('library.plan.agree', 'Agree the plan')}
          </button>
        )}
        <button onClick={onClose} aria-label="Close" style={{ ...link, color: '#6c7086' }}>✕</button>
      </div>
      {plan.status !== 'agreed' && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#6c7086' }}>{tt('library.plan.agree_note', 'Agreeing makes the folders inside this pack. Every piece still gets its own brief, one at a time.')}</div>
      )}
      <button onClick={() => setWhy((w) => !w)} style={{ ...link, marginTop: 8, color: '#e0b0ff' }}>
        {why ? tt('library.plan.hide_why', 'Hide Ava\'s reasoning') : tt('library.plan.show_why', 'Ava\'s reasoning')}
      </button>
      {why && <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.55, color: '#a6adc8' }}>{plan.reasoning}</div>}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[...groups.entries()].map(([group, items]) => (
          <div key={group}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6c7086' }}>
              {group ? <><FolderGlyph size={11} />{group}</> : tt('library.plan.in_pack', 'In the pack')}
            </div>
            {items.map((i) => {
              const st = states[i.id] ?? 'planned';
              if (editing === i.id) return <div key={i.id}>{editor(i.id)}</div>;
              return (
                <div key={i.id} onMouseEnter={() => setHoverRow(i.id)} onMouseLeave={() => setHoverRow((h) => (h === i.id ? null : h))}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px', borderRadius: 6, background: hoverRow === i.id ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'transparent' }}>
                  <span title={STATE_LOOK[st].label} style={{ marginTop: 6, width: 8, height: 8, flexShrink: 0, borderRadius: 999, background: STATE_LOOK[st].dot }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#cdd6f4' }}>
                      {i.name} <span style={{ fontSize: 10, color: '#6c7086' }}>· {i.tool === 'gimp' ? 'GIMP' : i.tool === 'blender' ? 'Blender' : tt('library.plan.other', 'Other')} · {tt(`library.plan.state.${st}`, STATE_LOOK[st].label)}{i.work ? ` · "${i.work.name}"` : ''}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#a6adc8' }}>{i.what}</div>
                  </div>
                  {hoverRow === i.id && (
                    <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => { setDraft({ name: i.name, what: i.what, tool: i.tool, folder: i.folder ?? '' }); setEditing(i.id); setAdding(false); }} title={tt('library.plan.edit', 'Change')} style={{ ...link, color: '#6c7086' }}>✎</button>
                      <button onClick={() => { sc().planItem(folder.id, i.id, null).catch(() => {}); }} title={tt('library.plan.remove', 'Take out of the plan')} style={{ ...link, color: '#6c7086' }}>✕</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, paddingTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderTop: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)' }}>
        {adding ? editor(null) : (
          <button onClick={() => { setDraft({ name: '', what: '', tool: 'gimp', folder: '' }); setAdding(true); setEditing(null); }} style={{ ...link, fontSize: 12, color: '#6c7086' }}>
            + {tt('library.plan.add', 'Add a piece')}
          </button>
        )}
        {!adding && (confirmDelete ? (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#a6adc8' }}>
            {tt('library.plan.delete_confirm', 'Delete the plan? The work and folders stay.')}
            <button onClick={() => { sc().planDelete(folder.id).catch(() => {}); onClose(); }} style={{ ...SMALL_BTN, background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>{tt('library.plan.delete_yes', 'Delete plan')}</button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...link, color: '#6c7086' }}>{tt('common.cancel', 'Cancel')}</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ ...link, marginLeft: 'auto', color: '#6c7086' }}>{tt('library.plan.delete', 'Delete plan')}</button>
        ))}
      </div>
    </div>
  );
}

/** The open folder's style note: one line, theirs, read by Ava before every brief. */
function StyleNote({ folder }: { folder: LibraryFolderInfo }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(folder.note ?? '');
  useEffect(() => { if (!editing) setText(folder.note ?? ''); }, [folder.note, editing]);
  const save = () => { if (text.trim() !== (folder.note ?? '')) sc().folderNote(folder.id, text).catch(() => {}); setEditing(false); };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, fontSize: 11 }}>
      <span style={{ flexShrink: 0, paddingTop: 2, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6c7086' }}>{tt('library.folders.style_note', 'Style note')}</span>
      {editing ? (
        <input
          autoFocus value={text} maxLength={400}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setText(folder.note ?? ''); setEditing(false); } }}
          onBlur={save}
          placeholder={tt('library.folders.style_note_placeholder', 'How everything in here looks, e.g. flat, two colours, 2px dark outline, 64px grid')}
          style={{ ...INPUT, borderColor: 'var(--accent)', fontSize: 12 }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title={tt('library.folders.style_note_title', 'Ava follows this in every brief for work in this folder')}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12,
            color: folder.note ? '#cdd6f4' : '#6c7086', fontStyle: folder.note ? 'normal' : 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {folder.note ?? tt('library.folders.style_note_none', 'None yet. Add one line on how everything in here looks.')} <span style={{ fontStyle: 'normal', opacity: 0.6 }}>✎</span>
        </button>
      )}
    </div>
  );
}

export function FolderButton({ folders, itemRef, show }: { folders: LibraryFolderInfo[]; itemRef: FolderRef; show: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const count = folders.filter((f) => f.members.some((m) => m.ref === itemRef)).length;
  return (
    <>
      <button
        ref={btn}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={count ? tt('library.folders.in_n', 'In {n} folder(s)').replace('{n}', String(count)) : tt('library.folders.add_to_folder', 'Add to a folder')}
        style={{
          position: 'absolute', left: 6, top: 6, zIndex: 20, display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, color: '#fff',
          background: count || open ? 'color-mix(in srgb, var(--accent) 85%, transparent)' : 'rgba(0,0,0,0.6)',
          opacity: count || open || show ? 1 : 0, transition: 'opacity 0.15s',
        }}
      >
        <FolderGlyph size={12} />{count ? <span>{count}</span> : null}
      </button>
      {open && <FolderMenu folders={folders} itemRef={itemRef} anchor={btn.current} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A card that can be dragged onto a folder, with its folder button. */
export function FolderCard({ folders, itemRef, onDragging, children }: { folders: LibraryFolderInfo[]; itemRef: FolderRef | null; onDragging: (on: boolean) => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  if (!itemRef) return <>{children}</>;
  return (
    <div
      style={{ position: 'relative' }}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_WORK, itemRef); e.dataTransfer.effectAllowed = 'copy'; onDragging(true); }}
      onDragEnd={() => onDragging(false)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      <FolderButton folders={folders} itemRef={itemRef} show={hover} />
    </div>
  );
}

// ── While dragging work, from any tab: drop it on a folder ───────────────────

export function FolderDropBar({ folders, onDone }: { folders: LibraryFolderInfo[]; onDone: () => void }) {
  const [over, setOver] = useState<string | null>(null);
  const rows: Array<{ f: LibraryFolderInfo; label: string }> = [];
  const walk = (parent: string | null, prefix: string) => { for (const f of childrenOf(folders, parent)) { rows.push({ f, label: prefix + f.name }); walk(f.id, `${prefix}${f.name} / `); } };
  walk(null, '');
  return (
    <div style={{ ...PANEL, position: 'sticky', top: 0, zIndex: 30, marginBottom: 12, padding: 8, border: `1px dashed ${ACCENT_EDGE}` }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6c7086', marginBottom: 6 }}>
        {rows.length ? tt('library.folders.drop_here', 'Drop on a folder') : tt('library.folders.drop_none', 'No folders yet. Make one in Folders.')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {rows.map(({ f, label }) => (
          <div
            key={f.id}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_WORK)) { e.preventDefault(); setOver(f.id); } }}
            onDragLeave={() => setOver((o) => (o === f.id ? null : o))}
            onDrop={(e) => { e.preventDefault(); const { ref } = dropped(e); if (ref) sc().folderAdd(f.id, [{ ref }]).catch(() => {}); setOver(null); onDone(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, fontSize: 11.5,
              border: `1px solid ${over === f.id ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 18%, transparent)'}`,
              background: over === f.id ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'transparent',
              color: over === f.id ? '#e0b0ff' : '#a6adc8',
            }}
          >
            <FolderGlyph size={12} />{label}
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Download a folder (Phase 2) ──────────────────────────────────────────────

interface StoreInfo { id: string; name: string; status: 'ready' | 'blocked' | 'target'; summary: string; note: string }
interface ExportSummary { name: string; items: number; models: number; warnings: Array<{ item: string; message: string }>; blender: boolean }
interface ExportOutcome { ok?: boolean; path?: string; files?: number; bytes?: number; warnings?: Array<{ item: string; message: string }>; error?: string }

const sizeLabel = (b = 0) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`);

/** What a download will hold, then where it goes: a real folder, or a zip. Mirrors the extension. */
function DownloadPanel({ folderId, onClose }: { folderId: string; onClose: () => void }) {
  const [summary, setSummary] = useState<ExportSummary | null | undefined>(undefined);
  const [zip, setZip] = useState(false);
  // The making record goes in by default (plan, Phase 4): it is what a store's AI disclosure is written from.
  const [record, setRecord] = useState(true);
  // Prepared for a store (Phase 5): '' is a plain download.
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [store, setStore] = useState('');
  const chosen = stores.find((s) => s.id === store);
  const zipOnly = store === 'gumroad';
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState<ExportOutcome | null>(null);
  useEffect(() => {
    const onEvent = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; id?: string } & Record<string, unknown>;
      if (m.id !== folderId) return;
      if (m.event === 'folder_export_preview') { setSummary((m.summary as ExportSummary | null) ?? null); setStores((m.stores as StoreInfo[]) ?? []); }
      if (m.event === 'folder_export_progress') setProgress({ done: Number(m.done), total: Number(m.total), label: String(m.label ?? '') });
      if (m.event === 'folder_export_result') { setProgress(null); setResult(m as ExportOutcome); }
    };
    getSidecar().onAny(onEvent);
    sc().folderExportPreview(folderId).catch(() => {});
    return () => { getSidecar().offAny(onEvent); };
  }, [folderId]);

  const busy = !!progress;
  const start = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const dest = await open({ directory: true, multiple: false, title: zip ? tt('library.export.where_zip', 'Save the zip here') : tt('library.export.where', 'Download here') });
    if (!dest || Array.isArray(dest)) return;
    setResult(null);
    setProgress({ done: 0, total: 1, label: '' });
    sc().folderExport(folderId, String(dest), zip || zipOnly, record, store || undefined).catch(() => setProgress(null));
  };
  const reveal = async (path?: string) => {
    if (!path) return;
    try { const { revealItemInDir } = await import('@tauri-apps/plugin-opener'); await revealItemInDir(path); } catch { /* the path is shown either way */ }
  };
  const warningList = (list: Array<{ item: string; message: string }>) => (
    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
      {list.map((w, i) => <li key={i} style={{ fontSize: 11.5, color: '#fcd34d', marginTop: 3 }}><b style={{ fontWeight: 600 }}>{w.item}:</b> {w.message}</li>)}
    </ul>
  );
  const radio: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#a6adc8' };

  return (
    <div style={{ ...PANEL, boxShadow: 'none', background: '#1a1028', border: `1px solid ${ACCENT_EDGE}`, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{tt('library.export.title', 'Download as a folder')}</div>
          {summary === undefined && <div style={{ marginTop: 4, fontSize: 11.5, color: '#6c7086' }}>{tt('library.export.reading', 'Looking at what\'s in it…')}</div>}
          {summary && (
            <div style={{ marginTop: 4, fontSize: 11.5, color: '#a6adc8' }}>
              {tt('library.export.summary', '{items} pieces, finished files only. Each model gets its own folder with .fbx, .blend, .glb and its textures.').replace('{items}', String(summary.items))}
            </div>
          )}
          {summary?.warnings.length ? warningList(summary.warnings) : null}
        </div>
        <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#6c7086', cursor: 'pointer' }}>✕</button>
      </div>
      {!result && stores.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#a6adc8' }}>
            {tt('library.export.prepare_for', 'Prepare for')}
            <select value={store} onChange={(e) => setStore(e.target.value)} disabled={busy}
              style={{ ...INPUT, flex: 'none', background: '#1a1028', fontSize: 12 }}>
              <option value="">{tt('library.export.no_store', 'No store: just the folder')}</option>
              {stores.filter((s) => s.status !== 'blocked').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              {stores.filter((s) => s.status === 'blocked').map((s) => <option key={s.id} value={s.id} disabled>{s.name} — {tt('library.export.blocked', 'not available')}</option>)}
            </select>
          </label>
          {chosen && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
              <div style={{ color: '#a6adc8' }}>{chosen.summary}</div>
              <div style={{ color: '#fcd34d' }}>{chosen.note}</div>
              <div style={{ color: '#6c7086' }}>{tt('library.export.only_store', 'Prepared for {store}: only {store} decides whether it is accepted.').split('{store}').join(chosen.name)}</div>
              <div style={{ color: '#6c7086' }}>
                {tt('library.export.yours', 'Declaring AI use is yours to do: Ava never does it for you. Read the store’s current rules before you submit. This is not legal advice.')}{' '}
                <button type="button" onClick={() => void openGuide()} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 11.5 }}>{tt('library.export.guide', 'What each store allows')}</button>
              </div>
            </div>
          )}
          {!chosen && stores.some((s) => s.status === 'blocked') && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#6c7086' }}>
              {tt('library.export.not_available', 'Not available')}: {stores.filter((s) => s.status === 'blocked').map((s) => `${s.name} (${s.note.split('.')[0].toLowerCase()})`).join('; ')}.
            </div>
          )}
        </div>
      )}
      {!result && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <label style={radio}><input type="radio" checked={!zip && !zipOnly} onChange={() => setZip(false)} disabled={busy || zipOnly} style={{ accentColor: 'var(--accent)' }} />{tt('library.export.as_folder', 'A folder')}</label>
          <label style={radio}><input type="radio" checked={zip || zipOnly} onChange={() => setZip(true)} disabled={busy || zipOnly} style={{ accentColor: 'var(--accent)' }} />{tt('library.export.as_zip', 'A zip')}</label>
          <label style={radio} title={tt('library.export.record_title', 'How each piece was made — which AI did what, your direction, fonts and licences. What a store\'s AI disclosure is written from.')}>
            <input type="checkbox" checked={record} onChange={() => setRecord((r) => !r)} disabled={busy} style={{ width: 12, height: 12, accentColor: 'var(--accent)' }} />{tt('library.export.record', 'Include how it was made')}
          </label>
          <button onClick={() => { start().catch(() => {}); }} disabled={busy || !summary}
            style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: busy || !summary ? 0.4 : 1 }}>
            {busy ? tt('library.export.working', 'Downloading…') : tt('library.export.choose', 'Choose where, and download')}
          </button>
        </div>
      )}
      {progress && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: ACCENT_SOFT }}>
            <div style={{ height: '100%', background: 'var(--accent)', width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`, transition: 'width 0.2s' }} />
          </div>
          <div style={{ marginTop: 4, fontSize: 10.5, color: '#6c7086', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{progress.label}</div>
        </div>
      )}
      {result && (
        <div style={{ marginTop: 12, fontSize: 11.5 }}>
          {result.ok ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', color: '#cdd6f4' }}>
              <span>{tt('library.export.done', 'Done: {files} files, {size}.').replace('{files}', String(result.files ?? 0)).replace('{size}', sizeLabel(result.bytes))}</span>
              <button onClick={() => { reveal(result.path).catch(() => {}); }} style={{ background: 'none', border: 'none', padding: 0, color: '#e0b0ff', cursor: 'pointer', fontSize: 11.5 }}>{tt('library.export.show', 'Show it')}</button>
              <button onClick={() => setResult(null)} style={{ background: 'none', border: 'none', padding: 0, color: '#6c7086', cursor: 'pointer', fontSize: 11.5 }}>{tt('library.export.again', 'Download again')}</button>
            </div>
          ) : (
            <div style={{ color: '#fca5a5' }}>{result.error ?? tt('library.export.failed', 'The download failed.')}</div>
          )}
          {result.warnings?.length ? warningList(result.warnings) : null}
        </div>
      )}
    </div>
  );
}

// ── The folder sidebar, beside the work on every Assets tab ─────────────────
// His call, 9 Nov: folders down the side, collapsible, instead of tiles along
// the top. Always there to drop on, whichever tab is open; renaming, deleting
// and downloading stay in the Folders tab. Mirrors the extension.

const SIDEBAR_KEY = 'ava-library-folder-sidebar';
const SIDEBAR_EVENT = 'ava-library-folder-sidebar';

/** Height from where this sits down to the bottom of the window, kept right as
 *  the page scrolls or the window resizes — so the sidebar always reaches the
 *  bottom and its collapse tab sits in the middle of what you can see. */
function useFillHeight(ref: { current: HTMLElement | null }): number {
  const [h, setH] = useState(400);
  useEffect(() => {
    const measure = () => {
      const top = ref.current?.getBoundingClientRect().top ?? 0;
      setH(Math.max(200, window.innerHeight - Math.max(top, 8) - 12));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [ref]);
  return h;
}

/** Open or collapsed, remembered on this machine. */
export function useFolderSidebar(): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== 'closed'; } catch { return true; }
  });
  // The sidebar and the Folders tab's tree are one setting: fold one, both fold.
  useEffect(() => {
    const sync = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener(SIDEBAR_EVENT, sync);
    return () => window.removeEventListener(SIDEBAR_EVENT, sync);
  }, []);
  const toggle = () => {
    const next = !open;
    try { localStorage.setItem(SIDEBAR_KEY, next ? 'open' : 'closed'); } catch { /* private window */ }
    window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT, { detail: next }));
  };
  return [open, toggle];
}

/** The tab that folds the folder tree away or opens it: on its right edge, halfway down. */
function CollapseTab({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? tt('library.folders.hide_sidebar', 'Hide folders') : tt('library.folders.show_sidebar', 'Show folders');
  return (
    <button
      onClick={onToggle}
      title={label}
      aria-label={label}
      style={{
        position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)', zIndex: 10, width: 20, height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'pointer', fontSize: 12,
        background: '#1a1028', color: '#6c7086', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
      }}
    >
      {open ? '‹' : '›'}
    </button>
  );
}

/**
 * The folded-away tree: an icon for every folder, in tree order, so work can
 * still be dropped and folders opened or nested without unfolding (his ask,
 * 9 Nov). Hovering shows the name — drawn above the page, because the strip
 * scrolls and would clip it. Mirrors the extension.
 */
function CollapsedStrip({ folders, height, boxRef, onOpenFolder, onToggle }: {
  folders: LibraryFolderInfo[];
  height: number;
  boxRef: { current: HTMLDivElement | null };
  onOpenFolder: (id: string) => void;
  onToggle: () => void;
}) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const rows: Array<{ f: LibraryFolderInfo; depth: number; path: string }> = [];
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const f of childrenOf(folders, parent)) { rows.push({ f, depth, path: prefix + f.name }); walk(f.id, depth + 1, `${prefix}${f.name} / `); }
  };
  walk(null, 0, '');
  const show = (e: { currentTarget: HTMLElement }, text: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: r.right + 8, y: r.top + r.height / 2 });
  };
  return (
    <div ref={boxRef} style={{
      position: 'sticky', top: 8, alignSelf: 'flex-start', width: 36, height, flexShrink: 0, borderRadius: 8,
      border: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0' }}>
        {rows.map(({ f, depth, path }) => {
          const lit = dropOn === f.id;
          const size = depth ? 22 : 26;
          return (
            <div
              key={f.id}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, f.id); e.dataTransfer.effectAllowed = 'move'; setTip(null); }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_WORK) || e.dataTransfer.types.includes(DRAG_FOLDER)) { e.preventDefault(); setDropOn(f.id); } }}
              onDragEnter={(e) => show(e, path)}
              onDragLeave={() => { setDropOn((d) => (d === f.id ? null : d)); setTip(null); }}
              onDrop={(e) => {
                e.preventDefault();
                setDropOn(null);
                setTip(null);
                const { ref, folder } = dropped(e);
                if (folder && folder !== f.id) sc().folderMove(folder, f.id).catch(() => {});
                else if (ref) sc().folderAdd(f.id, [{ ref }]).catch(() => {});
              }}
              onClick={() => onOpenFolder(f.id)}
              onMouseEnter={(e) => { show(e, path); setHover(f.id); }}
              onMouseLeave={() => { setTip(null); setHover((h) => (h === f.id ? null : h)); }}
              aria-label={path}
              style={{
                width: size, height: size, flexShrink: 0, marginLeft: depth ? 6 : 0, borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: lit ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : hover === f.id ? ACCENT_SOFT : 'transparent',
                outline: lit ? '1px solid var(--accent)' : 'none',
                color: lit || hover === f.id ? '#e0b0ff' : '#6c7086',
              }}
            >
              <FolderGlyph size={depth ? 12 : 15} />
            </div>
          );
        })}
      </div>
      <CollapseTab open={false} onToggle={onToggle} />
      {tip && createPortal(
        <div style={{
          ...PANEL, background: '#1a1028', position: 'fixed', left: tip.x, top: tip.y, transform: 'translateY(-50%)', zIndex: 1000,
          pointerEvents: 'none', whiteSpace: 'nowrap', padding: '4px 8px', fontSize: 11.5, color: '#cdd6f4', borderRadius: 6,
          border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
        }}>
          {tip.text}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function FolderSidebar({ folders, open, onToggle, onOpenFolder }: {
  folders: LibraryFolderInfo[];
  open: boolean;
  onToggle: () => void;
  onOpenFolder: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const height = useFillHeight(box);
  const countIn = (id: string): number => {
    const f = folders.find((x) => x.id === id);
    return (f?.members.length ?? 0) + childrenOf(folders, id).reduce((n, k) => n + countIn(k.id), 0);
  };
  const make = () => {
    const n = name.trim();
    if (n) sc().folderCreate(n, null).catch(() => {});
    setName('');
    setMaking(false);
  };

  const tab = <CollapseTab open={open} onToggle={onToggle} />;

  if (!open) {
    return <CollapsedStrip folders={folders} height={height} boxRef={box} onOpenFolder={onOpenFolder} onToggle={onToggle} />;
  }

  const node = (f: LibraryFolderInfo, depth: number): ReactNode => {
    const kids = childrenOf(folders, f.id);
    const isOpen = expanded.has(f.id);
    const lit = dropOn === f.id;
    return (
      <div key={f.id}>
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, f.id); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_WORK) || e.dataTransfer.types.includes(DRAG_FOLDER)) { e.preventDefault(); setDropOn(f.id); } }}
          onDragLeave={() => setDropOn((d) => (d === f.id ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            setDropOn(null);
            const { ref, folder } = dropped(e);
            if (folder && folder !== f.id) sc().folderMove(folder, f.id).catch(() => {});
            else if (ref) sc().folderAdd(f.id, [{ ref }]).catch(() => {});
          }}
          onClick={() => onOpenFolder(f.id)}
          onMouseEnter={() => setHover(f.id)}
          onMouseLeave={() => setHover((h) => (h === f.id ? null : h))}
          title={tt('library.folders.tile_title', 'Open, or drop work here')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: `4px 6px 4px ${2 + depth * 12}px`, borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: lit ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : hover === f.id ? 'color-mix(in srgb, var(--accent) 9%, transparent)' : 'transparent',
            outline: lit ? '1px solid var(--accent)' : 'none',
            color: lit ? '#e0b0ff' : hover === f.id ? '#cdd6f4' : '#a6adc8',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; }); }}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            style={{ width: 14, background: 'none', border: 'none', color: '#6c7086', fontSize: 9, cursor: 'pointer', padding: 0, visibility: kids.length ? 'visible' : 'hidden' }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <FolderGlyph size={13} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
          <span style={{ fontSize: 10, color: '#6c7086' }}>{countIn(f.id) || ''}</span>
        </div>
        {isOpen && kids.map((k) => node(k, depth + 1))}
      </div>
    );
  };

  return (
    <aside ref={box} style={{ ...PANEL, boxShadow: 'none', position: 'sticky', top: 8, alignSelf: 'flex-start', width: 224, height, boxSizing: 'border-box', flexShrink: 0, padding: 8, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '4px 6px', marginBottom: 4 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, color: '#6c7086' }}>{tt('library.folders.title', 'Folders')}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {childrenOf(folders, null).map((f) => node(f, 0))}
        {folders.length === 0 && (
          <div style={{ padding: '8px 6px', fontSize: 11.5, lineHeight: 1.55, color: '#a6adc8' }}>
            {tt('library.folders.sidebar_empty', 'Make a folder, then drag work onto it. The work stays where it is; the folder points at it.')}
          </div>
        )}
      </div>
      <div style={{ marginTop: 4, paddingTop: 6, borderTop: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)' }}>
        {making ? (
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') make(); if (e.key === 'Escape') { setMaking(false); setName(''); } }}
            onBlur={make}
            placeholder={tt('library.folders.new_placeholder', 'New folder')}
            style={{ ...INPUT, width: '100%', boxSizing: 'border-box', borderColor: 'var(--accent)', fontSize: 12 }}
          />
        ) : (
          <button onClick={() => setMaking(true)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '4px 6px', color: '#6c7086', fontSize: 12, cursor: 'pointer', borderRadius: 6 }}>
            + {tt('library.folders.new', 'New folder')}
          </button>
        )}
      </div>
      {tab}
    </aside>
  );
}

// ── The Folders view ─────────────────────────────────────────────────────────

export interface WorkPart { key: string; label: string }
export interface FolderItem { ref: FolderRef; title: string; card: ReactNode; parts?: WorkPart[] }

export function FoldersView({
  folders, missing, error, onClearError, items, uploadNote, onClearUploadNote, initialOpenId = null, plans = {},
}: {
  folders: LibraryFolderInfo[];
  missing: Record<string, string[]>;
  error: string | null;
  onClearError: () => void;
  items: Map<FolderRef, FolderItem>;
  uploadNote: string | null;
  onClearUploadNote: () => void;
  /** Open at this folder: a folder tile in All was clicked. */
  initialOpenId?: string | null;
  /** Each pack plan's pieces and how far along they are. */
  plans?: PlanStates;
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(pathTo(folders, initialOpenId).map((f) => f.id)));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [making, setMaking] = useState(false);
  const [picking, setPicking] = useState<FolderRef | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverMember, setHoverMember] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  // The tree matches the sidebar on the other tabs: full height, scrolling,
  // the collapse tab halfway down — and folded or open together with it.
  const [treeOpen, toggleTree] = useFolderSidebar();
  const treeBox = useRef<HTMLDivElement>(null);
  const treeHeight = useFillHeight(treeBox);

  useEffect(() => { if (openId && !folders.some((f) => f.id === openId)) setOpenId(null); }, [folders, openId]);
  // A plan waiting for them opens by itself, so it is never missed.
  useEffect(() => { setPlanOpen(!!folders.find((f) => f.id === openId)?.plan && folders.find((f) => f.id === openId)?.plan?.status !== 'agreed'); }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = openId ? folders.find((f) => f.id === openId) ?? null : null;
  const crumbs = useMemo(() => pathTo(folders, openId), [folders, openId]);
  const subfolders = childrenOf(folders, openId);
  const countIn = (id: string): number => {
    const f = folders.find((x) => x.id === id);
    return (f?.members.length ?? 0) + childrenOf(folders, id).reduce((n, k) => n + countIn(k.id), 0);
  };
  const openFolder = (id: string | null) => {
    setOpenId(id);
    setPicking(null);
    if (id) setExpanded((s) => { const n = new Set(s); for (const f of pathTo(folders, id)) n.add(f.id); return n; });
  };
  const makeFolder = () => {
    const n = newName.trim();
    if (!n) return;
    sc().folderCreate(n, openId).catch(() => {});
    setNewName('');
    setMaking(false);
    if (openId) setExpanded((s) => new Set(s).add(openId));
  };
  const dropTarget = (id: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes(DRAG_WORK) || e.dataTransfer.types.includes(DRAG_FOLDER)) { e.preventDefault(); setDropOn(id ?? '__top'); }
    },
    onDragLeave: () => setDropOn((d) => (d === (id ?? '__top') ? null : d)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDropOn(null);
      const { ref, folder } = dropped(e);
      if (folder && folder !== id) sc().folderMove(folder, id).catch(() => {});
      else if (ref && id) sc().folderAdd(id, [{ ref }]).catch(() => {});
    },
  });

  // A plain function, not a component: a component made inside render remounts
  // every render, and a remounted drag source cancels the drag.
  const treeNode = (f: LibraryFolderInfo, depth: number): ReactNode => {
    const kids = childrenOf(folders, f.id);
    const isOpen = expanded.has(f.id);
    const active = openId === f.id;
    const hovered = hoverNode === f.id;
    return (
      <div key={f.id}>
        <div
          draggable={renaming !== f.id}
          onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, f.id); e.dataTransfer.effectAllowed = 'move'; }}
          {...dropTarget(f.id)}
          onClick={() => openFolder(f.id)}
          onMouseEnter={() => setHoverNode(f.id)}
          onMouseLeave={() => setHoverNode((h) => (h === f.id ? null : h))}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: `5px 4px 5px ${4 + depth * 14}px`, borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: dropOn === f.id ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : active ? ACCENT_SOFT : hovered ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent',
            outline: dropOn === f.id ? '1px solid var(--accent)' : 'none',
            color: active ? '#e0b0ff' : '#a6adc8',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; }); }}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            style={{ width: 14, background: 'none', border: 'none', color: '#6c7086', fontSize: 9, cursor: 'pointer', padding: 0, visibility: kids.length ? 'visible' : 'hidden' }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <FolderGlyph size={13} />
          {renaming === f.id ? (
            <input
              autoFocus
              defaultValue={f.name}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { sc().folderRename(f.id, (e.target as HTMLInputElement).value).catch(() => {}); setRenaming(null); }
                if (e.key === 'Escape') setRenaming(null);
              }}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value.trim() !== f.name) sc().folderRename(f.id, e.target.value).catch(() => {}); setRenaming(null); }}
              style={{ ...INPUT, padding: '1px 6px', fontSize: 12, borderColor: 'var(--accent)' }}
            />
          ) : (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
          )}
          {hovered && renaming !== f.id ? (
            <span style={{ display: 'flex', gap: 2 }}>
              <NodeBtn label={tt('library.folders.rename', 'Rename')} onClick={() => setRenaming(f.id)}>✎</NodeBtn>
              <NodeBtn label={tt('library.folders.delete', 'Delete folder')} onClick={() => setConfirmDelete(f.id)}>🗑</NodeBtn>
            </span>
          ) : (
            <span style={{ fontSize: 10, color: '#6c7086' }}>{countIn(f.id) || ''}</span>
          )}
        </div>
        {confirmDelete === f.id && (
          <div style={{ ...PANEL, boxShadow: 'none', margin: `4px 0 4px ${4 + depth * 14}px`, padding: 8, fontSize: 11.5, color: '#a6adc8' }}>
            <div style={{ marginBottom: 6 }}>
              {tt('library.folders.delete_confirm', 'Delete "{name}"? Your work stays in the Library.').replace('{name}', f.name)}
              {kids.length ? ` ${tt('library.folders.delete_moves_up', 'Folders inside it move up a level.')}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { sc().folderDelete(f.id).catch(() => {}); setConfirmDelete(null); }} style={{ ...SMALL_BTN, background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>{tt('library.folders.delete_yes', 'Delete folder')}</button>
              <button onClick={() => setConfirmDelete(null)} style={{ ...SMALL_BTN, background: 'transparent', color: '#6c7086' }}>{tt('common.cancel', 'Cancel')}</button>
            </div>
          </div>
        )}
        {isOpen && kids.map((k) => treeNode(k, depth + 1))}
      </div>
    );
  };

  const members = open?.members ?? [];
  const lost = open ? new Set(missing[open.id] ?? []) : new Set<string>();

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {!treeOpen ? (
        <CollapsedStrip folders={folders} height={treeHeight} boxRef={treeBox} onOpenFolder={(id) => openFolder(id)} onToggle={toggleTree} />
      ) : (
      <aside ref={treeBox} style={{ ...PANEL, boxShadow: 'none', position: 'sticky', top: 8, alignSelf: 'flex-start', width: 224, height: treeHeight, boxSizing: 'border-box', flexShrink: 0, padding: 8, display: 'flex', flexDirection: 'column' }}>
        <div
          {...dropTarget(null)}
          onClick={() => openFolder(null)}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: openId === null ? '#e0b0ff' : '#cdd6f4',
            background: dropOn === '__top' ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'transparent',
          }}
        >
          <span>{tt('library.folders.title', 'Folders')}</span>
          <span style={{ fontSize: 10, fontWeight: 400, color: '#6c7086' }}>{folders.length || ''}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {childrenOf(folders, null).map((f) => treeNode(f, 0))}
          {folders.length === 0 && (
            <div style={{ padding: '10px 8px', fontSize: 11.5, lineHeight: 1.55, color: '#a6adc8' }}>
              {tt('library.folders.empty_tree', 'Make folders to organise your work your own way. Nothing moves: a folder just points at work, and one piece can be in several.')}
            </div>
          )}
        </div>
        <CollapseTab open onToggle={toggleTree} />
      </aside>
      )}

      <section style={{ flex: 1, minWidth: 0 }} {...(openId ? dropTarget(openId) : {})}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, fontSize: 12 }}>
            <CrumbBtn current={!crumbs.length} onClick={() => openFolder(null)}>{tt('library.folders.title', 'Folders')}</CrumbBtn>
            {crumbs.map((c, i) => (
              <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <span style={{ color: '#6c7086' }}>/</span>
                <CrumbBtn current={i === crumbs.length - 1} onClick={() => openFolder(c.id)}>{c.name}</CrumbBtn>
              </span>
            ))}
          </nav>
          {making ? (
            <span style={{ display: 'flex', gap: 4 }}>
              <input
                autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') makeFolder(); if (e.key === 'Escape') { setMaking(false); setNewName(''); } }}
                placeholder={tt('library.folders.new_placeholder', 'New folder')}
                style={{ ...INPUT, width: 180, flex: 'none', borderColor: 'var(--accent)', padding: '5px 8px', fontSize: 12 }}
              />
              <button onClick={makeFolder} disabled={!newName.trim()} style={{ ...SMALL_BTN, opacity: newName.trim() ? 1 : 0.4 }}>{tt('library.folders.create', 'Add')}</button>
            </span>
          ) : (
            <button onClick={() => setMaking(true)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'transparent', color: '#a6adc8', fontSize: 12, cursor: 'pointer' }}>
              + {open ? tt('library.folders.new_inside', 'Folder inside') : tt('library.folders.new', 'New folder')}
            </button>
          )}
          {open && (
            <button onClick={() => setDownloading((d) => !d)} title={tt('library.export.button_title', 'Download this folder as a real folder or a zip')}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'transparent', color: '#a6adc8', fontSize: 12, cursor: 'pointer' }}>
              {tt('library.export.button', 'Download')}
            </button>
          )}
          <button
            onClick={() => { uploadToLibrary(openId ?? undefined).catch(() => {}); }}
            title={tt('library.folders.upload_title', 'Copy your own files into the Library. They are recorded as your work.')}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${ACCENT_EDGE}`, background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: '#e0b0ff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {open ? tt('library.folders.upload_here', 'Upload here') : tt('library.folders.upload', 'Upload')}
          </button>
        </div>

        {open && <StyleNote key={open.id} folder={open} />}
        {open?.plan && planOpen && <PlanView key={`plan-${open.id}`} folder={open} states={plans[open.id] ?? {}} onClose={() => setPlanOpen(false)} />}
        {open && downloading && <DownloadPanel key={open.id} folderId={open.id} onClose={() => setDownloading(false)} />}
        {error && <Note tone="error" onClose={onClearError}>{error}</Note>}
        {uploadNote && <Note tone="info" onClose={onClearUploadNote}>{uploadNote}</Note>}

        {/* The pack plan, pinned first: it looks like a folder but never ships in a download. */}
        {open?.plan && !planOpen && (
          <button onClick={() => setPlanOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 440, marginBottom: 8, padding: '10px 12px', borderRadius: 10,
            textAlign: 'left', cursor: 'pointer', fontSize: 12, border: `1px solid ${ACCENT_EDGE}`, background: ACCENT_SOFT,
          }}>
            <span style={{ color: 'var(--accent)', display: 'flex' }}><PlanGlyph size={18} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tt('library.plan.tile', 'Plan')}: {open.plan.title}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: '#a6adc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {open.plan.status === 'agreed' ? planProgress(open, plans[open.id]).line : tt('library.plan.waiting', 'Waiting for you to agree it')}
              </span>
            </span>
          </button>
        )}

        {subfolders.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 16 }}>
            {subfolders.map((f) => (
              <div
                key={f.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(DRAG_FOLDER, f.id); e.dataTransfer.effectAllowed = 'move'; }}
                {...dropTarget(f.id)}
                onClick={() => openFolder(f.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 10, cursor: 'pointer', fontSize: 12,
                  background: dropOn === f.id ? ACCENT_SOFT : 'rgba(26, 16, 40, 0.6)',
                  border: `1px solid ${dropOn === f.id ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 12%, transparent)'}`,
                }}
              >
                <span style={{ color: 'var(--accent)', display: 'flex' }}><FolderGlyph size={18} /></span>
                <span style={{ flex: 1, minWidth: 0, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontSize: 10, color: '#6c7086' }}>{countIn(f.id) || ''}</span>
              </div>
            ))}
          </div>
        )}

        {open && members.length === 0 && subfolders.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#a6adc8', borderRadius: 14, border: '1px dashed color-mix(in srgb, var(--accent) 20%, transparent)' }}>
            {tt('library.folders.empty', 'Nothing here yet. Use the folder button on any card, in any tab, or drag work here.')}
          </div>
        )}

        {members.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {members.map((m) => {
              const item = items.get(m.ref);
              const isFile = m.ref.startsWith('file:');
              return (
                <div key={m.ref} style={{ position: 'relative' }} onMouseEnter={() => setHoverMember(m.ref)} onMouseLeave={() => setHoverMember((h) => (h === m.ref ? null : h))}>
                  {item ? item.card : (
                    <div style={{ minHeight: 150, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 12, borderRadius: 10, border: '1px dashed color-mix(in srgb, var(--accent) 20%, transparent)', fontSize: 11.5, color: '#a6adc8' }}>
                      <div style={{ color: '#cdd6f4', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isFile ? m.ref.slice(5).split('/').pop() : m.ref}</div>
                      <div style={{ marginTop: 4 }}>
                        {isFile && lost.has(m.ref.slice(5))
                          ? tt('library.folders.file_missing', 'This file isn\'t there now. If it is on a drive that isn\'t plugged in, it will come back.')
                          : tt('library.folders.other_project', 'A file in another project. Open that project to see it.')}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => { sc().folderRemove(open!.id, [m.ref]).catch(() => {}); }}
                    title={tt('library.folders.remove', 'Take out of this folder (the work stays in the Library)')}
                    style={{ position: 'absolute', left: 6, top: 6, zIndex: 20, padding: '2px 7px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 11, cursor: 'pointer', opacity: hoverMember === m.ref ? 1 : 0, transition: 'opacity 0.15s' }}
                  >
                    ✕
                  </button>
                  {item?.parts && item.parts.length > 1 && (
                    <div style={{ marginTop: 4 }}>
                      <button onClick={() => setPicking(picking === m.ref ? null : m.ref)} style={{ background: 'none', border: 'none', padding: 0, color: '#e0b0ff', fontSize: 10.5, cursor: 'pointer' }}>
                        {m.pick?.length
                          ? tt('library.folders.picked', '{n} of {total} chosen').replace('{n}', String(m.pick.length)).replace('{total}', String(item.parts.length))
                          : tt('library.folders.whole', 'All {total} designs').replace('{total}', String(item.parts.length))}
                      </button>
                      {picking === m.ref && (
                        <div style={{ ...PANEL, boxShadow: 'none', marginTop: 4, padding: 8 }}>
                          {item.parts.map((p) => {
                            const on = !m.pick?.length || m.pick.includes(p.key);
                            return (
                              <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 11.5, color: '#cdd6f4' }}>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => {
                                    const current = m.pick?.length ? m.pick : item.parts!.map((x) => x.key);
                                    const next = on ? current.filter((k) => k !== p.key) : [...current, p.key];
                                    if (next.length === 0) return; // something has to stay: take it out of the folder instead
                                    sc().folderPick(open!.id, m.ref, next.length === item.parts!.length ? [] : next).catch(() => {});
                                  }}
                                  style={{ width: 12, height: 12, accentColor: 'var(--accent)' }}
                                />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!open && folders.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', borderRadius: 14, border: '1px dashed color-mix(in srgb, var(--accent) 20%, transparent)' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#cdd6f4' }}>{tt('library.folders.start_title', 'Your folders')}</div>
            <div style={{ maxWidth: 440, margin: '6px auto 0', fontSize: 12, color: '#a6adc8' }}>
              {tt('library.folders.start_body', 'Name a folder, then add work from any tab with the folder button on its card, or by dragging it. Upload your own files too.')}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function NodeBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button title={label} aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ background: 'none', border: 'none', color: '#6c7086', fontSize: 11, cursor: 'pointer', padding: '0 3px' }}>
      {children}
    </button>
  );
}

function CrumbBtn({ current, onClick, children }: { current: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: current ? '#cdd6f4' : '#6c7086', fontWeight: current ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

function Note({ tone, onClose, children }: { tone: 'error' | 'info'; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12,
      border: `1px solid ${tone === 'error' ? 'rgba(239,68,68,0.4)' : ACCENT_EDGE}`,
      background: tone === 'error' ? 'rgba(239,68,68,0.1)' : ACCENT_SOFT,
      color: tone === 'error' ? '#fecaca' : '#cdd6f4',
    }}>
      <span style={{ flex: 1 }}>{children}</span>
      <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: '#6c7086', cursor: 'pointer' }}>✕</button>
    </div>
  );
}
