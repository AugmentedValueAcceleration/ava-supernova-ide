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
  --theia-terminal-background: #0a0a12;
  --theia-terminal-foreground: #c8c8e0;
  --theia-terminal-selectionBackground: rgba(168, 85, 247, 0.30);
  --theia-terminalCursor-foreground: #A855F7;
  --theia-terminalCursor-background: #0a0a12;

  /* Terminal ANSI palette — purple-tinted for Ava Dark */
  --theia-terminal-ansiBlack: #1a1a2e;
  --theia-terminal-ansiRed: #F87171;
  --theia-terminal-ansiGreen: #4ADE80;
  --theia-terminal-ansiYellow: #FACC15;
  --theia-terminal-ansiBlue: #818CF8;
  --theia-terminal-ansiMagenta: #C084FC;
  --theia-terminal-ansiCyan: #22D3EE;
  --theia-terminal-ansiWhite: #c8c8e0;
  --theia-terminal-ansiBrightBlack: #5c5c80;
  --theia-terminal-ansiBrightRed: #FCA5A5;
  --theia-terminal-ansiBrightGreen: #86EFAC;
  --theia-terminal-ansiBrightYellow: #FDE68A;
  --theia-terminal-ansiBrightBlue: #A5B4FC;
  --theia-terminal-ansiBrightMagenta: #D8B4FE;
  --theia-terminal-ansiBrightCyan: #67E8F9;
  --theia-terminal-ansiBrightWhite: #f0f0ff;

  /* Badges */
  --theia-badge-background: #A855F7;
  --theia-badge-foreground: #ffffff;
}
`;

// ── Ava Light — Warm Cream & Electric Blue ───────────────────────────────────
const AVA_LIGHT_CSS = `
:root {
  /* Base palette — warm cream whites */
  --theia-editor-background: #fdfcfa;
  --theia-editor-foreground: #1a1a2e;
  --theia-sideBar-background: #f6f5f2;
  --theia-activityBar-background: #f1f0ed;
  --theia-panel-background: #fdfcfa;
  --theia-titleBar-activeBackground: #f1f0ed;
  --theia-titleBar-inactiveBackground: #f4f3f0;
  --theia-statusBar-background: #f1f0ed;
  --theia-statusBar-foreground: #4a4e5c;
  --theia-tab-activeBackground: #fdfcfa;
  --theia-tab-inactiveBackground: #f1f0ed;
  --theia-tab-activeForeground: #1a1a2e;
  --theia-tab-inactiveForeground: #8890a0;
  --theia-list-activeSelectionBackground: rgba(14, 165, 233, 0.14);
  --theia-list-hoverBackground: rgba(14, 165, 233, 0.06);

  /* Ava accent — electric blue */
  --theia-focusBorder: #0EA5E9;
  --theia-button-background: #0EA5E9;
  --theia-button-foreground: #ffffff;
  --theia-button-hoverBackground: #0284C7;
  --theia-progressBar-background: #0EA5E9;
  --theia-textLink-foreground: #0284C7;
  --theia-textLink-activeForeground: #0369A1;
  --theia-notificationLink-foreground: #0284C7;

  /* Borders — warm neutral grays */
  --theia-panel-border: #e4e2de;
  --theia-sideBar-border: #e4e2de;
  --theia-activityBar-border: #e4e2de;
  --theia-activityBar-activeBorder: #0EA5E9;
  --theia-tab-border: #e4e2de;
  --theia-editorGroup-border: #e4e2de;
  --theia-titleBar-border: #e4e2de;
  --theia-statusBar-border: #e4e2de;
  --theia-widget-border: #e4e2de;
  --theia-window-activeBorder: #e4e2de;
  --theia-window-inactiveBorder: #eceae6;
  --theia-contrastBorder: transparent;
  --theia-sideBarSectionHeader-border: #e4e2de;
  --theia-menu-border: #e4e2de;
  --theia-menu-separatorBackground: #eceae6;
  --theia-sash-hoverBorder: rgba(14, 165, 233, 0.4);

  /* Input — cream tint */
  --theia-input-background: #f6f5f2;
  --theia-input-foreground: #1a1a2e;
  --theia-input-border: #dad8d4;
  --theia-dropdown-background: #f6f5f2;
  --theia-dropdown-foreground: #1a1a2e;
  --theia-dropdown-border: #dad8d4;

  /* Selection & highlights — blue tint */
  --theia-editor-selectionBackground: rgba(14, 165, 233, 0.18);
  --theia-editor-lineHighlightBackground: rgba(14, 165, 233, 0.05);
  --theia-editor-findMatchHighlightBackground: rgba(14, 165, 233, 0.15);

  /* Scrollbar — subtle blue */
  --theia-scrollbarSlider-background: rgba(14, 165, 233, 0.10);
  --theia-scrollbarSlider-hoverBackground: rgba(14, 165, 233, 0.20);
  --theia-scrollbarSlider-activeBackground: rgba(14, 165, 233, 0.30);

  /* Terminal */
  --theia-terminal-background: #f6f5f2;
  --theia-terminal-foreground: #1a1a2e;
  --theia-terminal-selectionBackground: rgba(14, 165, 233, 0.20);
  --theia-terminalCursor-foreground: #0EA5E9;
  --theia-terminalCursor-background: #f6f5f2;

  /* Terminal ANSI palette — clean & readable for Ava Light */
  --theia-terminal-ansiBlack: #1a1a2e;
  --theia-terminal-ansiRed: #DC2626;
  --theia-terminal-ansiGreen: #16A34A;
  --theia-terminal-ansiYellow: #CA8A04;
  --theia-terminal-ansiBlue: #4F46E5;
  --theia-terminal-ansiMagenta: #9333EA;
  --theia-terminal-ansiCyan: #0891B2;
  --theia-terminal-ansiWhite: #4a4e5c;
  --theia-terminal-ansiBrightBlack: #8890a0;
  --theia-terminal-ansiBrightRed: #EF4444;
  --theia-terminal-ansiBrightGreen: #22C55E;
  --theia-terminal-ansiBrightYellow: #EAB308;
  --theia-terminal-ansiBrightBlue: #6366F1;
  --theia-terminal-ansiBrightMagenta: #A855F7;
  --theia-terminal-ansiBrightCyan: #06B6D4;
  --theia-terminal-ansiBrightWhite: #1a1a2e;

  /* Badges — electric blue */
  --theia-badge-background: #0EA5E9;
  --theia-badge-foreground: #ffffff;

  /* Sidebar section header */
  --theia-sideBarSectionHeader-background: rgba(14, 165, 233, 0.05);
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
      description: 'Clean white with electric blue accents',
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

    // Remove built-in Theia themes — only Ava Dark and Ava Light should appear
    const registry = (this.themeService as any).themes;
    if (registry) {
      delete registry['dark'];
      delete registry['light'];
      delete registry['hc-theia'];
      delete registry['hc-theia-light'];
    }

    // If the user previously had a built-in theme selected, switch to Ava Dark
    const current = this.themeService.getCurrentTheme();
    if (!current || !current.id.startsWith('ava-')) {
      this.themeService.setCurrentTheme('ava-dark');
    }
  }

  async onStart(): Promise<void> {
    // Theme registration happens in @postConstruct.
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
