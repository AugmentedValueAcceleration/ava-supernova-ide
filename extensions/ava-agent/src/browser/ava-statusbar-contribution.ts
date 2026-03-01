import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { AvaAgentClient } from './ava-agent-client';
import { AvaMode, AvaProviderHealth } from '../common/ava-agent-protocol';

const MODE_LABELS: Record<AvaMode, { icon: string; label: string }> = {
  code: { icon: '$(codicon-code)', label: 'Code' },
  plan: { icon: '$(codicon-notebook)', label: 'Plan' },
  chat: { icon: '$(codicon-comment-discussion)', label: 'Chat' },
  security: { icon: '$(codicon-shield)', label: 'Security' },
};

const MODE_ORDER: AvaMode[] = ['code', 'plan', 'chat', 'security'];

export const AvaCycleModeCommand = {
  id: 'ava.cycleMode',
  label: 'Ava: Cycle Mode',
};

@injectable()
export class AvaStatusBarContribution implements FrontendApplicationContribution, CommandContribution {

  @inject(StatusBar) protected readonly statusBar: StatusBar;
  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;

  @postConstruct()
  protected init(): void {
    this.client.onStateChanged(state => {
      this.updateModelItem(state.activeModel, state.models, state.isStreaming);
      this.updateStatusDot(state.isStreaming);
      this.updateModeItem();
      this.updateUsageItem(state.sessionUsage.totalTokens, state.sessionUsage.totalCost);
    });

    this.client.onDashboardStateChanged(dashState => {
      const chatState = this.client.getState();
      this.updateStatusDot(chatState.isStreaming);
      this.updateHealthItem(dashState.providerHealth);
    });
  }

  async onStart(): Promise<void> {
    // Set initial status bar items
    this.updateModelItem(null, [], false);
    this.updateStatusDot(false);
    this.updateModeItem();
    this.updateUsageItem(0, 0);
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(AvaCycleModeCommand, {
      execute: () => {
        const current = this.client.currentMode;
        const idx = MODE_ORDER.indexOf(current);
        const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
        this.client.setMode(next);
        this.updateModeItem();
      },
    });
  }

  private updateModelItem(activeModel: string | null, models: Array<{ id: string; name: string }>, isStreaming: boolean): void {
    const model = models.find(m => m.id === activeModel);
    const text = model
      ? `$(codicon-hubot) ${model.name}`
      : '$(codicon-hubot) No AI configured';

    this.statusBar.setElement('ava-model', {
      text,
      alignment: StatusBarAlignment.LEFT,
      priority: 100,
      command: 'ava.agent.toggle',
      tooltip: model
        ? `Active model: ${model.name} (Ctrl+Shift+A to open panel)`
        : 'Click to configure AI (Ctrl+Shift+D for Dashboard)',
    });
  }

  private updateStatusDot(isStreaming: boolean): void {
    const connected = this.client.isConnected;

    let text: string;
    let color: string | undefined;
    let tooltip: string;

    if (isStreaming) {
      text = '$(codicon-loading~spin)';
      color = 'var(--ava-accent, #6366F1)';
      tooltip = 'Ava is working... (Ctrl+Shift+A to view)';
    } else if (connected) {
      text = '$(codicon-circle-filled)';
      color = '#22C55E';
      tooltip = 'AI connected (Ctrl+Shift+A to open panel)';
    } else {
      text = '$(codicon-circle-filled)';
      color = '#6B7280';
      tooltip = 'No AI provider configured (Ctrl+Shift+D for Dashboard)';
    }

    this.statusBar.setElement('ava-status', {
      text,
      alignment: StatusBarAlignment.LEFT,
      priority: 99,
      command: 'ava.agent.toggle',
      color,
      tooltip,
    });
  }

  private updateModeItem(): void {
    const mode = this.client.currentMode;
    const info = MODE_LABELS[mode];

    this.statusBar.setElement('ava-mode', {
      text: `${info.icon} ${info.label}`,
      alignment: StatusBarAlignment.RIGHT,
      priority: 100,
      command: AvaCycleModeCommand.id,
      tooltip: `Current mode: ${info.label} (click to cycle modes)`,
    });
  }

  private updateHealthItem(health: AvaProviderHealth[]): void {
    if (health.length === 0) return;

    const allHealthy = health.every(h => h.healthy);
    const someDown = health.some(h => !h.healthy);
    const allDown = health.every(h => !h.healthy);

    const color = allDown ? '#ef4444' : someDown ? '#f59e0b' : '#22c55e';
    const label = allDown ? 'All down' : someDown ? 'Partial' : 'Healthy';
    const details = health.map(h => `${h.provider}: ${h.healthy ? `OK (${h.latencyMs}ms)` : h.error || 'down'}`).join(', ');

    this.statusBar.setElement('ava-health', {
      text: `$(codicon-pulse) ${label}`,
      alignment: StatusBarAlignment.RIGHT,
      priority: 98,
      command: 'ava.dashboard.toggle',
      color,
      tooltip: `Provider health: ${details}`,
    });
  }

  private updateUsageItem(totalTokens: number, totalCost: number): void {
    const tokenStr = totalTokens >= 1000
      ? `${(totalTokens / 1000).toFixed(1)}k`
      : String(totalTokens);

    const costStr = totalCost > 0 ? ` · $${totalCost.toFixed(4)}` : '';

    this.statusBar.setElement('ava-usage', {
      text: `$(codicon-dashboard) ${tokenStr} tokens${costStr}`,
      alignment: StatusBarAlignment.RIGHT,
      priority: 99,
      command: 'ava.dashboard.toggle',
      tooltip: `Session: ${totalTokens.toLocaleString()} tokens${totalCost > 0 ? `, $${totalCost.toFixed(4)}` : ''} (Ctrl+Shift+D for details)`,
    });
  }
}
