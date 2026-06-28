import { useState, type CSSProperties } from 'react';
import { WeeklyPlanView } from './WeeklyPlanView';
import { t, useLocale } from '../lib/i18n';

/**
 * The Command Center "Health" tab — a glance at what's on today / this week,
 * pulled from the user's active fitness / meal / combined plans. Read-only: the
 * plans and profile live in Account → "{name}'s profile"; this just surfaces
 * them. Today first (what's on now), then the week. Was the old daily home
 * (brief + status + quick-log) — replaced 2026-06-22 per the operator's call
 * that the command center is a quick look, not a workspace.
 */

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 5) return 'health.home.greeting.late_night';
  if (h < 12) return 'health.home.greeting.morning';
  if (h < 17) return 'health.home.greeting.afternoon';
  if (h < 21) return 'health.home.greeting.evening';
  return 'health.home.greeting.late_evening';
}

function longDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function HealthDashboard() {
  useLocale();
  const [innerTab, setInnerTab] = useState<'today' | 'week'>('today');

  const tabBtn = (active: boolean): CSSProperties => ({
    padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12,
    fontWeight: active ? 600 : 500, background: 'transparent',
    color: active ? '#c084fc' : '#6c7086',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1,
  });

  return (
    <div style={{ width: '100%', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <header>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, color: '#6c7086' }}>{longDate()}</div>
        <h1 style={{ fontSize: 20, fontWeight: 300, color: '#cdd6f4', margin: '4px 0 0' }}>{t(greetingKey())}.</h1>
      </header>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)' }}>
        <button onClick={() => setInnerTab('today')} style={tabBtn(innerTab === 'today')}>{t('health.week.today')}</button>
        <button onClick={() => setInnerTab('week')} style={tabBtn(innerTab === 'week')}>{t('health.week.title')}</button>
      </div>

      <WeeklyPlanView view={innerTab === 'today' ? 'today' : 'week'} />
    </div>
  );
}
