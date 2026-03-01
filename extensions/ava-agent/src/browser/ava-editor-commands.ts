import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MenuPath } from '@theia/core/lib/common';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser/editor-menu';
import { AvaAgentService, IAvaAgentService } from '../common/ava-agent-protocol';
import { AvaAgentContribution } from './ava-agent-contribution';
import { AvaAgentClient } from './ava-agent-client';
import { AvaContextManager } from './ava-context-manager';

// ── Submenu path ────────────────────────────────────────────────────────────

const AVA_CONTEXT_SUBMENU: MenuPath = [...EDITOR_CONTEXT_MENU, 'ava_ask'];

// ── Commands ────────────────────────────────────────────────────────────────

export const AvaAskCommand: Command = {
  id: 'ava.askAva',
  label: 'Ava: Ask About Selection',
  category: 'Ava',
};

export const AvaExplainCommand: Command = {
  id: 'ava.explainCode',
  label: 'Explain This Code',
  category: 'Ava',
};

export const AvaFindBugsCommand: Command = {
  id: 'ava.findBugs',
  label: 'Find Bugs',
  category: 'Ava',
};

export const AvaRefactorCommand: Command = {
  id: 'ava.refactor',
  label: 'Refactor This',
  category: 'Ava',
};

export const AvaWriteTestsCommand: Command = {
  id: 'ava.writeTests',
  label: 'Write Tests',
  category: 'Ava',
};

export const AvaAddCommentsCommand: Command = {
  id: 'ava.addComments',
  label: 'Add Comments',
  category: 'Ava',
};

export const AvaPinFileCommand: Command = {
  id: 'ava.pinFile',
  label: 'Pin File to Ava Context',
  category: 'Ava',
};

export const AvaUnpinFileCommand: Command = {
  id: 'ava.unpinFile',
  label: 'Unpin File from Ava Context',
  category: 'Ava',
};

export const AvaExportChatCommand: Command = {
  id: 'ava.exportChat',
  label: 'Ava: Export Chat to Markdown',
  category: 'Ava',
};

export const AvaGenerateSnippetCommand: Command = {
  id: 'ava.generateSnippet',
  label: 'Ava: Generate Snippet from Selection',
  category: 'Ava',
};

// ── Contribution ────────────────────────────────────────────────────────────

@injectable()
export class AvaEditorCommands implements CommandContribution, MenuContribution, KeybindingContribution {

  @inject(EditorManager) protected readonly editorManager: EditorManager;
  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(AvaAgentContribution) protected readonly agentContribution: AvaAgentContribution;
  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;
  @inject(AvaContextManager) protected readonly contextManager: AvaContextManager;

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(AvaAskCommand, {
      execute: () => this.sendToAva('Explain and analyze this code:'),
      isEnabled: () => !!this.editorManager.currentEditor,
    });

    commands.registerCommand(AvaExplainCommand, {
      execute: () => this.sendToAva('Explain this code in detail:'),
      isEnabled: () => !!this.editorManager.currentEditor,
    });

    commands.registerCommand(AvaFindBugsCommand, {
      execute: () => this.sendToAva('Find bugs in this code:'),
      isEnabled: () => !!this.editorManager.currentEditor,
    });

    commands.registerCommand(AvaRefactorCommand, {
      execute: () => this.sendToAva('Refactor this code for better readability and maintainability:'),
      isEnabled: () => !!this.editorManager.currentEditor,
    });

    commands.registerCommand(AvaWriteTestsCommand, {
      execute: () => this.sendToAva('Write tests for this code:'),
      isEnabled: () => !!this.editorManager.currentEditor,
    });

    commands.registerCommand(AvaAddCommentsCommand, {
      execute: () => this.sendToAva('Add clear, helpful comments to this code:'),
      isEnabled: () => !!this.editorManager.currentEditor,
    });

    commands.registerCommand(AvaPinFileCommand, {
      execute: () => {
        const editor = this.editorManager.currentEditor?.editor;
        if (editor) {
          this.contextManager.pinFile(editor.uri.path.toString(), editor.document.languageId);
        }
      },
      isEnabled: () => {
        const editor = this.editorManager.currentEditor?.editor;
        return !!editor && !this.contextManager.isPinned(editor.uri.path.toString());
      },
      isVisible: () => {
        const editor = this.editorManager.currentEditor?.editor;
        return !!editor && !this.contextManager.isPinned(editor.uri.path.toString());
      },
    });

    commands.registerCommand(AvaUnpinFileCommand, {
      execute: () => {
        const editor = this.editorManager.currentEditor?.editor;
        if (editor) {
          this.contextManager.unpinFile(editor.uri.path.toString());
        }
      },
      isEnabled: () => {
        const editor = this.editorManager.currentEditor?.editor;
        return !!editor && this.contextManager.isPinned(editor.uri.path.toString());
      },
      isVisible: () => {
        const editor = this.editorManager.currentEditor?.editor;
        return !!editor && this.contextManager.isPinned(editor.uri.path.toString());
      },
    });

    commands.registerCommand(AvaExportChatCommand, {
      execute: () => {
        const state = this.client.getState();
        if (state.messages.length === 0) return;

        const lines: string[] = ['# Ava Chat Export', ''];
        for (const msg of state.messages) {
          switch (msg.role) {
            case 'user':
              lines.push('## User', '', msg.content, '');
              break;
            case 'assistant':
              lines.push('## Ava', '');
              if (msg.content) lines.push(msg.content, '');
              for (const tc of msg.toolCalls) {
                lines.push(`**Tool: ${tc.name}**`, '');
                if (tc.result) {
                  lines.push('```', tc.result.slice(0, 2000), '```', '');
                }
              }
              if (msg.cost != null) {
                lines.push(`*Cost: $${msg.cost.toFixed(4)}*`, '');
              }
              break;
            case 'error':
              lines.push('## Error', '', `> ${msg.content}`, '');
              break;
            case 'system':
              lines.push(`*${msg.content}*`, '');
              break;
          }
        }

        // Open as a new untitled editor
        const markdown = lines.join('\n');
        this.editorManager.open(
          new (require('@theia/core/lib/common/uri').default)('untitled:ava-chat-export.md'),
          { mode: 'open' },
        ).then(widget => {
          if (widget) {
            // Set content via monaco model
            const monacoEditor = (widget.editor as any).getControl?.();
            if (monacoEditor) {
              monacoEditor.getModel()?.setValue(markdown);
            }
          }
        }).catch(() => {});
      },
    });

    commands.registerCommand(AvaGenerateSnippetCommand, {
      execute: () => {
        const editor = this.editorManager.currentEditor?.editor;
        if (!editor) return;
        const selection = editor.selection;
        const hasSelection = selection.start.line !== selection.end.line
          || selection.start.character !== selection.end.character;
        if (!hasSelection) return;

        const selectedCode = editor.document.getText(selection);
        const language = editor.document.languageId;

        this.agentContribution.openView({ activate: true }).then(() => {
          this.service.sendMessage(
            `Generate a reusable VSCode/Theia snippet from this code. Use tabstop placeholders ($1, $2, etc.) for the parts that should be customizable. Output it in JSON snippet format.\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``,
            'chat',
          );
        });
      },
      isEnabled: () => !!this.editorManager.currentEditor,
    });
  }

  registerMenus(menus: MenuModelRegistry): void {
    // Register the "Ask Ava" submenu in the editor context menu
    menus.registerSubmenu(AVA_CONTEXT_SUBMENU, 'Ask Ava');

    // Top-level quick access
    menus.registerMenuAction(EDITOR_CONTEXT_MENU, {
      commandId: AvaAskCommand.id,
      label: 'Ask Ava',
      order: '0',
    });
    menus.registerMenuAction(EDITOR_CONTEXT_MENU, {
      commandId: AvaPinFileCommand.id,
      label: 'Pin File to Ava',
      order: '0.1',
    });
    menus.registerMenuAction(EDITOR_CONTEXT_MENU, {
      commandId: AvaUnpinFileCommand.id,
      label: 'Unpin from Ava',
      order: '0.2',
    });

    // Submenu actions
    menus.registerMenuAction(AVA_CONTEXT_SUBMENU, {
      commandId: AvaExplainCommand.id,
      label: 'Explain This Code',
      order: '1',
    });
    menus.registerMenuAction(AVA_CONTEXT_SUBMENU, {
      commandId: AvaFindBugsCommand.id,
      label: 'Find Bugs',
      order: '2',
    });
    menus.registerMenuAction(AVA_CONTEXT_SUBMENU, {
      commandId: AvaRefactorCommand.id,
      label: 'Refactor This',
      order: '3',
    });
    menus.registerMenuAction(AVA_CONTEXT_SUBMENU, {
      commandId: AvaWriteTestsCommand.id,
      label: 'Write Tests',
      order: '4',
    });
    menus.registerMenuAction(AVA_CONTEXT_SUBMENU, {
      commandId: AvaAddCommentsCommand.id,
      label: 'Add Comments',
      order: '5',
    });
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    keybindings.registerKeybinding({
      command: AvaAskCommand.id,
      keybinding: 'ctrlcmd+shift+i',
    });
  }

  private async sendToAva(prefix: string): Promise<void> {
    const widget = this.editorManager.currentEditor;
    if (!widget) return;

    const editor = widget.editor;
    const doc = editor.document;
    const selection = editor.selection;
    const language = doc.languageId;
    const filePath = editor.uri.path.toString();

    // Get selected text, or entire file if nothing is selected
    const hasSelection = selection.start.line !== selection.end.line
      || selection.start.character !== selection.end.character;
    const codeText = hasSelection
      ? doc.getText(selection)
      : doc.getText();

    // Build the context message
    const contextMessage = `File: ${filePath}\nLanguage: ${language}\n\n${prefix}\n\`\`\`${language}\n${codeText}\n\`\`\``;

    // Open the Ava panel and send the message
    await this.agentContribution.openView({ activate: true });
    this.service.sendMessage(contextMessage, this.client.currentMode);
  }
}
