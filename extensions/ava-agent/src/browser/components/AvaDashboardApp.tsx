import * as React from '@theia/core/shared/react';
import type { DashboardState } from '../ava-agent-client';
import type { AvaDashboardSettings, AvaAccountInfo, AvaUsageSummary } from '../../common/ava-agent-protocol';

// ── Props ───────────────────────────────────────────────────────────────────

export interface AvaDashboardAppProps {
  state: DashboardState;
  onSaveProviderKey: (provider: string, apiKey: string) => void;
  onRemoveProviderKey: (provider: string) => void;
  onSavePreferences: (settings: AvaDashboardSettings) => void;
  onConnectAccount: (key: string) => void;
  onDisconnectAccount: () => void;
  onGetUsageSummary?: () => Promise<AvaUsageSummary>;
  onGetMemory?: () => Promise<{ global: string | null; project: string | null }>;
  onSaveMemory?: (scope: 'global' | 'project', content: string) => Promise<void>;
  onClearMemory?: (scope: 'global' | 'project') => Promise<void>;
  onCheckForUpdates?: () => Promise<{ version: string } | null>;
}

// ── Types ────────────────────────────────────────────────────────────────────

type DashboardPage = 'overview' | 'usage' | 'memory' | 'connections' | 'billing' | 'settings';

// ── Constants ───────────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: 'anthropic' as const,
    name: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    signupUrl: 'https://console.anthropic.com',
    description: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5',
  },
  {
    id: 'deepseek' as const,
    name: 'DeepSeek',
    placeholder: 'sk-...',
    signupUrl: 'https://platform.deepseek.com',
    description: 'DeepSeek V3 and R1 — best price/performance',
  },
  {
    id: 'kimi' as const,
    name: 'Kimi (Moonshot)',
    placeholder: 'sk-...',
    signupUrl: 'https://platform.moonshot.cn',
    description: 'Kimi K2.5 — best multi-step tool calling',
  },
  {
    id: 'glm' as const,
    name: 'GLM (Zhipu AI)',
    placeholder: '...',
    signupUrl: 'https://open.bigmodel.cn',
    description: 'GLM-5, GLM-4.7 — best tool-call reliability',
  },
  {
    id: 'qwen' as const,
    name: 'Qwen (Alibaba)',
    placeholder: 'sk-...',
    signupUrl: 'https://dashscope.console.aliyun.com',
    description: 'Qwen 3.5 Plus and Qwen Turbo',
  },
  {
    id: 'mistral' as const,
    name: 'Mistral AI',
    placeholder: '...',
    signupUrl: 'https://console.mistral.ai',
    description: 'Mistral Large 3, Codestral, Devstral 2',
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

const NAV_ITEMS: Array<{ page: DashboardPage; label: string; icon: string; platformOnly?: boolean; comingSoon?: boolean }> = [
  { page: 'overview', label: 'Overview', icon: '\u26A1', platformOnly: true },
  { page: 'usage', label: 'Usage', icon: '\u2593', platformOnly: true },
  { page: 'memory', label: 'Memory', icon: '\u2728' },
  { page: 'connections', label: 'Connections', icon: '\u{1F517}', platformOnly: true, comingSoon: true },
  { page: 'billing', label: 'Billing', icon: '\u{1F4B3}', platformOnly: true },
  { page: 'settings', label: 'Settings', icon: '\u2699' },
];

const TIER_COLORS: Record<string, string> = {
  free: '#6b7280',
  pro: '#A855F7',
  ultra: '#8B5CF6',
  admin: '#f59e0b',
};

const PLAN_FEATURES: Record<string, string[]> = {
  pro: [
    'Managed API access — no keys needed',
    '5M tokens / month included',
    'All supported models',
    'Top-up tokens anytime',
    'Priority support',
  ],
  ultra: [
    'Everything in Pro',
    'Unlimited tokens',
    'Highest-priority routing',
    'Early access to new models',
    'Rate-limited only during extreme load',
  ],
};

const TOPUP_PACKAGES = [
  { id: 'starter', label: '2.5M tokens', price: '$5' },
  { id: 'standard', label: '12M tokens', price: '$20' },
  { id: 'pro_pack', label: '50M tokens', price: '$70' },
];

// ── Styles ──────────────────────────────────────────────────────────────────

const s = {
  container: {
    display: 'flex',
    height: '100%',
    fontFamily: 'var(--theia-ui-font-family)',
    color: 'var(--theia-foreground)',
    fontSize: '13px',
    overflow: 'hidden',
  },
  sidebar: {
    width: '180px',
    flexShrink: 0 as const,
    display: 'flex',
    flexDirection: 'column' as const,
    borderRight: '1px solid var(--theia-panel-border)',
    background: 'var(--theia-sideBar-background, var(--theia-editor-background))',
    padding: '12px 8px',
  },
  sidebarLogo: {
    padding: '4px 10px 12px',
    borderBottom: '1px solid var(--theia-panel-border)',
    marginBottom: '8px',
  },
  logoText: {
    fontSize: '14px',
    fontWeight: 700 as const,
    color: 'var(--ava-accent, #A855F7)',
  },
  logoSub: {
    fontSize: '9px',
    fontWeight: 600 as const,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    opacity: 0.5,
    marginLeft: '4px',
  },
  navList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  navItem: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center' as const,
    gap: '8px',
    padding: '7px 10px',
    borderRadius: '6px',
    border: 'none' as const,
    cursor: 'pointer' as const,
    fontSize: '12px',
    fontFamily: 'var(--theia-ui-font-family)',
    textAlign: 'left' as const,
    width: '100%',
    background: active ? 'var(--theia-list-activeSelectionBackground, rgba(168, 85, 247, 0.15))' : 'transparent',
    color: active ? 'var(--theia-list-activeSelectionForeground, var(--theia-foreground))' : 'var(--theia-foreground)',
    fontWeight: active ? 600 : 400 as const,
    opacity: active ? 1 : 0.7,
  }),
  navItemDisabled: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: '8px',
    padding: '7px 10px',
    fontSize: '12px',
    opacity: 0.35,
    cursor: 'default' as const,
  },
  comingSoonBadge: {
    marginLeft: 'auto',
    fontSize: '9px',
    padding: '1px 5px',
    borderRadius: '3px',
    background: 'var(--theia-input-background)',
    opacity: 0.7,
  },
  sidebarFooter: {
    borderTop: '1px solid var(--theia-panel-border)',
    paddingTop: '8px',
    marginTop: '4px',
  },
  main: {
    flex: 1,
    overflow: 'auto' as const,
    padding: '20px 24px',
  },
  pageHeader: {
    marginBottom: '20px',
  },
  pageTitle: {
    fontSize: '18px',
    fontWeight: 700 as const,
    marginBottom: '4px',
  },
  pageSubtitle: {
    fontSize: '12px',
    opacity: 0.5,
  },
  section: {
    border: '1px solid var(--theia-panel-border)',
    borderRadius: '8px',
    padding: '14px',
    background: 'rgba(168, 85, 247, 0.02)',
    marginBottom: '12px',
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
    background: 'var(--ava-accent, #A855F7)',
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
    color: 'var(--ava-accent, #A855F7)',
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
    marginBottom: '12px',
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
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginBottom: '16px',
  },
  statCard: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--theia-panel-border)',
    background: 'rgba(168, 85, 247, 0.02)',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 700 as const,
  },
  statLabel: {
    fontSize: '11px',
    opacity: 0.6,
    marginTop: '2px',
  },
  statSub: {
    fontSize: '10px',
    opacity: 0.4,
    marginTop: '2px',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Shared Components ───────────────────────────────────────────────────────

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
  const color = pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : accent ? '#8B5CF6' : '#A855F7';
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'var(--theia-input-background)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.3s' }} />
    </div>
  );
}

function FullWidthBar() {
  return (
    <div style={{ height: 6, borderRadius: 3, background: 'var(--theia-input-background)', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 3, background: 'linear-gradient(to right, #A855F7, #8B5CF6)' }} />
    </div>
  );
}

// ── NavSidebar ──────────────────────────────────────────────────────────────

function NavSidebar({ currentPage, onNavigate, mode, email, onDisconnect, onConnect, onCheckForUpdates, updateStatus }: {
  currentPage: DashboardPage;
  onNavigate: (page: DashboardPage) => void;
  mode: 'platform' | 'byok';
  email?: string | null;
  onDisconnect: () => void;
  onConnect: () => void;
  onCheckForUpdates?: () => void;
  updateStatus?: 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';
}) {
  const visibleItems = mode === 'byok'
    ? NAV_ITEMS.filter(item => !item.platformOnly)
    : NAV_ITEMS;

  return (
    <div style={s.sidebar}>
      <div style={s.sidebarLogo}>
        <span style={s.logoText}>Ava</span>
        <span style={s.logoSub}>Supernova</span>
      </div>

      <div style={s.navList}>
        {visibleItems.map(({ page, label, icon, comingSoon }) => {
          if (comingSoon) {
            return (
              <div key={page} style={s.navItemDisabled}>
                <span>{icon}</span>
                <span>{label}</span>
                <span style={s.comingSoonBadge}>Soon</span>
              </div>
            );
          }
          return (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              style={s.navItem(currentPage === page)}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div style={s.sidebarFooter}>
        {onCheckForUpdates && (
          <button
            onClick={onCheckForUpdates}
            disabled={updateStatus === 'checking'}
            style={{
              width: '100%', padding: '5px 10px', marginBottom: '10px',
              fontSize: '11px', fontWeight: 500, borderRadius: '4px',
              background: 'transparent', color: 'var(--theia-foreground, #e0e0e0)',
              border: '1px solid rgba(255,255,255,0.1)', cursor: updateStatus === 'checking' ? 'default' : 'pointer',
              opacity: updateStatus === 'checking' ? 0.5 : 0.7,
              transition: 'opacity 0.15s',
            }}
          >
            {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
          </button>
        )}
        {mode === 'platform' ? (
          <>
            {email && (
              <div style={{ fontSize: '10px', opacity: 0.4, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email}
              </div>
            )}
            <button style={{ ...s.btnSmall, width: '100%' }} onClick={onDisconnect}>
              Disconnect Account
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '10px', opacity: 0.4, marginBottom: '6px' }}>
              Using your own API keys
            </div>
            <button style={{ ...s.btnSecondary, width: '100%', fontSize: '11px', padding: '4px 10px' }} onClick={onConnect}>
              Connect Account
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── ConnectAccount page ─────────────────────────────────────────────────────

function ConnectAccount({ onConnect, onSkip, error: externalError }: {
  onConnect: (key: string) => void;
  onSkip: () => void;
  error: string | null;
}) {
  const [key, setKey] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

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
    <div style={{ maxWidth: '380px', margin: '20px auto' }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', padding: '8px 0', marginBottom: '16px' }}>
        <div>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ava-accent, #A855F7)' }}>Ava</span>
          <span style={s.logoSub}>Supernova</span>
        </div>
        <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>
          Connect your account for managed API access and cloud sync
        </div>
      </div>

      {/* Steps */}
      <div style={s.section}>
        <div style={s.label}>How to connect</div>
        {['Sign up at ava-supernova.com', 'Go to Dashboard \u2192 API Keys', 'Copy your sk-ava-... key and paste it below'].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', fontSize: '12px' }}>
            <span style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: 'rgba(168, 85, 247, 0.15)', color: 'var(--ava-accent, #A855F7)',
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
      <div style={{ marginBottom: '10px' }}>
        <input
          type="password"
          value={key}
          onChange={e => { setKey(e.target.value); setLocalError(null); }}
          onKeyDown={e => e.key === 'Enter' && handleConnect()}
          placeholder="sk-ava-..."
          style={{ ...s.input, borderColor: displayError ? '#ef4444' : undefined }}
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

      <div style={s.divider}>
        <div style={s.dividerLine} />
        <span style={s.dividerText}>or</span>
        <div style={s.dividerLine} />
      </div>

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

// ── ProviderCard ────────────────────────────────────────────────────────────

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
            {health ? (health.healthy ? `Connected (${health.latencyMs}ms)` : 'Error') : 'Connected'}
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

// ── Overview Page ───────────────────────────────────────────────────────────

function OverviewPage({ account, onNavigate }: { account: AvaAccountInfo; onNavigate: (page: DashboardPage) => void }) {
  const usage = account.usage ?? {
    tokens_used: 0, tokens_limit: null as number | null,
    requests_count: 0, period_start: null as string | null, period_end: null as string | null,
    free_tokens_used: 0, free_tokens_limit: 500_000,
  };

  return (
    <div style={{ maxWidth: '600px' }}>
      <div style={s.pageHeader}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={s.pageTitle}>Overview</div>
          <TierBadge tier={account.tier} />
        </div>
        <div style={s.pageSubtitle}>{account.email}</div>
      </div>

      {/* Stats Grid */}
      <div style={s.statsGrid}>
        <div style={s.statCard}>
          <div style={s.statValue}>{formatNumber(usage.tokens_used)}</div>
          <div style={s.statLabel}>Tokens Used</div>
          {usage.period_start && <div style={s.statSub}>Since {formatDate(usage.period_start)}</div>}
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>{usage.requests_count}</div>
          <div style={s.statLabel}>Requests</div>
          <div style={s.statSub}>This period</div>
        </div>
      </div>

      {/* Token Credits */}
      <div style={s.section}>
        <div style={s.label}>Token Credits</div>

        {/* Free Tokens */}
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
        {account.tier === 'admin' ? <FullWidthBar /> : (
          <UsageBar used={usage.free_tokens_used} limit={usage.free_tokens_limit} />
        )}
        <div style={{ fontSize: '10px', opacity: 0.4, marginTop: '2px', marginBottom: '14px' }}>
          {account.tier === 'admin' ? 'No metering — admin tier' : '500K free tokens included every month'}
        </div>

        {/* Plan Tokens */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>
            {account.tier.charAt(0).toUpperCase() + account.tier.slice(1)} Plan
          </span>
          {account.tier === 'admin' ? (
            <span style={{ fontSize: '11px', color: TIER_COLORS.admin }}>Unlimited</span>
          ) : usage.tokens_limit !== null ? (
            <span style={{ fontSize: '11px', opacity: 0.5 }}>
              {formatNumber(usage.tokens_limit - usage.tokens_used)} remaining
            </span>
          ) : (
            <span style={{ fontSize: '11px', opacity: 0.5 }}>BYOK — no limit</span>
          )}
        </div>
        {account.tier === 'admin' ? <FullWidthBar /> :
          usage.tokens_limit !== null ? <UsageBar used={usage.tokens_used} limit={usage.tokens_limit} accent /> : null
        }

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <button onClick={() => onNavigate('usage')} style={s.link}>
            View detailed usage &rarr;
          </button>
          {account.tier === 'free' && (
            <button onClick={() => onNavigate('billing')} style={{ ...s.link, opacity: 0.6 }}>
              Upgrade for 10M+ tokens
            </button>
          )}
        </div>
      </div>

      {/* Coming Soon cards */}
      <div style={s.statsGrid}>
        <div style={s.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.5 }}>{'\u{1F517}'} Connections</div>
            <span style={s.comingSoonBadge}>Coming Soon</span>
          </div>
          <div style={{ fontSize: '11px', opacity: 0.5 }}>
            Connect GitHub, Email, Slack, and Discord — all from one place.
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={s.statsGrid}>
        <button onClick={() => onNavigate('billing')} style={{ ...s.section, cursor: 'pointer', textAlign: 'left', border: '1px solid var(--theia-panel-border)' }}>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>Manage Billing</div>
        </button>
        <button onClick={() => onNavigate('settings')} style={{ ...s.section, cursor: 'pointer', textAlign: 'left', border: '1px solid var(--theia-panel-border)' }}>
          <div style={{ fontSize: '12px', opacity: 0.7 }}>Settings</div>
        </button>
      </div>
    </div>
  );
}

// ── Usage Page ──────────────────────────────────────────────────────────────

function UsagePage({ account, onGetUsageSummary }: { account: AvaAccountInfo; onGetUsageSummary?: () => Promise<AvaUsageSummary> }) {
  const usage = account.usage ?? {
    tokens_used: 0, tokens_limit: null as number | null,
    requests_count: 0, period_start: null as string | null, period_end: null as string | null,
    free_tokens_used: 0, free_tokens_limit: 500_000,
  };

  const [summary, setSummary] = React.useState<AvaUsageSummary | null>(null);

  React.useEffect(() => {
    if (onGetUsageSummary) {
      onGetUsageSummary().then(setSummary).catch(() => {});
    }
  }, [onGetUsageSummary]);

  const periodLabel = usage.period_start
    ? `${formatDate(usage.period_start)} — ${formatDate(usage.period_end!)}`
    : 'No active period';

  const providers = summary ? Object.entries(summary.byProvider) : [];
  const maxProviderTokens = providers.length > 0
    ? Math.max(...providers.map(([, d]) => d.tokens))
    : 1;

  return (
    <div style={{ maxWidth: '600px' }}>
      <div style={s.pageHeader}>
        <div style={s.pageTitle}>Usage</div>
        <div style={s.pageSubtitle}>Track your token usage and request history.</div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
        <div style={s.statCard}>
          <div style={{ fontSize: '11px', opacity: 0.5 }}>Free Tokens</div>
          <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
            {formatNumber(Math.max(0, usage.free_tokens_limit - usage.free_tokens_used))}
          </div>
          <div style={{ fontSize: '9px', opacity: 0.4 }}>of {formatNumber(usage.free_tokens_limit)}</div>
        </div>
        <div style={s.statCard}>
          <div style={{ fontSize: '11px', opacity: 0.5 }}>Plan Tokens</div>
          <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
            {formatNumber(usage.tokens_used)}
          </div>
          <div style={{ fontSize: '9px', opacity: 0.4 }}>
            {usage.tokens_limit ? `of ${formatNumber(usage.tokens_limit)}` : 'used'}
          </div>
        </div>
        <div style={s.statCard}>
          <div style={{ fontSize: '11px', opacity: 0.5 }}>Requests</div>
          <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
            {usage.requests_count}
          </div>
          <div style={{ fontSize: '9px', opacity: 0.4 }}>this period</div>
        </div>
        <div style={s.statCard}>
          <div style={{ fontSize: '11px', opacity: 0.5 }}>Period</div>
          <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '4px' }}>
            {periodLabel}
          </div>
        </div>
      </div>

      {/* Token Bars */}
      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>
            Free Pool: {formatNumber(usage.free_tokens_used)} / {formatNumber(usage.free_tokens_limit)}
          </span>
          {account.tier === 'admin' ? (
            <span style={{ fontSize: '11px', color: TIER_COLORS.admin }}>Unlimited</span>
          ) : (
            <span style={{ fontSize: '11px', opacity: 0.5 }}>
              {((usage.free_tokens_used / usage.free_tokens_limit) * 100).toFixed(1)}%
            </span>
          )}
        </div>
        {account.tier === 'admin' ? <FullWidthBar /> : (
          <UsageBar used={usage.free_tokens_used} limit={usage.free_tokens_limit} />
        )}
        <div style={{ fontSize: '10px', opacity: 0.4, marginTop: '2px', marginBottom: '14px' }}>
          {account.tier === 'admin' ? 'No metering — admin tier' : '500K free tokens included every month. Resets monthly.'}
        </div>

        {(account.tier !== 'free' || usage.tokens_limit !== null) && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>
                {account.tier.charAt(0).toUpperCase() + account.tier.slice(1)} Plan: {formatNumber(usage.tokens_used)}
                {usage.tokens_limit !== null ? ` / ${formatNumber(usage.tokens_limit)}` : ''}
              </span>
              {account.tier === 'admin' ? (
                <span style={{ fontSize: '11px', color: TIER_COLORS.admin }}>Unlimited</span>
              ) : usage.tokens_limit !== null ? (
                <span style={{ fontSize: '11px', opacity: 0.5 }}>
                  {((usage.tokens_used / usage.tokens_limit) * 100).toFixed(1)}%
                </span>
              ) : (
                <span style={{ fontSize: '11px', opacity: 0.5 }}>BYOK — no limit</span>
              )}
            </div>
            {account.tier === 'admin' ? <FullWidthBar /> :
              usage.tokens_limit !== null ? <UsageBar used={usage.tokens_used} limit={usage.tokens_limit} accent /> : null
            }
          </>
        )}
      </div>

      {/* Usage by Provider (from local summary) */}
      {summary && (
        <div>
          <div style={{ ...s.sectionTitle, marginBottom: '8px' }}>Usage by Provider</div>
          {providers.length > 0 ? (
            providers.sort((a, b) => b[1].tokens - a[1].tokens).map(([name, data]) => {
              const pct = (data.tokens / maxProviderTokens) * 100;
              return (
                <div key={name} style={{ ...s.section, marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{name}</span>
                    <span style={{ fontSize: '11px', opacity: 0.5 }}>${data.cost.toFixed(4)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--theia-input-background)', overflow: 'hidden', marginBottom: '4px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(to right, #A855F7, #8B5CF6)', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: '10px', opacity: 0.5 }}>
                    {formatNumber(data.tokens)} tokens
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ ...s.section, textAlign: 'center' }}>
              <div style={{ fontSize: '11px', opacity: 0.5 }}>No usage data yet.</div>
            </div>
          )}

          {/* Today / Month summary */}
          <div style={{ ...s.statsGrid, marginTop: '12px' }}>
            <div style={s.statCard}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{formatNumber(summary.today.tokens)}</div>
              <div style={{ fontSize: '10px', opacity: 0.5 }}>Today (${summary.today.cost.toFixed(4)})</div>
            </div>
            <div style={s.statCard}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{formatNumber(summary.month.tokens)}</div>
              <div style={{ fontSize: '10px', opacity: 0.5 }}>This Month (${summary.month.cost.toFixed(4)})</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Billing Page ────────────────────────────────────────────────────────────

function BillingPage({ account }: { account: AvaAccountInfo }) {
  const usage = account.usage ?? {
    tokens_used: 0, tokens_limit: null as number | null,
    requests_count: 0, period_start: null as string | null, period_end: null as string | null,
    free_tokens_used: 0, free_tokens_limit: 500_000,
  };

  return (
    <div style={{ maxWidth: '600px' }}>
      <div style={s.pageHeader}>
        <div style={s.pageTitle}>Billing</div>
        <div style={s.pageSubtitle}>Manage your subscription and token usage.</div>
      </div>

      {/* Current Plan */}
      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <TierBadge tier={account.tier} />
          {usage.period_end && (
            <span style={{ fontSize: '11px', opacity: 0.5 }}>
              Renews {new Date(usage.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {/* Free Tokens */}
        <div style={{ marginBottom: '12px' }}>
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
          {account.tier === 'admin' ? <FullWidthBar /> : (
            <UsageBar used={usage.free_tokens_used} limit={usage.free_tokens_limit} />
          )}
        </div>

        {/* Plan Tokens */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>
              {account.tier.charAt(0).toUpperCase() + account.tier.slice(1)} Plan
            </span>
            {account.tier === 'admin' ? (
              <span style={{ fontSize: '11px', color: TIER_COLORS.admin }}>Unlimited</span>
            ) : usage.tokens_limit !== null ? (
              <span style={{ fontSize: '11px', opacity: 0.5 }}>
                {formatNumber(usage.tokens_limit - usage.tokens_used)} remaining
              </span>
            ) : (
              <span style={{ fontSize: '11px', opacity: 0.5 }}>BYOK — no limit</span>
            )}
          </div>
          {account.tier === 'admin' ? <FullWidthBar /> :
            usage.tokens_limit !== null ? <UsageBar used={usage.tokens_used} limit={usage.tokens_limit} accent /> : null
          }
        </div>

        {account.tier !== 'free' && account.tier !== 'admin' && (
          <a
            href="https://ava-supernova.com/dashboard/billing"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...s.btnSecondary, display: 'inline-block', textDecoration: 'none' }}
          >
            Manage Subscription &rarr;
          </a>
        )}
      </div>

      {/* Top-ups (Pro only) */}
      {account.tier === 'pro' && (
        <div style={s.section}>
          <div style={s.label}>Top Up Tokens</div>
          <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '10px' }}>
            Running low? Add extra tokens — they never expire.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
            {TOPUP_PACKAGES.map(pkg => (
              <a
                key={pkg.id}
                href={`https://ava-supernova.com/dashboard/billing?topup=${pkg.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...s.statCard,
                  textAlign: 'center',
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ava-accent, #A855F7)' }}>{pkg.price}</div>
                <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>{pkg.label}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade Cards */}
      {account.tier !== 'ultra' && account.tier !== 'admin' && (
        <div style={{ display: 'grid', gridTemplateColumns: account.tier === 'free' ? '1fr 1fr' : '1fr', gap: '10px' }}>
          {account.tier === 'free' && (
            <UpgradeCard title="Pro" price="$19" period="/mo" features={PLAN_FEATURES.pro} highlight={false} />
          )}
          <UpgradeCard title="Ultra" price="$49" period="/mo" features={PLAN_FEATURES.ultra} highlight={true} />
        </div>
      )}
    </div>
  );
}

function UpgradeCard({ title, price, period, features, highlight }: {
  title: string; price: string; period: string; features: string[]; highlight: boolean;
}) {
  return (
    <div style={{
      ...s.section,
      border: highlight ? '1px solid rgba(168, 85, 247, 0.4)' : undefined,
    }}>
      <TierBadge tier={title.toLowerCase()} />
      <div style={{ marginTop: '8px' }}>
        <span style={{ fontSize: '22px', fontWeight: 700 }}>{price}</span>
        <span style={{ fontSize: '11px', opacity: 0.5 }}>{period}</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
        {features.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', opacity: 0.7, marginBottom: '4px' }}>
            <span style={{ color: 'var(--ava-accent, #A855F7)', flexShrink: 0 }}>{'\u2713'}</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <a
        href={`https://ava-supernova.com/dashboard/billing?plan=${title.toLowerCase()}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          ...s.btn,
          display: 'block',
          textAlign: 'center',
          textDecoration: 'none',
          width: '100%',
          boxSizing: 'border-box',
          ...(highlight ? { background: 'linear-gradient(to right, #A855F7, #8B5CF6)' } : {}),
        }}
      >
        Upgrade to {title}
      </a>
    </div>
  );
}

// ── Settings Page ───────────────────────────────────────────────────────────

function SettingsPage({ state, onSaveProviderKey, onRemoveProviderKey, onSavePreferences, onGetUsageSummary }: {
  state: DashboardState;
  onSaveProviderKey: AvaDashboardAppProps['onSaveProviderKey'];
  onRemoveProviderKey: AvaDashboardAppProps['onRemoveProviderKey'];
  onSavePreferences: AvaDashboardAppProps['onSavePreferences'];
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
  const configuredCount = Object.values(state.providerKeys).filter(Boolean).length;

  return (
    <div style={{ maxWidth: '600px' }}>
      <div style={s.pageHeader}>
        <div style={s.pageTitle}>Settings</div>
        <div style={s.pageSubtitle}>
          {!state.platformKeyConnected
            ? 'Configure your API providers and preferences.'
            : 'Preferences for Ava | Supernova.'}
        </div>
      </div>

      {/* Error */}
      {state.error && <div style={s.error}>{state.error}</div>}

      {/* Usage summary (BYOK mode — platform accounts see Usage page) */}
      {!state.platformKeyConnected && onGetUsageSummary && (
        <UsageSummaryCard onGetUsageSummary={onGetUsageSummary} />
      )}

      {/* Provider Keys */}
      <div style={s.label}>
        API Providers {configuredCount > 0 && `\u2014 ${configuredCount}/${PROVIDERS.length} configured`}
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
      <div style={{ borderTop: '1px solid var(--theia-panel-border)', margin: '8px 0' }} />
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
                background: localSettings.permissionMode === mode.value ? 'rgba(168, 85, 247, 0.1)' : 'transparent',
                border: localSettings.permissionMode === mode.value ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid transparent',
              }}
            >
              <input
                type="radio"
                checked={localSettings.permissionMode === mode.value}
                onChange={() => updateSetting('permissionMode', mode.value as AvaDashboardSettings['permissionMode'])}
                style={{ accentColor: 'var(--ava-accent, #A855F7)' }}
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
            style={{ flex: 1, accentColor: 'var(--ava-accent, #A855F7)' }}
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

function UsageSummaryCard({ onGetUsageSummary }: { onGetUsageSummary: () => Promise<AvaUsageSummary> }) {
  const [summary, setSummary] = React.useState<AvaUsageSummary | null>(null);

  React.useEffect(() => {
    onGetUsageSummary().then(setSummary).catch(() => {});
  }, [onGetUsageSummary]);

  if (!summary) return null;

  const formatCost = (cost: number) => cost > 0 ? `$${cost.toFixed(4)}` : '$0.00';
  const providers = Object.entries(summary.byProvider);

  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>Usage</div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
        <div style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'var(--theia-input-background)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{formatNumber(summary.today.tokens)}</div>
          <div style={{ fontSize: '10px', opacity: 0.5 }}>Today ({formatCost(summary.today.cost)})</div>
        </div>
        <div style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'var(--theia-input-background)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{formatNumber(summary.month.tokens)}</div>
          <div style={{ fontSize: '10px', opacity: 0.5 }}>This Month ({formatCost(summary.month.cost)})</div>
        </div>
      </div>
      {providers.length > 0 && (
        <div style={{ fontSize: '11px', opacity: 0.6 }}>
          {providers.map(([name, data]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>{name}</span>
              <span>{formatNumber(data.tokens)} · {formatCost(data.cost)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Memory page ─────────────────────────────────────────────────────────────

function MemoryPage({ onGetMemory, onSaveMemory, onClearMemory }: {
  onGetMemory: () => Promise<{ global: string | null; project: string | null }>;
  onSaveMemory: (scope: 'global' | 'project', content: string) => Promise<void>;
  onClearMemory: (scope: 'global' | 'project') => Promise<void>;
}) {
  const [activeTab, setActiveTab] = React.useState<'global' | 'project'>('global');
  const [globalMemory, setGlobalMemory] = React.useState<string | null>(null);
  const [projectMemory, setProjectMemory] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState('');
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    onGetMemory().then(({ global, project }) => {
      setGlobalMemory(global);
      setProjectMemory(project);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const currentContent = activeTab === 'global' ? globalMemory : projectMemory;

  const handleEdit = () => {
    setEditContent(currentContent ?? '');
    setEditing(true);
  };

  const handleSave = async () => {
    await onSaveMemory(activeTab, editContent);
    if (activeTab === 'global') setGlobalMemory(editContent);
    else setProjectMemory(editContent);
    setEditing(false);
  };

  const handleClear = async () => {
    if (confirmClear) {
      await onClearMemory(activeTab);
      if (activeTab === 'global') setGlobalMemory(null);
      else setProjectMemory(null);
      setConfirmClear(false);
      setEditing(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const handleTabSwitch = (tab: 'global' | 'project') => {
    setActiveTab(tab);
    setEditing(false);
    setConfirmClear(false);
  };

  if (loading) {
    return <div style={{ padding: '20px', opacity: 0.5, fontSize: '12px' }}>Loading memory...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <div style={s.pageTitle}>Memory</div>
        <div style={s.pageSubtitle}>Persistent knowledge that Ava remembers across sessions</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '12px', borderBottom: '1px solid var(--theia-panel-border, rgba(255,255,255,0.08))' }}>
        {(['global', 'project'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => handleTabSwitch(tab)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--ava-accent, #A855F7)' : '2px solid transparent',
              background: 'transparent',
              color: 'var(--theia-foreground, #e0e0e0)',
              opacity: activeTab === tab ? 1 : 0.5,
              cursor: 'pointer',
              fontSize: '12px',
              fontFamily: 'inherit',
            }}
          >
            {tab === 'global' ? 'Global' : 'Project'}
          </button>
        ))}
      </div>

      {/* Path hint */}
      <div style={{ fontSize: '10px', opacity: 0.4, marginBottom: '10px' }}>
        {activeTab === 'global' ? '~/.ava/memory.md' : '.ava/memory.md'}
      </div>

      {/* Content */}
      <div style={s.section}>
        {editing ? (
          <textarea
            autoFocus
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{
              width: '100%',
              minHeight: '240px',
              padding: '8px',
              border: '1px solid var(--theia-input-border, rgba(255,255,255,0.1))',
              borderRadius: '4px',
              background: 'var(--theia-input-background, rgba(0,0,0,0.2))',
              color: 'var(--theia-input-foreground, #e0e0e0)',
              fontFamily: 'var(--theia-editor-font-family, monospace)',
              fontSize: '12px',
              lineHeight: '1.5',
              resize: 'vertical' as const,
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        ) : currentContent ? (
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap' as const,
            fontFamily: 'var(--theia-editor-font-family, monospace)',
            fontSize: '12px',
            lineHeight: '1.5',
            opacity: 0.9,
          }}>{currentContent}</pre>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', opacity: 0.5, fontSize: '12px' }}>
            {activeTab === 'global'
              ? 'No global memories yet. Ava will save memories as you work together.'
              : 'No project memories yet. Ava will save project-specific patterns here.'}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        {editing ? (
          <>
            <button style={s.btnSmall} onClick={handleSave}>Save</button>
            <button style={s.btnSecondary} onClick={() => { setEditing(false); setConfirmClear(false); }}>Cancel</button>
          </>
        ) : (
          <>
            <button style={s.btnSmall} onClick={handleEdit}>Edit</button>
            {currentContent && (
              <button
                style={confirmClear ? { ...s.btnSmall, background: 'var(--theia-errorForeground, #e53935)' } : s.btnSecondary}
                onClick={handleClear}
              >
                {confirmClear ? 'Confirm Clear' : 'Clear'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main app ────────────────────────────────────────────────────────────────

export function AvaDashboardApp(props: AvaDashboardAppProps) {
  const { state, onSaveProviderKey, onRemoveProviderKey, onSavePreferences, onConnectAccount, onDisconnectAccount } = props;

  const hasAnyProvider = Object.values(state.providerKeys).some(Boolean);
  const hasPlatform = state.platformKeyConnected;
  const hasAccess = hasPlatform || hasAnyProvider;

  const [page, setPage] = React.useState<DashboardPage | 'connect'>(
    !hasAccess ? 'connect' : hasPlatform ? 'overview' : 'settings',
  );
  const [updateAvailable, setUpdateAvailable] = React.useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'error'>('idle');

  const doCheckForUpdates = React.useCallback(() => {
    if (!props.onCheckForUpdates) return;
    setUpdateStatus('checking');
    props.onCheckForUpdates().then(result => {
      if (result) {
        setUpdateAvailable(result.version);
        setUpdateStatus('available');
      } else {
        setUpdateStatus('up-to-date');
        setTimeout(() => setUpdateStatus('idle'), 5000);
      }
    }).catch(() => {
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 5000);
    });
  }, [props.onCheckForUpdates]);

  React.useEffect(() => {
    if (hasAccess && page === 'connect') {
      setPage(hasPlatform ? 'overview' : 'settings');
    }
  }, [hasAccess, hasPlatform]);

  // Check for updates on mount
  React.useEffect(() => {
    doCheckForUpdates();
  }, []);

  if (!state.initialized) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
        Loading...
      </div>
    );
  }

  // Connect page — no sidebar
  if (page === 'connect' || !hasAccess) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        <ConnectAccount
          onConnect={onConnectAccount}
          onSkip={() => setPage('settings')}
          error={state.error}
        />
      </div>
    );
  }

  const renderPage = () => {
    switch (page) {
      case 'overview':
        if (hasPlatform && state.account) {
          return <OverviewPage account={state.account} onNavigate={setPage} />;
        }
        return <SettingsPage state={state} onSaveProviderKey={onSaveProviderKey} onRemoveProviderKey={onRemoveProviderKey} onSavePreferences={onSavePreferences} onGetUsageSummary={props.onGetUsageSummary} />;
      case 'usage':
        if (hasPlatform && state.account) {
          return <UsagePage account={state.account} onGetUsageSummary={props.onGetUsageSummary} />;
        }
        return <SettingsPage state={state} onSaveProviderKey={onSaveProviderKey} onRemoveProviderKey={onRemoveProviderKey} onSavePreferences={onSavePreferences} onGetUsageSummary={props.onGetUsageSummary} />;
      case 'memory':
        if (props.onGetMemory && props.onSaveMemory && props.onClearMemory) {
          return <MemoryPage onGetMemory={props.onGetMemory} onSaveMemory={props.onSaveMemory} onClearMemory={props.onClearMemory} />;
        }
        return <SettingsPage state={state} onSaveProviderKey={onSaveProviderKey} onRemoveProviderKey={onRemoveProviderKey} onSavePreferences={onSavePreferences} onGetUsageSummary={props.onGetUsageSummary} />;
      case 'billing':
        if (hasPlatform && state.account) {
          return <BillingPage account={state.account} />;
        }
        return <SettingsPage state={state} onSaveProviderKey={onSaveProviderKey} onRemoveProviderKey={onRemoveProviderKey} onSavePreferences={onSavePreferences} onGetUsageSummary={props.onGetUsageSummary} />;
      case 'settings':
      default:
        return <SettingsPage state={state} onSaveProviderKey={onSaveProviderKey} onRemoveProviderKey={onRemoveProviderKey} onSavePreferences={onSavePreferences} onGetUsageSummary={props.onGetUsageSummary} />;
    }
  };

  return (
    <div style={s.container}>
      <NavSidebar
        currentPage={page as DashboardPage}
        onNavigate={setPage}
        mode={hasPlatform ? 'platform' : 'byok'}
        email={state.account?.email}
        onDisconnect={onDisconnectAccount}
        onConnect={() => setPage('connect')}
        onCheckForUpdates={doCheckForUpdates}
        updateStatus={updateStatus}
      />
      <div style={s.main}>
        {/* Update status bar */}
        {updateStatus === 'available' && updateAvailable ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--theia-foreground, #e0e0e0)' }}>
              Update available: <strong>v{updateAvailable}</strong>
            </span>
            <a
              href={`https://github.com/AugmentedValueAcceleration/ava-supernova-ide/releases/download/v${updateAvailable}/Ava.Supernova.Setup.${updateAvailable}.exe`}
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                background: 'var(--ava-accent, #A855F7)', color: '#fff', textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Download
            </a>
          </div>
        ) : updateStatus === 'checking' ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.15)',
          }}>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>Checking for updates...</span>
          </div>
        ) : updateStatus === 'up-to-date' ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)',
          }}>
            <span style={{ fontSize: '12px', color: 'rgba(34, 197, 94, 0.9)' }}>You're up to date!</span>
          </div>
        ) : null}
        {renderPage()}
      </div>
    </div>
  );
}
