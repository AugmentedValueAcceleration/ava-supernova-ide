// The curated shelf — plans somebody made deliberately, ready to start.
//
// Read-only and UNAUTHENTICATED on purpose: a starter is public, and gating it
// behind an account would break the one promise the feature makes — a good week
// on day one, for free. So this deliberately does not go through the platform
// key helper the other calls use.
//
// The copy rules themselves live in @ava/core/health/starters. This module only
// fetches.

import type { CuratedPlanSummary, CuratedPlanDetail } from '@ava/core/health/starters';

const ENDPOINT = 'https://avasupernova.com/api/health/curated-plans';

/** The shelf. The route answers `{ plans: [...] }`; tolerate a bare array too,
 *  because one shape changing should not empty the shelf silently. */
export async function loadCuratedPlans(): Promise<CuratedPlanSummary[]> {
  const res = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json() as { plans?: CuratedPlanSummary[] } | CuratedPlanSummary[] | null;
  return Array.isArray(raw) ? raw : (raw?.plans ?? []);
}

/** One template in full — every day, so nobody starts a plan they have not
 *  seen. That is what makes landing it ACTIVE rather than as a draft fair. */
export async function loadCuratedPlan(id: string): Promise<CuratedPlanDetail> {
  const res = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json() as { plan?: CuratedPlanDetail } | CuratedPlanDetail | null;
  const plan = (raw && typeof raw === 'object' && 'plan' in raw ? raw.plan : raw as CuratedPlanDetail) ?? null;
  if (!plan || !plan.id) throw new Error('Plan not found');
  return plan;
}

/** Tell the platform a start happened. Deliberately silent both ways: a
 *  counter must never be the reason somebody's plan fails to start, and there
 *  is nothing the UI could usefully do about a failure either. */
export async function reportCuratedStart(id: string): Promise<void> {
  try {
    await fetch(`${ENDPOINT}/started`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  } catch { /* the start already happened locally, which is the part that matters */ }
}
