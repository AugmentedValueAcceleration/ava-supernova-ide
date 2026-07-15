import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode, type CSSProperties } from 'react';
import { PenNib, Paperclip as PhPaperclip } from '@phosphor-icons/react';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { logDiag } from '../lib/sidecar-log';
import { RoomModelPicker } from './RoomModelPicker';
import { Select } from './Select';
import { buildShapeSvg, svgToPngDataUrl } from '../lib/asset-forge/icon-svg';
import { searchShapes, getShape, type ShapeHit } from '../lib/asset-forge/shape-library';
import { activeKit, loadKits, upsertKit, type BrandKit } from '../lib/asset-forge/brand-kit';
import { MATERIALS, armatureSvg, composeIconPrompt, ICON_NEGATIVE } from '../lib/asset-forge/generate';
import { buildLettermark } from '../lib/asset-forge/logo/lettermark';
import { typesetWordmark } from '../lib/asset-forge/logo/wordmark';
import { composeLogoSystem, brandInk } from '../lib/asset-forge/logo/compose';
import { emblemVariants } from '../lib/asset-forge/logo/emblem';
import { fontById, suggestFont, WORDMARK_FONTS } from '../lib/asset-forge/logo/fonts';
import { loadFont, registerWordmarkFonts } from '../lib/asset-forge/logo/pipeline';
import { renderMark, renderElements, type MarkSpec, type MarkStyle } from '../lib/asset-forge/logo/mark-primitives';
import type { LogoBrief, LogoSystem, LogoVariant } from '../lib/asset-forge/logo/types';
import { useCreativeGallery } from '../lib/creative-gallery';
import { apiFetch, isConnected } from '../lib/api';
import { t } from '../lib/i18n';

/**
 * Design Studio (IDE) — guided icon design, mirrored faithfully from the VS Code
 * extension's dashboard-ui/pages/DesignStudio.tsx (Tailwind → inline styles).
 *
 * Ava (the "Design Architect" persona, design lane) drives this canvas: she finds
 * a Lucide shape, authors an art-direction, and generates an on-brand icon via
 * "shape-as-dial" (Lucide armature → qwen-image-edit-max → server matte →
 * transparent PNG on the canvas). The design_* tools reach the canvas through the
 * sidecar's designControl → a `design_tool` event we handle here; the generation
 * itself runs host-side (sidecar) via assetForgeGenerate → `asset_forge_result`.
 *
 * The bottom Design Architect DOCK is a self-contained chat wired to the sidecar
 * on the 'design' surface (mirrors HealthRoomChat, lane === 'design').
 */

type GenOutcome = { ok: boolean; dataUrl?: string; error?: string };

// Logo styles — REAL vector paints from the shape engine, not prompt words. A
// gradient logo is a true SVG gradient: still scalable, still exact, no model.
const LOGO_STYLES: { id: MarkStyle; labelKey: string }[] = [
  { id: 'flat', labelKey: 'dash.studio.logo.style.flat' },
  { id: 'gradient', labelKey: 'dash.studio.logo.style.gradient' },
  { id: 'line', labelKey: 'dash.studio.logo.style.line' },
  { id: 'duotone', labelKey: 'dash.studio.logo.style.duotone' },
];
/** Styles that paint with a second colour. */
const TWO_TONE = (s: MarkStyle) => s === 'gradient' || s === 'duotone';

/** How the mark gets made. */
const MARK_TYPES: { id: 'letter' | 'geometry' | 'icon'; labelKey: string }[] = [
  { id: 'geometry', labelKey: 'dash.studio.mark.geometry' },
  { id: 'letter', labelKey: 'dash.studio.mark.letter' },
  { id: 'icon', labelKey: 'dash.studio.mark.icon' },
];

/** Logo forms — the overall lockup shape Ava composes. */
const LOGO_FORMS: { id: NonNullable<LogoBrief['form']>; labelKey: string }[] = [
  { id: 'combination', labelKey: 'dash.studio.form.combination' },
  { id: 'emblem', labelKey: 'dash.studio.form.emblem' },
];

// Compose N logo lockups into ONE contact-sheet SVG — a numbered grid Ava can
// see all at once to compare and pick (best-of-N). Each lockup is embedded as a
// nested <svg> with its own viewBox, so preserveAspectRatio fits it cleanly.
function contactSheetSvg(items: { svg: string; label: string }[]): { svg: string; w: number; h: number } {
  const n = items.length;
  const cols = n <= 2 ? n : 2;
  const rows = Math.ceil(n / cols);
  const CELL = 380, PAD = 22, LBL = 36;
  const W = cols * CELL + (cols + 1) * PAD;
  const H = rows * (CELL + LBL) + (rows + 1) * PAD;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  items.forEach((it, i) => {
    const vbM = /viewBox="([\d.\-]+) ([\d.\-]+) ([\d.]+) ([\d.]+)"/.exec(it.svg);
    const vb = vbM ? `${vbM[1]} ${vbM[2]} ${vbM[3]} ${vbM[4]}` : '0 0 100 100';
    const inner = it.svg.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    const col = i % cols, row = Math.floor(i / cols);
    const x = PAD + col * (CELL + PAD), y = PAD + row * (CELL + LBL + PAD);
    parts.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="12" fill="#f5f5f7"/>`);
    parts.push(`<svg x="${x + 26}" y="${y + 26}" width="${CELL - 52}" height="${CELL - 52}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`);
    parts.push(`<text x="${x + CELL / 2}" y="${y + CELL + 24}" text-anchor="middle" font-family="sans-serif" font-size="19" font-weight="600" fill="#111111">${i + 1}. ${esc(it.label)}</text>`);
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`, w: W, h: H };
}

const CHECKER = 'repeating-conic-gradient(#221a30 0% 25%, #181123 0% 50%) 50% / 16px 16px';
const PNG_SIZES = [1024, 512, 256, 128, 64, 32];
// Collapsed height of the chat dock (handle + static composer). The dock is
// bottom-anchored and animates its height COLLAPSED ⇄ 58% so the composer stays
// pinned at the bottom while the conversation slides above it.
const DOCK_COLLAPSED = 112;

const BORDER = 'var(--border, #2a2440)';
const CARD_BORDER = 'color-mix(in srgb, var(--accent) 20%, transparent)';

/** A selectable inspector pill (logo dials) — accent when on, muted when off. */
const logoPill = (on: boolean): CSSProperties => ({
  padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, textAlign: 'center',
  border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : CARD_BORDER}`,
  background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'rgba(26,16,40,0.5)',
  color: on ? 'var(--accent)' : '#a6adc8',
});

// ── HSV↔hex helpers for the custom colour picker ────────────────────────────
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return { h: 0, s: 0, v: 1 };
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return { h, s: max ? d / max : 0, v: max };
}

// On-brand custom colour picker — bespoke popover (saturation/value square + hue
// slider), Brand-Kit swatches + hex field. NO OS dialog.
function ColorField({ value, onChange, swatches }: { value: string; onChange: (v: string) => void; swatches: string[] }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value.toUpperCase());
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const ref = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHex(value.toUpperCase()), [value]);
  useEffect(() => { if (open) setHsv(hexToHsv(value)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const commit = (next: { h: number; s: number; v: number }) => { setHsv(next); onChange(hsvToHex(next.h, next.s, next.v)); };
  const onSv = (e: { clientX: number; clientY: number }) => {
    const r = svRef.current?.getBoundingClientRect(); if (!r) return;
    commit({ ...hsv, s: clamp((e.clientX - r.left) / r.width, 0, 1), v: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) });
  };
  const onHue = (e: { clientX: number }) => {
    const r = hueRef.current?.getBoundingClientRect(); if (!r) return;
    commit({ ...hsv, h: clamp((e.clientX - r.left) / r.width, 0, 1) * 360 });
  };
  const pickExternal = (v: string) => { onChange(v); setHsv(hexToHsv(v)); };
  const norm = value.toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} title={t('dash.studio.change_colour')} aria-label={t('dash.studio.change_colour')}
        style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', border: `1px solid ${CARD_BORDER}`, background: value }} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 60, top: 36, left: 0, width: 200, borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: '#1a1028', padding: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', userSelect: 'none' }}>
          <div ref={svRef}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onSv(e); }}
            onPointerMove={e => { if (e.buttons) onSv(e); }}
            style={{ position: 'relative', width: '100%', height: 120, borderRadius: 6, cursor: 'crosshair', marginBottom: 8, background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}>
            <div style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transform: 'translate(-50%,-50%)', pointerEvents: 'none', left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
          </div>
          <div ref={hueRef}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onHue(e); }}
            onPointerMove={e => { if (e.buttons) onHue(e); }}
            style={{ position: 'relative', width: '100%', height: 12, borderRadius: 999, cursor: 'pointer', marginBottom: 10, background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}>
            <div style={{ position: 'absolute', top: '50%', width: 14, height: 14, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', transform: 'translate(-50%,-50%)', pointerEvents: 'none', left: `${(hsv.h / 360) * 100}%` }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${CARD_BORDER}`, flexShrink: 0, background: value }} />
            <input value={hex}
              onChange={e => { const v = e.target.value.toUpperCase(); setHex(v); if (/^#[0-9A-F]{6}$/.test(v)) pickExternal(v); }}
              style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 6, fontSize: 11, background: 'rgba(26,16,40,0.6)', color: '#cdd6f4', border: `1px solid ${CARD_BORDER}`, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {swatches.map((sw, i) => (
              <button key={i} onClick={() => pickExternal(sw)} title={sw.toUpperCase()} aria-label={sw}
                style={{ width: 24, height: 24, borderRadius: 6, cursor: 'pointer', border: `1px solid ${norm === sw.toUpperCase() ? 'var(--accent)' : CARD_BORDER}`, background: sw }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Collapsible inspector group — clickable uppercase header + chevron.
function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', marginBottom: open ? 9 : 0 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 500, color: '#8b8398' }}>{title}</span>
        <span style={{ flexShrink: 0, marginLeft: 8, fontSize: 8, color: '#8b8398', lineHeight: 1, transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>▼</span>
      </button>
      {open && children}
    </div>
  );
}

// mm:ss for the player time readouts.
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// A bespoke horizontal drag bar — same pointer technique as ColorField's hue
// slider (onPointerDown → setPointerCapture, onPointerMove while buttons held,
// fraction derived from the track's bounding rect). Accent-filled progress + a
// draggable circular thumb. Used for the video scrubber and the volume control.
function DragBar({ value, onChange, height = 6, thumb = 13, dimTrack = 'rgba(26,16,40,0.85)', accent = 'var(--accent)', title }:
  { value: number; onChange: (v: number) => void; height?: number; thumb?: number; dimTrack?: string; accent?: string; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    onChange(clamp((clientX - r.left) / r.width, 0, 1));
  };
  const pct = clamp(value, 0, 1) * 100;
  return (
    <div ref={ref} title={title}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientX); }}
      onPointerMove={e => { if (e.buttons) seek(e.clientX); }}
      style={{ position: 'relative', width: '100%', height, borderRadius: 999, cursor: 'pointer', background: dimTrack, border: `1px solid ${CARD_BORDER}`, userSelect: 'none', touchAction: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 999, background: accent, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, width: thumb, height: thumb, borderRadius: '50%', background: '#fff', border: `2px solid ${accent}`, boxShadow: '0 1px 4px rgba(0,0,0,0.5)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
    </div>
  );
}

// A small round transport button (play/pause and friends), accent-tinted.
function TransportButton({ onClick, title, accent = false, children }:
  { onClick: () => void; title: string; accent?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', flexShrink: 0,
        border: `1px solid ${accent ? 'var(--accent)' : CARD_BORDER}`,
        background: accent ? 'var(--accent)' : 'rgba(26,16,40,0.6)',
        color: accent ? '#0d0916' : '#cdd6f4' }}>
      {children}
    </button>
  );
}

const iconBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0, border: `1px solid ${CARD_BORDER}`, background: 'rgba(26,16,40,0.6)', color: '#a6adc8' };

// ── Bespoke Video player ────────────────────────────────────────────────────
// Dark stage + hand-built transport (NO <video controls>). A hidden <video ref>
// is wired so the controls "just work" the day a real src is set; with no src we
// drive a fake playhead over the chosen placeholder duration so the design is
// fully feelable. Scrubber = DragBar (ColorField pointer technique).
function VideoStage({ durationSec, src, generating }: { durationSec: number; src?: string; generating?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [isMax, setIsMax] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  const hasSrc = () => !!videoRef.current?.currentSrc;

  // A fresh clip arrived → rewind the transport so it plays the new one from 0.
  useEffect(() => { setPlaying(false); setProgress(0); }, [src]);

  // Fake playhead — advance progress over durationSec while playing and no real
  // clip is loaded. A real <video> drives progress via onTimeUpdate instead.
  useEffect(() => {
    if (!playing || hasSrc()) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000; lastRef.current = now;
      setProgress(p => {
        const next = p + dt / Math.max(0.1, durationSec);
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, durationSec]);

  // Keep the (optional) real element in sync with our controls.
  useEffect(() => { if (videoRef.current) videoRef.current.volume = muted ? 0 : volume; }, [volume, muted]);

  const toggle = () => {
    const v = videoRef.current;
    setPlaying(prev => {
      const next = !prev;
      if (next && progress >= 1) setProgress(0);
      if (v && hasSrc()) { if (next) void v.play().catch(() => {}); else v.pause(); }
      return next;
    });
  };
  const seek = (frac: number) => {
    setProgress(frac);
    const v = videoRef.current;
    if (v && hasSrc() && Number.isFinite(v.duration)) v.currentTime = frac * v.duration;
  };
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v && hasSrc() && Number.isFinite(v.duration) && v.duration > 0) setProgress(v.currentTime / v.duration);
  };
  // "Fullscreen" = maximise within the panel (fixed overlay), consistent with the
  // extension where the real Fullscreen API is blocked in the sandboxed webview.
  const toggleMax = () => setIsMax(m => !m);
  useEffect(() => {
    if (!isMax) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMax(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMax]);

  const cur = progress * durationSec;

  return (
    <div style={isMax
      ? { position: 'fixed', inset: 0, zIndex: 2147483000, background: '#000', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }
      : { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stage — clean dark (not the transparency checker; video isn't transparent) */}
      <div ref={stageRef} style={{ flex: 1, minHeight: 220, borderRadius: 12, border: `1px solid ${CARD_BORDER}`, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(120% 120% at 50% 30%, #171021, #0c0814)' }}>
        <video ref={videoRef} src={src || undefined} onTimeUpdate={onTimeUpdate} onEnded={() => setPlaying(false)} playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'transparent' }} />
        {!src && (
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: '0 32px', pointerEvents: 'none' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="15" height="14" rx="2" /><path d="m17 9 5-3v12l-5-3" />
            </svg>
            <div style={{ fontSize: 13.5, color: '#a6adc8' }}>{t('dash.studio.video.empty')}</div>
            <div style={{ fontSize: 12, color: '#8b8398', maxWidth: 320, lineHeight: 1.6 }}>{t('dash.studio.video.empty_hint')}</div>
          </div>
        )}
        {generating && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(12,8,20,0.74)', backdropFilter: 'blur(2px)' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${CARD_BORDER}`, borderTopColor: 'var(--accent)', animation: 'avaSpin 0.8s linear infinite' }} />
            <div style={{ fontSize: 12.5, color: '#a6adc8' }}>Generating your video… this can take a minute or two.</div>
            <style>{'@keyframes avaSpin { to { transform: rotate(360deg) } }'}</style>
          </div>
        )}
      </div>

      {/* Transport chrome — bespoke, always visible so the design is feelable */}
      <div style={{ borderRadius: 12, border: `1px solid ${CARD_BORDER}`, background: 'rgba(20,13,32,0.7)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TransportButton onClick={toggle} title={playing ? 'Pause' : 'Play'} accent>
            {playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
          </TransportButton>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DragBar value={progress} onChange={seek} title={t('dash.studio.transport.scrub')} />
          </div>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#a6adc8', whiteSpace: 'nowrap' }}>{fmtTime(cur)} / {fmtTime(durationSec)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => setMuted(m => !m)} title={muted ? t('dash.studio.transport.unmute') : t('dash.studio.transport.mute')} aria-label={muted ? t('dash.studio.transport.unmute') : t('dash.studio.transport.mute')} style={iconBtnStyle}>
            {muted || volume === 0
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>}
          </button>
          <div style={{ width: 96 }}>
            <DragBar value={muted ? 0 : volume} onChange={v => { setVolume(v); setMuted(false); }} height={5} thumb={11} title={t('dash.studio.transport.volume')} />
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={toggleMax} title={isMax ? 'Restore (Esc)' : 'Maximise'} aria-label={isMax ? 'Restore' : 'Maximise'} style={iconBtnStyle}>
            {isMax
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bespoke Waveform (voice) player ─────────────────────────────────────────
// The signature element: a custom-drawn waveform on a devicePixelRatio-aware
// <canvas>. Bars are a DETERMINISTIC function of index (no Math.random → stable
// render). The waveform IS the scrubber: pointer down/move on it seeks (same
// setPointerCapture technique as ColorField). Played bars bright accent,
// unplayed dimmed. No <audio controls> — a fake playhead sweeps on play.
function deterministicAmp(i: number): number {
  // Layered sines over the bar index → an organic-but-stable envelope in 0..1.
  const a = Math.sin(i * 0.45) * 0.5 + 0.5;
  const b = Math.sin(i * 0.13 + 1.7) * 0.5 + 0.5;
  const c = Math.sin(i * 0.9 + 0.3) * 0.25 + 0.25;
  return clamp(0.12 + (a * 0.55 + b * 0.3 + c * 0.15) * 0.88, 0.06, 1);
}

function WaveformPlayer({ voiceName, durationSec }: { voiceName: string; durationSec: number }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const progressRef = useRef(0);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    let accent = getComputedStyle(canvas).getPropertyValue('--accent').trim();
    if (!accent) accent = '#c9a2ff';
    const barW = 3, gap = 2, step = barW + gap;
    const count = Math.max(1, Math.floor(cssW / step));
    const mid = cssH / 2;
    const p = progressRef.current;
    for (let i = 0; i < count; i++) {
      const amp = deterministicAmp(i);
      const h = Math.max(2, amp * (cssH * 0.86));
      const x = i * step;
      const played = (i + 0.5) / count <= p;
      ctx.globalAlpha = played ? 1 : 0.26;
      ctx.fillStyle = accent;
      const y = mid - h / 2;
      const r = Math.min(1.5, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + barW, y, x + barW, y + h, r);
      ctx.arcTo(x + barW, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + barW, y, r);
      ctx.closePath();
      ctx.fill();
    }
    // Playhead line.
    ctx.globalAlpha = 1;
    const px = clamp(p, 0, 1) * cssW;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 0.75, 0, 1.5, cssH);
  }, []);

  // Redraw on progress change.
  useEffect(() => { draw(); }, [progress, draw]);
  // Redraw on resize (ResizeObserver) + once on mount.
  useEffect(() => {
    draw();
    const el = wrapRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // Fake playhead sweep on play.
  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastRef.current) / 1000; lastRef.current = now;
      setProgress(pr => {
        const next = pr + dt / Math.max(0.1, durationSec);
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, durationSec]);

  const toggle = () => setPlaying(prev => { const next = !prev; if (next && progressRef.current >= 1) setProgress(0); return next; });
  const seek = (clientX: number) => {
    const r = canvasRef.current?.getBoundingClientRect(); if (!r) return;
    setProgress(clamp((clientX - r.left) / r.width, 0, 1));
  };

  const cur = progress * durationSec;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
      <div style={{ borderRadius: 14, border: `1px solid ${CARD_BORDER}`, background: 'radial-gradient(120% 140% at 50% 0%, #171021, #0c0814)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Waveform = scrubber */}
        <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: 120 }}>
          <canvas ref={canvasRef}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientX); }}
            onPointerMove={e => { if (e.buttons) seek(e.clientX); }}
            style={{ width: '100%', height: '100%', display: 'block', cursor: 'pointer', touchAction: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <TransportButton onClick={toggle} title={playing ? 'Pause' : 'Play'} accent>
            {playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
          </TransportButton>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 13, color: '#cdd6f4', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{voiceName}</span>
            <span style={{ fontSize: 11, color: '#8b8398' }}>{t('dash.studio.voice.preview')}</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#a6adc8', whiteSpace: 'nowrap' }}>{fmtTime(cur)} / {fmtTime(durationSec)}</span>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#8b8398' }}>{t('dash.studio.voice.empty')}</div>
    </div>
  );
}

type ViewId = 'icon' | 'iconset' | 'appicon' | 'logo' | 'badge' | 'avatar' | 'banner' | 'hero' | 'ogimage' | 'illustration' | 'pattern' | 'gamekit' | 'gamepiece' | 'canvas' | 'image' | 'video' | 'voice' | 'brandkit';

// Keys, not text. This is a module-level const — resolved strings would evaluate
// once at import (before initLocale) and freeze in English. Labels resolve at
// render via t(), keyed off the asset id.
const GROUPS: { labelKey: string; accent: string; items: { id: ViewId; soon?: boolean }[] }[] = [
  { labelKey: 'dash.studio.group.open_canvas', accent: '#6aa9ff', items: [
    { id: 'video' },
    { id: 'voice' },
    { id: 'image' },
  ] },
  { labelKey: 'dash.studio.group.web_app', accent: 'var(--accent)', items: [
    { id: 'icon' },
    { id: 'iconset', soon: true },
    { id: 'appicon', soon: true },
    { id: 'logo' },
    { id: 'badge', soon: true },
    { id: 'avatar', soon: true },
    { id: 'banner', soon: true },
    { id: 'hero', soon: true },
    { id: 'ogimage', soon: true },
    { id: 'illustration', soon: true },
    { id: 'pattern', soon: true },
  ] },
  { labelKey: 'dash.studio.group.game', accent: '#f0a24b', items: [
    { id: 'gamekit', soon: true }, { id: 'gamepiece', soon: true },
  ] },
];

// Qwen3-TTS built-in voice roster — PLACEHOLDER names for the shell (no wiring).
const VOICES = ['Aria', 'Ovis', 'Nofish', 'Cherry', 'Ember', 'Sunny', 'Marcus', 'Willow', 'Koda'];

export function DesignStudio() {
  // Reactive active kit — re-read whenever the brand kit changes anywhere (the
  // Brand Kit view, Ava's brand_kit tool) so the studio follows it instead of
  // freezing on the kit that happened to be active at mount.
  const [kitTick, setKitTick] = useState(0);
  const kit = useMemo(() => activeKit(), [kitTick]);
  useEffect(() => {
    const h = () => setKitTick(t => t + 1);
    window.addEventListener('ava-kit-changed', h);
    return () => window.removeEventListener('ava-kit-changed', h);
  }, []);
  const [view, setView] = useState<ViewId>('icon');
  // Which room the Design Architect chat should reflect. The Open-Canvas Video
  // and Voiceover views map to their own rooms; everything else is the icon
  // studio (greeting / chips / heading / persona all follow this).
  const designRoom: 'icon' | 'video' | 'voice' | 'image' | 'logo' = view === 'video' ? 'video' : view === 'voice' ? 'voice' : view === 'image' ? 'image' : view === 'logo' ? 'logo' : 'icon';

  const [query, setQuery] = useState('');
  const [shapeId, setShapeId] = useState('Bell');
  const [color, setColor] = useState<string>(kit.palette.primary);
  const [boardBg, setBoardBg] = useState(CHECKER);

  // ── Image lane (free-form Qwen-Image via sidecar — no armature, no matte) ──
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState('1280*1280');
  const imageResolverRef = useRef<((r: { ok: boolean; dataUrl?: string; error?: string }) => void) | null>(null);
  const pendingImageRef = useRef(false);
  const lastImageTitleRef = useRef('Image');

  // ── Video lane (Wan 2.5 via sidecar: submit → poll → clip) ──
  const [videoDuration, setVideoDuration] = useState('5'); // Wan: '5' | '10' seconds only
  const [videoAspect, setVideoAspect] = useState('16:9');
  const [videoResolution, setVideoResolution] = useState('1080p');
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoGenerating, setVideoGenerating] = useState(false);

  // ── Voice lane (Qwen3-TTS via sidecar) ──
  const [voiceName, setVoiceName] = useState(VOICES[0]);
  const [voiceScript, setVoiceScript] = useState('');
  const [voiceEmotion, setVoiceEmotion] = useState('neutral');
  const [voiceSpeed, setVoiceSpeed] = useState('1.0');
  const [voiceSrc, setVoiceSrc] = useState<string | null>(null);
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceResolverRef = useRef<((r: { ok: boolean; url?: string; error?: string }) => void) | null>(null);

  const [materialId, setMaterialId] = useState('glass');
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genSize, setGenSize] = useState(512);
  const [dockOpen, setDockOpen] = useState(false);
  // Keep the conversation mounted through the slide-down so the collapse animates.
  const [renderConv, setRenderConv] = useState(false);
  useEffect(() => {
    if (dockOpen) { setRenderConv(true); return; }
    const t2 = window.setTimeout(() => setRenderConv(false), 320);
    return () => window.clearTimeout(t2);
  }, [dockOpen]);

  const material = MATERIALS.find(m => m.id === materialId) ?? MATERIALS[0];

  const hits = useMemo(() => searchShapes(query, 24), [query]);
  const shape = useMemo(() => getShape(shapeId), [shapeId]);

  // Local creative gallery — design_save / set auto-save write the matted PNG here.
  const gallery = useCreativeGallery('image');
  const voiceGallery = useCreativeGallery('voice');
  const videoGallery = useCreativeGallery('video');

  // ── Logo lane ────────────────────────────────────────────────────────────
  // Constructed logo systems: a mark (letter / geometry / icon) + a real-font
  // wordmark composed into every lockup, mono, and favicon — pure client-side
  // SVG, no model. The dials are two-way: fed into Ava's brief, and synced back
  // to what she actually built after a make (mirror of the icon lane).
  const [logoSystem, setLogoSystem] = useState<LogoSystem | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoVariant, setLogoVariant] = useState<LogoVariant>('primary');    // which variant is on the board
  const [logoExplore, setLogoExplore] = useState<LogoSystem[] | null>(null); // best-of-N candidates; click to pick
  const [logoFontId, setLogoFontId] = useState('');                          // font OPTION Ava respects
  const [logoMark, setLogoMark] = useState('Star');                          // Lucide shape id (markType 'icon')
  const [logoQuery, setLogoQuery] = useState('');                            // shape search (icon mark)
  const [logoStyle, setLogoStyle] = useState<MarkStyle>('flat');
  const [logoColour, setLogoColour] = useState<string>(kit.palette.primary); // the mark's brand colour
  const [logoSecondary, setLogoSecondary] = useState<string>(kit.palette.accent || kit.palette.primary);
  const [logoForm, setLogoForm] = useState<'combination' | 'emblem'>('combination');
  const [logoTagline, setLogoTagline] = useState('');                        // emblem bottom text
  const [logoMarkType, setLogoMarkType] = useState<'letter' | 'geometry' | 'icon'>('geometry');
  // The wordmark's colour is its OWN decision — a gradient mark has no single hue
  // for the word to borrow. 'ink' is a deep tint of the brand, not flat black.
  const [logoWordColour, setLogoWordColour] = useState<'ink' | 'brand' | string>('ink');
  const [logoContainer, setLogoContainer] = useState<'none' | 'ring'>('none');
  const [logoSpec, setLogoSpec] = useState<MarkSpec | null>(null);           // the construction Ava last authored
  const [logoBoard, setLogoBoard] = useState(CHECKER);                       // check-against board
  const logoHits = useMemo(() => searchShapes(logoQuery, 24), [logoQuery]);
  // Register the bundled wordmark fonts (from bytes) when the Logo room opens, so
  // the font picker previews each name in its own typeface.
  useEffect(() => { if (view === 'logo') void registerWordmarkFonts(); }, [view]);

  // Live credit balance for the top bar (platform users only).
  const [credit, setCredit] = useState<{ remaining: number; limit: number } | null>(null);
  useEffect(() => {
    if (!isConnected()) { setCredit(null); return; }
    apiFetch('/usage/summary').then((res: any) => {
      if (!res?.period) return;
      const freeUsed = res.period.free_credits_used || 0;
      const freeLimit = res.period.free_credits_limit || 0;
      const subUsed = res.period.credits_used || 0;
      const subLimit = res.period.credits_limit || 0;
      const limit = res.isUnlimited ? Number.POSITIVE_INFINITY : freeLimit + subLimit;
      const used = freeUsed + subUsed;
      setCredit({ remaining: Math.max(0, limit - used), limit });
    }).catch(() => {});
  }, []);

  // A generated result belongs to one (shape × material × colour); invalidate.
  useEffect(() => { setGenResult(null); setGenError(null); }, [shapeId, materialId, color]);

  // Icons follow the active brand kit — when the kit (or its primary) changes,
  // snap the icon colour to it. The logo lane already falls back to the kit
  // colour in resolveLogoBrief, so this keeps the icon lane on-brand too.
  useEffect(() => { setColor(kit.palette.primary); }, [kit.id, kit.palette.primary]);

  // One generation in flight → one resolver. runGeneration parks it; the
  // asset_forge_result listener fulfils it. Both a direct call and the Design
  // Architect's tools await the same path.
  const genResolverRef = useRef<((r: GenOutcome) => void) | null>(null);
  const genResultRef = useRef<string | null>(null);
  useEffect(() => { genResultRef.current = genResult; }, [genResult]);

  // Shape-as-dial: render the shape to a duotone armature, hand it to the sidecar
  // with an art-director prompt → Qwen-Image-edit → server matte. Returns a
  // promise resolving with the matted result. `look` is Ava's authored art
  // direction (or a material preset's text).
  const runGeneration = useCallback((shapeHit: ShapeHit, look: string, colorHex: string): Promise<GenOutcome> => {
    return new Promise<GenOutcome>((resolve) => {
      genResolverRef.current = resolve;
      setGenError(null); setGenResult(null);
      setGenStatus('Preparing…');
      svgToPngDataUrl(armatureSvg(shapeHit), 1024, 1024)
        .then((armature) => {
          const prompt = composeIconPrompt(shapeHit.label, look, colorHex);
          setGenStatus('Generating with Qwen-Image…');
          getSidecar().assetForgeGenerate({ prompt, referenceImage: armature, size: '1024*1024', negativePrompt: ICON_NEGATIVE }).catch((e) => {
            genResolverRef.current = null;
            const err = e instanceof Error ? e.message : 'Generation failed';
            setGenError(err); setGenStatus(null);
            resolve({ ok: false, error: err });
          });
        })
        .catch((e) => {
          genResolverRef.current = null;
          const err = e instanceof Error ? e.message : 'Generation failed';
          setGenError(err); setGenStatus(null);
          resolve({ ok: false, error: err });
        });
    });
  }, []);

  const resolveShape = (idOrSubject: string): ShapeHit | null => {
    const s = idOrSubject.trim();
    if (!s) return null;
    return getShape(s) ?? searchShapes(s, 1)[0] ?? null;
  };

  // ── Video lane wiring (mirror of the icon runGeneration/resolver pattern) ──
  // One video in flight → one parked resolver. runVideoGeneration asks the
  // sidecar to submit+poll and awaits the `asset_forge_video_result` event.
  type VideoOutcome = { ok: boolean; url?: string; error?: string };
  const videoResolverRef = useRef<((r: VideoOutcome) => void) | null>(null);
  // `resolution` is the exact route value ('720P' | '1080P'); duration is 5 | 10.
  const runVideoGeneration = useCallback((prompt: string, duration: string, resolution: string): Promise<VideoOutcome> => {
    return new Promise<VideoOutcome>((resolve) => {
      const title = (prompt.trim().split(/\s+/).slice(0, 6).join(' ') || 'Video').slice(0, 60);
      // Auto-save on success (no Save button) — lands in creative/video/.
      videoResolverRef.current = (r) => {
        if (r.ok && r.url) videoGallery.saveGenerated({ url: r.url, title, prompt, ext: 'mp4' }).catch(() => {});
        resolve(r);
      };
      setVideoSrc(null);
      setVideoGenerating(true);
      getSidecar().assetForgeVideo({ prompt, duration: Number(duration), resolution }).catch((e) => {
        videoResolverRef.current = null;
        setVideoGenerating(false);
        resolve({ ok: false, error: e instanceof Error ? e.message : 'Video generation failed' });
      });
    });
  }, [videoGallery]);

  // Save a matted PNG to the local creative gallery (transparent icon).
  const saveToLibrary = useCallback((dataUrl: string, title: string, designType?: string) => {
    gallery.saveGenerated({ url: dataUrl, title, prompt: title, ext: 'png', designType }).catch(() => {});
  }, [gallery]);

  // ── Image lane wiring (mirror of runVideoGeneration) — free-form Qwen-Image
  // via the sidecar with NO reference armature and matte:false (a hero / banner
  // keeps its background; it isn't cut out like an icon). Auto-saves on success.
  const runImageGeneration = (prompt: string, size: string): Promise<{ ok: boolean; dataUrl?: string; error?: string }> => {
    return new Promise((resolve) => {
      const title = (prompt.trim().split(/\s+/).slice(0, 6).join(' ') || 'Image').slice(0, 60);
      lastImageTitleRef.current = title;
      imageResolverRef.current = (r) => {
        if (r.ok && r.dataUrl) saveToLibrary(r.dataUrl, title); // lands in creative/images/
        resolve(r);
      };
      pendingImageRef.current = true;
      setImageSrc(null); setImageError(null);
      setImageGenerating(true);
      // Layer the active brand's style onto the free-form prompt — the kit shapes
      // everything the studio makes. Title stays off the user's original words.
      const branded = kit.styleTags?.length ? `${prompt} — style: ${kit.styleTags.join(', ')}` : prompt;
      getSidecar().assetForgeGenerate({ prompt: branded, size, matte: false }).catch((e) => {
        pendingImageRef.current = false;
        imageResolverRef.current = null;
        setImageGenerating(false);
        const err = e instanceof Error ? e.message : 'Image generation failed';
        setImageError(err);
        resolve({ ok: false, error: err });
      });
    });
  };

  // ── Voice lane wiring (Qwen3-TTS via sidecar) — park a resolver, ask the
  // sidecar to synthesise, and the asset_forge_voice_result listener fulfils it.
  // Auto-saves the finished audio into creative/voice/ on success.
  const runVoiceGeneration = (script: string, voice: string, language: string, instructions?: string): Promise<{ ok: boolean; url?: string; error?: string }> => {
    return new Promise((resolve) => {
      const title = (script.trim().split(/\s+/).slice(0, 6).join(' ') || 'Voiceover').slice(0, 60);
      voiceResolverRef.current = (r) => {
        if (r.ok && r.url) voiceGallery.saveGenerated({ url: r.url, title, prompt: script, ext: 'mp3' }).catch(() => {});
        resolve(r);
      };
      setVoiceSrc(null); setVoiceError(null);
      setVoiceGenerating(true);
      getSidecar().assetForgeVoice({ text: script, voice, language_type: language, instructions }).catch((e) => {
        voiceResolverRef.current = null;
        setVoiceGenerating(false);
        const err = e instanceof Error ? e.message : 'Voice generation failed';
        setVoiceError(err);
        resolve({ ok: false, error: err });
      });
    });
  };

  // Build a whole logo SYSTEM from a brief — the mark (letter / geometry / icon),
  // a real-font wordmark, every lockup, mono, and favicon. MONO is a second render
  // of the SAME geometry (not a repaint), so the one-colour test can really fail.
  const runLogoGeneration = async (brief: LogoBrief): Promise<{ ok: boolean; system?: LogoSystem; error?: string }> => {
    try {
      const font = fontById(brief.fontId);
      const otf = await loadFont(font.file);
      const wordmark = typesetWordmark(otf, brief.brandName);
      const ink = ['#111111'];
      const paint = [brief.palette.primary, brief.palette.accent ?? brief.palette.primary];

      let symbolSvg: string;
      let symbolMonoSvg: string;
      if (brief.markType === 'letter') {
        const letter = (color: string) => buildLettermark({ font: otf, text: brief.brandName, container: brief.container ?? 'none', color });
        symbolSvg = letter(brief.palette.primary);
        symbolMonoSvg = letter(ink[0]);
      } else if (brief.markType === 'geometry') {
        if (!brief.markSpec?.elements?.length) return { ok: false, error: 'No construction to build from — Ava must author a mark spec, or switch to a lettermark.' };
        symbolSvg = renderMark(brief.markSpec, brief.style, paint);
        symbolMonoSvg = renderMark(brief.markSpec, 'flat', ink);
      } else {
        const shape = resolveShape(brief.mark || brief.symbolDirection || brief.brandName);
        if (!shape) return { ok: false, error: 'No shape found — search one (design_find_shape), construct a mark, or use a lettermark.' };
        symbolSvg = renderElements(shape.elements, brief.style, paint);
        symbolMonoSvg = renderElements(shape.elements, 'flat', ink);
      }

      const wordmarkColor =
        brief.wordmarkColor === 'ink' ? brandInk(brief.palette.primary)
        : brief.wordmarkColor === 'brand' ? brief.palette.primary
        : brief.wordmarkColor;

      const form = brief.form ?? 'combination';
      let assets = composeLogoSystem({ symbolSvg, symbolMonoSvg, wordmark, primary: brief.palette.primary, wordmarkColor });
      if (form === 'emblem') {
        assets = emblemVariants(assets, {
          font: otf, brandName: brief.brandName, tagline: brief.tagline,
          markSvg: symbolSvg, markMonoSvg: symbolMonoSvg, color: brief.palette.primary,
        });
      }
      return {
        ok: true,
        system: {
          brandName: brief.brandName, fontId: brief.fontId, symbolSvg,
          markType: brief.markType, form, style: brief.style, markSpec: brief.markSpec,
          assets, rationale: brief.symbolDirection || undefined,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Logo generation failed' };
    }
  };

  // Resolve a logo BRIEF from tool args, falling back to the panel dials for
  // anything Ava leaves unset. Shared by the single make (generate_logo) and the
  // multi-candidate explore (explore_logos) so they can never drift apart.
  const resolveLogoBrief = (args: Record<string, unknown>): { brief: LogoBrief } | { error: string } => {
    const form: NonNullable<LogoBrief['form']> =
      (args.form === 'combination' || args.form === 'emblem') ? args.form : logoForm;
    const markType: LogoBrief['markType'] =
      (args.mark_type === 'letter' || args.mark_type === 'geometry' || args.mark_type === 'icon') ? args.mark_type : logoMarkType;
    const style: MarkStyle = LOGO_STYLES.some(s => s.id === args.style) ? (args.style as MarkStyle) : logoStyle;
    const primary = (typeof args.colour === 'string' && /^#[0-9a-f]{6}$/i.test(args.colour)) ? args.colour : (logoColour || kit.palette.primary);
    const accent = (typeof args.secondary === 'string' && /^#[0-9a-f]{6}$/i.test(args.secondary)) ? args.secondary : logoSecondary;
    const wordmarkColor =
      (args.wordmark_colour === 'ink' || args.wordmark_colour === 'brand' || (typeof args.wordmark_colour === 'string' && /^#[0-9a-f]{6}$/i.test(args.wordmark_colour)))
        ? args.wordmark_colour as string : logoWordColour;
    let markSpec: MarkSpec | undefined = logoSpec ?? undefined;
    if (typeof args.mark_spec === 'string' && args.mark_spec.trim()) {
      try {
        const parsed = JSON.parse(args.mark_spec) as MarkSpec;
        if (!Array.isArray(parsed?.elements) || !parsed.elements.length) throw new Error('spec has no elements');
        markSpec = parsed;
      } catch (e) {
        return { error: `That mark spec isn't valid JSON: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    return {
      brief: {
        brandName: (typeof args.brand_name === 'string' && args.brand_name.trim()) ? args.brand_name.trim() : kit.name,
        fontId: (typeof args.font === 'string' && args.font) ? args.font : (logoFontId || suggestFont(kit.styleTags).id),
        markType,
        container: (args.container === 'ring' || args.container === 'none') ? args.container : logoContainer,
        mark: (typeof args.mark === 'string' && args.mark.trim()) ? args.mark.trim() : logoMark,
        markSpec,
        form,
        tagline: typeof args.tagline === 'string' ? args.tagline.trim() : logoTagline,
        style,
        wordmarkColor,
        symbolDirection: typeof args.direction === 'string' ? args.direction : (markSpec?.concept ?? ''),
        palette: { primary, accent },
        styleTags: kit.styleTags,
      },
    };
  };

  // Save the WHOLE logo system to the Library — every variant, kept as SVG (true
  // vector), under a shared `logo_<ts>_<variant>` id so the Library shows them as
  // ONE logo card. Sequential so the metadata read-modify-write can't race.
  const saveLogoSystemToLibrary = async (system: LogoSystem) => {
    const group = `logo_${Date.now()}`;
    const brand = system.brandName || 'logo';
    for (const a of system.assets) {
      await gallery.saveGenerated({
        id: `${group}_${a.variant}`,
        url: 'data:image/svg+xml,' + encodeURIComponent(a.svg),
        title: `${brand} — ${a.label}`,
        prompt: `${brand} logo — ${a.label}`,
        ext: 'svg',
        designType: 'logo',
      }).catch(() => {});
    }
  };

  // ── Design Architect tool bridge ──────────────────────────────────────────
  // Ava's design_* tools reach here via the sidecar's designControl → a
  // `design_tool` event. We run the command against this canvas with the same
  // code the UI uses, then reply via designToolResult. Held in a ref reassigned
  // every render so it always closes over fresh state.
  const cmdHandlerRef = useRef<(m: { requestId: string; command: string; args: Record<string, unknown> }) => void>(() => {});
  cmdHandlerRef.current = async (m) => {
    const reply = (ok: boolean, data?: unknown, error?: string) =>
      getSidecar().designToolResult(m.requestId, ok, data, error).catch(() => {});
    const args = m.args || {};
    try {
      if (m.command === 'find_shape') {
        const q = String(args.query ?? '').trim();
        const shapes = searchShapes(q, 8).map((s) => ({ id: s.id, label: s.label }));
        reply(true, { shapes });
        return;
      }
      if (m.command === 'generate_icon') {
        const resolved = resolveShape(String(args.shape ?? ''));
        if (!resolved) { reply(false, undefined, `No shape matches "${String(args.shape ?? '')}".`); return; }
        const artDir = typeof args.art_direction === 'string' ? args.art_direction.trim() : '';
        const matArg = MATERIALS.find((x) => x.id === args.material);
        const mat = matArg ?? material; // for the inspector preset display
        const look = artDir || mat.prompt; // Ava's authored look wins; material preset is the fallback
        const col = typeof args.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.colour) ? args.colour : color;
        // Sync the inspector so the user sees what she's making.
        setView('icon'); setShapeId(resolved.id); if (matArg) setMaterialId(matArg.id);
        setColor(col); if (typeof args.size === 'number') setGenSize(args.size);
        const out = await runGeneration(resolved, look, col);
        if (out.ok) reply(true, { label: resolved.label, material: artDir ? 'custom-direction' : mat.label, credits: 20 });
        else reply(false, undefined, out.error || 'Generation failed.');
        return;
      }
      if (m.command === 'generate_set') {
        const list = Array.isArray(args.shapes) ? (args.shapes as unknown[]).map(String) : [];
        const artDir = typeof args.art_direction === 'string' ? args.art_direction.trim() : '';
        const matArg = MATERIALS.find((x) => x.id === args.material);
        const mat = matArg ?? material;
        const look = artDir || mat.prompt; // one look held constant across the family
        const col = typeof args.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.colour) ? args.colour : color;
        setView('icon'); if (matArg) setMaterialId(matArg.id); setColor(col);
        let made = 0; const failed: string[] = [];
        for (const s of list.slice(0, 12)) {
          const resolved = resolveShape(s);
          if (!resolved) { failed.push(s); continue; }
          setShapeId(resolved.id);
          const out = await runGeneration(resolved, look, col);
          if (out.ok && out.dataUrl) { made++; saveToLibrary(out.dataUrl, `${resolved.label}-${mat.label}`.toLowerCase().replace(/\s+/g, '-'), 'icon'); }
          else failed.push(resolved.label);
        }
        reply(true, { made, failed, credits: made * 20 });
        return;
      }
      if (m.command === 'brand_kit') {
        if (args.action === 'update') {
          const active = activeKit();
          const next: BrandKit = {
            ...active,
            name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : active.name,
            palette: { ...active.palette, ...((args.palette as Partial<BrandKit['palette']> | undefined) ?? {}) },
            styleTags: Array.isArray(args.styleTags) ? (args.styleTags as unknown[]).map(String) : active.styleTags,
          };
          upsertKit(next);
          void loadKits();
          reply(true, { name: next.name, palette: next.palette, styleTags: next.styleTags });
        } else {
          const k = activeKit();
          reply(true, { name: k.name, palette: k.palette, styleTags: k.styleTags });
        }
        return;
      }
      if (m.command === 'generate_video') {
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        if (!prompt) { reply(false, undefined, 'A prompt is required to generate a video.'); return; }
        setView('video');
        // Wan duration is 5 or 10 seconds only.
        const dur = (args.duration === 10 || args.duration === '10') ? '10' : '5';
        setVideoDuration(dur);
        // Aspect is synced to the inspector; the Wan route carries orientation via
        // the prompt (no aspect parameter), so only the resolution tier is sent.
        const asp = typeof args.aspect === 'string' && ['16:9', '9:16', '1:1'].includes(args.aspect) ? args.aspect : videoAspect;
        setVideoAspect(asp);
        const resArg = typeof args.resolution === 'string' && args.resolution.includes('1080') ? '1080p'
          : typeof args.resolution === 'string' && args.resolution.includes('720') ? '720p'
          : videoResolution;
        setVideoResolution(resArg);
        const wanRes = resArg === '1080p' ? '1080P' : '720P'; // route: '480P' | '720P' | '1080P'
        const out = await runVideoGeneration(prompt, dur, wanRes);
        if (out.ok) reply(true, { duration: Number(dur), credits: wanRes === '1080P' ? 300 : 150 });
        else reply(false, undefined, out.error || 'Video generation failed.');
        return;
      }
      if (m.command === 'generate_image') {
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
        if (!prompt) { reply(false, undefined, 'A prompt is required to generate an image.'); return; }
        setView('image');
        const size = typeof args.size === 'string' && /^\d+\*\d+$/.test(args.size) ? args.size : imageSize;
        setImageSize(size);
        const out = await runImageGeneration(prompt, size);
        if (out.ok) reply(true, { size });
        else reply(false, undefined, out.error || 'Image generation failed.');
        return;
      }
      if (m.command === 'generate_voice') {
        const script = typeof args.script === 'string' ? args.script.trim() : (typeof args.text === 'string' ? args.text.trim() : '');
        if (!script) { reply(false, undefined, 'A script is required to generate a voiceover.'); return; }
        setView('voice');
        const voice = typeof args.voice === 'string' && args.voice.trim() ? args.voice.trim() : voiceName;
        setVoiceName(voice); setVoiceScript(script);
        const language = typeof args.language === 'string' ? args.language : 'auto';
        const instructions = typeof args.instructions === 'string' ? args.instructions : undefined;
        const out = await runVoiceGeneration(script, voice, language, instructions);
        if (out.ok) reply(true, { voice });
        else reply(false, undefined, out.error || 'Voice generation failed.');
        return;
      }
      if (m.command === 'generate_logo') {
        // Full logo make. The PANEL is the starting brief — whatever Ava leaves
        // unset, the dials supply. Whatever she does set is synced back into them
        // afterwards, so the panel always describes the logo actually on screen.
        const resolved = resolveLogoBrief(args);
        if ('error' in resolved) { reply(false, undefined, resolved.error); return; }
        const brief = resolved.brief;
        const { markSpec } = brief;
        const primary = brief.palette.primary;
        const accent = brief.palette.accent ?? primary;
        const wordColour = brief.wordmarkColor;
        setView('logo');
        setLogoBusy(true); setLogoSystem(null); setLogoExplore(null); setLogoVariant('primary');
        const out = await runLogoGeneration(brief);
        setLogoBusy(false);
        if (out.ok && out.system) {
          setLogoSystem(out.system);
          void saveLogoSystemToLibrary(out.system);   // auto-save to the Library, like every other lane
          setDockOpen(false);                           // reveal the result on the canvas
          // Sync the dials to what Ava actually built — the icon lane's pattern.
          setLogoMarkType(brief.markType);
          setLogoStyle(brief.style);
          setLogoColour(primary);
          setLogoSecondary(accent);
          setLogoWordColour(wordColour);
          setLogoForm(brief.form ?? 'combination');
          setLogoTagline(brief.tagline ?? '');
          setLogoFontId(brief.fontId);
          if (brief.container) setLogoContainer(brief.container);
          if (brief.markType === 'icon' && brief.mark) setLogoMark(brief.mark);
          if (markSpec) setLogoSpec(markSpec);
          // Rasterise the primary lockup so Ava SEES what she made — fed back via
          // the tool's base64_image so she can judge the type and mark, not design
          // blind. On white (the lockup's ground).
          let preview: string | undefined;
          try {
            const primaryAsset = out.system.assets.find(a => a.variant === 'primary') ?? out.system.assets[0];
            if (primaryAsset) {
              const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(primaryAsset.svg);
              const w = vb ? Math.round(parseFloat(vb[1])) : 640;
              const h = vb ? Math.round(parseFloat(vb[2])) : 200;
              const scale = Math.min(3, 900 / Math.max(w, 1));
              const onWhite = primaryAsset.svg.replace(/(<svg[^>]*>)/, '$1<rect width="100%" height="100%" fill="#ffffff"/>');
              const dataUrl = await svgToPngDataUrl(onWhite, Math.round(w * scale), Math.round(h * scale));
              preview = dataUrl.replace(/^data:image\/png;base64,/, '');
            }
          } catch { /* preview is best-effort — the make already succeeded */ }
          reply(true, { brandName: brief.brandName, markType: brief.markType, style: brief.style, concept: brief.symbolDirection, font: brief.fontId, variants: out.system.assets.length, preview });
        }
        else reply(false, undefined, out.error || 'Logo generation failed.');
        return;
      }
      if (m.command === 'explore_logos') {
        // Best-of-N: render several DIRECTIONS at once into one contact sheet so
        // Ava can SEE them together and pick. Exploration only — the winner gets
        // made properly via generate_logo afterwards.
        const cands = Array.isArray(args.candidates) ? (args.candidates as Record<string, unknown>[]) : [];
        if (cands.length < 2) { reply(false, undefined, 'Give at least two candidates to explore.'); return; }
        const brandName = (typeof args.brand_name === 'string' && args.brand_name.trim()) ? args.brand_name.trim() : kit.name;
        setView('logo');
        setLogoBusy(true); setLogoSystem(null); setLogoExplore(null);
        const systems: LogoSystem[] = [];
        for (const c of cands.slice(0, 5)) {
          const co: Record<string, unknown> = { ...c, brand_name: (c.brand_name as string) ?? brandName };
          const rb = resolveLogoBrief(co);
          if ('error' in rb) continue;
          const out = await runLogoGeneration(rb.brief);
          if (out.ok && out.system) systems.push(out.system);
        }
        setLogoBusy(false);
        if (systems.length < 2) { reply(false, undefined, 'Could not render enough candidates — check the mark specs.'); return; }
        setLogoExplore(systems);          // show the options on the canvas
        setDockOpen(false);
        // Contact sheet for Ava's eyes uses the STACKED lockup — a horizontal
        // lockup shrinks the mark to nothing for a long name; stacked keeps it big.
        const cell = (s: LogoSystem) => s.assets.find(a => a.variant === 'stacked')?.svg ?? s.assets.find(a => a.variant === 'primary')!.svg;
        const items = systems.map(s => ({ svg: cell(s), label: `${fontById(s.fontId).label}${s.form === 'emblem' ? ' · emblem' : ''}` }));
        const sheet = contactSheetSvg(items);
        let preview: string | undefined;
        try {
          const dataUrl = await svgToPngDataUrl(sheet.svg, sheet.w, sheet.h);
          preview = dataUrl.replace(/^data:image\/png;base64,/, '');
        } catch { /* best-effort */ }
        reply(true, { count: systems.length, preview });
        return;
      }
      if (m.command === 'save') {
        // A logo on the board saves the whole system; otherwise the icon canvas.
        if (view === 'logo' && logoSystem) {
          await saveLogoSystemToLibrary(logoSystem);
          reply(true, { title: logoSystem.brandName, forms: logoSystem.assets.length });
          return;
        }
        const url = genResultRef.current;
        if (!url) { reply(false, undefined, 'Nothing on the canvas to save yet.'); return; }
        const title = (typeof args.title === 'string' && args.title.trim())
          ? args.title.trim()
          : `${(getShape(shapeId)?.label ?? 'icon')}-${material.label}`.toLowerCase().replace(/\s+/g, '-');
        saveToLibrary(url, title, 'icon');
        reply(true, { title });
        return;
      }
      reply(false, undefined, `Unknown design command: ${m.command}`);
    } catch (e) {
      reply(false, undefined, e instanceof Error ? e.message : 'Design command failed');
    }
  };

  // Single sidecar subscription: the pipeline result AND the design_tool bridge.
  useEffect(() => {
    const handler = (event: SidecarEvent) => {
      if (event.event === 'asset_forge_result') {
        const ok = !!event.success && !!event.dataUrl;
        // The free-form image lane shares this event with the icon lane; route by
        // the pending flag so an image result doesn't land on the icon canvas.
        if (pendingImageRef.current) {
          pendingImageRef.current = false;
          setImageGenerating(false);
          if (ok) { setImageSrc(event.dataUrl!); setDockOpen(false); }
          else setImageError(event.error || 'Generation failed');
          const resolveImg = imageResolverRef.current;
          if (resolveImg) {
            imageResolverRef.current = null;
            resolveImg(ok ? { ok: true, dataUrl: event.dataUrl } : { ok: false, error: event.error || 'Generation failed' });
          }
          return;
        }
        if (ok) { setGenResult(event.dataUrl!); setDockOpen(false); } // icon ready → slide the chat down, reveal it
        else setGenError(event.error || 'Generation failed');
        setGenStatus(null);
        const resolve = genResolverRef.current;
        if (resolve) {
          genResolverRef.current = null;
          resolve(ok ? { ok: true, dataUrl: event.dataUrl } : { ok: false, error: event.error || 'Generation failed' });
        }
        return;
      }
      if (event.event === 'asset_forge_video_result') {
        setVideoGenerating(false);
        const ok = !!event.success && !!event.url;
        if (ok) { setVideoSrc(event.url!); setDockOpen(false); } // clip ready → slide the chat down, reveal it
        const resolve = videoResolverRef.current;
        if (resolve) {
          videoResolverRef.current = null;
          resolve(ok ? { ok: true, url: event.url } : { ok: false, error: event.error || 'Video generation failed' });
        }
        return;
      }
      if (event.event === 'asset_forge_voice_result') {
        setVoiceGenerating(false);
        const ok = !!event.success && !!event.url;
        if (ok) { setVoiceSrc(event.url!); setDockOpen(false); } // audio ready → reveal it
        else setVoiceError(event.error || 'Voice generation failed');
        const resolve = voiceResolverRef.current;
        if (resolve) {
          voiceResolverRef.current = null;
          resolve(ok ? { ok: true, url: event.url } : { ok: false, error: event.error || 'Voice generation failed' });
        }
        return;
      }
      if (event.event === 'design_tool' && event.requestId && event.command) {
        cmdHandlerRef.current({ requestId: event.requestId, command: event.command, args: event.args ?? {} });
      }
    };
    getSidecar().onAny(handler);
    return () => { getSidecar().offAny(handler); };
  }, []);

  const boards: { bg: string; label: string }[] = [
    { bg: CHECKER, label: 'checker' }, { bg: '#000000', label: 'black' },
    { bg: '#ffffff', label: 'white' }, { bg: kit.palette.surface, label: 'brand surface' },
  ];

  const navBtn = (on: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 8,
    fontSize: 12.5, textAlign: 'left', cursor: 'pointer',
    border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'transparent'}`,
    background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
    color: on ? 'var(--accent)' : '#a6adc8', fontWeight: on ? 400 : 300,
  });

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* LEFT RAIL — the three areas */}
      <nav style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', padding: 12, overflowY: 'auto' }}>
        {GROUPS.map(g => (
          <div key={g.labelKey} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px 6px', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 600, color: g.accent }}>
              <span style={{ width: 3, height: 12, borderRadius: 2, background: g.accent }} />{t(g.labelKey)}
            </div>
            {g.items.map(it => {
              // "Soon" items aren't built yet — render them inactive (non-clickable,
              // dimmed) so the sidebar never implies something works when it doesn't.
              const disabled = !!it.soon;
              return (
                <button key={it.id} onClick={disabled ? undefined : () => setView(it.id)} disabled={disabled}
                  style={{ ...navBtn(view === it.id), ...(disabled ? { opacity: 0.45, cursor: 'default' } : {}) }}>
                  {t(`dash.studio.asset.${it.id}`)}
                  {it.soon && <span style={{ marginLeft: 'auto', fontSize: 9, letterSpacing: 0.6, color: '#8b8398', border: `1px solid ${CARD_BORDER}`, padding: '0 6px', borderRadius: 999 }}>{t('dash.studio.soon')}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div style={{ marginTop: 'auto', borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
          <button onClick={() => setView('brandkit')} style={navBtn(view === 'brandkit')}>
            Brand Kit
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: kit.palette.primary }} />
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: kit.palette.accent }} />
            </span>
          </button>
        </div>
      </nav>

      {/* CENTRE — the stage. The dock overlays the lower part when expanded. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', paddingBottom: DOCK_COLLAPSED }}>
        {/* TOP BAR — model picker + credit balance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 24px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <RoomModelPicker />
          <div style={{ flex: 1 }} />
          {credit && (credit.limit >= 999_999_999 || !Number.isFinite(credit.limit)
            ? <span style={{ fontSize: 11, opacity: 0.5, fontFamily: 'monospace', color: '#6c7086' }}>∞ credits</span>
            : credit.limit > 0
              ? <span style={{ fontSize: 11, fontWeight: 600, fontFamily: 'monospace', color: '#a6e3a1' }} title={`${credit.remaining.toLocaleString()} of ${credit.limit.toLocaleString()} credits remaining`}>{credit.remaining.toLocaleString()} left</span>
              : null)}
        </div>

        {view === 'icon' ? (
          <div style={{ flex: 1, minHeight: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 400, color: '#cdd6f4', margin: 0 }}>{t('dash.studio.icon.title')}</h2>
              <p style={{ fontSize: 12, color: '#8b8398', margin: '2px 0 0' }}>{t('dash.studio.icon.subtitle')}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: '#8b8398' }}>{t('dash.studio.check_against')}</span>
              {boards.map(b => (
                <button key={b.label} onClick={() => setBoardBg(b.bg)} title={b.label} aria-label={b.label}
                  style={{ width: 20, height: 20, borderRadius: 4, cursor: 'pointer', background: b.bg, border: `1px solid ${boardBg === b.bg ? '#fff' : CARD_BORDER}` }} />
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 240, borderRadius: 12, border: `1px solid ${CARD_BORDER}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, position: 'relative', background: boardBg }}>
              {genResult && <img src={genResult} alt="Generated icon" style={{ width: 200, height: 200, objectFit: 'contain' }} />}
              {!genResult && !genStatus && shape && (
                <>
                  <div style={{ width: 132, height: 132, opacity: 0.8 }} dangerouslySetInnerHTML={{ __html: buildShapeSvg(shape.elements, 'flat', ['#8b93b8'], 2.6) }} />
                  <p style={{ fontSize: 12, color: '#8b8398', maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}><b style={{ color: '#a6adc8', fontWeight: 500 }}>{t(`dash.studio.material.${material.id}`)}</b> {t('dash.studio.icon.material_desc')}</p>
                </>
              )}
              {genStatus && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#a6adc8' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${CARD_BORDER}`, borderTopColor: 'var(--accent)', animation: 'avaSpin 0.8s linear infinite' }} />
                  {genStatus}
                  <style>{'@keyframes avaSpin { to { transform: rotate(360deg) } }'}</style>
                </div>
              )}
            </div>
            {genError && <p style={{ fontSize: 12, color: '#f38ba8', marginTop: 10 }}>{genError}</p>}
          </div>
        ) : view === 'image' ? (
          <div style={{ flex: 1, minHeight: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 400, color: '#cdd6f4', margin: 0 }}>{t('dash.studio.image.title')}</h2>
              <p style={{ fontSize: 12, color: '#8b8398', margin: '2px 0 0' }}>{t('dash.studio.image.subtitle')}</p>
            </div>
            <div style={{ flex: 1, minHeight: 240, borderRadius: 12, border: `1px solid ${CARD_BORDER}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, position: 'relative', background: '#0f0a17', overflow: 'hidden' }}>
              {imageSrc && <img src={imageSrc} alt="Generated image" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
              {!imageSrc && !imageGenerating && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: '0 32px', pointerEvents: 'none' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  <div style={{ fontSize: 12, color: '#8b8398', maxWidth: 340, lineHeight: 1.6 }}>{t('dash.studio.image.hint')}</div>
                </div>
              )}
              {imageGenerating && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#a6adc8' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${CARD_BORDER}`, borderTopColor: 'var(--accent)', animation: 'avaSpin 0.8s linear infinite' }} />
                  Generating…
                  <style>{'@keyframes avaSpin { to { transform: rotate(360deg) } }'}</style>
                </div>
              )}
            </div>
            {imageError && <p style={{ fontSize: 12, color: '#f38ba8', marginTop: 10 }}>{imageError}</p>}
          </div>
        ) : view === 'video' ? (
          <div style={{ flex: 1, minHeight: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 17, fontWeight: 400, color: '#cdd6f4', margin: 0 }}>{t('dash.studio.video.title')}</h2>
              <p style={{ fontSize: 12, color: '#8b8398', margin: '2px 0 0' }}>{t('dash.studio.video.subtitle')}</p>
            </div>
            <VideoStage durationSec={Number(videoDuration)} src={videoSrc ?? undefined} generating={videoGenerating} />
          </div>
        ) : view === 'voice' ? (
          <div style={{ flex: 1, minHeight: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ fontSize: 17, fontWeight: 400, color: '#cdd6f4', margin: 0 }}>{t('dash.studio.voice.title')}</h2>
              <p style={{ fontSize: 12, color: '#8b8398', margin: '2px 0 0' }}>{t('dash.studio.voice.subtitle')}</p>
            </div>
            {voiceSrc ? (
              <audio controls src={voiceSrc} style={{ width: '100%', marginTop: 8 }} />
            ) : voiceGenerating ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#a6adc8', padding: '20px 0' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${CARD_BORDER}`, borderTopColor: 'var(--accent)', animation: 'avaSpin 0.8s linear infinite' }} />
                Voicing…
                <style>{'@keyframes avaSpin { to { transform: rotate(360deg) } }'}</style>
              </div>
            ) : (
              <WaveformPlayer voiceName={voiceName} durationSec={8} />
            )}
            {voiceError && <p style={{ fontSize: 12, color: '#f38ba8', marginTop: 10 }}>{voiceError}</p>}
          </div>
        ) : view === 'logo' ? (
          <div style={{ flex: 1, minHeight: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 400, color: '#cdd6f4', margin: 0 }}>{t('dash.studio.logo.title')}</h2>
              <p style={{ fontSize: 12, color: '#8b8398', margin: '2px 0 0' }}>{t('dash.studio.logo.subtitle')}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: '#8b8398' }}>{t('dash.studio.check_against')}</span>
              {boards.map(b => (
                <button key={b.label} onClick={() => setLogoBoard(b.bg)} title={b.label} aria-label={b.label}
                  style={{ width: 20, height: 20, borderRadius: 4, cursor: 'pointer', background: b.bg, border: `1px solid ${logoBoard === b.bg ? '#fff' : CARD_BORDER}` }} />
              ))}
            </div>
            <style>{`.logo-stage svg{max-height:150px;max-width:82%;width:auto;height:auto;display:block}.logo-chip svg{max-height:34px;max-width:100%;width:auto;height:auto;display:block}.logo-cand svg{max-height:120px;max-width:88%;width:auto;height:auto;display:block}`}</style>
            <div style={{ flex: 1, minHeight: 220, borderRadius: 12, border: `1px solid ${CARD_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: logoBoard }}>
              {/* Best-of-N: the options grid. Click one to pick it as the logo. */}
              {logoExplore && !logoBusy && (
                <div style={{ width: '100%', height: '100%', overflowY: 'auto', padding: 16 }}>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: `repeat(${logoExplore.length <= 2 ? logoExplore.length : 2}, 1fr)` }}>
                    {logoExplore.map((s, i) => {
                      const shown = s.assets.some(x => x.variant === 'stacked') ? 'stacked' as const : 'primary' as const;
                      const a = s.assets.find(x => x.variant === shown)!;
                      return (
                        <button key={i} onClick={() => { setLogoSystem(s); setLogoVariant(shown); setLogoExplore(null); void saveLogoSystemToLibrary(s); }} title={`Pick ${i + 1}`}
                          style={{ background: logoBoard, borderRadius: 8, border: `1px solid ${CARD_BORDER}`, cursor: 'pointer', padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <div className="logo-cand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 150 }} dangerouslySetInnerHTML={{ __html: a.svg.replace(/\s(width|height)="[^"]*"/g, '') }} />
                          <div style={{ fontSize: 10.5, color: '#8b8398', fontWeight: 500 }}>{i + 1}. {fontById(s.fontId).label}{s.form === 'emblem' ? ' · emblem' : ''}</div>
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ textAlign: 'center', fontSize: 11, color: '#8b8398', marginTop: 12 }}>{t('dash.studio.logo.pick_hint')}</p>
                </div>
              )}
              {logoSystem && !logoExplore && !logoBusy && (() => {
                const a = logoSystem.assets.find(x => x.variant === logoVariant) ?? logoSystem.assets[0];
                return <div className="logo-stage" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', padding: 32 }} dangerouslySetInnerHTML={{ __html: a.svg.replace(/\s(width|height)="[^"]*"/g, '') }} />;
              })()}
              {!logoSystem && !logoExplore && !logoBusy && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: '0 32px', pointerEvents: 'none' }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M7 12h10" opacity="0.5" /></svg>
                  <div style={{ fontSize: 13.5, color: '#a6adc8' }}>{t('dash.studio.logo.empty_title')} {kit.name}</div>
                  <div style={{ fontSize: 12, color: '#8b8398', maxWidth: 360, lineHeight: 1.6 }}>{t('dash.studio.logo.empty_desc')}</div>
                </div>
              )}
              {logoBusy && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(12,8,20,0.6)' }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${CARD_BORDER}`, borderTopColor: 'var(--accent)', animation: 'avaSpin 0.8s linear infinite' }} />
                  <div style={{ fontSize: 12.5, color: '#a6adc8' }}>{t('dash.studio.logo.busy')}</div>
                  <style>{'@keyframes avaSpin { to { transform: rotate(360deg) } }'}</style>
                </div>
              )}
            </div>
            {/* Variant strip — pick which form sits on the board. */}
            {logoSystem && !logoExplore && !logoBusy && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {logoSystem.assets.map(a => (
                  <button key={a.variant} onClick={() => setLogoVariant(a.variant)} title={a.label}
                    style={{ flexShrink: 0, width: 76, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${logoVariant === a.variant ? 'var(--accent)' : CARD_BORDER}`, background: 'transparent' }}>
                    <div className="logo-chip" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44, padding: '0 8px', background: a.variant === 'mono-light' ? '#1b1b22' : '#ffffff' }} dangerouslySetInnerHTML={{ __html: a.svg.replace(/\s(width|height)="[^"]*"/g, '') }} />
                    <div style={{ padding: 4, fontSize: 8.5, color: '#8b8398', borderTop: `1px solid ${CARD_BORDER}`, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : view === 'brandkit' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            <h2 style={{ fontSize: 17, fontWeight: 400, color: '#cdd6f4', margin: 0 }}>{t('dash.studio.brandkit.title')}</h2>
            <p style={{ fontSize: 12, color: '#8b8398', margin: '2px 0 16px' }}>{t('dash.studio.brandkit.subtitle')}</p>
            <div style={{ maxWidth: 460 }}>
              <label style={{ fontSize: 11, color: '#8b8398', display: 'block', marginBottom: 6 }}>Palette</label>
              {(Object.keys(kit.palette) as (keyof typeof kit.palette)[]).map(role => (
                <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 12.5, color: '#a6adc8' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 4, background: kit.palette[role] }} />
                  <span style={{ textTransform: 'capitalize' }}>{role}</span>
                  <code style={{ marginLeft: 'auto', fontSize: 11, color: '#8b8398' }}>{kit.palette[role].toUpperCase()}</code>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: '0 40px', color: '#8b8398' }}>
            <PenNib weight="duotone" size={26} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 15, color: '#a6adc8' }}>{t(`dash.studio.asset.${view}`)}</span>
            <span style={{ maxWidth: 420, fontSize: 13, lineHeight: 1.6 }}>{t('dash.studio.coming_soon')}</span>
          </div>
        )}

        {/* DESIGN ARCHITECT DOCK — bottom-anchored; the composer stays static while
            the conversation slides up above it (height animates COLLAPSED ⇄ 58%). */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'height 0.3s ease-out', height: dockOpen ? '58%' : DOCK_COLLAPSED, background: 'rgba(13,9,22,0.97)' }}>
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 6, paddingBottom: 4, borderTop: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
            <button onClick={() => setDockOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, border: `1px solid ${CARD_BORDER}`, fontSize: 11, color: '#8b8398', cursor: 'pointer', background: 'rgba(13,9,22,0.92)' }}>
              <span style={{ position: 'relative', width: 14, height: 14, borderRadius: '50%', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg, var(--accent), #6366f1)' }}>
                A
                <img src="/ava-avatar.jpeg" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              </span>
              Design Architect
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dockOpen ? 'rotate(180deg)' : 'none' }} aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <DesignArchitectDock showMessages={renderConv} onComposerFocus={() => setDockOpen(true)} designRoom={designRoom} />
          </div>
        </div>
      </div>

      {/* RIGHT RAIL — the inspector (icon lane) */}
      {view === 'icon' && (
        <aside style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Section title={t('dash.studio.icon.shape')}>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('dash.studio.icon.shape_search_ph')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 12, outline: 'none', background: 'rgba(26,16,40,0.5)', color: '#cdd6f4', border: `1px solid ${CARD_BORDER}`, boxSizing: 'border-box' }} />
              {/* No Tailwind reset in the IDE, so the injected shape SVGs render
                  inline at default size and spill out of their tiles onto the
                  caption below. This scopes them to fit their box cleanly. */}
              <style>{`.ava-ds-tile{overflow:hidden;display:flex;align-items:center;justify-content:center}.ava-ds-tile svg{display:block;width:100%;height:100%}`}</style>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginTop: 10 }}>
                {hits.map((h: ShapeHit) => {
                  const on = h.id === shapeId;
                  return (
                    <button key={h.id} className="ava-ds-tile" onClick={() => setShapeId(h.id)} title={h.label} aria-label={h.label}
                      style={{ aspectRatio: '1 / 1', borderRadius: 8, cursor: 'pointer', padding: 9, background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'rgba(26,16,40,0.5)', border: `1px solid ${on ? 'var(--accent)' : CARD_BORDER}` }}
                      dangerouslySetInnerHTML={{ __html: buildShapeSvg(h.elements, 'line', [on ? '#c9a2ff' : '#8b93b8']) }} />
                  );
                })}
              </div>
              <p style={{ fontSize: 10.5, color: '#8b8398', marginTop: 12 }}>{t('dash.studio.icon.shape_credit')}</p>
            </Section>

            <Section title={t('dash.studio.icon.material')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {MATERIALS.map(m => {
                  const on = materialId === m.id;
                  return (
                    <button key={m.id} onClick={() => setMaterialId(m.id)} title={t(`dash.studio.material.${m.id}`)}
                      style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, textAlign: 'center', border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : CARD_BORDER}`, background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'rgba(26,16,40,0.5)', color: on ? 'var(--accent)' : '#a6adc8' }}>{t(`dash.studio.material.${m.id}`)}</button>
                  );
                })}
              </div>
              <p style={{ fontSize: 10.5, color: '#8b8398', marginTop: 6 }}>{t('dash.studio.icon.material_hint')}</p>
            </Section>

            <Section title={t('dash.studio.icon.icon_colour')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 12, color: '#a6adc8' }}>
                <ColorField value={color} onChange={setColor} swatches={Object.values(kit.palette)} />
                {t('dash.studio.icon.icon_colour')}
                <code style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8b8398' }}>{color.toUpperCase()}</code>
              </div>
              <p style={{ fontSize: 10.5, color: '#8b8398', marginTop: 4 }}>{t('dash.studio.icon.colour_hint')}</p>
            </Section>

            <Section title={t('dash.studio.output')}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#a6adc8', padding: '5px 0' }}>
                <span>{t('dash.studio.icon.size')}</span>
                <Select size="sm" style={{ width: 118 }} value={String(genSize)} onChange={v => setGenSize(Number(v))}
                  options={PNG_SIZES.map(s => ({ value: String(s), label: `${s} × ${s}` }))} />
              </div>
              <p style={{ fontSize: 10.5, color: '#8b8398' }}>{t('dash.studio.icon.output_hint')}</p>
            </Section>
          </div>
          {/* No Generate button — Ava generates. Ask her in the dock. */}
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (logo lane). Two-way dials: they seed Ava's
          brief and sync back to whatever she builds. */}
      {view === 'logo' && (
        <aside style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Section title={t('dash.studio.logo.form')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {LOGO_FORMS.map(f => (
                  <button key={f.id} onClick={() => setLogoForm(f.id)} style={logoPill(logoForm === f.id)}>{t(`dash.studio.logo.form.${f.id}`)}</button>
                ))}
              </div>
              {logoForm === 'emblem' && (
                <input value={logoTagline} onChange={e => setLogoTagline(e.target.value)} placeholder={t('dash.studio.logo.tagline_ph')}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 12, outline: 'none', background: 'rgba(26,16,40,0.5)', color: '#cdd6f4', border: `1px solid ${CARD_BORDER}`, boxSizing: 'border-box', marginTop: 8 }} />
              )}
            </Section>

            <Section title={t('dash.studio.logo.mark_type')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {MARK_TYPES.map(mt => (
                  <button key={mt.id} onClick={() => setLogoMarkType(mt.id)} style={logoPill(logoMarkType === mt.id)}>{t(`dash.studio.marktype.${mt.id}`)}</button>
                ))}
              </div>
              {logoMarkType === 'icon' && (
                <>
                  <style>{`.ava-ds-tile{overflow:hidden;display:flex;align-items:center;justify-content:center}.ava-ds-tile svg{display:block;width:100%;height:100%}`}</style>
                  <input value={logoQuery} onChange={e => setLogoQuery(e.target.value)} placeholder={t('dash.studio.logo.shape_search_ph')}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 12, outline: 'none', background: 'rgba(26,16,40,0.5)', color: '#cdd6f4', border: `1px solid ${CARD_BORDER}`, boxSizing: 'border-box', marginTop: 8 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginTop: 8 }}>
                    {logoHits.map((h: ShapeHit) => {
                      const on = h.id === logoMark;
                      return (
                        <button key={h.id} className="ava-ds-tile" onClick={() => setLogoMark(h.id)} title={h.label} aria-label={h.label}
                          style={{ aspectRatio: '1 / 1', borderRadius: 8, cursor: 'pointer', padding: 9, background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'rgba(26,16,40,0.5)', border: `1px solid ${on ? 'var(--accent)' : CARD_BORDER}` }}
                          dangerouslySetInnerHTML={{ __html: buildShapeSvg(h.elements, 'line', [on ? '#c9a2ff' : '#8b93b8']) }} />
                      );
                    })}
                  </div>
                </>
              )}
              {logoMarkType === 'letter' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8 }}>
                  {(['none', 'ring'] as const).map(c => (
                    <button key={c} onClick={() => setLogoContainer(c)} style={logoPill(logoContainer === c)}>{c === 'none' ? t('dash.studio.logo.container.none') : t('dash.studio.logo.container.ring')}</button>
                  ))}
                </div>
              )}
              {logoMarkType === 'geometry' && (
                <p style={{ fontSize: 10.5, color: '#8b8398', marginTop: 8 }}>{logoSpec ? `${t('dash.studio.logo.construction')}: ${logoSpec.concept}` : t('dash.studio.logo.construction_hint')}</p>
              )}
            </Section>

            <Section title={t('dash.studio.logo.style')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {LOGO_STYLES.map(s => (
                  <button key={s.id} onClick={() => setLogoStyle(s.id)} style={logoPill(logoStyle === s.id)}>{t(`dash.studio.style.${s.id}`)}</button>
                ))}
              </div>
            </Section>

            <Section title={t('dash.studio.logo.mark_colour')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 12, color: '#a6adc8' }}>
                <ColorField value={logoColour} onChange={setLogoColour} swatches={Object.values(kit.palette)} />
                {t('dash.studio.logo.mark_colour')}
                <code style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8b8398' }}>{logoColour.toUpperCase()}</code>
              </div>
              {TWO_TONE(logoStyle) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 12, color: '#a6adc8' }}>
                  <ColorField value={logoSecondary} onChange={setLogoSecondary} swatches={Object.values(kit.palette)} />
                  {t('dash.studio.logo.second_colour')}
                  <code style={{ marginLeft: 'auto', fontSize: 10.5, color: '#8b8398' }}>{logoSecondary.toUpperCase()}</code>
                </div>
              )}
            </Section>

            <Section title={t('dash.studio.logo.wordmark')}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#a6adc8', padding: '5px 0' }}>
                <span>{t('dash.studio.logo.font')}</span>
                <Select size="sm" style={{ width: 150 }} value={logoFontId || suggestFont(kit.styleTags).id} onChange={v => setLogoFontId(v)}
                  options={WORDMARK_FONTS.map(f => ({ value: f.id, label: f.label }))} />
              </div>
              <div style={{ fontSize: 11, color: '#8b8398', margin: '2px 0 6px' }}>{t('dash.studio.logo.wordmark_colour')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {(['ink', 'brand'] as const).map(w => (
                  <button key={w} onClick={() => setLogoWordColour(w)} style={logoPill(logoWordColour === w)}>{w === 'ink' ? t('dash.studio.logo.wc.ink') : t('dash.studio.logo.wc.brand')}</button>
                ))}
              </div>
              <p style={{ fontSize: 10.5, color: '#8b8398', marginTop: 6 }}>{t('dash.studio.logo.wc.ink_desc')}</p>
            </Section>
          </div>
          {/* No Generate button — Ava designs. Ask her in the dock. */}
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (image lane) */}
      {view === 'image' && (
        <aside style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Section title={t('dash.studio.output')}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#a6adc8', padding: '5px 0' }}>
                <span>{t('dash.studio.image.size')}</span>
                <Select size="sm" style={{ width: 140 }} value={imageSize} onChange={setImageSize}
                  options={[{ value: '1280*1280', label: t('dash.studio.image.square') }, { value: '1664*928', label: '16:9' }, { value: '928*1664', label: '9:16' }]} />
              </div>
              <p style={{ fontSize: 10.5, color: '#8b8398', marginTop: 6 }}>{t('dash.studio.image.hint')}</p>
            </Section>
          </div>
          {/* No Generate button — Ava generates. Ask her in the dock. */}
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (video lane) */}
      {view === 'video' && (
        <aside style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Section title={t('dash.studio.output')}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#a6adc8', padding: '5px 0' }}>
                <span>{t('dash.studio.video.duration')}</span>
                <Select size="sm" style={{ width: 118 }} value={videoDuration} onChange={setVideoDuration}
                  options={[{ value: '5', label: '5s' }, { value: '10', label: '10s' }]} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#a6adc8', padding: '5px 0' }}>
                <span>{t('dash.studio.video.aspect')}</span>
                <Select size="sm" style={{ width: 118 }} value={videoAspect} onChange={setVideoAspect}
                  options={[{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }, { value: '1:1', label: '1:1' }]} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#a6adc8', padding: '5px 0' }}>
                <span>{t('dash.studio.video.resolution')}</span>
                <Select size="sm" style={{ width: 118 }} value={videoResolution} onChange={setVideoResolution}
                  options={[{ value: '720p', label: '720p' }, { value: '1080p', label: '1080p' }]} />
              </div>
            </Section>

            <p style={{ fontSize: 10.5, color: '#8b8398', margin: 0 }}>Ava generates this — describe it and she'll create it.</p>
          </div>
        </aside>
      )}

      {/* RIGHT RAIL — the inspector (voice lane) */}
      {view === 'voice' && (
        <aside style={{ width: 320, flexShrink: 0, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Section title={t('dash.studio.voice.voice')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {VOICES.map(v => {
                  const on = v === voiceName;
                  return (
                    <button key={v} onClick={() => setVoiceName(v)} title={v}
                      style={{ padding: '8px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : CARD_BORDER}`, background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'rgba(26,16,40,0.5)', color: on ? 'var(--accent)' : '#a6adc8' }}>{v}</button>
                  );
                })}
              </div>
              <p style={{ fontSize: 10.5, color: '#8b8398', marginTop: 8 }}>Qwen3-TTS built-in voices. Placeholder names — the real roster lands with wiring.</p>
            </Section>

            <Section title="Script">
              <textarea value={voiceScript} onChange={e => setVoiceScript(e.target.value)}
                placeholder="Type the line for Ava to speak…"
                rows={4}
                style={{ width: '100%', resize: 'vertical', minHeight: 80, padding: '9px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5, outline: 'none', background: 'rgba(26,16,40,0.5)', color: '#cdd6f4', border: `1px solid ${CARD_BORDER}`, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </Section>

            <Section title="Delivery">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#a6adc8', padding: '5px 0' }}>
                <span>Emotion</span>
                <Select size="sm" style={{ width: 130 }} value={voiceEmotion} onChange={setVoiceEmotion}
                  options={[{ value: 'neutral', label: 'Neutral' }, { value: 'warm', label: 'Warm' }, { value: 'bright', label: 'Bright' }, { value: 'calm', label: 'Calm' }, { value: 'excited', label: 'Excited' }]} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#a6adc8', padding: '5px 0' }}>
                <span>Speed</span>
                <Select size="sm" style={{ width: 130 }} value={voiceSpeed} onChange={setVoiceSpeed}
                  options={[{ value: '0.75', label: '0.75×' }, { value: '1.0', label: '1.0×' }, { value: '1.25', label: '1.25×' }]} />
              </div>
            </Section>

            <p style={{ fontSize: 10.5, color: '#8b8398', margin: 0 }}>Ava generates this — describe it and she'll create it.</p>
          </div>
        </aside>
      )}
    </div>
  );
}

// ── Design Architect DOCK chat ──────────────────────────────────────────────
// Self-contained chat on the 'design' surface (mirrors HealthRoomChat, lane
// 'design'). Local-only — no cloud. Renders its own stream; the main chat and
// other rooms ignore lane === 'design'.

interface DockAttachment { name: string; dataUri: string; mimeType: string }
interface ToolChip { name: string; status: 'running' | 'done' | 'error' }
interface DockMessage { id: string; role: 'user' | 'ava' | 'error'; text: string; toolCalls?: ToolChip[] }
interface DockConfirm { id: string; question: string }

let _drid = 0;
const drid = () => `ds-${++_drid}-${Date.now()}`;

// Keys, not text — module-level, so resolved strings would freeze at import.
// Both label AND prompt are translated: the prompt is prefilled into the
// composer, and a Spanish user should not watch an English sentence appear.
const DOCK_STARTERS: { icon: string; key: string }[] = [
  { icon: '🔔', key: 'dash.studio.starter.icon.1' },
  { icon: '🎛', key: 'dash.studio.starter.icon.2' },
  { icon: '🎨', key: 'dash.studio.starter.icon.3' },
];

// Open-Canvas Video room starters — verbatim room copy (label → prefill prompt).
const DOCK_STARTERS_VIDEO: { icon: string; key: string }[] = [
  { icon: '🎬', key: 'dash.studio.starter.video.1' },
  { icon: '📦', key: 'dash.studio.starter.video.2' },
  { icon: '🌅', key: 'dash.studio.starter.video.3' },
  { icon: '📱', key: 'dash.studio.starter.video.4' },
];

// Open-Canvas Voiceover room starters — verbatim room copy (label → prefill prompt).
const DOCK_STARTERS_VOICE: { icon: string; key: string }[] = [
  { icon: '🎙', key: 'dash.studio.starter.voice.1' },
  { icon: '🗣', key: 'dash.studio.starter.voice.2' },
  { icon: '✨', key: 'dash.studio.starter.voice.3' },
  { icon: '🧘', key: 'dash.studio.starter.voice.4' },
];

const DESIGN_CHAT_KEY = 'ava-ide-design-chat';

function DesignArchitectDock({ showMessages, onComposerFocus, designRoom = 'icon' }: { showMessages: boolean; onComposerFocus: () => void; designRoom?: 'icon' | 'video' | 'voice' | 'image' | 'logo' }) {
  // Persist the design conversation like every other room — it was pure local
  // state before, so it vanished on every reload / tab switch.
  const [messages, setMessages] = useState<DockMessage[]>(() => {
    try { const raw = localStorage.getItem(DESIGN_CHAT_KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(DESIGN_CHAT_KEY, JSON.stringify(messages)); } catch { /* quota / disabled */ }
  }, [messages]);
  // Mirror of `messages` for the send path. `messages` changes on every stream
  // token, so reading it through a ref keeps send() out of that churn instead
  // of rebuilding the callback hundreds of times a turn.
  const messagesRef = useRef<DockMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [attachments, setAttachments] = useState<DockAttachment[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<DockConfirm | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Subscribe to the sidecar, processing ONLY design-lane events.
  useEffect(() => {
    const handler = (event: SidecarEvent) => {
      if (event.lane !== 'design') return;
      switch (event.event) {
        case 'stream_delta':
          if (event.content) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'ava') copy[copy.length - 1] = { ...last, text: last.text + event.content };
              return copy;
            });
          }
          break;
        case 'confirm_required':
          if (event.id) {
            const question = (event.profileField?.question) || (event.args?.question as string) || event.message || 'Ava needs a quick answer.';
            setPendingConfirm({ id: event.id, question });
          }
          break;
        case 'tool_call_start':
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'ava') copy[copy.length - 1] = { ...last, toolCalls: [...(last.toolCalls || []), { name: event.toolName || 'tool', status: 'running' }] };
            return copy;
          });
          break;
        case 'tool_call_end':
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'ava' && last.toolCalls) {
              const tools = [...last.toolCalls];
              const idx = tools.findIndex((tc) => tc.name === event.toolName && tc.status === 'running');
              if (idx >= 0) { tools[idx] = { ...tools[idx], status: event.success ? 'done' : 'error' }; copy[copy.length - 1] = { ...last, toolCalls: tools }; }
            }
            return copy;
          });
          break;
        case 'done':
        case 'stopped':
        case 'cancelled':
          setStreaming(false);
          break;
        case 'error':
          setMessages((prev) => [...prev, { id: drid(), role: 'error', text: event.message || 'Something went wrong.' }]);
          setStreaming(false);
          break;
      }
    };
    getSidecar().onAny(handler);
    return () => { getSidecar().offAny(handler); };
  }, []);

  useEffect(() => { if (showMessages) endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showMessages, pendingConfirm]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    // Only block a genuinely empty send. We deliberately do NOT block on
    // `streaming`: if a prior turn's terminal event never cleared it, that flag
    // would wedge the composer forever and silently swallow every send (the
    // design chat's original "nothing fires" bug). The sidecar's own isRunning
    // guard is the real concurrency control — it folds an overlapping send in
    // as context rather than dropping it.
    if (!text && attachments.length === 0) return;
    const atts = attachments.length ? attachments : undefined;
    setMessages((prev) => [...prev, { id: drid(), role: 'user', text: text || '(attachment)' }, { id: drid(), role: 'ava', text: '', toolCalls: [] }]);
    setStreaming(true);
    setInput('');
    setAttachments([]);
    const sc = getSidecar();
    // Replay the persisted conversation. The dock restores its bubbles from
    // localStorage, but the sidecar's design thread is IN-MEMORY and starts
    // empty on every app/sidecar restart — so without this Ava is answering
    // about a conversation she has never seen ("I don't have context from the
    // previous session") while the user is staring at it on screen. Same
    // contract the main chat uses. `messagesRef` is still pre-update here, so
    // this is everything BEFORE the new turn, which goes as `content`.
    const history = messagesRef.current
      .filter((m) => (m.role === 'user' || m.role === 'ava') && m.text.trim())
      .map((m) => ({ role: m.role === 'ava' ? 'assistant' : 'user', text: m.text }));
    logDiag(`design send → sendMessage(surface=design, room=${designRoom}, ready=${sc.isReady}, history=${history.length}) "${text.slice(0, 40)}"`);
    sc.sendMessage(text || '(see attachment)', atts, history.length ? history : undefined, 'design', undefined, designRoom)
      .then(() => logDiag('design send → sendMessage resolved (written to sidecar)'))
      .catch((e) => { logDiag(`design send FAILED: ${e?.message || e}`, 'error'); setStreaming(false); });
  }, [attachments, designRoom]);

  const handleAttach = useCallback(() => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*,.pdf,.docx,.xlsx,.pptx,.csv,.txt,.md';
    picker.multiple = true;
    picker.onchange = () => {
      if (!picker.files) return;
      for (const file of Array.from(picker.files)) {
        const reader = new FileReader();
        reader.onload = () => setAttachments((prev) => [...prev, { name: file.name, dataUri: reader.result as string, mimeType: file.type }]);
        reader.readAsDataURL(file);
      }
    };
    picker.click();
  }, []);
  const removeAttachment = useCallback((idx: number) => setAttachments((prev) => prev.filter((_, i) => i !== idx)), []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const respondConfirm = useCallback((approved: boolean) => {
    // The confirm() side effect MUST live OUTSIDE the setState updater. React
    // StrictMode double-invokes updaters in dev, which fired confirm() twice for
    // the same id — the first resolved it, the second hit the sidecar as
    // "No pending confirmation" (the red error you saw, even though the answer
    // actually went through).
    const pc = pendingConfirm;
    if (!pc) return;
    setPendingConfirm(null);
    if (approved) getSidecar().confirm(pc.id, true, confirmText || undefined).catch(() => {});
    else getSidecar().confirm(pc.id, false).catch(() => {});
    setConfirmText('');
  }, [pendingConfirm, confirmText]);

  const clearRoom = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem(DESIGN_CHAT_KEY); } catch { /* ignore */ }
    setPendingConfirm(null);
    getSidecar().clear('design').catch(() => {});
  }, []);

  const hasSpoken = messages.some((m) => m.role === 'user');

  // Room-aware empty state — the Design Architect greeting, heading and starter
  // chips follow the operator into the Open Canvas (Video / Voiceover). Icon
  // keeps the current studio copy exactly. No name is threaded into this dock,
  // so the greeting renders "Hey — …" (matching the existing name-less card).
  const dockStarters = designRoom === 'video' ? DOCK_STARTERS_VIDEO : designRoom === 'voice' ? DOCK_STARTERS_VOICE : DOCK_STARTERS;
  const dockHeading = designRoom === 'video' ? 'Direct with Ava' : designRoom === 'voice' ? 'Voice with Ava' : 'Design an icon with the Architect';
  const dockGreeting = designRoom === 'video'
    ? "Hey — Design Architect here, and we're on the Open Canvas. What are we filming? Give me the shot — subject, mood, the motion you want — and I'll direct it and render it right here."
    : designRoom === 'voice'
    ? "Hey — Design Architect here, on the Open Canvas. What are we voicing? Tell me the script and the kind of voice you want, and I'll narrate it for you."
    : 'Tell me the shape, the material and your brand colour — I find the shape, direct the art and generate a clean transparent icon.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Clear-chat strip — only when the conversation is visible + has content */}
      {showMessages && messages.length > 0 && (
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', padding: '6px 14px 0' }}>
          <button type="button" onClick={clearRoom} title={t('header.clear_chat')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            {t('header.clear_chat')}
          </button>
        </div>
      )}

      {/* Stream — only mounted while the dock is expanded (slide anim) */}
      {showMessages && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {!hasSpoken ? (
            <div style={{ width: '100%' }}>
              <div style={{ borderRadius: 14, padding: 16, background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent), rgba(96,165,250,0.04))', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>{dockHeading}</div>
                <p style={{ fontSize: 12, lineHeight: 1.5, color: '#a6adc8', margin: '0 0 14px' }}>{dockGreeting}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {dockStarters.map((s) => (
                    <button key={s.key} type="button" onClick={() => { setInput(t(`${s.key}_p`)); inputRef.current?.focus(); onComposerFocus(); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'rgba(26,16,40,0.5)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: '#cdd6f4', cursor: 'pointer' }}>
                      <span aria-hidden>{s.icon}</span>{t(s.key)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((m) => (
                <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {m.toolCalls.map((tc, i) => (
                        <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: tc.status === 'error' ? '#f38ba8' : tc.status === 'done' ? '#a6e3a1' : '#a78bfa' }}>
                          {tc.status === 'done' ? '✓' : tc.status === 'error' ? '✕' : '⋯'} {tc.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {(m.text || m.role !== 'ava') && (
                    <div style={{
                      fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', padding: '10px 14px', borderRadius: 10,
                      background: m.role === 'user' ? 'color-mix(in srgb, #60a5fa 13%, transparent)' : m.role === 'error' ? 'rgba(243,139,168,0.12)' : 'color-mix(in srgb, var(--accent) 6%, transparent)',
                      border: m.role === 'error' ? '1px solid rgba(243,139,168,0.3)' : 'none',
                      borderLeft: m.role === 'user' ? '2px solid color-mix(in srgb, #60a5fa 55%, transparent)' : m.role === 'error' ? undefined : '2px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                      borderRight: m.role === 'user' ? '2px solid color-mix(in srgb, #60a5fa 55%, transparent)' : m.role === 'error' ? undefined : '2px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                      color: m.role === 'error' ? '#f38ba8' : '#cdd6f4',
                    }}>
                      {m.text}
                    </div>
                  )}
                </div>
              ))}
              {streaming && messages[messages.length - 1]?.text === '' && !pendingConfirm && (
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, alignSelf: 'flex-start' }}>
                  <style>{`@keyframes dsThinkPulse { 0%,80%,100% { opacity:.3; transform:scale(.8); } 40% { opacity:1; transform:scale(1); } }`}</style>
                  {/* Ava avatar — identical to the main chat's Ava row (32px, marginRight 10) */}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginRight: 10, overflow: 'hidden', background: 'linear-gradient(135deg, var(--accent), #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="/ava-avatar.jpeg" alt="Ava" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  {/* Same 7px pulsing dots + 11px status text as the main chat typing indicator */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'dsThinkPulse 1.4s infinite', animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: '#a6adc8', marginLeft: 10 }}>Thinking…</span>
                </div>
              )}
            </div>
          )}
          {/* Inline confirmation card (ask_user / confirm) */}
          {pendingConfirm && (
            <div style={{ marginTop: 12, borderRadius: 12, padding: 14, background: 'rgba(26,16,40,0.6)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
              <div style={{ fontSize: 13, color: '#cdd6f4', marginBottom: 10 }}>{pendingConfirm.question}</div>
              <input autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') respondConfirm(true); }}
                placeholder={t('dash.studio.dock.answer_ph')}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'rgba(26,16,40,0.5)', color: '#cdd6f4', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => respondConfirm(false)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${CARD_BORDER}`, background: 'transparent', color: '#a6adc8', fontSize: 12, cursor: 'pointer' }}>Skip</button>
                <button type="button" onClick={() => respondConfirm(true)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Send</button>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {/* Composer — pinned at the bottom, always visible */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, padding: 10 }}>
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {attachments.map((att, idx) => (
              <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', background: 'rgba(26,16,40,0.6)' }}>
                {att.mimeType.startsWith('image/') && att.dataUri?.startsWith('data:') ? (
                  <img src={att.dataUri} alt={att.name} style={{ height: 48, maxWidth: 100, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: '#6c7086', display: 'flex', alignItems: 'center', gap: 6 }}><PhPaperclip size={12} weight="duotone" /> {att.name}</div>
                )}
                <button onClick={() => removeAttachment(idx)} style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <span style={{ flexShrink: 0, alignSelf: 'center', padding: '5px 10px', borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),#7c3aed)', color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>Design</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onComposerFocus}
            rows={1}
            placeholder={t('dash.studio.dock.ask')}
            style={{ flex: 1, resize: 'none', minHeight: 38, maxHeight: 160, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'rgba(26,16,40,0.5)', color: '#cdd6f4', padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
          <button type="button" onClick={handleAttach} title={t('dash.chat.attach_file')} aria-label={t('dash.chat.attach_file')}
            style={{ flexShrink: 0, alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', color: '#a6adc8', cursor: 'pointer' }}>
            <PhPaperclip size={17} weight="duotone" />
          </button>
          <button type="button" disabled={streaming || (!input.trim() && attachments.length === 0)} onClick={() => send(input)}
            style={{ flexShrink: 0, alignSelf: 'center', padding: '8px 16px', borderRadius: 8, border: 'none', background: streaming || (!input.trim() && attachments.length === 0) ? 'color-mix(in srgb, var(--accent) 25%, transparent)' : 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: streaming || (!input.trim() && attachments.length === 0) ? 'default' : 'pointer' }}>
            {streaming ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
