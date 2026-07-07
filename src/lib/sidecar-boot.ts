// ── App-level sidecar boot ───────────────────────────────────────────────────
// The sidecar is a singleton shared by EVERY dashboard page (main chat, Creative/
// Design Studio, health, learning…). It used to be booted only by AvaChatPage, so
// landing on — or reloading into — the Design Studio left it with no live sidecar
// and the design chat failed with "Sidecar not running". This module boots it from
// App level so it's available regardless of which page is mounted, and never tears
// it down on navigation. Config is read from localStorage (the same keys the main
// chat writes), so there's a single source of truth and no drift.

import { getSidecar, type SidecarConfig } from './sidecar';
import { getPlatformKey } from './api';
import { cloudSyncEnabled } from './data-mode';

// Mirror of AvaChatPage's SIDECAR_MODEL_MAP — orchestrated modes pass through by id;
// raw model ids get their provider prefix so the sidecar resolver finds them.
const SIDECAR_MODEL_MAP: Record<string, string> = {
  'auto': 'auto',
  'supernova': 'supernova',
  'aurora': 'aurora',
  'qwen3.7-plus': 'platform:qwen3.7-plus',
  'kimi-k2.6': 'kimi:kimi-k2.6',
  'kimi-k2.5': 'kimi:kimi-k2.5',
  'qwen3.5-omni-flash': 'platform:qwen3.5-omni-flash',
  'qwen3.5-omni-plus': 'platform:qwen3.5-omni-plus',
  'qwen3.5-plus': 'platform:qwen3.5-plus',
  'qwen3.5-flash': 'platform:qwen-flash',
  'deepseek-chat': 'deepseek:deepseek-chat',
  'deepseek-reasoner': 'deepseek:deepseek-reasoner',
  'moonshot-v1-128k': 'kimi:moonshot-v1-128k',
  'glm-4-plus': 'zhipu:glm-4-plus',
  'mistral-large': 'mistral:mistral-large-3',
};

function ls(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readByokProviders(): Record<string, { apiKey: string }> {
  const providers: Record<string, { apiKey: string }> = {};
  try {
    const raw = ls('ava-ide-byok');
    if (raw) {
      const keys: Record<string, string> = JSON.parse(raw);
      const nameMap: Record<string, string> = { DeepSeek: 'deepseek', Qwen: 'qwen', Moonshot: 'kimi', Zhipu: 'glm', Mistral: 'mistral' };
      for (const [name, key] of Object.entries(keys)) {
        if (key?.trim()) providers[nameMap[name] || name.toLowerCase()] = { apiKey: key.trim() };
      }
    }
  } catch { /* ignore */ }
  return providers;
}

/** True when there's a provider the sidecar can chat through (platform or BYOK). */
export function hasChatCapability(): boolean {
  const usePlatform = ls('ava-ide-use-platform') !== '0';
  if (usePlatform && getPlatformKey()) return true;
  return Object.keys(readByokProviders()).length > 0;
}

/** Build the sidecar init config from localStorage — mirrors AvaChatPage.startSidecar. */
export function buildSidecarConfig(): SidecarConfig {
  const providers = readByokProviders();
  const model = ls('ava-ide-active-model') || 'auto';
  const mode = ls('ava-ide-chat-mode') || 'work';
  const workStart = Number(ls('ava-ide-work-start')) || 9;
  const workEnd = Number(ls('ava-ide-work-end')) || 17;

  let syncPrefs: Record<string, boolean> = {};
  try { syncPrefs = JSON.parse(ls('ava-ide-sync-prefs') || '{}'); } catch { /* ignore */ }
  const cloudAllowed = cloudSyncEnabled();
  const generationLocalOnly = syncPrefs.generations === false || !cloudAllowed;
  const learningLocalOnly = syncPrefs.learning === false || !cloudAllowed;

  const localBaseUrl = ls('ava-ide-local-baseurl') || '';
  const localModelName = ls('ava-ide-local-model') || '';
  const localApiKey = ls('ava-ide-local-apikey') || '';
  const localModelLabel = ls('ava-ide-local-label') || '';
  let localModels: string[] = [];
  try { const v = JSON.parse(ls('ava-ide-local-models') || '[]'); if (Array.isArray(v)) localModels = v; } catch { /* ignore */ }
  const localBlock = (localBaseUrl && (localModels.length > 0 || localModelName))
    ? { baseUrl: localBaseUrl, modelName: localModelName, apiKey: localApiKey || undefined, modelLabel: localModelLabel || undefined, models: localModels.length ? localModels : undefined }
    : undefined;

  const usePlatform = ls('ava-ide-use-platform') !== '0';

  return {
    providers,
    platformKey: usePlatform ? (getPlatformKey() || undefined) : undefined,
    activeModel: SIDECAR_MODEL_MAP[model] || (model === 'auto' || model === 'supernova' || model === 'aurora' ? model : `platform:${model}`),
    cwd: ls('ava-ide-project-folder') || '.',
    mode,
    permissionMode: (ls('ava-ide-settings') ? JSON.parse(ls('ava-ide-settings')!).permissionMode : 'balanced') || 'balanced',
    autoMemory: true,
    workingHours: { start: workStart, end: workEnd },
    userName: ls('ava-ide-user-name') || ls('ava-ide-email')?.split('@')[0] || undefined,
    userEmail: ls('ava-ide-email') || undefined,
    userTier: ls('ava-ide-tier') || undefined,
    _devPlatformFallback: usePlatform && !!getPlatformKey(),
    generationLocalOnly,
    learningLocalOnly,
    local: localBlock,
    useLocalEmbeddings: ls('ava-ide-embeddings-enabled') === '1',
    embeddingModel: ls('ava-ide-embeddings-model') || undefined,
    embeddingBaseUrl: ls('ava-ide-embeddings-baseurl') || undefined,
  } as SidecarConfig;
}

let booting = false;

/** Ensure a live sidecar exists. No-op if one is already running/booting or there's
 *  no provider to chat through. Never stops the sidecar. */
export async function ensureSidecarRunning(): Promise<void> {
  const sc = getSidecar();
  if (sc.isReady || booting) return;
  if (!hasChatCapability()) return;
  booting = true;
  try {
    await sc.start(buildSidecarConfig());
  } catch {
    // Failure surfaces via the sidecar 'error'/'close' event stream + Output panel.
  } finally {
    booting = false;
  }
}
