// IDE model dropdown — parity with the extension's ModelSelector.
//
// Behaviour:
//   - Orchestrated section at the top: Supernova (polyglot, V4 Pro coordinator)
//     and Maestro (single conductor on Qwen 3.7 Plus). Both highlighted as
//     Ava-orchestrated modes vs raw model picks.
//   - Supernova is admin-only at preview while the DeepSeek partnership is
//     pending. Non-admin users see it in the dropdown with an "In development"
//     label and a disabled state (tooltip explains the gate).
//   - Maestro (auto) is always available — has been operational for months.
//   - Below that: raw model picks, sorted alphabetically by provider.
//
// Source of truth for model availability is the platform `/models` endpoint
// (admin-gated server-side via validateAuth — admins get the full list with
// admin_only models, non-admins get the filtered list). This component just
// renders whatever is passed in.

import { useState, useRef, useEffect } from 'react';
import { Tooltip } from './Tooltip';
import { useModeAvailability, modeSubtitle, type ModeId } from '../lib/mode-availability';

export interface IdeModelOption {
  id: string;
  name: string;
  provider: string;
  /** True if this model can actually be selected by the current user.
   *  False = visible but disabled (e.g. Supernova for non-admin). */
  available: boolean;
}

interface ModelDropdownProps {
  models: IdeModelOption[];
  activeModel: string | null;
  onSwitch: (modelId: string) => void;
}

// IDs match the picker's setModel target. modeId is the lookup into
// the shared mode-availability lib for unlock-path messaging.
const ORCHESTRATED: { id: string; modeId: ModeId; label: string; title: string }[] = [
  {
    id: 'aurora',
    modeId: 'aurora',
    label: '✦ Aurora',
    title: 'Aurora — Mistral-only EU stack. Three-tier fleet: Mistral Medium 3.5 leads (coordinator + Builder + vision + deep specialists), Mistral Small 4 carries the volume (chat, long-context, brainstorm, intent gate), Mistral Large 3 is the heavy reserve. EU-only data residency, GDPR-strict, open weights.',
  },
  {
    id: 'supernova',
    modeId: 'supernova',
    label: '✦ Supernova',
    title: 'Supernova — DeepSeek V4 Pro coordinator + V4 Flash specialists with Qwen builders. Heavy multi-step work.',
  },
  {
    id: 'auto',
    modeId: 'maestro',
    label: '✦ Maestro',
    title: 'Maestro — single Qwen 3.7 Plus conductor. Daily work, predictable cost.',
  },
];

export default function ModelDropdown({ models, activeModel, onSwitch }: ModelDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { state: modeState, availability: modeAvailability } = useModeAvailability();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isAuto = activeModel === 'auto';
  const isSupernova = activeModel === 'supernova';
  const isAurora = activeModel === 'aurora';
  const activeName = isAuto
    ? 'Maestro'
    : isSupernova
      ? 'Supernova'
      : isAurora
        ? 'Aurora'
        : models.find((m) => m.id === activeModel)?.name ?? 'Select model';

  // Orchestrated entries first, then raw models alphabetically.
  const rawModels = [...models]
    .filter((m) => m.id !== 'auto' && m.id !== 'supernova' && m.id !== 'aurora')
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name);
    });

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          background: 'rgba(168, 85, 247, 0.05)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          borderRadius: 4,
          color: '#cdd6f4',
          fontSize: 11,
          fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isAuto || isSupernova || isAurora ? '#A855F7' : '#10b981',
            display: 'inline-block',
          }}
        />
        {isAuto ? '✦ Maestro' : isSupernova ? '✦ Supernova' : isAurora ? '✦ Aurora' : activeName}
        <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 0,
            minWidth: 240,
            maxHeight: 360,
            overflowY: 'auto',
            background: '#1e1b2e',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 1000,
          }}
        >
          {ORCHESTRATED.map((o) => {
            const m = models.find((x) => x.id === o.id);
            if (!m) return null;
            const enabled = m.available;
            const subtitle = modeSubtitle(o.modeId, modeAvailability, modeState);
            const isActive = activeModel === o.id;
            const tooltipContent = enabled
              ? o.title
              : `${o.label.replace('✦ ', '')} — ${subtitle}`;
            return (
              <Tooltip key={o.id} content={tooltipContent} placement="top">
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => {
                    if (!enabled) return;
                    onSwitch(o.id);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 10px',
                    background: enabled && isActive ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: 12,
                    color: '#cdd6f4',
                    cursor: enabled ? 'pointer' : 'default',
                    opacity: enabled ? 1 : 0.4,
                  }}
                  onMouseEnter={(e) => {
                    if (enabled && !isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(168, 85, 247, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    if (enabled && !isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: enabled && isActive ? '#A855F7' : 'rgba(255,255,255,0.15)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: enabled && isActive ? 600 : 400 }}>{o.label}</span>
                  <span
                    style={{
                      fontSize: 10,
                      marginLeft: 'auto',
                      opacity: enabled ? 0.5 : 0.7,
                      color: enabled ? '#cdd6f4' : '#facc15',
                    }}
                  >
                    {subtitle}
                  </span>
                </button>
              </Tooltip>
            );
          })}

          {rawModels.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid rgba(168, 85, 247, 0.15)', margin: '4px 0' }} />
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: 10,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  opacity: 0.4,
                  color: '#cdd6f4',
                }}
              >
                Models
              </div>
            </>
          )}

          {rawModels.map((m) => {
            const isActive = m.id === activeModel;
            return (
              <Tooltip
                key={m.id}
                content={m.available ? m.name : `Add ${m.provider} API key to use ${m.name}`}
                placement="top"
              >
                <button
                  type="button"
                  disabled={!m.available}
                  onClick={() => {
                    if (!m.available) return;
                    onSwitch(m.id);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 10px',
                    background: m.available && isActive ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: 12,
                    color: '#cdd6f4',
                    cursor: m.available ? 'pointer' : 'default',
                    opacity: m.available ? 1 : 0.35,
                  }}
                  onMouseEnter={(e) => {
                    if (m.available && !isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(168, 85, 247, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    if (m.available && !isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: isActive && m.available ? '#A855F7' : m.available ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: isActive && m.available ? 600 : 400 }}>{m.name}</span>
                  <span style={{ fontSize: 10, opacity: 0.35, marginLeft: 'auto' }}>{m.provider}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
