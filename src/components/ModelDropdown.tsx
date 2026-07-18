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

import { useState, useRef, useEffect, useId } from 'react';
import { t, useLocale } from '../lib/i18n';
import { Tooltip } from './Tooltip';
import { useModeAvailability, modeSubtitle, isModeListed, type ModeId } from '../lib/mode-availability';

/**
 * Paperclip = "this model takes image attachments" — deliberately the SAME
 * glyph as the composer's attach button, struck through when it doesn't.
 * Reusing the composer icon means there's nothing new to learn: that symbol is
 * the attach button, so a strike reads as "attach won't work here".
 *
 * Shown on every row AND on the collapsed toggle — the answer you most need is
 * "can the model I'm on right now see?", and that shouldn't cost a click. On
 * the rows it's on every one, not just the blind ones, so absence is comparable
 * at a glance; a marker you only see occasionally is a marker nobody learns.
 *
 * The strike cuts a real transparent gap via an SVG mask rather than painting a
 * halo in the surface colour: the menu and the toggle sit on different
 * backgrounds, so any hard-coded halo would be wrong on one of them.
 *
 * Icon-only, so it costs no translation; the tooltip carries the words.
 *
 * Mirror of the extension's ModelSelector (both webview + dashboard copies).
 */
function VisionGlyph({ supported }: { supported: boolean }) {
  const maskId = useId();
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      style={{ color: '#6c7086', opacity: supported ? 0.45 : 0.9, flexShrink: 0 }}
    >
      {!supported && (
        <mask id={maskId}>
          <rect width="16" height="16" fill="white" />
          <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" stroke="black" strokeWidth="3" strokeLinecap="round" />
        </mask>
      )}
      <path
        d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a2.75 2.75 0 1 1-3.935-3.84l4.486-4.486a1.75 1.75 0 0 1 2.505 2.44L6.623 9.573a.75.75 0 0 1-1.08-1.04l4.473-4.563z"
        fill="currentColor"
        mask={supported ? undefined : `url(#${maskId})`}
      />
      {!supported && (
        <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

export interface IdeModelOption {
  id: string;
  name: string;
  provider: string;
  /** True if this model can actually be selected by the current user.
   *  False = visible but disabled (e.g. Supernova for non-admin). */
  available: boolean;
  /** Whether this model accepts image attachments. Undefined = unknown,
   *  treated as supported so we never brand a model blind on a guess. */
  supportsVision?: boolean;
}

interface ModelDropdownProps {
  models: IdeModelOption[];
  activeModel: string | null;
  onSwitch: (modelId: string) => void;
}

// IDs match the picker's setModel target. modeId is the lookup into
// the shared mode-availability lib for unlock-path messaging.
// titleKey, not title — resolved at render, and shared with the CC model picker
// via core keys (the two had drifted into different copies). Names stay as-is.
const ORCHESTRATED: { id: string; modeId: ModeId; label: string; titleKey: string }[] = [
  { id: 'aurora',    modeId: 'aurora'    as const, label: '✦ Aurora',    titleKey: 'dash.model.aurora_title' },
  { id: 'supernova', modeId: 'supernova' as const, label: '✦ Supernova', titleKey: 'dash.model.supernova_title' },
  { id: 'auto',      modeId: 'maestro'   as const, label: '✦ Maestro',   titleKey: 'dash.model.maestro_title' },
  { id: 'longxiang', modeId: 'longxiang' as const, label: '✦ Longxiang', titleKey: 'dash.model.longxiang_title' },
].filter((o) => isModeListed(o.modeId));

export default function ModelDropdown({ models, activeModel, onSwitch }: ModelDropdownProps) {
  useLocale();
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
        : models.find((m) => m.id === activeModel)?.name ?? t('dash.model.select');

  // Vision state of the model you're actually on — surfaced on the collapsed
  // toggle so "can this see?" doesn't require opening the picker. The fleets
  // live in `models` too, so this covers them without special-casing.
  const activeSupportsVision = models.find((m) => m.id === activeModel)?.supportsVision;

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
          background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
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
            background: isAuto || isSupernova || isAurora ? 'var(--accent)' : '#10b981',
            display: 'inline-block',
          }}
        />
        {isAuto ? '✦ Maestro' : isSupernova ? '✦ Supernova' : isAurora ? '✦ Aurora' : activeName}
        <VisionGlyph supported={activeSupportsVision !== false} />
        <span style={{ fontSize: 8, opacity: 0.5, marginLeft: 2 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 0,
            minWidth: 300,
            maxHeight: 360,
            overflowY: 'auto',
            background: '#1e1b2e',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
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
              ? t(o.titleKey)
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
                    background: enabled && isActive ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: 12,
                    color: '#cdd6f4',
                    cursor: enabled ? 'pointer' : 'default',
                    opacity: enabled ? 1 : 0.4,
                  }}
                  onMouseEnter={(e) => {
                    if (enabled && !isActive) (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)';
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
                      background: enabled && isActive ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
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
              <div style={{ borderTop: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', margin: '4px 0' }} />
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
                content={!m.available
                  ? `Add ${m.provider} API key to use ${m.name}`
                  : m.supportsVision === false
                    ? `${m.name} — ${t('model.no_vision_title')}`
                    : m.name}
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
                    background: m.available && isActive ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    fontSize: 12,
                    color: '#cdd6f4',
                    cursor: m.available ? 'pointer' : 'default',
                    opacity: m.available ? 1 : 0.35,
                  }}
                  onMouseEnter={(e) => {
                    if (m.available && !isActive) (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 8%, transparent)';
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
                      background: isActive && m.available ? 'var(--accent)' : m.available ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontWeight: isActive && m.available ? 600 : 400 }}>{m.name}</span>
                  <span style={{ fontSize: 10, opacity: 0.35, marginLeft: 'auto' }}>{m.provider}</span>
                  {/* `!== false` mirrors the composer gate: an unknown flag
                      means unknown, and we don't brand a model blind on a guess. */}
                  <VisionGlyph supported={m.supportsVision !== false} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
