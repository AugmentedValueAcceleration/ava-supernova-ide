/**
 * Registers "Fix with Ava", "Explain with Ava", and "Refactor with Ava"
 * code actions on all languages. Works with any diagnostic (not just Ava-owned).
 */
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry, Command } from '@theia/core/lib/common';
import { MonacoLanguages } from '@theia/monaco/lib/browser/monaco-languages';
import { EditorManager } from '@theia/editor/lib/browser';
import { AvaAgentService, IAvaAgentService } from '../common/ava-agent-protocol';
import * as monaco from '@theia/monaco-editor-core';

export const AvaFixDiagnosticCommand: Command = {
  id: 'ava.fixDiagnostic',
  label: 'Ava: Fix Diagnostic',
  category: 'Ava',
};

export const AvaExplainSelectionCommand: Command = {
  id: 'ava.explainSelection',
  label: 'Ava: Explain Selection',
  category: 'Ava',
};

export const AvaRefactorSelectionCommand: Command = {
  id: 'ava.refactorSelection',
  label: 'Ava: Refactor Selection',
  category: 'Ava',
};

@injectable()
export class AvaCodeActionContribution implements FrontendApplicationContribution, CommandContribution {

  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(EditorManager) protected readonly editorManager: EditorManager;

  @postConstruct()
  protected init(): void {
    // Register code action provider for all languages
    monaco.languages.registerCodeActionProvider('*', {
      provideCodeActions: (
        model: monaco.editor.ITextModel,
        range: monaco.Range,
        context: monaco.languages.CodeActionContext,
      ): monaco.languages.CodeActionList => {
        const actions: monaco.languages.CodeAction[] = [];

        // If there are diagnostics in the context, offer "Fix with Ava"
        if (context.markers && context.markers.length > 0) {
          const messages = context.markers.map(m => m.message).join('; ');
          actions.push({
            title: 'Fix with Ava',
            kind: 'quickfix',
            command: {
              id: AvaFixDiagnosticCommand.id,
              title: 'Fix with Ava',
              arguments: [model.uri.toString(), messages],
            },
          });
        }

        // If user has a selection, offer explain/refactor
        if (!range.isEmpty()) {
          actions.push({
            title: 'Explain with Ava',
            kind: 'refactor',
            command: {
              id: AvaExplainSelectionCommand.id,
              title: 'Explain with Ava',
              arguments: [model.uri.toString(), model.getValueInRange(range)],
            },
          });
          actions.push({
            title: 'Refactor with Ava',
            kind: 'refactor',
            command: {
              id: AvaRefactorSelectionCommand.id,
              title: 'Refactor with Ava',
              arguments: [model.uri.toString(), model.getValueInRange(range)],
            },
          });
        }

        return { actions, dispose: () => {} };
      },
    });
  }

  async onStart(): Promise<void> {
    // Code action provider registered in @postConstruct
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(AvaFixDiagnosticCommand, {
      execute: (_uri: string, diagnosticMessages: string) => {
        this.service.sendMessage(
          `Fix these diagnostic issues:\n\n${diagnosticMessages}`,
          'code',
        );
      },
    });

    commands.registerCommand(AvaExplainSelectionCommand, {
      execute: (_uri: string, selectedCode: string) => {
        this.service.sendMessage(
          `Explain this code:\n\n\`\`\`\n${selectedCode}\n\`\`\``,
          'chat',
        );
      },
    });

    commands.registerCommand(AvaRefactorSelectionCommand, {
      execute: (_uri: string, selectedCode: string) => {
        this.service.sendMessage(
          `Refactor this code for better readability and maintainability:\n\n\`\`\`\n${selectedCode}\n\`\`\``,
          'code',
        );
      },
    });
  }
}
