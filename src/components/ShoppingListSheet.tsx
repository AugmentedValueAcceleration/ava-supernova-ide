// The step that turns a plan into food.
//
// The IDE mirror of the extension's sheet — same behaviour, none of the markup.
// Every rule that decides what lands on the list lives in @ava/core
// (health/shopping-list, health/aisles): merging, unit conversion, household
// scaling, aisle ordering, and the two reasons a meal can be missing. This file
// is presentation and tick state, nothing more. If a quantity looks wrong the
// bug is in core and fixing it here would only hide it on one surface.
//
// Ticks and folded aisles are per scope and persisted, because a shopping list
// is used over an hour in a shop and losing your ticks halfway round is worse
// than not having them.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildShoppingListAcross, daysInRange, weekBounds, shiftWeek,
  type PlanDaySource, type ShoppingItem,
} from '@ava/core/health/shopping-list';
import type { Aisle } from '@ava/core/health/aisles';
import type { HealthPlan } from '../lib/health-plans-store';
import type { HealthProfile } from '../lib/health-store';
import { t } from '../lib/i18n';

const ACCENT = 'var(--accent)';
const TEXT = '#cdd6f4';
const MUTED = '#585b70';
const AMBER = '#fbbf24';
const BORDER = 'color-mix(in srgb, var(--accent) 14%, transparent)';

const aisleLabel = (a: Aisle): string => t(`health.shopping.aisle.${a}`);

const tickKey = (scope: string) => `ava-shopping-ticks-${scope}`;
const foldKey = (scope: string) => `ava-shopping-folded-${scope}`;

function readSet(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch { return null; }
}
function writeSet(key: string, value: Set<string>): void {
  try { localStorage.setItem(key, JSON.stringify([...value])); } catch { /* storage disabled */ }
}

function rangeLabel(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00`);
  const tt = new Date(`${to}T00:00:00`);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${f.toLocaleDateString(undefined, opts)} – ${tt.toLocaleDateString(undefined, opts)}`;
}

/** One line's amounts, already merged and converted by core. */
function amountText(item: ShoppingItem): string {
  const parts = item.amounts.map(a => (a.unit ? `${a.qty} ${a.unit}` : String(a.qty)));
  if (item.looseLines > 0) parts.push(`+${item.looseLines} ${t('health.shopping.loose_lines')}`);
  return parts.join(' · ');
}

type Scope = 'plan' | 'week';

export function ShoppingListSheet({ plan, plans, profile, onClose }: {
  /** The plan in front of you, when there is one. Null = the week across all. */
  plan: HealthPlan | null;
  plans: HealthPlan[];
  profile: HealthProfile | null;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>(plan ? 'plan' : 'week');
  const [week, setWeek] = useState(0);
  const [hideOptional, setHideOptional] = useState(false);

  const single = scope === 'plan' ? plan : null;
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const bounds = useMemo(() => shiftWeek(weekBounds(todayIso), week), [todayIso, week]);

  // Which days feed the list. A plan is shopped a week at a time — nobody buys
  // twenty-eight days of fresh food at once — and the week view spans every
  // active plan, which is the case a per-plan list used to hide.
  const planWeeks = single ? Math.max(1, Math.ceil((single.duration_days || 1) / 7)) : 1;

  const sources = useMemo<PlanDaySource[]>(() => {
    if (single) {
      // day_index is 1-based, so week 0 is days 1–7. Off by one here and the
      // first week silently drops day 1 and borrows day 8 from the next.
      const days = planWeeks === 1
        ? single.days
        : single.days.filter(d => d.day_index > week * 7 && d.day_index <= (week + 1) * 7);
      return days.map(day => ({ day, planTitle: single.title }));
    }
    // Takes every plan at once and does the date maths itself — two plans both
    // wanting onions is exactly the case a per-plan list hid.
    return daysInRange(plans, bounds.from, bounds.to);
  }, [single, week, planWeeks, plans, bounds]);

  // Household is applied HERE and nowhere else. The plan stays per-person —
  // scaling servings would have multiplied every day's macros by the household
  // against a target meant for one person. See ShoppingListOptions in core.
  //
  // Captured once on open rather than read live: a shop is a moment, and a
  // profile edited halfway round must not rewrite quantities already ticked.
  const [household] = useState<number | null>(() => profile?.kitchen?.household_size ?? null);

  const list = useMemo(
    () => buildShoppingListAcross(sources, { excludeOptional: hideOptional, household }),
    [sources, hideOptional, household],
  );

  const scopeId = single ? single.id : `week-${bounds.from}`;
  const [ticks, setTicks] = useState<Set<string>>(() => readSet(tickKey(scopeId)) ?? new Set());
  const [folded, setFolded] = useState<Set<string>>(() => readSet(foldKey(scopeId)) ?? new Set());

  // Re-read when the scope changes: each plan and each week keeps its own ticks,
  // so walking back to last week shows what you actually bought.
  useEffect(() => {
    setTicks(readSet(tickKey(scopeId)) ?? new Set());
    setFolded(readSet(foldKey(scopeId)) ?? new Set());
  }, [scopeId]);

  const toggleTick = useCallback((key: string) => {
    setTicks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      writeSet(tickKey(scopeId), next);
      return next;
    });
  }, [scopeId]);

  const toggleFold = useCallback((aisle: string) => {
    setFolded(prev => {
      const next = new Set(prev);
      if (next.has(aisle)) next.delete(aisle); else next.add(aisle);
      writeSet(foldKey(scopeId), next);
      return next;
    });
  }, [scopeId]);

  const reset = () => {
    const empty = new Set<string>();
    setTicks(empty);
    writeSet(tickKey(scopeId), empty);
  };

  const got = list.groups.flatMap(g => g.items).filter(i => ticks.has(i.key)).length;
  const missingRead = list.missing.filter(m => m.reason === 'lookup_failed');
  const missingCustom = list.missing.filter(m => m.reason === 'not_in_library');

  const pill = (active: boolean): React.CSSProperties => ({
    borderRadius: 999, padding: '4px 12px', fontSize: 11, cursor: 'pointer',
    background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
    color: active ? ACCENT : MUTED,
    border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : BORDER}`,
  });

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 620, maxHeight: 'min(800px, 90vh)', overflow: 'hidden', borderRadius: 16, border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', background: 'linear-gradient(to bottom right, #0f0f17, #1a1625)' }}>

        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TEXT }}>{t('health.shopping.title')}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: MUTED }}>
              {single ? single.title : rangeLabel(bounds.from, bounds.to)}
              {list.mealCount > 0 && ` · ${list.mealCount} ${t('health.shopping.meals')}`}
              {household && household > 1 ? ` · ${household} ${t('health.shopping.for_people')}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('health.plans.cancel')} style={{ flexShrink: 0, height: 28, width: 28, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {/* Plan or week. Only when a plan is open — with no plan in front of
              you there is no choice to make. */}
          {plan && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {(['plan', 'week'] as Scope[]).map(s => (
                <button key={s} type="button" onClick={() => { setScope(s); setWeek(0); }} style={pill(scope === s)}>
                  {t(s === 'plan' ? 'health.shopping.scope_plan' : 'health.shopping.scope_week')}
                </button>
              ))}
            </div>
          )}

          {list.itemCount === 0 && list.missing.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: MUTED }}>
              {single ? t('health.shopping.no_meals') : t('health.shopping.no_meals_week')}
            </div>
          ) : (
            <>
              {/* A plan's own weeks are numbered; a calendar week is a date, and
                  you can walk forward to shop ahead or back to check what you
                  bought. */}
              {single ? planWeeks > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {Array.from({ length: planWeeks }, (_, w) => (
                    <button key={w} type="button" onClick={() => setWeek(w)} style={pill(w === week)}>
                      {t('health.shopping.week_n')} {w + 1}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <button type="button" onClick={() => setWeek(w => w - 1)} style={pill(false)}>← {t('health.shopping.prev_week')}</button>
                  {week !== 0 && (
                    <button type="button" onClick={() => setWeek(0)} style={pill(false)}>{t('health.shopping.back_to_this_week')}</button>
                  )}
                  <button type="button" onClick={() => setWeek(w => w + 1)} style={pill(false)}>{t('health.shopping.next_week')} →</button>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <button type="button" onClick={() => setHideOptional(v => !v)} style={pill(hideOptional)}>
                  {t('health.shopping.hide_optional')}
                </button>
                {got > 0 && (
                  <>
                    <span style={{ fontSize: 11, color: MUTED }}>{got}/{list.itemCount}</span>
                    <button type="button" onClick={reset} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', fontSize: 11, color: MUTED, cursor: 'pointer' }}>
                      {t('health.shopping.reset')}
                    </button>
                  </>
                )}
              </div>

              {/* Short by exactly these, and it says so rather than looking
                  complete. The two reasons need different words: one is worth
                  retrying, the other needs the meal swapped for a real recipe. */}
              {(missingRead.length > 0 || missingCustom.length > 0) && (
                <div style={{ marginBottom: 12, borderRadius: 8, border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)`, background: `color-mix(in srgb, ${AMBER} 8%, transparent)`, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: AMBER }}>{t('health.shopping.incomplete')}</div>
                  {missingRead.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.6, color: MUTED }}>
                      {missingRead.map(m => m.name).join(', ')}
                    </div>
                  )}
                  {missingCustom.length > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.6, color: MUTED }}>
                      {t('health.shopping.not_in_library')}: {missingCustom.map(m => m.name).join(', ')}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.groups.map(group => {
                  const isFolded = folded.has(group.aisle);
                  const groupGot = group.items.filter(i => ticks.has(i.key)).length;
                  return (
                    <div key={group.aisle} style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                      <button type="button" onClick={() => toggleFold(group.aisle)}
                        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: 'none', background: 'rgba(12, 8, 20, 0.4)', padding: '8px 12px', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.12em', color: ACCENT }}>{aisleLabel(group.aisle)}</span>
                        <span style={{ fontSize: 10, color: MUTED }}>{groupGot}/{group.items.length} {isFolded ? '▸' : '▾'}</span>
                      </button>

                      {!isFolded && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {group.items.map(item => {
                            const done = ticks.has(item.key);
                            return (
                              <button key={item.key} type="button" onClick={() => toggleTick(item.key)}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, border: 'none', borderTop: `1px solid ${BORDER}`, background: 'transparent', padding: '8px 12px', cursor: 'pointer', textAlign: 'left', opacity: done ? 0.45 : 1 }}>
                                <span style={{ marginTop: 1, display: 'flex', height: 15, width: 15, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 9, border: `1px solid ${done ? ACCENT : BORDER}`, color: ACCENT }}>{done ? '✓' : ''}</span>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                  <span style={{ display: 'block', fontSize: 12, color: TEXT, textDecoration: done ? 'line-through' : 'none' }}>
                                    {item.name}
                                    {item.optional && <span style={{ marginLeft: 6, fontSize: 10, color: MUTED }}>({t('health.shopping.optional')})</span>}
                                  </span>
                                  <span style={{ display: 'block', marginTop: 1, fontSize: 10, color: MUTED }}>
                                    {amountText(item)}
                                    {/* Why is this on my list? Answered inline. */}
                                    {item.meals.length > 0 && ` — ${item.meals.join(', ')}`}
                                    {item.plans.length > 1 && ` · ${item.plans.join(' + ')}`}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
