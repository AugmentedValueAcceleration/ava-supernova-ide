import { inject, injectable } from '@theia/core/shared/inversify';
import {
  AbstractViewContribution,
  FrontendApplicationContribution,
  FrontendApplication,
  KeybindingRegistry,
} from '@theia/core/lib/browser';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AvaAgentWidget } from './ava-agent-widget';
import { IAvaAgentService, AvaAgentService } from '../common/ava-agent-protocol';

export const AvaAgentCommand: Command = {
  id: 'ava.agent.toggle',
  label: 'Ava: Toggle Agent Panel',
};

export const AvaNewChatCommand: Command = {
  id: 'ava.agent.newChat',
  label: 'Ava: New Chat',
};

@injectable()
export class AvaAgentContribution
  extends AbstractViewContribution<AvaAgentWidget>
  implements FrontendApplicationContribution
{
  @inject(AvaAgentService) protected readonly service: IAvaAgentService;

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
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    super.registerKeybindings(keybindings);
    keybindings.registerKeybindings(
      { command: AvaAgentCommand.id, keybinding: 'ctrlcmd+shift+a' },
      { command: AvaNewChatCommand.id, keybinding: 'ctrlcmd+shift+n' },
    );
  }
}
