// Onboarding — rebuilt key-first (BYOK plan, agreed 1 Nov 2026). The same four
// screens as the extension's WelcomeOnboarding, in the IDE's idiom:
//
// Welcome (what Ava is + consent) → Your key (tested before it is saved) →
// About you (name + what brings you here) → Ready (one first thing to try).
// Ava has no accounts, so a working key is the only way in, and this is where
// it is set up. `mode: 'key'` shows only the key screen — for people who used
// Ava before this existed and have no key yet.
//
// The feature tour, work hours and the desktop intro moved out (tips as you go,
// Settings, the first time that mode opens). Paths: ../onboarding/flow (shared
// with the extension). Copy: onboarding.* / onb.* in core i18n.

import { useState, useEffect, useCallback } from 'react';
import { t, useLocale, getLocale, languageOptions, setLanguage } from '../lib/i18n';
import { Select } from './Select';
import { PATHS, pathById, type Destination, type OnboardingPath } from '../onboarding/flow';
import { getProviderKeys, testAndSaveProviderKey, type ProviderField } from '../lib/provider-keys';
import type { KeyTestResult } from '../lib/oneshot';
import { loadGeneralProfile, saveGeneralProfile } from '../lib/health-store';

export type OnboardingMode = 'full' | 'key';

interface Props {
  mode: OnboardingMode;
  /** Done or skipped. `navigateTo` is a dashboard page id. */
  onComplete: (navigateTo?: string) => void;
}

/** Set once the new onboarding has been seen (finished or skipped). */
export const ONBOARDED_KEY = 'ava-ide-onboarded-v2';
const CONSENT_KEY = 'ava-ide-consent-accepted';

type Step = 'welcome' | 'key' | 'about' | 'ready';
const ACCENT = 'var(--accent)';

const DEST_PAGE: Record<Destination, string> = {
  chat: 'ava-chat', journal: 'journal', learning: 'learning', health: 'health', home: 'command-centre',
};

/**
 * Where each provider hands out keys. Every link was checked against the
 * provider's own docs on 1 Nov 2026 (international sites; all need a login).
 * Same list as the extension.
 */
const QWEN_KEY_URL = 'https://modelstudio.console.alibabacloud.com/ap-southeast-1/settings/api-key';
const OTHER_PROVIDERS: { field: ProviderField; id: string; name: string; url: string; note: string }[] = [
  { field: 'DeepSeek', id: 'deepseek', name: 'DeepSeek', url: 'https://platform.deepseek.com/api_keys', note: 'Coding and reasoning — Supernova runs on it.' },
  { field: 'Mistral', id: 'mistral', name: 'Mistral', url: 'https://console.mistral.ai/api-keys', note: 'European models — Aurora runs on them.' },
  { field: 'Moonshot', id: 'kimi', name: 'Kimi (Moonshot)', url: 'https://platform.kimi.ai/console/api-keys', note: 'Long context — Longxiang runs on it.' },
  { field: 'Zhipu', id: 'glm', name: 'GLM (Z.ai)', url: 'https://z.ai/manage-apikey/apikey-list', note: 'Open-weights coding models.' },
  { field: 'Tencent', id: 'tencent', name: 'Tencent TokenHub (Hunyuan)', url: 'https://console.tencentcloud.com/tokenhub/apikey', note: 'Pick the Singapore region before creating the key.' },
  { field: 'NVIDIA', id: 'nvidia', name: 'NVIDIA', url: 'https://build.nvidia.com/settings/api-keys', note: 'Keys start with nvapi-.' },
  { field: 'MiniMax', id: 'minimax', name: 'MiniMax', url: 'https://platform.minimax.io/console/keys', note: 'MiniMax M3 — reads images too, 1M context.' },
  { field: 'Xiaomi', id: 'xiaomi', name: 'Xiaomi MiMo', url: 'https://platform.xiaomimimo.com/#/console/api-keys', note: 'Use a pay-as-you-go key (sk-), not a Token Plan key.' },
];
const BRAVE_URL = 'https://api-dashboard.search.brave.com/app/keys';

/** A key that can run a model — Brave is search, not chat. */
export function hasModelKey(): boolean {
  return Object.entries(getProviderKeys()).some(([field, v]) => field !== 'Brave' && !!v?.trim());
}

async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

// House button — the chat "New Chat" pill: translucent accent, accent border + text.
function btnStyle(disabled?: boolean): React.CSSProperties {
  return {
    padding: '8px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
    background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', color: ACCENT,
    opacity: disabled ? 0.4 : 1, transition: 'background 0.15s', flexShrink: 0,
  };
}
const btnHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 20%, transparent)'; },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)'; },
};
const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 36, background: 'rgba(49, 34, 68, 0.5)', border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
  borderRadius: 8, padding: '0 12px', fontSize: 13, color: '#cdd6f4', outline: 'none',
};
const card: React.CSSProperties = { borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', padding: 16 };

export default function WelcomeOverlay({ mode, onComplete }: Props) {
  useLocale();
  const steps: Step[] = mode === 'key' ? ['key'] : ['welcome', 'key', 'about', 'ready'];
  const alreadyAccepted = (() => { try { return !!localStorage.getItem(CONSENT_KEY); } catch { return false; } })();
  const [idx, setIdx] = useState(0);
  const [agreed, setAgreed] = useState(alreadyAccepted);
  const [name, setName] = useState(() => { try { return localStorage.getItem('ava-ide-user-name') || ''; } catch { return ''; } });
  const [pathId, setPathId] = useState<string | null>(null);
  // Re-render when a key lands, so Next unlocks.
  const [, setKeysTick] = useState(0);
  useEffect(() => {
    const refresh = () => setKeysTick((n) => n + 1);
    window.addEventListener('ava-byok-changed', refresh);
    return () => window.removeEventListener('ava-byok-changed', refresh);
  }, []);
  const step = steps[idx];
  const path = pathId ? pathById(pathId) : undefined;

  const finish = useCallback((navigateTo?: string) => {
    try { localStorage.setItem(ONBOARDED_KEY, new Date().toISOString()); } catch { /* non-fatal */ }
    const p = pathId ? pathById(pathId) : undefined;
    if (p) {
      // The chat reads ava-ide-chat-mode; the canonical mode id goes there.
      try {
        localStorage.setItem('ava-ide-chat-mode', p.recommendedMode);
        window.dispatchEvent(new CustomEvent('ava-mode-changed'));
      } catch { /* non-fatal */ }
    }
    onComplete(navigateTo);
  }, [onComplete, pathId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && step !== 'welcome') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, step]);

  /** The name lives in two places the IDE reads: the greeting / sidecar
   *  (localStorage) and the general profile on disk (shared with the extension). */
  const saveName = async (value: string) => {
    const v = value.trim();
    try {
      if (v) localStorage.setItem('ava-ide-user-name', v);
      else localStorage.removeItem('ava-ide-user-name');
      window.dispatchEvent(new CustomEvent('ava-ide-name-changed'));
    } catch { /* non-fatal */ }
    try {
      const g = await loadGeneralProfile();
      if ((g.display_name ?? '') !== v) await saveGeneralProfile({ ...g, display_name: v || null });
    } catch { /* the greeting still has it */ }
  };

  const next = () => {
    if (step === 'welcome' && agreed && !alreadyAccepted) {
      try { localStorage.setItem(CONSENT_KEY, new Date().toISOString()); } catch { /* non-fatal */ }
    }
    if (step === 'about') void saveName(name);
    if (idx === steps.length - 1) { finish(); return; }
    setIdx((i) => i + 1);
  };
  const back = () => setIdx((i) => Math.max(i - 1, 0));
  const canNext = step === 'welcome' ? agreed : step === 'key' ? hasModelKey() : true;
  const launch = () => finish(path ? DEST_PAGE[path.destination] : undefined);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} role="dialog" aria-modal="true">
      <div style={{
        width: 'min(980px, 94vw)', height: 'min(760px, 92vh)', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(160deg, #1a1020 0%, #120c1a 100%)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
        borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', overflow: 'hidden',
      }}>
        {/* Top bar: progress, language, skip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {steps.length > 1 && steps.map((s, i) => (
            <span key={s} style={{ height: 5, width: i === idx ? 28 : 8, borderRadius: 999, background: i <= idx ? ACCENT : 'rgba(255,255,255,0.15)', transition: 'all 0.2s' }} />
          ))}
          <div style={{ flex: 1 }} />
          {/* Language first, so everything after is in the user's language. The
              sidecar isn't running yet, so setLanguage (persist + UI) is enough;
              boot reads the stored value. */}
          <Select value={getLocale()} onChange={(v) => setLanguage(v)} options={languageOptions()} size="sm" title={t('dash.settings.language')} menuZIndex={10001} />
          {step !== 'welcome' && (
            <button onClick={() => finish()} style={{ background: 'none', border: 'none', color: '#6c7086', fontSize: 12, cursor: 'pointer' }}>
              {step === 'key' ? t('onb.key.later') : t('onboarding.skip')}
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', minHeight: 0 }}>
          {step === 'welcome' && <WelcomeStep agreed={agreed} onAgree={setAgreed} alreadyAccepted={alreadyAccepted} />}
          {step === 'key' && <KeyStep onLocalModel={() => finish('settings')} />}
          {step === 'about' && <AboutStep name={name} onName={setName} selected={pathId} onPick={(p) => setPathId(p.id)} />}
          {step === 'ready' && <ReadyStep path={path} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {steps.length > 1 && (
            <button onClick={back} disabled={idx === 0} style={btnStyle(idx === 0)} {...btnHover}>{t('onboarding.back')}</button>
          )}
          <div style={{ flex: 1 }} />
          {step === 'ready' ? (
            <button onClick={launch} style={btnStyle()} {...btnHover}>{t('onboarding.ready.go')}</button>
          ) : (
            <button onClick={next} disabled={!canNext} style={btnStyle(!canNext)} {...btnHover}>
              {mode === 'key' ? t('onb.done') : t('onboarding.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 1. Welcome ───────────────────────────────────────────────────────────────

function WelcomeStep({ agreed, onAgree, alreadyAccepted }: { agreed: boolean; onAgree: (v: boolean) => void; alreadyAccepted: boolean }) {
  const link: React.CSSProperties = { textDecoration: 'underline', cursor: 'pointer', color: '#cdd6f4' };
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ width: 96, height: 96, borderRadius: '50%', marginBottom: 24, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, background: 'linear-gradient(135deg, var(--accent), #6366f1)', border: '1px solid color-mix(in srgb, var(--accent) 33%, transparent)' }}>
        <img src="/ava-avatar.jpeg" alt="Ava" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      </div>
      <h1 style={{ fontSize: 34, fontWeight: 600, color: '#cdd6f4', marginBottom: 16 }}>{t('onboarding.identity.title')}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: '#a6adc8', marginBottom: 8 }}>{t('onboarding.identity.body')}</p>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: '#6c7086', marginBottom: 32 }}>{t('onb.welcome.tagline')}</p>
      {!alreadyAccepted && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#a6adc8', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => onAgree(e.target.checked)} />
          <span>
            {t('onb.welcome.agree')}{' '}
            <a style={link} onClick={(e) => { e.preventDefault(); void openExternal('https://avasupernova.com/terms'); }}>{t('dash.support.terms')}</a>
            {' '}{t('onb.welcome.and')}{' '}
            <a style={link} onClick={(e) => { e.preventDefault(); void openExternal('https://avasupernova.com/privacy'); }}>{t('dash.support.privacy')}</a>
          </span>
        </label>
      )}
    </div>
  );
}

// ── 2. Your key ──────────────────────────────────────────────────────────────

/** One paste box: Test & save, then the verdict in plain words. */
function KeyBox({ field, placeholder }: { field: ProviderField; placeholder: string }) {
  useLocale();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<KeyTestResult | null>(null);
  const saved = !!getProviderKeys()[field];

  const test = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const r = await testAndSaveProviderKey(field, value);
      setResult(r);
      if (r.status !== 'invalid') setValue('');
    } catch (err) {
      setResult({ status: 'invalid', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const colour = result?.status === 'invalid' ? '#f38ba8' : result?.status === 'unverified' ? '#f9e2af' : '#a6e3a1';
  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); if (result) setResult(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') void test(); }}
          placeholder={saved ? t('onb.key.saved_placeholder') : placeholder}
          style={inputStyle}
          autoComplete="off"
          spellCheck={false}
        />
        <button onClick={() => { void test(); }} disabled={!value.trim() || busy} style={btnStyle(!value.trim() || busy)} {...btnHover}>
          {busy ? t('onb.key.testing') : t('onb.key.test')}
        </button>
      </div>
      {(result || saved) && (
        <p style={{ marginTop: 6, fontSize: 12, color: colour }}>
          {result && result.status !== 'valid' ? result.message : t('onb.key.works')}
        </p>
      )}
    </div>
  );
}

function LinkButton({ url, label }: { url: string; label: string }) {
  return (
    <button onClick={() => { void openExternal(url); }} style={{ flexShrink: 0, fontSize: 12, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      {label} ↗
    </button>
  );
}

function KeyStep({ onLocalModel }: { onLocalModel: () => void }) {
  const [showOthers, setShowOthers] = useState(false);
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>{t('onb.key.title')}</h2>
      <p style={{ fontSize: 13, color: '#6c7086', marginBottom: 24 }}>{t('onb.key.subtitle_ide')}</p>

      {/* Qwen first: one key covers chat, images, voice and video. */}
      <div style={{ ...card, borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>Qwen (Alibaba Model Studio)</span>
            <span style={{ borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: ACCENT, background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>{t('onb.key.recommended')}</span>
          </div>
          <LinkButton url={QWEN_KEY_URL} label={t('onb.key.get_qwen')} />
        </div>
        <p style={{ fontSize: 12, color: '#a6adc8', marginBottom: 12 }}>{t('onb.key.qwen_desc')}</p>
        <KeyBox field="Qwen" placeholder="sk-…" />
        <p style={{ marginTop: 8, fontSize: 11, color: '#6c7086' }}>{t('onb.key.singapore')}</p>
      </div>

      {/* Every other provider, each with its own key page. */}
      <button onClick={() => setShowOthers((v) => !v)} style={{ fontSize: 12, color: '#a6adc8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        {showOthers ? '▾' : '▸'} {t('onb.key.others')}
      </button>
      {showOthers && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {OTHER_PROVIDERS.map((p) => (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>{p.name}</span>
                <LinkButton url={p.url} label={t('onb.key.get')} />
              </div>
              <p style={{ fontSize: 11, color: '#6c7086', marginBottom: 8 }}>{t(`onb.key.note.${p.id}`)}</p>
              <KeyBox field={p.field} placeholder={t('onb.key.paste')} />
            </div>
          ))}
          <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>{t('onb.key.local')}</span>
              <p style={{ fontSize: 11, color: '#6c7086', margin: '2px 0 0' }}>{t('onb.key.local_desc')}</p>
            </div>
            <button onClick={onLocalModel} style={btnStyle()} {...btnHover}>{t('onb.key.local_cta')}</button>
          </div>
        </div>
      )}

      {/* Web search: optional. DuckDuckGo works without any key. */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4' }}>Brave Search <span style={{ fontSize: 11, fontWeight: 400, color: '#6c7086' }}>· {t('onb.key.optional')}</span></span>
          <LinkButton url={BRAVE_URL} label={t('onb.key.get')} />
        </div>
        <p style={{ fontSize: 11, color: '#6c7086', marginBottom: 8 }}>{t('onb.key.brave_desc')}</p>
        <KeyBox field="Brave" placeholder={t('onb.key.paste')} />
      </div>
    </div>
  );
}

// ── 3. About you ─────────────────────────────────────────────────────────────

function AboutStep({ name, onName, selected, onPick }: { name: string; onName: (v: string) => void; selected: string | null; onPick: (p: OnboardingPath) => void }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, color: '#cdd6f4', textAlign: 'center', marginBottom: 4 }}>{t('onb.about.title')}</h2>
      <p style={{ fontSize: 13, color: '#6c7086', textAlign: 'center', marginBottom: 20 }}>{t('onb.about.subtitle')}</p>
      <label style={{ display: 'block', maxWidth: 360, margin: '0 auto 32px' }}>
        <span style={{ display: 'block', fontSize: 12, color: '#a6adc8', marginBottom: 6 }}>{t('onb.about.name')}</span>
        <input value={name} onChange={(e) => onName(e.target.value)} maxLength={40}
          placeholder={t('general.profile.display_name_placeholder')} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
      </label>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#cdd6f4', textAlign: 'center', marginBottom: 12 }}>{t('onboarding.path.title')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {PATHS.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} style={{
            textAlign: 'left', padding: 16, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12,
            background: selected === p.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent', border: `1px solid ${selected === p.id ? ACCENT : 'rgba(255,255,255,0.1)'}`,
          }}>
            <span style={{ fontSize: 26 }}>{p.icon}</span>
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#cdd6f4', marginBottom: 2 }}>{t(p.labelKey)}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#6c7086', lineHeight: 1.5 }}>{t(p.blurbKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 4. Ready ─────────────────────────────────────────────────────────────────

function ReadyStep({ path }: { path: OnboardingPath | undefined }) {
  // One suggested first thing for their path — the first of its examples.
  const first = path?.tailoredKeys[0];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🚀</div>
      <h2 style={{ fontSize: 28, fontWeight: 600, color: '#cdd6f4', marginBottom: 12 }}>{t('onboarding.ready.title')}</h2>
      {first ? (
        <>
          <p style={{ fontSize: 13, color: '#a6adc8', marginBottom: 16 }}>{t('onb.ready.try')}</p>
          <code style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: ACCENT }}>{t(`${first}.example`)}</code>
        </>
      ) : (
        <p style={{ fontSize: 13, color: '#a6adc8' }}>{t('onb.ready.any')}</p>
      )}
    </div>
  );
}
