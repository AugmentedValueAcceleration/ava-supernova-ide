import { useEffect, useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import { loadCuratedPlans } from '../lib/curated-plans';
import { orderForProfile } from '@ava/core/health/starters';
import type { CuratedPlanSummary } from '@ava/core/health/starters';
import type { HealthProfile } from '../lib/health-store';

/**
 * Ready-made plans, on the page.
 *
 * They were reachable only by pressing "New plan" — the one interaction they
 * exist to replace. Someone willing to press it is willing to build; the person
 * a ready-made plan rescues is the one who looks at that button and closes the
 * window.
 *
 * Recipes browse. Exercises browse. Courses have shelves. Plans — the biggest
 * thing we hand anyone — had no front door.
 *
 * Ordered by the reader's stated goal rather than shown as a flat wall, and NOT
 * filtered by it: the week someone needs may be the one they would not have
 * gone looking for. Same rule the sheet uses, from the same shared function.
 *
 * `start_count` is deliberately absent. The route that collects it says it must
 * not become a vanity number, and popularity is not what somebody choosing a
 * month of training needs to know. A rating is.
 */
export function StarterShelf({
  profile, onOpen,
}: {
  profile: HealthProfile | null;
  onOpen: (id: string) => void;
}) {
  const [plans, setPlans] = useState<CuratedPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadCuratedPlans()
      .then(p => { if (live) { setPlans(p); setLoading(false); } })
      .catch(() => { if (live) { setFailed(true); setLoading(false); } });
    return () => { live = false; };
  }, []);

  const ordered = useMemo(
    () => orderForProfile(plans, profile?.goals?.primary ?? null),
    [plans, profile],
  );

  // A shelf that cannot load says nothing rather than claiming the shelf is
  // empty — "there are no ready-made plans" is a statement about the product,
  // not about one failed request.
  if (failed) return null;
  if (!loading && !ordered.length) return null;

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#cdd6f4' }}>{t('health.starters.shelf_title')}</h3>
        <span style={{ fontSize: 10, color: '#6c7086' }}>{t('health.starters.shelf_hint')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
        {loading && !ordered.length
          ? [0, 1, 2].map(i => (
            <div key={i} style={{
              height: 132, borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
              background: 'rgba(26,16,40,0.4)',
            }} />
          ))
          : ordered.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p.id)}
              style={{
                display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0,
                borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                border: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)',
                background: 'rgba(26,16,40,0.6)',
              }}
            >
              <span style={{
                height: 74, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', background: 'rgba(10,6,18,0.6)', fontSize: 20,
              }}>
                {p.cover_image_url
                  ? <img src={p.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  : <span aria-hidden>🏋</span>}
              </span>
              <span style={{ padding: '10px 10px 12px', minWidth: 0 }}>
                <span style={{
                  display: 'block', fontSize: 12, fontWeight: 500, color: '#cdd6f4',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.title}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {[
                    `${p.duration_days}d`,
                    p.days_per_week ? `${p.days_per_week}/wk` : null,
                    p.minutes_per_session ? `${p.minutes_per_session} min` : null,
                  ].filter(Boolean).map(bit => (
                    <span key={bit as string} style={{
                      borderRadius: 999, padding: '1px 6px', fontSize: 9, color: '#6c7086',
                      border: '1px solid color-mix(in srgb, var(--accent) 12%, transparent)',
                    }}>{bit}</span>
                  ))}
                </span>
                {/* Rating where there is one; the start count regardless. A
                    plan nobody has rated has only the second, and "0/5" alone
                    reads as judged rather than as new. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 10, color: '#6c7086' }}>
                  <span style={{ color: p.average_rating ? '#fbbf24' : '#6c7086' }}>★</span>
                  {p.average_rating ?? 0}/5
                  {p.rating_count ? ` (${p.rating_count})` : ''}
                  {p.start_count > 0 && (
                    <span style={{ marginLeft: 6, paddingLeft: 6, borderLeft: '1px solid color-mix(in srgb, var(--accent) 14%, transparent)' }}>
                      {t('health.starters.started', { count: p.start_count })}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))}
      </div>
    </section>
  );
}
