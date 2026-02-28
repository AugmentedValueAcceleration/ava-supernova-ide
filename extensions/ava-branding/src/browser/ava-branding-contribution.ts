import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';

@injectable()
export class AvaBrandingContribution implements FrontendApplicationContribution {

  async onStart(app: FrontendApplication): Promise<void> {
    this.applyBranding();
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
      .ava-agent-widget ::-webkit-scrollbar {
        width: 6px;
      }
      .ava-agent-widget ::-webkit-scrollbar-track {
        background: transparent;
      }
      .ava-agent-widget ::-webkit-scrollbar-thumb {
        background: rgba(99, 102, 241, 0.3);
        border-radius: 3px;
      }
      .ava-agent-widget ::-webkit-scrollbar-thumb:hover {
        background: rgba(99, 102, 241, 0.5);
      }
    `;
    document.head.appendChild(style);
  }
}
