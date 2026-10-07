import { useEffect, useState, useTransition } from 'react';

/**
 * Switching a tab, with a spinner that can actually appear.
 *
 * Mirror of the extension's dashboard-ui/src/lib/useTabTransition.ts. Required
 * by the parity rule, and the reasoning is worth repeating rather than linking:
 *
 * ── The problem a plain spinner cannot solve ──
 *
 * Tab switches on the big pages fetch nothing. They are `setTab(key)` and
 * nothing else. The delay you feel is React re-rendering the new tab — and
 * during a render the main thread is blocked. So setting a "loading" flag in
 * the same tick does nothing visible: React renders straight through and the
 * browser never gets a frame to paint the spinner in. You see nothing, then the
 * new tab.
 *
 * That is why these tabs felt silent while a lazily-loaded PAGE shows its
 * spinner fine — a page fetches a chunk, and a fetch yields.
 *
 * ── Why useTransition fixes it ──
 *
 * It marks the tab change as non-urgent. React paints the urgent update first —
 * the pending state set below — and only then renders the new tab, so the
 * spinner has a frame to exist in.
 *
 * It also scales itself honestly: a fast switch finishes inside a frame and the
 * spinner never shows; a slow one shows it for exactly as long as the work
 * takes. No threshold to guess, and no flash on a switch that was instant.
 */
export function useTabTransition<T extends string>(
  /** Accepts a lazy initialiser, like useState, for tabs whose starting value
   *  comes from a one-shot deep link that must be read and cleared once. */
  initial: T | (() => T),
): {
  /** The tab actually being rendered. */
  current: T;
  /** The tab being switched TO while the switch is in flight, else null. */
  pending: T | null;
  /** For a tab the USER clicked — deferred, so the spinner paints first. */
  switchTo: (next: T) => void;
  /**
   * For a programmatic change — syncing from a prop, or jumping tabs as part of
   * another action. Immediate and without a spinner, because nobody clicked a
   * tab and there is nothing to acknowledge. Several pages here set their tab
   * from an effect on a pending-open flag, and deferring those would change
   * behaviour on paths that expect to land at once.
   */
  setNow: (next: T) => void;
} {
  const [current, setCurrent] = useState<T>(initial);
  const [target, setTarget] = useState<T | null>(null);
  const [isPending, startTransition] = useTransition();

  const switchTo = (next: T) => {
    if (next === current) return;
    // Urgent, deliberately — this is the update that gets painted before the
    // expensive one, and the whole point is that it lands first.
    setTarget(next);
    startTransition(() => setCurrent(next));
  };

  // Clear once settled, or the spinner stays on the tab you just arrived at and
  // reads as "still working" forever.
  useEffect(() => {
    if (!isPending) setTarget(null);
  }, [isPending]);

  return { current, pending: isPending ? target : null, switchTo, setNow: setCurrent };
}
