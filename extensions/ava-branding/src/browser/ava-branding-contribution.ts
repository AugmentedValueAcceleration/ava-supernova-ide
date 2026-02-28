import { injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';

// Ava starburst icon — an 8-pointed star matching the website supernova logo.
// Uses the Ava indigo (#6366F1) with a bright center.
// Base64-encoded at runtime to avoid CSS url() quote-escaping issues.
const AVA_ICON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
  '<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">',
  '<stop offset="0%" stop-color="#e0e7ff"/>',
  '<stop offset="40%" stop-color="#818cf8"/>',
  '<stop offset="100%" stop-color="#4f46e5"/>',
  '</radialGradient></defs>',
  '<polygon fill="url(#g)" points="16,0 18.5,12 24,4 19,13 32,16 19,19 24,28 18.5,20 16,32 13.5,20 8,28 13,19 0,16 13,13 8,4 13.5,12"/>',
  '<circle cx="16" cy="16" r="4" fill="#c7d2fe"/>',
  '<circle cx="16" cy="16" r="2" fill="#e0e7ff"/>',
  '</svg>',
].join('');

@injectable()
export class AvaBrandingContribution implements FrontendApplicationContribution {

  async onStart(app: FrontendApplication): Promise<void> {
    this.applyBranding();
  }

  private applyBranding(): void {
    document.title = 'Ava | Supernova IDE';

    const iconBase64 = btoa(AVA_ICON_SVG);
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --ava-accent: #6366F1;
        --ava-accent-hover: #5558E6;
        --ava-gradient-start: #6366F1;
        --ava-gradient-end: #8B5CF6;
      }

      /* Ava agent panel tab icon — starburst logo */
      .ava-agent-icon {
        display: inline-block;
        width: 16px;
        height: 16px;
        background-image: url("data:image/svg+xml;base64,${iconBase64}");
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }
      .ava-agent-icon::before {
        content: '';
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
