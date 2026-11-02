// ── Who you are and what you've agreed to, shared with the extension ────────
//
// A user with both apps goes through the welcome once. The facts it gathers
// live on disk in ~/.ava, the folder both apps read:
//   - ~/.ava/onboarding.json — consent accepted, welcome finished (the
//     extension's src/webview/onboarding-state.ts reads and writes the same file)
//   - ~/.ava/general.json    — the display name (already shared)
//
// The rest of the IDE reads these from localStorage synchronously, so
// syncSharedOnboarding() runs before React mounts and copies the shared facts
// into the IDE's own keys (and the IDE's into the shared file — someone who
// finished the welcome in an older IDE has nothing in the file yet).

import { readTextFile, writeTextFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { loadGeneralProfile } from './health-store';

const FILE = '.ava/onboarding.json';
const opts = { baseDir: BaseDirectory.Home };

export const CONSENT_KEY = 'ava-ide-consent-accepted';
export const ONBOARDED_KEY = 'ava-ide-onboarded-v2';
const NAME_KEY = 'ava-ide-user-name';

interface SharedOnboarding {
  schema_version: 1;
  consent_accepted_at: string | null;
  onboarded_at: string | null;
}

async function read(): Promise<SharedOnboarding> {
  try {
    const parsed = JSON.parse(await readTextFile(FILE, opts)) as Partial<SharedOnboarding>;
    return {
      schema_version: 1,
      consent_accepted_at: typeof parsed.consent_accepted_at === 'string' ? parsed.consent_accepted_at : null,
      onboarded_at: typeof parsed.onboarded_at === 'string' ? parsed.onboarded_at : null,
    };
  } catch {
    return { schema_version: 1, consent_accepted_at: null, onboarded_at: null };
  }
}

/** Record consent and/or a finished welcome in the shared file. Keeps the
 *  first timestamp — the date someone agreed does not move. */
export async function markShared(patch: { consent?: boolean; onboarded?: boolean }): Promise<void> {
  const cur = await read();
  const now = new Date().toISOString();
  const next: SharedOnboarding = {
    schema_version: 1,
    consent_accepted_at: cur.consent_accepted_at ?? (patch.consent ? now : null),
    onboarded_at: cur.onboarded_at ?? (patch.onboarded ? now : null),
  };
  if (next.consent_accepted_at === cur.consent_accepted_at && next.onboarded_at === cur.onboarded_at) return;
  await mkdir('.ava', { ...opts, recursive: true }).catch(() => {});
  await writeTextFile(FILE, JSON.stringify(next, null, 2), opts);
}

function local(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Both directions, before the first render. Never throws. */
export async function syncSharedOnboarding(): Promise<void> {
  try {
    const shared = await read();
    if (shared.consent_accepted_at && !local(CONSENT_KEY)) localStorage.setItem(CONSENT_KEY, shared.consent_accepted_at);
    if (shared.onboarded_at && !local(ONBOARDED_KEY)) localStorage.setItem(ONBOARDED_KEY, shared.onboarded_at);
    const consent = !!local(CONSENT_KEY) && !shared.consent_accepted_at;
    const onboarded = !!local(ONBOARDED_KEY) && !shared.onboarded_at;
    if (consent || onboarded) await markShared({ consent, onboarded });
  } catch { /* the IDE's own flags still work */ }
  // The name: general.json is the one both apps write, so it wins.
  try {
    const name = (await loadGeneralProfile()).display_name?.trim();
    if (name && local(NAME_KEY) !== name) {
      localStorage.setItem(NAME_KEY, name);
      window.dispatchEvent(new CustomEvent('ava-ide-name-changed'));
    }
  } catch { /* keep the IDE's copy */ }
}
