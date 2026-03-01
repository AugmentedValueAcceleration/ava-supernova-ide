import { ContainerModule } from '@theia/core/shared/inversify';
import {
  bindViewContribution,
  FrontendApplicationContribution,
  WidgetFactory,
  KeybindingContribution,
} from '@theia/core/lib/browser';
import { CommandContribution, MenuContribution, PreferenceContribution } from '@theia/core/lib/common';
import { ServiceConnectionProvider, RemoteConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { AvaAgentWidget } from './ava-agent-widget';
import { AvaAgentContribution } from './ava-agent-contribution';
import { AvaAgentClient } from './ava-agent-client';
import { AvaDashboardWidget } from './ava-dashboard-widget';
import { AvaDashboardContribution } from './ava-dashboard-contribution';
import { AvaEditorCommands } from './ava-editor-commands';
import { AvaStatusBarContribution } from './ava-statusbar-contribution';
import { AvaEditorChangeTracker } from './ava-editor-change-tracker';
import { AvaTerminalContribution } from './ava-terminal-contribution';
import { AvaInlineCompletionProvider } from './ava-inline-completion-provider';
import { AvaFileDecorationsProvider } from './ava-file-decorations-provider';
import { AvaContextManager } from './ava-context-manager';
import { AvaProjectContribution } from './ava-project-contribution';
import { AvaGitCommands } from './ava-git-commands';
import { AvaDiagnosticsContribution } from './ava-diagnostics-contribution';
import { AvaSnippetContribution } from './ava-snippet-contribution';
import { AvaCodeActionContribution } from './ava-code-action-provider';
import { AvaTemplateContribution } from './ava-template-contribution';
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

  // Editor context menu — "Ask Ava" submenu
  bind(AvaEditorCommands).toSelf().inSingletonScope();
  bind(CommandContribution).toService(AvaEditorCommands);
  bind(MenuContribution).toService(AvaEditorCommands);
  bind(KeybindingContribution).toService(AvaEditorCommands);

  // Status bar — model, status dot, mode badge, token usage
  bind(AvaStatusBarContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaStatusBarContribution);
  bind(CommandContribution).toService(AvaStatusBarContribution);

  // 2.3 — File tree decorations (indigo "A" badge on Ava-modified files)
  bind(AvaFileDecorationsProvider).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaFileDecorationsProvider);

  // 2.3 — Live editor integration (diff decorations, accept/reject, undo)
  bind(AvaEditorChangeTracker).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaEditorChangeTracker);
  bind(CommandContribution).toService(AvaEditorChangeTracker);

  // 2.4 — Terminal integration (Ava Terminal for bash output)
  bind(AvaTerminalContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaTerminalContribution);

  // 2.4 — Terminal preference: run in user's existing terminal
  bind(PreferenceContribution).toConstantValue({
    schema: {
      type: 'object',
      properties: {
        'ava.terminal.useExisting': {
          type: 'boolean',
          default: false,
          description: 'When enabled, Ava runs commands in your existing terminal instead of a dedicated Ava Terminal.',
        },
      },
    },
  });

  // 2.5 — Inline completions (ghost text via DeepSeek FIM)
  bind(AvaInlineCompletionProvider).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaInlineCompletionProvider);
  bind(CommandContribution).toService(AvaInlineCompletionProvider);

  // 3.1 — Project detection (extension suggestions + workspace config)
  bind(AvaProjectContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaProjectContribution);

  // 3.2 — Smart file context (tracks active file, open tabs, pinned files)
  bind(AvaContextManager).toSelf().inSingletonScope();

  // 3.3 — Diagnostics (security findings → Problems panel + "Fix with Ava")
  bind(AvaDiagnosticsContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaDiagnosticsContribution);
  bind(CommandContribution).toService(AvaDiagnosticsContribution);

  // 3.4 — Git-aware commands (commit message, explain diff, review, PR, resolve conflict)
  bind(AvaGitCommands).toSelf().inSingletonScope();
  bind(CommandContribution).toService(AvaGitCommands);
  bind(MenuContribution).toService(AvaGitCommands);

  // 4.3 — Built-in language-aware snippets
  bind(AvaSnippetContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaSnippetContribution);

  // 4.3 — Universal code actions ("Fix with Ava", "Explain", "Refactor")
  bind(AvaCodeActionContribution).toSelf().inSingletonScope();
  bind(FrontendApplicationContribution).toService(AvaCodeActionContribution);
  bind(CommandContribution).toService(AvaCodeActionContribution);

  // 4.2 — Workspace templates (new from template, scaffold project)
  bind(AvaTemplateContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(AvaTemplateContribution);
});
