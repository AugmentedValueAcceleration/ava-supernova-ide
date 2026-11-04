import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { tt } from '../lib/i18n';
import { LazyModelViewer } from './LazyModelViewer';
import { Select } from './Select';

// ─── The Blender (Headless) room — the IDE's mirror of the extension's ──────
//
// The brief card beside the model. Ava researches and proposes the brief
// (design_propose_model_brief, in core); it lands here; he questions it with
// her in the dock, edits it on the card if he wants, and AGREES it here — the
// only way a brief becomes agreed, and design_build_model refuses until then.
// Agreeing says so in the chat, as him, so she carries on.
//
// Models come from the sidecar (list_models → models_list), which watches
// every model's brief.json and the creative index, so the card and the viewer
// update on their own while Ava works.

export interface IdeModel {
  slug: string;
  name: string;
  built: boolean;
  updatedAt: string;
  creativeId?: string;
  previewPath?: string;
  glbPath?: string;
  folder: string;
  files?: string[];
  triangles?: number;
  sizeM?: number[];
  blenderVersion?: string;
  /** GIMP work: how many images are in it. */
  imageCount?: number;
  /** GIMP work: versions waiting on the stage for them to pick. */
  options?: null | { question: string; items: Array<{ label: string; note?: string; path: string }> };
  /** GIMP work: their own art, for Ava to test against. */
  references?: string[];
  brief: null | {
    status: 'proposed' | 'agreed';
    editedByPerson: boolean;
    reasoning: string;
    fields: Array<{ key: string; label: string; value: string }>;
  };
}

/** A local file as a URL the WebView can load. The version stamp makes each
 *  rebuild a new URL — the preview and .glb are rewritten at the same path. */
export const fileUrl = (p: string | undefined, v: string) => (p ? `${convertFileSrc(p)}?v=${encodeURIComponent(v)}` : undefined);

/** Say it to Ava in the design chat, as him (the dock listens for this). */
function sayToAva(text: string) {
  window.dispatchEvent(new CustomEvent('ava-design-say', { detail: { text } }));
}

/** What really exists in the room, checked this moment: the one thing a memory
 *  cannot tell her. Her notes outlive the work, so without this she describes
 *  deleted pieces as still on disk (4 Nov 2026). */
export function roomRoster(names: string[]): string {
  return names.length
    ? `Everything that exists in this room right now: ${names.map((n) => `"${n}"`).join(', ')}.`
    : 'This room is EMPTY right now: no briefs, no files, nothing on disk.';
}

/** The card as it stands, for Ava's context every turn — including his edits. */
export function modelPanelSummary(m: IdeModel | null, gimp = false, work: string[] = []): string {
  const roster = roomRoster(work);
  if (!m) return `${roster} Nothing is on the stage: they are starting something new here. Ask what they want to make; a new piece needs a NEW name, because the same name continues the old work.`;
  const head = `${gimp ? 'Work' : 'Model'} on the stage: "${m.name}" (${m.built ? 'made' : 'not made yet'})`;
  const b = m.brief;
  if (!b) return `${roster} ${head} · no brief yet`;
  const status = b.status === 'agreed' ? 'brief AGREED by them' : `brief waiting for their agreement${b.editedByPerson ? ' — THEY EDITED IT, work from their version' : ''}`;
  const art = m.references?.length ? ` · their art in references/: ${m.references.join(', ')}` : '';
  const waiting = m.options ? ` · OPTIONS ON THE STAGE waiting for their pick: ${m.options.question}` : '';
  return `${roster} ${head} · ${status}${art}${waiting} · ${b.fields.map((f) => `${f.label}: ${f.value}`).join(' · ')}`;
}

const BORDER = 'rgba(255,255,255,0.08)';
const btn = (primary = false): CSSProperties => ({
  borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  border: `1px solid ${primary ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : BORDER}`,
  background: primary ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
  color: primary ? 'var(--accent)' : '#a6adc8',
});

const pendingAgree = new Set<string>();

/** What differs between the two rooms. Everything else — the brief card, the
 *  agreement, the picker — is one component, so the rules cannot drift. */
const ROOMS = {
  blender: {
    listed: 'models_list',
    titleKey: 'dash.studio.model.title', title: 'Blender (Headless)',
    subtitleKey: 'dash.studio.model.subtitle', subtitle: 'Built in Blender on your computer — free. The brief comes first: Ava researches it, you agree it, then you build it together.',
    openKey: 'library.model.open_in_blender', open: 'Open in Blender',
    emptySub: 'She\u2019ll research real references and measurements, then put a brief here for you to question and agree before anything is built.',
  },
  gimp: {
    listed: 'image_work_list',
    titleKey: 'dash.studio.gimp.title', title: 'GIMP (Headless)',
    subtitleKey: 'dash.studio.gimp.subtitle', subtitle: 'Made in GIMP on your computer — free. The brief comes first, and you keep layered files you can open and change yourself.',
    openKey: 'library.gimp.open_in_gimp', open: 'Open in GIMP',
    emptySub: 'Icons, sets, game UI, sprites, textures, web graphics. She\u2019ll put a brief here for you to question and agree before anything is made.',
  },
} as const;

export function ModelRoom({ tool = 'blender', busy = false, onActiveModel, onRoster }: { tool?: keyof typeof ROOMS; busy?: boolean; onActiveModel: (m: IdeModel | null) => void; onRoster?: (names: string[]) => void }) {
  const room = ROOMS[tool];
  const [models, setModels] = useState<IdeModel[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  // The stage is cleared by New brief, and stays clear until a new piece of
  // work appears. A slug we have not seen comes forward by itself, even if an
  // older piece was picked in the dropdown: that pick used to stick and hide it.
  const [fresh, setFresh] = useState(false);
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!models) { known.current = null; return; }
    const seen = known.current;
    if (seen && models.some((m) => !seen.has(m.slug))) { setPicked(null); setFresh(false); }
    known.current = new Set(models.map((m) => m.slug));
  }, [models]);
  // The are-you-sure, tied to one slug so it can never carry over to another
  // piece if the stage changes while it is open.
  const [confirming, setConfirming] = useState<string | null>(null);
  const startNew = () => {
    setFresh(true);
    window.dispatchEvent(new CustomEvent('ava-design-new'));
  };
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const sc = getSidecar();
    const handler = (e: SidecarEvent) => {
      if (e.event === room.listed) setModels(((e as unknown as { models?: IdeModel[] }).models) ?? []);
      if (e.event === 'image_art_added') sayToAva(`I've added my art: ${(e as unknown as { file: string }).file}. Use it to test the work against.`);
      if (e.event === 'model_action_result') {
        const r = e as unknown as { ok: boolean; error?: string };
        setNote(r.ok ? null : r.error ?? null);
      }
    };
    sc.onAny(handler);
    setModels(null);
    (tool === 'gimp' ? sc.listImageWork() : sc.listModels()).catch(() => setModels([]));
    return () => { sc.offAny(handler); };
  }, [tool, room]);

  const active = useMemo(() => (models?.length && !fresh ? models.find((m) => m.slug === picked) ?? models[0] : null), [models, picked, fresh]);
  useEffect(() => { onActiveModel(active); }, [active, onActiveModel]);
  useEffect(() => { if (models) onRoster?.(models.map((m) => m.name)); }, [models, onRoster]);

  const v = active?.updatedAt ?? '';
  const addArt = async (slug: string) => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({ multiple: false, title: tt('dash.studio.add_art', 'Add your art'), filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (typeof picked === 'string') await getSidecar().addImageArt(slug, picked);
    } catch { /* dialog unavailable or cancelled */ }
  };
  return (
    <div style={{ flex: 1, minHeight: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 400, color: '#cdd6f4', margin: 0 }}>{tt(room.titleKey, room.title)}</h2>
          <p style={{ fontSize: 12, color: '#8b8398', margin: '2px 0 0' }}>
            {tt(room.subtitleKey, room.subtitle)}
          </p>
        </div>
        {tool === 'gimp' && active && (
          <button style={{ ...btn(), flexShrink: 0 }} onClick={() => { void addArt(active.slug); }}>{tt('dash.studio.add_art', 'Add your art')}</button>
        )}
        {!!models?.length && !fresh && (
          <button style={{ ...btn(true), flexShrink: 0 }} onClick={startNew}>{tt('dash.studio.new_brief', 'New brief')}</button>
        )}
        {active && (
          <button style={{ ...btn(), flexShrink: 0, color: '#f87171', borderColor: 'rgba(239,68,68,0.4)', ...(busy ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} disabled={busy} title={busy ? tt('dash.studio.delete_busy', 'Ava is working. Wait for her to finish, or stop her, to delete this.') : undefined} onClick={() => setConfirming(active.slug)}>{tt('library.delete', 'Delete')}</button>
        )}
        {models && (models.length > 1 || (fresh && models.length > 0)) && (
          <Select
            size="sm"
            style={{ width: 220, flexShrink: 0 }}
            title={tt('dash.studio.model.pick', 'Model')}
            value={active?.slug ?? ''}
            onChange={(slug) => { if (slug) { setPicked(slug); setFresh(false); } }}
            options={[
              ...(fresh ? [{ value: '', label: tt('dash.studio.new_brief', 'New brief') }] : []),
              ...models.map((m) => ({ value: m.slug, label: m.name })),
            ]}
          />
        )}
      </div>
      {note && <p style={{ fontSize: 12, color: '#f38ba8', margin: '0 0 8px' }}>{note}</p>}
      {active && confirming === active.slug && !busy && (
        <div style={{ marginBottom: 12, flexShrink: 0, borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', padding: '12px 16px' }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4', margin: 0 }}>
            {tt('dash.studio.delete_title', 'Are you sure you want to delete “{name}”?').replace('{name}', active.name)}
          </p>
          <p style={{ fontSize: 11, color: '#a6adc8', margin: '2px 0 0' }}>
            {tool === 'gimp'
              ? tt('dash.studio.gimp.delete_body', 'The brief and the whole folder are removed from disk — the layered files, their exports, saved versions and any art you added. It cannot be undone.')
              : tt('dash.studio.model.delete_body', 'The brief and the whole model folder are removed from disk — the Blender file, its exports and its saved versions. It cannot be undone.')}
          </p>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button style={btn()} onClick={() => setConfirming(null)}>{tt('library.cancel', 'Cancel')}</button>
            <button style={{ ...btn(), color: '#f87171', borderColor: 'rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.15)' }}
              onClick={() => { getSidecar().deleteModel(active.slug, tool).catch(() => {}); setConfirming(null); setPicked(null); }}>
              {tt('library.delete', 'Delete')}
            </button>
          </div>
        </div>
      )}

      {models === null ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b8398', fontSize: 12 }}>{tt('dash.studio.model.loading', 'Loading…')}</div>
      ) : !active ? (
        <div style={{ flex: 1, borderRadius: 12, border: `1px dashed ${BORDER}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: '0 40px' }}>
          <span style={{ fontSize: 30, opacity: 0.5 }}>{'\u{1F9CA}'}</span>
          <p style={{ fontSize: 13, color: '#a6adc8', margin: 0 }}>{tt('dash.studio.model.empty', 'Tell Ava what you want to make.')}</p>
          <p style={{ maxWidth: 440, fontSize: 12, color: '#8b8398', margin: 0, lineHeight: 1.6 }}>
            {tt(`dash.studio.${tool}.empty_sub`, room.emptySub)}
          </p>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gap: 16, overflow: 'hidden', gridTemplateColumns: 'minmax(280px, 380px) 1fr' }}>
          <BriefCard key={active.slug + (active.brief?.status ?? '')} model={active} tool={tool} />
          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {tool === 'gimp' && active.options ? (
              <OptionsStage model={active} onPick={(index, label) => {
                getSidecar().pickImageOption(active.slug, index).catch(() => {});
                sayToAva(`I pick "${label}".`);
              }} />
            ) : active.built && tool === 'gimp' && active.previewPath ? (
              <img src={fileUrl(active.previewPath, v)} alt={active.name} style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', padding: 16, boxSizing: 'border-box' }} />
            ) : active.built && active.glbPath ? (
              <LazyModelViewer fill src={fileUrl(active.glbPath, v)!} poster={fileUrl(active.previewPath, v)} alt={active.name} />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: '48px 32px' }}>
                <p style={{ fontSize: 13, color: '#a6adc8', margin: 0 }}>{tt('dash.studio.model.not_built', 'Nothing built yet.')}</p>
                <p style={{ maxWidth: 360, fontSize: 12, color: '#8b8398', margin: 0, lineHeight: 1.6 }}>
                  {active.brief?.status === 'agreed'
                    ? tt('dash.studio.model.not_built_agreed', 'The brief is agreed — Ava can start building. Each step appears here.')
                    : tt('dash.studio.model.not_built_brief', 'Once you agree the brief, Ava builds it here, step by step.')}
                </p>
              </div>
            )}
            {active.built && (
              <div style={{ flexShrink: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderTop: `1px solid ${BORDER}`, padding: '8px 12px' }}>
                <button style={btn(true)} onClick={() => (tool === 'gimp' ? getSidecar().openWorkInGimp(active.slug) : getSidecar().openModelInBlender(active.slug)).catch(() => {})}>{tt(room.openKey, room.open)}</button>
                <button style={btn()} onClick={() => revealItemInDir(active.folder).catch(() => {})}>{tt('library.model.open_folder', 'Open folder')}</button>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b8398' }}>
                  {[typeof active.imageCount === 'number' ? `${active.imageCount} image${active.imageCount === 1 ? '' : 's'}` : '',
                    active.references?.length ? tt('dash.studio.art_count', 'Your art: {count}').replace('{count}', String(active.references.length)) : '',
                    active.sizeM?.length === 3 ? `${active.sizeM.map((n) => +n.toFixed(2)).join(' × ')} m` : '',
                    typeof active.triangles === 'number' ? `${active.triangles.toLocaleString()} tris` : ''].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Versions Ava put on the stage: they choose by eye, and the click is the answer. */
function OptionsStage({ model, onPick }: { model: IdeModel; onPick: (index: number, label: string) => void }) {
  const options = model.options!;
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ minWidth: 0, flex: 1, fontSize: 13, color: '#cdd6f4', margin: 0 }}>{options.question}</p>
        <span style={{ flexShrink: 0, borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 500, background: 'rgba(240,162,75,0.14)', color: '#f0a24b' }}>
          {tt('dash.studio.model.proposed', 'Waiting for you')}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {options.items.map((o, i) => (
          <button key={o.path} onClick={() => onPick(i, o.label)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 10, textAlign: 'left', background: 'transparent', cursor: 'pointer' }}>
            <img src={fileUrl(o.path, model.updatedAt)} alt={o.label} style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: '#cdd6f4' }}>{o.label}</span>
            {o.note && <span style={{ fontSize: 11, color: '#8b8398', lineHeight: 1.6 }}>{o.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function BriefCard({ model, tool }: { model: IdeModel; tool: keyof typeof ROOMS }) {
  const brief = model.brief;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries((brief?.fields ?? []).map((f) => [f.key, f.value])));

  // Tell Ava only once the agreement is on disk — the sidecar confirms by
  // sending the models back with this brief 'agreed' (this card remounts on
  // that). Said first, her turn could reach the build tool before it can see
  // the agreement, and it would refuse.
  useEffect(() => {
    if (brief?.status === 'agreed' && pendingAgree.delete(model.slug)) {
      sayToAva(`I've agreed the brief for "${model.name}" — go ahead and start.`);
    }
  }, [brief?.status, model.slug, model.name]);

  const card: CSSProperties = { minHeight: 0, borderRadius: 12, border: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
  const label: CSSProperties = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: '#8b8398', margin: 0 };

  if (!brief) {
    return (
      <div style={{ ...card, padding: 16, gap: 8 }}>
        <p style={label}>{tt('dash.studio.model.brief', 'The brief')}</p>
        <p style={{ fontSize: 12, color: '#a6adc8', margin: 0 }}>{tt('dash.studio.model.brief_none', 'Ava hasn’t proposed a brief for this model yet.')}</p>
      </div>
    );
  }

  const agreed = brief.status === 'agreed';
  const save = () => {
    const changed = brief.fields.filter((f) => (draft[f.key] ?? '').trim() !== f.value).map((f) => f.label.toLowerCase());
    (tool === 'gimp' ? getSidecar().saveImageBrief(model.slug, draft) : getSidecar().saveModelBrief(model.slug, draft)).catch(() => {});
    setEditing(false);
    if (changed.length) sayToAva(`I've edited the brief for "${model.name}" — I changed ${changed.join(', ')}. Have a look at my version.`);
  };
  const agree = () => {
    pendingAgree.add(model.slug);
    (tool === 'gimp' ? getSidecar().agreeImageBrief(model.slug) : getSidecar().agreeModelBrief(model.slug)).catch(() => {});
  };

  return (
    <div style={card}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px' }}>
        <p style={label}>{tt('dash.studio.model.brief', 'The brief')}</p>
        <span style={{ marginLeft: 'auto', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 500,
          ...(agreed ? { background: 'rgba(52,211,153,0.12)', color: '#34d399' } : { background: 'rgba(240,162,75,0.14)', color: '#f0a24b' }) }}>
          {agreed ? tt('dash.studio.model.agreed', 'Agreed') : tt('dash.studio.model.proposed', 'Waiting for you')}
        </span>
      </div>
      <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {brief.fields.map((f) => (
          <div key={f.key}>
            <p style={{ fontSize: 10.5, color: '#8b8398', margin: 0 }}>{f.label}</p>
            {editing ? (
              <textarea value={draft[f.key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                rows={Math.min(4, Math.max(1, Math.ceil((draft[f.key]?.length ?? 0) / 42)))}
                style={{ marginTop: 2, width: '100%', boxSizing: 'border-box', resize: 'vertical', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'var(--bg-input, #1e1b2e)', color: '#cdd6f4', fontSize: 12, padding: '4px 8px', fontFamily: 'inherit' }} />
            ) : (
              <p style={{ fontSize: 12, color: '#cdd6f4', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{f.value || '—'}</p>
            )}
          </div>
        ))}
        {brief.reasoning && !editing && (
          <div style={{ marginTop: 4, borderRadius: 8, background: 'rgba(255,255,255,0.04)', padding: '8px 12px' }}>
            <p style={{ fontSize: 10.5, color: '#8b8398', margin: 0 }}>{tt('dash.studio.model.reasoning', 'Ava’s reasoning')}</p>
            <p style={{ fontSize: 12, color: '#a6adc8', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{brief.reasoning}</p>
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, padding: '10px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <>
            <button style={btn(true)} onClick={save}>{tt('dash.studio.model.save', 'Save changes')}</button>
            <button style={btn()} onClick={() => setEditing(false)}>{tt('dash.studio.model.cancel', 'Cancel')}</button>
          </>
        ) : (
          <>
            {!agreed && <button style={btn(true)} onClick={agree}>{tt('dash.studio.model.agree', 'Agree the brief')}</button>}
            <button style={btn()} onClick={() => setEditing(true)}>{tt('dash.studio.model.edit', 'Edit')}</button>
            <span style={{ fontSize: 10.5, color: '#8b8398' }}>
              {agreed
                ? tt('dash.studio.model.agreed_hint', 'Changing it means agreeing it again.')
                : brief.editedByPerson
                ? tt('dash.studio.model.edited_hint', 'You edited this — agree it when it’s right.')
                : tt('dash.studio.model.proposed_hint', 'Question it with Ava below, then agree.')}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
