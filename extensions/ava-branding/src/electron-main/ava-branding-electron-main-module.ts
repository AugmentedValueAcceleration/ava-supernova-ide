import { ContainerModule } from '@theia/core/shared/inversify';
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { AvaBrandingElectronContribution } from './ava-branding-electron-contribution';

export default new ContainerModule(bind => {
  bind(ElectronMainApplicationContribution).to(AvaBrandingElectronContribution).inSingletonScope();
});
