/**
 * "Ava: New from Template" and "Ava: Scaffold Project" commands.
 */
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, Command } from '@theia/core/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import {
  AvaAgentService,
  IAvaAgentService,
  AvaProjectTemplate,
} from '../common/ava-agent-protocol';

export const AvaNewFromTemplateCommand: Command = {
  id: 'ava.newFromTemplate',
  label: 'Ava: New from Template',
  category: 'Ava',
};

export const AvaScaffoldProjectCommand: Command = {
  id: 'ava.scaffoldProject',
  label: 'Ava: Scaffold a Project',
  category: 'Ava',
};

@injectable()
export class AvaTemplateContribution implements CommandContribution {

  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
  @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
  @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(AvaNewFromTemplateCommand, {
      execute: async () => {
        try {
          const templates = await this.service.getTemplates();
          if (templates.length === 0) return;

          // Quick-pick template selection (using Theia's command palette is complex,
          // so we use a simple prompt approach)
          const templateNames = templates.map((t, i) => `${i + 1}. ${t.name} — ${t.description}`).join('\n');
          const input = prompt(`Choose a template:\n\n${templateNames}\n\nEnter number (1-${templates.length}):`);
          if (!input) return;

          const idx = parseInt(input, 10) - 1;
          if (isNaN(idx) || idx < 0 || idx >= templates.length) return;

          const template = templates[idx];

          // Ask for project name
          const projectName = prompt('Project name:', 'my-project');
          if (!projectName) return;

          // Ask for target directory
          const folderUri = await this.fileDialogService.showOpenDialog({
            title: 'Select parent directory for the new project',
            canSelectFolders: true,
            canSelectFiles: false,
          });

          if (!folderUri) return;

          const targetDir = folderUri.path.toString();
          await this.service.createFromTemplate(template.id, targetDir, projectName);

          // Open the new project workspace
          const URI = await import('@theia/core/lib/common/uri');
          const projectUri = new URI.default(`file://${targetDir}/${projectName}`);
          this.workspaceService.open(projectUri);
        } catch (err: any) {
          console.error('[ava-agent] Template creation failed:', err);
        }
      },
    });

    commands.registerCommand(AvaScaffoldProjectCommand, {
      execute: async () => {
        const description = prompt('Describe the project you want to create:');
        if (!description) return;
        await this.service.sendMessage(
          `Create a new project with the following description. Generate all necessary files and folder structure:\n\n${description}`,
          'code',
        );
      },
    });
  }
}
