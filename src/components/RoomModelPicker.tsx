import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getSidecar } from '../lib/sidecar';
import { useModeAvailability, modeSubtitle, isModeListed } from '../lib/mode-availability';
import { getKeyedProviders, buildModelCatalogue, resolveSidecarModel } from '../lib/chat-models';

/**
 * Compact model picker for the focused rooms (Health / Learning) — the same
 * gated list + sidecar wiring as the main chat, in a small header dropdown.
 * The model is global to the sidecar, so a change here is the change everywhere:
 * it persists to localStorage['ava-ide-chat-model'], pushes the resolved id to
 * the sidecar, and emits 'ava-ide-model-changed' so the main chat + the other
 * room stay in sync without a reload.
 */

const MODEL_KEY = 'ava-ide-chat-model';
const ORCHESTRATED = [
  { id: 'aurora', modeId: 'aurora' as const, label: '✦ Aurora' },
  { id: 'supernova', modeId: 'supernova' as const, label: '✦ Supernova' },
  { id: 'auto', modeId: 'maestro' as const, label: '✦ Maestro' },
  { id: 'longxiang', modeId: 'longxiang' as const, label: '✦ Longxiang' },
].filter((o) => isModeListed(o.modeId));

function readModel(): string {
  try { return localStorage.getItem(MODEL_KEY) || 'auto'; } catch { return 'auto'; }
}

export function RoomModelPicker() {
  const { state: modeState, availability: modeAvailability } = useModeAvailability();
  const [open, setOpen] = useState(false);
  const [model, setModelState] = useState<string>(readModel);
  const ref = useRef<HTMLDivElement>(null);

  // Keep in sync when the model changes elsewhere (main chat / other room).
  useEffect(() => {
    const onChanged = () => setModelState(readModel());
    window.addEventListener('ava-ide-model-changed', onChanged);
    window.addEventListener('storage', onChanged);
    return () => { window.removeEventListener('ava-ide-model-changed', onChanged); window.removeEventListener('storage', onChanged); };
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const keyed = useMemo(() => getKeyedProviders(), [open]); // re-read when opening
  const catalogue = useMemo(() => buildModelCatalogue(keyed), [keyed]);

  const select = useCallback((id: string) => {
    setModelState(id);
    setOpen(false);
    try { localStorage.setItem(MODEL_KEY, id); } catch { /* quota */ }
    getSidecar().setModel(resolveSidecarModel(id)).catch(() => {});
    try { window.dispatchEvent(new CustomEvent('ava-ide-model-changed')); } catch { /* no window */ }
  }, []);

  // Active model display name.
  const activeLabel = useMemo(() => {
    const orch = ORCHESTRATED.find((o) => o.id === model);
    if (orch) return orch.label.replace('✦ ', '');
    for (const g of catalogue) { const m = g.models.find((mm) => mm.id === model); if (m) return m.name; }
    return model;
  }, [model, catalogue]);

  const itemBase: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 10px', border: 'none', borderRadius: 6, fontSize: 12, textAlign: 'left', cursor: 'pointer', background: 'transparent' };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Model: ${activeLabel}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 180, padding: '4px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeLabel}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 999, background: '#1a1028', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: 10, padding: 6, minWidth: 240, maxHeight: 420, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {/* Orchestrated modes */}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>Orchestrated</div>
          {ORCHESTRATED.map((o) => {
            const enabled = modeAvailability[o.modeId];
            const active = model === o.id;
            const subtitle = modeSubtitle(o.modeId, modeAvailability, modeState);
            return (
              <button key={o.id} type="button" disabled={!enabled} onClick={() => enabled && select(o.id)}
                title={enabled ? o.label : `${o.label.replace('✦ ', '')} — ${subtitle}`}
                style={{ ...itemBase, background: enabled && active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', color: !enabled ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4', cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.55 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{enabled && active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}{o.label}</span>
                <span style={{ fontSize: 10, color: enabled ? 'var(--accent)' : '#facc15' }}>{subtitle}</span>
              </button>
            );
          })}
          {/* Per-provider models — live when keyed, otherwise route to Settings */}
          {catalogue.map((group) => (
            <div key={group.id}>
              <div style={{ height: 1, background: 'rgba(49, 34, 68, 0.5)', margin: '6px 0' }} />
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6c7086', padding: '6px 10px 4px', textTransform: 'uppercase', letterSpacing: 0.8 }}>{group.label}</div>
              {group.models.map((m) => {
                const active = model === m.id;
                return (
                  <button key={m.id} type="button"
                    onClick={() => { if (!group.available) { try { window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'settings' })); } catch { /* */ } setOpen(false); return; } select(m.id); }}
                    title={group.available ? m.name : `Add ${group.label} API key to unlock`}
                    style={{ ...itemBase, background: group.available && active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent', color: !group.available ? '#6c7086' : active ? '#e0b0ff' : '#cdd6f4', opacity: group.available ? 1 : 0.45 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{group.available && active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}{m.name}</span>
                    {!group.available && <span style={{ fontSize: 10, color: '#facc15' }}>Add key</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
