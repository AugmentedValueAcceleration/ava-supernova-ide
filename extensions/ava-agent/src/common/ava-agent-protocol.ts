/**
 * Shared RPC protocol between the Ava agent frontend (browser) and backend (Node.js).
 *
 * Naming convention matters:
 *   - Methods starting with "notify" or "on" → fire-and-forget notifications (Theia RPC convention)
 *   - All other methods → request/response (returns Promise)
 */

// ── Service path for RPC registration ────────────────────────────────────────

export const AVA_AGENT_SERVICE_PATH = '/services/ava-agent';
export const AvaAgentService = Symbol('AvaAgentService');

// ── Serializable types (must be plain JSON, no class instances) ──────────────

export interface AvaModelInfo {
  id: string;           // e.g. "deepseek:deepseek-v3"
  name: string;         // e.g. "DeepSeek V3"
  provider: string;     // e.g. "deepseek"
  supportsVision?: boolean;
}

export interface AvaInitState {
  models: AvaModelInfo[];
  activeModel: string | null;
  needsSetup: boolean;
}

export interface AvaToolCallInfo {
  id: string;
  name: string;
  arguments: string;    // JSON string
}

export interface AvaUsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
}

export type AvaMode = 'code' | 'plan' | 'chat' | 'security';

// ── Dashboard types ──────────────────────────────────────────────────────────

export interface AvaDashboardSettings {
  language: string;
  permissionMode: 'strict' | 'balanced' | 'autonomous';
  temperature: number;
  maxTokens: number;
}

export interface AvaProviderKeyStatus {
  deepseek: boolean;
  kimi: boolean;
  qwen: boolean;
}

export interface AvaAccountInfo {
  email: string;
  name: string | null;
  tier: 'free' | 'pro' | 'ultra' | 'admin';
  usage: {
    tokens_used: number;
    tokens_limit: number | null;
    requests_count: number;
    period_start: string | null;
    period_end: string | null;
    free_tokens_used: number;
    free_tokens_limit: number;
  } | null;
}

export interface AvaDashboardState {
  providerKeys: AvaProviderKeyStatus;
  settings: AvaDashboardSettings;
  platformKeyConnected: boolean;
  account: AvaAccountInfo | null;
  models: AvaModelInfo[];
  activeModel: string | null;
}

// ── Frontend → Backend (request/response) ────────────────────────────────────

export interface IAvaAgentService {
  /** Initialize the agent backend — returns available models and setup state. */
  initialize(): Promise<AvaInitState>;

  /** Send a user message. Streaming events arrive via IAvaAgentClient notifications. */
  sendMessage(text: string, mode: AvaMode): Promise<void>;

  /** Cancel the current agent run. */
  cancelRun(): Promise<void>;

  /** Switch to a different model. */
  switchModel(modelId: string): Promise<void>;

  /** Respond to a tool confirmation request. */
  confirmTool(
    confirmationId: string,
    approved: boolean,
    alwaysAllow?: boolean,
    allowAll?: boolean,
    planSelection?: string,
    userResponse?: string,
  ): Promise<void>;

  /** Start a new chat (clears conversation). */
  newChat(): Promise<void>;

  // ── Dashboard methods ────────────────────────────────────────────────────

  /** Get current dashboard state (provider key status, settings, models). */
  getDashboardState(): Promise<AvaDashboardState>;

  /** Save a provider API key. Re-registers providers and refreshes models. */
  saveProviderKey(provider: 'deepseek' | 'kimi' | 'qwen', apiKey: string): Promise<void>;

  /** Remove a provider API key. Unregisters provider and refreshes models. */
  removeProviderKey(provider: 'deepseek' | 'kimi' | 'qwen'): Promise<void>;

  /** Save preferences (temperature, maxTokens, language, permissionMode). */
  savePreferences(settings: AvaDashboardSettings): Promise<void>;

  /** Connect platform account by storing the sk-ava- key. */
  connectPlatformAccount(key: string): Promise<boolean>;

  /** Disconnect platform account (removes key from config). */
  disconnectPlatformAccount(): Promise<void>;
}

// ── Backend → Frontend (fire-and-forget notifications) ───────────────────────
// Method names MUST start with "notify" so Theia's RpcProxyFactory sends them
// as one-way notifications rather than request/response calls.

export interface IAvaAgentClient {
  notifyInit(state: AvaInitState): void;
  notifyUserMessageAck(text: string): void;
  notifyStreamStart(): void;
  notifyThinkingDelta(content: string): void;
  notifyStreamDelta(content: string): void;
  notifyStreamEnd(): void;
  notifyToolCallStart(toolCall: AvaToolCallInfo): void;
  notifyToolCallEnd(toolCallId: string, result: string, success: boolean): void;
  notifyToolConfirmationRequest(
    confirmationId: string,
    toolName: string,
    args: Record<string, unknown>,
    summary: string,
    isAskUser?: boolean,
  ): void;
  notifyUsage(usage: AvaUsageInfo): void;
  notifyError(message: string, code?: string, suggestion?: string): void;
  notifyDone(): void;
  notifyModelSwitched(modelId: string, modelName: string): void;
  notifyChatCleared(): void;

  // ── Dashboard notifications ──────────────────────────────────────────────

  /** Provider key status changed (key added or removed). */
  notifyProviderKeysChanged(status: AvaProviderKeyStatus): void;

  /** Model list refreshed after provider key changes. */
  notifyModelsRefreshed(models: AvaModelInfo[], activeModel: string | null, needsSetup: boolean): void;

  /** Dashboard-specific error. */
  notifyDashboardError(message: string): void;

  /** Platform account connection status changed. */
  notifyPlatformAccountChanged(connected: boolean, account: AvaAccountInfo | null): void;
}
