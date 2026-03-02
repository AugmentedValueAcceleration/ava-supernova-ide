import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { AvaOnboardingDialogFactory, type AvaOnboardingDialogFactory as AvaOnboardingDialogFactoryType } from './ava-onboarding-types';

const ONBOARDING_KEY = 'ava.onboarding.v1';

@injectable()
export class AvaBrandingContribution implements FrontendApplicationContribution {

  @inject(StorageService) protected readonly storageService: StorageService;
  @inject(AvaOnboardingDialogFactory) protected readonly createOnboardingDialog: AvaOnboardingDialogFactoryType;

  async onStart(app: FrontendApplication): Promise<void> {
    this.applyBranding();

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

  private applyBranding(): void {
    document.title = 'Ava | Supernova IDE';

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
         Electric Purple Gradients — title bar, sidebars, activity bar
         ══════════════════════════════════════════════════════ */

      /* Title bar — horizontal gradient with purple glow center */
      #theia-top-panel {
        background: linear-gradient(90deg,
          #080810 0%,
          #150a2e 35%,
          #1f0e40 50%,
          #150a2e 65%,
          #080810 100%
        ) !important;
      }

      /* Editor tab bar — dark with faint purple tint */
      .lm-TabBar.theia-app-centers {
        background: #0a0a12 !important;
      }
      .lm-TabBar.theia-app-centers::after {
        background-color: rgba(168, 85, 247, 0.12) !important;
      }

      /* ── Editor tabs — active / inactive / hover ──────────── */

      /* Inactive tab — deep dark, dimmed text */
      #theia-main-content-panel .lm-TabBar .lm-TabBar-tab {
        background: #08080e !important;
        color: #5c5c80 !important;
        border-right: 1px solid rgba(168, 85, 247, 0.06) !important;
        border-top: 2px solid transparent !important;
        border-bottom: none !important;
        transition: background 0.15s, color 0.15s;
      }

      /* Active tab — slightly lifted, purple top accent, brighter text */
      #theia-main-content-panel .lm-TabBar .lm-TabBar-tab.lm-mod-current {
        background: #0d0d14 !important;
        color: #e0e0f0 !important;
        border-top: 2px solid #A855F7 !important;
      }

      /* Hover tab (non-active) — subtle purple lift */
      #theia-main-content-panel .lm-TabBar .lm-TabBar-tab:not(.lm-mod-current):hover {
        background: rgba(168, 85, 247, 0.06) !important;
        color: #9898b8 !important;
      }

      /* Unfocused tab bar — slightly dimmer active tab */
      #theia-main-content-panel .lm-TabBar:not(.theia-tabBar-active) .lm-TabBar-tab.lm-mod-current {
        border-top-color: rgba(168, 85, 247, 0.5) !important;
        color: #b0b0cc !important;
      }

      /* Activity bars (left + right icon strips) — vertical purple glow */
      .theia-app-sidebar-container {
        background: linear-gradient(180deg,
          #080810 0%,
          #140a28 40%,
          #1a0d35 70%,
          #0e0818 100%
        ) !important;
      }

      /* The icon tab bars themselves — transparent so container gradient shows */
      .lm-TabBar.theia-app-sides,
      .lm-TabBar.theia-app-left,
      .lm-TabBar.theia-app-right {
        background: transparent !important;
      }

      /* Sidebar menus (top/bottom icons) — transparent */
      .theia-sidebar-menu {
        background: transparent !important;
      }

      /* Sidebar menu item icons (Manage button etc.) — transparent so gradient shows */
      .theia-sidebar-menu i {
        background-color: transparent !important;
      }

      /* Left content panel — gradient */
      #theia-left-content-panel {
        background: linear-gradient(180deg,
          #0a0a12 0%,
          #100a20 50%,
          #0a0a12 100%
        ) !important;
      }

      /* Right content panel — gradient */
      #theia-right-content-panel {
        background: linear-gradient(180deg,
          #0a0a12 0%,
          #100a20 50%,
          #0a0a12 100%
        ) !important;
      }

      /* Side panels (inner dock panels) — transparent so parent gradient shows */
      #theia-left-side-panel,
      #theia-right-side-panel,
      .theia-side-panel {
        background: transparent !important;
      }

      /* Status bar — horizontal gradient matching title bar */
      #theia-statusBar {
        background: linear-gradient(90deg,
          #080810 0%,
          #120a22 50%,
          #080810 100%
        ) !important;
      }

      /* Section headers in sidebars — translucent purple */
      .theia-sidepanel-title,
      .theia-sidepanel-toolbar {
        background: rgba(168, 85, 247, 0.06) !important;
      }

      /* Active activity bar icon — electric purple glow (left) */
      .lm-TabBar.theia-app-left .lm-TabBar-tab.lm-mod-current {
        border-left-color: #A855F7 !important;
        box-shadow: inset 3px 0 8px -3px rgba(168, 85, 247, 0.4);
      }

      /* Active activity bar icon — electric purple glow (right) */
      .lm-TabBar.theia-app-right .lm-TabBar-tab.lm-mod-current {
        border-right-color: #A855F7 !important;
        box-shadow: inset -3px 0 8px -3px rgba(168, 85, 247, 0.4);
      }

      /* ══════════════════════════════════════════════════════
         Custom scrollbar
         ══════════════════════════════════════════════════════ */
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

      /* ── Welcome page ──────────────────────────────────── */
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

      /* ── Onboarding dialog ─────────────────────────────── */
      .dialogBlock:has(.ava-onboarding) {
        border-radius: 12px;
        overflow: hidden;
      }
    `;
    document.head.appendChild(style);
  }
}
