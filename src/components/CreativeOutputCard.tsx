import { useState } from 'react';
import { getLocale } from '../lib/i18n';
import {
  type GalleryItem, type MediumKind,
  downloadGalleryItem, copyGalleryPrompt,
} from '../lib/creative-gallery';

/**
 * Creative Studio output card — shared chrome around per-medium playback.
 *
 * One card shape for every generation across every medium:
 *   - Image  → <img> at the top
 *   - Music  → <audio> with the system controls
 *   - Voice  → same
 *   - SFX    → same
 *   - Video  → <video> with controls
 *
 * Below the playback element: prompt text (truncated, hover for full),
 * timestamp, and a row of action pills (Copy, Download, Regenerate,
 * Delete). Active state is purely visual — actions are wired by the
 * parent page so it can re-run the generation with the original prompt
 * (Regenerate) and persist a fresh entry alongside.
 *
 * Designed for a horizontally-scrolling gallery — the card has a fixed
 * width and aspect-aware playback so a row of cards reads as a creative
 * timeline rather than a stack of forms.
 */

const CARD_WIDTH = 280;

const cardStyle: React.CSSProperties = {
  flex: `0 0 ${CARD_WIDTH}px`,
  background: 'rgba(26, 16, 40, 0.6)',
  border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
  borderRadius: 12,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const pillBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
  background: 'rgba(49, 34, 68, 0.5)',
  color: '#cdd6f4',
  fontFamily: 'inherit',
  transition: 'background 0.15s, border-color 0.15s',
};

const dangerPillStyle: React.CSSProperties = {
  ...pillBase,
  border: '1px solid rgba(243, 139, 168, 0.2)',
  color: '#f38ba8',
};

interface OutputCardProps {
  item: GalleryItem;
  onRegenerate?: (item: GalleryItem) => void;
  onDelete?: (item: GalleryItem) => Promise<void> | void;
}

export function CreativeOutputCard({ item, onRegenerate, onDelete }: OutputCardProps) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopy = async () => {
    const ok = await copyGalleryPrompt(item);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const handleDownload = () => {
    void downloadGalleryItem(item);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await onDelete(item);
  };

  const date = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = date ? date.toLocaleString(getLocale(), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '';

  return (
    <div style={cardStyle}>
      <MediumPreview item={item} />

      <div
        style={{
          fontSize: 11, color: '#a6adc8', lineHeight: 1.5,
          maxHeight: 60, overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
        title={item.prompt}
      >
        {item.prompt || '(no prompt)'}
      </div>

      <div style={{ fontSize: 10, color: '#585b70', display: 'flex', justifyContent: 'space-between' }}>
        <span>{dateLabel}</span>
        <span style={{
          fontSize: 9,
          padding: '1px 6px',
          borderRadius: 4,
          background: 'rgba(166,227,161,0.15)',
          color: '#a6e3a1',
        }}>
          local
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
        <button
          onClick={handleCopy}
          style={pillBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
        >
          {copied ? '✓ Copied' : 'Copy prompt'}
        </button>
        <button
          onClick={handleDownload}
          style={pillBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
        >
          Download
        </button>
        {onRegenerate && (
          <button
            onClick={() => onRegenerate(item)}
            style={pillBase}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 15%, transparent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          >
            Regenerate
          </button>
        )}
        {onDelete && (
          <button
            onClick={handleDelete}
            style={dangerPillStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(243,139,168,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(49, 34, 68, 0.5)'; }}
          >
            {confirmDelete ? 'Click again to confirm' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Per-medium playback element. Image / video sit naturally; audio gets a
 *  compact native-controls bar that fits the card width. The aspect-ratio
 *  hint keeps image/video cards a consistent height in the gallery row. */
function MediumPreview({ item }: { item: GalleryItem }) {
  const kind: MediumKind = item.kind;

  if (kind === 'image') {
    return (
      <img
        src={item.url}
        alt={item.title || 'Generated image'}
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          objectFit: 'cover',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.3)',
          display: 'block',
        }}
        loading="lazy"
      />
    );
  }

  if (kind === 'video') {
    return (
      <video
        src={item.url}
        controls
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          objectFit: 'cover',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.5)',
          display: 'block',
        }}
        preload="metadata"
      />
    );
  }

  // audio / voice / sfx
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '4 / 1',
        borderRadius: 8,
        background: kind === 'voice'
          ? 'linear-gradient(135deg, #f9e2af20, #f9e2af40)'
          : kind === 'sfx'
            ? 'linear-gradient(135deg, #f38ba820, #f38ba840)'
            : 'linear-gradient(135deg, #89b4fa20, #89b4fa40)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{
        fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: 1, color: kind === 'voice' ? '#f9e2af' : kind === 'sfx' ? '#f38ba8' : '#89b4fa',
      }}>
        {kind}
      </div>
      <audio
        src={item.url}
        controls
        style={{ width: '100%', height: 32 }}
        preload="metadata"
      />
    </div>
  );
}

// ── Gallery strip — horizontally-scrolling row of OutputCards ────────────

interface GalleryStripProps {
  items: GalleryItem[];
  onRegenerate?: (item: GalleryItem) => void;
  onDelete?: (item: GalleryItem) => Promise<void> | void;
  emptyHint?: string;
}

/** Horizontally scrolling gallery row. Newest first on the left so the
 *  most recent generation is in the operator's eye-line; older work
 *  scrolls right. Empty state is a hint card matching the rest of the
 *  page chrome. */
export function CreativeGalleryStrip({ items, onRegenerate, onDelete, emptyHint }: GalleryStripProps) {
  if (items.length === 0) {
    return (
      <div style={{
        background: 'rgba(26, 16, 40, 0.6)',
        border: '1px dashed color-mix(in srgb, var(--accent) 20%, transparent)',
        borderRadius: 12,
        padding: '40px 20px',
        textAlign: 'center',
        color: '#585b70',
        fontSize: 13,
      }}>
        {emptyHint || 'Your generations will appear here. Make something — they stack up newest first.'}
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 8,
        scrollSnapType: 'x proximity',
      }}
    >
      {items.map((item) => (
        <div key={item.id} style={{ scrollSnapAlign: 'start' }}>
          <CreativeOutputCard item={item} onRegenerate={onRegenerate} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}
