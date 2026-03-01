import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common';
import { MessageService } from '@theia/core/lib/common/message-service';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { AvaAgentService, IAvaAgentService } from '../common/ava-agent-protocol';
import { AvaAgentContribution } from './ava-agent-contribution';
import { AvaAgentClient } from './ava-agent-client';

// ── Commands ────────────────────────────────────────────────────────────────

export const AvaWriteCommitMessageCommand: Command = {
  id: 'ava.writeCommitMessage',
  label: 'Ava: Write Commit Message',
  category: 'Ava',
};

export const AvaExplainDiffCommand: Command = {
  id: 'ava.explainDiff',
  label: 'Ava: Explain Changes',
  category: 'Ava',
};

export const AvaReviewChangesCommand: Command = {
  id: 'ava.reviewChanges',
  label: 'Ava: Review My Changes',
  category: 'Ava',
};

export const AvaWritePRDescriptionCommand: Command = {
  id: 'ava.writePRDescription',
  label: 'Ava: Write PR Description',
  category: 'Ava',
};

export const AvaResolveConflictCommand: Command = {
  id: 'ava.resolveConflict',
  label: 'Ava: Resolve Conflict',
  category: 'Ava',
};

// ── Contribution ────────────────────────────────────────────────────────────

@injectable()
export class AvaGitCommands implements CommandContribution, MenuContribution {

  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(AvaAgentContribution) protected readonly agentContribution: AvaAgentContribution;
  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;
  @inject(EditorManager) protected readonly editorManager: EditorManager;
  @inject(MessageService) protected readonly messageService: MessageService;

  registerCommands(commands: CommandRegistry): void {

    commands.registerCommand(AvaWriteCommitMessageCommand, {
      execute: async () => {
        const diff = await this.service.getGitStagedDiff();
        if (!diff) {
          this.messageService.warn('No staged changes found. Stage your changes with git add first.');
          return;
        }
        await this.sendToAva(
          `Analyze these staged changes and write a conventional commit message using the format: type(scope): description\n\n\`\`\`diff\n${diff}\n\`\`\``,
          'code',
        );
      },
    });

    commands.registerCommand(AvaExplainDiffCommand, {
      execute: async () => {
        const diff = await this.service.getGitWorkingDiff();
        if (!diff) {
          this.messageService.info('No uncommitted changes found.');
          return;
        }
        await this.sendToAva(
          `Explain these changes in detail:\n\n\`\`\`diff\n${diff}\n\`\`\``,
          'chat',
        );
      },
    });

    commands.registerCommand(AvaReviewChangesCommand, {
      execute: async () => {
        const diff = await this.service.getGitWorkingDiff();
        if (!diff) {
          this.messageService.info('No uncommitted changes found.');
          return;
        }
        await this.sendToAva(
          `Review these changes for security issues, bugs, and best practice violations:\n\n\`\`\`diff\n${diff}\n\`\`\``,
          'security',
        );
      },
    });

    commands.registerCommand(AvaWritePRDescriptionCommand, {
      execute: async () => {
        const [branch, log, diff] = await Promise.all([
          this.service.getGitBranch(),
          this.service.getGitLog(20),
          this.service.getGitWorkingDiff(),
        ]);
        if (!branch) {
          this.messageService.warn('Not in a git repository.');
          return;
        }
        const parts = [`Branch: ${branch}`];
        if (log) parts.push(`Recent commits:\n${log}`);
        if (diff) parts.push(`\`\`\`diff\n${diff}\n\`\`\``);
        await this.sendToAva(
          `Write a PR description with Summary, Changes, and Testing sections for these changes:\n\n${parts.join('\n\n')}`,
          'chat',
        );
      },
    });

    commands.registerCommand(AvaResolveConflictCommand, {
      execute: async () => {
        const editor = this.editorManager.currentEditor?.editor;
        if (!editor) return;
        const content = editor.document.getText();
        const language = editor.document.languageId;
        const filePath = editor.uri.path.toString();
        await this.sendToAva(
          `Resolve the merge conflicts in this file:\n\nFile: ${filePath}\n\`\`\`${language}\n${content}\n\`\`\``,
          'code',
        );
      },
      isEnabled: () => {
        const editor = this.editorManager.currentEditor?.editor;
        if (!editor) return false;
        return editor.document.getText().includes('<<<<<<<');
      },
    });
  }

  registerMenus(_menus: MenuModelRegistry): void {
    // Git commands are available via Command Palette — no context menu needed
  }

  private async sendToAva(message: string, mode: 'code' | 'chat' | 'security'): Promise<void> {
    await this.agentContribution.openView({ activate: true });
    this.service.sendMessage(message, mode);
  }
}
