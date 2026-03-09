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
  onGetCurrentVersion?: () => Promise<string>;
  onCheckForUpdates?: () => Promise<{ version: string } | null>;
  onDownloadUpdate?: () => Promise<boolean>;
  onInstallUpdate?: () => Promise<void>;
}

// ── Types ────────────────────────────────────────────────────────────────────

type DashboardPage = 'overview' | 'usage' | 'memory' | 'connections' | 'billing' | 'docs' | 'settings';

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
  { page: 'docs', label: 'Documentation', icon: '\u{1F4D6}' },
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

function NavSidebar({ currentPage, onNavigate, mode, email, onDisconnect, onConnect, onCheckForUpdates, updateStatus, version }: {
  currentPage: DashboardPage;
  onNavigate: (page: DashboardPage) => void;
  mode: 'platform' | 'byok';
  email?: string | null;
  onDisconnect: () => void;
  onConnect: () => void;
  onCheckForUpdates?: () => void;
  updateStatus?: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
  version?: string;
}) {
  const visibleItems = mode === 'byok'
    ? NAV_ITEMS.filter(item => !item.platformOnly)
    : NAV_ITEMS;

  return (
    <div style={s.sidebar}>
      <div style={s.sidebarLogo}>
        <span style={s.logoText}>Ava</span>
        <span style={s.logoSub}>Supernova</span>
        {version && <span style={{ fontSize: '9px', opacity: 0.4, marginTop: '2px' }}>v{version}</span>}
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
            disabled={updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing'}
            style={{
              width: '100%', padding: '5px 10px', marginBottom: '10px',
              fontSize: '11px', fontWeight: 500, borderRadius: '4px',
              background: 'transparent', color: 'var(--theia-foreground, #e0e0e0)',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing' ? 'default' : 'pointer',
              opacity: updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing' ? 0.5 : 0.7,
              transition: 'opacity 0.15s',
            }}
          >
            {updateStatus === 'checking' ? 'Checking...'
              : updateStatus === 'downloading' ? 'Downloading...'
              : updateStatus === 'installing' ? 'Installing...'
              : 'Check for Updates'}
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
            onClick={(e) => { e.preventDefault(); window.open('https://ava-supernova.com/dashboard/billing', '_blank'); }}
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

// ── Documentation Page ──────────────────────────────────────────────────────

type DocsTab = 'getting-started' | 'choosing-model' | 'models' | 'tools' | 'memory' | 'commands' | 'modes' | 'permissions' | 'config' | 'project-context' | 'languages' | 'shortcuts';

const DOC_TABS: Array<{ id: DocsTab; label: string }> = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'choosing-model', label: 'Choosing Your Model' },
  { id: 'models', label: 'Models' },
  { id: 'tools', label: 'Tools' },
  { id: 'memory', label: 'Memory' },
  { id: 'commands', label: 'Commands' },
  { id: 'modes', label: 'Modes' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'config', label: 'Configuration' },
  { id: 'project-context', label: 'Project Context' },
  { id: 'languages', label: 'Languages' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts' },
];

const docStyles = {
  tabBar: {
    display: 'flex',
    gap: '2px',
    padding: '3px',
    borderRadius: '8px',
    border: '1px solid var(--theia-panel-border)',
    background: 'var(--theia-input-background)',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  },
  tab: (active: boolean) => ({
    flex: '1 1 auto',
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none' as const,
    cursor: 'pointer' as const,
    fontSize: '11px',
    fontWeight: active ? 600 : 400 as const,
    fontFamily: 'var(--theia-ui-font-family)',
    background: active ? 'var(--ava-accent, #A855F7)' : 'transparent',
    color: active ? '#fff' : 'var(--theia-foreground)',
    opacity: active ? 1 : 0.6,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  }),
  card: {
    border: '1px solid var(--theia-panel-border)',
    borderRadius: '8px',
    padding: '12px',
    background: 'rgba(168, 85, 247, 0.02)',
    marginBottom: '10px',
  },
  cardTitle: {
    fontSize: '12px',
    fontWeight: 600 as const,
    color: 'var(--ava-accent, #A855F7)',
    marginBottom: '6px',
  },
  cardText: {
    fontSize: '11px',
    opacity: 0.7,
    lineHeight: '1.5',
  },
  table: {
    width: '100%',
    fontSize: '11px',
    borderCollapse: 'collapse' as const,
  },
  th: {
    textAlign: 'left' as const,
    padding: '6px 8px',
    fontSize: '9px',
    fontWeight: 700 as const,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: 'var(--ava-accent, #A855F7)',
    borderBottom: '1px solid var(--theia-panel-border)',
  },
  td: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--theia-panel-border)',
    opacity: 0.8,
  },
  tdBold: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--theia-panel-border)',
    fontWeight: 600 as const,
  },
  badge: (color: string) => ({
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600 as const,
    background: color === 'safe' ? 'rgba(34, 197, 94, 0.15)' : color === 'write' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    color: color === 'safe' ? '#22c55e' : color === 'write' ? '#eab308' : '#ef4444',
  }),
  code: {
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '2px 5px',
    borderRadius: '3px',
    background: 'var(--theia-input-background)',
    border: '1px solid var(--theia-panel-border)',
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '10px',
    borderRadius: '6px',
    background: 'var(--theia-input-background)',
    border: '1px solid var(--theia-panel-border)',
    overflowX: 'auto' as const,
    whiteSpace: 'pre' as const,
    lineHeight: '1.5',
    marginTop: '8px',
  },
  tip: {
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    background: 'rgba(34, 197, 94, 0.05)',
    marginBottom: '12px',
  },
  tipTitle: {
    fontSize: '11px',
    fontWeight: 600 as const,
    color: '#22c55e',
    marginBottom: '4px',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginBottom: '12px',
  },
  modelTag: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600 as const,
    border: '1px solid var(--theia-panel-border)',
    marginRight: '4px',
    marginBottom: '4px',
  },
  sectionHeading: {
    fontSize: '14px',
    fontWeight: 700 as const,
    marginBottom: '8px',
    marginTop: '16px',
    borderBottom: '1px solid var(--theia-panel-border)',
    paddingBottom: '6px',
    color: 'var(--ava-accent, #A855F7)',
  },
};

function DocsPage() {
  const [activeTab, setActiveTab] = React.useState<DocsTab>('getting-started');

  return (
    <div>
      <div style={s.pageHeader}>
        <div style={s.pageTitle}>Documentation</div>
        <div style={s.pageSubtitle}>Full reference guide for Ava | Supernova</div>
      </div>

      {/* Tab bar */}
      <div style={docStyles.tabBar}>
        {DOC_TABS.map(tab => (
          <button key={tab.id} style={docStyles.tab(activeTab === tab.id)} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'getting-started' && <DocsGettingStarted />}
      {activeTab === 'choosing-model' && <DocsChoosingModel />}
      {activeTab === 'models' && <DocsModels />}
      {activeTab === 'tools' && <DocsTools />}
      {activeTab === 'memory' && <DocsMemory />}
      {activeTab === 'commands' && <DocsCommands />}
      {activeTab === 'modes' && <DocsModes />}
      {activeTab === 'permissions' && <DocsPermissions />}
      {activeTab === 'config' && <DocsConfig />}
      {activeTab === 'project-context' && <DocsProjectContext />}
      {activeTab === 'languages' && <DocsLanguages />}
      {activeTab === 'shortcuts' && <DocsKeyboardShortcuts />}
    </div>
  );
}

function DocsGettingStarted() {
  return (
    <div>
      <div style={docStyles.tip}>
        <div style={docStyles.tipTitle}>New to Ava? Start here</div>
        <div style={docStyles.cardText}>
          <strong>GLM-4.5 Flash</strong> is free and a great way to try Ava with zero cost.
          Once you're comfortable, upgrade to <strong>Kimi K2.5</strong> or <strong>DeepSeek V3.2</strong> for stronger agentic coding at low cost.
        </div>
      </div>

      <div style={docStyles.sectionHeading}>Setup</div>
      <div style={docStyles.grid2}>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>1. Add an API Key</div>
          <div style={docStyles.cardText}>
            Go to <strong>Settings</strong> in the sidebar and add a key from any provider (DeepSeek, Kimi, GLM, Qwen, Mistral, or Anthropic).
            Or connect a platform account to skip this step.
          </div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>2. Start Coding</div>
          <div style={docStyles.cardText}>
            Open the Ava chat panel and start giving instructions. Ava reads your code, makes changes, runs commands, searches files, and more.
          </div>
        </div>
      </div>

      <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '8px' }}>
        See the <strong>Choosing Your Model</strong> tab for detailed model recommendations.
      </div>
    </div>
  );
}

function DocsModels() {
  return (
    <div>
      <div style={docStyles.cardText as React.CSSProperties}>
        All models work on every plan. Use our managed service or bring your own API keys.
        You can also connect to locally hosted models via Ollama, LM Studio, or any standard API format endpoint.
      </div>
      <div style={{ marginTop: '12px' }}>
        <table style={docStyles.table}>
          <thead>
            <tr>
              <th style={docStyles.th}>Provider</th>
              <th style={docStyles.th}>Model</th>
              <th style={docStyles.th}>Highlights</th>
              <th style={{ ...docStyles.th, textAlign: 'right' }}>Cost / 1M</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Anthropic', 'Claude Opus 4.6', 'Most capable, vision, 200K ctx', '$5.00 / $25.00'],
              ['Anthropic', 'Claude Sonnet 4.6', 'Best balance of speed & capability', '$3.00 / $15.00'],
              ['Anthropic', 'Claude Haiku 4.5', 'Fast and affordable, vision', '$1.00 / $5.00'],
              ['DeepSeek', 'DeepSeek V3.2', 'Best price/performance', '$0.28 / $0.42'],
              ['DeepSeek', 'DeepSeek V3.2 Reasoner', 'Extended thinking, reasoning', '$0.28 / $0.42'],
              ['Moonshot AI', 'Kimi K2.5', 'Best multi-step tool calling', '$0.60 / $3.00'],
              ['Zhipu AI', 'GLM-5', 'Best tool-call reliability, vision', '$1.00 / $3.20'],
              ['Zhipu AI', 'GLM-4.5 Flash', 'Free tier', 'Free'],
              ['Alibaba', 'Qwen 3.5 Plus', 'Vision, thinking, 256K context', '$0.40 / $2.40'],
              ['Mistral AI', 'Mistral Large 3', 'Flagship general-purpose', '$0.50 / $1.50'],
              ['Mistral AI', 'Codestral', 'Code-focused, 256K context', '$0.30 / $0.90'],
              ['Mistral AI', 'Devstral 2', 'Agentic coding specialist', '$0.40 / $2.00'],
            ].map(([provider, model, highlights, cost], i) => (
              <tr key={i}>
                <td style={docStyles.td}>{provider}</td>
                <td style={docStyles.tdBold}>{model}</td>
                <td style={docStyles.td}>{highlights}</td>
                <td style={{ ...docStyles.td, textAlign: 'right', fontFamily: 'monospace' }}>{cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ ...docStyles.sectionHeading, marginTop: '20px' }}>Custom Provider (Ollama / LM Studio)</div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Add a <span style={docStyles.code}>baseUrl</span> to connect to any locally hosted model:
      </div>
      <div style={docStyles.codeBlock}>{`{
  "providers": {
    "deepseek": {
      "apiKey": "sk-...",
      "baseUrl": "http://localhost:11434/v1"
    }
  }
}`}</div>
    </div>
  );
}

function DocsTools() {
  const tools = {
    'Reading & Searching': [
      ['file_read', 'Read files with line numbers. Supports offset and limit for large files.', 'safe'],
      ['glob', 'Find files matching glob patterns (e.g. **/*.ts).', 'safe'],
      ['grep', 'Search file contents with regex. Filter by file pattern.', 'safe'],
      ['list_directory', 'List directory contents with file sizes and types.', 'safe'],
      ['git_status', 'Read-only git commands (status, diff, log, branch, show).', 'safe'],
      ['git_diff', 'View detailed diffs between commits, branches, or working tree.', 'safe'],
      ['project_index', 'Index the project structure for intelligent code navigation.', 'safe'],
      ['find_symbol', 'Find symbols (functions, classes, variables) across the codebase.', 'safe'],
    ],
    'Writing & Editing': [
      ['file_write', 'Create or overwrite files. Auto-creates parent directories.', 'write'],
      ['file_edit', 'Exact string replacement. Supports single or global replace.', 'write'],
      ['bash', 'Execute shell commands with configurable timeout.', 'dangerous'],
      ['rollback', 'Undo file changes made during the current session.', 'write'],
    ],
    'Research & Browser': [
      ['web_search', 'Search the web via DuckDuckGo. No API key required.', 'safe'],
      ['http_request', 'Make HTTP requests (GET, POST, PUT, DELETE).', 'write'],
      ['browser', 'Open and interact with web pages using a headless browser.', 'write'],
      ['screenshot', 'Capture screenshots of the current screen or a URL.', 'safe'],
      ['database_query', 'Run read-only SQL queries against configured databases.', 'safe'],
    ],
    'Memory': [
      ['memory_save', 'Save knowledge to persistent memory (global or project scope).', 'write'],
      ['memory_recall', 'Search memories by keyword. Finds relevant stored knowledge.', 'safe'],
    ],
    'Collaboration': [
      ['present_plan', 'Present a structured plan for your approval.', 'safe'],
      ['todo_write', 'Track task progress with a structured to-do list.', 'safe'],
      ['ask_user', 'Ask you a question mid-task and wait for a response.', 'safe'],
    ],
  };

  return (
    <div>
      <div style={docStyles.cardText as React.CSSProperties}>
        The agent runs up to 50 iterations per request, deciding which tools to use, executing them, reading results, and continuing.
      </div>
      {Object.entries(tools).map(([group, items]) => (
        <div key={group}>
          <div style={docStyles.sectionHeading}>{group}</div>
          <table style={docStyles.table}>
            <thead>
              <tr>
                <th style={docStyles.th}>Tool</th>
                <th style={docStyles.th}>Description</th>
                <th style={{ ...docStyles.th, textAlign: 'center' }}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {items.map(([name, desc, risk]) => (
                <tr key={name}>
                  <td style={docStyles.tdBold}><span style={docStyles.code}>{name}</span></td>
                  <td style={docStyles.td}>{desc}</td>
                  <td style={{ ...docStyles.td, textAlign: 'center' }}><span style={docStyles.badge(risk)}>{risk}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function DocsCommands() {
  return (
    <div>
      <div style={docStyles.sectionHeading}>General</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Command</th>
            <th style={docStyles.th}>Aliases</th>
            <th style={docStyles.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['/help', '/h', 'Show all available commands'],
            ['/model', '/m', 'List available models'],
            ['/model <id>', '', 'Switch to a different model'],
            ['/clear', '/c', 'Clear conversation history'],
            ['/provider', '/p', 'List configured providers'],
            ['/provider add <name>', '', 'Add a provider API key'],
            ['/permission', '/perm', 'View or set permission mode'],
            ['/tools', '', 'List available tools'],
            ['/retry', '/r', 'Retry the last message'],
            ['/init', '', 'Create .ava/instructions.md'],
            ['/exit', '/quit, /q', 'Exit Ava'],
          ].map(([cmd, aliases, desc], i) => (
            <tr key={i}>
              <td style={docStyles.tdBold}><span style={docStyles.code}>{cmd}</span></td>
              <td style={docStyles.td}>{aliases || '\u2014'}</td>
              <td style={docStyles.td}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={docStyles.sectionHeading}>History</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Command</th>
            <th style={docStyles.th}>Aliases</th>
            <th style={docStyles.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['/history', '/ls', 'List saved conversations'],
            ['/resume <id>', '', 'Resume a saved conversation'],
            ['/search <query>', '/s', 'Search conversations'],
            ['/delete <id>', '/rm', 'Delete a conversation'],
            ['/rename <id> <title>', '', 'Rename a conversation'],
            ['/pin <id>', '', 'Pin a conversation'],
            ['/unpin <id>', '', 'Unpin a conversation'],
            ['/export <id>', '', 'Export as Markdown or JSON'],
          ].map(([cmd, aliases, desc], i) => (
            <tr key={i}>
              <td style={docStyles.tdBold}><span style={docStyles.code}>{cmd}</span></td>
              <td style={docStyles.td}>{aliases || '\u2014'}</td>
              <td style={docStyles.td}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocsModes() {
  return (
    <div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Ava has four operating modes that control what the agent can do. Switch modes from the dropdown in the chat input area.
      </div>
      <div style={{ ...docStyles.grid2, marginTop: '12px' }}>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Code Mode</div>
          <div style={docStyles.cardText}>Full agent with all tools enabled. Ava reads, writes, searches, and executes across your codebase. This is the default mode for getting work done.</div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Plan Mode</div>
          <div style={docStyles.cardText}>Read-only analysis. Ava reads your code and creates structured plans without modifying anything. Great for understanding a codebase before making changes.</div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Chat Mode</div>
          <div style={docStyles.cardText}>Conversation only, no tools. Discuss code, architecture, or ideas without Ava touching any files. Useful for brainstorming and Q&A.</div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Security Mode</div>
          <div style={docStyles.cardText}>AI-powered OWASP-aligned security audit. Scans your project for vulnerabilities, insecure patterns, and common security issues.</div>
        </div>
      </div>
      <div style={{ fontSize: '11px', opacity: 0.5 }}>
        Modes affect which tools are available. Permissions (see <strong>Permissions</strong> tab) control whether tools require confirmation.
      </div>
    </div>
  );
}

function DocsConfig() {
  return (
    <div>
      <div style={docStyles.sectionHeading}>Settings</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Setting</th>
            <th style={docStyles.th}>Description</th>
            <th style={docStyles.th}>Default</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Active Model', 'The model Ava uses for responses', '(none)'],
            ['Providers > API Key', 'Your API key for each provider', '(empty)'],
            ['Temperature', 'Sampling temperature (0\u20132)', '0.7'],
            ['Language', 'UI and response language', 'Auto-detect'],
            ['Permission Mode', 'Tool approval behaviour', 'Strict'],
            ['Max Tokens', 'Maximum output tokens per response', '8192'],
            ['Auto Memory', 'Enable/disable automatic memory persistence', 'Enabled'],
            ['Stream Responses', 'Enable/disable streaming output', 'Enabled'],
          ].map(([setting, desc, def], i) => (
            <tr key={i}>
              <td style={docStyles.tdBold}>{setting}</td>
              <td style={docStyles.td}>{desc}</td>
              <td style={{ ...docStyles.td, fontStyle: 'italic' }}>{def}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={docStyles.sectionHeading}>Configuration File</div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Stored at <span style={docStyles.code}>~/.ava/config.json</span>:
      </div>
      <div style={docStyles.codeBlock}>{`{
  "activeModel": "deepseek:deepseek-chat",
  "providers": {
    "anthropic": { "apiKey": "sk-ant-..." },
    "deepseek": { "apiKey": "sk-..." },
    "kimi": { "apiKey": "sk-..." },
    "glm": { "apiKey": "..." },
    "qwen": { "apiKey": "sk-..." },
    "mistral": { "apiKey": "..." }
  },
  "preferences": {
    "temperature": 0.7,
    "maxTokens": 8192,
    "language": "auto"
  }
}`}</div>

    </div>
  );
}

function DocsChoosingModel() {
  return (
    <div>
      <div style={docStyles.tip}>
        <div style={docStyles.tipTitle}>Not sure which model to pick?</div>
        <div style={docStyles.cardText}>
          Start with <strong>GLM-4.5 Flash</strong> (free) to try Ava, then upgrade to <strong>Kimi K2.5</strong> or <strong>DeepSeek V3.2</strong> for stronger agentic coding.
        </div>
      </div>

      <div style={docStyles.sectionHeading}>Recommendations</div>
      <div style={docStyles.grid2}>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Best for Agentic Coding</div>
          <div style={{ marginBottom: '6px' }}>
            <span style={docStyles.modelTag}>Kimi K2.5</span>
            <span style={docStyles.modelTag}>GLM-5</span>
          </div>
          <div style={docStyles.cardText}>
            Multi-step tool calling, file editing, and complex project work. Kimi K2.5 scores 76.8% on SWE-Bench. GLM-5 leads at 77.8%.
          </div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Best Value</div>
          <div style={{ marginBottom: '6px' }}>
            <span style={docStyles.modelTag}>DeepSeek V3.2</span>
            <span style={docStyles.modelTag}>GLM-4.5 Flash</span>
          </div>
          <div style={docStyles.cardText}>
            Strong coding at a fraction of frontier pricing. DeepSeek V3.2 is $0.28/$0.42 per 1M tokens. GLM-4.5 Flash is completely free.
          </div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Best Reasoning</div>
          <div style={{ marginBottom: '6px' }}>
            <span style={docStyles.modelTag}>DeepSeek R1</span>
          </div>
          <div style={docStyles.cardText}>
            Chain-of-thought reasoning for complex logic, math, and architecture decisions. Extended thinking produces step-by-step analysis.
          </div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Frontier Intelligence</div>
          <div style={{ marginBottom: '6px' }}>
            <span style={docStyles.modelTag}>Claude Opus 4.6</span>
            <span style={docStyles.modelTag}>Claude Sonnet 4.6</span>
          </div>
          <div style={docStyles.cardText}>
            Most capable overall with vision support. Bring your own Anthropic API key (BYOK). Best for complex, high-stakes tasks.
          </div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Best for Code</div>
          <div style={{ marginBottom: '6px' }}>
            <span style={docStyles.modelTag}>Codestral 25.08</span>
            <span style={docStyles.modelTag}>Devstral 2</span>
          </div>
          <div style={docStyles.cardText}>
            Dedicated code models with 256K context. Codestral excels at code generation, Devstral is optimized for agentic coding workflows.
          </div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Best Long Context</div>
          <div style={{ marginBottom: '6px' }}>
            <span style={docStyles.modelTag}>Qwen 3.5 Plus</span>
            <span style={docStyles.modelTag}>Mistral Large 3</span>
          </div>
          <div style={docStyles.cardText}>
            256K context window for navigating large codebases. Read entire repositories without losing track of distant references.
          </div>
        </div>
      </div>

      <div style={docStyles.sectionHeading}>Quick Comparison</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Need</th>
            <th style={docStyles.th}>Best Pick</th>
            <th style={{ ...docStyles.th, textAlign: 'right' }}>Cost / 1M tokens</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={docStyles.td}>Free to try</td><td style={docStyles.tdBold}>GLM-4.5 Flash</td><td style={{ ...docStyles.td, textAlign: 'right', fontFamily: 'monospace' }}>Free</td></tr>
          <tr><td style={docStyles.td}>Cheapest paid</td><td style={docStyles.tdBold}>DeepSeek V3.2</td><td style={{ ...docStyles.td, textAlign: 'right', fontFamily: 'monospace' }}>$0.28 / $0.42</td></tr>
          <tr><td style={docStyles.td}>Best tool calling</td><td style={docStyles.tdBold}>Kimi K2.5</td><td style={{ ...docStyles.td, textAlign: 'right', fontFamily: 'monospace' }}>$0.60 / $3.00</td></tr>
          <tr><td style={docStyles.td}>Best SWE-Bench</td><td style={docStyles.tdBold}>GLM-5</td><td style={{ ...docStyles.td, textAlign: 'right', fontFamily: 'monospace' }}>$1.00 / $3.20</td></tr>
          <tr><td style={docStyles.td}>Best reasoning</td><td style={docStyles.tdBold}>DeepSeek R1</td><td style={{ ...docStyles.td, textAlign: 'right', fontFamily: 'monospace' }}>$0.55 / $2.19</td></tr>
          <tr><td style={docStyles.td}>Longest context</td><td style={docStyles.tdBold}>Codestral / Qwen / Devstral</td><td style={{ ...docStyles.td, textAlign: 'right', fontFamily: 'monospace' }}>256K tokens</td></tr>
          <tr><td style={docStyles.td}>Maximum quality</td><td style={docStyles.tdBold}>Claude Opus 4.6</td><td style={{ ...docStyles.td, textAlign: 'right', fontFamily: 'monospace' }}>$5.00 / $25.00</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function DocsMemory() {
  return (
    <div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Ava remembers important context across sessions using persistent memory files. Memories are loaded automatically at the start of each conversation.
      </div>

      <div style={{ ...docStyles.grid2, marginTop: '12px' }}>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Global Memory</div>
          <div style={docStyles.cardText}>
            Stored at <span style={docStyles.code}>~/.ava/memory.md</span>. Contains your preferences and knowledge that apply across all projects.
            Things like your coding style, preferred frameworks, and general instructions.
          </div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Project Memory</div>
          <div style={docStyles.cardText}>
            Stored at <span style={docStyles.code}>.ava/memory.md</span> in the project root. Project-specific context like architecture decisions,
            key patterns, and things Ava should always know about this codebase.
          </div>
        </div>
      </div>

      <div style={docStyles.sectionHeading}>How It Works</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Tool</th>
            <th style={docStyles.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={docStyles.tdBold}><span style={docStyles.code}>memory_save</span></td>
            <td style={docStyles.td}>Saves knowledge to persistent memory (global or project scope). Ava uses this automatically when it learns something important.</td>
          </tr>
          <tr>
            <td style={docStyles.tdBold}><span style={docStyles.code}>memory_recall</span></td>
            <td style={docStyles.td}>Searches stored knowledge by keyword. Finds relevant memories to inform the current task.</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '8px' }}>
        Memories auto-load at the start of each session. You can also edit memory files directly or use the Memory page in this dashboard.
      </div>

      <div style={docStyles.sectionHeading}>Cloud Sync</div>
      <div style={docStyles.card}>
        <div style={docStyles.cardText}>
          With a platform account, your memories sync across machines automatically. Work on your desktop, pick up where you left off on your laptop.
        </div>
      </div>
    </div>
  );
}

function DocsPermissions() {
  return (
    <div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Permission modes control which tool actions require your confirmation before executing. This gives you fine-grained control over what Ava can do autonomously.
      </div>

      <div style={{ ...docStyles.sectionHeading, marginTop: '12px' }}>Permission Modes</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Mode</th>
            <th style={{ ...docStyles.th, textAlign: 'center' }}>File Reads</th>
            <th style={{ ...docStyles.th, textAlign: 'center' }}>File Writes</th>
            <th style={{ ...docStyles.th, textAlign: 'center' }}>Shell Commands</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={docStyles.tdBold}>Strict</td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}><span style={docStyles.badge('safe')}>auto</span></td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}>Confirm</td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}>Confirm</td>
          </tr>
          <tr>
            <td style={docStyles.tdBold}>Balanced</td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}><span style={docStyles.badge('safe')}>auto</span></td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}><span style={docStyles.badge('safe')}>auto</span></td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}>Confirm</td>
          </tr>
          <tr>
            <td style={docStyles.tdBold}>Autonomous</td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}><span style={docStyles.badge('safe')}>auto</span></td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}><span style={docStyles.badge('safe')}>auto</span></td>
            <td style={{ ...docStyles.td, textAlign: 'center' }}><span style={docStyles.badge('safe')}>auto</span></td>
          </tr>
        </tbody>
      </table>

      <div style={{ ...docStyles.sectionHeading, marginTop: '16px' }}>Session Overrides</div>
      <div style={docStyles.grid2}>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Always Allow</div>
          <div style={docStyles.cardText}>Grant per-tool approval for the current session. For example, always allow file_write without asking each time.</div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Allow All</div>
          <div style={docStyles.cardText}>Blanket approval for all tools for the current session. Useful when you trust the current task and want Ava to work uninterrupted.</div>
        </div>
      </div>

      <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>
        Plans and questions always require your approval, regardless of permission mode. Session overrides reset when you start a new conversation.
      </div>
    </div>
  );
}

function DocsProjectContext() {
  return (
    <div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Give Ava persistent knowledge about your codebase by creating a project instructions file. This is loaded into Ava's system prompt every session.
      </div>

      <div style={{ ...docStyles.sectionHeading, marginTop: '12px' }}>Instructions File</div>
      <div style={docStyles.card}>
        <div style={docStyles.cardTitle}>.ava/instructions.md</div>
        <div style={docStyles.cardText}>
          Create this file in your project root. Everything in it becomes part of Ava's context when working in this project.
          Think of it as onboarding documentation for the AI — anything you'd tell a new team member.
        </div>
      </div>

      <div style={docStyles.sectionHeading}>What to Include</div>
      <div style={docStyles.grid2}>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Architecture Overview</div>
          <div style={docStyles.cardText}>Project structure, key directories, how packages relate to each other, build system, and deployment targets.</div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Coding Conventions</div>
          <div style={docStyles.cardText}>Naming patterns, import style, error handling approach, testing patterns, and any project-specific rules.</div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Key File Locations</div>
          <div style={docStyles.cardText}>Entry points, configuration files, shared types, utilities, and commonly edited files.</div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Gotchas & Notes</div>
          <div style={docStyles.cardText}>Known issues, workarounds, platform-specific quirks, and things that are easy to get wrong.</div>
        </div>
      </div>

      <div style={docStyles.sectionHeading}>Quick Start</div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Run <span style={docStyles.code}>/init</span> in the chat to generate a starter <span style={docStyles.code}>.ava/instructions.md</span> file. Ava will analyze your project and create an initial draft.
      </div>

      <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '10px' }}>
        History is scoped per project. Switching workspaces saves the current conversation and resets context automatically.
      </div>
    </div>
  );
}

function DocsLanguages() {
  return (
    <div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Ava supports <strong>20 languages</strong> for the UI and AI responses. Code and technical terms always stay in English.
      </div>

      <div style={{ ...docStyles.sectionHeading, marginTop: '12px' }}>Supported Languages</div>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px', marginBottom: '12px' }}>
        {[
          'English', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Japanese', 'Korean',
          'Spanish', 'Portuguese', 'French', 'German', 'Russian',
          'Arabic', 'Hindi', 'Vietnamese', 'Thai', 'Turkish',
          'Italian', 'Polish', 'Ukrainian', 'Dutch', 'Indonesian',
        ].map(lang => (
          <span key={lang} style={docStyles.modelTag}>{lang}</span>
        ))}
      </div>

      <div style={docStyles.sectionHeading}>How It Works</div>
      <div style={docStyles.grid2}>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Auto-detect (Default)</div>
          <div style={docStyles.cardText}>
            Ava uses your IDE language setting to determine the response language. No configuration needed — it just works.
          </div>
        </div>
        <div style={docStyles.card}>
          <div style={docStyles.cardTitle}>Manual Override</div>
          <div style={docStyles.cardText}>
            Set a specific language in <strong>Settings</strong> to override auto-detection. The AI will always respond in your chosen language.
          </div>
        </div>
      </div>

      <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>
        Code output, file paths, and technical identifiers remain in English regardless of language setting.
      </div>
    </div>
  );
}

function DocsKeyboardShortcuts() {
  return (
    <div>
      <div style={docStyles.cardText as React.CSSProperties}>
        Keyboard shortcuts for navigating the IDE and interacting with Ava.
      </div>

      <div style={{ ...docStyles.sectionHeading, marginTop: '12px' }}>General IDE</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Shortcut</th>
            <th style={docStyles.th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Ctrl+Shift+P', 'Open command palette'],
            ['Ctrl+P', 'Quick open file'],
            ['Ctrl+Shift+E', 'Focus file explorer'],
            ['Ctrl+Shift+F', 'Search across files'],
            ['Ctrl+Shift+G', 'Open source control'],
            ['Ctrl+`', 'Toggle terminal'],
            ['Ctrl+B', 'Toggle sidebar'],
            ['Ctrl+J', 'Toggle bottom panel'],
            ['Ctrl+\\', 'Split editor'],
            ['Ctrl+Tab', 'Switch between open editors'],
          ].map(([shortcut, action], i) => (
            <tr key={i}>
              <td style={docStyles.tdBold}><span style={docStyles.code}>{shortcut}</span></td>
              <td style={docStyles.td}>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={docStyles.sectionHeading}>Editing</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Shortcut</th>
            <th style={docStyles.th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Ctrl+D', 'Select next occurrence'],
            ['Ctrl+Shift+L', 'Select all occurrences'],
            ['Alt+Up/Down', 'Move line up/down'],
            ['Ctrl+Shift+K', 'Delete line'],
            ['Ctrl+/', 'Toggle line comment'],
            ['Ctrl+Shift+A', 'Toggle block comment'],
            ['Ctrl+H', 'Find and replace'],
            ['F2', 'Rename symbol'],
            ['F12', 'Go to definition'],
            ['Ctrl+Shift+O', 'Go to symbol in file'],
          ].map(([shortcut, action], i) => (
            <tr key={i}>
              <td style={docStyles.tdBold}><span style={docStyles.code}>{shortcut}</span></td>
              <td style={docStyles.td}>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={docStyles.sectionHeading}>Ava Panel</div>
      <table style={docStyles.table}>
        <thead>
          <tr>
            <th style={docStyles.th}>Shortcut</th>
            <th style={docStyles.th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Ctrl+Shift+A', 'Focus Ava chat panel'],
            ['Enter', 'Send message'],
            ['Shift+Enter', 'New line in input'],
            ['Escape', 'Cancel current generation'],
            ['Ctrl+L', 'Clear conversation'],
          ].map(([shortcut, action], i) => (
            <tr key={i}>
              <td style={docStyles.tdBold}><span style={docStyles.code}>{shortcut}</span></td>
              <td style={docStyles.td}>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '8px' }}>
        Shortcuts follow standard Theia/VS Code conventions. Customize them via <span style={docStyles.code}>Ctrl+Shift+P</span> &gt; Keyboard Shortcuts.
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
  const [currentVersion, setCurrentVersion] = React.useState<string>('');
  const [updateAvailable, setUpdateAvailable] = React.useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'>('idle');

  // Fetch current version on mount
  React.useEffect(() => {
    props.onGetCurrentVersion?.().then(v => setCurrentVersion(v)).catch(() => {});
  }, []);

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
      case 'docs':
        return <DocsPage />;
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
        version={currentVersion}
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
            <button
              onClick={() => {
                if (!props.onDownloadUpdate) return;
                setUpdateStatus('downloading');
                props.onDownloadUpdate().then(ok => {
                  if (ok) {
                    setUpdateStatus('ready');
                  } else {
                    setUpdateStatus('error');
                    setTimeout(() => setUpdateStatus('available'), 5000);
                  }
                }).catch(() => {
                  setUpdateStatus('error');
                  setTimeout(() => setUpdateStatus('available'), 5000);
                });
              }}
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                background: 'var(--ava-accent, #A855F7)', color: '#fff', border: 'none',
                cursor: 'pointer',
              }}
            >
              Download &amp; Install
            </button>
          </div>
        ) : updateStatus === 'downloading' ? (
          <div style={{
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', opacity: 0.8 }}>Downloading update...</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ava-accent, #A855F7)' }}>
                {state.updateDownloadProgress}%
              </span>
            </div>
            <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(168, 85, 247, 0.2)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '2px', transition: 'width 0.3s ease',
                background: 'var(--ava-accent, #A855F7)',
                width: `${state.updateDownloadProgress}%`,
              }} />
            </div>
          </div>
        ) : updateStatus === 'ready' ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)',
          }}>
            <span style={{ fontSize: '12px', color: 'rgba(34, 197, 94, 0.9)' }}>
              Update downloaded. Ready to install.
            </span>
            <button
              onClick={() => {
                setUpdateStatus('installing');
                props.onInstallUpdate?.().then(() => {
                  // Wait for the update progress window to appear,
                  // then close the Electron window to release file locks.
                  // The update script handles installing and relaunching.
                  setTimeout(() => window.close(), 2000);
                }).catch(() => {
                  setUpdateStatus('error');
                  setTimeout(() => setUpdateStatus('ready'), 5000);
                });
              }}
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                background: '#22C55E', color: '#fff', border: 'none',
                cursor: 'pointer',
              }}
            >
              Install &amp; Restart
            </button>
          </div>
        ) : updateStatus === 'installing' ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 12px', marginBottom: '12px', borderRadius: '6px',
            background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)',
          }}>
            <span style={{ fontSize: '12px', color: 'rgba(34, 197, 94, 0.9)' }}>
              Installing update... Ava will restart automatically.
            </span>
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
