import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  DesktopConductor,
  GroundingLayer,
  ExecutorLayer,
  type DesktopConductorEvent,
  type ApprovalHandler,
} from '@ava/core';
import {
  uiaGrounding,
  playwrightGrounding,
  makeOmniParserGrounding,
  nativeExecutor,
  browserExecutor,
  makePlatformLLM,
} from '../lib/desktop-backends';

// ── Types (mirrors @ava/core/desktop — kept inline to avoid build dep) ────

type PermissionLevel = 'watch' | 'ask' | 'drive';
type KillLevel = 'pause' | 'stop' | 'panic';

interface TrajectoryStepView {
  step: number;
  narratorLine: string;
  planner: { kind: string; target?: string; riskClass: string };
  actor: { ok: boolean; latencyMs: number };
  verifier: { status: string; detail: string };
  budgetHeader: string;
  expanded: boolean;
}

interface ApprovalPending {
  step: number;
  summary: string;
  reversible: boolean;
  action: { kind: string; target?: string; reasoning: string };
}

// ── Theme ─────────────────────────────────────────────────────────────────

const theme = {
  bg: '#1e1e2e',
  surface: '#181825',
  border: '#313244',
  text: '#cdd6f4',
  textMuted: '#6c7086',
  accent: '#89b4fa',
  green: '#a6e3a1',
  red: '#f38ba8',
  yellow: '#f9e2af',
  orange: '#fab387',
  purple: '#cba6f7',
};

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  onExit: () => void;
}

type Phase = 'first-run' | 'active' | 'complete';

export default function DesktopModePanel({ onExit }: Props) {
  const [phase, setPhase] = useState<Phase>('first-run');

  // ── First-run state ───────────────────────────────────────────────
  const [whitelist, setWhitelist] = useState('');
  const [permission, setPermission] = useState<PermissionLevel>('ask');
  const [task, setTask] = useState('');

  // ── Active trajectory state ───────────────────────────────────────
  const [steps, setSteps] = useState<TrajectoryStepView[]>([]);
  const [approval, setApproval] = useState<ApprovalPending | null>(null);
  const [budgetHeader, setBudgetHeader] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [, setWhitelistApps] = useState<string[]>([]);
  const [addAppInput, setAddAppInput] = useState('');
  const [showAddApp, setShowAddApp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── D6: Failure recovery state ────────────────────────────────────
  type FailureKind = 'stuck' | 'budget_hit' | 'captcha' | null;
  const [failure, setFailure] = useState<FailureKind>(null);
  const [failureDetail, setFailureDetail] = useState('');

  // ── Kill switch listener ──────────────────────────────────────────
  useEffect(() => {
    const unlisten = listen<{ level: string }>('desktop:kill', (event) => {
      setOutcome(`Trajectory ${event.payload.level === 'panic' ? 'panic-killed' : 'stopped'}`);
      setPhase('complete');
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [steps, approval]);

  // ── D5: Whitelist authoring ─────────────────────────────────────────
  const handleAddApp = useCallback(() => {
    const app = addAppInput.trim();
    if (!app) return;
    setWhitelistApps(prev => [...prev, app]);
    setAddAppInput('');
    setShowAddApp(false);
  }, [addAppInput]);

  // ── D6: Failure recovery actions ──────────────────────────────────
  const handleFailureAction = useCallback((action: 'retry' | 'change' | 'extend' | 'solve' | 'stop') => {
    setFailure(null);
    setFailureDetail('');
    if (action === 'stop') {
      handleKill('stop');
    }
    // In production: send the action to the conductor
    // retry → conductor.retry(), extend → conductor.extend(), etc.
  }, []);

  // Conductor lives across renders — kept in a ref so we can abort it from
  // kill handlers without putting it in React state (re-render on every event).
  const conductorRef = useRef<DesktopConductor | null>(null);
  const pendingApprovalRef = useRef<((d: { approved: boolean; reason?: string }) => void) | null>(null);

  // ── First-run: start trajectory ───────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!task.trim()) return;
    try {
      await invoke('desktop_mode_start');
    } catch { /* ok if already started */ }

    const parsedWhitelist = whitelist.split(',').map(s => s.trim()).filter(Boolean);
    setWhitelistApps(parsedWhitelist);
    setPhase('active');
    setBudgetHeader('Starting...');
    setSteps([]);

    // Wire up the grounding layer with all three tiers registered.
    const grounding = new GroundingLayer({ omniEnabled: true });
    grounding.registerBackend(uiaGrounding);
    grounding.registerBackend(playwrightGrounding);
    grounding.registerBackend(makeOmniParserGrounding());

    const executor = new ExecutorLayer();
    executor.registerNative(nativeExecutor);
    executor.registerBrowser(browserExecutor);

    const llm = makePlatformLLM();

    // Approval handler wires the conductor's approval request into our
    // existing approval card state — conductor waits for the promise.
    const approvalHandler: ApprovalHandler = {
      requestApproval: (action, summary) => new Promise((resolve) => {
        pendingApprovalRef.current = resolve;
        setApproval({
          step: steps.length + 1,
          summary,
          reversible: action.riskClass !== 'mutative-irreversible',
          action: { kind: action.kind, target: action.target, reasoning: action.reasoning },
        });
      }),
    };

    const onEvent = (ev: DesktopConductorEvent) => {
      switch (ev.type) {
        case 'step_start':
          setBudgetHeader(ev.budgetHeader);
          break;
        case 'narrator_complete':
          setSteps(prev => [...prev, {
            step: ev.step,
            narratorLine: ev.update.line,
            planner: { kind: ev.update.audit.action.kind, target: ev.update.audit.action.target, riskClass: ev.update.audit.action.riskClass },
            actor: { ok: ev.update.audit.result.ok, latencyMs: ev.update.audit.result.latencyMs },
            verifier: { status: ev.update.audit.verification.status, detail: ev.update.audit.verification.detail },
            budgetHeader: '',
            expanded: false,
          }]);
          break;
        case 'step_complete':
          setBudgetHeader(ev.budgetHeader);
          break;
        case 'budget_exceeded':
          setFailure('budget_hit');
          setFailureDetail(`Hit the ${ev.reason.replace('_', ' ')} cap at step ${ev.step}.`);
          break;
        case 'trajectory_complete':
          setOutcome(`Trajectory ${ev.outcome} after ${ev.steps} step${ev.steps === 1 ? '' : 's'}.`);
          setPhase('complete');
          break;
        case 'error':
          setOutcome(`Error at step ${ev.step}: ${ev.error}`);
          setPhase('complete');
          break;
      }
    };

    const conductor = new DesktopConductor(
      grounding, executor, llm, approvalHandler, onEvent,
      { task, whitelist: parsedWhitelist, permissionLevel: permission },
    );
    conductorRef.current = conductor;

    conductor.run().catch((e) => {
      setOutcome(`Trajectory crashed: ${e instanceof Error ? e.message : String(e)}`);
      setPhase('complete');
    });
  }, [task, whitelist, permission, steps.length]);

  // ── Kill handlers ─────────────────────────────────────────────────
  const handleKill = useCallback(async (level: KillLevel) => {
    conductorRef.current?.abort();
    try {
      await invoke('desktop_kill', { level });
    } catch (e) {
      console.error('Kill failed:', e);
    }
  }, []);

  // ── Approval handlers ─────────────────────────────────────────────
  const handleApprove = useCallback(() => {
    setApproval(null);
    pendingApprovalRef.current?.({ approved: true });
    pendingApprovalRef.current = null;
  }, []);

  const handleReject = useCallback(() => {
    setApproval(null);
    pendingApprovalRef.current?.({ approved: false, reason: 'User rejected the action' });
    pendingApprovalRef.current = null;
  }, []);

  // ── Exit desktop mode ─────────────────────────────────────────────
  const handleExit = useCallback(async () => {
    try { await invoke('desktop_mode_stop'); } catch { /* */ }
    onExit();
  }, [onExit]);

  // ── Toggle step expansion ─────────────────────────────────────────
  const toggleStep = useCallback((stepNum: number) => {
    setSteps(prev => prev.map(s =>
      s.step === stepNum ? { ...s, expanded: !s.expanded } : s
    ));
  }, []);

  // ── Render ────────────────────────────────────────────────────────

  // First-run: three questions
  if (phase === 'first-run') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.bg, color: theme.text, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: theme.accent }}>
          @@ Desktop Automation
        </div>

        <div style={{ fontSize: 13, marginBottom: 20, color: theme.textMuted, lineHeight: 1.5 }}>
          First time running desktop automation. Quick setup before we start.
        </div>

        {/* Question 1: Whitelist */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            1. Where am I allowed to act?
          </div>
          <input
            value={whitelist}
            onChange={e => setWhitelist(e.target.value)}
            placeholder="Gmail, VS Code, Azure portal, Cursor..."
            style={{
              width: '100%', padding: '8px 12px', background: theme.surface,
              border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text,
              fontSize: 13, outline: 'none',
            }}
          />
        </div>

        {/* Question 2: Permission level */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            2. How much autonomy?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['watch', 'ask', 'drive'] as PermissionLevel[]).map(level => (
              <button
                key={level}
                onClick={() => setPermission(level)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12,
                  border: `1px solid ${permission === level ? theme.accent : theme.border}`,
                  background: permission === level ? theme.accent + '20' : theme.surface,
                  color: permission === level ? theme.accent : theme.textMuted,
                  cursor: 'pointer', fontWeight: permission === level ? 600 : 400,
                }}
              >
                {level === 'watch' ? 'Watch — I click' : level === 'ask' ? 'Ask — confirm each' : 'Drive — act freely'}
              </button>
            ))}
          </div>
        </div>

        {/* Task input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            What should I do?
          </div>
          <input
            value={task}
            onChange={e => setTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleStart(); }}
            placeholder="Check GitHub for the oldest open issue and summarise it..."
            autoFocus
            style={{
              width: '100%', padding: '8px 12px', background: theme.surface,
              border: `1px solid ${theme.border}`, borderRadius: 6, color: theme.text,
              fontSize: 13, outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleStart}
            disabled={!task.trim()}
            style={{
              padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: task.trim() ? theme.accent : theme.border,
              color: task.trim() ? theme.bg : theme.textMuted,
              border: 'none', cursor: task.trim() ? 'pointer' : 'default',
            }}
          >
            Start
          </button>
          <button
            onClick={handleExit}
            style={{
              padding: '8px 20px', borderRadius: 6, fontSize: 13,
              background: 'transparent', color: theme.textMuted,
              border: `1px solid ${theme.border}`, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Active trajectory + complete
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.bg, color: theme.text }}>
      {/* Header state bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: `1px solid ${theme.border}`,
        fontSize: 11, color: theme.textMuted, flexShrink: 0,
      }}>
        <span>
          <span style={{ color: theme.accent, fontWeight: 600 }}>@@ Desktop</span>
          {' · '}
          <span style={{ textTransform: 'capitalize' }}>{permission} mode</span>
          {whitelist && <> · Whitelist: {whitelist}</>}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {phase === 'active' && (
            <>
              <button onClick={() => setShowAddApp(true)} title="Allow another app"
                style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.accent, cursor: 'pointer' }}>
                + Allow app
              </button>
              <button onClick={() => handleKill('pause')} title="Pause"
                style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.yellow, cursor: 'pointer' }}>
                Pause
              </button>
              <button onClick={() => handleKill('stop')} title="Stop (Esc)"
                style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4, border: `1px solid ${theme.red}`, background: theme.red + '20', color: theme.red, cursor: 'pointer' }}>
                Stop
              </button>
            </>
          )}
          {phase === 'complete' && (
            <button onClick={handleExit}
              style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, cursor: 'pointer' }}>
              Close
            </button>
          )}
        </div>
      </div>

      {/* Budget counter */}
      {budgetHeader && (
        <div style={{ padding: '4px 12px', fontSize: 10, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          {budgetHeader}
        </div>
      )}

      {/* Steps */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {steps.map(s => (
          <div key={s.step} style={{ marginBottom: 8 }}>
            {/* Step card */}
            <div
              onClick={() => toggleStep(s.step)}
              style={{
                padding: '8px 12px', borderRadius: 8,
                border: `1px solid ${theme.border}`, background: theme.surface,
                cursor: 'pointer',
              }}
            >
              {/* Narrator line */}
              <div style={{ fontSize: 13, color: theme.text, marginBottom: 4 }}>
                {s.narratorLine}
              </div>

              {/* Collapsed persona row */}
              {!s.expanded && (
                <div style={{ fontSize: 10, color: theme.textMuted, display: 'flex', gap: 12 }}>
                  <span>Scout · {s.verifier.status === 'verified' ? 'ok' : s.verifier.status}</span>
                  <span>Planner · {s.planner.kind}</span>
                  <span>Actor · {s.actor.ok ? 'ok' : 'fail'}</span>
                  <span>Verifier · {s.verifier.status}</span>
                </div>
              )}

              {/* Expanded detail */}
              {s.expanded && (
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8, lineHeight: 1.6 }}>
                  <div><span style={{ color: theme.purple }}>Planner</span> · {s.planner.kind} {s.planner.target ? `→ ${s.planner.target}` : ''} · risk: {s.planner.riskClass}</div>
                  <div><span style={{ color: theme.green }}>Actor</span> · {s.actor.ok ? 'ok' : 'FAIL'} · {s.actor.latencyMs}ms</div>
                  <div><span style={{ color: theme.yellow }}>Verifier</span> · {s.verifier.status} — {s.verifier.detail}</div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Approval card */}
        {approval && (
          <div style={{
            padding: 16, borderRadius: 8, border: `1px solid ${theme.orange}`,
            background: theme.orange + '10', marginBottom: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.orange, marginBottom: 8 }}>
              Approval needed
            </div>
            <div style={{ fontSize: 13, color: theme.text, marginBottom: 4 }}>
              {approval.summary}
            </div>
            {!approval.reversible && (
              <div style={{ fontSize: 11, color: theme.red, marginBottom: 8 }}>
                This action cannot be undone.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleApprove}
                style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: theme.green, color: theme.bg, border: 'none', cursor: 'pointer' }}>
                Approve
              </button>
              <button onClick={handleReject}
                style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, background: 'transparent', color: theme.red, border: `1px solid ${theme.red}`, cursor: 'pointer' }}>
                Reject
              </button>
            </div>
          </div>
        )}

        {/* D5: Inline whitelist authoring */}
        {showAddApp && (
          <div style={{
            padding: 12, borderRadius: 8, border: `1px solid ${theme.accent}`,
            background: theme.accent + '10', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: theme.accent, whiteSpace: 'nowrap' }}>Allow app:</span>
            <input
              value={addAppInput}
              onChange={e => setAddAppInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddApp(); if (e.key === 'Escape') setShowAddApp(false); }}
              autoFocus
              placeholder="Notion, Slack..."
              style={{
                flex: 1, padding: '4px 8px', background: theme.surface,
                border: `1px solid ${theme.border}`, borderRadius: 4, color: theme.text,
                fontSize: 12, outline: 'none',
              }}
            />
            <button onClick={handleAddApp}
              style={{ padding: '4px 12px', borderRadius: 4, fontSize: 11, background: theme.accent, color: theme.bg, border: 'none', cursor: 'pointer' }}>
              Add
            </button>
            <button onClick={() => setShowAddApp(false)}
              style={{ padding: '4px 8px', borderRadius: 4, fontSize: 11, background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        )}

        {/* D6: Failure recovery dialogs */}
        {failure === 'stuck' && (
          <div style={{
            padding: 16, borderRadius: 8, border: `1px solid ${theme.yellow}`,
            background: theme.yellow + '10', marginBottom: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.yellow, marginBottom: 6 }}>Stuck</div>
            <div style={{ fontSize: 13, color: theme.text, marginBottom: 12, lineHeight: 1.5 }}>
              {failureDetail || "I've tried three approaches and keep ending up in the same place."}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleFailureAction('retry')}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                Keep trying
              </button>
              <button onClick={() => handleFailureAction('change')}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                Change approach
              </button>
              <button onClick={() => handleFailureAction('stop')}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: theme.red + '20', color: theme.red, border: `1px solid ${theme.red}`, cursor: 'pointer' }}>
                Stop
              </button>
            </div>
          </div>
        )}

        {failure === 'budget_hit' && (
          <div style={{
            padding: 16, borderRadius: 8, border: `1px solid ${theme.orange}`,
            background: theme.orange + '10', marginBottom: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.orange, marginBottom: 6 }}>Budget cap reached</div>
            <div style={{ fontSize: 13, color: theme.text, marginBottom: 12, lineHeight: 1.5 }}>
              {failureDetail || 'Hit the step/token limit before finishing.'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleFailureAction('extend')}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                Another 30 steps
              </button>
              <button onClick={() => handleFailureAction('change')}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: theme.surface, color: theme.text, border: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                Adjust plan
              </button>
              <button onClick={() => handleFailureAction('stop')}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: theme.red + '20', color: theme.red, border: `1px solid ${theme.red}`, cursor: 'pointer' }}>
                Stop
              </button>
            </div>
          </div>
        )}

        {failure === 'captcha' && (
          <div style={{
            padding: 16, borderRadius: 8, border: `1px solid ${theme.purple}`,
            background: theme.purple + '10', marginBottom: 8,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.purple, marginBottom: 6 }}>Human verification needed</div>
            <div style={{ fontSize: 13, color: theme.text, marginBottom: 12, lineHeight: 1.5 }}>
              {failureDetail || "Hit a 'Verify you're human' challenge. Please solve it in the browser window — I'll wait."}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleFailureAction('solve')}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: theme.purple, color: theme.bg, border: 'none', cursor: 'pointer' }}>
                I solved it — continue
              </button>
              <button onClick={() => handleFailureAction('stop')}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: theme.red + '20', color: theme.red, border: `1px solid ${theme.red}`, cursor: 'pointer' }}>
                Stop
              </button>
            </div>
          </div>
        )}

        {/* Outcome */}
        {outcome && (
          <div style={{ padding: '8px 12px', fontSize: 12, color: theme.textMuted, textAlign: 'center', marginTop: 8 }}>
            {outcome}
          </div>
        )}
      </div>
    </div>
  );
}
