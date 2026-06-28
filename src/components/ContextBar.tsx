/**
 * ContextBar — horizontal context-usage indicator rendered above the chat.
 *
 * Mirrors the VSCode extension's v0.39.0 bar. Sits at the top of the chat
 * panel, thin progress track that escalates purple → amber → red as the
 * window fills, with a numeric caption once usage is meaningful.
 *
 * IDE variant is display-only — click-to-compress requires a new
 * `sidecar.compress()` method which is not yet wired. The hover tooltip
 * explains that auto-compress triggers at 70% so users aren't confused
 * by the non-interactive bar.
 */

import { useLocale } from '../lib/i18n';
import { Tooltip } from './Tooltip';

interface ContextBarProps {
  contextPercent: number;
  contextUsed?: number;
  contextLimit?: number;
  isCompressing?: boolean;
}

export function ContextBar({ contextPercent, contextUsed, contextLimit, isCompressing }: ContextBarProps) {
  useLocale();

  const hasLimit = typeof contextLimit === 'number' && contextLimit > 0;
  const hasUsed = typeof contextUsed === 'number' && contextUsed >= 0;
  const pct = Math.min(100, Math.max(0, contextPercent));

  // Allow a fractional bar even when percent rounds to 0
  const preciseFraction = hasLimit && hasUsed ? (contextUsed! / contextLimit!) : pct / 100;
  const visualPct = Math.max(pct, preciseFraction * 100);

  const isWarning = pct >= 80;
  const isCritical = pct >= 90;

  const fillColor = isCritical
    ? '#ef4444'
    : isWarning
      ? '#eab308'
      : 'var(--accent)';

  const usedDisplay = hasUsed ? formatTokens(contextUsed!) : null;
  const limitDisplay = hasLimit ? formatTokens(contextLimit!) : null;

  const tooltip = isCompressing
    ? 'Compressing context...'
    : usedDisplay && limitDisplay
      ? `Context: ${usedDisplay} / ${limitDisplay} (${pct}%) — auto-compresses at 70%`
      : `Context: ${pct}% — auto-compresses at 70%`;

  return (
    <Tooltip content={tooltip} placement="bottom">
    <div
      style={{
        width: '100%',
        borderBottom: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)',
        backgroundColor: 'transparent',
      }}
    >
      {/* Progress track — always visible muted channel, fill grows inside */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '4px',
          backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${Math.max(visualPct, 0.5)}%`,
            minWidth: hasUsed && contextUsed! > 0 ? '3px' : '0px',
            backgroundColor: fillColor,
            opacity: isCompressing ? 0.5 : 1,
            transition: 'width 0.5s ease-out, background-color 0.3s ease',
          }}
        />
      </div>

      {/* Numeric caption — appears once context is meaningfully full */}
      {pct >= 25 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 12px',
          }}
        >
          <span style={{ fontSize: 10, opacity: 0.5, letterSpacing: '0.02em' }}>Context</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              fontFamily: 'monospace',
              color: fillColor,
              opacity: isCompressing ? 0.5 : 0.85,
            }}
          >
            {isCompressing
              ? 'Compressing...'
              : usedDisplay && limitDisplay
                ? `${usedDisplay} / ${limitDisplay} · ${pct}%`
                : `${pct}%`}
          </span>
        </div>
      )}
    </div>
    </Tooltip>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
