import * as React from '@theia/core/shared/react';
import type { DashboardState } from '../ava-agent-client';
import type { AvaDashboardSettings, AvaAccountInfo, AvaUsageSummary } from '../../common/ava-agent-protocol';

// ── Props ───────────────────────────────────────────────────────────────────

export interface AvaDashboardAppProps {
  state: DashboardState;
  onSaveProviderKey: (provider: 'deepseek' | 'kimi' | 'qwen', apiKey: string) => void;
  onRemoveProviderKey: (provider: 'deepseek' | 'kimi' | 'qwen') => void;
  onSavePreferences: (settings: AvaDashboardSettings) => void;
  onConnectAccount: (key: string) => void;
  onDisconnectAccount: () => void;
  onGetUsageSummary?: () => Promise<AvaUsageSummary>;
}

// ── Constants ───────────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: 'deepseek' as const,
    name: 'DeepSeek',
    placeholder: 'sk-...',
    signupUrl: 'https://platform.deepseek.com',
    description: 'DeepSeek V3 and R1 models',
  },
  {
    id: 'kimi' as const,
    name: 'Kimi (Moonshot)',
    placeholder: 'sk-...',
    signupUrl: 'https://platform.moonshot.cn',
    description: 'Kimi K2.5 — best multi-step tool calling',
  },
  {
    id: 'qwen' as const,
    name: 'Qwen (Alibaba)',
    placeholder: 'sk-...',
    signupUrl: 'https://dashscope.console.aliyun.com',
    description: 'Qwen 3.5 Plus and Qwen Turbo',
  },
];

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'zh-TW', label: '中文（繁體）' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ru', label: 'Русский' },
  { value: 'ar', label: 'العربية' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'th', label: 'ภาษาไทย' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'it', label: 'Italiano' },
  { value: 'pl', label: 'Polski' },
  { value: 'uk', label: 'Українська' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'id', label: 'Bahasa Indonesia' },
];

const PERMISSION_MODES = [
  { value: 'strict', label: 'Strict', desc: 'Confirm every tool call' },
  { value: 'balanced', label: 'Balanced', desc: 'Auto-approve safe tools' },
  { value: 'autonomous', label: 'Autonomous', desc: 'Approve everything' },
];

const TOKEN_OPTIONS = [
  { value: 2048, label: '2,048' },
  { value: 4096, label: '4,096' },
  { value: 8192, label: '8,192' },
  { value: 16384, label: '16,384' },
  { value: 32768, label: '32,768' },
];

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    fontFamily: 'var(--theia-ui-font-family)',
    color: 'var(--theia-foreground)',
    fontSize: '13px',
    overflow: 'auto',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  headerTitle: {
    fontSize: '15px',
    fontWeight: 700 as const,
  },
  headerSub: {
    fontSize: '9px',
    fontWeight: 600 as const,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    opacity: 0.5,
    marginLeft: '6px',
  },
  content: {
    flex: 1,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  section: {
    border: '1px solid var(--theia-panel-border)',
    borderRadius: '8px',
    padding: '12px',
    background: 'rgba(99, 102, 241, 0.02)',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600 as const,
    marginBottom: '4px',
  },
  sectionDesc: {
    fontSize: '11px',
    opacity: 0.5,
    marginBottom: '10px',
  },
  label: {
    fontSize: '9px',
    fontWeight: 600 as const,
    letterSpacing: '1.5px',
    textTransform: 'uppercase' as const,
    opacity: 0.4,
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '5px',
    background: 'var(--theia-input-background)',
    color: 'var(--theia-input-foreground)',
    fontFamily: 'monospace',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '5px',
    background: 'var(--theia-input-background)',
    color: 'var(--theia-input-foreground)',
    fontSize: '12px',
    outline: 'none',
  },
  btn: {
    padding: '6px 14px',
    border: '1px solid var(--theia-button-border, transparent)',
    borderRadius: '5px',
    background: 'var(--ava-accent, #6366F1)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  btnSecondary: {
    padding: '6px 14px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '5px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  btnSmall: {
    padding: '3px 10px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '4px',
    background: 'transparent',
    color: '#ef4444',
    fontSize: '11px',
    cursor: 'pointer',
  },
  connectedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dot: (color: string) => ({
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
  }),
  link: {
    fontSize: '10px',
    color: 'var(--ava-accent, #6366F1)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'none',
  },
  error: {
    padding: '8px 12px',
    borderRadius: '6px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    fontSize: '12px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '8px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'var(--theia-panel-border)',
  },
  dividerText: {
    fontSize: '11px',
    opacity: 0.4,
  },
};

// ── ConnectAccount page ─────────────────────────────────────────────────────

function ConnectAccount({ onConnect, onSkip, error: externalError }: {
  onConnect: (key: string) => void;
  onSkip: () => void;
  error: string | null;
}) {
  const [key, setKey] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // Show backend error and stop loading
  const displayError = localError || externalError;
  React.useEffect(() => {
    if (externalError) setLoading(false);
  }, [externalError]);

  const handleConnect = React.useCallback(() => {
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ava-')) {
      setLocalError('Key must start with sk-ava-');
      return;
    }
    setLocalError(null);
    setLoading(true);
    onConnect(trimmed);
  }, [key, onConnect]);

  return (
    <div style={s.content}>
      {/* Logo */}
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div>
          <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ava-accent, #6366F1)' }}>Ava</span>
          <span style={s.headerSub}>Supernova</span>
        </div>
        <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>
          Connect your account for managed API access
        </div>
      </div>

      {/* Steps */}
      <div style={s.section}>
        <div style={s.label}>How to connect</div>
        {['Sign up at ava-supernova.com', 'Go to Dashboard \u2192 API Keys', 'Copy your sk-ava-... key and paste it below'].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', fontSize: '12px' }}>
            <span style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.15)', color: 'var(--ava-accent, #6366F1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 700, flexShrink: 0,
            }}>
              {i + 1}
            </span>
            <span style={{ opacity: 0.7, paddingTop: '1px' }}>{step}</span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div>
        <input
          type="password"
          value={key}
          onChange={e => { setKey(e.target.value); setLocalError(null); }}
          onKeyDown={e => e.key === 'Enter' && handleConnect()}
          placeholder="sk-ava-..."
          style={{
            ...s.input,
            borderColor: displayError ? '#ef4444' : undefined,
          }}
        />
        {displayError && <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{displayError}</div>}
      </div>

      <button
        onClick={handleConnect}
        disabled={loading || !key.trim()}
        style={{ ...s.btn, width: '100%', opacity: loading || !key.trim() ? 0.5 : 1 }}
      >
        {loading ? 'Connecting...' : 'Connect Account'}
      </button>

      {/* Divider */}
      <div style={s.divider}>
        <div style={s.dividerLine} />
        <span style={s.dividerText}>or</span>
        <div style={s.dividerLine} />
      </div>

      {/* BYOK Alternative */}
      <div style={{ ...s.section, textAlign: 'center' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Use your own API keys</div>
        <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '10px' }}>
          Skip account creation and configure your own provider keys directly.
        </div>
        <button onClick={onSkip} style={{ ...s.btnSecondary, width: '100%' }}>
          Configure API Keys
        </button>
      </div>
    </div>
  );
}

// ── Provider Key Card ───────────────────────────────────────────────────────

function ProviderCard({ provider, connected, health, onSave, onRemove }: {
  provider: typeof PROVIDERS[number];
  connected: boolean;
  health?: { healthy: boolean; latencyMs: number; error?: string };
  onSave: (apiKey: string) => void;
  onRemove: () => void;
}) {
  const [input, setInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handleSave = React.useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setSaving(true);
    onSave(trimmed);
    setInput('');
    setTimeout(() => setSaving(false), 1500);
  }, [input, onSave]);

  return (
    <div style={s.section}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={s.sectionTitle}>{provider.name}</div>
        {connected && (
          <button style={s.btnSmall} onClick={onRemove}>Remove</button>
        )}
      </div>
      <div style={s.sectionDesc}>{provider.description}</div>

      {connected ? (
        <div style={s.connectedBadge}>
          <span style={s.dot(health ? (health.healthy ? '#22c55e' : '#ef4444') : '#22c55e')} />
          <span style={{ fontSize: '12px', color: health ? (health.healthy ? '#22c55e' : '#ef4444') : '#22c55e' }}>
            {health ? (health.healthy ? `Connected (${health.latencyMs}ms)` : `Error`) : 'Connected'}
          </span>
          {health && !health.healthy && health.error && (
            <span style={{ fontSize: '10px', opacity: 0.5 }}>{health.error.slice(0, 50)}</span>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder={provider.placeholder}
              style={{ ...s.input, flex: 1 }}
            />
            <button
              onClick={handleSave}
              disabled={!input.trim() || saving}
              style={{ ...s.btn, opacity: !input.trim() || saving ? 0.5 : 1, flexShrink: 0 }}
            >
              {saving ? 'Saved' : 'Save'}
            </button>
          </div>
          <a
            href={provider.signupUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...s.link, display: 'inline-block', marginTop: '6px' }}
          >
            Get an API key &rarr;
          </a>
        </div>
      )}
    </div>
  );
}

// ── Account components ──────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const TIER_COLORS: Record<string, string> = {
  free: '#6b7280',
  pro: '#6366F1',
  ultra: '#8B5CF6',
  admin: '#f59e0b',
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <span style={{
      background: TIER_COLORS[tier] || '#6b7280',
      padding: '2px 8px',
      borderRadius: 9999,
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase',
      color: '#fff',
      letterSpacing: '0.5px',
    }}>
      {tier}
    </span>
  );
}

function UsageBar({ used, limit, accent }: { used: number; limit: number; accent?: boolean }) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : accent ? '#8B5CF6' : '#6366F1';
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'var(--theia-input-background)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.3s' }} />
    </div>
  );
}

function AccountOverview({ account, onDisconnect }: { account: AvaAccountInfo; onDisconnect: () => void }) {
  const usage = account.usage ?? {
    tokens_used: 0, tokens_limit: null as number | null,
    requests_count: 0, period_start: null as string | null, period_end: null as string | null,
    free_tokens_used: 0, free_tokens_limit: 500_000,
  };

  return (
    <div style={s.section}>
      {/* Header: email + tier */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>{account.email}</div>
          {account.name && <div style={{ fontSize: '11px', opacity: 0.5 }}>{account.name}</div>}
        </div>
        <TierBadge tier={account.tier} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
        <div style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'var(--theia-input-background)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{formatNumber(usage.tokens_used)}</div>
          <div style={{ fontSize: '10px', opacity: 0.5 }}>Tokens Used</div>
        </div>
        <div style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'var(--theia-input-background)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{usage.requests_count}</div>
          <div style={{ fontSize: '10px', opacity: 0.5 }}>Requests</div>
        </div>
      </div>

      {/* Free tokens bar */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>Free Tokens</span>
          {account.tier === 'admin' ? (
            <span style={{ fontSize: '11px', color: TIER_COLORS.admin }}>Unlimited</span>
          ) : (
            <span style={{ fontSize: '11px', opacity: 0.5 }}>
              {formatNumber(usage.free_tokens_limit - usage.free_tokens_used)} remaining
            </span>
          )}
        </div>
        {account.tier === 'admin' ? (
          <div style={{ height: 6, borderRadius: 3, background: 'var(--theia-input-background)', overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 3, background: 'linear-gradient(to right, #6366F1, #8B5CF6)' }} />
          </div>
        ) : (
          <UsageBar used={usage.free_tokens_used} limit={usage.free_tokens_limit} />
        )}
        <div style={{ fontSize: '10px', opacity: 0.4, marginTop: '2px' }}>
          {account.tier === 'admin' ? 'No metering — admin tier' : '500K free tokens included monthly'}
        </div>
      </div>

      {/* Plan tokens bar (if applicable) */}
      {usage.tokens_limit !== null && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>
              {account.tier.charAt(0).toUpperCase() + account.tier.slice(1)} Plan
            </span>
            <span style={{ fontSize: '11px', opacity: 0.5 }}>
              {formatNumber(usage.tokens_limit - usage.tokens_used)} remaining
            </span>
          </div>
          <UsageBar used={usage.tokens_used} limit={usage.tokens_limit} accent />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
        <a
          href="https://ava-supernova.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          style={s.link}
        >
          Manage on ava-supernova.com &rarr;
        </a>
        <button style={s.btnSmall} onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </div>
  );
}

// ── Settings page ───────────────────────────────────────────────────────────

function UsageSection({ onGetUsageSummary }: { onGetUsageSummary?: () => Promise<AvaUsageSummary> }) {
  const [summary, setSummary] = React.useState<AvaUsageSummary | null>(null);

  React.useEffect(() => {
    if (onGetUsageSummary) {
      onGetUsageSummary().then(setSummary).catch(() => {});
    }
  }, [onGetUsageSummary]);

  if (!summary) return null;

  const formatCost = (cost: number) => cost > 0 ? `$${cost.toFixed(4)}` : '$0.00';
  const fmtTokens = (tokens: number) => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
    return String(tokens);
  };

  const providers = Object.entries(summary.byProvider);

  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>Usage</div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
        <div style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'var(--theia-input-background)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{fmtTokens(summary.today.tokens)}</div>
          <div style={{ fontSize: '10px', opacity: 0.5 }}>Today ({formatCost(summary.today.cost)})</div>
        </div>
        <div style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'var(--theia-input-background)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{fmtTokens(summary.month.tokens)}</div>
          <div style={{ fontSize: '10px', opacity: 0.5 }}>This Month ({formatCost(summary.month.cost)})</div>
        </div>
      </div>
      {providers.length > 0 && (
        <div style={{ fontSize: '11px', opacity: 0.6 }}>
          {providers.map(([name, data]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>{name}</span>
              <span>{fmtTokens(data.tokens)} · {formatCost(data.cost)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPage({ state, onSaveProviderKey, onRemoveProviderKey, onSavePreferences, onDisconnectAccount, onGetUsageSummary }: {
  state: DashboardState;
  onSaveProviderKey: AvaDashboardAppProps['onSaveProviderKey'];
  onRemoveProviderKey: AvaDashboardAppProps['onRemoveProviderKey'];
  onSavePreferences: AvaDashboardAppProps['onSavePreferences'];
  onDisconnectAccount: AvaDashboardAppProps['onDisconnectAccount'];
  onGetUsageSummary: AvaDashboardAppProps['onGetUsageSummary'];
}) {
  const [localSettings, setLocalSettings] = React.useState<AvaDashboardSettings>(state.settings);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => setLocalSettings(state.settings), [state.settings]);

  function updateSetting<K extends keyof AvaDashboardSettings>(key: K, value: AvaDashboardSettings[K]) {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  const handleSavePrefs = React.useCallback(() => {
    onSavePreferences(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [localSettings, onSavePreferences]);

  const hasChanges = JSON.stringify(localSettings) !== JSON.stringify(state.settings);
  const configuredCount = [state.providerKeys.deepseek, state.providerKeys.kimi, state.providerKeys.qwen].filter(Boolean).length;

  return (
    <div style={s.content}>
      {/* Error */}
      {state.error && (
        <div style={s.error}>{state.error}</div>
      )}

      {/* Usage summary (Phase 4) */}
      <UsageSection onGetUsageSummary={onGetUsageSummary} />

      {/* Account overview */}
      {state.platformKeyConnected && state.account && (
        <AccountOverview account={state.account} onDisconnect={onDisconnectAccount} />
      )}

      {/* Provider Keys */}
      <div style={s.label}>
        API Providers {configuredCount > 0 && `\u2014 ${configuredCount}/3 configured`}
      </div>

      {configuredCount === 0 && (
        <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '-8px', marginBottom: '4px' }}>
          Add at least one provider API key to start using Ava.
        </div>
      )}

      {PROVIDERS.map(provider => {
        const health = state.providerHealth.find(h => h.provider === provider.id);
        return (
          <ProviderCard
            key={provider.id}
            provider={provider}
            connected={state.providerKeys[provider.id]}
            health={health}
            onSave={(apiKey) => onSaveProviderKey(provider.id, apiKey)}
            onRemove={() => onRemoveProviderKey(provider.id)}
          />
        );
      })}

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--theia-panel-border)', margin: '4px 0' }} />
      <div style={s.label}>Preferences</div>

      {/* Language */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Language</div>
        <div style={s.sectionDesc}>Language for Ava's responses.</div>
        <select
          value={localSettings.language}
          onChange={e => updateSetting('language', e.target.value)}
          style={s.select}
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Permission Mode */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Permission Mode</div>
        <div style={s.sectionDesc}>Controls when Ava asks before running tools.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {PERMISSION_MODES.map(mode => (
            <label
              key={mode.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '12px',
                background: localSettings.permissionMode === mode.value ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                border: localSettings.permissionMode === mode.value ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
              }}
            >
              <input
                type="radio"
                checked={localSettings.permissionMode === mode.value}
                onChange={() => updateSetting('permissionMode', mode.value as AvaDashboardSettings['permissionMode'])}
                style={{ accentColor: 'var(--ava-accent, #6366F1)' }}
              />
              <span>
                <span style={{ fontWeight: 600 }}>{mode.label}</span>
                <span style={{ opacity: 0.5 }}> — {mode.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Temperature */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Temperature ({localSettings.temperature.toFixed(1)})</div>
        <div style={s.sectionDesc}>Controls response creativity vs. precision.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', opacity: 0.4 }}>Precise</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={localSettings.temperature}
            onChange={e => updateSetting('temperature', parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--ava-accent, #6366F1)' }}
          />
          <span style={{ fontSize: '10px', opacity: 0.4 }}>Creative</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Max Response Tokens</div>
        <div style={s.sectionDesc}>Maximum tokens per model response.</div>
        <select
          value={localSettings.maxTokens}
          onChange={e => updateSetting('maxTokens', parseInt(e.target.value))}
          style={s.select}
        >
          {TOKEN_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Completions Provider */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Inline Completions</div>
        <div style={s.sectionDesc}>Which provider to use for inline code completions (FIM).</div>
        <select
          value={localSettings.completionsProvider}
          onChange={e => updateSetting('completionsProvider', e.target.value)}
          style={s.select}
        >
          <option value="deepseek">DeepSeek</option>
          <option value="qwen">Qwen (Coder Plus)</option>
          <option value="none">Disabled</option>
        </select>
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
        <button
          onClick={handleSavePrefs}
          disabled={!hasChanges}
          style={{ ...s.btn, opacity: hasChanges ? 1 : 0.5 }}
        >
          Save Changes
        </button>
        {saved && <span style={{ fontSize: '12px', color: '#22c55e' }}>Saved</span>}
      </div>
    </div>
  );
}

// ── Main app ────────────────────────────────────────────────────────────────

export function AvaDashboardApp(props: AvaDashboardAppProps) {
  const { state, onSaveProviderKey, onRemoveProviderKey, onSavePreferences, onConnectAccount, onDisconnectAccount } = props;

  // Auto-navigate: show connect page when no providers and no platform account
  const hasAnyProvider = state.providerKeys.deepseek || state.providerKeys.kimi || state.providerKeys.qwen;
  const [page, setPage] = React.useState<'connect' | 'settings'>(
    !hasAnyProvider && !state.platformKeyConnected ? 'connect' : 'settings',
  );

  // Update page when state changes (e.g., after connecting account)
  React.useEffect(() => {
    if (state.platformKeyConnected || hasAnyProvider) {
      setPage('settings');
    }
  }, [state.platformKeyConnected, hasAnyProvider]);

  if (!state.initialized) {
    return (
      <div style={{ ...s.container, alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerTitle}>Dashboard</span>
        <span style={s.headerSub}>Ava</span>
      </div>

      {/* Page content */}
      {page === 'connect' ? (
        <ConnectAccount
          onConnect={onConnectAccount}
          onSkip={() => setPage('settings')}
          error={state.error}
        />
      ) : (
        <SettingsPage
          state={state}
          onSaveProviderKey={onSaveProviderKey}
          onRemoveProviderKey={onRemoveProviderKey}
          onSavePreferences={onSavePreferences}
          onDisconnectAccount={onDisconnectAccount}
          onGetUsageSummary={props.onGetUsageSummary}
        />
      )}
    </div>
  );
}
