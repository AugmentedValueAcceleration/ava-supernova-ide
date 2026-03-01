import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import {
  FrontendApplicationContribution,
} from '@theia/core/lib/browser';
import { DialogProps } from '@theia/core/lib/browser/dialogs';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { AvaBrandingContribution } from './ava-branding-contribution';
import { AvaWelcomeWidget } from './ava-welcome-widget';
import { AvaThemeContribution } from './ava-theme-contribution';
import { AvaOnboardingDialog } from './ava-onboarding-dialog';
import { AvaOnboardingDialogFactory } from './ava-onboarding-types';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
  bind(AvaBrandingContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaBrandingContribution);

  // Replace Theia's default welcome widget with Ava's customized version
  bind(AvaWelcomeWidget).toSelf();
  rebind(GettingStartedWidget).toService(AvaWelcomeWidget);

  // Ava Dark + Ava Light theme system
  bind(AvaThemeContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaThemeContribution);

  // First-launch onboarding wizard — use a child container to provide DialogProps
  bind(AvaOnboardingDialogFactory).toFactory((ctx: interfaces.Context) => () => {
    const child = ctx.container.createChild();
    child.bind(DialogProps).toConstantValue({ title: 'Welcome' });
    child.bind(AvaOnboardingDialog).toSelf();
    return child.get(AvaOnboardingDialog);
  });
});
