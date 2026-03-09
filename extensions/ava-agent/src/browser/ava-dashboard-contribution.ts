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

  async onStart(_app: FrontendApplication): Promise<void> {
    // Dashboard starts collapsed. User can toggle with Ctrl+Shift+D.
  }

  async initializeLayout(_app: FrontendApplication): Promise<void> {
    // Register the widget in the right sidebar but keep it collapsed.
    await this.openView({ activate: false, reveal: false });
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
