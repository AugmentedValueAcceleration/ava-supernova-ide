// "For you" on the command centre's Health tab (Health Part 4, 14 Nov 2026) —
// the mirror of the extension's ForYou.tsx. The picks are chosen by core's
// buildForYou in the engine (the sidecar), on this computer; only library
// slugs leave it. This file draws them and makes "Add to today" / "Swap it in".

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { tt, useLocale } from '../lib/i18n';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { loadHealthProfile } from '../lib/health-store';
import { loadHealthPlanIndex, loadHealthPlan, saveHealthPlan, type HealthPlan } from '../lib/health-plans-store';
import { applyForYouAction, type ForYouAction } from '@ava/core/health/for-you-plan';
import type { ForYouResult, ForYouPick, ForYouExtra } from '@ava/core/health/for-you';
import { ForYouPreview } from './ForYouPreview';

export interface ForYouHandlers {
  onOpenItem: (kind: 'recipe' | 'exercise', slug: string) => void;
  onStartPlan: (seed: { kind: 'recipe' | 'exercise'; slug: string; name: string; course?: string | null }) => void;
  onProfile: () => void;
  onOpenPlans: () => void;
}

const border = '1px solid color-mix(in srgb, var(--accent) 14%, transparent)';
const cardS: CSSProperties = { border, borderRadius: 8, overflow: 'hidden', background: 'rgba(26,16,40,0.45)', display: 'flex', flexDirection: 'column' };
const ghost: CSSProperties = { flex: 1, minHeight: 30, borderRadius: 6, border, background: 'transparent', color: '#cdd6f4', fontSize: 11, cursor: 'pointer', padding: '0 8px' };
const solid: CSSProperties = { flex: 1, minHeight: 30, borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '0 8px' };
const kickerS = (c: string): CSSProperties => ({ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.6, color: c });
const linkS: CSSProperties = { background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontSize: 11, color: 'var(--accent)' };

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function activePlans(): Promise<HealthPlan[]> {
  const index = await loadHealthPlanIndex();
  const actives = index.filter((p) => p.status === 'active' && p.start_date);
  return (await Promise.all(actives.map((s) => loadHealthPlan(s.id)))).filter(Boolean) as HealthPlan[];
}

function Spinner({ size }: { size: number }) {
  return (
    <span aria-hidden style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', border: '2px solid color-mix(in srgb, var(--accent) 25%, transparent)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

function PickCard({ pick, set, h }: { pick: ForYouPick; set: boolean; h: ForYouHandlers }) {
  return (
    <div style={cardS}>
      <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,6,18,0.6)', overflow: 'hidden' }}>
        {pick.image ? <img src={pick.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <span aria-hidden style={{ opacity: 0.3, fontSize: 20 }}>{pick.kind === 'recipe' ? '🍽' : '🏋'}</span>}
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {pick.kicker && <span style={kickerS(pick.kind === 'recipe' ? '#fbbf24' : '#89b4fa')}>{pick.kicker}</span>}
        <span style={{ fontSize: 13, color: '#cdd6f4' }}>{pick.name}</span>
        {pick.why && <span style={{ fontSize: 11, color: set ? '#a6e3a1' : '#a6adc8' }}>{pick.why}</span>}
      </div>
      {set ? (
        <div style={{ display: 'flex', gap: 6, padding: '0 12px 12px' }}>
          <button type="button" style={ghost} onClick={() => h.onOpenItem(pick.kind, pick.slug)}>{pick.kind === 'recipe' ? tt('health.foryou.make', 'Make this') : tt('health.foryou.how', 'How to do it')}</button>
          <button type="button" style={solid} onClick={() => h.onStartPlan({ kind: pick.kind, slug: pick.slug, name: pick.name, course: pick.course })}>{tt('health.foryou.start_plan', 'Start a plan with it')}</button>
        </div>
      ) : (
        <button type="button" style={{ ...linkS, margin: '0 12px 12px' }} onClick={() => h.onOpenItem(pick.kind, pick.slug)}>
          {pick.kind === 'recipe' ? tt('health.foryou.see_recipe', 'See the recipe') : tt('health.foryou.see_exercise', 'See the exercise')}
        </button>
      )}
    </div>
  );
}

function Thumb({ src, kind, size }: { src?: string | null; kind: 'recipe' | 'exercise'; size?: number }) {
  const box: CSSProperties = size
    ? { width: size, height: size, flexShrink: 0, borderRadius: 6 }
    : { width: '100%', height: 84 };
  return (
    <div style={{ ...box, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,6,18,0.6)' }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <span aria-hidden style={{ opacity: 0.3, fontSize: 18 }}>{kind === 'recipe' ? '🍽' : '🏋'}</span>}
    </div>
  );
}

function ExtraCard({ x, busy, onDo, h }: { x: ForYouExtra; busy: boolean; onDo: (a: ForYouAction) => void; h: ForYouHandlers }) {
  return (
    <div style={cardS}>
      <button type="button" onClick={() => h.onOpenItem(x.kind, x.slug)} style={{ ...linkS, display: 'block' }}><Thumb src={x.image} kind={x.kind} /></button>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {x.kicker && <span style={kickerS(x.kind === 'recipe' ? '#fbbf24' : '#89b4fa')}>{x.kicker}</span>}
        <button type="button" onClick={() => h.onOpenItem(x.kind, x.slug)} style={{ ...linkS, fontSize: 13, color: '#cdd6f4' }}>{x.name}</button>
        <span style={{ fontSize: 11, color: '#a6e3a1' }}>{x.why}</span>
        <button type="button" disabled={busy} style={{ ...ghost, flex: 'none', alignSelf: 'flex-start', marginTop: 4, opacity: busy ? 0.5 : 1 }} onClick={() => onDo(x.action)}>
          {x.action.type === 'swap_meal' ? tt('health.foryou.swap_in', 'Swap it in') : tt('health.foryou.add_today', 'Add to today')}
        </button>
      </div>
    </div>
  );
}

export function ForYou({ h }: { h: ForYouHandlers }) {
  useLocale();
  const [result, setResult] = useState<ForYouResult | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  /** The suggestion being looked at before anything changes. */
  const [preview, setPreview] = useState<ForYouExtra | null>(null);

  const build = useCallback(async () => {
    try {
      const [profile, plans] = await Promise.all([loadHealthProfile().catch(() => null), activePlans().catch(() => [] as HealthPlan[])]);
      await getSidecar().healthForYou(profile, plans, todayYmd());
    } catch { setResult(null); }
  }, []);

  useEffect(() => {
    const sc = getSidecar();
    const onEvent = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; result?: ForYouResult | null };
      if (m.event !== 'health_for_you_result') return;
      setResult(m.result ?? null);
      setBusy(null);
    };
    sc.onAny(onEvent);
    void build();
    return () => sc.offAny(onEvent);
  }, [build]);

  const apply = async (a: ForYouAction) => {
    setPreview(null);
    setBusy(a.name);
    try {
      const plan = await loadHealthPlan(a.planId);
      if (plan) await saveHealthPlan(applyForYouAction(plan, a));
    } finally { await build(); }
  };

  if (result === undefined) {
    return (
      <section role="status" style={{ height: 230, borderRadius: 12, border, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Spinner size={24} />
        <span style={{ fontSize: 12, color: '#a6adc8' }}>{tt('health.foryou.loading', 'Finding picks for you…')}</span>
      </section>
    );
  }
  if (result === null) return null;

  const head = (title: string, hint: string) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#cdd6f4' }}>{title}</h2>
      <span style={{ fontSize: 11, color: '#a6adc8' }}>{hint}</span>
    </div>
  );
  const box: CSSProperties = { border, borderRadius: 12, padding: 20 };

  if (!result.checked) {
    return (
      <section style={box}>
        {head(tt('health.foryou.title', 'For you'), '')}
        <p style={{ margin: 0, fontSize: 12, color: '#f9e2af' }}>{tt('health.foryou.unchecked', 'Your picks could not be checked against your rules just now, so none are shown. They will be back when the library can be reached.')}</p>
      </section>
    );
  }

  if (result.state === 'running') {
    return (
      <section style={box}>
        {head(tt('health.foryou.title_today', 'For you today'), result.planTitle ? tt('health.foryou.from_plan', 'From your plan: {title}').replace('{title}', result.planTitle) : '')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
          {result.session && (
            <div style={{ ...cardS, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              <Thumb src={result.session.image} kind="exercise" size={64} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={kickerS('#89b4fa')}>{tt('health.foryou.session', "Today's session")}</div>
                <div style={{ fontSize: 13, color: '#cdd6f4' }}>{result.session.title ?? tt('health.foryou.training', 'Training')} · {tt('health.foryou.n_exercises', '{n} exercises').replace('{n}', String(result.session.count))}</div>
                {result.session.first && <div style={{ fontSize: 11, color: '#a6adc8' }}>{tt('health.foryou.first', '{name} first').replace('{name}', result.session.first)}</div>}
              </div>
              <button type="button" style={{ ...solid, flex: 'none', padding: '0 12px' }} onClick={h.onOpenPlans}>{tt('health.foryou.open', 'Open')}</button>
            </div>
          )}
          {result.dinner && (
            <div style={{ ...cardS, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              <Thumb src={result.dinner.image} kind="recipe" size={64} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={kickerS('#fbbf24')}>{tt('health.foryou.dinner', "Tonight's dinner")}</div>
                <div style={{ fontSize: 13, color: '#cdd6f4' }}>{result.dinner.name}</div>
                {result.dinner.why && <div style={{ fontSize: 11, color: '#a6adc8' }}>{result.dinner.why}</div>}
              </div>
              {result.dinner.slug && <button type="button" style={{ ...solid, flex: 'none', padding: '0 12px' }} onClick={() => h.onOpenItem('recipe', result.dinner!.slug!)}>{tt('health.foryou.make', 'Make this')}</button>}
            </div>
          )}
        </div>
        {result.extras.length > 0 && (
          <>
            <div style={{ margin: '16px 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4, color: '#a6adc8' }}>{tt('health.foryou.goes_with', 'Goes with today')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
              {result.extras.map((x) => <ExtraCard key={`${x.action.type}:${x.slug}`} x={x} busy={!!busy} onDo={() => setPreview(x)} h={h} />)}
            </div>
          </>
        )}
        {preview && <ForYouPreview x={preview} result={result} onConfirm={(a) => void apply(a)} onClose={() => setPreview(null)} />}
        {busy && <p role="status" style={{ margin: '12px 0 0', fontSize: 11, color: '#a6adc8', display: 'flex', alignItems: 'center', gap: 8 }}><Spinner size={12} />{tt('health.foryou.saving', 'Adding {name} to your plan…').replace('{name}', busy)}</p>}
      </section>
    );
  }

  const set = result.state === 'profile';
  return (
    <section style={box}>
      {head(tt('health.foryou.title', 'For you'), set ? tt('health.foryou.hint_set', 'Fits your rules · new picks each day') : tt('health.foryou.hint_taste', 'A taste of the library'))}
      {result.picks.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          {result.picks.map((p) => <PickCard key={`${p.kind}:${p.slug}`} pick={p} set={set} h={h} />)}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: '#a6adc8' }}>{tt('health.foryou.none', 'Nothing in today’s picks fits your rules. Try again tomorrow, or browse the library.')}</p>
      )}
      {set ? (
        <p style={{ margin: '12px 0 0', fontSize: 11, color: '#a6adc8' }}>{tt('health.foryou.privacy', 'Picked from the library on this computer, checked against your allergies, diet, injuries and kit.')}</p>
      ) : (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: border, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <p style={{ margin: 0, flex: 1, fontSize: 13, color: '#cdd6f4' }}>{tt('health.foryou.invite', 'Tell Ava what you eat and how you train, and these become yours.')}</p>
          <button type="button" style={{ ...solid, flex: 'none', padding: '0 16px', minHeight: 36 }} onClick={h.onProfile}>{tt('health.foryou.set_up', 'Set up your profile')}</button>
        </div>
      )}
    </section>
  );
}
