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
        --ava-accent: #6366F1;
        --ava-accent-hover: #5558E6;
        --ava-gradient-start: #6366F1;
        --ava-gradient-end: #8B5CF6;
      }

      /* Custom scrollbar to match Ava theme */
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
        background: rgba(99, 102, 241, 0.3);
        border-radius: 3px;
      }
      .ava-agent-widget ::-webkit-scrollbar-thumb:hover,
      .ava-dashboard-widget ::-webkit-scrollbar-thumb:hover {
        background: rgba(99, 102, 241, 0.5);
      }

      /* ── Welcome page ──────────────────────────────────── */
      .ava-welcome-action-card {
        transition: border-color 0.2s, background 0.2s;
      }
      .ava-welcome-action-card:hover {
        border-color: var(--ava-accent, #6366F1) !important;
        background: rgba(99, 102, 241, 0.06) !important;
      }
      .ava-welcome-setup-card {
        transition: background 0.2s;
      }
      .ava-welcome-setup-card:hover {
        background: rgba(99, 102, 241, 0.06) !important;
      }
      .ava-welcome-recent-item {
        transition: background 0.15s;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
      }
      .ava-welcome-recent-item:hover {
        background: rgba(99, 102, 241, 0.04);
      }
      .ava-welcome-link {
        color: var(--ava-accent, #6366F1) !important;
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
