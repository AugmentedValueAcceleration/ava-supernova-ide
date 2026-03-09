import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { AvaOnboardingDialogFactory, type AvaOnboardingDialogFactory as AvaOnboardingDialogFactoryType } from './ava-onboarding-types';

const ONBOARDING_KEY = 'ava.onboarding.v1';

@injectable()
export class AvaBrandingContribution implements FrontendApplicationContribution {

  @inject(StorageService) protected readonly storageService: StorageService;
  @inject(AvaOnboardingDialogFactory) protected readonly createOnboardingDialog: AvaOnboardingDialogFactoryType;
  @inject(MenuModelRegistry) protected readonly menuRegistry: MenuModelRegistry;
  @inject(FrontendApplicationStateService) protected readonly stateService: FrontendApplicationStateService;
  @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

  async onStart(app: FrontendApplication): Promise<void> {
    this.applyBranding();
    this.hideEditorLayoutMenu();

    // Collapse the bottom panel on startup — Theia's layout persistence
    // restores it from the previous session, but we want it closed by default.
    this.stateService.reachedState('ready').then(async () => {
      app.shell.bottomPanel.hide();

      // The welcome page checkbox sets workbench.startupEditor to 'none',
      // but Theia's layout persistence restores the tab anyway. Close it
      // explicitly if the user opted out.
      await this.preferenceService.ready;
      const startupEditor = this.preferenceService.get<string>('workbench.startupEditor', 'welcomePage');
      if (startupEditor === 'none') {
        const welcomeWidget = app.shell.getWidgets('main').find(
          w => w.id === 'getting.started.widget'
        );
        if (welcomeWidget) {
          welcomeWidget.close();
        }
      }
    });

    const completed = await this.storageService.getData<boolean>(ONBOARDING_KEY, false);
    if (!completed) {
      // Show onboarding after the shell is fully attached and rendered
      const onAttach = () => {
        setTimeout(() => this.showOnboarding(), 500);
      };
      if (app.shell.isAttached) {
        onAttach();
      } else {
        const listener = () => {
          app.shell.node.removeEventListener('attach', listener);
          onAttach();
        };
        app.shell.node.addEventListener('attach', listener);
        // Fallback: if attach event already fired
        setTimeout(() => {
          if (app.shell.isAttached) {
            onAttach();
          }
        }, 2000);
      }
    }
  }

  private async showOnboarding(): Promise<void> {
    try {
      const dialog = this.createOnboardingDialog();
      await dialog.open();
      await this.storageService.setData(ONBOARDING_KEY, true);
    } catch {
      // Dialog was cancelled — still mark as shown to avoid nagging
      await this.storageService.setData(ONBOARDING_KEY, true);
    }
  }

  /** Remove the empty "Editor Layout" submenu from View menu */
  private hideEditorLayoutMenu(): void {
    try {
      // VIEW_APPEARANCE = ['menubar', '4_view', '1_appearance']
      const parent = (this.menuRegistry as any).getMenu(['menubar', '4_view', '1_appearance']);
      if (parent) {
        const children = parent.children || [];
        for (const child of children) {
          if (child.id === '2_editor_submenu') {
            parent.removeNode(child);
            break;
          }
        }
      }
    } catch { /* Not critical — fail silently */ }
  }

  private applyBranding(): void {
    document.title = 'Ava | Supernova';

    const style = document.createElement('style');
    style.textContent = `
      :root {
        --ava-accent: #A855F7;
        --ava-accent-hover: #9333EA;
        --ava-gradient-start: #A855F7;
        --ava-gradient-end: #6D28D9;
        --ava-electric: #BF40FF;
      }

      /* ══════════════════════════════════════════════════════
         DARK THEME — Electric Purple Gradients
         ══════════════════════════════════════════════════════ */

      /* Title bar — horizontal gradient with purple glow center */
      body.theia-dark #theia-top-panel {
        background: linear-gradient(90deg,
          #080810 0%,
          #150a2e 35%,
          #1f0e40 50%,
          #150a2e 65%,
          #080810 100%
        ) !important;
      }

      /* Editor tab bar */
      body.theia-dark .lm-TabBar.theia-app-centers {
        background: #0a0a12 !important;
      }
      body.theia-dark .lm-TabBar.theia-app-centers::after {
        background-color: rgba(168, 85, 247, 0.12) !important;
      }

      /* Inactive tab */
      body.theia-dark #theia-main-content-panel .lm-TabBar .lm-TabBar-tab {
        background: #08080e !important;
        color: #5c5c80 !important;
        border-right: 1px solid rgba(168, 85, 247, 0.06) !important;
        border-top: 2px solid transparent !important;
        border-bottom: none !important;
        transition: background 0.15s, color 0.15s;
      }

      /* Active tab */
      body.theia-dark #theia-main-content-panel .lm-TabBar .lm-TabBar-tab.lm-mod-current {
        background: #0d0d14 !important;
        color: #e0e0f0 !important;
        border-top: 2px solid #A855F7 !important;
      }

      /* Hover tab (non-active) */
      body.theia-dark #theia-main-content-panel .lm-TabBar .lm-TabBar-tab:not(.lm-mod-current):hover {
        background: rgba(168, 85, 247, 0.06) !important;
        color: #9898b8 !important;
      }

      /* Unfocused tab bar */
      body.theia-dark #theia-main-content-panel .lm-TabBar:not(.theia-tabBar-active) .lm-TabBar-tab.lm-mod-current {
        border-top-color: rgba(168, 85, 247, 0.5) !important;
        color: #b0b0cc !important;
      }

      /* Activity bars — vertical purple glow */
      body.theia-dark .theia-app-sidebar-container {
        background: linear-gradient(180deg,
          #080810 0%,
          #140a28 40%,
          #1a0d35 70%,
          #0e0818 100%
        ) !important;
      }

      body.theia-dark .lm-TabBar.theia-app-sides,
      body.theia-dark .lm-TabBar.theia-app-left,
      body.theia-dark .lm-TabBar.theia-app-right {
        background: transparent !important;
      }

      body.theia-dark .theia-sidebar-menu {
        background: transparent !important;
      }

      body.theia-dark .theia-sidebar-menu i {
        background-color: transparent !important;
      }

      /* Left panel */
      body.theia-dark #theia-left-content-panel {
        background: linear-gradient(180deg,
          #0a0a12 0%,
          #100a20 50%,
          #0a0a12 100%
        ) !important;
      }

      /* Right panel */
      body.theia-dark #theia-right-content-panel {
        background: linear-gradient(180deg,
          #0a0a12 0%,
          #100a20 50%,
          #0a0a12 100%
        ) !important;
      }

      body.theia-dark #theia-left-side-panel,
      body.theia-dark #theia-right-side-panel,
      body.theia-dark .theia-side-panel {
        background: transparent !important;
      }

      /* Status bar */
      body.theia-dark #theia-statusBar {
        background: linear-gradient(90deg,
          #080810 0%,
          #120a22 50%,
          #080810 100%
        ) !important;
      }

      /* Section headers */
      body.theia-dark .theia-sidepanel-title,
      body.theia-dark .theia-sidepanel-toolbar {
        background: rgba(168, 85, 247, 0.06) !important;
      }

      /* Active activity icon (left) */
      body.theia-dark .lm-TabBar.theia-app-left .lm-TabBar-tab.lm-mod-current {
        border-left-color: #A855F7 !important;
        box-shadow: inset 3px 0 8px -3px rgba(168, 85, 247, 0.4);
      }

      /* Active activity icon (right) */
      body.theia-dark .lm-TabBar.theia-app-right .lm-TabBar-tab.lm-mod-current {
        border-right-color: #A855F7 !important;
        box-shadow: inset -3px 0 8px -3px rgba(168, 85, 247, 0.4);
      }

      /* ── Bottom panel (Terminal, Output, Problems, etc.) ── */

      /* Bottom panel tab bar background */
      body.theia-dark #theia-bottom-content-panel .lm-TabBar {
        background: #08080e !important;
      }

      /* Bottom panel tab — inactive */
      body.theia-dark #theia-bottom-content-panel .lm-TabBar .lm-TabBar-tab {
        background: #08080e !important;
        color: #5c5c80 !important;
        border-right: 1px solid rgba(168, 85, 247, 0.06) !important;
        border-top: none !important;
        border-bottom: 2px solid transparent !important;
        transition: background 0.15s, color 0.15s;
        padding: 4px 12px !important;
      }

      /* Bottom panel tab — active */
      body.theia-dark #theia-bottom-content-panel .lm-TabBar .lm-TabBar-tab.lm-mod-current {
        background: #0d0d14 !important;
        color: #e0e0f0 !important;
        border-bottom: 2px solid #A855F7 !important;
      }

      /* Bottom panel tab — hover */
      body.theia-dark #theia-bottom-content-panel .lm-TabBar .lm-TabBar-tab:not(.lm-mod-current):hover {
        background: rgba(168, 85, 247, 0.06) !important;
        color: #9898b8 !important;
      }

      /* Bottom panel content area */
      body.theia-dark #theia-bottom-content-panel .lm-BoxPanel,
      body.theia-dark #theia-bottom-content-panel .theia-output-widget,
      body.theia-dark #theia-bottom-content-panel .p-Widget {
        background: #0a0a12 !important;
      }

      /* Terminal widget — slightly darker than editor for depth */
      body.theia-dark .terminal-wrapper,
      body.theia-dark .xterm {
        background-color: #0a0a12 !important;
      }

      body.theia-dark .xterm-viewport {
        background-color: #0a0a12 !important;
      }

      /* Terminal instance tabs (the powershell/bash tabs on the right) */
      body.theia-dark .theia-terminal-side-bar {
        background: #08080e !important;
      }

      body.theia-dark .theia-terminal-side-bar .lm-TabBar-tab {
        background: transparent !important;
        color: #5c5c80 !important;
        border-left: 2px solid transparent !important;
        transition: background 0.15s, color 0.15s;
      }

      body.theia-dark .theia-terminal-side-bar .lm-TabBar-tab.lm-mod-current {
        background: rgba(168, 85, 247, 0.08) !important;
        color: #c8c8e0 !important;
        border-left: 2px solid #A855F7 !important;
      }

      body.theia-dark .theia-terminal-side-bar .lm-TabBar-tab:not(.lm-mod-current):hover {
        background: rgba(168, 85, 247, 0.04) !important;
        color: #9898b8 !important;
      }

      /* Panel toolbar (right side icons: +, split, trash, etc.) */
      body.theia-dark .lm-TabBar-toolbar {
        background: transparent !important;
      }

      body.theia-dark .lm-TabBar-toolbar .item > div {
        color: #5c5c80 !important;
        transition: color 0.15s;
      }

      body.theia-dark .lm-TabBar-toolbar .item > div:hover {
        color: #A855F7 !important;
      }

      /* ══════════════════════════════════════════════════════
         LIGHT THEME — Clean White & Electric Blue
         ══════════════════════════════════════════════════════ */

      /* Title bar — warm cream, subtle blue tint center */
      body.theia-light #theia-top-panel {
        background: linear-gradient(90deg,
          #f1f0ed 0%,
          #eef0f2 40%,
          #eceff4 50%,
          #eef0f2 60%,
          #f1f0ed 100%
        ) !important;
      }

      /* Editor tab bar — warm cream */
      body.theia-light .lm-TabBar.theia-app-centers {
        background: #f1f0ed !important;
      }
      body.theia-light .lm-TabBar.theia-app-centers::after {
        background-color: rgba(14, 165, 233, 0.06) !important;
      }

      /* Inactive tab — warm cream */
      body.theia-light #theia-main-content-panel .lm-TabBar .lm-TabBar-tab {
        background: #f1f0ed !important;
        color: #8890a0 !important;
        border-right: 1px solid rgba(14, 165, 233, 0.06) !important;
        border-top: 2px solid transparent !important;
        border-bottom: none !important;
        transition: background 0.15s, color 0.15s;
      }

      /* Active tab — cream white with blue top accent */
      body.theia-light #theia-main-content-panel .lm-TabBar .lm-TabBar-tab.lm-mod-current {
        background: #fdfcfa !important;
        color: #1a1a2e !important;
        border-top: 2px solid #0EA5E9 !important;
      }

      /* Hover tab (non-active) */
      body.theia-light #theia-main-content-panel .lm-TabBar .lm-TabBar-tab:not(.lm-mod-current):hover {
        background: rgba(14, 165, 233, 0.05) !important;
        color: #505868 !important;
      }

      /* Unfocused tab bar — dimmed accent */
      body.theia-light #theia-main-content-panel .lm-TabBar:not(.theia-tabBar-active) .lm-TabBar-tab.lm-mod-current {
        border-top-color: rgba(14, 165, 233, 0.35) !important;
        color: #404858 !important;
      }

      /* Activity bars — warm cream, nearly flat */
      body.theia-light .theia-app-sidebar-container {
        background: linear-gradient(180deg,
          #f1f0ed 0%,
          #edece9 50%,
          #f1f0ed 100%
        ) !important;
      }

      body.theia-light .lm-TabBar.theia-app-sides,
      body.theia-light .lm-TabBar.theia-app-left,
      body.theia-light .lm-TabBar.theia-app-right {
        background: transparent !important;
      }

      body.theia-light .theia-sidebar-menu {
        background: transparent !important;
      }

      body.theia-light .theia-sidebar-menu i {
        background-color: transparent !important;
      }

      /* Left panel — warm cream */
      body.theia-light #theia-left-content-panel {
        background: #f6f5f2 !important;
      }

      /* Right panel — warm cream */
      body.theia-light #theia-right-content-panel {
        background: #f6f5f2 !important;
      }

      body.theia-light #theia-left-side-panel,
      body.theia-light #theia-right-side-panel,
      body.theia-light .theia-side-panel {
        background: transparent !important;
      }

      /* Status bar — warm cream, subtle blue hint */
      body.theia-light #theia-statusBar {
        background: linear-gradient(90deg,
          #f1f0ed 0%,
          #eef0f2 50%,
          #f1f0ed 100%
        ) !important;
      }

      /* Section headers — very subtle blue tint */
      body.theia-light .theia-sidepanel-title,
      body.theia-light .theia-sidepanel-toolbar {
        background: rgba(14, 165, 233, 0.04) !important;
      }

      /* Active activity icon (left) — blue accent */
      body.theia-light .lm-TabBar.theia-app-left .lm-TabBar-tab.lm-mod-current {
        border-left-color: #0EA5E9 !important;
        box-shadow: inset 3px 0 8px -3px rgba(14, 165, 233, 0.2);
      }

      /* Active activity icon (right) — blue accent */
      body.theia-light .lm-TabBar.theia-app-right .lm-TabBar-tab.lm-mod-current {
        border-right-color: #0EA5E9 !important;
        box-shadow: inset -3px 0 8px -3px rgba(14, 165, 233, 0.2);
      }

      /* ── Bottom panel (Terminal, Output, Problems, etc.) ── */

      /* Bottom panel tab bar background */
      body.theia-light #theia-bottom-content-panel .lm-TabBar {
        background: #f1f0ed !important;
      }

      /* Bottom panel tab — inactive */
      body.theia-light #theia-bottom-content-panel .lm-TabBar .lm-TabBar-tab {
        background: #f1f0ed !important;
        color: #8890a0 !important;
        border-right: 1px solid rgba(14, 165, 233, 0.06) !important;
        border-top: none !important;
        border-bottom: 2px solid transparent !important;
        transition: background 0.15s, color 0.15s;
        padding: 4px 12px !important;
      }

      /* Bottom panel tab — active */
      body.theia-light #theia-bottom-content-panel .lm-TabBar .lm-TabBar-tab.lm-mod-current {
        background: #fdfcfa !important;
        color: #1a1a2e !important;
        border-bottom: 2px solid #0EA5E9 !important;
      }

      /* Bottom panel tab — hover */
      body.theia-light #theia-bottom-content-panel .lm-TabBar .lm-TabBar-tab:not(.lm-mod-current):hover {
        background: rgba(14, 165, 233, 0.05) !important;
        color: #505868 !important;
      }

      /* Bottom panel content area */
      body.theia-light #theia-bottom-content-panel .lm-BoxPanel,
      body.theia-light #theia-bottom-content-panel .theia-output-widget,
      body.theia-light #theia-bottom-content-panel .p-Widget {
        background: #f6f5f2 !important;
      }

      /* Terminal widget */
      body.theia-light .terminal-wrapper,
      body.theia-light .xterm {
        background-color: #f6f5f2 !important;
      }

      body.theia-light .xterm-viewport {
        background-color: #f6f5f2 !important;
      }

      /* Terminal instance tabs */
      body.theia-light .theia-terminal-side-bar {
        background: #f1f0ed !important;
      }

      body.theia-light .theia-terminal-side-bar .lm-TabBar-tab {
        background: transparent !important;
        color: #8890a0 !important;
        border-left: 2px solid transparent !important;
        transition: background 0.15s, color 0.15s;
      }

      body.theia-light .theia-terminal-side-bar .lm-TabBar-tab.lm-mod-current {
        background: rgba(14, 165, 233, 0.06) !important;
        color: #1a1a2e !important;
        border-left: 2px solid #0EA5E9 !important;
      }

      body.theia-light .theia-terminal-side-bar .lm-TabBar-tab:not(.lm-mod-current):hover {
        background: rgba(14, 165, 233, 0.03) !important;
        color: #505868 !important;
      }

      /* Panel toolbar icons */
      body.theia-light .lm-TabBar-toolbar .item > div {
        color: #8890a0 !important;
        transition: color 0.15s;
      }

      body.theia-light .lm-TabBar-toolbar .item > div:hover {
        color: #0EA5E9 !important;
      }

      /* ══════════════════════════════════════════════════════
         COMMON — Both themes
         ══════════════════════════════════════════════════════ */

      /* Custom scrollbar */
      .ava-agent-widget ::-webkit-scrollbar,
      .ava-dashboard-widget ::-webkit-scrollbar {
        width: 6px;
      }
      .ava-agent-widget ::-webkit-scrollbar-track,
      .ava-dashboard-widget ::-webkit-scrollbar-track {
        background: transparent;
      }
      .ava-agent-widget ::-webkit-scrollbar-thumb,
      .ava-dashboard-widget ::-webkit-scrollbar-thumb {
        background: rgba(168, 85, 247, 0.3);
        border-radius: 3px;
      }
      .ava-agent-widget ::-webkit-scrollbar-thumb:hover,
      .ava-dashboard-widget ::-webkit-scrollbar-thumb:hover {
        background: rgba(168, 85, 247, 0.5);
      }

      /* Welcome page */
      .ava-welcome-action-card {
        transition: border-color 0.2s, background 0.2s;
      }
      .ava-welcome-action-card:hover {
        border-color: var(--ava-accent, #A855F7) !important;
        background: rgba(168, 85, 247, 0.06) !important;
      }
      .ava-welcome-setup-card {
        transition: background 0.2s;
      }
      .ava-welcome-setup-card:hover {
        background: rgba(168, 85, 247, 0.06) !important;
      }
      .ava-welcome-recent-item {
        transition: background 0.15s;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
      }
      .ava-welcome-recent-item:hover {
        background: rgba(168, 85, 247, 0.04);
      }
      .ava-welcome-link {
        color: var(--ava-accent, #A855F7) !important;
        cursor: pointer;
        text-decoration: none;
      }
      .ava-welcome-link:hover {
        text-decoration: underline;
      }

      /* Onboarding dialog */
      .dialogBlock:has(.ava-onboarding) {
        border-radius: 12px;
        overflow: hidden;
      }

      /* Hide main toolbar — collapse the row entirely */
      #main-toolbar {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      /* Purple border + rounded corners on Ava panels */
      body.theia-dark .ava-agent-widget {
        border: 2px solid rgba(168, 85, 247, 0.2);
        border-radius: 10px;
        overflow: hidden;
      }
      body.theia-dark #getting\\.started\\.widget {
        border: 2px solid rgba(168, 85, 247, 0.2);
        border-radius: 10px;
        overflow: hidden;
      }
      body.theia-dark .ava-dashboard-widget {
        border: 2px solid rgba(168, 85, 247, 0.2);
        border-radius: 10px;
        overflow: hidden;
      }

      /* Light theme — blue border + rounded corners */
      body.theia-light .ava-agent-widget {
        border: 2px solid rgba(14, 165, 233, 0.15);
        border-radius: 10px;
        overflow: hidden;
      }
      body.theia-light #getting\\.started\\.widget {
        border: 2px solid rgba(14, 165, 233, 0.15);
        border-radius: 10px;
        overflow: hidden;
      }
      body.theia-light .ava-dashboard-widget {
        border: 2px solid rgba(14, 165, 233, 0.15);
        border-radius: 10px;
        overflow: hidden;
      }
    `;
    document.head.appendChild(style);
  }
}
