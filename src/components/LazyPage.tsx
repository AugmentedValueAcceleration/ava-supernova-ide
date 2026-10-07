import { Suspense, type ReactNode } from 'react';

/**
 * Suspense boundary for a dashboard page that is loaded on demand.
 *
 * Mirrors the extension's dashboard-ui/src/components/LazyPage.tsx, which the
 * parity rule requires, but the spinner is written in inline styles to match
 * this package — the IDE has no Tailwind, and DashboardPages.tsx already uses
 * exactly this 28px/3px shape for its own loading states, so a split page and a
 * loading page look like the same thing.
 *
 * ── Why a plain spinner is enough here ──
 *
 * A lazy page actually fetches a chunk, and a fetch yields, so Suspense gets a
 * frame to paint the fallback in. That is different from a TAB switch, where
 * nothing is fetched and the delay is a render blocking the main thread — a
 * flag set in the same tick never paints, and that case needs useTransition.
 * Two different waits, two different fixes; the extension learned this the hard
 * way and the note is repeated here so the IDE does not learn it again.
 */
export function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div
            role="status"
            aria-label="Loading"
            style={{
              width: 28,
              height: 28,
              border: '3px solid color-mix(in srgb, var(--accent) 12%, transparent)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
