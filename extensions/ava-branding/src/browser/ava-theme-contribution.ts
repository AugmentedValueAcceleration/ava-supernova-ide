import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { Theme } from '@theia/core/lib/common/theme';

// ── Ava Dark ──────────────────────────────────────────────────────────────────
const AVA_DARK_CSS = `
:root {
  /* Base palette */
  --theia-editor-background: #1a1b26;
  --theia-editor-foreground: #c0caf5;
  --theia-sideBar-background: #16171f;
  --theia-activityBar-background: #13141b;
  --theia-panel-background: #1a1b26;
  --theia-titleBar-activeBackground: #13141b;
  --theia-titleBar-inactiveBackground: #13141b;
  --theia-statusBar-background: #13141b;
  --theia-statusBar-foreground: #9098b8;
  --theia-tab-activeBackground: #1a1b26;
  --theia-tab-inactiveBackground: #16171f;
  --theia-tab-activeForeground: #c0caf5;
  --theia-tab-inactiveForeground: #6b7394;
  --theia-list-activeSelectionBackground: rgba(99, 102, 241, 0.25);
  --theia-list-hoverBackground: rgba(99, 102, 241, 0.1);

  /* Ava accent */
  --theia-focusBorder: #6366F1;
  --theia-button-background: #6366F1;
  --theia-button-foreground: #ffffff;
  --theia-button-hoverBackground: #5558E6;
  --theia-progressBar-background: #6366F1;
  --theia-textLink-foreground: #7c7ff2;
  --theia-textLink-activeForeground: #9b9ef5;
  --theia-notificationLink-foreground: #7c7ff2;

  /* Borders */
  --theia-panel-border: #2a2b3d;
  --theia-sideBar-border: #2a2b3d;
  --theia-activityBar-border: #2a2b3d;
  --theia-tab-border: #2a2b3d;
  --theia-editorGroup-border: #2a2b3d;
  --theia-titleBar-border: #2a2b3d;
  --theia-statusBar-border: #2a2b3d;
  --theia-widget-border: #2a2b3d;

  /* Input */
  --theia-input-background: #1f2030;
  --theia-input-foreground: #c0caf5;
  --theia-input-border: #2a2b3d;
  --theia-dropdown-background: #1f2030;
  --theia-dropdown-foreground: #c0caf5;
  --theia-dropdown-border: #2a2b3d;

  /* Selection & highlights */
  --theia-editor-selectionBackground: rgba(99, 102, 241, 0.3);
  --theia-editor-lineHighlightBackground: rgba(99, 102, 241, 0.08);
  --theia-editor-findMatchHighlightBackground: rgba(99, 102, 241, 0.25);

  /* Scrollbar */
  --theia-scrollbarSlider-background: rgba(99, 102, 241, 0.15);
  --theia-scrollbarSlider-hoverBackground: rgba(99, 102, 241, 0.3);
  --theia-scrollbarSlider-activeBackground: rgba(99, 102, 241, 0.4);

  /* Terminal */
  --theia-terminal-background: #1a1b26;
  --theia-terminal-foreground: #c0caf5;

  /* Badges */
  --theia-badge-background: #6366F1;
  --theia-badge-foreground: #ffffff;
}
`;

// ── Ava Light ─────────────────────────────────────────────────────────────────
const AVA_LIGHT_CSS = `
:root {
  /* Base palette */
  --theia-editor-background: #ffffff;
  --theia-editor-foreground: #1e1e2e;
  --theia-sideBar-background: #f5f5f7;
  --theia-activityBar-background: #eeeef0;
  --theia-panel-background: #ffffff;
  --theia-titleBar-activeBackground: #eeeef0;
  --theia-titleBar-inactiveBackground: #f0f0f2;
  --theia-statusBar-background: #eeeef0;
  --theia-statusBar-foreground: #4a4a5a;
  --theia-tab-activeBackground: #ffffff;
  --theia-tab-inactiveBackground: #f5f5f7;
  --theia-tab-activeForeground: #1e1e2e;
  --theia-tab-inactiveForeground: #8888a0;
  --theia-list-activeSelectionBackground: rgba(99, 102, 241, 0.15);
  --theia-list-hoverBackground: rgba(99, 102, 241, 0.06);

  /* Ava accent */
  --theia-focusBorder: #6366F1;
  --theia-button-background: #6366F1;
  --theia-button-foreground: #ffffff;
  --theia-button-hoverBackground: #5558E6;
  --theia-progressBar-background: #6366F1;
  --theia-textLink-foreground: #5558E6;
  --theia-textLink-activeForeground: #4449D0;
  --theia-notificationLink-foreground: #5558E6;

  /* Borders */
  --theia-panel-border: #e0e0e4;
  --theia-sideBar-border: #e0e0e4;
  --theia-activityBar-border: #e0e0e4;
  --theia-tab-border: #e0e0e4;
  --theia-editorGroup-border: #e0e0e4;
  --theia-titleBar-border: #e0e0e4;
  --theia-statusBar-border: #e0e0e4;
  --theia-widget-border: #e0e0e4;

  /* Input */
  --theia-input-background: #f5f5f7;
  --theia-input-foreground: #1e1e2e;
  --theia-input-border: #d4d4d8;
  --theia-dropdown-background: #f5f5f7;
  --theia-dropdown-foreground: #1e1e2e;
  --theia-dropdown-border: #d4d4d8;

  /* Selection & highlights */
  --theia-editor-selectionBackground: rgba(99, 102, 241, 0.2);
  --theia-editor-lineHighlightBackground: rgba(99, 102, 241, 0.06);
  --theia-editor-findMatchHighlightBackground: rgba(99, 102, 241, 0.15);

  /* Scrollbar */
  --theia-scrollbarSlider-background: rgba(99, 102, 241, 0.12);
  --theia-scrollbarSlider-hoverBackground: rgba(99, 102, 241, 0.25);
  --theia-scrollbarSlider-activeBackground: rgba(99, 102, 241, 0.35);

  /* Terminal */
  --theia-terminal-background: #ffffff;
  --theia-terminal-foreground: #1e1e2e;

  /* Badges */
  --theia-badge-background: #6366F1;
  --theia-badge-foreground: #ffffff;
}
`;

@injectable()
export class AvaThemeContribution implements FrontendApplicationContribution {

  @inject(ThemeService) protected readonly themeService: ThemeService;

  private darkStyleEl: HTMLStyleElement | undefined;
  private lightStyleEl: HTMLStyleElement | undefined;

  @postConstruct()
  protected init(): void {
    const avaDark: Theme = {
      id: 'ava-dark',
      type: 'dark',
      label: 'Ava Dark',
      description: 'Deep charcoal with indigo accents',
      editorTheme: 'dark-theia',
      activate: () => {
        this.removeAllThemeStyles();
        this.darkStyleEl = this.createStyleEl('dark', AVA_DARK_CSS);
        document.head.appendChild(this.darkStyleEl);
      },
      deactivate: () => {
        this.darkStyleEl?.remove();
        this.darkStyleEl = undefined;
      },
    };

    const avaLight: Theme = {
      id: 'ava-light',
      type: 'light',
      label: 'Ava Light',
      description: 'Clean white with indigo accents',
      editorTheme: 'light-theia',
      activate: () => {
        this.removeAllThemeStyles();
        this.lightStyleEl = this.createStyleEl('light', AVA_LIGHT_CSS);
        document.head.appendChild(this.lightStyleEl);
      },
      deactivate: () => {
        this.lightStyleEl?.remove();
        this.lightStyleEl = undefined;
      },
    };

    this.themeService.register(avaDark, avaLight);
  }

  async onStart(): Promise<void> {
    // Theme registration happens in @postConstruct.
    // ThemeService.loadUserTheme() runs during its own init, so by the
    // time onStart fires the chosen theme is already active.
  }

  private createStyleEl(id: string, css: string): HTMLStyleElement {
    const el = document.createElement('style');
    el.id = `ava-theme-${id}`;
    el.textContent = css;
    return el;
  }

  private removeAllThemeStyles(): void {
    this.darkStyleEl?.remove();
    this.lightStyleEl?.remove();
    this.darkStyleEl = undefined;
    this.lightStyleEl = undefined;
  }
}
