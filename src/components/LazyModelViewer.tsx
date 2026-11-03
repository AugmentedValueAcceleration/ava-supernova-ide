import { Component, lazy, Suspense, type CSSProperties, type ReactNode } from 'react';

// three.js is ~650 KB: a chunk of its own, fetched only when a model is on
// screen, behind a boundary so a failed fetch shows the preview instead of
// taking the page down (the extension learned that one the hard way).
const LazyViewer = lazy(() => import('./ModelViewer'));

class FallbackOnError extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[ava] 3D viewer failed to load, showing the preview instead:', error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function LazyModelViewer(props: { src: string; poster?: string; alt: string; fill?: boolean }) {
  const box: CSSProperties = props.fill ? { flex: 1, minHeight: 260 } : { height: '50vh', minHeight: 260 };
  const still = props.poster
    ? <img src={props.poster} alt={props.alt} style={{ width: '100%', objectFit: 'contain', background: 'rgba(0,0,0,0.2)', padding: 16, boxSizing: 'border-box', ...box }} />
    : <div style={{ background: 'rgba(0,0,0,0.2)', ...box }} />;
  return (
    <FallbackOnError key={props.src} fallback={still}>
      <Suspense fallback={still}>
        <LazyViewer {...props} />
      </Suspense>
    </FallbackOnError>
  );
}
