import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { t, tt, useLocale } from '../lib/i18n';
import { profileOverviewRequest, type ProfileArea, type ProfileOverviewSection } from '../lib/profile';
import { GeneralProfilePage, ProfileTab as HealthProfileEditor } from './HealthPage';

/**
 * The Profile page (plan 2026-11-27-profile-index, Part 2). Mirrors the
 * extension's dashboard-ui/src/pages/ProfilePage.tsx: keep the two in step.
 *
 * One place for what Ava knows about the person. Each area shows the exact
 * line in her index and what profile_lookup would hand her, so nothing she
 * knows is hidden, plus the switch that keeps an area to its own room.
 * The general profile moved here from Settings, and the health profile from
 * Health's own tab, so every field is edited in one place.
 */

export type ProfilePageTab = 'about' | 'health' | 'learning' | 'projects';

// Set by a deep link (Health's Profile tab, For you's "set your goals"):
// the page opens on that tab once, then a plain visit opens on About you.
let pendingTab: ProfilePageTab | null = null;

/** Open the Profile page on a tab. */
export function openProfilePage(tab: ProfilePageTab = 'about'): void {
  pendingTab = tab;
  window.dispatchEvent(new CustomEvent('ava-profile-tab', { detail: tab }));
  window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: 'profile' }));
}

const navigate = (page: string) => window.dispatchEvent(new CustomEvent('ava-navigate-dashboard', { detail: page }));

const AREA_LABEL: Record<ProfileArea, () => string> = {
  learning: () => tt('profile.area.learning', 'Learning'),
  training: () => tt('profile.area.training', 'Training'),
  eating: () => tt('profile.area.eating', 'Eating'),
  projects: () => tt('profile.area.projects', 'Projects'),
};

/** Where a section kept to its room can still be seen. Projects have no room. */
const AREA_ROOM: Partial<Record<ProfileArea, () => string>> = {
  learning: () => tt('profile.room.learning', 'the Learning room and Teach mode'),
  training: () => tt('profile.room.health', 'Health & Nutrition'),
  eating: () => tt('profile.room.health', 'Health & Nutrition'),
};

const card: CSSProperties = {
  background: 'rgba(26, 16, 40, 0.6)',
  border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
  borderRadius: 10,
  padding: 16,
};
const muted: CSSProperties = { fontSize: 11, color: '#6c7086' };
const linkBtn: CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 11 };

function AreaCard({ s, onSet }: { s: ProfileOverviewSection; onSet: (v: 'everywhere' | 'room') => void }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const room = AREA_ROOM[s.section];
  const kept = s.visibility === 'room';
  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#cdd6f4' }}>{AREA_LABEL[s.section]()}</div>
          <div style={{ ...muted, marginTop: 2 }}>{tt('profile.sees', 'What Ava keeps in view')}</div>
        </div>
        {room && (
          <div role="group" aria-label={tt('profile.switch.label', 'Ava can see this')} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={muted}>{tt('profile.switch.label', 'Ava can see this')}</span>
            <div style={{ display: 'flex', border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', borderRadius: 6, padding: 2 }}>
              {(['everywhere', 'room'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => { if (v !== s.visibility) onSet(v); }}
                  aria-pressed={s.visibility === v}
                  style={{
                    border: 'none', cursor: 'pointer', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 500,
                    background: s.visibility === v ? 'var(--accent)' : 'transparent',
                    color: s.visibility === v ? '#fff' : '#6c7086',
                  }}
                >
                  {v === 'everywhere' ? tt('profile.switch.everywhere', 'Everywhere') : tt('profile.switch.room', 'Only in its room')}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{
        marginTop: 12, borderRadius: 6, background: 'rgba(12, 8, 20, 0.5)', padding: '8px 12px',
        fontFamily: 'var(--font-mono, monospace)', fontSize: 12, lineHeight: 1.6,
        color: kept ? '#6c7086' : '#bac2de', textDecoration: kept && s.line ? 'line-through' : 'none',
      }}>
        {s.line ?? <span style={{ fontFamily: 'inherit' }}>{tt('profile.nothing', 'Nothing recorded yet.')}</span>}
      </div>
      {kept && room && <p style={{ ...muted, margin: '8px 0 0' }}>{t('profile.switch.room_hint', { room: room() })}</p>}
      {s.line && (
        <>
          <button onClick={() => setOpen((o) => !o)} style={{ ...linkBtn, marginTop: 8 }}>
            {open ? tt('profile.detail.hide', 'Hide what she can look up') : tt('profile.detail.show', 'Show what she can look up')}
          </button>
          {open && (
            <pre style={{
              marginTop: 8, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', borderRadius: 6, padding: 12,
              border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', fontSize: 11, lineHeight: 1.6, color: '#bac2de',
            }}>{s.detail}</pre>
          )}
        </>
      )}
    </div>
  );
}

export function ProfilePage() {
  useLocale();
  const [tab, setTab] = useState<ProfilePageTab>(() => { const p = pendingTab; pendingTab = null; return p ?? 'about'; });
  const [overview, setOverview] = useState<ProfileOverviewSection[] | null>(null);

  const load = useCallback((set?: { section: ProfileArea; visibility: 'everywhere' | 'room' }) => {
    profileOverviewRequest(set).then(setOverview).catch(() => setOverview((o) => o ?? []));
  }, []);

  // The lines are built from the same files the editors save, so re-read them
  // after every save: what the page shows is always what Ava sees now.
  useEffect(() => {
    load();
    const reload = () => load();
    const onTab = (e: Event) => { const tb = (e as CustomEvent<ProfilePageTab>).detail; if (tb) { setTab(tb); pendingTab = null; } };
    window.addEventListener('ava-health-profile-saved', reload);
    window.addEventListener('ava-general-profile-saved', reload);
    window.addEventListener('ava-profile-tab', onTab);
    return () => {
      window.removeEventListener('ava-health-profile-saved', reload);
      window.removeEventListener('ava-general-profile-saved', reload);
      window.removeEventListener('ava-profile-tab', onTab);
    };
  }, [load]);

  const cards = (areas: ProfileArea[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {overview === null
        ? <div style={{ fontSize: 12, color: '#6c7086' }}>{tt('profile.loading', 'Reading your profile…')}</div>
        : areas.map((a) => {
          const s = overview.find((x) => x.section === a);
          return s ? <AreaCard key={a} s={s} onSet={(visibility) => load({ section: a, visibility })} /> : null;
        })}
    </div>
  );

  const name = (() => {
    try { return (localStorage.getItem('ava-ide-user-name') || '').trim().split(/\s+/)[0]; } catch { return ''; }
  })();
  const tabs: Array<{ key: ProfilePageTab; label: string }> = [
    { key: 'about', label: tt('profile.tab.about', 'About you') },
    { key: 'health', label: tt('profile.tab.health', 'Training & eating') },
    { key: 'learning', label: tt('profile.tab.learning', 'Learning') },
    { key: 'projects', label: tt('profile.tab.projects', 'Projects') },
  ];
  const note: CSSProperties = { fontSize: 12, color: '#6c7086', marginTop: 12 };

  return (
    <div style={{ flex: 1, minHeight: 0, background: 'linear-gradient(135deg, #0f0a1a 0%, #1a1028 40%, #150d22 100%)', overflowY: 'auto', padding: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: '#cdd6f4', marginBottom: 6 }}>
          {name ? t('general.profile.account_tab_named', { name }) : t('general.profile.account_tab')}
        </h2>
        <p style={{ fontSize: 12, color: '#585b70', marginTop: 2 }}>{tt('profile.subtitle', 'What Ava knows about you, and where she can see it.')}</p>
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)', marginBottom: 16, paddingBottom: 1 }}>
        {tabs.map((x) => (
          <button key={x.key} onClick={() => setTab(x.key)} style={{
            padding: '6px 12px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
            background: 'transparent', color: tab === x.key ? '#cdd6f4' : '#585b70',
            borderBottom: tab === x.key ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{x.label}</button>
        ))}
      </div>

      {tab === 'about' && <GeneralProfilePage />}

      {tab === 'health' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {cards(['training', 'eating'])}
          <HealthProfileEditor />
        </div>
      )}

      {tab === 'learning' && (
        <div>
          {cards(['learning'])}
          <p style={note}>
            {tt('profile.learning.note', 'Your courses and skills are managed in the Learning room.')}{' '}
            <button onClick={() => navigate('learning')} style={{ ...linkBtn, fontSize: 12 }}>{tt('profile.open_learning', 'Open Learning')}</button>
          </p>
        </div>
      )}

      {tab === 'projects' && (
        <div>
          {cards(['projects'])}
          <p style={note}>
            {tt('profile.projects.note', 'Projects come from Ava’s memory of your work, so they are managed on the Memory page.')}{' '}
            <button onClick={() => navigate('memory')} style={{ ...linkBtn, fontSize: 12 }}>{tt('profile.open_memory', 'Open Memory')}</button>
          </p>
        </div>
      )}
    </div>
  );
}
