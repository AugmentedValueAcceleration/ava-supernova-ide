import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { Theme } from '@theia/core/lib/common/theme';

// ── Ava Dark — Black & Electric Purple ───────────────────────────────────────
const AVA_DARK_CSS = `
:root {
  /* Base palette — deep blacks with purple undertone */
  --theia-editor-background: #0d0d14;
  --theia-editor-foreground: #c8c8e0;
  --theia-sideBar-background: #0a0a10;
  --theia-activityBar-background: #080810;
  --theia-panel-background: #0d0d14;
  --theia-titleBar-activeBackground: #080810;
  --theia-titleBar-inactiveBackground: #080810;
  --theia-statusBar-background: #080810;
  --theia-statusBar-foreground: #9898b8;
  --theia-tab-activeBackground: #0d0d14;
  --theia-tab-inactiveBackground: #0a0a10;
  --theia-tab-activeForeground: #e0e0f0;
  --theia-tab-inactiveForeground: #5c5c80;
  --theia-list-activeSelectionBackground: rgba(168, 85, 247, 0.25);
  --theia-list-hoverBackground: rgba(168, 85, 247, 0.1);

  /* Ava accent — electric purple */
  --theia-focusBorder: #A855F7;
  --theia-button-background: #A855F7;
  --theia-button-foreground: #ffffff;
  --theia-button-hoverBackground: #9333EA;
  --theia-progressBar-background: #A855F7;
  --theia-textLink-foreground: #B87DF8;
  --theia-textLink-activeForeground: #D8A8FF;
  --theia-notificationLink-foreground: #B87DF8;

  /* Borders — deep black with faint purple */
  --theia-panel-border: #12101e;
  --theia-sideBar-border: #12101e;
  --theia-activityBar-border: #12101e;
  --theia-activityBar-activeBorder: #A855F7;
  --theia-tab-border: #12101e;
  --theia-editorGroup-border: #12101e;
  --theia-titleBar-border: #12101e;
  --theia-statusBar-border: #12101e;
  --theia-widget-border: #12101e;
  --theia-window-activeBorder: #080810;
  --theia-window-inactiveBorder: #080810;
  --theia-contrastBorder: transparent;
  --theia-sideBarSectionHeader-border: #12101e;
  --theia-menu-border: #12101e;
  --theia-menu-separatorBackground: #1a1528;
  --theia-sash-hoverBorder: rgba(168, 85, 247, 0.5);
  --theia-notebook-cellBorderColor: #12101e;

  /* Input */
  --theia-input-background: #141020;
  --theia-input-foreground: #c8c8e0;
  --theia-input-border: #1a1530;
  --theia-dropdown-background: #141020;
  --theia-dropdown-foreground: #c8c8e0;
  --theia-dropdown-border: #1a1530;

  /* Selection & highlights */
  --theia-editor-selectionBackground: rgba(168, 85, 247, 0.3);
  --theia-editor-lineHighlightBackground: rgba(168, 85, 247, 0.08);
  --theia-editor-findMatchHighlightBackground: rgba(168, 85, 247, 0.25);

  /* Scrollbar */
  --theia-scrollbarSlider-background: rgba(168, 85, 247, 0.15);
  --theia-scrollbarSlider-hoverBackground: rgba(168, 85, 247, 0.3);
  --theia-scrollbarSlider-activeBackground: rgba(168, 85, 247, 0.4);

  /* Terminal */
  --theia-terminal-background: #0d0d14;
  --theia-terminal-foreground: #c8c8e0;

  /* Badges */
  --theia-badge-background: #A855F7;
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
  --theia-list-activeSelectionBackground: rgba(147, 51, 234, 0.15);
  --theia-list-hoverBackground: rgba(147, 51, 234, 0.06);

  /* Ava accent — electric purple */
  --theia-focusBorder: #9333EA;
  --theia-button-background: #9333EA;
  --theia-button-foreground: #ffffff;
  --theia-button-hoverBackground: #7C3AED;
  --theia-progressBar-background: #9333EA;
  --theia-textLink-foreground: #7C3AED;
  --theia-textLink-activeForeground: #6D28D9;
  --theia-notificationLink-foreground: #7C3AED;

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
  --theia-editor-selectionBackground: rgba(147, 51, 234, 0.2);
  --theia-editor-lineHighlightBackground: rgba(147, 51, 234, 0.06);
  --theia-editor-findMatchHighlightBackground: rgba(147, 51, 234, 0.15);

  /* Scrollbar */
  --theia-scrollbarSlider-background: rgba(147, 51, 234, 0.12);
  --theia-scrollbarSlider-hoverBackground: rgba(147, 51, 234, 0.25);
  --theia-scrollbarSlider-activeBackground: rgba(147, 51, 234, 0.35);

  /* Terminal */
  --theia-terminal-background: #ffffff;
  --theia-terminal-foreground: #1e1e2e;

  /* Badges */
  --theia-badge-background: #9333EA;
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
      description: 'Black & electric purple',
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
      description: 'Clean white with purple accents',
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
