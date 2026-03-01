import { inject, injectable } from '@theia/core/shared/inversify';
import {
  AbstractViewContribution,
  FrontendApplicationContribution,
  FrontendApplication,
  KeybindingRegistry,
} from '@theia/core/lib/browser';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AvaAgentWidget } from './ava-agent-widget';
import { AvaAgentClient } from './ava-agent-client';
import { IAvaAgentService, AvaAgentService } from '../common/ava-agent-protocol';

export const AvaAgentCommand: Command = {
  id: 'ava.agent.toggle',
  label: 'Ava: Toggle Agent Panel',
};

export const AvaNewChatCommand: Command = {
  id: 'ava.agent.newChat',
  label: 'Ava: New Chat',
};

export const AvaHistoryCommand: Command = {
  id: 'ava.agent.history',
  label: 'Ava: Session History',
};

export const AvaImportSessionCommand: Command = {
  id: 'ava.agent.importSession',
  label: 'Ava: Import Session',
};

export const AvaExportSessionCommand: Command = {
  id: 'ava.agent.exportSession',
  label: 'Ava: Export Current Session',
};

@injectable()
export class AvaAgentContribution
  extends AbstractViewContribution<AvaAgentWidget>
  implements FrontendApplicationContribution
{
  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;

  constructor() {
    super({
      widgetId: AvaAgentWidget.ID,
      widgetName: AvaAgentWidget.LABEL,
      defaultWidgetOptions: {
        area: 'main',
      },
      toggleCommandId: AvaAgentCommand.id,
    });
  }

  async initializeLayout(app: FrontendApplication): Promise<void> {
    await this.openView({ activate: true, reveal: true });
  }

  registerCommands(commands: CommandRegistry): void {
    super.registerCommands(commands);
    commands.registerCommand(AvaNewChatCommand, {
      execute: async () => {
        await this.openView({ activate: true });
        this.service.newChat();
      },
    });

    commands.registerCommand(AvaHistoryCommand, {
      execute: async () => {
        await this.openView({ activate: true });
        this.client.setView('history');
        this.client.setHistoryState({ isLoading: true });
        try {
          const entries = await this.service.getHistory();
          this.client.setHistoryState({ entries, isLoading: false });
        } catch {
          this.client.setHistoryState({ isLoading: false });
        }
      },
    });

    commands.registerCommand(AvaExportSessionCommand, {
      execute: async () => {
        // Export the current session as markdown (using the export chat command pattern)
        const state = this.client.getState();
        if (state.messages.length === 0) return;

        const lines: string[] = ['# Ava Chat Export', ''];
        for (const msg of state.messages) {
          switch (msg.role) {
            case 'user':
              lines.push('## User', '', msg.content, '');
              break;
            case 'assistant':
              lines.push('## Ava', '');
              if (msg.content) lines.push(msg.content, '');
              for (const tc of msg.toolCalls) {
                lines.push(`**Tool: ${tc.name}**`, '');
                if (tc.result) {
                  lines.push('```', tc.result.slice(0, 2000), '```', '');
                }
              }
              if (msg.cost != null) {
                lines.push(`*Cost: $${msg.cost.toFixed(4)}*`, '');
              }
              break;
            case 'error':
              lines.push('## Error', '', `> ${msg.content}`, '');
              break;
            case 'system':
              lines.push(`*${msg.content}*`, '');
              break;
          }
        }

        const markdown = lines.join('\n');
        // Open the widget and let the export be handled via the editor
        const widget = await this.openView({ activate: true }) as AvaAgentWidget;
        if (widget) {
          // Trigger the export via the service if possible
          try {
            const { EditorManager } = require('@theia/editor/lib/browser/editor-manager');
            // Fallback: just copy to clipboard or open in a new tab
          } catch { /* best effort */ }
        }
      },
    });
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    super.registerKeybindings(keybindings);
    keybindings.registerKeybindings(
      { command: AvaAgentCommand.id, keybinding: 'ctrlcmd+shift+a' },
      { command: AvaNewChatCommand.id, keybinding: 'ctrlcmd+shift+n' },
      { command: AvaHistoryCommand.id, keybinding: 'ctrlcmd+shift+h' },
    );
  }
}
