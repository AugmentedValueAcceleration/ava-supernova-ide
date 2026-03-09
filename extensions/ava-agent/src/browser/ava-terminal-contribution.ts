import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { AvaAgentClient } from './ava-agent-client';
import { AvaToolCallInfo, AvaToolCallMetadata } from '../common/ava-agent-protocol';

@injectable()
export class AvaTerminalContribution implements FrontendApplicationContribution {

  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;
  @inject(TerminalService) protected readonly terminalService: TerminalService;
  @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
  @inject(FrontendApplicationStateService) protected readonly stateService: FrontendApplicationStateService;

  private avaTerminal: TerminalWidget | undefined;

  /** Track tool call IDs that received partial streaming — skip duplicate output on tool_call_end. */
  private streamedToolCalls = new Set<string>();

  @postConstruct()
  protected init(): void {
    this.client.onToolCallStart(info => this.handleToolCallStart(info));
    this.client.onToolCallPartial(info => this.handleToolCallPartial(info));
    this.client.onToolCallEnd(info => this.handleToolCallEnd(info));
  }

  async onStart(app: FrontendApplication): Promise<void> {
    // Wait for app to be fully ready, then wait for branding to clean up stale
    // terminals (it runs on the same 'ready' event). Use 2s delay to ensure
    // branding cleanup has completed before we create fresh terminals.
    this.stateService.reachedState('ready').then(async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.openDefaultTerminals(app);
    });
  }

  private async openDefaultTerminals(app: FrontendApplication): Promise<void> {
    try {
      console.log('[Ava] Opening default terminals...');

      // 1. Open a regular interactive terminal (like VS Code's default)
      const userTerminal = await this.terminalService.newTerminal({
        title: 'Terminal',
      });
      console.log('[Ava] User terminal created, starting...');
      await userTerminal.start();
      console.log('[Ava] User terminal started');

      // 2. Open the Ava CLI pseudo-terminal for tool output
      await this.getOrCreateTerminal();
      console.log('[Ava] Ava terminal created');

      // Activate the user terminal (this also reveals the bottom panel)
      userTerminal.activate();
      console.log('[Ava] Terminals ready');
    } catch (err) {
      console.error('[Ava] Failed to open default terminals:', err);
    }
  }

  private async getOrCreateTerminal(): Promise<TerminalWidget> {
    const useExisting = this.preferenceService.get<boolean>('ava.terminal.useExisting', false);
    if (useExisting) {
      const userTerminal = this.terminalService.all.find(
        t => (t as TerminalWidget & { kind?: string }).kind !== 'ava',
      );
      if (userTerminal) return userTerminal;
    }

    if (this.avaTerminal) return this.avaTerminal;

    this.avaTerminal = await this.terminalService.newTerminal({
      title: 'Ava Terminal',
      isPseudoTerminal: true,
      kind: 'ava',
      isTransient: true,
      destroyTermOnClose: true,
    });

    await this.avaTerminal.start();

    // Write header
    this.avaTerminal.write('\x1b[38;2;99;102;241m── Ava Terminal ──\x1b[0m\r\n');
    this.avaTerminal.write('\x1b[2mCommands executed by Ava appear here.\x1b[0m\r\n\r\n');

    this.avaTerminal.onTerminalDidClose(() => {
      this.avaTerminal = undefined;
    });

    return this.avaTerminal;
  }

  private async handleToolCallStart(info: AvaToolCallInfo): Promise<void> {
    if (info.name !== 'bash') return;

    let command = '';
    try {
      command = JSON.parse(info.arguments).command as string;
    } catch { return; }

    const terminal = await this.getOrCreateTerminal();
    // Don't auto-reveal — tool output shows in the agent panel's tool card.
    // The terminal is available if the user manually opens it.

    // Write command with indigo color
    terminal.write(`\x1b[38;2;99;102;241m$\x1b[0m ${command}\r\n`);
  }

  private handleToolCallPartial(info: { toolCallId: string; data: string }): void {
    if (!this.avaTerminal) return;

    // Mark this tool call as streamed so we skip duplicate output on tool_call_end
    this.streamedToolCalls.add(info.toolCallId);

    // Write partial output — convert \n to \r\n for terminal display
    const text = info.data.replace(/\n/g, '\r\n');
    this.avaTerminal.write(text);
  }

  private handleToolCallEnd(info: {
    id: string; name: string; result: string;
    success: boolean; metadata?: AvaToolCallMetadata;
  }): void {
    if (info.name !== 'bash') return;
    if (!this.avaTerminal) return;

    // If this call was streamed in real-time, skip writing the full output again
    const wasStreamed = this.streamedToolCalls.delete(info.id);
    if (!wasStreamed) {
      // Fallback: write full output for calls that didn't stream (e.g. background)
      const lines = info.result.split('\n');
      for (const line of lines) {
        this.avaTerminal.write(line + '\r\n');
      }
    }

    // Write exit status footer
    const exitCode = info.metadata?.exitCode ?? (info.success ? 0 : 1);
    const color = info.success ? '34;197;94' : '239;68;68';
    this.avaTerminal.write(`\x1b[38;2;${color}m── exit ${exitCode} ──\x1b[0m\r\n\r\n`);
  }
}
