// The IDE's plumbing for the Profile page (plan 2026-11-27-profile-index,
// Part 2), mirroring the extension's load_profile_overview /
// set_profile_visibility: one `profile_overview` command to the sidecar,
// resolved by its `profile_overview_result` event. The sidecar runs core's
// profileOverview().

import { getSidecar, type SidecarEvent } from './sidecar';

export type ProfileArea = 'learning' | 'training' | 'eating' | 'projects';

/** One area as core's profileOverview builds it. */
export interface ProfileOverviewSection {
  section: ProfileArea;
  /** The line in Ava's index, or null when nothing is recorded. */
  line: string | null;
  /** What profile_lookup returns for this area. */
  detail: string;
  visibility: 'everywhere' | 'room';
}

let next = 0;

export function profileOverviewRequest(set?: { section: ProfileArea; visibility: 'everywhere' | 'room' }): Promise<ProfileOverviewSection[]> {
  const sc = getSidecar();
  const requestId = `profile-${Date.now()}-${next++}`;
  return new Promise((resolve, reject) => {
    const handler = (e: SidecarEvent) => {
      const m = e as unknown as { event: string; requestId?: string; sections?: ProfileOverviewSection[] };
      if (m.event !== 'profile_overview_result' || m.requestId !== requestId) return;
      sc.offAny(handler);
      clearTimeout(timer);
      resolve(Array.isArray(m.sections) ? m.sections : []);
    };
    // A sidecar that never answers must not leave the page spinning forever.
    const timer = setTimeout(() => { sc.offAny(handler); reject(new Error('The profile did not answer.')); }, 20_000);
    sc.onAny(handler);
    void sc.profileOverview(requestId, set).catch((err: unknown) => { sc.offAny(handler); clearTimeout(timer); reject(err); });
  });
}
