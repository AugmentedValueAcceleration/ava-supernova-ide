import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser';
import { AvaAgentClient } from './ava-agent-client';
import { AvaDashboardApp } from './components/AvaDashboardApp';
import {
  IAvaAgentService,
  AvaAgentService,
} from '../common/ava-agent-protocol';

@injectable()
export class AvaDashboardWidget extends ReactWidget {
  static readonly ID = 'ava-dashboard-panel';
  static readonly LABEL = 'Dashboard';

  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;

  constructor() {
    super();
    this.id = AvaDashboardWidget.ID;
    this.title.label = AvaDashboardWidget.LABEL;
    this.title.caption = 'Ava | Dashboard';
    this.title.closable = true;
    this.title.iconClass = 'codicon codicon-settings-gear';
    this.addClass('ava-dashboard-widget');
    this.node.style.overflow = 'hidden';
  }

  @postConstruct()
  protected init(): void {
    // Re-render on dashboard state changes
    this.toDispose.push(this.client.onDashboardStateChanged(() => this.update()));

    // Load initial dashboard state from backend
    this.service.getDashboardState().then(state => {
      this.client.setDashboardInit(state);
    }).catch(err => {
      console.error('[ava-dashboard] Failed to load state:', err);
    });

    this.update();
  }

  protected render(): React.ReactNode {
    return React.createElement(AvaDashboardApp, {
      state: this.client.getDashboardState(),
      onSaveProviderKey: (provider, apiKey) => {
        this.service.saveProviderKey(provider, apiKey);
      },
      onRemoveProviderKey: (provider) => {
        this.service.removeProviderKey(provider);
      },
      onSavePreferences: (settings) => {
        this.service.savePreferences(settings);
      },
      onConnectAccount: (key) => {
        this.service.connectPlatformAccount(key);
      },
      onDisconnectAccount: () => {
        this.service.disconnectPlatformAccount();
      },
      onGetUsageSummary: () => this.service.getUsageSummary(),
      onGetMemory: () => this.service.getMemory(),
      onSaveMemory: (scope: 'global' | 'project', content: string) => this.service.saveMemory(scope, content),
      onClearMemory: (scope: 'global' | 'project') => this.service.clearMemory(scope),
    });
  }
}
