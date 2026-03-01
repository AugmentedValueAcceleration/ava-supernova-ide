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

// ── Tool call metadata (forwarded from @ava/core agent events) ──────────────

export interface AvaToolCallMetadata {
  path?: string;           // file_write, file_edit
  lineCount?: number;      // file_write
  occurrences?: number;    // file_edit
  exitCode?: number;       // bash
  killed?: boolean;        // bash
  command?: string;        // bash (from parsed arguments)
}

// ── Inline completion types ─────────────────────────────────────────────────

export interface AvaInlineCompletionRequest {
  prefix: string;          // text before cursor
  suffix: string;          // text after cursor
  language: string;        // languageId
  filePath: string;
  maxTokens?: number;
}

// ── Dashboard types ──────────────────────────────────────────────────────────

export interface AvaDashboardSettings {
  language: string;
  permissionMode: 'strict' | 'balanced' | 'autonomous';
  temperature: number;
  maxTokens: number;
  completionsProvider: string;  // provider name for inline completions ('deepseek', 'qwen', 'none')
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

// ── Smart context types (Phase 3) ───────────────────────────────────────────

export interface AvaFileContext {
  activeFile?: {
    path: string;
    language: string;
    content: string;
    selection?: string;
  };
  openTabs?: Array<{
    path: string;
    language: string;
  }>;
  pinnedFiles?: Array<{
    path: string;
    language: string;
    content: string;
  }>;
}

// ── Project detection types (Phase 3) ───────────────────────────────────────

export type AvaProjectType = 'node' | 'python' | 'go' | 'rust' | 'java' | 'csharp' | 'unknown';

export interface AvaProjectInfo {
  projectType: AvaProjectType;
  rootPath: string;
  suggestedExtensions: Array<{ id: string; name: string; reason: string }>;
  suggestedFormatter: string | null;
  tabSize: number;
  lineEndings: 'lf' | 'crlf' | 'auto';
}

// ── Usage tracking types (Phase 4) ──────────────────────────────────────────

export interface AvaUsageEntry {
  timestamp: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface AvaUsageSummary {
  today: { tokens: number; cost: number };
  month: { tokens: number; cost: number };
  byProvider: Record<string, { tokens: number; cost: number }>;
}

// ── Provider health types (Phase 4) ─────────────────────────────────────────

export interface AvaProviderHealth {
  provider: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

// ── Workspace template types (Phase 4) ──────────────────────────────────────

export interface AvaProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  files: Array<{ path: string; content: string }>;
  openFile?: string;
}

// ── Session history types (Phase 5) ──────────────────────────────────────────

export interface AvaHistoryEntry {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  pinned?: boolean;
  projectPath?: string;
  messageCount: number;
}

export interface AvaReplayMessage {
  index: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: Array<{ name: string; arguments: string; result?: string }>;
  thinking?: string;
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

  // ── Editor + Completion integration ─────────────────────────────────────

  /** Read a file's content (used by editor integration to snapshot before tool writes). */
  readFile(filePath: string): Promise<string | null>;

  /** Request an inline completion (FIM). Returns the completion text or null. */
  getInlineCompletion(request: AvaInlineCompletionRequest): Promise<string | null>;

  // ── Smart context (Phase 3) ───────────────────────────────────────────────

  /** Send a message with file context from the editor. */
  sendMessageWithContext(text: string, mode: AvaMode, context: AvaFileContext): Promise<void>;

  // ── Project detection (Phase 3) ───────────────────────────────────────────

  /** Detect project type and return configuration suggestions. */
  detectProject(): Promise<AvaProjectInfo | null>;

  // ── Git integration (Phase 3) ─────────────────────────────────────────────

  /** Get diff of staged changes (git diff --cached). */
  getGitStagedDiff(): Promise<string | null>;

  /** Get diff of all working changes (git diff). */
  getGitWorkingDiff(): Promise<string | null>;

  /** Get current branch name. */
  getGitBranch(): Promise<string | null>;

  /** Get recent commit log. */
  getGitLog(count?: number): Promise<string | null>;

  // ── Usage tracking (Phase 4) ──────────────────────────────────────────────

  /** Get usage summary (today, this month, by provider). */
  getUsageSummary(): Promise<AvaUsageSummary>;

  // ── Provider health (Phase 4) ──────────────────────────────────────────────

  /** Check health of all configured providers. */
  checkProviderHealth(): Promise<AvaProviderHealth[]>;

  // ── Workspace templates (Phase 4) ──────────────────────────────────────────

  /** Get available project templates. */
  getTemplates(): Promise<AvaProjectTemplate[]>;

  /** Create a new project from a template. */
  createFromTemplate(templateId: string, targetDir: string, projectName: string): Promise<void>;

  // ── Session history (Phase 5) ──────────────────────────────────────────────

  /** List conversations, optionally filtered by current project. */
  getHistory(filterByProject?: boolean): Promise<AvaHistoryEntry[]>;

  /** Search conversations by text query. */
  searchHistory(query: string): Promise<AvaHistoryEntry[]>;

  /** Load a past conversation into the current chat. */
  loadConversation(id: string): Promise<void>;

  /** Delete a conversation from history. */
  deleteConversation(id: string): Promise<boolean>;

  /** Rename a conversation. */
  renameConversation(id: string, newTitle: string): Promise<boolean>;

  /** Pin or unpin a conversation. */
  pinConversation(id: string, pinned: boolean): Promise<boolean>;

  /** Export a conversation as JSON or Markdown string. */
  exportConversation(id: string, format: 'json' | 'markdown'): Promise<string | null>;

  /** Import a conversation from a JSON export string. Returns new conversation ID. */
  importConversation(jsonData: string): Promise<string | null>;

  /** Get messages for session replay (read-only, does not affect active session). */
  getReplayMessages(id: string): Promise<AvaReplayMessage[]>;
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
  notifyToolCallPartial(toolCallId: string, data: string): void;
  notifyToolCallEnd(toolCallId: string, result: string, success: boolean, metadata?: AvaToolCallMetadata): void;
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

  // ── Phase 4 notifications ─────────────────────────────────────────────────

  /** Provider health check results. */
  notifyProviderHealth(health: AvaProviderHealth[]): void;

  /** Provider fallback occurred during a run. */
  notifyProviderFallback(fromProvider: string, toProvider: string): void;

  // ── Phase 5 notifications ─────────────────────────────────────────────────

  /** Conversation loaded from history — frontend should replace current messages. */
  notifyConversationLoaded(id: string, title: string, messages: AvaReplayMessage[]): void;

  /** History list changed (after delete, import, rename, pin). */
  notifyHistoryChanged(): void;
}
