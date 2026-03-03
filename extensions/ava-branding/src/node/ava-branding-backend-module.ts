import { ContainerModule } from '@theia/core/shared/inversify';
import { DefaultWorkspaceServer } from '@theia/workspace/lib/node/default-workspace-server';
import { AvaWorkspaceServer } from './ava-workspace-server';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  bind(AvaWorkspaceServer).toSelf().inSingletonScope();
  rebind(DefaultWorkspaceServer).toService(AvaWorkspaceServer);
});
