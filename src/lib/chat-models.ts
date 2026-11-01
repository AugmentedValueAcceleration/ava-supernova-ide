// Shared chat-model catalogue + sidecar id mapping.
//
// The main chat (AvaChatPage) and the focused rooms (Health / Learning) all
// pick from the SAME model list and push the SAME sidecar ids, so they can't
// drift. Single source for the data is @ava/core/models + the user's saved
// keys (lib/provider-keys.ts).

import { ALL_MODELS } from '@ava/core/models';
import { keyedFields } from './provider-keys';

/** Picker id → the id the sidecar's resolver expects. Orchestrated modes pass
 *  through unprefixed; everything else gets its provider prefix. */
export const SIDECAR_MODEL_MAP: Record<string, string> = {
  auto: 'auto',
  supernova: 'supernova',
  aurora: 'aurora',
  longxiang: 'longxiang',
  // DeepSeek retires `deepseek-chat`/`deepseek-reasoner` upstream on 2026-07-24.
  // Keep the old picker ids mapped so a stored preference still resolves, but
  // point them at the V4 tier each one used to mean (chat → non-thinking Flash,
  // reasoner → thinking; Pro is the frontier tier).
  'deepseek-chat': 'deepseek:deepseek-flash',
  'deepseek-reasoner': 'deepseek:deepseek-flash',
  'deepseek-flash': 'deepseek:deepseek-flash',
  'moonshot-v1-128k': 'kimi:moonshot-v1-128k',
  'glm-4-plus': 'zhipu:glm-4-plus',
  'mistral-large': 'mistral:mistral-large-3',
};

/** Resolve a picker model id to the sidecar id (mirrors AvaChatPage's call). */
const ORCHESTRATED_IDS = new Set(['auto', 'supernova', 'aurora', 'longxiang']);

export function resolveSidecarModel(model: string): string {
  // Fleets pass through unprefixed; a model id gets the provider that owns it
  // in core's catalogue, so it runs on the user's own key for that provider.
  // (It used to fall back to `platform:<id>` — the account-era managed models.)
  if (SIDECAR_MODEL_MAP[model]) return SIDECAR_MODEL_MAP[model];
  if (ORCHESTRATED_IDS.has(model) || model.includes(':')) return model;
  // Account-era stored picks were `<id>-platform`; the same model on the
  // user's own key is the id without the suffix.
  const bare = model.replace(/-platform$/, '');
  for (const [provider, models] of Object.entries(ALL_MODELS)) {
    if (models.some((m) => m.id === bare)) return `${provider}:${bare}`;
  }
  return bare;
}

/** Providers the user holds a key for (store-name keys: Qwen, Moonshot…). */
export function getKeyedProviders(): Set<string> {
  return keyedFields();
}

export interface ModelCatalogueGroup {
  id: string;
  label: string;
  available: boolean;
  models: { id: string; name: string }[];
}

/** Vendor display names. Exported because THREE pickers and the composer
 *  notice all name the same vendor, and two spellings of one vendor is the
 *  drift this codebase keeps paying for. */
export const PROVIDER_LABEL: Record<string, string> = {
  deepseek: 'DeepSeek', kimi: 'Kimi', qwen: 'Qwen', zhipu: 'GLM', mistral: 'Mistral',
  minimax: 'MiniMax', xiaomi: 'Xiaomi', tencent: 'Tencent', nvidia: 'NVIDIA',
};

/** A vendor id as a person would read it — falls back to Capitalised. */
export function providerLabel(id: string): string {
  return PROVIDER_LABEL[id] || (id.charAt(0).toUpperCase() + id.slice(1));
}

/** Build the per-provider catalogue — alphabetical providers, models sorted by
 *  name, availability per BYOK key. Identical logic to AvaChatPage.MODEL_CATALOGUE. */
export function buildModelCatalogue(keyedProviders: Set<string>): ModelCatalogueGroup[] {
  // provider id → the field its key is stored under (provider-keys.ts).
  // `available` is derived from this, so a provider MISSING here is permanently
  // unavailable no matter what key the user holds. It was stuck at five once,
  // which silently locked Xiaomi / Tencent / NVIDIA out entirely.
  const STORE: Record<string, string> = {
    deepseek: 'DeepSeek', kimi: 'Moonshot', qwen: 'Qwen', zhipu: 'Zhipu', mistral: 'Mistral',
    minimax: 'MiniMax', xiaomi: 'Xiaomi', tencent: 'Tencent', nvidia: 'NVIDIA',
  };
  return Object.entries(ALL_MODELS)
    .map(([id, models]) => ({
      id,
      label: providerLabel(id),
      available: STORE[id] ? keyedProviders.has(STORE[id]) : false,
      models: models.filter((m) => !m.disabled).map((m) => ({ id: m.id, name: m.name })).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.models.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}
