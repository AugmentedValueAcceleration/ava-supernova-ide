// ─── Logo pipeline (IDE side) ────────────────────────────────────────────────
//
// The logo lane needs the raw bytes of a bundled wordmark font (opentype parses
// them for glyph outlines, and we register each as a FontFace so the picker can
// render every name in its own typeface). In the extension webview that meant a
// host round-trip (CSP blocks url()/fetch); here in the Tauri app the fonts ship
// under public/fonts/ and are served same-origin, so a direct fetch is enough —
// no sidecar handler, no CSP dance. (The old server-vtracer symbol path is gone;
// marks are constructed, not traced.)

import * as opentype from 'opentype.js';
import { parseFont } from './wordmark';
import { WORDMARK_FONTS } from './fonts';

const bytesCache = new Map<string, Uint8Array>();

/** Fetch a bundled font's raw bytes from public/fonts/. Cached. */
async function loadFontBytes(file: string): Promise<Uint8Array> {
  const cached = bytesCache.get(file);
  if (cached) return cached;
  const res = await fetch(`/fonts/${file}`);
  if (!res.ok) throw new Error(`Font load failed: ${file} (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  bytesCache.set(file, bytes);
  return bytes;
}

const fontCache = new Map<string, opentype.Font>();

/** Load a bundled wordmark font by filename as a parsed opentype Font. Cached. */
export async function loadFont(file: string): Promise<opentype.Font> {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const bytes = await loadFontBytes(file);
  const font = parseFont(bytes.buffer as ArrayBuffer);
  fontCache.set(file, font);
  return font;
}

const registeredFaces = new Set<string>();

/** Register the bundled wordmark fonts as FontFaces — straight from bytes, so no
 *  url()/font-src and no CSP change. Lets the font picker render each name IN its
 *  own typeface. Best-effort per font; a failure just falls back to system text. */
export async function registerWordmarkFonts(): Promise<void> {
  await Promise.all(WORDMARK_FONTS.map(async (f) => {
    if (registeredFaces.has(f.id)) return;
    try {
      const bytes = await loadFontBytes(f.file);
      const face = new FontFace(f.id, bytes as BufferSource);
      await face.load();
      (document as unknown as { fonts: FontFaceSet }).fonts.add(face);
      registeredFaces.add(f.id);
    } catch { /* skip a font that won't register */ }
  }));
}
