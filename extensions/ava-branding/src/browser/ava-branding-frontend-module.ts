import { ContainerModule } from '@theia/core/shared/inversify';
import {
  FrontendApplicationContribution,
} from '@theia/core/lib/browser';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { AvaBrandingContribution } from './ava-branding-contribution';
import { AvaWelcomeWidget } from './ava-welcome-widget';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
  bind(AvaBrandingContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaBrandingContribution);

  // Replace Theia's default welcome widget with Ava's customized version
  // (removes AI banner, customizes help links)
  bind(AvaWelcomeWidget).toSelf();
  rebind(GettingStartedWidget).toService(AvaWelcomeWidget);
});
