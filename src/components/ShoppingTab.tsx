// The IDE's Shopping tab: loads what ShoppingPage needs from ~/.ava (plans,
// profile, shopping.json) and the recipe library, then draws the same page
// the extension does. In the extension App holds this state; here the tab
// owns it, the way HealthPlansPage owns its plans.

import { useCallback, useEffect, useState } from 'react';
import { ShoppingPage } from './ShoppingPage';
import { loadHealthPlan, loadHealthPlanIndex, type HealthPlan } from '../lib/health-plans-store';
import { loadHealthProfile, loadShoppingState, saveShoppingState, type HealthProfile, type ShoppingState } from '../lib/health-store';
import { loadRecipeDetail, type HealthRecipeDetail } from '../lib/health-catalog';

export function ShoppingTab({ initialPlanId }: { initialPlanId: string | null }) {
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [shopping, setShopping] = useState<ShoppingState | null>(null);
  const [recipeDetails, setRecipeDetails] = useState<Record<string, HealthRecipeDetail | undefined>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      const index = await loadHealthPlanIndex().catch(() => []);
      const full = await Promise.all(index.filter((p) => p.status !== 'archived').map((p) => loadHealthPlan(p.id).catch(() => null)));
      if (live) setPlans(full.filter((p): p is HealthPlan => !!p));
    })();
    loadHealthProfile().then((p) => { if (live) setProfile(p); }).catch(() => {});
    loadShoppingState().then((s) => { if (live) setShopping(s); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const onLoadRecipeDetail = useCallback((slug: string) => {
    loadRecipeDetail(slug).then((d) => { if (d) setRecipeDetails((prev) => ({ ...prev, [slug]: d })); }).catch(() => {});
  }, []);

  const onSaveShopping = useCallback((next: ShoppingState) => {
    setShopping(next);
    void saveShoppingState(next).catch(() => {});
  }, []);

  const onOpenUrl = useCallback(async (url: string) => {
    try { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url); } catch { /* opener unavailable */ }
  }, []);

  return (
    <ShoppingPage
      plans={plans}
      profile={profile}
      recipeDetails={recipeDetails}
      onLoadRecipeDetail={onLoadRecipeDetail}
      initialPlanId={initialPlanId}
      shopping={shopping}
      onSaveShopping={onSaveShopping}
      onOpenUrl={onOpenUrl}
    />
  );
}
