import pkg from '../package.json';

/**
 * The IDE's OWN app version — single source of truth.
 * Sourced from packages/ide/package.json (kept in lockstep with
 * src-tauri/tauri.conf.json). Use this anywhere a version is shown; never the
 * extension's / release-notes version (those come from the platform API and
 * describe a different product).
 */
export const APP_VERSION: string = pkg.version;
