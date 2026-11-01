// ── App-level sidecar boot ───────────────────────────────────────────────────
// The sidecar is a singleton shared by EVERY dashboard page (main chat, Creative/
// Design Studio, health, learning…). It used to be booted only by AvaChatPage, so
// landing on — or reloading into — the Design Studio left it with no live sidecar
// and the design chat failed with "Sidecar not running". This module boots it from
// App level so it's available regardless of which page is mounted, and never tears
// it down on navigation. Config is read from localStorage (the same keys the main
// chat writes), so there's a single source of truth and no drift.

import { getSidecar, type SidecarConfig } from './sidecar';
import { getProviderKeys, PROVIDER_FIELDS, type ProviderField } from './provider-keys';
import { ensureDataHome } from './data-root';
import { resolveSidecarModel } from './chat-models';

// This file used to keep its own byte-for-byte copy of chat-models.ts's
// SIDECAR_MODEL_MAP plus a duplicated `auto|supernova|aurora` fallback. Two
// copies meant adding a fleet in one place left the other resolving it to
// `platform:<fleet>` — a nonexistent id. Now imported from the one source.

function ls(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readByokProviders(): Record<string, { apiKey: string }> {
  // Store field (Qwen, Moonshot, Zhipu…) → core provider id, from the one map
  // in provider-keys.ts. Brave rides along: core's web search asks for it.
  const providers: Record<string, { apiKey: string }> = {};
  for (const [field, key] of Object.entries(getProviderKeys())) {
    const id = PROVIDER_FIELDS[field as ProviderField];
    if (id && key?.trim()) providers[id] = { apiKey: key.trim() };
  }
  return providers;
}

/** True when there is something to chat through: a provider key (Brave is
 *  search, not chat) or a local model. */
export function hasChatCapability(): boolean {
  const chat = Object.keys(readByokProviders()).filter((id) => id !== 'brave');
  if (chat.length > 0) return true;
  return !!(ls('ava-ide-local-baseurl') && (ls('ava-ide-local-model') || (ls('ava-ide-local-models') || '[]') !== '[]'));
}

/** Build the sidecar init config from localStorage — mirrors AvaChatPage.startSidecar. */
export function buildSidecarConfig(): SidecarConfig {
  const providers = readByokProviders();
  // The dashboard chat's pick (the rooms share it); the terminal panel's own
  // pick is the fallback. This read only the terminal's, so a cold boot ran
  // whatever the terminal last chose, not what the chat showed.
  const model = ls('ava-ide-chat-model') || ls('ava-ide-active-model') || 'auto';
  const mode = ls('ava-ide-chat-mode') || 'work';
  const workStart = Number(ls('ava-ide-work-start')) || 9;
  const workEnd = Number(ls('ava-ide-work-end')) || 17;

  const localBaseUrl = ls('ava-ide-local-baseurl') || '';
  const localModelName = ls('ava-ide-local-model') || '';
  const localApiKey = ls('ava-ide-local-apikey') || '';
  const localModelLabel = ls('ava-ide-local-label') || '';
  let localModels: string[] = [];
  try { const v = JSON.parse(ls('ava-ide-local-models') || '[]'); if (Array.isArray(v)) localModels = v; } catch { /* ignore */ }
  const localBlock = (localBaseUrl && (localModels.length > 0 || localModelName))
    ? { baseUrl: localBaseUrl, modelName: localModelName, apiKey: localApiKey || undefined, modelLabel: localModelLabel || undefined, models: localModels.length ? localModels : undefined }
    : undefined;

  return {
    providers,
    activeModel: resolveSidecarModel(model),
    cwd: ls('ava-ide-project-folder') || '.',
    mode,
    // The chosen UI language — the sidecar setLocale()s this so Ava replies in it
    // (she speaks 19 beyond English). Without it the agent defaulted to 'auto' and
    // ignored the operator's pick. Same store the language dropdown writes.
    language: ls('ava-ide-language') || 'auto',
    permissionMode: (ls('ava-ide-settings') ? JSON.parse(ls('ava-ide-settings')!).permissionMode : 'balanced') || 'balanced',
    autoMemory: true,
    workingHours: { start: workStart, end: workEnd },
    userName: ls('ava-ide-user-name') || undefined,
    local: localBlock,
    useLocalEmbeddings: ls('ava-ide-embeddings-enabled') === '1',
    embeddingModel: ls('ava-ide-embeddings-model') || undefined,
    embeddingBaseUrl: ls('ava-ide-embeddings-baseurl') || undefined,
  } as SidecarConfig;
}

let booting = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * A key was added or removed: a running sidecar registered its providers at
 * start, so it must restart for the change to count (the extension re-inits
 * its session the same way). Debounced — a factory reset clears every key in
 * one go. A sidecar that is not running is simply started, if it now can be.
 */
export function restartSidecarForKeys(): void {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    const sc = getSidecar();
    if (!sc.isReady || booting) { void ensureSidecarRunning(); return; }
    booting = true;
    void sc.stop()
      .catch(() => { /* already gone */ })
      .then(async () => {
        if (hasChatCapability()) await sc.start(buildSidecarConfig());
      })
      .catch(() => { /* surfaced via the sidecar event stream */ })
      .finally(() => { booting = false; });
  }, 600);
}

/** Ensure a live sidecar exists. No-op if one is already running/booting or there's
 *  no provider to chat through. Never stops the sidecar. */
export async function ensureSidecarRunning(): Promise<void> {
  const sc = getSidecar();
  if (sc.isReady || booting) return;
  if (!hasChatCapability()) return;
  booting = true;
  try {
    // Account-era data must be home before the sidecar reads ~/.ava.
    await ensureDataHome();
    await sc.start(buildSidecarConfig());
  } catch {
    // Failure surfaces via the sidecar 'error'/'close' event stream + Output panel.
  } finally {
    booting = false;
  }
}
