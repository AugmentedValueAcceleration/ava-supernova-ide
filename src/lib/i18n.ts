/**
 * IDE i18n — English bundled, every other language loaded ON DEMAND.
 *
 * ── Why this changed ──
 *
 * This file used to say "ALL locales loaded statically. No dynamic imports —
 * guarantees instant switching." Twenty locale files is 4,907KB of a 10,022KB
 * bundle — 42% of it — fetched and parsed before the IDE painted anything, so
 * that nineteen languages nobody is reading could switch without a await. That
 * is a very expensive guarantee.
 *
 * ── Why the IDE can do this and the extension could not ──
 *
 * The extension's dashboard hit a wall here and had to have the HOST read the
 * files and post them over (see its i18n.ts). Two blockers: a nonce CSP with no
 * 'strict-dynamic', and Vite's relative specifier resolving against the webview
 * document rather than the bundle.
 *
 * Neither applies to Tauri. The CSP in src-tauri/tauri.conf.json is
 * `script-src 'self'` with NO nonce, and the app is served from a normal origin,
 * so a dynamic import just works. Nothing to arrange.
 *
 * ── The trap this introduces, which bit the extension ──
 *
 * `currentLocale = translations[resolved] ? resolved : 'en'` was true for all
 * twenty while all twenty were bundled. Left as it was, with only English
 * loaded, it would pin EVERY user to English — the same bug, reintroduced by
 * its own fix. Gate on what CAN be loaded (LOADERS), never on what IS loaded.
 *
 * Strings resolve to English for the frame or two before the real locale lands,
 * then 'ava-locale-changed' re-renders. English is every locale's fallback in
 * t() anyway, so there is never a frame with no strings at all.
 */
import { useState, useEffect } from 'react';

// English is bundled: it is the fallback for every other locale, and the one
// language we must be able to render before any await resolves.
// @ts-ignore
import { enStrings } from '../../../core/dist/i18n/locales/en.js';

/**
 * The nineteen others, as loaders. Vite turns each of these into its own chunk.
 *
 * Written out one by one rather than built from a template string: Vite can
 * only code-split an import() whose specifier it can see statically, and
 * `import(`../../../core/dist/i18n/locales/${code}.js`)` makes it bundle the
 * whole directory again — which is exactly what this change exists to stop.
 */
const LOADERS: Record<string, () => Promise<Record<string, string>>> = {
  ar: () => import('../../../core/dist/i18n/locales/ar.js').then((m: any) => m.arStrings),
  de: () => import('../../../core/dist/i18n/locales/de.js').then((m: any) => m.deStrings),
  es: () => import('../../../core/dist/i18n/locales/es.js').then((m: any) => m.esStrings),
  fr: () => import('../../../core/dist/i18n/locales/fr.js').then((m: any) => m.frStrings),
  hi: () => import('../../../core/dist/i18n/locales/hi.js').then((m: any) => m.hiStrings),
  id: () => import('../../../core/dist/i18n/locales/id.js').then((m: any) => m.idStrings),
  it: () => import('../../../core/dist/i18n/locales/it.js').then((m: any) => m.itStrings),
  ja: () => import('../../../core/dist/i18n/locales/ja.js').then((m: any) => m.jaStrings),
  ko: () => import('../../../core/dist/i18n/locales/ko.js').then((m: any) => m.koStrings),
  nl: () => import('../../../core/dist/i18n/locales/nl.js').then((m: any) => m.nlStrings),
  pl: () => import('../../../core/dist/i18n/locales/pl.js').then((m: any) => m.plStrings),
  pt: () => import('../../../core/dist/i18n/locales/pt.js').then((m: any) => m.ptStrings),
  ru: () => import('../../../core/dist/i18n/locales/ru.js').then((m: any) => m.ruStrings),
  th: () => import('../../../core/dist/i18n/locales/th.js').then((m: any) => m.thStrings),
  tr: () => import('../../../core/dist/i18n/locales/tr.js').then((m: any) => m.trStrings),
  uk: () => import('../../../core/dist/i18n/locales/uk.js').then((m: any) => m.ukStrings),
  vi: () => import('../../../core/dist/i18n/locales/vi.js').then((m: any) => m.viStrings),
  'zh-CN': () => import('../../../core/dist/i18n/locales/zh-CN.js').then((m: any) => m.zhCNStrings),
  'zh-TW': () => import('../../../core/dist/i18n/locales/zh-TW.js').then((m: any) => m.zhTWStrings),
};

let currentLocale = 'en';
let localeVersion = 0;

/** Command-palette UI strings — English. t() falls back to these for every
 *  locale until the core locale files carry them. See COMMAND_PALETTE_PLAN.md. */
const paletteStrings: Record<string, string> = {
  'palette.title': 'Quick Actions',
  'palette.tooltip': 'Quick Actions — click or type / to open',
  'palette.empty': 'No matching commands',
  'palette.col.task': 'Task',
  'palette.col.journal': 'Journal',
  'palette.col.creative': 'Creative',
  'palette.col.support': 'Support',
  'palette.col.memory': 'Memory',
  'palette.col.learning': 'Learning',
  'palette.task.create': 'New task',
  'palette.journal.create': 'New entry',
  'palette.creative.image': 'Image',
  'palette.creative.music': 'Music',
  'palette.creative.video': 'Video',
  'palette.creative.voice': 'Voice',
  'palette.support.create': 'Contact support',
  'palette.memory.create': 'Remember this',
  'palette.learning.create': 'New path',
  'palette.col.plans': 'Plans',
  'palette.plans.meal': 'Meal plan',
  'palette.plans.fitness': 'Fitness plan',
  'palette.plans.combined': 'Combined plan',
};

// Starts with English only; a loaded locale is added here and stays for the
// session, so switching back to one you have already used needs no second fetch.
const translations: Record<string, Record<string, string>> = {
  en: { ...enStrings, ...paletteStrings },
};

/** Languages this build can show. NOT the same as the ones currently loaded —
 *  see the note at the top of the file about which to gate on. */
export function supportedLocales(): string[] {
  return ['en', ...Object.keys(LOADERS)];
}

// One in-flight promise per locale. Without this, a fast switch between two
// languages (or React 18 firing an effect twice) starts the same import twice
// and the later, slower one wins — which can land a locale the user has
// already moved away from.
const inFlight = new Map<string, Promise<void>>();

async function loadLocale(code: string): Promise<void> {
  if (translations[code] || !LOADERS[code]) return;
  let p = inFlight.get(code);
  if (!p) {
    p = LOADERS[code]()
      .then((strings) => { translations[code] = strings; })
      .catch((err) => {
        // Loud, unlike the extension's first attempt at this, where the import
        // failure was swallowed and nineteen languages silently showed English
        // with nothing in the log to say why.
        console.error(`[i18n] failed to load locale "${code}" — staying on English`, err);
      })
      .finally(() => { inFlight.delete(code); });
    inFlight.set(code, p);
  }
  return p;
}

/** Set locale. Call on startup or language switch. */
export async function initLocale(locale?: string): Promise<void> {
  const stored = locale || localStorage.getItem('ava-ide-language') || 'auto';
  const resolved = stored === 'auto' ? (navigator.language?.split('-')[0] || 'en') : stored;

  // Gate on what CAN be loaded, never on what IS loaded — see the file header.
  // Reading `translations[resolved]` here would pin every user to English now
  // that only English is bundled.
  currentLocale = resolved === 'en' || LOADERS[resolved] ? resolved : 'en';

  // Paint immediately in English rather than holding the first frame on a
  // network-free but still asynchronous import.
  localeVersion++;
  window.dispatchEvent(new CustomEvent('ava-locale-changed'));

  if (currentLocale !== 'en') {
    await loadLocale(currentLocale);
    // Again, so the strings that just arrived are actually rendered. Without
    // this second dispatch the locale loads and nothing on screen changes.
    localeVersion++;
    window.dispatchEvent(new CustomEvent('ava-locale-changed'));
  }
}

/** Translate a key with optional interpolation */
export function t(key: string, params?: Record<string, string | number>): string {
  const str = translations[currentLocale]?.[key]
    ?? translations['en']?.[key]
    ?? key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => {
    const val = params[k];
    return val !== undefined ? String(val) : `{${k}}`;
  });
}

/** Translate with a hardcoded fallback. Returns the fallback when t() returns
 *  the raw key — i.e. the locale does not have it yet. For strings introduced
 *  ahead of a translation run, so nobody is shown a key path.
 *
 *  Mirrors the extension's dashboard-ui/src/i18n.ts tt(). The extension had it
 *  and the IDE did not, which is the kind of small divergence that ends with
 *  the two surfaces behaving differently under the same conditions. */
export function tt(key: string, fallback: string): string {
  const val = t(key);
  return val === key ? fallback : val;
}

/** React hook — forces re-render when locale changes */
export function useLocale(): string {
  const [, setVersion] = useState(localeVersion);
  useEffect(() => {
    const handler = () => setVersion(++localeVersion);
    window.addEventListener('ava-locale-changed', handler);
    return () => window.removeEventListener('ava-locale-changed', handler);
  }, []);
  return currentLocale;
}

/** Get current locale code */
export function getLocale(): string {
  return currentLocale;
}

/**
 * The language picker's options — shared by Settings and the onboarding overlay
 * so the two never drift. Native names stay as-is; only "auto-detect" is
 * translated, so this is a function (resolved at render), not a const.
 */
const LANGUAGE_CODES = ['en', 'zh-CN', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar', 'hi'];

// Native fallback names, used only if the runtime lacks Intl.DisplayNames
// (WebView2/Chromium has it — this is belt-and-braces).
const NATIVE_FALLBACK: Record<string, string> = {
  en: 'English', 'zh-CN': '中文（简体）', es: 'Español', fr: 'Français', de: 'Deutsch',
  ja: '日本語', ko: '한국어', pt: 'Português', ru: 'Русский', ar: 'العربية', hi: 'हिन्दी',
};

const capitalise = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Each language shown BOTH in the current UI language and in its own native
 * form ("Japonés · 日本語" when the UI is Spanish) — friendlier than a bare
 * endonym you may not recognise. Uses Intl.DisplayNames, so it needs no
 * translation keys and follows the current locale automatically.
 */
export function languageOptions(): { value: string; label: string }[] {
  const named = (code: string): string => {
    let inCurrent = '', native = '';
    try { inCurrent = capitalise(new Intl.DisplayNames([currentLocale], { type: 'language' }).of(code) || ''); } catch { /* no Intl */ }
    try { native = capitalise(new Intl.DisplayNames([code], { type: 'language' }).of(code) || ''); } catch { /* no Intl */ }
    native = native || NATIVE_FALLBACK[code] || code;
    if (!inCurrent || inCurrent === native) return native;
    return `${inCurrent} · ${native}`;
  };
  return [
    { value: 'auto', label: t('dash.settings.auto_detect') },
    ...LANGUAGE_CODES.map(code => ({ value: code, label: named(code) })),
  ];
}

/**
 * Persist and apply a language choice. Writes the store the sidecar reads at
 * boot, and updates the UI live. Callers that have a running sidecar should
 * ALSO send it `set_language` so Ava switches without a restart.
 */
export function setLanguage(value: string): void {
  try { localStorage.setItem('ava-ide-language', value); } catch { /* private mode */ }
  initLocale(value);
}
