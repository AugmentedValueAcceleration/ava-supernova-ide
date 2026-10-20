/**
 * Factory reset — the IDE's dialog. Mirrors the extension's exactly in what it
 * refuses to let you do by accident; only the styling differs (inline here,
 * Tailwind there) and the engine is shared from core.
 *
 * Its job is not to enable a reset. It is to stop the wrong one:
 *
 *  • Sizes next to every row, because "Projects (19.0 GB)" stops a hand that
 *    "Projects" does not.
 *  • Your source code unticked, last, in red, behind a typed confirmation. It
 *    is the only thing here that cannot be re-earned.
 *  • An explicit warning that a backup does NOT include your projects, because
 *    someone who backs up, ticks Projects and loses their code believing it
 *    was saved is the worst outcome this feature can produce.
 */
import { useEffect, useMemo, useState } from 'react';
import { getSidecar } from '../lib/sidecar';

type Severity = 'ordinary' | 'permanent' | 'irreversible';
interface CatMeta { id: string; severity: Severity; defaultSelected: boolean }
interface CatSize { id: string; bytes: number; approximate: boolean; empty: boolean }

const CONFIRM_WORD = 'DELETE';

function formatBytes(n: number): string {
  if (n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

const LABEL: Record<string, string> = {
  logs: 'Logs and diagnostics',
  caches: 'Downloaded models and binaries',
  memory: 'Everything Ava knows about you',
  conversations: 'Conversations, journal, tasks and health',
  profile: 'Your profile and Ava’s personality',
  datasets: 'Captured training data',
  project_data: 'What Ava knows about your projects',
  credentials: 'API keys and sign-in',
  settings: 'Settings, onboarding and consent',
  projects: 'Your projects folder — YOUR SOURCE CODE',
};

const DESC: Record<string, string> = {
  logs: 'Audit log and debug output. Nothing you would miss.',
  caches: 'Re-downloaded automatically when next needed.',
  memory: 'Memories, procedures and everything learned about how you work.',
  conversations: 'Every chat transcript, journal entry, task and health record.',
  profile: 'Your details, Ava’s personality and her avatar.',
  datasets: 'The only copy. Generated from your usage.',
  project_data: 'The project registry and notes — not the projects themselves.',
  credentials: 'Every provider key and your platform sign-in.',
  settings: 'Clears these and Ava starts from onboarding, like a fresh install.',
  projects: 'The actual code you have written. This cannot be undone and is NOT in a backup.',
};

export function FactoryResetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cats, setCats] = useState<CatMeta[]>([]);
  const [sizes, setSizes] = useState<Record<string, CatSize>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<null | {
    ok: boolean; removed?: number; bytesFreed?: number;
    failed?: { path: string; reason: string }[]; clearedStateKeys?: string[]; error?: string;
  }>(null);

  useEffect(() => {
    if (!open) return;
    setScanning(true); setReport(null); setConfirmText('');
    void getSidecar().factoryResetScan().then((r) => {
      setCats(r.categories ?? []);
      setSizes(Object.fromEntries((r.sizes ?? []).map((s) => [s.id, s])));
      setSelected(Object.fromEntries((r.categories ?? []).map((c) => [c.id, c.defaultSelected])));
      setScanning(false);
    });
  }, [open]);

  const chosen = useMemo(() => cats.filter((c) => selected[c.id]), [cats, selected]);
  const needsTyping = chosen.some((c) => c.severity === 'irreversible');
  const totalBytes = chosen.reduce((a, c) => a + (sizes[c.id]?.bytes ?? 0), 0);
  const anyApprox = chosen.some((c) => sizes[c.id]?.approximate);
  const canGo = chosen.length > 0 && !busy
    && (!needsTyping || confirmText.trim().toUpperCase() === CONFIRM_WORD);

  if (!open) return null;

  async function run() {
    setBusy(true);
    const r = await getSidecar().factoryResetExecute(chosen.map((c) => c.id));
    // The sidecar cannot reach localStorage, so it hands the keys back and the
    // webview finishes the job. Without this the app reopens still onboarded.
    for (const k of r.clearedStateKeys ?? []) {
      try { localStorage.removeItem(k); } catch { /* private mode, nothing to do */ }
    }
    if (chosen.some((c) => c.id === 'settings')) {
      try { localStorage.clear(); } catch { /* ignore */ }
    }
    setReport(r); setBusy(false);
    if (r.ok && chosen.some((c) => c.id === 'settings')) {
      setTimeout(() => { window.location.reload(); }, 2500);
    }
  }

  const S = {
    backdrop: {
      position: 'fixed' as const, inset: 0, zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', padding: 16,
    },
    panel: {
      width: '100%', maxWidth: 680, maxHeight: '88vh', overflowY: 'auto' as const,
      borderRadius: 16, border: '1px solid rgba(243,139,168,0.4)', background: '#1e1e2e',
      padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    row: (danger: boolean) => ({
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 8,
      border: `1px solid ${danger ? 'rgba(243,139,168,0.4)' : '#313244'}`,
      background: danger ? 'rgba(243,139,168,0.06)' : 'transparent',
      cursor: 'pointer', marginBottom: 4,
    }),
    btn: {
      borderRadius: 8, border: '1px solid #313244', padding: '8px 16px',
      fontSize: 12, fontWeight: 600, background: 'transparent', color: '#cdd6f4', cursor: 'pointer',
    },
    danger: (enabled: boolean) => ({
      borderRadius: 8, border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 600,
      background: '#f38ba8', color: '#11111b',
      opacity: enabled ? 1 : 0.4, cursor: enabled ? 'pointer' : 'not-allowed',
    }),
    input: {
      width: '100%', borderRadius: 8, border: '1px solid rgba(243,139,168,0.4)',
      background: '#11111b', color: '#cdd6f4', padding: '8px 12px', fontSize: 12, marginTop: 8,
    },
  };

  return (
    <div style={S.backdrop}>
      <div style={S.panel}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f38ba8', margin: 0 }}>
          Factory reset
        </h2>
        <p style={{ fontSize: 12, color: '#a6adc8', marginTop: 4 }}>
          Choose what to erase. Anything you leave unticked is kept exactly as it is.
        </p>

        {report ? (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: report.ok ? '#a6e3a1' : '#f9e2af' }}>
              {report.ok ? 'Done.' : 'Finished, but some items could not be removed.'}
            </p>
            <p style={{ fontSize: 12, color: '#a6adc8', marginTop: 4 }}>
              {report.removed ?? 0} items removed
              {report.bytesFreed ? ` · ${formatBytes(report.bytesFreed)} freed` : ''}
            </p>
            {/* Named, not counted. "3 failed" leaves someone guessing which three. */}
            {!!report.failed?.length && (
              <ul style={{ marginTop: 12, maxHeight: 160, overflowY: 'auto', padding: 12,
                borderRadius: 8, border: '1px solid rgba(249,226,175,0.3)', listStyle: 'none' }}>
                {report.failed.map((f, i) => (
                  <li key={i} style={{ fontSize: 11, color: '#f9e2af', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'monospace' }}>{f.path}</span> — {f.reason}
                  </li>
                ))}
              </ul>
            )}
            {report.error && <p style={{ fontSize: 12, color: '#f38ba8', marginTop: 8 }}>{report.error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button style={S.btn} onClick={onClose}>Close</button>
            </div>
          </div>
        ) : scanning ? (
          <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#a6adc8' }}>
            Measuring what is on disk…
          </p>
        ) : (
          <>
            {/* The single most important sentence in this dialog. */}
            <div style={{ marginTop: 16, padding: 12, borderRadius: 8,
              border: '1px solid rgba(249,226,175,0.35)', background: 'rgba(249,226,175,0.05)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#f9e2af', margin: 0 }}>
                A backup does NOT include your projects folder — your source code.
                Copy that yourself if you intend to delete it.
              </p>
            </div>

            <div style={{ marginTop: 16 }}>
              {cats.map((c) => {
                const sz = sizes[c.id];
                const danger = c.severity === 'irreversible';
                return (
                  <label key={c.id} style={S.row(danger)}>
                    <input
                      type="checkbox"
                      checked={!!selected[c.id]}
                      onChange={(e) => setSelected((s) => ({ ...s, [c.id]: e.target.checked }))}
                      style={{ marginTop: 2, width: 16, height: 16, accentColor: '#f38ba8' }}
                    />
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 500,
                        color: danger ? '#f38ba8' : '#cdd6f4' }}>
                        {LABEL[c.id] ?? c.id}
                        {sz && !sz.empty && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: '#a6adc8' }}>
                            {sz.approximate ? '≥ ' : ''}{formatBytes(sz.bytes)}
                          </span>
                        )}
                      </span>
                      <span style={{ display: 'block', fontSize: 11, color: '#a6adc8' }}>
                        {DESC[c.id] ?? ''}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginTop: 12, fontSize: 11 }}>
              <button
                onClick={() => setSelected(Object.fromEntries(cats.map((c) => [c.id, true])))}
                style={{ ...S.btn, border: 'none', padding: 0, textDecoration: 'underline', color: '#a6adc8' }}
              >
                Select everything (full wipe)
              </button>
              <span style={{ color: '#a6adc8' }}>
                Frees {anyApprox ? '≥ ' : ''}{formatBytes(totalBytes)}
              </span>
            </div>

            {needsTyping && (
              <div style={{ marginTop: 16, padding: 16, borderRadius: 12,
                border: '1px solid rgba(243,139,168,0.5)', background: 'rgba(243,139,168,0.06)' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#f38ba8', margin: 0 }}>
                  You have selected your projects folder. This is your own source code and it
                  cannot be undone or restored from a backup.
                </p>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  style={S.input}
                />
                <p style={{ fontSize: 10, color: 'rgba(243,139,168,0.7)', marginTop: 4 }}>
                  Type DELETE to confirm.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button style={S.btn} onClick={onClose}>Cancel</button>
              <button style={S.danger(canGo)} disabled={!canGo} onClick={() => void run()}>
                {busy ? 'Erasing…' : 'Erase selected'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
