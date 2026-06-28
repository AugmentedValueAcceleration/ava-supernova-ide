// Dedicated file purely so the React JSX below compiles cleanly — the
// DashboardPages.tsx file appends this via a named export. Keeping the
// card shape here makes it easier to review alongside the extension
// PurchaseCard when they need to stay visually aligned.

import type { CSSProperties } from 'react';

interface IdePurchaseCardProps {
  title: string;
  subtitle: string;
  price: string;
  priceSuffix?: string;
  effectiveRate: string;
  popular?: boolean;
  state: 'live' | 'coming_soon' | 'active';
  ctaLabel: string;
  onClick?: () => void;
}

// Colour tokens match the IDE's Catppuccin-inspired palette used
// throughout DashboardPages (text, bg, accents).
const COLOR_TEXT_PRIMARY = '#cdd6f4';
const COLOR_TEXT_MUTED = '#6c7086';
const COLOR_TEXT_FAINT = '#45475a';
const COLOR_ACCENT = 'var(--accent)';
const COLOR_ACCENT_FADED = 'color-mix(in srgb, var(--accent) 35%, transparent)';
const COLOR_BORDER_DEFAULT = 'rgba(49, 34, 68, 0.5)';
const COLOR_CARD_BG = '#1a1028';
const COLOR_EMERALD = '#a6e3a1';

export function IdePurchaseCard({
  title, subtitle, price, priceSuffix, effectiveRate, popular, state, ctaLabel, onClick,
}: IdePurchaseCardProps) {
  const isInteractive = state !== 'coming_soon';
  const isActive = state === 'active';

  const cardStyle: CSSProperties = {
    background: COLOR_CARD_BG,
    border: `1px solid ${popular ? COLOR_ACCENT_FADED : isActive ? 'rgba(166,227,161,0.35)' : COLOR_BORDER_DEFAULT}`,
    borderRadius: 12,
    padding: '16px 14px',
    opacity: isInteractive ? 1 : 0.88,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  };

  const calloutStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  };

  const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 600, color: COLOR_TEXT_PRIMARY };
  const subtitleStyle: CSSProperties = { fontSize: 11, color: COLOR_TEXT_MUTED, marginTop: 2 };
  const priceStyle: CSSProperties = { fontSize: 22, fontWeight: 700, color: COLOR_TEXT_PRIMARY, marginTop: 12, fontVariantNumeric: 'tabular-nums' };
  const rateStyle: CSSProperties = { fontSize: 10, color: COLOR_TEXT_MUTED, marginTop: 2, fontVariantNumeric: 'tabular-nums' };

  const ctaStyle: CSSProperties = {
    // Pin to the card bottom so every CTA aligns across the row regardless of
    // how much content sits above it. One unified outlined-accent style for all
    // cards (popular is distinguished by its border + callout, not the button).
    marginTop: 'auto',
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: isInteractive ? 'pointer' : 'not-allowed',
    ...(isInteractive
      ? { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: COLOR_ACCENT, border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' }
      : { background: 'rgba(49,34,68,0.4)', color: COLOR_TEXT_FAINT, border: `1px solid ${COLOR_BORDER_DEFAULT}` }),
  };

  return (
    <div style={cardStyle}>
      {popular && (
        <div style={{ ...calloutStyle, color: COLOR_ACCENT }}>
          <span>⭐</span>
          <span>Best value</span>
        </div>
      )}
      {isActive && !popular && (
        <div style={{ ...calloutStyle, color: COLOR_EMERALD }}>
          <span>✓</span>
          <span>Active</span>
        </div>
      )}

      <div style={titleStyle}>{title}</div>
      <div style={subtitleStyle}>{subtitle}</div>

      <div style={priceStyle}>
        {price}
        {priceSuffix && <span style={{ fontSize: 12, fontWeight: 400, color: COLOR_TEXT_MUTED, marginLeft: 3 }}>{priceSuffix}</span>}
      </div>
      <div style={rateStyle}>{effectiveRate}</div>

      <button
        onClick={isInteractive ? onClick : undefined}
        disabled={!isInteractive}
        style={ctaStyle}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
