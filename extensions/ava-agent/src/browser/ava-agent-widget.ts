import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common';
import { Message } from '@lumino/messaging';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { FileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AvaAgentClient } from './ava-agent-client';
import { AvaContextManager } from './ava-context-manager';
import { AvaAgentApp } from './components/AvaAgentApp';
import {
  IAvaAgentService,
  AvaAgentService,
  AvaMode,
} from '../common/ava-agent-protocol';

@injectable()
export class AvaAgentWidget extends ReactWidget {
  static readonly ID = 'ava-agent-panel';
  static readonly LABEL = 'Ava';

  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;
  @inject(AvaContextManager) protected readonly contextManager: AvaContextManager;
  @inject(CommandRegistry) protected readonly commands: CommandRegistry;
  @inject(EditorManager) protected readonly editorManager: EditorManager;
  @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
  @inject(FileService) protected readonly fileService: FileService;
  @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

  constructor() {
    super();
    this.id = AvaAgentWidget.ID;
    this.title.label = AvaAgentWidget.LABEL;
    this.title.caption = 'Ava | Supernova Agent';
    this.title.closable = true;
    this.title.iconClass = 'no-icon';
    this.addClass('ava-agent-widget');
    this.node.style.overflow = 'hidden';
  }

  @postConstruct()
  protected init(): void {
    // Re-render whenever client state or editor context changes
    this.toDispose.push(this.client.onStateChanged(() => this.update()));
    this.toDispose.push(this.contextManager.onContextChanged(() => this.update()));

    // Resolve workspace root from Theia, then initialize the backend
    this.resolveWorkspaceRoot().then(workspaceRoot => {
      return this.service.initialize(workspaceRoot);
    }).then(initState => {
      this.client.notifyInit(initState);
    }).catch(err => {
      console.error('[ava-agent] Failed to initialize:', err);
      this.client.notifyError(
        'Failed to connect to Ava backend. Check the developer console for details.',
        'init_error',
      );
    });

    this.update();
  }

  /** Get the user's workspace root path, waiting for workspace service if needed. */
  private async resolveWorkspaceRoot(): Promise<string | undefined> {
    // Try sync first (fast path)
    let roots = this.workspaceService.tryGetRoots();
    if (roots.length === 0) {
      // Workspace may not be loaded yet — wait for the async roots
      roots = await this.workspaceService.roots;
    }
    if (roots.length === 0) return undefined;
    // Theia URI path: '/c:/Users/...' on Windows → convert to native path
    const uriPath = roots[0].resource.path.toString();
    // Strip leading '/' on Windows drive paths (e.g. '/c:/' → 'c:/')
    if (/^\/[a-zA-Z]:/.test(uriPath)) {
      return uriPath.slice(1);
    }
    return uriPath;
  }

  protected render(): React.ReactNode {
    return React.createElement(AvaAgentApp, {
      state: this.client.getState(),
      contextSummary: this.contextManager.getContextSummary(),
      onSend: async (text: string, mode: AvaMode) => {
        const context = await this.contextManager.buildContext();
        this.service.sendMessageWithContext(text, mode, context);
      },
      onCancel: () => {
        this.service.cancelRun();
      },
      onNewChat: () => {
        this.service.newChat();
      },
      onSwitchModel: (modelId: string) => {
        this.service.switchModel(modelId);
      },
      onConfirmTool: (confirmationId, approved, options) => {
        this.service.confirmTool(
          confirmationId,
          approved,
          options?.alwaysAllow,
          options?.allowAll,
          undefined,
          options?.userResponse,
        );
      },
      onOpenDashboard: () => {
        this.commands.executeCommand('ava.dashboard.toggle');
      },

      // ── Phase 5 — Session management callbacks ──────────────────────────

      onShowHistory: async () => {
        this.client.setView('history');
        this.client.setHistoryState({ isLoading: true });
        try {
          const entries = await this.service.getHistory();
          this.client.setHistoryState({ entries, isLoading: false });
        } catch {
          this.client.setHistoryState({ isLoading: false });
        }
      },

      onSearchHistory: async (query: string) => {
        this.client.setHistoryState({ searchQuery: query, isLoading: true });
        try {
          const entries = query.trim()
            ? await this.service.searchHistory(query)
            : await this.service.getHistory();
          this.client.setHistoryState({ entries, isLoading: false });
        } catch {
          this.client.setHistoryState({ isLoading: false });
        }
      },

      onResumeConversation: async (id: string) => {
        await this.service.loadConversation(id);
        // notifyConversationLoaded handler switches view back to 'chat'
      },

      onDeleteConversation: async (id: string) => {
        await this.service.deleteConversation(id);
        const entries = await this.service.getHistory();
        this.client.setHistoryState({ entries });
      },

      onRenameConversation: async (id: string, newTitle: string) => {
        await this.service.renameConversation(id, newTitle);
        const entries = await this.service.getHistory();
        this.client.setHistoryState({ entries });
      },

      onPinConversation: async (id: string, pinned: boolean) => {
        await this.service.pinConversation(id, pinned);
        const entries = await this.service.getHistory();
        this.client.setHistoryState({ entries });
      },

      onExportConversation: async (id: string, format: 'json' | 'markdown') => {
        const content = await this.service.exportConversation(id, format);
        if (!content) return;
        const ext = format === 'json' ? 'json' : 'md';
        try {
          const { default: URI } = require('@theia/core/lib/common/uri');
          const widget = await this.editorManager.open(
            new URI(`untitled:ava-session.${ext}`),
            { mode: 'open' },
          );
          if (widget) {
            const monacoEditor = (widget.editor as any).getControl?.();
            monacoEditor?.getModel()?.setValue(content);
          }
        } catch { /* best effort */ }
      },

      onImportSession: async () => {
        try {
          const result = await this.fileDialogService.showOpenDialog({
            title: 'Import Ava Session',
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'JSON files': ['json'] },
          });

          if (!result) return;

          const fileContent = await this.fileService.read(result);
          const newId = await this.service.importConversation(fileContent.value);
          if (newId) {
            const entries = await this.service.getHistory();
            this.client.setHistoryState({ entries });
          }
        } catch {
          // User cancelled or file read error
        }
      },

      onStartReplay: async (id: string) => {
        const messages = await this.service.getReplayMessages(id);
        if (messages.length === 0) return;
        const entry = this.client.getState().history.entries.find(e => e.id === id);
        this.client.setReplayState({
          conversationId: id,
          title: entry?.title ?? 'Untitled',
          messages,
          currentIndex: 0,
          totalMessages: messages.length,
        });
        this.client.setView('replay');
      },

      onReplayStep: (direction: 'forward' | 'backward') => {
        const replay = this.client.getState().replay;
        if (!replay) return;
        const newIndex = direction === 'forward'
          ? Math.min(replay.currentIndex + 1, replay.totalMessages - 1)
          : Math.max(replay.currentIndex - 1, 0);
        this.client.setReplayState({ ...replay, currentIndex: newIndex });
      },

      onReplayJump: (index: number) => {
        const replay = this.client.getState().replay;
        if (!replay) return;
        this.client.setReplayState({
          ...replay,
          currentIndex: Math.max(0, Math.min(index, replay.totalMessages - 1)),
        });
      },

      onBackToChat: () => {
        this.client.setReplayState(null);
        this.client.setView('chat');
      },
    });
  }

  protected onActivateRequest(msg: Message): void {
    super.onActivateRequest(msg);
    // Focus the textarea when the panel is activated
    const textarea = this.node.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  }
}
