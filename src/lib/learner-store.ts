// Local-first learner-profile store for the IDE.
//
// The EDITABLE half of the Progression profile — bio/headline + self-added
// skills/achievements — lives in ~/.ava/learner.json, the SAME file the
// extension and @ava/core read/write. The EARNED half (skills/certs/stats) is
// derived from learning.json by @ava/core/learning and never written here —
// that separation is what keeps the credential honest. Read/written via the
// Tauri fs plugin, so it works with no account and no connection (mirrors
// learning-store.ts).

import { readTextFile, writeTextFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs';
import { accountRoot } from './account-scope';

// Account-scoped — ~/.ava/users/<id>/learner.json when signed in (the same file
// the extension + @ava/core use), ~/.ava/learner.json for BYOK/no-account.
const learnerPath = async (): Promise<string> => `${await accountRoot()}/learner.json`;

export interface LearnerSelfAchievement {
  title: string;
  date?: string | null;
  evidenceUrl?: string | null;
}

export interface LearnerProfile {
  schema_version: 1;
  updated_at: string | null;
  identity: { display_name: string | null; headline: string | null; bio: string | null; avatar_url: string | null };
  self: { skills: string[]; achievements: LearnerSelfAchievement[] };
}

export function emptyLearnerProfile(): LearnerProfile {
  return {
    schema_version: 1,
    updated_at: null,
    identity: { display_name: null, headline: null, bio: null, avatar_url: null },
    self: { skills: [], achievements: [] },
  };
}

/** Read the learner profile from the local store. Local-first: returns an empty
 *  profile (not an error) when the file is missing or unreadable. */
export async function readLearnerProfile(): Promise<LearnerProfile> {
  try {
    const raw = JSON.parse(await readTextFile(await learnerPath(), { baseDir: BaseDirectory.Home }));
    if (raw && raw.schema_version === 1) {
      return {
        schema_version: 1,
        updated_at: raw.updated_at ?? null,
        identity: {
          display_name: raw.identity?.display_name ?? null,
          headline: raw.identity?.headline ?? null,
          bio: raw.identity?.bio ?? null,
          avatar_url: raw.identity?.avatar_url ?? null,
        },
        self: {
          skills: Array.isArray(raw.self?.skills) ? raw.self.skills : [],
          achievements: Array.isArray(raw.self?.achievements) ? raw.self.achievements : [],
        },
      };
    }
  } catch {
    /* missing or unreadable — fall through to empty */
  }
  return emptyLearnerProfile();
}

/** Persist the learner profile, stamping schema_version + updated_at. */
export async function writeLearnerProfile(profile: LearnerProfile): Promise<void> {
  const next: LearnerProfile = { ...profile, schema_version: 1, updated_at: new Date().toISOString() };
  await mkdir(await accountRoot(), { baseDir: BaseDirectory.Home, recursive: true }).catch(() => {});
  await writeTextFile(await learnerPath(), JSON.stringify(next, null, 2), { baseDir: BaseDirectory.Home });
}
