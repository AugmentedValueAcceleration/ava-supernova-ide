/**
 * IDE i18n wrapper — loads locale strings at runtime via dynamic import.
 * Falls back to English if locale not found.
 */

// ── In-process translation engine (no sidecar dependency) ──────────────
let currentLocale = 'en';
let enStrings: Record<string, string> = {};
const translations: Record<string, Record<string, string>> = {};

/** Set locale and load English + target translation strings */
export async function initLocale(locale?: string): Promise<void> {
  // Always load English as fallback
  if (!translations['en']) {
    try {
      // @ts-ignore — dynamic import from core dist
      const mod = await import('../../node_modules/@ava/core/dist/i18n/locales/en.js');
      const exportName = Object.keys(mod).find((k: string) => k.endsWith('Strings'));
      if (exportName && (mod as Record<string, unknown>)[exportName]) {
        enStrings = (mod as Record<string, Record<string, string>>)[exportName];
        translations['en'] = enStrings;
      }
    } catch {
      // Core not available — t() returns keys as-is
    }
  }

  const stored = locale || localStorage.getItem('ava-ide-language') || 'auto';
  const resolved = stored === 'auto' ? (navigator.language?.split('-')[0] || 'en') : stored;
  currentLocale = resolved;

  if (resolved !== 'en' && !translations[resolved]) {
    try {
      // @ts-ignore — dynamic import from core dist
      const mod = await import(`../../node_modules/@ava/core/dist/i18n/locales/${resolved}.js`);
      const exportName = Object.keys(mod).find((k) => k.endsWith('Strings'));
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
