import { injectable } from '@theia/core/shared/inversify';
import {
  AbstractViewContribution,
  FrontendApplicationContribution,
  FrontendApplication,
} from '@theia/core/lib/browser';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AvaAgentWidget } from './ava-agent-widget';

export const AvaAgentCommand: Command = {
  id: 'ava.agent.toggle',
  label: 'Ava: Toggle Agent Panel',
};

@injectable()
export class AvaAgentContribution
  extends AbstractViewContribution<AvaAgentWidget>
  implements FrontendApplicationContribution
{
  constructor() {
    super({
      widgetId: AvaAgentWidget.ID,
      widgetName: AvaAgentWidget.LABEL,
      defaultWidgetOptions: {
        area: 'right',
        rank: 100,
      },
      toggleCommandId: AvaAgentCommand.id,
    });
  }

  async initializeLayout(app: FrontendApplication): Promise<void> {
    await this.openView({ activate: false, reveal: true });
  }

  registerCommands(commands: CommandRegistry): void {
    super.registerCommands(commands);
    // Additional Ava commands will be registered here:
    // - ava.agent.newChat
    // - ava.agent.switchMode (code/plan/chat/security)
    // - ava.agent.selectModel
  }
}
