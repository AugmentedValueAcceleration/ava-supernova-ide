import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { EditorWidget } from '@theia/editor/lib/browser/editor-widget';
import { EditorDecoration } from '@theia/editor/lib/browser/decorations/editor-decoration';
import { AvaAgentClient } from './ava-agent-client';
import { AvaAgentService, IAvaAgentService, AvaToolCallInfo, AvaToolCallMetadata } from '../common/ava-agent-protocol';
import { AvaFileDecorationsProvider } from './ava-file-decorations-provider';

// ── Commands ────────────────────────────────────────────────────────────────

export const AvaAcceptChangesCommand: Command = {
  id: 'ava.acceptChanges',
  label: 'Ava: Accept Changes in This File',
  category: 'Ava',
};

export const AvaRejectChangesCommand: Command = {
  id: 'ava.rejectChanges',
  label: 'Ava: Reject Changes in This File',
  category: 'Ava',
};

export const AvaAcceptAllCommand: Command = {
  id: 'ava.acceptAllChanges',
  label: 'Ava: Accept All Changes',
  category: 'Ava',
};

export const AvaRejectAllCommand: Command = {
  id: 'ava.rejectAllChanges',
  label: 'Ava: Reject All Changes',
  category: 'Ava',
};

export const AvaUndoLastChangesCommand: Command = {
  id: 'ava.undoLastChanges',
  label: 'Ava: Undo Last Changes',
  category: 'Ava',
};

// ── Types ───────────────────────────────────────────────────────────────────

interface AvaFileChange {
  originalContent: string | null;
  decorationIds: string[];
  uri: URI;
  toolCallId: string;
}

// ── Contribution ────────────────────────────────────────────────────────────

@injectable()
export class AvaEditorChangeTracker implements FrontendApplicationContribution, CommandContribution {

  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;
  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(EditorManager) protected readonly editorManager: EditorManager;
  @inject(AvaFileDecorationsProvider) protected readonly fileDecorations: AvaFileDecorationsProvider;

  private pendingChanges = new Map<string, AvaFileChange>();
  private snapshots = new Map<string, Promise<string | null>>();
  private toolCallOrder: string[] = [];
  private cssInjected = false;

  @postConstruct()
  protected init(): void {
    this.client.onToolCallStart(info => this.handleToolCallStart(info));
    this.client.onToolCallEnd(info => this.handleToolCallEnd(info));
  }

  async onStart(): Promise<void> {
    this.injectCSS();
  }

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(AvaAcceptChangesCommand, {
      execute: () => this.acceptCurrentFile(),
      isEnabled: () => this.hasChangesForCurrentFile(),
    });

    commands.registerCommand(AvaRejectChangesCommand, {
      execute: () => this.rejectCurrentFile(),
      isEnabled: () => this.hasChangesForCurrentFile(),
    });

    commands.registerCommand(AvaAcceptAllCommand, {
      execute: () => this.acceptAll(),
      isEnabled: () => this.pendingChanges.size > 0,
    });

    commands.registerCommand(AvaRejectAllCommand, {
      execute: () => this.rejectAll(),
      isEnabled: () => this.pendingChanges.size > 0,
    });

    commands.registerCommand(AvaUndoLastChangesCommand, {
      execute: () => this.undoLastChanges(),
      isEnabled: () => this.toolCallOrder.length > 0,
    });
  }

  // ── Tool call handlers ──────────────────────────────────────────────────

  private handleToolCallStart(info: AvaToolCallInfo): void {
    if (info.name !== 'file_write' && info.name !== 'file_edit') return;

    try {
      const args = JSON.parse(info.arguments);
      const filePath = args.file_path as string;
      if (filePath) {
        this.snapshots.set(info.id, this.service.readFile(filePath));
      }
    } catch { /* ignore parse errors */ }
  }

  private async handleToolCallEnd(info: {
    id: string; name: string; result: string;
    success: boolean; metadata?: AvaToolCallMetadata;
  }): Promise<void> {
    if (!info.success) return;
    if (info.name !== 'file_write' && info.name !== 'file_edit') return;

    const filePath = info.metadata?.path;
    if (!filePath) return;

    const originalContent = await this.snapshots.get(info.id) ?? null;
    this.snapshots.delete(info.id);

    // Open the file in editor
    const uri = URI.fromFilePath(filePath);
    let editorWidget: EditorWidget;
    try {
      editorWidget = await this.editorManager.open(uri, { mode: 'reveal' });
    } catch {
      return; // File may not exist or editor failed to open
    }

    // Wait a tick for the editor content to update from disk
    await new Promise(resolve => setTimeout(resolve, 200));

    const editor = editorWidget.editor;
    const newContent = editor.document.getText();

    // Compute decorations
    const decorations = this.computeDecorations(originalContent, newContent);
    if (decorations.length === 0) return;

    const decorationIds = editor.deltaDecorations({
      oldDecorations: [],
      newDecorations: decorations,
    });

    this.pendingChanges.set(filePath, {
      originalContent,
      decorationIds,
      uri,
      toolCallId: info.id,
    });

    if (!this.toolCallOrder.includes(info.id)) {
      this.toolCallOrder.push(info.id);
    }
  }

  // ── Diff decoration computation ─────────────────────────────────────────

  private computeDecorations(
    oldContent: string | null,
    newContent: string,
  ): EditorDecoration[] {
    if (!oldContent) {
      // New file — highlight all lines
      const lineCount = newContent.split('\n').length;
      return Array.from({ length: lineCount }, (_, i) => ({
        range: { start: { line: i, character: 0 }, end: { line: i, character: 0 } },
        options: {
          isWholeLine: true,
          className: 'ava-diff-added-line',
          linesDecorationsClassName: 'ava-diff-added-gutter',
        },
      }));
    }

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const decorations: EditorDecoration[] = [];

    // Simple line-by-line comparison
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= oldLines.length) {
        // Added line
        decorations.push({
          range: { start: { line: i, character: 0 }, end: { line: i, character: 0 } },
          options: {
            isWholeLine: true,
            className: 'ava-diff-added-line',
            linesDecorationsClassName: 'ava-diff-added-gutter',
          },
        });
      } else if (i >= newLines.length) {
        // Line was removed — no decoration (line doesn't exist in new content)
        break;
      } else if (oldLines[i] !== newLines[i]) {
        // Modified line
        decorations.push({
          range: { start: { line: i, character: 0 }, end: { line: i, character: 0 } },
          options: {
            isWholeLine: true,
            className: 'ava-diff-modified-line',
            linesDecorationsClassName: 'ava-diff-modified-gutter',
          },
        });
      }
    }

    return decorations;
  }

  // ── Accept / Reject ─────────────────────────────────────────────────────

  private hasChangesForCurrentFile(): boolean {
    const editor = this.editorManager.currentEditor;
    if (!editor) return false;
    const filePath = editor.editor.uri.path.toString();
    return this.pendingChanges.has(filePath);
  }

  private async acceptCurrentFile(): Promise<void> {
    const editor = this.editorManager.currentEditor;
    if (!editor) return;
    const filePath = editor.editor.uri.path.toString();
    this.acceptFile(filePath, editor);
  }

  private async rejectCurrentFile(): Promise<void> {
    const editor = this.editorManager.currentEditor;
    if (!editor) return;
    const filePath = editor.editor.uri.path.toString();
    await this.rejectFile(filePath, editor);
  }

  private acceptFile(filePath: string, editorWidget: EditorWidget): void {
    const change = this.pendingChanges.get(filePath);
    if (!change) return;

    // Remove decorations
    editorWidget.editor.deltaDecorations({
      oldDecorations: change.decorationIds,
      newDecorations: [],
    });

    this.pendingChanges.delete(filePath);
    this.fileDecorations.clearFile(filePath);
    this.cleanupToolCallOrder(change.toolCallId);
  }

  private async rejectFile(filePath: string, editorWidget: EditorWidget): Promise<void> {
    const change = this.pendingChanges.get(filePath);
    if (!change || change.originalContent === null) return;

    const editor = editorWidget.editor;
    const fullRange = editor.document.toValidRange({
      start: { line: 0, character: 0 },
      end: { line: Number.MAX_SAFE_INTEGER, character: Number.MAX_SAFE_INTEGER },
    });

    // Replace entire content with original
    editor.executeEdits([{
      range: fullRange,
      newText: change.originalContent,
    }]);

    // Remove decorations
    editor.deltaDecorations({
      oldDecorations: change.decorationIds,
      newDecorations: [],
    });

    const toolCallId = change.toolCallId;
    this.pendingChanges.delete(filePath);
    this.fileDecorations.clearFile(filePath);
    this.cleanupToolCallOrder(toolCallId);
  }

  private async undoLastChanges(): Promise<void> {
    if (this.toolCallOrder.length === 0) return;

    const lastToolCallId = this.toolCallOrder[this.toolCallOrder.length - 1];

    // Find all files modified by this tool call
    const filesToRevert: string[] = [];
    for (const [filePath, change] of this.pendingChanges) {
      if (change.toolCallId === lastToolCallId) {
        filesToRevert.push(filePath);
      }
    }

    for (const filePath of filesToRevert) {
      const editorWidget = this.findEditorForPath(filePath);
      if (editorWidget) {
        await this.rejectFile(filePath, editorWidget);
      } else {
        this.pendingChanges.delete(filePath);
        this.fileDecorations.clearFile(filePath);
      }
    }

    // Ensure the tool call is removed from the order
    const idx = this.toolCallOrder.indexOf(lastToolCallId);
    if (idx !== -1) this.toolCallOrder.splice(idx, 1);
  }

  private cleanupToolCallOrder(toolCallId: string): void {
    const hasRemaining = Array.from(this.pendingChanges.values())
      .some(c => c.toolCallId === toolCallId);
    if (!hasRemaining) {
      const idx = this.toolCallOrder.indexOf(toolCallId);
      if (idx !== -1) this.toolCallOrder.splice(idx, 1);
    }
  }

  private acceptAll(): void {
    for (const [filePath] of this.pendingChanges) {
      const editorWidget = this.findEditorForPath(filePath);
      if (editorWidget) {
        this.acceptFile(filePath, editorWidget);
      } else {
        this.pendingChanges.delete(filePath);
      }
    }
  }

  private async rejectAll(): Promise<void> {
    for (const [filePath] of this.pendingChanges) {
      const editorWidget = this.findEditorForPath(filePath);
      if (editorWidget) {
        await this.rejectFile(filePath, editorWidget);
      } else {
        this.pendingChanges.delete(filePath);
      }
    }
  }

  private findEditorForPath(filePath: string): EditorWidget | undefined {
    for (const widget of this.editorManager.all) {
      if (widget.editor.uri.path.toString() === filePath) {
        return widget;
      }
    }
    return undefined;
  }

  // ── CSS injection ───────────────────────────────────────────────────────

  private injectCSS(): void {
    if (this.cssInjected) return;
    this.cssInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      .ava-diff-added-line {
        background: rgba(34, 197, 94, 0.08);
      }
      .ava-diff-added-gutter {
        border-left: 3px solid #22C55E;
        margin-left: 5px;
      }
      .ava-diff-modified-line {
        background: rgba(99, 102, 241, 0.06);
      }
      .ava-diff-modified-gutter {
        border-left: 3px solid var(--ava-accent, #6366F1);
        margin-left: 5px;
      }
    `;
    document.head.appendChild(style);
  }
}
