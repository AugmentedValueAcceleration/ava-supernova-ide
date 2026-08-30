// ── Dashboard status strip ──────────────────────────────────────────────────
//
// The IDE's counterpart to the extension's DashboardTopBar: a 40px strip under
// the window chrome carrying the hub announcement on the left and machine
// status on the right.
//
// It exists because the two surfaces had no equivalent object. The extension
// has a real app status bar (ticker + tier + credits); the IDE had only the OS
// title bar, so anything "in the header" landed either in window chrome beside
// the minimise button or in a per-page hero — repeated on every page that
// wanted it. Three copies of the storage bar in the IDE and four in the
// extension is how the two drifted out of step in the first place: a thing
// placed in N places disagrees with itself eventually.
//
// One strip, one storage bar, visible on every page.
//
// The announcement moved here from the title bar. A hub message is app news,
// not window chrome — and putting it here is what makes the two surfaces the
// same shape, since the extension has always shown it in exactly this spot.
// The title bar keeps the folder name, which genuinely is title-bar content.

import { AnnouncementTicker } from './AnnouncementTicker';
import { StorageBar } from './StorageBar';
import { t } from '../lib/i18n';

export function DashboardTopBar() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 40,
        padding: '0 16px',
        flexShrink: 0,
        borderBottom: '1px solid color-mix(in srgb, var(--accent) 10%, transparent)',
        background: 'linear-gradient(90deg, #0f0f17, #1a1625)',
      }}
    >
      {/* Left — hub announcement. Truncates rather than pushing the status
          off the end; there is always a bar, there is not always news. */}
      <div style={{ minWidth: 0, flex: 1, fontSize: 12, color: '#a6adc8' }}>
        <AnnouncementTicker />
      </div>

      {/* Right — what this install costs on this disk. Compact density: bar
          plus total on one line. Click opens the same breakdown card the
          full-size bar does. */}
      <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 12 }}>
        <StorageBar label={t('dash.cc.storage')} compact />
      </div>
    </div>
  );
}
