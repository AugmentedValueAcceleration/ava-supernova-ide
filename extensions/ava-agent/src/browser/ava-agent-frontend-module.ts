import { ContainerModule } from '@theia/core/shared/inversify';
import { AvaAgentWidget } from './ava-agent-widget';
import { AvaAgentContribution } from './ava-agent-contribution';
import {
  bindViewContribution,
  FrontendApplicationContribution,
  WidgetFactory,
} from '@theia/core/lib/browser';

export default new ContainerModule((bind) => {
  bindViewContribution(bind, AvaAgentContribution);
  bind(FrontendApplicationContribution).toService(AvaAgentContribution);
  bind(AvaAgentWidget).toSelf();
  bind(WidgetFactory)
    .toDynamicValue((ctx) => ({
      id: AvaAgentWidget.ID,
      createWidget: () => ctx.container.get<AvaAgentWidget>(AvaAgentWidget),
    }))
    .inSingletonScope();
});
