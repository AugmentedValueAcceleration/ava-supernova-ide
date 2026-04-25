/**
 * SignInPanel — OAuth sign-in UI for the IDE.
 *
 * Renders inside WelcomeOverlay's Step 2 and replaces the legacy
 * sk-ava-... paste input. Three options:
 *   1. Continue with GitHub (primary)
 *   2. Sign in with email (secondary)
 *   3. Continue without an account (local-first preserve — just skips)
 *
 * Uses `useSignIn` from lib/sign-in for all the OAuth device-code flow
 * plumbing. When a sign-in lands the `onSignedIn` callback fires with
 * the account details; WelcomeOverlay uses it to advance to the
 * "What should Ava call you?" sub-step.
 */

import { useEffect } from 'react';
import { useSignIn, type SignInAccount } from '../lib/sign-in';

interface SignInPanelProps {
  onSignedIn: (account: SignInAccount) => void;
  onSkipAccount: () => void;
}

export function SignInPanel({ onSignedIn, onSkipAccount }: SignInPanelProps) {
  const { pending, error, account, start, cancel, clearError } = useSignIn();

  // Advance WelcomeOverlay once we have a successful sign-in
  useEffect(() => {
    if (account) onSignedIn(account);
  }, [account, onSignedIn]);

  // ── Pending state ──────────────────────────────────────────────────────
  if (pending) {
    return (
      <div style={{
        background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: 12, padding: 20, textAlign: 'center',
      }}>
        <style>{`@keyframes ava-spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ position: 'relative', width: 40, height: 40 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid rgba(168, 85, 247, 0.2)',
            }} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '2px solid transparent', borderTopColor: '#a855f7',
              animation: 'ava-spin 1s linear infinite',
            }} />
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#cdd6f4', marginBottom: 4 }}>
          Waiting for browser…
        </div>
        <div style={{ fontSize: 11, color: '#6c7086', marginBottom: 14 }}>
          {pending === 'github'
            ? 'Complete sign-in with GitHub in your browser, then return here.'
            : 'Complete sign-in with email in your browser, then return here.'}
        </div>
        <button
          onClick={cancel}
          style={{
            padding: '6px 16px', fontSize: 11, background: 'transparent',
            border: '1px solid rgba(168,85,247,0.3)', borderRadius: 6,
            color: '#cdd6f4', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Idle state ─────────────────────────────────────────────────────────
  return (
    <div style={{
      background: 'rgba(26, 16, 40, 0.6)', border: '1px solid rgba(168, 85, 247, 0.12)',
      borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#a855f7', marginBottom: 4 }}>
        Platform Account
      </div>
      <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 12 }}>
        Cloud sync across every device. 300 free credits/month.
      </div>

      {error && (
        <div
          onClick={clearError}
          style={{
            background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 6, padding: '8px 10px', marginBottom: 10, cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 11, color: '#f87171', fontWeight: 500, marginBottom: 2 }}>Sign-in failed</div>
          <div style={{ fontSize: 10, color: '#fca5a5', opacity: 0.85 }}>{error}</div>
          <div style={{ fontSize: 9, color: '#fca5a5', opacity: 0.5, marginTop: 2 }}>(click to dismiss)</div>
        </div>
      )}

      {/* Primary: GitHub */}
      <button
        onClick={() => start('github')}
        style={{
          width: '100%', height: 34, borderRadius: 6, border: '1px solid rgba(110, 118, 129, 0.4)',
          background: 'rgba(36, 41, 46, 1)', color: '#fff', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', marginBottom: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        Continue with GitHub
      </button>

      {/* Secondary: Email */}
      <button
        onClick={() => start('email')}
        style={{
          width: '100%', height: 34, borderRadius: 6, border: '1px solid rgba(168, 85, 247, 0.35)',
          background: 'transparent', color: '#cdd6f4', fontSize: 12, fontWeight: 500,
          cursor: 'pointer', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        Sign in with email
      </button>

      {/* Tertiary: Continue without an account */}
      <button
        onClick={onSkipAccount}
        style={{
          width: '100%', height: 28, borderRadius: 6, border: 'none',
          background: 'transparent', color: '#6c7086', fontSize: 10,
          cursor: 'pointer', opacity: 0.7,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
      >
        Continue without an account
      </button>
    </div>
  );
}
