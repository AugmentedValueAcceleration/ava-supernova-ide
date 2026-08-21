import type { ReactNode } from 'react';
import { useEffect } from 'react';

/**
 * The right-hand drawer.
 *
 * Health & Nutrition established this: you click a thing in a list, it arrives
 * from the right, and the list stays behind it. A centred box hides the grid
 * you just picked from and reads as a different product one page across.
 *
 * Mirrors the extension's `dashboard-ui/src/components/Drawer.tsx` — the two
 * surfaces are meant to be the same product, so the shell is written the same
 * way in both. Inline styles here because that is this renderer's convention;
 * the geometry, timings and treatment are identical.
 */
export function Drawer({
  onClose,
  children,
  title,
  subtitle,
  /** Panel width cap. */
  maxWidth = 560,
  zIndex = 50,
  closeLabel = 'Close',
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: number;
  zIndex?: number;
  closeLabel?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex,
        display: 'flex', justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
        animation: 'ava-fade-in 160ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          display: 'flex', flexDirection: 'column',
          height: '100%', width: '100%', maxWidth,
          overflow: 'hidden',
          borderLeft: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          background: 'linear-gradient(to bottom, #100d1a, #150f22)',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.5)',
          animation: 'ava-slide-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {title !== undefined && (
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 12, padding: '12px 20px',
            borderBottom: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)',
          }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{
                margin: 0, fontSize: 14, fontWeight: 500, color: '#cdd6f4',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{title}</h2>
              {subtitle && (
                <p style={{
                  margin: '2px 0 0', fontSize: 11, color: '#6c7086',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              style={{
                flexShrink: 0, borderRadius: 8, padding: '4px 8px', fontSize: 11,
                background: 'transparent', color: '#a6adc8', cursor: 'pointer',
                border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
              }}
            >✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
