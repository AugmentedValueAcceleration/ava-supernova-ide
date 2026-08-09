import { useState } from 'react';
import { t, tt } from '../lib/i18n';

/**
 * Rate a course, recipe or exercise. The IDE's copy of the extension's widget.
 *
 * Extracted rather than inlined, for the reason this session keeps rediscovering:
 * the star widget existed twice before today — once in the extension's course
 * detail, once inline here — and those two had drifted before recipes and
 * exercises were even added. Inlining it a third and fourth time would
 * guarantee the same outcome.
 *
 * Kept deliberately in step with
 * packages/extension/dashboard-ui/src/components/ContentRating.tsx: same
 * reason codes, same rules, same behaviour. The two files exist because the
 * surfaces use different styling systems (Tailwind against inline styles), not
 * because they are allowed to differ.
 */

export type RatingSubject = 'course' | 'recipe' | 'exercise' | 'workout';

/**
 * A stable per-install id, so an anonymous rating can be amended rather than
 * stacked. Identifies an INSTALL, not a person: random, stored locally, and
 * regenerated if cleared. Nothing derived from the machine — a hardware
 * fingerprint would be a tracking identifier wearing a practical excuse.
 */
function localDeviceId(): string {
  const KEY = 'ava.device-id';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch {
    return 'session-' + Math.random().toString(36).slice(2, 14);
  }
}

/** Reasons in the language of the thing being rated. A course can be "too
 *  fast"; a recipe cannot. A recipe "didn't work"; a course does not. */
const REASONS_BY_TYPE: Record<RatingSubject, Array<[string, string, string]>> = {
  course: [
    ['unclear', 'learning_library.reason_unclear', 'Unclear'],
    ['too-fast', 'learning_library.reason_too_fast', 'Too fast'],
    ['too-easy', 'learning_library.reason_too_easy', 'Too easy'],
    ['wrong', 'learning_library.reason_wrong', 'Something wrong'],
    ['translation', 'learning_library.reason_translation', 'Bad translation'],
  ],
  recipe: [
    ['didnt-work', 'feedback.reason.didnt_work', "Didn't work"],
    ['too-fiddly', 'feedback.reason.too_fiddly', 'Too fiddly'],
    ['timings-off', 'feedback.reason.timings_off', 'Timings were off'],
    ['seasoning', 'feedback.reason.seasoning', 'Tasted off'],
    ['unclear', 'learning_library.reason_unclear', 'Unclear'],
  ],
  exercise: [
    // First on purpose: the only reason here that should ever pull an exercise
    // rather than merely be noted.
    ['unsafe', 'feedback.reason.unsafe', 'Felt unsafe'],
    ['too-hard', 'feedback.reason.too_hard', 'Too hard'],
    ['too-easy', 'learning_library.reason_too_easy', 'Too easy'],
    ['form-unclear', 'feedback.reason.form_unclear', "Couldn't tell the form"],
    ['wrong-equipment', 'feedback.reason.wrong_equipment', 'Equipment was wrong'],
  ],
  workout: [
    ['unsafe', 'feedback.reason.unsafe', 'Felt unsafe'],
    ['too-hard', 'feedback.reason.too_hard', 'Too hard'],
    ['too-easy', 'learning_library.reason_too_easy', 'Too easy'],
    ['unclear', 'learning_library.reason_unclear', 'Unclear'],
  ],
};

interface Props {
  subjectType: RatingSubject;
  subjectId: string;
  average?: number | null;
  count?: number;
}

export function ContentRating({ subjectType, subjectId, average, count }: Props) {
  const [state, setState] = useState<{
    mine: number | null; average: number | null; count: number;
    askReason?: boolean; error?: string;
  } | null>(null);

  const mine = state?.mine ?? null;
  const avg = state?.average ?? average ?? 0;
  const total = state?.count ?? count ?? 0;

  const rate = async (rating: number, reason?: string) => {
    try {
      const res = await fetch('https://avasupernova.com/api/feedback/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_type: subjectType,
          subject_id: subjectId,
          rating,
          reason,
          device_id: localDeviceId(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Visible. The path this pattern replaces swallowed errors, so a user
        // could click five times and never learn none of them landed.
        setState({ mine: rating, average: avg, count: total, error: d?.error || `Could not save your rating (${res.status}).` });
        return;
      }
      setState({
        mine: d.your_rating ?? rating,
        average: d.average_rating ?? null,
        count: d.rating_count ?? 0,
        askReason: !reason && rating <= 3,
      });
    } catch (err) {
      setState({
        mine: rating, average: avg, count: total,
        error: err instanceof Error ? err.message : 'Could not reach the server.',
      });
    }
  };

  const heading = mine
    ? tt('learning_library.your_rating', 'Your rating')
    : subjectType === 'recipe' ? tt('feedback.rate_recipe', 'Rate this recipe')
    : subjectType === 'exercise' ? tt('feedback.rate_exercise', 'Rate this exercise')
    : t('learning_library.rate_course');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
      <span style={{ fontSize: 10, color: '#6c7086', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {heading}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => rate(star)}
            title={`${star}`}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 18,
              padding: 1, lineHeight: 1,
              // The average, or YOUR score once given. Filling only from the
              // viewer's own rating made a 4/5 item render five grey stars
              // beside the number 4.
              color: (mine ?? avg) >= star ? (mine ? '#fbbf24' : 'rgba(251,191,36,0.55)') : '#45475a',
            }}
          >{'★'}</button>
        ))}
        {/* Shown at zero too — hiding it left unrated items one stat short of
            their neighbours. */}
        <span style={{ fontSize: 10, color: '#6c7086', marginLeft: 6 }}>{avg}/5 ({total})</span>
      </div>

      {state?.error && (
        <span style={{ fontSize: 10, color: '#f87171', maxWidth: 220, textAlign: 'right' }}>{state.error}</span>
      )}

      {state?.askReason && !state.error && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2, maxWidth: 280, justifyContent: 'flex-end' }}>
          {REASONS_BY_TYPE[subjectType].map(([code, key, fallback]) => (
            <button
              key={code}
              onClick={() => rate(mine ?? 3, code)}
              style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 10, cursor: 'pointer',
                border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                background: 'transparent', color: '#a6adc8',
              }}
            >{tt(key, fallback)}</button>
          ))}
        </div>
      )}
    </div>
  );
}
