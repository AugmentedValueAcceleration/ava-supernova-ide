import { useCallback, useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { homeDir } from '@tauri-apps/api/path';
import { measuredAgo, isUsageStale, type ProjectsUsage } from '@ava/core/projects/storage';
import { projectsHomeFrom } from '@ava/core/projects/home';
import { readProjectsHomeSetting } from '../lib/shared-config';
import { scanStorage, reclaimStorage, measureProjects, readProjectsUsage, openStorageFolder, type StorageScan } from '../lib/storage-scan';

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
/** Your code, kept visually apart from Ava's own footprint. */
const PROJECTS_COLOR = '#facc15';

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

/** The compact bar + its hover/pinned detail card. Renders nothing until the
 *  scan has landed (and nothing at all if ~/.ava is empty). */
export function StorageBar({ label = 'Storage', compact = false }: {
  label?: string;
  /** One-line density for the dashboard status strip: bar + total, no label. */
  compact?: boolean;
}) {
  const [scan, setScan] = useState<StorageScan | null>(null);
  // What the user's projects folder costs. Read from cache — never measured on
  // render, because a source tree can run to tens of gigabytes and walking it
  // would stall the page every time.
  const [projects, setProjects] = useState<ProjectsUsage | null>(null);
  const [measuring, setMeasuring] = useState(false);
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

  // The cached projects figure, if one exists. Reading a small JSON file is
  // cheap; measuring the folder it describes is not, and only happens when
  // asked for.
  useEffect(() => { readProjectsUsage().then(setProjects).catch(() => setProjects(null)); }, []);

  const doMeasure = useCallback(async () => {
    setMeasuring(true);
    try {
      const home = await homeDir();
      // The same ~/.ava/config.json the sidecar reads, so the folder measured
      // here is the folder Ava scaffolds into.
      const configured = await readProjectsHomeSetting();
      setProjects(await measureProjects(projectsHomeFrom(home, configured)));
    } catch { /* leave the previous figure showing rather than blanking it */ }
    finally { setMeasuring(false); }
  }, []);

  // Pinned card closes on Esc (and the ✕); a stray click never dismisses it.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPinned(false); setArmed(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned]);

  // Still scanning: hold the space with a skeleton rather than popping the
  // whole row in when the numbers land. A null scan means "still looking";
  // zero bytes means "looked, and there is nothing" — which stays invisible,
  // because a permanently empty bar is noise, not information.
  if (!scan) {
    if (compact) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-busy="true">
          <span style={{
            width: 180, height: 6, borderRadius: 9999,
            background: 'rgba(108, 112, 134, 0.18)', animation: 'avaPulse 1.5s infinite',
          }} />
          <span style={{
            width: 38, height: 9, borderRadius: 3,
            background: 'rgba(108, 112, 134, 0.25)', animation: 'avaPulse 1.5s infinite',
          }} />
        </span>
      );
    }
    return (
      <div style={{ width: '100%' }} aria-busy="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#6c7086' }}>{label}</span>
          <span style={{
            width: 44, height: 10, borderRadius: 3,
            background: 'rgba(108, 112, 134, 0.25)', animation: 'avaPulse 1.5s infinite',
          }} />
        </div>
        <div style={{
          height: 8, borderRadius: 4, width: '100%',
          background: 'rgba(108, 112, 134, 0.18)', animation: 'avaPulse 1.5s infinite',
        }} />
      </div>
    );
  }
  if (scan.totalBytes <= 0) return null;
  const { totalBytes, categories, reclaim } = scan;

  // Two families, one total. Ava's footprint is what she put on the disk; the
  // projects figure is the user's own work, shown because "how much is this
  // costing me" cannot be answered by half of it.
  const projectBytes = projects?.bytes ?? 0;
  const grandTotal = Math.max(1, totalBytes + projectBytes);
  const projectsAge = measuredAgo(projects);
  const projectsStale = isUsageStale(projects);

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
        {/* Full density keeps the label above the bar; compact drops it and
            puts the total inline, because a 40px strip has no room for a
            second row and "Storage" beside a byte count says nothing. */}
        {!compact && (
          <div style={{
            marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 11, color: '#6c7086',
          }}>
            <span>{label}</span>
            <span style={{ color: '#a6adc8' }}>{formatBytes(grandTotal)}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          display: 'flex', height: compact ? 6 : 8, width: compact ? 180 : '100%', overflow: 'hidden',
          borderRadius: 9999, background: 'rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          {displayCats.map(c => (
            <div
              key={c.key}
              style={{
                width: `${Math.max(0.5, (c.bytes / grandTotal) * 100)}%`,
                background: colorOf(c.key),
                height: '100%',
                opacity: cardOpen ? 0.9 : 1,
                transition: 'opacity 0.15s',
              }}
            />
          ))}
          {/* Your projects — one segment, its own colour, last. The total
              answers "what is this costing me on my machine", which is only
              honest if the user's own work is in it. */}
          {projectBytes > 0 && (
            <div
              style={{
                width: `${Math.max(0.5, (projectBytes / grandTotal) * 100)}%`,
                background: PROJECTS_COLOR,
                height: '100%',
                opacity: cardOpen ? 0.9 : 1,
                transition: 'opacity 0.15s',
              }}
            />
          )}
        </div>
        {compact && (
          <span style={{ fontSize: 11, color: '#a6adc8', whiteSpace: 'nowrap' }}>{formatBytes(grandTotal)}</span>
        )}
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
              <span style={{ fontSize: 11, color: '#6c7086' }}>{formatBytes(grandTotal)}</span>
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

            {/* Below Ava's own rows and visually separate — the one line that
                is not her footprint. Never carries a Reclaim action: this is
                the user's work. */}
            <div style={{
              marginTop: 6, paddingTop: 6,
              borderTop: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{
                  display: 'inline-block', height: 8, width: 8, flexShrink: 0,
                  borderRadius: 9999, background: PROJECTS_COLOR,
                }} />
                <span style={{ flex: 1, color: '#a6adc8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('storage.your_projects')}
                </span>
                <span style={{ flexShrink: 0, color: '#6c7086' }}>
                  {projects ? formatBytes(projectBytes) : '\u2014'}
                </span>
              </div>
              <div style={{ marginTop: 2, paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#6c7086' }}>
                {/* A cached figure that does not say how old it is reads as live. */}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {measuring
                    ? t('storage.measuring')
                    : projects
                      ? `${projects.projectCount ?? 0} ${t('storage.folders')} \u00b7 ${projectsAge}`
                      : t('storage.not_measured')}
                </span>
                {pinned && (
                  <button
                    onClick={() => void doMeasure()}
                    disabled={measuring}
                    style={{
                      flexShrink: 0, borderRadius: 6, padding: '2px 6px', fontSize: 10,
                      background: 'transparent', color: '#a6adc8',
                      border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
                      cursor: measuring ? 'default' : 'pointer', opacity: measuring ? 0.6 : 1,
                    }}
                  >
                    {projects && !projectsStale ? t('storage.remeasure') : t('storage.measure')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {pinned ? (
            <div style={{
              marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8,
              borderTop: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', paddingTop: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => { openStorageFolder().catch(() => { /* nothing to do */ }); }}
                  title={t('ide.storage.reveal')}
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
                      {busy ? t('ide.storage.freeing') : t('ide.storage.free_n', { size: formatBytes(reclaimBytes) })}
                    </button>
                  : <button onClick={() => setArmed(true)} style={pillBtn(false)}>{t('ide.storage.reclaim')}</button>)}
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
