import { injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import {
  IAvaAgentClient,
  AvaInitState,
  AvaToolCallInfo,
  AvaUsageInfo,
  AvaModelInfo,
  AvaAccountInfo,
  AvaProviderKeyStatus,
  AvaProviderHealth,
  AvaDashboardSettings,
  AvaDashboardState,
  AvaMode,
  AvaToolCallMetadata,
  AvaHistoryEntry,
  AvaReplayMessage,
} from '../common/ava-agent-protocol';

// ── UI state types ──────────────────────────────────────────────────────────

export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_confirmation' | 'running' | 'success' | 'failed';
  result?: string;
  confirmationId?: string;
  summary?: string;
  isAskUser?: boolean;
}

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  images?: string[];
  thinking?: string;
  toolCalls: ToolCallDisplay[];
  isStreaming: boolean;
  errorCode?: string;
  errorSuggestion?: string;
  cost?: number;
}

export interface SessionUsage {
  totalTokens: number;
  totalCost: number;
  requestCount: number;
}

export type ChatView = 'chat' | 'history' | 'replay';

export interface HistoryState {
  entries: AvaHistoryEntry[];
  searchQuery: string;
  isLoading: boolean;
}

export interface ReplayState {
  conversationId: string;
  title: string;
  messages: AvaReplayMessage[];
  currentIndex: number;
  totalMessages: number;
}

export interface ChatState {
  messages: UIMessage[];
  models: AvaModelInfo[];
  activeModel: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  needsSetup: boolean;
  initialized: boolean;
  lastUsage: AvaUsageInfo | null;
  sessionUsage: SessionUsage;
  contextUsage: { used: number; limit: number; percent: number } | null;
  isCompressing: boolean;
  view: ChatView;
  history: HistoryState;
  replay: ReplayState | null;
}

const initialSessionUsage: SessionUsage = { totalTokens: 0, totalCost: 0, requestCount: 0 };
const initialHistoryState: HistoryState = { entries: [], searchQuery: '', isLoading: false };

const initialState: ChatState = {
  messages: [],
  models: [],
  activeModel: null,
  isStreaming: false,
  isThinking: false,
  needsSetup: true,
  initialized: false,
  lastUsage: null,
  sessionUsage: { ...initialSessionUsage },
  contextUsage: null,
  isCompressing: false,
  view: 'chat',
  history: { ...initialHistoryState },
  replay: null,
};

// ── Dashboard state ──────────────────────────────────────────────────────────

export interface DashboardState {
  providerKeys: AvaProviderKeyStatus;
  providerHealth: AvaProviderHealth[];
  settings: AvaDashboardSettings;
  platformKeyConnected: boolean;
  account: AvaAccountInfo | null;
  models: AvaModelInfo[];
  activeModel: string | null;
  error: string | null;
  initialized: boolean;
}

const initialDashboardState: DashboardState = {
  providerKeys: { deepseek: false, kimi: false, qwen: false },
  providerHealth: [],
  settings: { language: 'auto', permissionMode: 'balanced', temperature: 0.7, maxTokens: 8192, completionsProvider: 'deepseek' },
  platformKeyConnected: false,
  account: null,
  models: [],
  activeModel: null,
  error: null,
  initialized: false,
};

// ── Client implementation ───────────────────────────────────────────────────

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}`;
}

/**
 * Receives RPC notifications from the backend and manages chat state.
 * The widget subscribes to `onStateChanged` and re-renders on each update.
 */
@injectable()
export class AvaAgentClient implements IAvaAgentClient {

  private state: ChatState = { ...initialState };
  private dashboardState: DashboardState = { ...initialDashboardState };
  private _currentMode: AvaMode = 'code';

  private readonly onStateChangedEmitter = new Emitter<ChatState>();
  readonly onStateChanged = this.onStateChangedEmitter.event;

  private readonly onDashboardStateChangedEmitter = new Emitter<DashboardState>();
  readonly onDashboardStateChanged = this.onDashboardStateChangedEmitter.event;

  // Tool call lifecycle events — consumed by editor change tracker + terminal contribution
  private readonly onToolCallStartEmitter = new Emitter<AvaToolCallInfo>();
  readonly onToolCallStart = this.onToolCallStartEmitter.event;

  private readonly onToolCallPartialEmitter = new Emitter<{ toolCallId: string; data: string }>();
  readonly onToolCallPartial = this.onToolCallPartialEmitter.event;

  private readonly onToolCallEndEmitter = new Emitter<{
    id: string; name: string; result: string;
    success: boolean; metadata?: AvaToolCallMetadata;
  }>();
  readonly onToolCallEnd = this.onToolCallEndEmitter.event;

  // Stream delta buffer — flush every 30ms for smooth typing
  private deltaBuffer = '';
  private deltaTimer: ReturnType<typeof setTimeout> | undefined;

  getState(): ChatState {
    return this.state;
  }

  getDashboardState(): DashboardState {
    return this.dashboardState;
  }

  get currentMode(): AvaMode {
    return this._currentMode;
  }

  setMode(mode: AvaMode): void {
    this._currentMode = mode;
    this.onStateChangedEmitter.fire(this.state);
  }

  get isConnected(): boolean {
    const keys = this.dashboardState.providerKeys;
    return keys.deepseek || keys.kimi || keys.qwen || this.dashboardState.platformKeyConnected;
  }

  /** Called by the dashboard widget after getDashboardState() RPC returns. */
  setDashboardInit(state: AvaDashboardState): void {
    this.dashboardState = {
      ...this.dashboardState,
      ...state,
      error: null,
      initialized: true,
    };
    this.onDashboardStateChangedEmitter.fire(this.dashboardState);
  }

  private update(patch: Partial<ChatState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChangedEmitter.fire(this.state);
  }

  private updateLastAssistant(fn: (msg: UIMessage) => UIMessage): void {
    const messages = [...this.state.messages];
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant') {
      messages[messages.length - 1] = fn(last);
      this.update({ messages });
    }
  }

  // ── IAvaAgentClient notifications ───────────────────────────────────────

  notifyInit(state: AvaInitState): void {
    this.update({
      models: state.models,
      activeModel: state.activeModel,
      needsSetup: state.needsSetup,
      initialized: true,
    });
  }

  notifyUserMessageAck(text: string, images?: string[]): void {
    const msg: UIMessage = {
      id: nextId(),
      role: 'user',
      content: text,
      images,
      toolCalls: [],
      isStreaming: false,
    };
    this.update({
      messages: [...this.state.messages, msg],
      isStreaming: true,
    });
  }

  notifyStreamStart(): void {
    const msg: UIMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
    };
    this.update({
      messages: [...this.state.messages, msg],
      isStreaming: true,
      isThinking: true,
    });
  }

  notifyThinkingDelta(content: string): void {
    this.updateLastAssistant(last => ({
      ...last,
      thinking: (last.thinking || '') + content,
    }));
    if (this.state.isThinking) {
      this.update({ isThinking: false });
    }
  }

  notifyStreamDelta(content: string): void {
    // Buffer deltas for smooth rendering
    this.deltaBuffer += content;
    if (!this.deltaTimer) {
      this.deltaTimer = setTimeout(() => this.flushDeltaBuffer(), 30);
    }
  }

  private flushDeltaBuffer(): void {
    this.deltaTimer = undefined;
    if (!this.deltaBuffer) return;

    const buffered = this.deltaBuffer;
    this.deltaBuffer = '';

    this.updateLastAssistant(last => ({
      ...last,
      content: last.content + buffered,
    }));
    if (this.state.isThinking) {
      this.update({ isThinking: false });
    }
  }

  notifyStreamEnd(): void {
    this.flushDeltaBuffer();
    this.updateLastAssistant(last => ({ ...last, isStreaming: false }));
    this.update({ isThinking: false });
  }

  notifyToolCallStart(toolCall: AvaToolCallInfo): void {
    this.onToolCallStartEmitter.fire(toolCall);
    const tc: ToolCallDisplay = {
      id: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      status: 'running',
    };
    this.updateLastAssistant(last => ({
      ...last,
      toolCalls: [...last.toolCalls, tc],
    }));
  }

  notifyToolCallPartial(toolCallId: string, data: string): void {
    this.onToolCallPartialEmitter.fire({ toolCallId, data });
  }

  notifyToolCallEnd(toolCallId: string, result: string, success: boolean, metadata?: AvaToolCallMetadata): void {
    // Find tool name from current state for the event
    const lastMsg = this.state.messages[this.state.messages.length - 1];
    const tc = lastMsg?.toolCalls.find(t => t.id === toolCallId);
    this.onToolCallEndEmitter.fire({
      id: toolCallId,
      name: tc?.name ?? '',
      result,
      success,
      metadata,
    });

    this.updateLastAssistant(last => ({
      ...last,
      toolCalls: last.toolCalls.map(t =>
        t.id === toolCallId
          ? { ...t, status: (success ? 'success' : 'failed') as 'success' | 'failed', result }
          : t,
      ),
    }));
  }

  notifyToolConfirmationRequest(
    confirmationId: string,
    toolName: string,
    args: Record<string, unknown>,
    summary: string,
    isAskUser?: boolean,
  ): void {
    this.updateLastAssistant(last => ({
      ...last,
      toolCalls: last.toolCalls.map(tc =>
        tc.name === toolName || tc.status === 'running'
          ? {
              ...tc,
              status: 'pending_confirmation' as const,
              confirmationId,
              summary,
              ...(isAskUser ? { isAskUser: true } : {}),
            }
          : tc,
      ),
    }));
  }

  notifyUsage(usage: AvaUsageInfo): void {
    // Accumulate session totals
    const prev = this.state.sessionUsage;
    const sessionUsage: SessionUsage = {
      totalTokens: prev.totalTokens + usage.total_tokens,
      totalCost: prev.totalCost + (usage.cost ?? 0),
      requestCount: prev.requestCount + 1,
    };

    // Stamp cost on the current assistant message
    if (usage.cost != null) {
      this.updateLastAssistant(last => ({ ...last, cost: usage.cost }));
    }

    this.update({ lastUsage: usage, sessionUsage });
  }

  notifyError(message: string, code?: string, suggestion?: string): void {
    const msg: UIMessage = {
      id: nextId(),
      role: 'error',
      content: message,
      toolCalls: [],
      isStreaming: false,
      errorCode: code,
      errorSuggestion: suggestion,
    };
    this.update({
      messages: [...this.state.messages, msg],
      isStreaming: false,
      isThinking: false,
    });
  }

  notifyDone(): void {
    this.flushDeltaBuffer();
    this.update({ isStreaming: false, isThinking: false });
  }

  notifyModelSwitched(modelId: string, modelName: string): void {
    const msg: UIMessage = {
      id: nextId(),
      role: 'system',
      content: `Switched to ${modelName}`,
      toolCalls: [],
      isStreaming: false,
    };
    this.update({
      activeModel: modelId,
      messages: [...this.state.messages, msg],
    });
  }

  notifyChatCleared(): void {
    messageIdCounter = 0;
    this.state = {
      ...initialState,
      initialized: true,
      models: this.state.models,
      activeModel: this.state.activeModel,
      needsSetup: this.state.needsSetup,
      sessionUsage: { ...initialSessionUsage },
      contextUsage: null,
      isCompressing: false,
      view: 'chat',
      history: { ...initialHistoryState },
      replay: null,
    };
    this.onStateChangedEmitter.fire(this.state);
  }

  // ── Dashboard notifications ──────────────────────────────────────────────

  notifyProviderKeysChanged(status: AvaProviderKeyStatus): void {
    this.dashboardState = { ...this.dashboardState, providerKeys: status };
    this.onDashboardStateChangedEmitter.fire(this.dashboardState);
  }

  notifyModelsRefreshed(models: AvaModelInfo[], activeModel: string | null, needsSetup: boolean): void {
    // Update BOTH chat state and dashboard state for cross-panel sync
    this.update({ models, activeModel, needsSetup });
    this.dashboardState = { ...this.dashboardState, models, activeModel };
    this.onDashboardStateChangedEmitter.fire(this.dashboardState);
  }

  notifyDashboardError(message: string): void {
    this.dashboardState = { ...this.dashboardState, error: message };
    this.onDashboardStateChangedEmitter.fire(this.dashboardState);
  }

  notifyPlatformAccountChanged(connected: boolean, account: AvaAccountInfo | null): void {
    this.dashboardState = { ...this.dashboardState, platformKeyConnected: connected, account };
    this.onDashboardStateChangedEmitter.fire(this.dashboardState);
  }

  // ── Phase 4 notifications ─────────────────────────────────────────────────

  notifyProviderHealth(health: AvaProviderHealth[]): void {
    this.dashboardState = { ...this.dashboardState, providerHealth: health };
    this.onDashboardStateChangedEmitter.fire(this.dashboardState);
  }

  notifyProviderFallback(fromProvider: string, toProvider: string): void {
    const msg: UIMessage = {
      id: nextId(),
      role: 'system',
      content: `${fromProvider} unavailable — switched to ${toProvider}`,
      toolCalls: [],
      isStreaming: false,
    };
    this.update({ messages: [...this.state.messages, msg] });
  }

  // ── Phase 5 — Session management ───────────────────────────────────────────

  setView(view: ChatView): void {
    this.update({ view });
  }

  setHistoryState(patch: Partial<HistoryState>): void {
    this.update({
      history: { ...this.state.history, ...patch },
    });
  }

  setReplayState(replay: ReplayState | null): void {
    this.update({ replay });
  }

  notifyConversationLoaded(id: string, title: string, messages: AvaReplayMessage[]): void {
    // Convert AvaReplayMessage[] to UIMessage[] for display
    const uiMessages: UIMessage[] = messages
      .filter(m => m.role !== 'system')
      .map((m, i) => ({
        id: `loaded-${i}`,
        role: (m.role === 'tool' ? 'system' : m.role) as UIMessage['role'],
        content: m.content,
        thinking: m.thinking,
        toolCalls: (m.toolCalls || []).map((tc, j) => ({
          id: `tc-${i}-${j}`,
          name: tc.name,
          arguments: tc.arguments,
          status: 'success' as const,
          result: tc.result,
        })),
        isStreaming: false,
      }));

    this.update({
      messages: uiMessages,
      view: 'chat',
      isStreaming: false,
      isThinking: false,
      sessionUsage: { ...initialSessionUsage },
    });
  }

  notifyHistoryChanged(): void {
    // Signal that history list should be re-fetched
    this.onStateChangedEmitter.fire(this.state);
  }

  // ── Context management notifications ──────────────────────────────────────

  notifyContextUsage(used: number, limit: number, percent: number): void {
    this.update({ contextUsage: { used, limit, percent } });
  }

  notifyCompressionStart(): void {
    this.update({ isCompressing: true });
  }

  notifyCompressionEnd(originalTokens: number, compressedTokens: number): void {
    if (originalTokens > 0) {
      const msg: UIMessage = {
        id: nextId(),
        role: 'system',
        content: `Context compressed: ${originalTokens.toLocaleString()} → ${compressedTokens.toLocaleString()} tokens`,
        toolCalls: [],
        isStreaming: false,
      };
      this.update({
        isCompressing: false,
        messages: [...this.state.messages, msg],
      });
    } else {
      this.update({ isCompressing: false });
    }
  }
}
