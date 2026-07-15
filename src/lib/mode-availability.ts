import { t } from './i18n';

// Single source of truth for the 3 orchestrated modes —
// Aurora, Supernova, Maestro — and what unlocks them.
//
// Plans surface only these 3 modes (no raw individual models). BYOK
// surface gets the same 3 modes plus raw models per the user's keys.
// Each mode is gated by the fleet of provider keys it actually needs:
//
//   Maestro   → Qwen-only fleet (Qwen 3.7 Plus + 3.5 Flash light tier).
//   Supernova → DeepSeek + Qwen ensemble (DeepSeek V4 Pro coordinator
//               + V4 Flash mid-tier; Qwen builder + light + vision +
//               long-form).
//   Aurora    → Mistral-only EU stack (Medium 3.5 lead + Small 4
//               workhorse + Large 3 reserve).
//
// All three modes are public (admin gate retired). Any signed-in
// platform user gets all three; BYOK users unlock each mode the
// moment they have the relevant keys.

import { useEffect, useState } from 'react';
import { getPlatformKey } from './api';

export type ModeId = 'maestro' | 'supernova' | 'aurora';

export interface ByokKeys {
  qwen: boolean;
  deepseek: boolean;
  mistral: boolean;
  anthropic: boolean;
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
}

const EMPTY_BYOK: ByokKeys = {
  qwen: false,
  deepseek: false,
  mistral: false,
  anthropic: false,
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
      anthropic: has('Anthropic'),
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
export function getModeAvailability(state: ModeAvailabilityState): ModeAvailability {
  const { platformConnected, byok } = state;
  return {
    maestro:   platformConnected || byok.qwen,
    supernova: platformConnected || (byok.qwen && byok.deepseek),
    aurora:    platformConnected || byok.mistral,
  };
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
  // maestro
  return t('dash.model.sub.connect_qwen');
}
