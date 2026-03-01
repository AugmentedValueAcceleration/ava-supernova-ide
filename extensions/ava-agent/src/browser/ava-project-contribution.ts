import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common/message-service';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { AvaAgentService, IAvaAgentService } from '../common/ava-agent-protocol';

@injectable()
export class AvaProjectContribution implements FrontendApplicationContribution {

  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(MessageService) protected readonly messageService: MessageService;
  @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

  async onStart(): Promise<void> {
    try {
      const project = await this.service.detectProject();
      if (!project) return;

      // Show extension suggestions
      if (project.suggestedExtensions.length > 0) {
        const typeName = project.projectType.charAt(0).toUpperCase() + project.projectType.slice(1);
        const names = project.suggestedExtensions.map(e => e.name).join(', ');
        this.messageService.info(
          `${typeName} project detected — recommended extensions: ${names}`,
        );
      }

      // Apply workspace preferences
      this.preferenceService.set('editor.tabSize', project.tabSize, PreferenceScope.Workspace);
      if (project.lineEndings !== 'auto') {
        this.preferenceService.set(
          'files.eol',
          project.lineEndings === 'lf' ? '\n' : '\r\n',
          PreferenceScope.Workspace,
        );
      }
    } catch (err) {
      console.error('[ava-agent] Project detection failed:', err);
    }
  }
}
