const PLATFORM_URL = 'https://ava-supernova.com/api';

export function getPlatformKey(): string | null {
  try { return localStorage.getItem('ava-ide-platform-key') || null; } catch { return null; }
}

export function getStoredEmail(): string | null {
  try { return localStorage.getItem('ava-ide-email') || null; } catch { return null; }
}

export function getStoredTier(): string | null {
  try { return localStorage.getItem('ava-ide-tier') || null; } catch { return null; }
}

export function isConnected(): boolean {
  const key = getPlatformKey();
  return !!key && key.startsWith('sk-ava-');
}

function getDeviceId(): string {
  let id = localStorage.getItem('ava-ide-device-id');
  if (!id) {
    id = crypto.randomUUID().slice(0, 16);
    localStorage.setItem('ava-ide-device-id', id);
  }
  return id;
}

export async function apiFetch(path: string, options?: RequestInit) {
  const key = getPlatformKey();
  if (!key) throw new Error('Not connected');
  const res = await fetch(`${PLATFORM_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Ava-Platform': 'ide',
      'X-Ava-Device': getDeviceId(),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export function apiStreamUrl(path: string): string {
  return `${PLATFORM_URL}${path}`;
}

/* ── Shared Session Stats ──────────────────────────────────────────────── */

export interface SessionStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messages: number;
  toolCalls: number;
  models: Record<string, { input: number; output: number; requests: number }>;
}

const SESSION_KEY = 'ava-ide-session-stats';

function loadStats(): SessionStats {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : { inputTokens: 0, outputTokens: 0, totalTokens: 0, messages: 0, toolCalls: 0, models: {} };
  } catch {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, messages: 0, toolCalls: 0, models: {} };
  }
}

function saveStats(stats: SessionStats) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(stats));
  window.dispatchEvent(new CustomEvent('ava-session-stats', { detail: stats }));
}

export function getSessionStats(): SessionStats {
  return loadStats();
}

export function resetSessionStats() {
  const empty: SessionStats = { inputTokens: 0, outputTokens: 0, totalTokens: 0, messages: 0, toolCalls: 0, models: {} };
  saveStats(empty);
}

export function trackTokenUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }, model?: string) {
  const stats = loadStats();
  const inp = usage.prompt_tokens || 0;
  const out = usage.completion_tokens || 0;
  const total = usage.total_tokens || (inp + out);
  stats.inputTokens += inp;
  stats.outputTokens += out;
  stats.totalTokens += total;
  if (model) {
    if (!stats.models[model]) stats.models[model] = { input: 0, output: 0, requests: 0 };
    stats.models[model].input += inp;
    stats.models[model].output += out;
  }
  saveStats(stats);
}

export function trackMessage(model?: string) {
  const stats = loadStats();
  stats.messages += 1;
  if (model) {
    if (!stats.models[model]) stats.models[model] = { input: 0, output: 0, requests: 0 };
    stats.models[model].requests += 1;
  }
  saveStats(stats);
}

export function trackToolCall() {
  const stats = loadStats();
  stats.toolCalls += 1;
  saveStats(stats);
}

/** React hook — re-renders when session stats change */
export function useSessionStats(): SessionStats {
  // This is a simple hook — import { useState, useEffect } at top won't work in a non-React file
  // Instead, consumers can use getSessionStats() + listen for 'ava-session-stats' events
  return loadStats();
}

/* ── Platform Models ──────────────────────────────────────────────────── */

export interface PlatformModel {
  id: string;
  name: string;
  provider: string;
  section: 'platform' | 'byok';
  context_window: number;
  max_output: number;
  supports_vision: boolean;
  supports_tools: boolean;
  supports_thinking: boolean;
}

const MODELS_CACHE_KEY = 'ava-ide-platform-models';
const MODELS_CACHE_TTL = 3600000; // 1 hour

export async function fetchPlatformModels(): Promise<PlatformModel[] | null> {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < MODELS_CACHE_TTL) return data;
    }
    const res = await fetch(`${PLATFORM_URL}/models`);
    if (!res.ok) return null;
    const data: PlatformModel[] = await res.json();
    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    return data;
  } catch {
    return null;
  }
}

export function getCachedModels(): PlatformModel[] | null {
  try {
    const cached = localStorage.getItem(MODELS_CACHE_KEY);
    if (!cached) return null;
    const { data } = JSON.parse(cached);
    return data;
  } catch {
    return null;
  }
}

export async function validateKey(key: string): Promise<{ valid: boolean; email?: string; name?: string; tier?: string; error?: string }> {
  try {
    const res = await fetch(`${PLATFORM_URL}/account-info`, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return { valid: false, error: 'Invalid API key' };
    }
    const data = await res.json();
    return { valid: true, email: data.email, name: data.name || data.display_name || data.email?.split('@')[0], tier: data.tier || data.plan || 'free' };
  } catch {
    return { valid: false, error: 'Could not reach platform' };
  }
}
