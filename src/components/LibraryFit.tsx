// "The library fits you" in the IDE (Health Part 3, 14 Nov 2026) — the mirror
// of the extension's FitBar / FitMark / StarterFitLine. The rules themselves
// live in core (health/library-fit.ts) and are shared by both apps; this file
// is only the IDE's way of drawing them and of asking the engine.
//
// The check runs in the engine on this machine (health_safety_check, the same
// one the plan wizard uses): the profile is read there and only slugs go to
// the server. The website never sees anyone's rules.

import { useCallback, useEffect, useRef, useState } from 'react';
import { tt } from '../lib/i18n';
import { getSidecar, type SidecarEvent } from '../lib/sidecar';
import { loadHealthProfile, type HealthProfile } from '../lib/health-store';
import { profileHasHardRules, type FitState, type FitVerdict, type FitView, type StarterFit } from '@ava/core/health/library-fit';

/** Fired by the Profile tab after a save, so every list re-checks against the new rules. */
export const PROFILE_SAVED_EVENT = 'ava-health-profile-saved';

/** The person's rules, and verdicts for whatever this screen asks about. */
export function useLibraryFit() {
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [state, setState] = useState<FitState>({ results: {}, checked: true });
  const asked = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    const load = () => loadHealthProfile().then((p) => { if (live) setProfile(p); }).catch(() => {});
    void load();
    // Their rules changed: every verdict is stale.
    const onSaved = () => { asked.current.clear(); setState({ results: {}, checked: true }); void load(); };
    window.addEventListener(PROFILE_SAVED_EVENT, onSaved);
    const sc = getSidecar();
    const onEvent = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; results?: Record<string, FitVerdict>; checked?: boolean };
      if (m.event !== 'health_safety_result') return;
      setState((prev) => ({ results: { ...prev.results, ...(m.results ?? {}) }, checked: m.checked !== false }));
    };
    sc.onAny(onEvent);
    return () => { live = false; window.removeEventListener(PROFILE_SAVED_EVENT, onSaved); sc.offAny(onEvent); };
  }, []);

  const rules = profileHasHardRules(profile);

  /** Ask about slugs not yet answered or already asked. */
  const check = useCallback((recipes: string[], exercises: string[]) => {
    const fresh = (xs: string[]) => [...new Set(xs)].filter((x) => !state.results[x] && !asked.current.has(x));
    const r = fresh(recipes), e = fresh(exercises);
    if (!r.length && !e.length) return;
    [...r, ...e].forEach((x) => asked.current.add(x));
    void getSidecar().healthSafetyCheck(r, e);
  }, [state.results]);

  /** Refresh pressed: let the slugs be asked again. */
  const retry = useCallback(() => { asked.current.clear(); }, []);

  return { profile, rules, state, check, retry };
}

const linkBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 500, color: 'var(--accent)' };

/** The line above the Recipes and Exercises grids: what is shown, and the one switch. */
export function FitBar({ rules, fitsOnly, view, onToggle, onProfile }: {
  rules: boolean; fitsOnly: boolean; view: FitView<unknown>; onToggle: () => void; onProfile?: () => void;
}) {
  if (!rules) {
    return (
      <div style={{ marginBottom: 12, fontSize: 11, color: '#6c7086' }}>
        {tt('health.fit.no_rules', 'Tell Ava your allergies, diet, injuries and kit, and this list shows only what fits you.')}{' '}
        {onProfile && <button type="button" onClick={onProfile} style={linkBtn}>{tt('health.fit.set_rules', 'Set them in Profile')}</button>}
      </div>
    );
  }
  if (view.failed) {
    return (
      <div style={{ marginBottom: 12, borderRadius: 6, border: '1px solid rgba(249,226,175,0.45)', background: 'rgba(249,226,175,0.10)', color: '#f9e2af', padding: '8px 12px', fontSize: 11 }}>
        {tt('health.fit.failed', 'Could not check these against your rules just now, so nothing here is marked. Press refresh to try again.')}
      </div>
    );
  }
  const parts: string[] = [];
  if (fitsOnly) {
    parts.push(tt('health.fit.showing_fits', 'Showing what fits your rules.'));
    if (view.hidden > 0) parts.push(tt('health.fit.hidden_n', '{n} on this page don\'t fit.').replace('{n}', String(view.hidden)));
    if (view.pending > 0) parts.push(tt('health.fit.checking_n', 'Checking {n}…').replace('{n}', String(view.pending)));
  } else {
    parts.push(tt('health.fit.showing_all', 'Showing everything. Anything that doesn\'t fit your rules is marked.'));
  }
  return (
    <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', fontSize: 11, color: '#a6adc8' }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: fitsOnly ? '#a6e3a1' : '#6c7086' }} />
      <span>{parts.join(' ')}</span>
      <button type="button" onClick={onToggle} style={linkBtn}>
        {fitsOnly ? tt('health.fit.show_all', 'Show everything') : tt('health.fit.only_fits', 'Only what fits me')}
      </button>
    </div>
  );
}

/** A card's verdict against their rules. Nothing for a plain fit. */
export function FitMark({ fit, floating }: { fit?: FitVerdict; floating?: boolean }) {
  if (!fit || fit.verdict === 'ok') return null;
  const blocked = fit.verdict === 'blocked';
  return (
    <span
      title={fit.reasons.join(' · ')}
      style={{
        ...(floating ? { position: 'absolute', right: 6, top: 6, zIndex: 2 } : { flexShrink: 0 }),
        borderRadius: 999, padding: '2px 6px', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
        background: blocked ? 'rgba(243,139,168,0.92)' : 'rgba(249,226,175,0.92)', color: '#1e1e2e',
      }}
    >
      {blocked ? tt('health.fit.mark_blocked', "Doesn't fit") : tt('health.fit.mark_warn', 'Take care')}
    </span>
  );
}

/** Under a ready-made plan's title: does it fit their rules? */
export function StarterFitLine({ fit }: { fit?: StarterFit }) {
  if (!fit || fit.state === 'pending') return null;
  const look = fit.state === 'fits'
    ? { fg: '#a6e3a1', text: fit.cautions.length ? tt('health.fit.starter_fits_care', 'Fits you · {n} to take care with').replace('{n}', String(fit.cautions.length)) : tt('health.fit.starter_fits', 'Fits you') }
    : fit.state === 'swap'
      ? { fg: '#f38ba8', text: tt('health.fit.starter_swap', 'Needs a swap · {n} not for you').replace('{n}', String(fit.blocked.length)) }
      : { fg: '#6c7086', text: tt('health.fit.starter_unchecked', 'Not checked against your rules') };
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 10, color: look.fg }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: look.fg }} />
      {look.text}
    </span>
  );
}
