import { t } from './i18n';

// Single source of truth for the 4 orchestrated modes —
// Aurora, Supernova, Maestro, Longxiang — and what unlocks them.
//
// Plans surface only these 4 modes (no raw individual models). BYOK
// surface gets the same 4 modes plus raw models per the user's keys.
// Each mode is gated by the fleet of provider keys it actually needs:
//
//   Maestro   → Qwen-only fleet (Qwen 3.7 Plus + 3.5 Flash light tier).
//   Supernova → DeepSeek + Qwen ensemble (DeepSeek V4 Pro coordinator
//               + V4 Flash mid-tier; Qwen builder + light + vision +
//               long-form).
//   Aurora    → Mistral-only EU stack (Medium 3.5 lead + Small 4
//               workhorse + Large 3 reserve).
//
// All four modes are public (admin gate retired). Any signed-in
// platform user gets all four; BYOK users unlock each mode the
// moment they have the relevant keys. Orchestration is the product and
// is universally available — BYOK does not unlock it, it adds the option
// to bypass it and drive a single model instead.

import { useEffect, useState } from 'react';
import { getPlatformKey } from './api';

//   Longxiang → open-weights Kimi/Qwen/DeepSeek stack (K3 lead + Builder,
//               Qwen 3.7 Plus mid-tier + vision, V4 Flash volume).
//               Gated by LONGXIANG_LIVE below, then available exactly like
//               the other three: platform connection OR the BYOK keys
//               (moonshot + qwen + deepseek). It was BYOK-only before
//               launch and the comment outlived that — the gate on line
//               ~121 has read `platformConnected || byok` since it shipped.

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
import { LONGXIANG_ENABLED } from '../../../core/dist/auto/longxiang-router.js';

export const LONGXIANG_LIVE: boolean = LONGXIANG_ENABLED;

export interface ByokKeys {
  qwen: boolean;
  deepseek: boolean;
  mistral: boolean;
  minimax: boolean;
  moonshot: boolean;
  zhipu: boolean;
}

export interface ModeAvailabilityState {
  platformConnected: boolean;
  isAdmin: boolean;
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
};

// BYOK key store uses PascalCase provider names (matches BYOK_MODELS
// fallback in DashboardPages.tsx). We normalise to lowercase booleans
// so callers don't have to remember which casing each provider uses.
export function readByokKeys(): ByokKeys {
  try {
    const raw = localStorage.getItem('ava-ide-byok');
    if (!raw) return EMPTY_BYOK;
    const stored = JSON.parse(raw) as Record<string, string>;
    const has = (provider: string) => {
      const v = stored[provider];
      return !!(v && v.trim());
    };
    return {
      qwen: has('Qwen'),
      deepseek: has('DeepSeek'),
      mistral: has('Mistral'),
      minimax: has('MiniMax'),
      moonshot: has('Moonshot'),
      zhipu: has('Zhipu'),
    };
  } catch {
    return EMPTY_BYOK;
  }
}

export function readTier(): string {
  try { return localStorage.getItem('ava-ide-tier') || 'free'; } catch { return 'free'; }
}

// The rule. Plan path lights up all three orchestrated modes for any
// signed-in platform user (admin gate retired 2026-04-30 with the
// public Aurora + Supernova launch — partnership conversations on
// DeepSeek and Mistral resolved enough to ship). BYOK path lights up
// the mode whenever the relevant fleet of keys is present. The two
// paths are an OR — a plan user with their own Mistral key gets
// Aurora the same way; isAdmin is no longer load-bearing.
// Longxiang follows the SAME rule as every other fleet — a signed-in plan
// runs it on credits, BYOK unlocks it once all three keys are present. The
// only extra condition is the launch flag, which is about whether the fleet
// has shipped, not about who may use it.
export function getModeAvailability(state: ModeAvailabilityState): ModeAvailability {
  const { platformConnected, byok } = state;
  return {
    maestro:   platformConnected || byok.qwen,
    supernova: platformConnected || (byok.qwen && byok.deepseek),
    aurora:    platformConnected || byok.mistral,
    longxiang: LONGXIANG_LIVE && (platformConnected || (byok.moonshot && byok.qwen && byok.deepseek)),
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
  return mode !== 'longxiang' || LONGXIANG_LIVE;
}

// Reactive hook — recomputes when the user signs in/out, switches
// tier, or adds/removes a BYOK key. The events it listens to are
// already dispatched elsewhere (sign-in.ts emits ava-auth-changed,
// Sidebar emits ava-byok-changed, lib/api.ts emits ava-tier-changed).
export function useModeAvailability(): {
  state: ModeAvailabilityState;
  availability: ModeAvailability;
} {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick(t => t + 1);
    window.addEventListener('ava-auth-changed', refresh);
    window.addEventListener('ava-tier-changed', refresh);
    window.addEventListener('ava-byok-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('ava-auth-changed', refresh);
      window.removeEventListener('ava-tier-changed', refresh);
      window.removeEventListener('ava-byok-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // tick is read here so the hook re-runs on every refresh event
  // without us needing to thread the value through.
  void tick;

  const state: ModeAvailabilityState = {
    platformConnected: !!getPlatformKey(),
    isAdmin: readTier() === 'admin',
    byok: readByokKeys(),
  };
  return { state, availability: getModeAvailability(state) };
}

// "Coming soon" copy depends on whether the user could unlock the mode
// via BYOK or just hasn't connected. Surfaced in mode subtitles.
export function modeSubtitle(mode: ModeId, av: ModeAvailability, state: ModeAvailabilityState): string {
  if (av[mode]) {
    if (mode === 'maestro')   return t(state.platformConnected ? 'dash.model.sub.maestro_best'   : 'dash.model.sub.byok_qwen');
    if (mode === 'supernova') return t(state.platformConnected ? 'dash.model.sub.supernova_poly' : 'dash.model.sub.byok_ds_qwen');
    if (mode === 'aurora')    return t(state.platformConnected ? 'dash.model.sub.aurora_eu'      : 'dash.model.sub.byok_mistral');
    if (mode === 'longxiang') return t(state.platformConnected ? 'dash.model.sub.longxiang_open' : 'dash.model.sub.byok_longxiang');
  }
  // Locked — explain the unlock path. Admin gate retired 2026-04-30,
  // so locked = not-signed-in AND missing the BYOK keys for this mode.
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
