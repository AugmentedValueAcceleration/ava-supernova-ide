import { t } from './i18n';

// Single source of truth for the 4 orchestrated modes —
// Aurora, Supernova, Maestro, Longxiang — and what unlocks them.
//
// Each mode is gated by the fleet of provider keys it actually needs, and
// the picker also lists the single models the user's keys reach:
//
//   Maestro   → Qwen-only fleet (3.8 Flash coordinates + chats, 3.7 Plus deep work).
//   Supernova → DeepSeek + Qwen ensemble (DeepSeek Flash takes the
//               coordinator AND mid-tier seats — one model since the
//               2026-09-10 collapse; Qwen builder + light + vision +
//               long-form).
//   Aurora    → Mistral-only EU stack (Medium 3.5 lead + Small 4
//               workhorse + Large 3 reserve).
//
// Every mode unlocks the moment the user has the keys its fleet needs (no
// accounts, 1 Nov 2026).

import { useEffect, useState } from 'react';
import { keyedFields } from './provider-keys';

//   Longxiang → open-weights Kimi/Qwen/DeepSeek stack (K3 lead + Builder,
//               Qwen 3.7 Plus mid-tier + vision, DeepSeek Flash volume).
//               Gated by LONGXIANG_LIVE below, then available exactly like
//               the other three: once the keys are there (moonshot + qwen +
//               deepseek).

export type ModeId = 'maestro' | 'supernova' | 'aurora' | 'longxiang';

/**
 * Longxiang's launch flag, imported from core rather than mirrored — there is
 * exactly ONE boolean and every surface reads it, so the fleet can't go live
 * on one surface and stay dark on another.
 *
 * Imported from core's built output the same way i18n.ts pulls its locales.
 * Safe to bundle into the browser: longxiang-router's only import is a
 * type-only one, so the compiled module has zero runtime dependencies.
 */
// @ts-ignore — untyped deep import into core's dist, matching i18n.ts
// Both flags come from routing-modes, the import-free file every surface can
// reach — see its header on the nine times a hand-written fleet list went wrong.
// longxiang-router re-exports LONGXIANG_ENABLED for older callers; taking both
// from the source avoids depending on that.
import { LONGXIANG_ENABLED, AURORA_ENABLED } from '../../../core/dist/auto/routing-modes.js';

export const LONGXIANG_LIVE: boolean = LONGXIANG_ENABLED;
/** Aurora went dark on 2026-10-06. Mistral has not answered the 9 Sep approach,
 *  so a Mistral-only fleet advertises a relationship that does not exist. Same
 *  shape as LONGXIANG_LIVE, and the same single source in core. */
export const AURORA_LIVE: boolean = AURORA_ENABLED;

export interface ByokKeys {
  qwen: boolean;
  deepseek: boolean;
  mistral: boolean;
  minimax: boolean;
  moonshot: boolean;
  zhipu: boolean;
  // No fleet needs these three, which is why they were missing — but the
  // per-model check below reads the same shape, and a provider absent from it
  // is treated as needing no key at all. Xiaomi, Tencent and NVIDIA models
  // therefore showed as usable with nothing behind them.
  xiaomi: boolean;
  tencent: boolean;
  nvidia: boolean;
}

export interface ModeAvailabilityState {
  byok: ByokKeys;
}

export interface ModeAvailability {
  maestro: boolean;
  supernova: boolean;
  aurora: boolean;
  longxiang: boolean;
}

const EMPTY_BYOK: ByokKeys = {
  qwen: false,
  deepseek: false,
  mistral: false,
  minimax: false,
  moonshot: false,
  zhipu: false,
  xiaomi: false,
  tencent: false,
  nvidia: false,
};

// The key store uses PascalCase provider names (provider-keys.ts). We
// normalise to lowercase booleans so callers don't have to remember which
// casing each provider uses.
export function readByokKeys(): ByokKeys {
  try {
    const stored = keyedFields();
    if (stored.size === 0) return EMPTY_BYOK;
    const has = (provider: string) => stored.has(provider);
    return {
      qwen: has('Qwen'),
      deepseek: has('DeepSeek'),
      mistral: has('Mistral'),
      minimax: has('MiniMax'),
      moonshot: has('Moonshot'),
      zhipu: has('Zhipu'),
      xiaomi: has('Xiaomi'),
      tencent: has('Tencent'),
      nvidia: has('NVIDIA'),
    };
  } catch {
    return EMPTY_BYOK;
  }
}

/**
 * Does a key exist for the provider this model belongs to?
 *
 * The picker needs this per MODEL; getModeAvailability answers it per FLEET.
 * Providers with no BYOK entry (the platform pseudo-provider, a local endpoint)
 * are not key-gated and pass through.
 */
export function hasKeyFor(provider: string, keys: ByokKeys): boolean {
  const map: Record<string, keyof ByokKeys> = {
    qwen: 'qwen', deepseek: 'deepseek', mistral: 'mistral',
    minimax: 'minimax', kimi: 'moonshot', moonshot: 'moonshot',
    zhipu: 'zhipu', glm: 'zhipu',
    xiaomi: 'xiaomi', tencent: 'tencent', nvidia: 'nvidia',
  };
  const k = map[provider.toLowerCase()];
  return k ? keys[k] : true;
}

// The rule: a mode is available once the user holds the keys its fleet
// needs. The only extra condition is the launch flag, which is about whether
// the fleet has shipped, not about who may use it.
export function getModeAvailability(state: ModeAvailabilityState): ModeAvailability {
  const { byok } = state;
  return {
    maestro:   byok.qwen,
    supernova: byok.qwen && byok.deepseek,
    aurora:    AURORA_LIVE && byok.mistral,
    longxiang: LONGXIANG_LIVE && byok.moonshot && byok.qwen && byok.deepseek,
  };
}

/**
 * Should this mode appear in a picker AT ALL?
 *
 * Distinct from `availability[mode]`, and the difference matters:
 *   - isModeListed  → has this fleet LAUNCHED? (product decision)
 *   - availability  → can THIS user run it? (their keys / plan)
 *
 * A mode that is listed-but-unavailable renders greyed out with an unlock
 * hint — correct for Aurora when you lack a Mistral key. An unlaunched mode
 * must not render at all, greyed or otherwise, because a locked row still
 * displays the fleet's name and we are not announcing Longxiang early.
 */
export function isModeListed(mode: ModeId): boolean {
  if (mode === 'longxiang') return LONGXIANG_LIVE;
  if (mode === 'aurora') return AURORA_LIVE;
  return true;
}

// Reactive hook — recomputes when a key is added or removed
// (provider-keys.ts dispatches ava-byok-changed on every save).
export function useModeAvailability(): {
  state: ModeAvailabilityState;
  availability: ModeAvailability;
} {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick(t => t + 1);
    window.addEventListener('ava-byok-changed', refresh);
    return () => window.removeEventListener('ava-byok-changed', refresh);
  }, []);

  // tick is read here so the hook re-runs on every refresh event
  // without us needing to thread the value through.
  void tick;

  const state: ModeAvailabilityState = { byok: readByokKeys() };
  return { state, availability: getModeAvailability(state) };
}

// Subtitle copy: what an unlocked mode is, or which key a locked one still
// needs.
export function modeSubtitle(mode: ModeId, av: ModeAvailability, state: ModeAvailabilityState): string {
  if (av[mode]) {
    if (mode === 'maestro')   return t('dash.model.sub.maestro_best');
    if (mode === 'supernova') return t('dash.model.sub.supernova_poly');
    if (mode === 'aurora')    return t('dash.model.sub.aurora_eu');
    if (mode === 'longxiang') return t('dash.model.sub.longxiang_open');
  }
  // Locked — name the key(s) still missing.
  if (mode === 'supernova') {
    if (state.byok.qwen && !state.byok.deepseek) return t('dash.model.sub.add_deepseek');
    if (state.byok.deepseek && !state.byok.qwen) return t('dash.model.sub.add_qwen');
    return t('dash.model.sub.connect_ds_qwen');
  }
  if (mode === 'aurora') {
    return t('dash.model.sub.connect_mistral');
  }
  if (mode === 'longxiang') {
    // Name the specific key still missing — Moonshot first, since it holds the
    // lead seat and is the one a BYOK user is most likely to lack. Falls back
    // to the connect-or-add wording when they have none of the three.
    if (state.byok.moonshot || state.byok.qwen || state.byok.deepseek) {
      if (!state.byok.moonshot) return t('dash.model.sub.add_moonshot');
      if (!state.byok.qwen)     return t('dash.model.sub.add_qwen');
      return t('dash.model.sub.add_deepseek');
    }
    return t('dash.model.sub.connect_longxiang');
  }
  // maestro
  return t('dash.model.sub.connect_qwen');
}
