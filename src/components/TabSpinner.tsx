/**
 * The small spinner beside a tab label while that tab renders.
 *
 * Paired with useTabTransition — see that hook for why a spinner here needs a
 * transition to be visible at all.
 *
 * After the label rather than replacing it: the label is how you know which tab
 * you clicked, and swapping it for a spinner takes that away at exactly the
 * moment you want it confirmed.
 *
 * Inline styles and a local keyframe, matching this package — the IDE has no
 * Tailwind, and `spin` is already the name DashboardPages uses for this.
 */
export function TabSpinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block', width: 10, height: 10, marginLeft: 6,
        borderRadius: '50%', verticalAlign: 'middle',
        border: '1.5px solid color-mix(in srgb, var(--accent) 25%, transparent)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.8s linear infinite',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
