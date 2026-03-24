/**
 * IDE i18n — English loaded synchronously (always available),
 * other locales lazy-loaded on demand.
 */

// @ts-ignore — import from core dist (resolved by Vite)
import { enStrings } from '@ava/core/dist/i18n/locales/en.js';

// ── In-process translation engine ──────────────────────────────────────
let currentLocale = 'en';
const translations: Record<string, Record<string, string>> = {
  en: enStrings as Record<string, string>,
};

/** Load a non-English locale (lazy). Call on startup or language switch. */
export async function initLocale(locale?: string): Promise<void> {
  const stored = locale || localStorage.getItem('ava-ide-language') || 'auto';
  const resolved = stored === 'auto' ? (navigator.language?.split('-')[0] || 'en') : stored;
  currentLocale = resolved;

  if (resolved !== 'en' && !translations[resolved]) {
    try {
      // @ts-ignore — dynamic import from core dist
      const mod = await import(`../../node_modules/@ava/core/dist/i18n/locales/${resolved}.js`);
      const exportName = Object.keys(mod).find((k: string) => k.endsWith('Strings'));
      if (exportName && mod[exportName]) {
        translations[resolved] = mod[exportName];
      }
    } catch {
      // Locale not found — falls back to English
    }
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

/** Get current locale code */
export function getLocale(): string {
  return currentLocale;
}
