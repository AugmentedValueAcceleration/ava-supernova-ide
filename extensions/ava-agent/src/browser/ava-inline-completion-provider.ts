import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { Disposable } from '@theia/core/lib/common/disposable';
import * as monaco from '@theia/monaco-editor-core';
import { AvaAgentService, IAvaAgentService } from '../common/ava-agent-protocol';
import { AvaAgentClient } from './ava-agent-client';

// ── Commands ────────────────────────────────────────────────────────────────

export const AvaToggleInlineCompletionsCommand: Command = {
  id: 'ava.toggleInlineCompletions',
  label: 'Ava: Toggle Inline Completions',
  category: 'Ava',
};

// ── Cache entry ─────────────────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  text: string;
  timestamp: number;
}

// ── Contribution ────────────────────────────────────────────────────────────

@injectable()
export class AvaInlineCompletionProvider implements FrontendApplicationContribution, CommandContribution {

  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;
  @inject(AvaAgentService) protected readonly service: IAvaAgentService;

  private registration: Disposable | undefined;
  private enabled = true;
  private cache: CacheEntry[] = [];
  private readonly MAX_CACHE = 50;
  private readonly CACHE_TTL = 10_000; // 10 seconds

  async onStart(): Promise<void> {
    this.registerProvider();
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(AvaToggleInlineCompletionsCommand, {
      execute: () => this.toggle(),
      isToggled: () => this.enabled,
    });
  }

  // ── Provider registration ───────────────────────────────────────────────

  private registerProvider(): void {
    if (this.registration) return;

    this.registration = monaco.languages.registerInlineCompletionsProvider(
      { pattern: '**' },
      {
        provideInlineCompletions: (model, position, _context, token) =>
          this.provideInlineCompletions(model, position, token),
        freeInlineCompletions: () => { /* nothing to free */ },
      },
    );
  }

  private disposeProvider(): void {
    this.registration?.dispose();
    this.registration = undefined;
  }

  private toggle(): void {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.registerProvider();
    } else {
      this.disposeProvider();
    }
  }

  // ── Completion logic ──────────────────────────────────────────────────

  private async provideInlineCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken,
  ): Promise<monaco.languages.InlineCompletions | undefined> {
    if (!this.client.isConnected) return undefined;

    const uri = model.uri.toString();
    const offset = model.getOffsetAt(position);

    // Build prefix/suffix
    const fullText = model.getValue();
    const prefix = fullText.substring(Math.max(0, offset - 2000), offset);
    const suffix = fullText.substring(offset, offset + 500);

    // Cache lookup
    const cacheKey = `${uri}:${offset}:${prefix.slice(-100)}`;
    const cached = this.lookupCache(cacheKey);
    if (cached) {
      return {
        items: [{
          insertText: cached,
          range: new monaco.Range(
            position.lineNumber, position.column,
            position.lineNumber, position.column,
          ),
        }],
      };
    }

    // Check cancellation before RPC
    if (token.isCancellationRequested) return undefined;

    const language = model.getLanguageId();
    const filePath = model.uri.fsPath || model.uri.path;

    try {
      const completion = await this.service.getInlineCompletion({
        prefix,
        suffix,
        language,
        filePath,
        maxTokens: 128,
      });

      if (token.isCancellationRequested) return undefined;
      if (!completion) return undefined;

      // Cache the result
      this.addToCache(cacheKey, completion);

      return {
        items: [{
          insertText: completion,
          range: new monaco.Range(
            position.lineNumber, position.column,
            position.lineNumber, position.column,
          ),
        }],
      };
    } catch {
      return undefined;
    }
  }

  // ── Cache helpers ─────────────────────────────────────────────────────

  private lookupCache(key: string): string | undefined {
    const now = Date.now();
    const entry = this.cache.find(e => e.key === key && (now - e.timestamp) < this.CACHE_TTL);
    return entry?.text;
  }

  private addToCache(key: string, text: string): void {
    // Remove stale entries
    const now = Date.now();
    this.cache = this.cache.filter(e => (now - e.timestamp) < this.CACHE_TTL);

    // Evict oldest if full
    if (this.cache.length >= this.MAX_CACHE) {
      this.cache.shift();
    }

    this.cache.push({ key, text, timestamp: now });
  }
}
