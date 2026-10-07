import { lazy } from 'react';

/**
 * The ONE lazy binding for the documentation page. Both call sites must use it.
 *
 * DocumentationPage is the only consumer of @ava/core/docs, and that graph
 * carries docs/i18n/translations.js — the whole corpus in twenty languages,
 * 1,609KB, measured 7 Oct 2026 at 13.9% of the IDE's entry chunk.
 *
 * ── Why this file exists rather than a lazy() at each call site ──
 *
 * A module reachable BOTH statically and dynamically stays in the entry chunk;
 * the dynamic import simply stops being a split point. The extension hit this
 * exactly: App.tsx was given a lazy(), the bundle moved 62KB instead of 1,661KB,
 * and no chunk was emitted at all, because one other file still imported the
 * component by name. The IDE has the same two call sites — EditorArea's page
 * registry and the docs tab in DashboardPages — so it would have hit it too.
 *
 * Importing the binding from here makes that hard to repeat: there is no named
 * export of the page component left to reach for out of habit.
 */
export const DocumentationPageLazy = lazy(() =>
  import('./DocumentationPage').then((m) => ({ default: m.DocumentationPage })),
);
