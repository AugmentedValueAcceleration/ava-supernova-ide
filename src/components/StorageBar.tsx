import { useCallback, useEffect, useState } from 'react';
import { scanStorage, reclaimStorage, openStorageFolder, type StorageScan } from '../lib/storage-scan';

// ─── Storage bar + detail card ───────────────────────────────────────────────
//
// A slim, colour-coded bar of Ava's WHOLE local footprint (~/.ava), segmented by
// category — Models, Runtime, Creative, Memory, Journal, Datasets, Old backups,
// Other. HOVER drops a detailed breakdown card below the bar (read-only peek);
// CLICK pins that same card open — it stays until the ✕ or Esc, and gains the
// actions (Open folder, Reclaim old backups). No full-screen overlay. Shared by
// the Command Centre header and the Library.
//
// Mirrors the extension's dashboard-ui/src/components/StorageBar.tsx one-for-one
// (same colours, same fold rules, same two-tap reclaim). It differs only in
// where the data comes from: the extension asks its host over postMessage, we
// read the disk ourselves via lib/storage-scan (the sidecar isn't running on the
// Command Centre, which is the launch page).

const CAT_COLOR: Record<string, string> = {
  models: '#a78bfa', runtime: '#64748b', creative: '#6aa9ff', memory: '#34d399',
  journal: '#f0a24b', datasets: '#22d3ee', backups: '#f87171', other: '#9ca3af',
};
const colorOf = (key: string) => CAT_COLOR[key] ?? CAT_COLOR.other;

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/** The compact bar + its hover/pinned detail card. Renders nothing until the
 *  scan has landed (and nothing at all if ~/.ava is empty). */
export function StorageBar({ label = 'Storage' }: { label?: string }) {
  const [scan, setScan] = useState<StorageScan | null>(null);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    scanStorage()
      .then(setScan)
      .catch(() => { /* local-first: no bar on read failure */ });
  }, []);

  // Scan on mount, and again whenever something writes to the footprint
  // (Creative Studio saves, Library deletes) so the bar never goes stale.
  useEffect(() => {
    refresh();
    window.addEventListener('ava-storage-changed', refresh);
    return () => window.removeEventListener('ava-storage-changed', refresh);
  }, [refresh]);

  // Pinned card closes on Esc (and the ✕); a stray click never dismisses it.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPinned(false); setArmed(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned]);

  if (!scan || scan.totalBytes <= 0) return null;
  const { totalBytes, categories, reclaim } = scan;

  const reclaimPaths = reclaim.flatMap(r => r.paths);
  const reclaimBytes = reclaim.reduce((a, r) => a + r.bytes, 0);
  const close = () => { setPinned(false); setArmed(false); };
  const doReclaim = async () => {
    if (!reclaimPaths.length || busy) return;
    setBusy(true);
    try { await reclaimStorage(reclaimPaths); } catch { /* best-effort */ }
    setArmed(false);
    setBusy(false);
    refresh();
  };

  // Display list: fold Runtime into Models and Old backups into Other (both are
  // engine/plumbing, not something to surface as its own line), keeping totals
  // correct. The Reclaim button below still frees the backups. Then sort
  // biggest-first with the catch-all "Other" pinned last.
  const displayCats = (() => {
    const byKey = new Map(categories.map(c => [c.key, { ...c }]));
    const fold = (from: string, to: string) => {
      const f = byKey.get(from);
      if (!f) return;
      const t = byKey.get(to);
      if (t) t.bytes += f.bytes;              // roll bytes into the target (no gap)
      byKey.delete(from);                     // else drop the line (tiny gap on the bar)
    };
    fold('runtime', 'models');
    fold('backups', 'other');
    return [...byKey.values()].sort((a, b) =>
      a.key === 'other' ? 1 : b.key === 'other' ? -1 : b.bytes - a.bytes);
  })();

  const cardOpen = pinned || hovered;

  const pillBtn = (danger: boolean): React.CSSProperties => ({
    flexShrink: 0, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 500,
    cursor: 'pointer', transition: 'all 0.15s',
    background: danger ? 'rgba(239,68,68,0.15)' : 'transparent',
    border: `1px solid ${danger ? 'rgba(239,68,68,0.5)' : 'color-mix(in srgb, var(--accent) 18%, transparent)'}`,
    color: danger ? '#fca5a5' : '#a6adc8',
  });

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={() => { setArmed(false); setPinned(true); }}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
        }}
      >
        <div style={{
          marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 11, color: '#6c7086',
        }}>
          <span>{label}</span>
          <span style={{ color: '#a6adc8' }}>{formatBytes(totalBytes)}</span>
        </div>
        <div style={{
          display: 'flex', height: 8, width: '100%', overflow: 'hidden',
          borderRadius: 9999, background: 'rgba(255,255,255,0.05)',
        }}>
          {displayCats.map(c => (
            <div
              key={c.key}
              style={{
                width: `${Math.max(0.5, (c.bytes / totalBytes) * 100)}%`,
                background: colorOf(c.key),
                height: '100%',
                opacity: cardOpen ? 0.9 : 1,
                transition: 'opacity 0.15s',
              }}
            />
          ))}
        </div>
      </button>

      {cardOpen && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 8, width: 256,
          borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)',
          background: '#1a1028', padding: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          pointerEvents: pinned ? 'auto' : 'none',
        }}>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#a6adc8' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#6c7086' }}>{formatBytes(totalBytes)}</span>
              {pinned && (
                <button
                  onClick={close}
                  aria-label="Close"
                  style={{ background: 'transparent', border: 'none', color: '#6c7086', cursor: 'pointer', padding: 0, fontSize: 12 }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {displayCats.map(c => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{
                  display: 'inline-block', height: 8, width: 8, flexShrink: 0,
                  borderRadius: 9999, background: colorOf(c.key),
                }} />
                <span style={{ flex: 1, color: '#a6adc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                <span style={{ flexShrink: 0, color: '#6c7086' }}>{formatBytes(c.bytes)}</span>
              </div>
            ))}
          </div>

          {pinned ? (
            <div style={{
              marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8,
              borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', paddingTop: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => { openStorageFolder().catch(() => { /* nothing to do */ }); }}
                  title="Reveal the ~/.ava data folder"
                  style={{
                    flex: 1, borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                    color: 'var(--accent)', transition: 'all 0.15s',
                  }}
                >
                  Open folder
                </button>
                {reclaimBytes > 0 && (armed
                  ? <button onClick={doReclaim} disabled={busy} style={pillBtn(true)}>
                      {busy ? 'Freeing…' : `Free ${formatBytes(reclaimBytes)}`}
                    </button>
                  : <button onClick={() => setArmed(true)} style={pillBtn(false)}>Reclaim</button>)}
              </div>
              <p style={{ margin: 0, fontSize: 10, lineHeight: 1.5, color: '#6c7086' }}>
                Reclaim removes only stale backups. Models are Ava's local AI engine, managed in Desktop / Vision.
              </p>
            </div>
          ) : (
            <div style={{
              marginTop: 8, borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
              paddingTop: 8, fontSize: 10, color: '#6c7086',
            }}>
              Click to manage
            </div>
          )}
        </div>
      )}
    </div>
  );
}
