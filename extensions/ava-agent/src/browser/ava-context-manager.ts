import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { AvaAgentService, IAvaAgentService, AvaFileContext } from '../common/ava-agent-protocol';

export interface ContextSummary {
  activeFile: string | null;
  activeLanguage: string | null;
  openTabCount: number;
  pinnedCount: number;
  pinnedPaths: string[];
}

/**
 * Tracks what Ava can see — active file, open tabs, and pinned files.
 * Browser-side only (needs EditorManager).
 */
@injectable()
export class AvaContextManager {

  @inject(EditorManager) protected readonly editorManager: EditorManager;
  @inject(AvaAgentService) protected readonly service: IAvaAgentService;

  private pinnedFiles = new Map<string, { path: string; language: string }>();

  @postConstruct()
  protected init(): void {
    // Fire context change when active editor changes (tab switch, file open/close)
    this.editorManager.onCurrentEditorChanged(() => this.fireChange());
  }

  private readonly onContextChangedEmitter = new Emitter<ContextSummary>();
  readonly onContextChanged = this.onContextChangedEmitter.event;

  /** Build a context snapshot for sending with a message. */
  async buildContext(): Promise<AvaFileContext> {
    const context: AvaFileContext = {};

    // Active editor
    const current = this.editorManager.currentEditor;
    if (current) {
      const editor = current.editor;
      const doc = editor.document;
      const selection = editor.selection;

      const hasSelection = selection.start.line !== selection.end.line
        || selection.start.character !== selection.end.character;

      context.activeFile = {
        path: editor.uri.path.toString(),
        language: doc.languageId,
        content: doc.getText(),
        ...(hasSelection ? { selection: doc.getText(selection) } : {}),
      };
    }

    // Open tabs (excluding active)
    const activePath = current?.editor.uri.path.toString();
    const tabs: AvaFileContext['openTabs'] = [];
    for (const widget of this.editorManager.all) {
      const path = widget.editor.uri.path.toString();
      if (path !== activePath) {
        tabs.push({ path, language: widget.editor.document.languageId });
      }
    }
    if (tabs.length > 0) {
      context.openTabs = tabs;
    }

    // Pinned files — read content via backend RPC
    if (this.pinnedFiles.size > 0) {
      const pinned: NonNullable<AvaFileContext['pinnedFiles']> = [];
      for (const [, info] of this.pinnedFiles) {
        const content = await this.service.readFile(info.path);
        if (content !== null) {
          pinned.push({ path: info.path, language: info.language, content });
        }
      }
      if (pinned.length > 0) {
        context.pinnedFiles = pinned;
      }
    }

    return context;
  }

  /** Pin a file to Ava's context. */
  pinFile(filePath: string, language: string): void {
    this.pinnedFiles.set(filePath, { path: filePath, language });
    this.fireChange();
  }

  /** Unpin a file from Ava's context. */
  unpinFile(filePath: string): void {
    this.pinnedFiles.delete(filePath);
    this.fireChange();
  }

  /** Check if a file is pinned. */
  isPinned(filePath: string): boolean {
    return this.pinnedFiles.has(filePath);
  }

  /** Get a summary for the context indicator UI. */
  getContextSummary(): ContextSummary {
    const current = this.editorManager.currentEditor;
    const activePath = current?.editor.uri.path.toString() ?? null;
    const activeLanguage = current?.editor.document.languageId ?? null;

    let openTabCount = 0;
    for (const widget of this.editorManager.all) {
      if (widget.editor.uri.path.toString() !== activePath) {
        openTabCount++;
      }
    }

    return {
      activeFile: activePath ? activePath.split('/').pop() ?? activePath : null,
      activeLanguage,
      openTabCount,
      pinnedCount: this.pinnedFiles.size,
      pinnedPaths: Array.from(this.pinnedFiles.keys()),
    };
  }

  private fireChange(): void {
    this.onContextChangedEmitter.fire(this.getContextSummary());
  }
}
