import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Emitter, CancellationToken, Disposable } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { DecorationsService, DecorationsProvider, Decoration } from '@theia/core/lib/browser/decorations-service';
import { AvaAgentClient } from './ava-agent-client';

@injectable()
export class AvaFileDecorationsProvider implements FrontendApplicationContribution {

  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;
  @inject(DecorationsService) protected readonly decorationsService: DecorationsService;

  private modifiedFiles = new Set<string>();
  private readonly onDidChangeEmitter = new Emitter<URI[]>();
  private registration: Disposable | undefined;

  @postConstruct()
  protected init(): void {
    this.client.onToolCallEnd(info => {
      if (info.name !== 'file_write' && info.name !== 'file_edit') return;
      if (!info.success) return;
      const filePath = info.metadata?.path;
      if (!filePath) return;

      const uri = URI.fromFilePath(filePath);
      this.modifiedFiles.add(uri.toString());
      this.onDidChangeEmitter.fire([uri]);
    });
  }

  async onStart(): Promise<void> {
    const provider: DecorationsProvider = {
      onDidChange: this.onDidChangeEmitter.event,
      provideDecorations: (uri: URI, _token: CancellationToken): Decoration | undefined => {
        if (this.modifiedFiles.has(uri.toString())) {
          return {
            letter: 'A',
            tooltip: 'Modified by Ava',
            bubble: true,
          };
        }
        return undefined;
      },
    };
    this.registration = this.decorationsService.registerDecorationsProvider(provider);
  }

  /** Called by AvaEditorChangeTracker when changes are accepted or rejected. */
  clearFile(filePath: string): void {
    const uri = URI.fromFilePath(filePath);
    const uriStr = uri.toString();
    if (this.modifiedFiles.has(uriStr)) {
      this.modifiedFiles.delete(uriStr);
      this.onDidChangeEmitter.fire([uri]);
    }
  }

  clearAll(): void {
    const uris = Array.from(this.modifiedFiles).map(s => new URI(s));
    this.modifiedFiles.clear();
    if (uris.length > 0) {
      this.onDidChangeEmitter.fire(uris);
    }
  }
}
