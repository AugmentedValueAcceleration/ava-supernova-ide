// Cloud-sync state for the IDE. Data is ALWAYS saved locally — the
// floor, not a setting. This module only governs whether a copy is
// also written to the cloud. Mirror of the extension's binary model.
//
// Replaces the old three-value local/cloud/both "Data Mode". In the
// IDE that toggle was doubly overloaded — it also picked the chat
// backend (local sidecar vs platform). Those concerns are now
// separate: chat-backend routing lives in Settings, this is purely
// the data-backup axis.

const KEY = 'ava-cloud-sync';

/** Ava is LOCAL-FIRST: nothing syncs to the cloud (storage sunsets 1 Jul
 *  2026). This is now hard-OFF — every `if (cloudSyncEnabled())` cloud-write
 *  branch is a no-op. The chat-header toggle + Sync tab that flipped it are
 *  removed. Kept as a function so the dozens of call sites don't churn. */
export function cloudSyncEnabled(): boolean {
  return false;
}

/** Persist the cloud-sync choice and broadcast it so other surfaces
 *  (Sync page, Library, creative gallery) re-render without polling. */
export function setCloudSync(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, String(enabled));
  } catch { /* storage unavailable */ }
  try {
    window.dispatchEvent(new CustomEvent('ava-cloud-sync-changed', { detail: { enabled } }));
  } catch { /* SSR / no window — ignore */ }
}

/** Value for the outgoing `X-Ava-Data-Mode` request header. The
 *  platform still speaks the legacy vocabulary (its `isLocalOnlyRequest`
 *  check looks for `local`), so map the boolean onto terms it already
 *  understands — no platform change needed. */
export function dataModeHeader(): 'local' | 'both' {
  return cloudSyncEnabled() ? 'both' : 'local';
}
