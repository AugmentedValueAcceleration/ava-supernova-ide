import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import URI from '@theia/core/lib/common/uri';

// ── Inline style constants ──────────────────────────────────────────────────

const ws = {
  outer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    height: '100%',
    overflow: 'auto',
    padding: '48px 24px 24px',
    fontFamily: 'var(--theia-ui-font-family)',
    color: 'var(--theia-foreground)',
  },
  inner: {
    width: '100%',
    maxWidth: '560px',
  },
  brandRow: {
    textAlign: 'center' as const,
    marginBottom: '32px',
  },
  brandName: {
    fontSize: '28px',
    fontWeight: 700 as const,
    background: 'linear-gradient(135deg, var(--ava-gradient-start, #6366F1), var(--ava-gradient-end, #8B5CF6))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  brandSuffix: {
    fontSize: '28px',
    fontWeight: 300 as const,
    background: 'linear-gradient(135deg, var(--ava-gradient-start, #6366F1), var(--ava-gradient-end, #8B5CF6))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  tagline: {
    fontSize: '13px',
    opacity: 0.45,
    marginTop: '6px',
  },
  actionsRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '28px',
  },
  actionCard: {
    flex: 1,
    padding: '14px 16px',
    border: '1px solid var(--theia-panel-border)',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    fontWeight: 500 as const,
    background: 'transparent',
  },
  actionIcon: {
    fontSize: '18px',
    opacity: 0.6,
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600 as const,
    letterSpacing: '1.5px',
    textTransform: 'uppercase' as const,
    opacity: 0.35,
    marginBottom: '8px',
  },
  section: {
    marginBottom: '24px',
  },
  recentName: {
    fontWeight: 500 as const,
    fontSize: '13px',
  },
  recentPath: {
    fontSize: '11px',
    opacity: 0.35,
    marginTop: '1px',
  },
  noRecent: {
    fontSize: '12px',
    opacity: 0.4,
    padding: '6px 8px',
  },
  setupRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  setupCard: {
    flex: '1 1 45%',
    padding: '10px 14px',
    border: '1px solid var(--theia-panel-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    background: 'transparent',
  },
  setupIcon: {
    fontSize: '14px',
    opacity: 0.5,
  },
  linksRow: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    fontSize: '12px',
    marginBottom: '16px',
  },
  linkDot: {
    opacity: 0.2,
  },
  version: {
    textAlign: 'center' as const,
    fontSize: '11px',
    opacity: 0.25,
    marginBottom: '12px',
  },
  prefsWrap: {
    display: 'flex',
    justifyContent: 'center',
  },
};

@injectable()
export class AvaWelcomeWidget extends GettingStartedWidget {

  protected override renderAIBanner(): React.ReactNode {
    return null;
  }

  protected override renderNews(): React.ReactNode {
    return null;
  }

  protected override async doInit(): Promise<void> {
    await super.doInit();
    (this as any).aiIsIncluded = false;
    this.update();
  }

  // ── Full render override ────────────────────────────────────────────────

  protected override render(): React.ReactNode {
    return React.createElement('div', { style: ws.outer },
      React.createElement('div', { style: ws.inner },

        // ── Branded header ──────────────────────────────────────────────
        this.renderBrandHeader(),

        // ── Quick actions (Open Folder / Clone Repo) ────────────────────
        this.renderQuickActions(),

        // ── Recent projects ─────────────────────────────────────────────
        this.renderRecentSection(),

        // ── Quick setup ─────────────────────────────────────────────────
        this.renderSetupSection(),

        // ── Help & community ────────────────────────────────────────────
        this.renderLinksSection(),

        // ── Version ─────────────────────────────────────────────────────
        this.renderVersionSection(),

        // ── Startup preference checkbox ─────────────────────────────────
        React.createElement('div', { style: ws.prefsWrap },
          this.renderPreferences(),
        ),
      ),
    );
  }

  // ── Brand header ────────────────────────────────────────────────────────

  private renderBrandHeader(): React.ReactNode {
    return React.createElement('div', { style: ws.brandRow },
      React.createElement('div', null,
        React.createElement('span', { style: ws.brandName }, 'Ava'),
        React.createElement('span', { style: ws.brandSuffix }, ' | Supernova'),
      ),
      React.createElement('div', { style: ws.tagline },
        'Open-source agentic coding for everyone',
      ),
    );
  }

  // ── Quick actions ───────────────────────────────────────────────────────

  private renderQuickActions(): React.ReactNode {
    return React.createElement('div', { style: ws.actionsRow },
      // Open Folder
      React.createElement('div', {
        className: 'ava-welcome-action-card',
        style: ws.actionCard,
        role: 'button',
        tabIndex: 0,
        onClick: () => this.doOpenFolder(),
        onKeyDown: (e: React.KeyboardEvent) => this.doOpenFolderEnter(e),
      },
        React.createElement('i', {
          className: 'codicon codicon-folder-opened',
          style: ws.actionIcon,
        }),
        'Open Folder',
      ),
      // Clone Repository
      React.createElement('div', {
        className: 'ava-welcome-action-card',
        style: ws.actionCard,
        role: 'button',
        tabIndex: 0,
        onClick: () => this.doCloneRepo(),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (this.isEnterKey(e)) { this.doCloneRepo(); }
        },
      },
        React.createElement('i', {
          className: 'codicon codicon-source-control',
          style: ws.actionIcon,
        }),
        'Clone Repository',
      ),
    );
  }

  private doCloneRepo(): void {
    try {
      this.commandRegistry.executeCommand('git.clone');
    } catch {
      // Git plugin may not be loaded — fall back to open folder
      this.doOpenFolder();
    }
  }

  // ── Recent projects ─────────────────────────────────────────────────────

  private renderRecentSection(): React.ReactNode {
    const items = this.recentWorkspaces;
    const paths = this.buildPaths(items);

    const children: React.ReactNode[] = [];

    // Section label
    children.push(
      React.createElement('div', { key: 'label', style: ws.sectionLabel }, 'Recent Projects'),
    );

    if (items.length === 0) {
      children.push(
        React.createElement('div', { key: 'empty', style: ws.noRecent },
          'No recent projects. ',
          React.createElement('a', {
            className: 'ava-welcome-link',
            role: 'button',
            tabIndex: 0,
            onClick: () => this.doOpenFolder(),
            onKeyDown: (e: React.KeyboardEvent) => this.doOpenFolderEnter(e),
          }, 'Open a folder'),
          ' to get started.',
        ),
      );
    } else {
      const limit = Math.min(paths.length, this.recentLimit);
      for (let i = 0; i < limit; i++) {
        const uri = new URI(items[i]);
        children.push(
          React.createElement('div', {
            key: i,
            className: 'ava-welcome-recent-item',
            role: 'button',
            tabIndex: 0,
            onClick: () => this.open(uri),
            onKeyDown: (e: React.KeyboardEvent) => this.openEnter(e, uri),
          },
            React.createElement('div', { style: ws.recentName },
              this.labelProvider.getName(uri),
            ),
            React.createElement('div', { style: ws.recentPath },
              paths[i],
            ),
          ),
        );
      }
      if (paths.length > this.recentLimit) {
        children.push(
          React.createElement('div', {
            key: 'more',
            className: 'ava-welcome-recent-item',
            role: 'button',
            tabIndex: 0,
            onClick: () => this.doOpenRecentWorkspace(),
            onKeyDown: (e: React.KeyboardEvent) => this.doOpenRecentWorkspaceEnter(e),
          },
            React.createElement('div', {
              style: { ...ws.recentName, color: 'var(--ava-accent, #6366F1)' },
            }, 'More...'),
          ),
        );
      }
    }

    return React.createElement('div', { style: ws.section }, ...children);
  }

  // ── Quick setup ─────────────────────────────────────────────────────────

  private renderSetupSection(): React.ReactNode {
    const openDashboard = () => {
      try {
        this.commandRegistry.executeCommand('ava.dashboard.toggle');
      } catch { /* Dashboard not available */ }
    };

    const items = [
      { icon: 'codicon-account', label: 'Connect Account' },
      { icon: 'codicon-key', label: 'Configure API Keys' },
      { icon: 'codicon-server-process', label: 'Select Model' },
    ];

    return React.createElement('div', { style: ws.section },
      React.createElement('div', { style: ws.sectionLabel }, 'Quick Setup'),
      React.createElement('div', { style: ws.setupRow },
        ...items.map((item, idx) =>
          React.createElement('div', {
            key: idx,
            className: 'ava-welcome-setup-card',
            style: ws.setupCard,
            role: 'button',
            tabIndex: 0,
            onClick: openDashboard,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (this.isEnterKey(e)) { openDashboard(); }
            },
          },
            React.createElement('i', {
              className: `codicon ${item.icon}`,
              style: ws.setupIcon,
            }),
            item.label,
          ),
        ),
      ),
    );
  }

  // ── Help & community links ──────────────────────────────────────────────

  private renderLinksSection(): React.ReactNode {
    const links = [
      { label: 'GitHub', url: 'https://github.com/AugmentedValueAcceleration/ava-supernova' },
      { label: 'Documentation', url: 'https://github.com/AugmentedValueAcceleration/ava-supernova' },
      { label: 'Report an Issue', url: 'https://github.com/AugmentedValueAcceleration/ava-supernova/issues' },
    ];

    const parts: React.ReactNode[] = [];
    links.forEach((link, i) => {
      if (i > 0) {
        parts.push(React.createElement('span', { key: `dot-${i}`, style: ws.linkDot }, '\u00B7'));
      }
      parts.push(
        React.createElement('a', {
          key: link.label,
          className: 'ava-welcome-link',
          role: 'button',
          tabIndex: 0,
          onClick: () => this.doOpenExternalLink(link.url),
          onKeyDown: (e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, link.url),
        }, link.label),
      );
    });

    return React.createElement('div', { style: ws.linksRow }, ...parts);
  }

  // ── Version ─────────────────────────────────────────────────────────────

  private renderVersionSection(): React.ReactNode {
    const ver = this.applicationInfo?.version;
    if (!ver) { return null; }
    return React.createElement('div', { style: ws.version }, `Version ${ver}`);
  }
}
