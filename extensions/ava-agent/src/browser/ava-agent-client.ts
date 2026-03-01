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
  AvaDashboardSettings,
  AvaDashboardState,
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
  thinking?: string;
  toolCalls: ToolCallDisplay[];
  isStreaming: boolean;
  errorCode?: string;
  errorSuggestion?: string;
}

export interface ChatState {
  messages: UIMessage[];
  models: AvaModelInfo[];
  activeModel: string | null;
  isStreaming: boolean;
  isThinking: boolean;
  needsSetup: boolean;
  lastUsage: AvaUsageInfo | null;
}

const initialState: ChatState = {
  messages: [],
  models: [],
  activeModel: null,
  isStreaming: false,
  isThinking: false,
  needsSetup: true,
  lastUsage: null,
};

// ── Dashboard state ──────────────────────────────────────────────────────────

export interface DashboardState {
  providerKeys: AvaProviderKeyStatus;
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
  settings: { language: 'auto', permissionMode: 'balanced', temperature: 0.7, maxTokens: 8192 },
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

  private readonly onStateChangedEmitter = new Emitter<ChatState>();
  readonly onStateChanged = this.onStateChangedEmitter.event;

  private readonly onDashboardStateChangedEmitter = new Emitter<DashboardState>();
  readonly onDashboardStateChanged = this.onDashboardStateChangedEmitter.event;

  // Stream delta buffer — flush every 30ms for smooth typing
  private deltaBuffer = '';
  private deltaTimer: ReturnType<typeof setTimeout> | undefined;

  getState(): ChatState {
    return this.state;
  }

  getDashboardState(): DashboardState {
    return this.dashboardState;
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
    });
  }

  notifyUserMessageAck(text: string): void {
    const msg: UIMessage = {
      id: nextId(),
      role: 'user',
      content: text,
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

  notifyToolCallEnd(toolCallId: string, result: string, success: boolean): void {
    this.updateLastAssistant(last => ({
      ...last,
      toolCalls: last.toolCalls.map(tc =>
        tc.id === toolCallId
          ? { ...tc, status: (success ? 'success' : 'failed') as 'success' | 'failed', result }
          : tc,
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
    this.update({ lastUsage: usage });
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
    this.state = { ...initialState, models: this.state.models, activeModel: this.state.activeModel, needsSetup: this.state.needsSetup };
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
}
