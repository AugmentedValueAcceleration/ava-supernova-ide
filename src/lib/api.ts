// Local usage counters — tokens, messages and tool calls this month, kept on
// this machine only. (The account API that lived here went with accounts on
// 1 Nov 2026.)

/* ── Shared Session Stats ──────────────────────────────────────────────── */

export interface SessionStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messages: number;
  toolCalls: number;
  models: Record<string, { input: number; output: number; requests: number }>;
  /** The calendar month these belong to, 'YYYY-MM'. Absent on stats written
   *  before the rollover existed — treated as stale and cleared on first read. */
  month?: string;
  /** ISO timestamp the month's counting began — the 1st, local time. */
  periodStart?: string;
}

const SESSION_KEY = 'ava-ide-session-stats';

/**
 * Usage accumulates per CALENDAR MONTH and clears on the 1st.
 *
 * It always persisted here — unlike the extension, which held it in memory and
 * lost it on every reload — but it accumulated forever, so the figures drifted
 * further from anything useful the longer the IDE was installed. A month is
 * what someone actually wants to know.
 *
 * The rollover is a KEY COMPARISON, not a timer: stored stats carry the month
 * they belong to, and the moment the current month differs they are replaced.
 * That resets correctly on the 1st even if the app was closed over the
 * boundary, asleep, or is opened in a different timezone — none of which a
 * scheduled reset would survive.
 */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function emptyStats(): SessionStats {
  return {
    inputTokens: 0, outputTokens: 0, totalTokens: 0, messages: 0, toolCalls: 0, models: {},
    month: currentMonth(), periodStart: monthStart(),
  };
}

function loadStats(): SessionStats {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as SessionStats;
    // Different month, or written before the field existed. Either way the
    // stored numbers describe a period that is over — so archive them before
    // the counters reset. They used to be dropped, which left a user with
    // no record of anything but the month they are standing in.
    if (parsed.month !== currentMonth()) {
      void import('./usage-history').then((m) => m.archiveMonth(parsed)).catch(() => { /* nicety, not a gate */ });
      return emptyStats();
    }
    return parsed;
  } catch {
    return emptyStats();
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
  saveStats(emptyStats());
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
