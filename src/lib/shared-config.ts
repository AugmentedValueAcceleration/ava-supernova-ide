// ~/.ava/config.json — shared with the CLI and the extension.
//
// The IDE keeps one setting here (where new projects go) because the sidecar
// needs it too. It also clears a platform key left over from the account era
// (accounts went on 1 Nov 2026), so nothing can route back onto account-only
// paths.

import { readTextFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

const CONFIG_PATH = '.ava/config.json';

interface SharedConfig {
  activeModel?: string;
  providers?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  platformKey?: string; // account era only — cleared on first launch
  [key: string]: unknown;
}

/** Read state — distinguishes "file doesn't exist" from "file exists but couldn't be read". */
type ReadOutcome =
  | { status: 'missing' }                      // no file — safe to create fresh
  | { status: 'ok'; config: SharedConfig }     // file read + parsed cleanly
  | { status: 'unreadable' };                  // file exists but something went wrong — DO NOT CLOBBER

async function readConfig(): Promise<ReadOutcome> {
  // Never use `exists()` as the gate — in some Tauri permission configurations
  // it has returned false for paths that are perfectly readable, which led to
  // write paths treating a populated config as empty and wiping sibling
  // fields (activeModel, providers, preferences). Instead, attempt the read
  // directly and interpret the error.
  try {
    const raw = await readTextFile(CONFIG_PATH, { baseDir: BaseDirectory.Home });
    try {
      const parsed = JSON.parse(raw || '{}');
      if (typeof parsed === 'object' && parsed !== null) {
        return { status: 'ok', config: parsed as SharedConfig };
      }
      return { status: 'unreadable' };
    } catch {
      // JSON corrupt — don't overwrite, let the user / CLI regenerate.
      return { status: 'unreadable' };
    }
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).toLowerCase();
    if (msg.includes('no such file') || msg.includes('not found') || msg.includes('cannot find') || msg.includes('enoent')) {
      return { status: 'missing' };
    }
    return { status: 'unreadable' };
  }
}

async function writeConfig(cfg: SharedConfig): Promise<void> {
  try {
    await writeTextFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), { baseDir: BaseDirectory.Home });
  } catch {
    // Non-fatal — the next write tries again.
  }
}

/**
 * Where new projects go, as the user set it./**
 * Where new projects go, as the user set it. Empty/unset means the default.
 *
 * Deliberately in ~/.ava/config.json rather than localStorage: the SIDECAR
 * needs this too — it is what tells Ava where to scaffold — and a renderer-only
 * setting is invisible to it. One fact, one place, both halves of the app.
 */
export async function readProjectsHomeSetting(): Promise<string | null> {
  const outcome = await readConfig();
  if (outcome.status !== 'ok') return null;
  const prefs = outcome.config.preferences as Record<string, unknown> | undefined;
  const value = prefs?.projectsHome;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Write (or clear, with '') the projects folder, preserving sibling config. */
export async function writeProjectsHomeSetting(path: string): Promise<boolean> {
  const outcome = await readConfig();
  if (outcome.status === 'unreadable') return false;
  const base = outcome.status === 'ok' ? outcome.config : {};
  const preferences = { ...(base.preferences as Record<string, unknown> | undefined) };
  if (path.trim()) preferences.projectsHome = path.trim();
  else delete preferences.projectsHome;
  await writeConfig({ ...base, preferences });
  return true;
}

/** Remove a platform key left over from the account era. */
export async function clearSharedPlatformKey(): Promise<void> {
  const outcome = await readConfig();
  if (outcome.status !== 'ok') return;
  if (!outcome.config.platformKey) return;
  const { platformKey: _removed, ...rest } = outcome.config;
  await writeConfig(rest);
}
