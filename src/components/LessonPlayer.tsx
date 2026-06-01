import { useState } from 'react';
import { saveStepProgress, saveLessonComplete } from '../lib/learning-store';

// Minimal local mirror of DashboardLessonStep (extension's
// dashboard-message-types.ts). The IDE's lesson/module objects are loosely
// typed (any[]); the player reads steps defensively against this shape.
export interface LessonStep {
  id: string;
  teach: string;
  interaction: {
    kind: 'choice' | 'free_text' | 'code' | 'predict';
    prompt: string;
    options?: string[];
    answer?: string;
    evaluation?: string;
    starter?: string;
  };
  feedback?: { correct: string; incorrect: string };
  status: string;
  attempts?: number;
  last_attempt?: string | null;
}

export interface PlayableLesson {
  id: string;
  title: string;
  type?: string;
  status?: string;
  score?: number | null;
  steps?: LessonStep[];
}

type StepResult = { status: 'attempted' | 'mastered'; lastAttempt: string | null };

interface Props {
  lesson: PlayableLesson;
  /** When set, step progress + completion are written to the local-first
   *  learning store (~/.ava/learning.json — the same file @ava/core and the
   *  CLI use), so returning resumes and Ava sees it. Omitted for the sample. */
  curriculumId?: string;
  /** Called with the refreshed curriculums after a lesson completes, so the
   *  page can update its progress bars + ticks. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onComplete?: (curricula: any[]) => void;
  onClose: () => void;
}

/**
 * LessonPlayer — plays a lesson as an interactive teach→do→check loop, one
 * step at a time, as cards. A bite of teaching, the learner does something,
 * immediate feedback, advance.
 *
 * Deterministic steps (choice / predict) are checked locally against the
 * step's `answer`. Open steps (free_text / code) have no single right answer —
 * the player shows the learner what a strong answer contains (the `evaluation`
 * rubric) and lets them self-check.
 *
 * IDE inline-style idiom — mirrors the extension's LessonPlayer design.
 */
export function LessonPlayer({ lesson, curriculumId, onComplete, onClose }: Props) {
  const steps = lesson.steps ?? [];
  // Resume at the first step not yet mastered — pick up where you left off.
  const resumeAt = steps.findIndex(s => s.status !== 'mastered');
  const [i, setI] = useState(resumeAt === -1 ? 0 : resumeAt);
  const [done, setDone] = useState(false);

  if (steps.length === 0) {
    return (
      <div>
        <BackBar onClose={onClose} title={lesson.title} progress="" />
        <div style={{
          borderRadius: 10, border: '1px solid rgba(168,85,247,0.12)',
          background: 'rgba(26,16,40,0.4)', padding: 24, textAlign: 'center',
        }}>
          <p style={{ fontSize: 13, color: '#a6adc8', margin: 0 }}>
            This lesson hasn&apos;t been authored as an interactive lesson yet.
          </p>
          <p style={{ fontSize: 11, color: '#6c7086', marginTop: 8 }}>
            Ask Ava to teach this topic and she&apos;ll build it as a step-by-step loop you can play here.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <BackBar onClose={onClose} title={lesson.title} progress="" />
        <div style={{
          borderRadius: 14,
          border: '1px solid rgba(52,211,153,0.3)',
          background: 'linear-gradient(135deg, rgba(52,211,153,0.06), rgba(168,85,247,0.05))',
          padding: 32, textAlign: 'center',
        }}>
          <div style={{
            margin: '0 auto 16px', width: 56, height: 56, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(52,211,153,0.12)', fontSize: 26, color: '#34d399',
          }}>&#10003;</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>You did it</h2>
          <p style={{ fontSize: 13, color: '#a6adc8', marginTop: 8 }}>
            You worked through every step yourself — that&apos;s the skill, not the reading.
          </p>
          <button
            onClick={onClose}
            style={{
              marginTop: 20, borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff',
              padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Back to course
          </button>
        </div>
      </div>
    );
  }

  const step = steps[i];
  const handleStepDone = (result: StepResult) => {
    if (curriculumId) {
      void saveStepProgress(curriculumId, lesson.id, step.id, result.status, result.lastAttempt);
    }
    if (i + 1 >= steps.length) {
      if (curriculumId) void saveLessonComplete(curriculumId, lesson.id, 100).then((c) => onComplete?.(c));
      setDone(true);
    } else {
      setI(i + 1);
    }
  };

  return (
    <div>
      <BackBar onClose={onClose} title={lesson.title} progress={`${i + 1} / ${steps.length}`} />

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {steps.map((_, k) => (
          <div
            key={k}
            style={{
              height: 4, flex: 1, borderRadius: 999, transition: 'background 0.2s',
              background: k < i ? '#a855f7' : k === i ? '#7c3aed' : 'rgba(49,34,68,0.6)',
            }}
          />
        ))}
      </div>

      <StepCard key={step.id} step={step} onDone={handleStepDone} />
    </div>
  );
}

function StepCard({ step, onDone }: { step: LessonStep; onDone: (r: StepResult) => void }) {
  const kind = step.interaction.kind;
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState(step.last_attempt ?? step.interaction.starter ?? '');
  const [revealed, setRevealed] = useState(false);

  const isDeterministic = kind === 'choice' || kind === 'predict';
  const correct = isDeterministic && picked !== null && norm(picked) === norm(step.interaction.answer ?? '');

  return (
    <div style={{
      borderRadius: 14, border: '1px solid rgba(168,85,247,0.12)',
      background: 'rgba(26,16,40,0.6)', padding: 20,
    }}>
      {/* Teach */}
      <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: '#fff', margin: 0 }}>
        {step.teach}
      </p>

      {/* Do */}
      <div style={{
        marginTop: 16, borderRadius: 10, border: '1px solid rgba(168,85,247,0.12)',
        background: 'rgba(17,17,27,0.4)', padding: 12,
      }}>
        <p style={{ marginTop: 0, marginBottom: 10, fontSize: 12, fontWeight: 500, color: '#a6adc8' }}>
          {step.interaction.prompt}
        </p>

        {/* choice / predict — option buttons, checked locally */}
        {isDeterministic && (step.interaction.options?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {step.interaction.options!.map((opt) => {
              const isPicked = picked === opt;
              const showRight = picked !== null && norm(opt) === norm(step.interaction.answer ?? '');
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => setPicked(opt)}
                  style={{
                    borderRadius: 10, padding: '8px 12px', textAlign: 'left', fontSize: 12,
                    transition: 'all 0.15s', cursor: picked !== null ? 'default' : 'pointer',
                    color: '#fff',
                    border: `1px solid ${showRight ? '#34d399' : isPicked && !correct ? '#f87171' : 'rgba(168,85,247,0.12)'}`,
                    background: showRight ? 'rgba(52,211,153,0.08)' : isPicked && !correct ? 'rgba(248,113,113,0.08)' : 'transparent',
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {/* free_text — a real answer the learner writes */}
        {kind === 'free_text' && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your answer…"
            rows={3}
            style={{
              width: '100%', resize: 'vertical', borderRadius: 10,
              border: '1px solid rgba(168,85,247,0.12)', background: 'rgba(17,17,27,0.6)',
              padding: 10, fontSize: 12, color: '#fff', outline: 'none', boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        )}

        {/* code — write + (soon) run real code */}
        {kind === 'code' && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={6}
            style={{
              width: '100%', resize: 'vertical', borderRadius: 10,
              border: '1px solid rgba(168,85,247,0.12)', background: '#11111b',
              padding: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11, lineHeight: 1.6, color: '#cdd6f4', outline: 'none', boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      {/* Feedback */}
      {isDeterministic && picked !== null && (
        <p style={{ marginTop: 12, fontSize: 12, lineHeight: 1.6, color: correct ? '#34d399' : '#f87171' }}>
          {correct
            ? (step.feedback?.correct || 'Right.')
            : (step.feedback?.incorrect || `Not quite — the answer is "${step.interaction.answer}".`)}
        </p>
      )}
      {!isDeterministic && revealed && step.interaction.evaluation && (
        <div style={{
          marginTop: 12, borderRadius: 10, border: '1px solid rgba(168,85,247,0.2)',
          background: 'rgba(168,85,247,0.05)', padding: 12,
        }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#a855f7' }}>
            What a strong answer has
          </p>
          <p style={{ marginTop: 4, marginBottom: 0, fontSize: 12, lineHeight: 1.6, color: '#a6adc8' }}>
            {step.interaction.evaluation}
          </p>
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 10, color: '#6c7086' }}>
            Soon: Ava reads your actual answer and grades it against this live.
          </p>
        </div>
      )}

      {/* Action */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        {isDeterministic ? (
          <ActionButton
            disabled={picked === null}
            onClick={() => onDone({ status: correct ? 'mastered' : 'attempted', lastAttempt: picked })}
            label="Continue"
          />
        ) : !revealed ? (
          <ActionButton
            disabled={text.trim().length === 0}
            onClick={() => setRevealed(true)}
            label="Check"
          />
        ) : (
          <ActionButton
            disabled={false}
            onClick={() => onDone({ status: 'mastered', lastAttempt: text })}
            label="Continue"
          />
        )}
      </div>
    </div>
  );
}

function ActionButton({ disabled, onClick, label }: { disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        borderRadius: 10, border: 'none',
        background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff',
        padding: '6px 16px', fontSize: 12, fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function BackBar({ onClose, title, progress }: { onClose: () => void; title: string; progress: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <button
        onClick={onClose}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6c7086', padding: 0 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6c7086'; }}
      >
        &larr; {title}
      </button>
      {progress && <span style={{ fontSize: 10, fontWeight: 500, color: '#6c7086' }}>{progress}</span>}
    </div>
  );
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/^[a-d]\)\s*/, '');
}

// A built-in sample so the interactive player can be tried with zero setup —
// the "Anatomy of a Good Prompt" lesson, authored as the teach→do→check loop.
export const SAMPLE_LESSON: PlayableLesson = {
  id: 'sample-anatomy-prompt',
  title: 'The Anatomy of a Good Prompt',
  type: 'concept',
  status: 'not_started',
  score: null,
  steps: [
    {
      id: 's1',
      teach: 'A prompt with no context makes Ava guess. With context, she can actually act. Feel the difference first.',
      interaction: {
        kind: 'choice',
        prompt: 'Which prompt can Ava act on without guessing?',
        options: ['write me an email', 'write me an email apologising to a client for a late delivery'],
        answer: 'write me an email apologising to a client for a late delivery',
      },
      feedback: {
        correct: "Right — context kills the guessing. With the first she's guessing who, why and what tone.",
        incorrect: 'The second — context tells her who, why and what tone, so she isn\'t guessing.',
      },
      status: 'not_started', attempts: 0, last_attempt: null,
    },
    {
      id: 's2',
      teach: 'Context sets the scene. The task says what to actually do with it. Your turn.',
      interaction: {
        kind: 'free_text',
        prompt: "Context: you're a freelancer and a client ghosted you on an invoice. Write the task — what do you want Ava to do?",
        evaluation: "A clear task with an action verb, e.g. 'write a firm but friendly follow-up'. Sharper if it names the tone or the outcome.",
      },
      status: 'not_started', attempts: 0, last_attempt: null,
    },
    {
      id: 's3',
      teach: 'Last part: constraints — length, tone, format. This turns a decent answer into a usable one.',
      interaction: {
        kind: 'free_text',
        prompt: 'Add a constraint to your invoice email.',
        evaluation: "A concrete constraint Ava can act on — a length ('under 80 words'), a tone, or a format. Vague ones like 'make it good' don't count.",
      },
      status: 'not_started', attempts: 0, last_attempt: null,
    },
    {
      id: 's4',
      teach: 'Now put all three together — on something real to you. This is the skill.',
      interaction: {
        kind: 'free_text',
        prompt: "Write a complete prompt — context, task, constraint — for something you're actually dealing with this week.",
        evaluation: 'Has all three parts: context (the situation), a clear task (action verb), and at least one constraint (length / tone / format), applied to a real situation.',
      },
      status: 'not_started', attempts: 0, last_attempt: null,
    },
  ],
};
