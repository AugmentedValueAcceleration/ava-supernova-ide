import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { tt } from '../lib/i18n';
import { LazyModelViewer } from './LazyModelViewer';

// ─── The 3D Model / Prop room — the IDE's mirror of the extension's ──────
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

/** The card as it stands, for Ava's context every turn — including his edits. */
export function modelPanelSummary(m: IdeModel | null): string {
  if (!m) return 'No model yet in this room.';
  const head = `Model on the stage: "${m.name}" (${m.built ? 'built' : 'not built yet'})`;
  const b = m.brief;
  if (!b) return `${head} · no brief yet`;
  const status = b.status === 'agreed' ? 'brief AGREED by them' : `brief waiting for their agreement${b.editedByPerson ? ' — THEY EDITED IT, work from their version' : ''}`;
  return `${head} · ${status} · ${b.fields.map((f) => `${f.label}: ${f.value}`).join(' · ')}`;
}

const BORDER = 'rgba(255,255,255,0.08)';
const btn = (primary = false): CSSProperties => ({
  borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  border: `1px solid ${primary ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : BORDER}`,
  background: primary ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
  color: primary ? 'var(--accent)' : '#a6adc8',
});

const pendingAgree = new Set<string>();

export function ModelRoom({ onActiveModel }: { onActiveModel: (m: IdeModel | null) => void }) {
  const [models, setModels] = useState<IdeModel[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const sc = getSidecar();
    const handler = (e: SidecarEvent) => {
      if (e.event === 'models_list') setModels(((e as unknown as { models?: IdeModel[] }).models) ?? []);
      if (e.event === 'model_action_result') {
        const r = e as unknown as { ok: boolean; error?: string };
        setNote(r.ok ? null : r.error ?? null);
      }
    };
    sc.onAny(handler);
    sc.listModels().catch(() => setModels([]));
    return () => { sc.offAny(handler); };
  }, []);

  const active = useMemo(() => (models?.length ? models.find((m) => m.slug === picked) ?? models[0] : null), [models, picked]);
  useEffect(() => { onActiveModel(active); }, [active, onActiveModel]);

  const v = active?.updatedAt ?? '';
  return (
    <div style={{ flex: 1, minHeight: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 400, color: '#cdd6f4', margin: 0 }}>{tt('dash.studio.model.title', '3D Model / Prop')}</h2>
          <p style={{ fontSize: 12, color: '#8b8398', margin: '2px 0 0' }}>
            {tt('dash.studio.model.subtitle', 'Built in Blender on your computer — free. The brief comes first: Ava researches it, you agree it, then you build it together.')}
          </p>
        </div>
        {models && models.length > 1 && (
          <select value={active?.slug ?? ''} onChange={(e) => setPicked(e.target.value)} aria-label={tt('dash.studio.model.pick', 'Model')}
            style={{ maxWidth: 220, borderRadius: 8, border: `1px solid ${BORDER}`, background: 'var(--bg-input, #1e1b2e)', color: '#cdd6f4', fontSize: 12, padding: '6px 10px' }}>
            {models.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        )}
      </div>
      {note && <p style={{ fontSize: 12, color: '#f38ba8', margin: '0 0 8px' }}>{note}</p>}

      {models === null ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b8398', fontSize: 12 }}>{tt('dash.studio.model.loading', 'Loading…')}</div>
      ) : !active ? (
        <div style={{ flex: 1, borderRadius: 12, border: `1px dashed ${BORDER}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: '0 40px' }}>
          <span style={{ fontSize: 30, opacity: 0.5 }}>{'\u{1F9CA}'}</span>
          <p style={{ fontSize: 13, color: '#a6adc8', margin: 0 }}>{tt('dash.studio.model.empty', 'Tell Ava what you want to make.')}</p>
          <p style={{ maxWidth: 440, fontSize: 12, color: '#8b8398', margin: 0, lineHeight: 1.6 }}>
            {tt('dash.studio.model.empty_sub', 'She’ll research real references and measurements, then put a brief here for you to question and agree before anything is built.')}
          </p>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gap: 16, overflow: 'hidden', gridTemplateColumns: 'minmax(280px, 380px) 1fr' }}>
          <BriefCard key={active.slug + (active.brief?.status ?? '')} model={active} />
          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            {active.built && active.glbPath ? (
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
                <button style={btn(true)} onClick={() => getSidecar().openModelInBlender(active.slug).catch(() => {})}>{tt('library.model.open_in_blender', 'Open in Blender')}</button>
                <button style={btn()} onClick={() => revealItemInDir(active.folder).catch(() => {})}>{tt('library.model.open_folder', 'Open folder')}</button>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b8398' }}>
                  {[active.sizeM?.length === 3 ? `${active.sizeM.map((n) => +n.toFixed(2)).join(' × ')} m` : '',
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

function BriefCard({ model }: { model: IdeModel }) {
  const brief = model.brief;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries((brief?.fields ?? []).map((f) => [f.key, f.value])));

  // Tell Ava only once the agreement is on disk — the sidecar confirms by
  // sending the models back with this brief 'agreed' (this card remounts on
  // that). Said first, her turn could reach the build tool before it can see
  // the agreement, and it would refuse.
  useEffect(() => {
    if (brief?.status === 'agreed' && pendingAgree.delete(model.slug)) {
      sayToAva(`I've agreed the brief for "${model.name}" — go ahead and start building.`);
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
    getSidecar().saveModelBrief(model.slug, draft).catch(() => {});
    setEditing(false);
    if (changed.length) sayToAva(`I've edited the brief for "${model.name}" — I changed ${changed.join(', ')}. Have a look at my version.`);
  };
  const agree = () => {
    pendingAgree.add(model.slug);
    getSidecar().agreeModelBrief(model.slug).catch(() => {});
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
