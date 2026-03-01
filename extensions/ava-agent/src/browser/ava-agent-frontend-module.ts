import { ContainerModule } from '@theia/core/shared/inversify';
import {
  bindViewContribution,
  FrontendApplicationContribution,
  WidgetFactory,
} from '@theia/core/lib/browser';
import { ServiceConnectionProvider, RemoteConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { AvaAgentWidget } from './ava-agent-widget';
import { AvaAgentContribution } from './ava-agent-contribution';
import { AvaAgentClient } from './ava-agent-client';
import { AvaDashboardWidget } from './ava-dashboard-widget';
import { AvaDashboardContribution } from './ava-dashboard-contribution';
import {
  IAvaAgentService,
  AvaAgentService,
  AVA_AGENT_SERVICE_PATH,
} from '../common/ava-agent-protocol';

export default new ContainerModule((bind) => {
  // Client singleton — receives backend notifications, manages chat state
  bind(AvaAgentClient).toSelf().inSingletonScope();

  // RPC proxy to backend service — pass client as target so backend notifications
  // are dispatched to client.notify*() methods
  bind(AvaAgentService).toDynamicValue(ctx => {
    const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
    const client = ctx.container.get<AvaAgentClient>(AvaAgentClient);
    return provider.createProxy<IAvaAgentService>(AVA_AGENT_SERVICE_PATH, client);
  }).inSingletonScope();

  // Widget + view contribution
  bindViewContribution(bind, AvaAgentContribution);
  bind(FrontendApplicationContribution).toService(AvaAgentContribution);
  bind(AvaAgentWidget).toSelf();
  bind(WidgetFactory)
    .toDynamicValue((ctx) => ({
      id: AvaAgentWidget.ID,
      createWidget: () => ctx.container.get<AvaAgentWidget>(AvaAgentWidget),
    }))
    .inSingletonScope();

  // Dashboard widget + view contribution (right sidebar)
  bindViewContribution(bind, AvaDashboardContribution);
  bind(FrontendApplicationContribution).toService(AvaDashboardContribution);
  bind(AvaDashboardWidget).toSelf();
  bind(WidgetFactory)
    .toDynamicValue((ctx) => ({
      id: AvaDashboardWidget.ID,
      createWidget: () => ctx.container.get<AvaDashboardWidget>(AvaDashboardWidget),
    }))
    .inSingletonScope();
});
