// The Usage timeline (his call, 21 Nov 2026; plan 2026-11-21-usage-timeline).
//
// Mirror of the extension's UsageTimeline (extension/dashboard-ui/src/
// components/UsageTimeline.tsx) — same layout, same words, same figures. Any
// period, money and tokens together, against the period before; a bar per
// day (week, month on long ranges) to click into; a breakdown by model, room
// or mode; a CSV of the lines behind it.
//
// Reads ~/.ava/usage itself (lib/usage-ledger.ts); every figure is worked out
// by core's usage/view.ts, the code the extension runs too.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t, tt, useLocale } from '../lib/i18n';
import { DateField } from './MiniDatePicker';
import { readUsageRange } from '../lib/usage-ledger';
import {
  buildUsageView, changePct, daysToLoad, filterUsage, rangeFor, summariseUsage, usageCsv,
  USAGE_RANGE_KEYS, type UsageBar, type UsageEntry, type UsageRangeKey, type UsageTotals,
} from '@ava/core/usage/view';

const STORE_KEY = 'ava.usage.timeline';

interface Saved { key: UsageRangeKey; from?: string; to?: string; metric: 'usd' | 'tokens'; by: 'model' | 'room' | 'mode' }

function loadSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Partial<Saved> | null;
    if (s && USAGE_RANGE_KEYS.includes(s.key as UsageRangeKey)) {
      return { key: s.key as UsageRangeKey, from: s.from, to: s.to, metric: s.metric === 'tokens' ? 'tokens' : 'usd', by: s.by === 'room' || s.by === 'mode' ? s.by : 'model' };
    }
  } catch { /* first visit, or storage blocked */ }
  return { key: 'month', metric: 'usd', by: 'model' };
}

// ─── Words (the same keys and English as the extension) ─────────────────────

function rangeLabel(k: UsageRangeKey): string {
  const en: Record<UsageRangeKey, string> = {
    today: 'Today', '7d': '7 days', '30d': '30 days', month: 'This month', last_month: 'Last month', all: 'All time', custom: 'Custom',
  };
  return tt(`dash.usage.tl.range.${k}`, en[k]);
}

const ROOM_EN: Record<string, string> = {
  main: 'Main chat', health: 'Health', learning: 'Learning', design: 'Design Studio', social: 'Posts',
  brainstorm: 'Brainstorm', background: 'Background', earlier: 'Before daily records',
};
function roomLabel(id: string): string {
  return tt(`dash.usage.tl.room.${id}`, ROOM_EN[id] ?? id);
}

const MODE_EN: Record<string, string> = {
  'work:talking': 'Code (Talk)', health: 'Health Room', design: 'Design Studio', social: 'Posts', news: 'Newsroom',
  pantry: 'Pantry', gym: 'Gym', classroom: 'Classroom', background: 'Background', earlier: 'Before daily records',
};
function modeLabel(id: string): string {
  const own = t(`mode.${id}`);
  if (own !== `mode.${id}`) return own;
  return tt(`dash.usage.tl.mode.${id.replace(':', '_')}`, MODE_EN[id] ?? id.charAt(0).toUpperCase() + id.slice(1));
}

function money(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(Math.round(n));
}

/** What an outlined bar is: a month's total from the old counters. */
function earlierNote(): string {
  return tt('dash.usage.tl.earlier_note', 'a month total from before daily records began (21 Nov 2026), so it has no daily detail');
}

function dayText(day: string, locale: string, withYear = false): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

function barText(b: UsageBar, bucket: string, locale: string): string {
  if (bucket === 'month') {
    const [y, m] = b.start.split('-').map(Number);
    return new Date(y, m - 1, 1, 12).toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' });
  }
  return b.start === b.end ? dayText(b.start, locale, true) : `${dayText(b.start, locale)} – ${dayText(b.end, locale, true)}`;
}

// ─── Look ───────────────────────────────────────────────────────────────────

const CARD = {
  background: 'rgba(26, 16, 40, 0.6)', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
  borderRadius: 12, padding: 16,
} as const;
const MUTED = '#6c7086';
const TEXT = '#cdd6f4';
const HEADING = { fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: MUTED };

function Chip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      style={{
        padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        background: active ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'transparent',
        border: active ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid var(--border, #2a2440)',
        color: active ? 'var(--accent)' : MUTED,
      }}
    >{children}</button>
  );
}

function Change({ now, before }: { now: number; before: number | undefined }) {
  if (before === undefined) return null;
  const pct = changePct(now, before);
  const style = { fontSize: 10, color: MUTED, marginTop: 2 };
  if (pct === null) return <div style={style}>{tt('dash.usage.tl.no_previous', 'nothing in the period before')}</div>;
  // Neutral colour: more or less spend is a fact about the period, not a verdict.
  const arrow = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '=';
  return <div style={style}>{arrow} {Math.abs(pct).toFixed(0)}% {tt('dash.usage.tl.vs_previous', 'vs the period before')}</div>;
}

function Headline({ label, value, sub, now, before }: { label: string; value: string; sub?: string; now: number; before?: number }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: 10, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4, color: TEXT }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{sub}</div>}
      <Change now={now} before={before} />
    </div>
  );
}

/** Plain SVG bars — no chart library. One per bucket across the whole range. */
function Bars({ bars, metric, bucket, selected, onSelect, locale }: {
  bars: UsageBar[]; metric: 'usd' | 'tokens'; bucket: string; selected: string | null;
  onSelect: (b: UsageBar | null) => void; locale: string;
}) {
  const value = (b: UsageBar) => (metric === 'usd' ? b.usd : b.in + b.out);
  const max = Math.max(0, ...bars.map(value));
  const W = 100 / Math.max(bars.length, 1);
  const H = 120;
  const fmt = (b: UsageBar) => (metric === 'usd' ? money(b.usd) : `${tokens(b.in + b.out)} ${tt('dash.usage.tl.tokens_word', 'tokens')}`);
  return (
    <div>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 144, display: 'block' }} role="img" aria-label={tt('dash.usage.tl.timeline', 'Timeline')}>
        <line x1="0" y1={H - 0.5} x2="100" y2={H - 0.5} stroke="color-mix(in srgb, var(--accent) 20%, transparent)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {bars.map((b, i) => {
          const v = value(b);
          const h = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * (H - 6)) : 0;
          const isSel = selected === b.start;
          return (
            <g key={b.start} onClick={() => onSelect(isSel ? null : b)} style={{ cursor: b.replies ? 'pointer' : 'default' }}>
              <rect x={i * W} y={0} width={W} height={H} fill="transparent">
                <title>{`${barText(b, bucket, locale)}: ${fmt(b)} · ${b.replies} ${tt('dash.usage.tl.calls_word', 'calls')}${b.earlier ? ` — ${earlierNote()}` : ''}`}</title>
              </rect>
              <rect
                x={i * W + W * 0.15} y={H - h} width={W * 0.7} height={h} rx="0.6"
                fill={isSel ? 'var(--accent)' : b.earlier ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'color-mix(in srgb, var(--accent) 55%, transparent)'}
                stroke={b.earlier ? 'var(--accent)' : 'none'}
                strokeDasharray={b.earlier ? '3 2' : undefined}
                strokeWidth={b.earlier ? 1 : 0}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: MUTED, marginTop: 4 }}>
        <span>{bars.length ? barText(bars[0], bucket, locale) : ''}</span>
        <span>{bars.length > 1 ? barText(bars[bars.length - 1], bucket, locale) : ''}</span>
      </div>
    </div>
  );
}

// ─── The page ───────────────────────────────────────────────────────────────

export function UsageTimeline() {
  const locale = useLocale();
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<UsageBar | null>(null);
  const requestRef = useRef(0);

  const update = (next: Partial<Saved>) => setSaved((s) => {
    const v = { ...s, ...next };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* a convenience only */ }
    return v;
  });

  const range = useMemo(() => rangeFor(saved.key, new Date(), { from: saved.from, to: saved.to }), [saved.key, saved.from, saved.to]);

  const load = useCallback(() => {
    const want = daysToLoad(saved.key, range);
    const id = ++requestRef.current;
    void readUsageRange(want.from, want.to).then((rows) => {
      // A slow read for a range the user has already left is dropped.
      if (id !== requestRef.current) return;
      setEntries(rows);
      setLoaded(true);
    });
  }, [saved.key, range]);

  useEffect(() => { setSelected(null); load(); }, [load]);

  // Fresh figures: after each reply here, when the window comes back into
  // focus, and on a gentle interval — the extension and the CLI write to the
  // same files, and a page that only followed this app would show half.
  useEffect(() => {
    const again = () => load();
    window.addEventListener('ava-usage-recorded', again);
    window.addEventListener('focus', again);
    const timer = window.setInterval(again, 15_000);
    return () => {
      window.removeEventListener('ava-usage-recorded', again);
      window.removeEventListener('focus', again);
      window.clearInterval(timer);
    };
  }, [load]);

  const view = useMemo(() => buildUsageView(entries, saved.key, range), [entries, saved.key, range]);
  const { totals } = view.summary;
  const before: UsageTotals | undefined = view.previous?.totals;

  const breakdownSummary = useMemo(
    () => (selected ? summariseUsage(filterUsage(entries, selected.start, selected.end)) : view.summary),
    [selected, entries, view.summary],
  );
  const rows = (saved.by === 'model'
    ? breakdownSummary.byModel.map((m) => ({ key: `${m.provider}:${m.model}`, label: m.model, sub: m.provider, ...m }))
    : saved.by === 'room'
      ? breakdownSummary.byRoom.map((r) => ({ key: r.room, label: roomLabel(r.room), sub: '', ...r }))
      : breakdownSummary.byMode.map((r) => ({ key: r.mode, label: modeLabel(r.mode), sub: '', ...r })));
  const top = Math.max(0, ...rows.map((r) => (saved.metric === 'usd' ? r.usd : r.in + r.out)));

  const exportCsv = async () => {
    try {
      const lines = filterUsage(entries, view.range.from, view.range.to);
      const [dialog, fs] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
      const target = await dialog.save({
        defaultPath: `ava-usage-${view.range.from}-to-${view.range.to}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (!target) return;
      await fs.writeTextFile(target, usageCsv(lines));
    } catch { /* the dialog was closed or the write refused — nothing to undo */ }
  };

  const empty = <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>{tt('dash.usage.tl.empty', 'Nothing spent in this period.')}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
      {/* Range */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {USAGE_RANGE_KEYS.map((k) => (
          <Chip key={k} active={saved.key === k} onClick={() => update({ key: k })}>{rangeLabel(k)}</Chip>
        ))}
        <div style={{ flex: 1 }} />
        <Chip active={false} disabled={totals.replies === 0} onClick={() => { void exportCsv(); }}>{tt('dash.usage.tl.export', 'Export CSV')}</Chip>
      </div>
      {saved.key === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: MUTED }}>
          <span>{tt('dash.usage.tl.from', 'From')}</span>
          <DateField value={saved.from ?? null} onChange={(v) => update({ from: v ?? undefined })} style={{ height: 28, width: 150 }} />
          <span>{tt('dash.usage.tl.to', 'to')}</span>
          <DateField value={saved.to ?? null} onChange={(v) => update({ to: v ?? undefined })} style={{ height: 28, width: 150 }} />
        </div>
      )}
      <div style={{ fontSize: 11, color: MUTED, marginTop: -8 }}>
        {view.range.from === view.range.to
          ? dayText(view.range.from, locale, true)
          : `${dayText(view.range.from, locale, true)} – ${dayText(view.range.to, locale, true)}`}
      </div>

      {/* Totals, money and tokens side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Headline label={t('dash.usage.estimated_cost')} value={money(totals.usd)} now={totals.usd} before={before?.usd} />
        <Headline
          label={t('dash.usage.total_tokens')}
          value={tokens(totals.in + totals.out)}
          sub={`${t('status.in')} ${tokens(totals.in)} · ${t('status.out')} ${tokens(totals.out)}`}
          now={totals.in + totals.out}
          before={before ? before.in + before.out : undefined}
        />
        <Headline label={tt('dash.usage.tl.calls', 'Calls')} value={String(totals.replies)} now={totals.replies} before={before?.replies} />
      </div>
      {totals.unpriced > 0 && (
        <div style={{ fontSize: 10, color: MUTED, marginTop: -8 }}>{t('dash.usage.tl.unpriced', { count: totals.unpriced })}</div>
      )}

      {/* Timeline */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={HEADING}>
            {view.bucket === 'day' ? tt('dash.usage.tl.per_day', 'Per day') : view.bucket === 'week' ? tt('dash.usage.tl.per_week', 'Per week') : tt('dash.usage.tl.per_month', 'Per month')}
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            <Chip active={saved.metric === 'usd'} onClick={() => update({ metric: 'usd' })}>$</Chip>
            <Chip active={saved.metric === 'tokens'} onClick={() => update({ metric: 'tokens' })}>{tt('dash.usage.tl.tokens', 'Tokens')}</Chip>
          </div>
        </div>
        {loaded && totals.replies === 0
          ? empty
          : <Bars bars={view.bars} metric={saved.metric} bucket={view.bucket} selected={selected?.start ?? null} onSelect={setSelected} locale={locale} />}
        {view.bars.some((b) => b.earlier) && (
          <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>
            <span style={{ display: 'inline-block', width: 12, height: 8, marginRight: 4, verticalAlign: 'middle', borderRadius: 2, border: '1px dashed var(--accent)' }} />
            {tt('dash.usage.tl.earlier_legend', 'Outlined: a month total from before daily records began (21 Nov 2026).')}
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div style={CARD}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <span style={HEADING}>
            {selected
              ? <>{barText(selected, view.bucket, locale)}{' '}
                  <button type="button" onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', padding: 0, marginLeft: 4, cursor: 'pointer', color: 'var(--accent)', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>
                    {tt('dash.usage.tl.whole_period', 'show the whole period')}
                  </button></>
              : tt('dash.usage.tl.breakdown', 'Where it went')}
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            <Chip active={saved.by === 'model'} onClick={() => update({ by: 'model' })}>{tt('dash.usage.tl.by_model', 'Model')}</Chip>
            <Chip active={saved.by === 'room'} onClick={() => update({ by: 'room' })}>{tt('dash.usage.tl.by_room', 'Room')}</Chip>
            <Chip active={saved.by === 'mode'} onClick={() => update({ by: 'mode' })}>{tt('dash.usage.tl.by_mode', 'Mode')}</Chip>
          </div>
        </div>
        {rows.length === 0 ? empty : rows.map((r) => {
          const v = saved.metric === 'usd' ? r.usd : r.in + r.out;
          return (
            <div key={r.key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.label}{r.sub && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: MUTED }}>{r.sub}</span>}
                </span>
                <span style={{ color: MUTED, flexShrink: 0 }}>
                  {money(r.usd)} · {tokens(r.in + r.out)} · {r.replies} {tt('dash.usage.tl.calls_word', 'calls')}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(49, 34, 68, 0.5)' }}>
                <div style={{ width: `${top > 0 ? (v / top) * 100 : 0}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, var(--accent), #6366f1)' }} />
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 10, color: '#585b70', marginTop: 4 }}>{t('dash.usage.est_note')}</div>
      </div>
    </div>
  );
}
