import { Fragment } from 'react';
import type React from 'react';
import { t } from '../lib/i18n';

// Cooking-time grid — how long the user has to cook, per day AND per meal type
// (Breakfast/Lunch/Dinner), each defaulting to "Any". A 7-day grid: rows = days,
// columns = meals. The per-slot data Ava needs to slot the right recipe into
// each real meal — a quick weekday breakfast, a longer weekend dinner. Shared by
// the profile page and the Health-room fill card so the two stay identical.

const COOK_TIERS = [
  { v: '', k: 'health.profile.cooking_any' },
  { v: '15', k: 'health.profile.cooking_15' },
  { v: '30', k: 'health.profile.cooking_30' },
  { v: '60', k: 'health.profile.cooking_60' },
  { v: '60+', k: 'health.profile.cooking_60plus' },
];
const COOK_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon→Sun, via health.plans.weekday.N
export type MealKey = 'breakfast' | 'lunch' | 'dinner';
const COOK_MEALS: { m: MealKey; k: string }[] = [
  { m: 'breakfast', k: 'health.profile.breakfast' },
  { m: 'lunch', k: 'health.profile.lunch' },
  { m: 'dinner', k: 'health.profile.dinner' },
];

export type MealCook = { breakfast: string | null; lunch: string | null; dinner: string | null };
export type CookTime = { by_day: Record<string, MealCook> };

const cellStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '7px 10px', fontSize: 12,
  background: 'rgba(12, 8, 20, 0.5)', color: '#cdd6f4',
  border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', borderRadius: 6, outline: 'none',
  colorScheme: 'dark',
};

/** The bare 7×3 grid (no title/hint). value keyed '0'–'6' (Sun–Sat). */
export function CookingTimeGrid({ value, onChange }: { value: CookTime | undefined; onChange: (v: CookTime) => void }) {
  const cook: CookTime = value ?? { by_day: {} };
  const cellVal = (d: number, meal: MealKey) => cook.by_day[String(d)]?.[meal] ?? '';
  const setCell = (d: number, meal: MealKey, v: string) => {
    const by = { ...cook.by_day };
    const prev: MealCook = by[String(d)] ?? { breakfast: null, lunch: null, dinner: null };
    const day: MealCook = { ...prev, [meal]: v || null };
    if (!day.breakfast && !day.lunch && !day.dinner) delete by[String(d)];
    else by[String(d)] = day;
    onChange({ by_day: by });
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(3, minmax(0, 1fr))', gap: '6px 8px', alignItems: 'center' }}>
      <div />
      {COOK_MEALS.map(m => <div key={m.m} style={{ fontSize: 11, color: '#6c7086', textAlign: 'center' }}>{t(m.k)}</div>)}
      {COOK_DAYS.map(d => (
        <Fragment key={d}>
          <div style={{ fontSize: 12, color: '#bac2de', paddingRight: 8 }}>{t(`health.plans.weekday.${d}`)}</div>
          {COOK_MEALS.map(m => (
            <select key={m.m} style={cellStyle} value={cellVal(d, m.m)} onChange={e => setCell(d, m.m, e.target.value)}>
              {COOK_TIERS.map(o => <option key={o.v} value={o.v} style={{ background: '#1e1529' }}>{t(o.k)}</option>)}
            </select>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
