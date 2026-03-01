import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { AvaAgentServiceImpl } from './ava-agent-service';
import { AVA_AGENT_SERVICE_PATH, IAvaAgentClient } from '../common/ava-agent-protocol';

const avaAgentConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
  bind(AvaAgentServiceImpl).toSelf().inSingletonScope();
  bindBackendService<AvaAgentServiceImpl, IAvaAgentClient>(
    AVA_AGENT_SERVICE_PATH,
    AvaAgentServiceImpl,
    (service, client) => {
      service.setClient(client as unknown as IAvaAgentClient);
      return service;
    },
  );
});

export default new ContainerModule((bind) => {
  bind(ConnectionContainerModule).toConstantValue(avaAgentConnectionModule);
});
