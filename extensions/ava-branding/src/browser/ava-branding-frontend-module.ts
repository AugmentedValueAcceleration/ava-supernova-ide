import { ContainerModule } from '@theia/core/shared/inversify';
import {
  FrontendApplicationContribution,
} from '@theia/core/lib/browser';
import { AvaBrandingContribution } from './ava-branding-contribution';

export default new ContainerModule((bind) => {
  bind(AvaBrandingContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaBrandingContribution);
});
