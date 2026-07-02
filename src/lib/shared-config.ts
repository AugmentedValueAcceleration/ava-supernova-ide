// Cross-surface platform-key sync.
//
// The Ava ecosystem keeps per-user state in ~/.ava/config.json. The CLI reads
// and writes it directly, the extension host syncs into it via the core
// ConfigManager, and the IDE (this file) mirrors its localStorage copy there
// so all three surfaces share one sign-in.
//
// localStorage remains the authoritative fast-access source inside the IDE —
// we just keep config.json in sync on sign-in / sign-out / startup. A user
// who signs in on any surface will be signed in on the others after the IDE
// next boots.

import { readTextFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';

const CONFIG_PATH = '.ava/config.json';

interface SharedConfig {
  activeModel?: string;
  providers?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  platformKey?: string;
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
    // Non-fatal — localStorage is still authoritative in-IDE. Other surfaces
    // just won't pick up this sign-in until the FS write succeeds later.
  }
}

/** Read the shared platform key from ~/.ava/config.json. Returns null if missing or unreadable. */
export async function readSharedPlatformKey(): Promise<string | null> {
  const outcome = await readConfig();
  if (outcome.status !== 'ok') return null;
  const key = outcome.config.platformKey;
  return typeof key === 'string' && key.startsWith('sk-ava-') ? key : null;
}

/**
 * Write the platform key into ~/.ava/config.json so other surfaces pick it up.
 * Guarantees: we never blindly overwrite a file we couldn't read — that would
 * delete sibling fields (activeModel, providers, preferences) populated by the
 * CLI or extension.
 */
export async function writeSharedPlatformKey(key: string): Promise<void> {
  const outcome = await readConfig();
  switch (outcome.status) {
    case 'missing':
      // Fresh file — safe to create with just the key.
      await writeConfig({ platformKey: key });
      return;
    case 'ok':
      // Merge into existing config — preserves everything else.
      await writeConfig({ ...outcome.config, platformKey: key });
      return;
    case 'unreadable':
      // Existing file but we can't parse it. Don't clobber it — user or CLI
      // can investigate. localStorage in the IDE still holds the key so the
      // IDE itself works; other surfaces adopt it on the next successful read.
      // eslint-disable-next-line no-console
      console.warn('[shared-config] Could not read ~/.ava/config.json; skipping merge to avoid clobbering.');
      return;
  }
}

/** Read the user's own H Company key (desktop vision, BYOK-only) from
 *  ~/.ava/config.json → providers.hcompany.apiKey. */
export async function readHCompanyKey(): Promise<string | null> {
  const outcome = await readConfig();
  if (outcome.status !== 'ok') return null;
  const providers = outcome.config.providers as Record<string, { apiKey?: string }> | undefined;
  const key = providers?.hcompany?.apiKey;
  return typeof key === 'string' && key.trim() ? key : null;
}

/** Write (or clear, with '') the H Company key into ~/.ava/config.json,
 *  preserving all sibling config. Same never-clobber rules as the platform key. */
export async function writeHCompanyKey(key: string): Promise<boolean> {
  const outcome = await readConfig();
  if (outcome.status === 'unreadable') return false;
  const base = outcome.status === 'ok' ? outcome.config : {};
  const providers = { ...(base.providers as Record<string, unknown> | undefined) };
  if (key.trim()) {
    providers.hcompany = { ...(providers.hcompany as Record<string, unknown> | undefined), apiKey: key.trim() };
  } else {
    delete providers.hcompany;
  }
  await writeConfig({ ...base, providers });
  return true;
}

/** Clear the platform key from ~/.ava/config.json on sign-out. */
export async function clearSharedPlatformKey(): Promise<void> {
  const outcome = await readConfig();
  if (outcome.status !== 'ok') return;
  if (!outcome.config.platformKey) return;
  const { platformKey: _removed, ...rest } = outcome.config;
  await writeConfig(rest);
}

/**
 * On IDE startup, reconcile localStorage against the shared config. If
 * localStorage is empty and the shared config has a key, adopt it. If
 * localStorage has a key and the shared config is empty or stale, mirror ours
 * into the shared config. localStorage wins when both exist and differ —
 * the IDE is the more recent sign-in if its cache disagrees with the file.
 */
export async function hydratePlatformKey(): Promise<void> {
  const localKey = (() => {
    try { return localStorage.getItem('ava-ide-platform-key'); } catch { return null; }
  })();
  const sharedKey = await readSharedPlatformKey();

  if (localKey && localKey.startsWith('sk-ava-')) {
    // We have a key; make sure the shared config matches.
    if (sharedKey !== localKey) await writeSharedPlatformKey(localKey);
    return;
  }

  if (sharedKey) {
    // No local key but shared config has one — user signed in on another
    // surface. Adopt it locally so this IDE session is signed in too.
    try { localStorage.setItem('ava-ide-platform-key', sharedKey); } catch { /* non-fatal */ }
  }
}
