import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';

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
    // Force-disable AI banner even if @theia/ai-core is detected transitively
    (this as any).aiIsIncluded = false;
    this.update();
  }

  protected override renderHelp(): React.ReactNode {
    return React.createElement('div', { className: 'gs-section' },
      React.createElement('h3', { className: 'gs-section-header' },
        React.createElement('i', { className: 'codicon codicon-question' }),
        'Help'),
      React.createElement('div', { className: 'gs-action-container' },
        React.createElement('a', {
          role: 'button', tabIndex: 0,
          onClick: () => this.doOpenExternalLink('https://github.com/AugmentedValueAcceleration/ava-supernova'),
          onKeyDown: (e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, 'https://github.com/AugmentedValueAcceleration/ava-supernova'),
        }, 'Documentation')),
      React.createElement('div', { className: 'gs-action-container' },
        React.createElement('a', {
          role: 'button', tabIndex: 0,
          onClick: () => this.doOpenExternalLink('https://eclipse-theia.github.io/vscode-theia-comparator/status.html'),
          onKeyDown: (e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, 'https://eclipse-theia.github.io/vscode-theia-comparator/status.html'),
        }, 'VS Code API Compatibility')),
      React.createElement('div', { className: 'gs-action-container' },
        React.createElement('a', {
          role: 'button', tabIndex: 0,
          onClick: () => this.doOpenExternalLink('https://github.com/AugmentedValueAcceleration/ava-supernova/issues'),
          onKeyDown: (e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, 'https://github.com/AugmentedValueAcceleration/ava-supernova/issues'),
        }, 'Report an Issue')),
    );
  }
}
