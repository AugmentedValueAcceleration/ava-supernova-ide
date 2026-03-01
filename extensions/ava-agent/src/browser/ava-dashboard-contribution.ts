import { injectable } from '@theia/core/shared/inversify';
import {
  AbstractViewContribution,
  FrontendApplicationContribution,
  FrontendApplication,
  KeybindingRegistry,
} from '@theia/core/lib/browser';
import { Command, CommandRegistry } from '@theia/core/lib/common';
import { AvaDashboardWidget } from './ava-dashboard-widget';

export const AvaDashboardCommand: Command = {
  id: 'ava.dashboard.toggle',
  label: 'Ava: Toggle Dashboard',
};

@injectable()
export class AvaDashboardContribution
  extends AbstractViewContribution<AvaDashboardWidget>
  implements FrontendApplicationContribution
{
  constructor() {
    super({
      widgetId: AvaDashboardWidget.ID,
      widgetName: AvaDashboardWidget.LABEL,
      defaultWidgetOptions: {
        area: 'right',
      },
      toggleCommandId: AvaDashboardCommand.id,
    });
  }

  async onStart(app: FrontendApplication): Promise<void> {
    // Open dashboard in right sidebar on every launch.
    // initializeLayout only runs when no saved layout exists;
    // this ensures the panel appears even with a previously-saved layout.
    await this.openView({ activate: false, reveal: false });
  }

  async initializeLayout(app: FrontendApplication): Promise<void> {
    await this.openView({ activate: false, reveal: true });
  }

  registerCommands(commands: CommandRegistry): void {
    super.registerCommands(commands);
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    super.registerKeybindings(keybindings);
    keybindings.registerKeybindings(
      { command: AvaDashboardCommand.id, keybinding: 'ctrlcmd+shift+d' },
    );
  }
}
