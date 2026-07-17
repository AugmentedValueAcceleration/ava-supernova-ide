// Shared chat-model catalogue + sidecar id mapping.
//
// The main chat (AvaChatPage) and the focused rooms (Health / Learning) all
// pick from the SAME model list and push the SAME sidecar ids, so they can't
// drift. Single source for the data is @ava/core/models + the user's BYOK keys
// in localStorage['ava-ide-byok']; the sidecar mapping mirrors AvaChatPage's
// SIDECAR_MODEL_MAP exactly.

import { ALL_MODELS } from '@ava/core/models';

/** Picker id → the id the sidecar's resolver expects. Orchestrated modes pass
 *  through unprefixed; everything else gets its provider prefix. */
export const SIDECAR_MODEL_MAP: Record<string, string> = {
  auto: 'auto',
  supernova: 'supernova',
  aurora: 'aurora',
  'qwen3.7-plus': 'platform:qwen3.7-plus',
  'kimi-k3': 'kimi:kimi-k3',
  'kimi-k2.7-code': 'kimi:kimi-k2.7-code',
  'kimi-k2.6': 'kimi:kimi-k2.6',
  'kimi-k2.5': 'kimi:kimi-k2.5',
  'qwen3.5-omni-flash': 'platform:qwen3.5-omni-flash',
  'qwen3.5-omni-plus': 'platform:qwen3.5-omni-plus',
  'qwen3.5-plus': 'platform:qwen3.5-plus',
  'qwen3.5-flash': 'platform:qwen-flash',
  // DeepSeek retires `deepseek-chat`/`deepseek-reasoner` upstream on 2026-07-24.
  // Keep the old picker ids mapped so a stored preference still resolves, but
  // point them at the V4 tier each one used to mean (chat → non-thinking Flash,
  // reasoner → thinking; Pro is the frontier tier).
  'deepseek-chat': 'deepseek:deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek:deepseek-v4-pro',
  'deepseek-v4-pro': 'deepseek:deepseek-v4-pro',
  'deepseek-v4-flash': 'deepseek:deepseek-v4-flash',
  'moonshot-v1-128k': 'kimi:moonshot-v1-128k',
  'glm-4-plus': 'zhipu:glm-4-plus',
  'mistral-large': 'mistral:mistral-large-3',
};

/** Resolve a picker model id to the sidecar id (mirrors AvaChatPage's call). */
export function resolveSidecarModel(model: string): string {
  return SIDECAR_MODEL_MAP[model]
    || (model === 'auto' || model === 'supernova' || model === 'aurora' ? model : `platform:${model}`);
}

/** Providers the user holds a BYOK key for (store-name keys: Qwen, Moonshot…). */
export function getKeyedProviders(): Set<string> {
  try {
    const raw = localStorage.getItem('ava-ide-byok');
    if (!raw) return new Set<string>();
    const keys: Record<string, string> = JSON.parse(raw);
    return new Set(Object.entries(keys).filter(([, v]) => v && v.trim()).map(([k]) => k));
  } catch { return new Set<string>(); }
}

export interface ModelCatalogueGroup {
  id: string;
  label: string;
  available: boolean;
  models: { id: string; name: string }[];
}

/** Build the per-provider catalogue — alphabetical providers, models sorted by
 *  name, availability per BYOK key. Identical logic to AvaChatPage.MODEL_CATALOGUE. */
export function buildModelCatalogue(keyedProviders: Set<string>): ModelCatalogueGroup[] {
  const LABEL: Record<string, string> = { deepseek: 'DeepSeek', kimi: 'Kimi', qwen: 'Qwen', zhipu: 'GLM', mistral: 'Mistral', anthropic: 'Anthropic', minimax: 'MiniMax', xiaomi: 'Xiaomi', tencent: 'Tencent', nvidia: 'NVIDIA' };
  // provider id → the field name its key is stored under in `ava-ide-byok`.
  // `available` is derived from this, so a provider MISSING here is permanently
  // unavailable no matter what key the user holds. It was stuck at five, which
  // silently locked Anthropic / Xiaomi / Tencent / NVIDIA out of BYOK entirely —
  // their models stayed greyed out even with a valid key pasted in. Must stay in
  // step with the Sidebar's provider list (same store keys).
  const STORE: Record<string, string> = {
    deepseek: 'DeepSeek', kimi: 'Moonshot', qwen: 'Qwen', zhipu: 'Zhipu', mistral: 'Mistral',
    anthropic: 'Anthropic', xiaomi: 'Xiaomi', tencent: 'Tencent', nvidia: 'NVIDIA',
  };
  return Object.entries(ALL_MODELS)
    .map(([id, models]) => ({
      id,
      label: LABEL[id] || (id.charAt(0).toUpperCase() + id.slice(1)),
      available: STORE[id] ? keyedProviders.has(STORE[id]) : false,
      models: models.filter((m) => !m.disabled).map((m) => ({ id: m.id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.models.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}
