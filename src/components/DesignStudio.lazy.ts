import { lazy } from 'react';

/**
 * The ONE lazy binding for Design Studio. Any new call site must use it.
 *
 * It is not the page's own code that makes this worth splitting — it is what
 * the page reaches. `lib/asset-forge/` is reachable from nowhere else, and it
 * pulls `lucide` (imported as the whole `icons` barrel, 722KB, untreeshakeable)
 * and `opentype.js` (475KB) to build logos and shapes. Measured 7 Oct 2026 at
 * 1,197KB of the IDE's entry chunk, for one page.
 *
 * Mirrors the extension, where the identical split took 1,031KB off its bundle.
 * Kept in its own file for the same reason as DocumentationPage.lazy.ts: a
 * module reachable BOTH statically and dynamically stays in the entry, so one
 * stray `import { DesignStudio }` anywhere silently undoes this.
 */
export const DesignStudioLazy = lazy(() =>
  import('./DesignStudio').then((m) => ({ default: m.DesignStudio })),
);
