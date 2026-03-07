/**
 * Backend service for the Ava agent panel.
 * Runs in Node.js, orchestrates @ava/core (Agent, providers, tools, config).
 * Communicates with the frontend widget via JSON-RPC notifications.
 */
import { injectable } from '@theia/core/shared/inversify';
import * as crypto from 'node:crypto';
import * as https from 'node:https';
import { execFile } from 'node:child_process';
import {
  IAvaAgentService,
  IAvaAgentClient,
  AvaInitState,
  AvaMode,
  AvaAccountInfo,
  AvaDashboardState,
  AvaDashboardSettings,
  AvaProviderKeyStatus,
  AvaToolCallMetadata,
  AvaInlineCompletionRequest,
  AvaAttachment,
  AvaFileContext,
  AvaProjectInfo,
  AvaUsageSummary,
  AvaProviderHealth,
  AvaProjectTemplate,
  AvaHistoryEntry,
  AvaReplayMessage,
} from '../common/ava-agent-protocol';
import { detectProject } from './ava-project-detector';
import { UsageTracker } from './ava-usage-tracker';
import { BUILTIN_TEMPLATES } from './ava-templates';

const PLATFORM_API = 'https://ava-supernova.com/api';

// @ava/core is ESM — use dynamic import hidden from webpack's static analysis.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
type CoreModule = typeof import('@ava/core');
let _core: CoreModule | null = null;
async function getCore(): Promise<CoreModule> {
  if (!_core) {
    // In packaged app, @ava/core is bundled as ava-core.mjs in resources/
    const corePaths: string[] = [];
    if (typeof process !== 'undefined' && process.resourcesPath) {
      const path = require('path');
      const { pathToFileURL } = require('url');
      const mjsPath = path.join(process.resourcesPath, 'ava-core.mjs');
      corePaths.push(pathToFileURL(mjsPath).href);
    }
    corePaths.push('@ava/core'); // fallback for dev mode
    for (const specifier of corePaths) {
      try {
        _core = await dynamicImport(specifier);
        console.log('[ava-agent] Loaded @ava/core from:', specifier);
        break;
      } catch (e: any) {
        console.warn('[ava-agent] Failed to load core from', specifier, ':', e.message);
      }
    }
    if (!_core) throw new Error('Failed to load @ava/core from any path');
  }
  return _core;
}

@injectable()
export class AvaAgentServiceImpl implements IAvaAgentService {

  private client: IAvaAgentClient | undefined;

  // Core objects — initialized lazily on first initialize() call
  private agent: InstanceType<CoreModule['Agent']> | undefined;
  private conversation: InstanceType<CoreModule['Conversation']> | undefined;
  private toolRegistry: InstanceType<CoreModule['ToolRegistry']> | undefined;
  private providerRegistry: InstanceType<CoreModule['ProviderRegistry']> | undefined;
  private configManager: InstanceType<CoreModule['ConfigManager']> | undefined;
  private historyManager: InstanceType<CoreModule['HistoryManager']> | undefined;
  private activeModelDef: any | undefined; // ModelDefinition
  private memoryManager: any | undefined; // MemoryManager
  private usageTracker = new UsageTracker();
  private healthCheckInterval: ReturnType<typeof setInterval> | undefined;
  private workspaceRoot: string | undefined;

  // Run state
  private isRunning = false;
  private runAbortController: AbortController | undefined;
  private pendingConfirmations = new Map<string, { resolve: (result: boolean | string) => void; toolName: string }>();
  private sessionAllowedTools = new Set<string>();
  private sessionAllowAll = false;

  // Cached user identity — populated when account info is fetched
  private cachedUserName: string | undefined;
  private cachedIsAdmin = false;

  setClient(client: IAvaAgentClient | undefined): void {
    this.client = client;
  }

  /** Returns user's workspace root (from IDE) or falls back to process cwd. */
  private getCwd(): string {
    return this.workspaceRoot ?? process.cwd();
  }

  // ── IAvaAgentService implementation ─────────────────────────────────────────

  async initialize(workspaceRoot?: string): Promise<AvaInitState> {
    if (workspaceRoot) {
      this.workspaceRoot = workspaceRoot;
      console.log('[ava-agent] Workspace root:', this.workspaceRoot);
    }

    const core = await getCore();

    // Enable debug logging for diagnostics
    if (core.setLogLevel) core.setLogLevel('debug');

    // Load config from ~/.ava/config.json (same as CLI)
    this.configManager = new core.ConfigManager();
    const config = await this.configManager.load();
    console.log('[ava-agent] Config loaded:', {
      activeModel: config.activeModel,
      providers: Object.keys(config.providers).filter(k => !!(config.providers as any)[k]?.apiKey),
      hasPlatformKey: Boolean(config.platformKey),
    });

    // Register providers from config
    this.providerRegistry = new core.ProviderRegistry();
    const providerNames = ['deepseek', 'kimi', 'qwen'] as const;
    for (const name of providerNames) {
      const settings = config.providers[name];
      if (settings?.apiKey) {
        try {
          this.providerRegistry.register(name, { apiKey: settings.apiKey, baseUrl: settings.baseUrl });
        } catch (err) {
          console.error(`[ava-agent] Provider ${name} failed to register:`, err);
        }
      }
    }

    // Register platform provider if key exists
    if (config.platformKey) {
      try {
        const platformProvider = new core.PlatformProvider({ apiKey: config.platformKey });
        this.providerRegistry.registerCustom('platform', platformProvider);
      } catch (err) {
        console.error('[ava-agent] Platform provider failed to register:', err);
      }

      // Fetch and cache user identity for system prompt
      try {
        const acctRes = await this.platformApiFetch('/account-info', config.platformKey);
        if (acctRes.ok && acctRes.data) {
          this.cachedUserName = acctRes.data.name || acctRes.data.email?.split('@')[0];
          this.cachedIsAdmin = acctRes.data.tier === 'admin';
          console.log('[ava-agent] User identity cached:', this.cachedUserName, 'admin:', this.cachedIsAdmin);
        }
      } catch {
        console.log('[ava-agent] Could not fetch user identity');
      }
    }

    // Resolve active model
    const activeModelId = config.activeModel || '';
    const resolved = this.providerRegistry.resolveModel(activeModelId);
    console.log('[ava-agent] Model resolution:', {
      activeModelId,
      resolved: resolved ? `${resolved.provider.name}:${resolved.model.id}` : null,
      supportsToolCalls: resolved?.model.supportsToolCalls ?? false,
    });

    if (resolved) {
      await this.setupAgent(core, resolved.provider, resolved.model);
    } else if (activeModelId) {
      console.warn(`[ava-agent] Failed to resolve model "${activeModelId}" — check provider registration`);
    }

    // Initialize history and memory
    const projectRoot = core.detectProjectRoot(this.getCwd()) ?? undefined;
    this.historyManager = new core.HistoryManager(projectRoot);
    this.historyManager.init();

    // Set up memory with optional platform sync
    let memSync: any | undefined;
    if (config.platformKey && core.PlatformMemorySync) {
      const projectId = projectRoot
        ? crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 16)
        : undefined;
      memSync = new core.PlatformMemorySync(PLATFORM_API, config.platformKey, projectId);
    }
    this.memoryManager = new core.MemoryManager({ globalDir: core.AVA_HOME, projectRoot, sync: memSync });

    // Auto-restore last conversation for this project (non-blocking)
    this.autoRestoreLastConversation(core).catch(err => {
      console.warn('[ava-agent] Failed to auto-restore conversation:', err);
    });

    // Start provider health checks (non-blocking, every 5 minutes)
    this.checkProviderHealth().catch(() => {});
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    this.healthCheckInterval = setInterval(() => {
      this.checkProviderHealth().catch(() => {});
    }, 5 * 60 * 1000);

    const models = this.providerRegistry.listAllModels().map((m: any) => ({
      id: `${m.provider}:${m.id}`,
      name: m.name,
      provider: m.provider,
      ...(m.supportsVision ? { supportsVision: true } : {}),
    }));

    return {
      models,
      activeModel: resolved ? `${resolved.provider.name}:${resolved.model.id}` : null,
      needsSetup: !resolved,
    };
  }

  private async autoRestoreLastConversation(core: any): Promise<void> {
    if (!this.historyManager) return;

    // Get the most recent conversation for this project
    const entries = await this.historyManager.listConversations(true);
    if (entries.length === 0) return;

    const lastEntry = entries[0]; // Already sorted by updatedAt descending
    const record = await this.historyManager.resumeConversation(lastEntry.id);
    if (!record || record.messages.length <= 1) return;

    // Restore the conversation
    this.conversation = new core.Conversation(record.id);
    this.conversation.setMessages(record.messages);
    this.conversation.setSystemPrompt(await this.buildSystemPrompt());

    // Notify frontend to display the loaded messages
    const replayMessages = this.buildReplayMessages(record.messages);
    this.client?.notifyConversationLoaded(record.id, record.title, replayMessages);
    console.log(`[ava-agent] Auto-restored conversation: "${record.title}" (${record.messages.length} messages)`);
  }

  async sendMessage(text: string, mode: AvaMode): Promise<void> {
    if (!this.agent || !this.conversation) {
      this.client?.notifyError('No model configured.', 'setup', 'Run the CLI setup wizard (ava --setup) to add an API key.');
      return;
    }

    if (this.isRunning) {
      this.client?.notifyError('Ava is still working on the previous message.', 'busy');
      return;
    }

    this.isRunning = true;
    this.runAbortController = new AbortController();

    const userText = this.applyModePrefix(text, mode);
    this.conversation.addUserMessage(userText);
    this.client?.notifyUserMessageAck(text);

    return this.runAgentLoop();
  }

  private async sendMessageWithImages(text: string, mode: AvaMode, attachments: AvaAttachment[]): Promise<void> {
    if (!this.agent || !this.conversation) {
      this.client?.notifyError('No model configured.', 'setup', 'Run the CLI setup wizard (ava --setup) to add an API key.');
      return;
    }

    if (this.isRunning) {
      this.client?.notifyError('Ava is still working on the previous message.', 'busy');
      return;
    }

    this.isRunning = true;
    this.runAbortController = new AbortController();

    const userText = this.applyModePrefix(text, mode);

    // Build ContentPart[] — text first, then images
    const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
      { type: 'text', text: userText },
    ];

    for (const att of attachments) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: att.data },
      });
    }

    this.conversation.addUserMessage(contentParts);

    const imageUrls = attachments.map(a => a.data);
    this.client?.notifyUserMessageAck(text, imageUrls);

    return this.runAgentLoop();
  }

  /** Shared agent run loop — executes after the user message has been added to the conversation. */
  private async runAgentLoop(): Promise<void> {
    let streamStarted = false;

    const onEvent = (event: any): void => {
      switch (event.type) {
        case 'stream_start':
          streamStarted = true;
          this.client?.notifyStreamStart();
          break;
        case 'thinking_delta':
          this.client?.notifyThinkingDelta(event.content);
          break;
        case 'stream_delta':
          this.client?.notifyStreamDelta(event.content);
          break;
        case 'stream_end':
          this.client?.notifyStreamEnd();
          break;
        case 'tool_call_start':
          this.client?.notifyToolCallStart({
            id: event.toolCall.id,
            name: event.toolCall.function.name,
            arguments: event.toolCall.function.arguments,
          });
          break;
        case 'tool_call_partial':
          this.client?.notifyToolCallPartial(event.toolCallId, event.data);
          break;
        case 'tool_call_end': {
          let parsedArgs: Record<string, unknown> = {};
          try { parsedArgs = JSON.parse(event.toolCall.function.arguments); } catch { /* ignore */ }

          const metadata: AvaToolCallMetadata = {
            ...event.metadata,
            ...(event.toolCall.function.name === 'bash' ? { command: parsedArgs.command as string } : {}),
          };
          this.client?.notifyToolCallEnd(event.toolCall.id, event.result, event.success, metadata);
          break;
        }
        case 'usage':
          this.client?.notifyUsage({
            prompt_tokens: event.usage.prompt_tokens,
            completion_tokens: event.usage.completion_tokens,
            total_tokens: event.usage.total_tokens,
            cost: event.cost,
          });
          // Persist usage to disk (fire-and-forget)
          this.usageTracker.record({
            provider: this.activeModelDef?.provider ?? 'unknown',
            model: this.activeModelDef?.id ?? 'unknown',
            inputTokens: event.usage.prompt_tokens,
            outputTokens: event.usage.completion_tokens,
            cost: event.cost ?? 0,
          }).catch(() => {});
          break;
        case 'error': {
          const msg = event.error?.humanMessage || event.error?.message || String(event.error);
          this.client?.notifyError(msg);
          break;
        }
        case 'context_usage':
          this.client?.notifyContextUsage(
            event.context.used,
            event.context.limit,
            event.context.percent,
          );
          break;
        case 'done':
          this.client?.notifyDone();
          break;
      }
    };

    try {
      const updatedMessages = await this.agent!.run(
        this.conversation!.getMessages(),
        onEvent,
        this.runAbortController!.signal,
      );
      this.conversation!.setMessages(updatedMessages);

      if (this.historyManager) {
        await this.historyManager.saveConversation(this.conversation!);
      }
    } catch (error: any) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      if (isAbort) {
        if (streamStarted) {
          this.client?.notifyStreamEnd();
        }
      } else {
        if (streamStarted) {
          this.client?.notifyStreamEnd();
        }

        // Attempt fallback to another provider
        const fallbackResult = await this.tryFallback(
          this.conversation!.getMessages(),
          onEvent,
          this.runAbortController!.signal,
        );

        if (!fallbackResult) {
          const msg = error?.humanMessage || error?.message || String(error);
          this.client?.notifyError(msg);
        }
      }
    } finally {
      this.isRunning = false;
      this.runAbortController = undefined;
      this.client?.notifyDone();
    }
  }

  async cancelRun(): Promise<void> {
    if (!this.isRunning || !this.runAbortController) return;

    this.runAbortController.abort();

    // Reject all pending confirmations to unblock the agent loop
    for (const [id, pending] of this.pendingConfirmations) {
      pending.resolve(false);
      this.pendingConfirmations.delete(id);
    }
  }

  async switchModel(modelId: string): Promise<void> {
    if (!this.providerRegistry) return;

    const resolved = this.providerRegistry.resolveModel(modelId);
    if (!resolved) {
      this.client?.notifyError(`Model not found: ${modelId}`, 'model_not_found');
      return;
    }

    const core = await getCore();
    await this.setupAgent(core, resolved.provider, resolved.model);

    // Persist choice
    if (this.configManager) {
      await this.configManager.set('activeModel', modelId);
      await this.configManager.save();
    }

    this.client?.notifyModelSwitched(modelId, resolved.model.name);
  }

  async confirmTool(
    confirmationId: string,
    approved: boolean,
    alwaysAllow?: boolean,
    allowAll?: boolean,
    planSelection?: string,
    userResponse?: string,
  ): Promise<void> {
    const pending = this.pendingConfirmations.get(confirmationId);
    if (!pending) return;

    this.pendingConfirmations.delete(confirmationId);

    if (approved && alwaysAllow) {
      this.sessionAllowedTools.add(pending.toolName);
    }
    if (approved && allowAll) {
      this.sessionAllowAll = true;
    }

    if (pending.toolName === 'present_plan') {
      if (approved) {
        const selection = planSelection ? ` User selected approach: "${planSelection}".` : '';
        pending.resolve(`Plan approved.${selection} Execute the steps.`);
      } else {
        pending.resolve(false);
      }
    } else if (pending.toolName === 'ask_user') {
      pending.resolve(approved && userResponse ? `User response: ${userResponse}` : false);
    } else {
      pending.resolve(approved);
    }
  }

  async newChat(): Promise<void> {
    const core = await getCore();

    // Save current conversation before clearing
    if (this.conversation && this.historyManager) {
      await this.historyManager.saveConversation(this.conversation);
    }

    this.conversation = new core.Conversation();
    this.conversation.setSystemPrompt(await this.buildSystemPrompt());
    this.sessionAllowedTools.clear();
    this.sessionAllowAll = false;

    this.client?.notifyChatCleared();
  }

  // ── Context management ───────────────────────────────────────────────────────

  async compressContext(): Promise<void> {
    if (!this.agent || !this.conversation) {
      this.client?.notifyError('No active conversation to compress.');
      return;
    }
    if (this.isRunning) {
      this.client?.notifyError('Cannot compress while Ava is working.');
      return;
    }

    this.client?.notifyCompressionStart();

    try {
      const messages = this.conversation.getMessages();
      const originalCount = messages.length;
      const onEvent = (event: any): void => {
        if (event.type === 'context_usage') {
          this.client?.notifyContextUsage(event.context.used, event.context.limit, event.context.percent);
        }
      };

      const compressed = await this.agent.manualCompress(messages, onEvent, new AbortController().signal);
      this.conversation.setMessages(compressed);
      this.client?.notifyCompressionEnd(originalCount, compressed.length);
    } catch (err: any) {
      this.client?.notifyError(`Compression failed: ${err.message}`);
      this.client?.notifyCompressionEnd(0, 0);
    }
  }

  // ── Memory management ────────────────────────────────────────────────────────

  async getMemory(): Promise<{ global: string | null; project: string | null }> {
    if (!this.memoryManager) {
      return { global: null, project: null };
    }
    const [global, project] = await Promise.all([
      this.memoryManager.loadGlobalMemory(),
      this.memoryManager.loadProjectMemory(),
    ]);
    return { global, project };
  }

  async saveMemory(scope: 'global' | 'project', content: string): Promise<void> {
    if (!this.memoryManager) return;
    if (scope === 'global') {
      await this.memoryManager.saveGlobalMemory(content);
    } else {
      await this.memoryManager.saveProjectMemory(content);
    }
    this.client?.notifyMemoryChanged(scope);
  }

  async clearMemory(scope: 'global' | 'project'): Promise<void> {
    if (!this.memoryManager) return;
    if (scope === 'global') {
      await this.memoryManager.saveGlobalMemory('');
    } else {
      await this.memoryManager.saveProjectMemory('');
    }
    this.client?.notifyMemoryChanged(scope);
  }

  // ── Dashboard methods ──────────────────────────────────────────────────────

  async getDashboardState(): Promise<AvaDashboardState> {
    const core = await getCore();
    if (!this.configManager) {
      this.configManager = new core.ConfigManager();
      await this.configManager.load();
    }
    const config = await this.configManager.load();

    const providerKeys: AvaProviderKeyStatus = {
      deepseek: Boolean(config.providers.deepseek?.apiKey),
      kimi: Boolean(config.providers.kimi?.apiKey),
      qwen: Boolean(config.providers.qwen?.apiKey),
    };

    const settings: AvaDashboardSettings = {
      language: config.preferences?.language ?? 'auto',
      permissionMode: 'balanced',
      temperature: config.preferences?.temperature ?? 0.7,
      maxTokens: config.preferences?.maxTokens ?? 8192,
      completionsProvider: (config.preferences as any)?.completionsProvider ?? 'deepseek',
    };

    const models = this.providerRegistry
      ? this.providerRegistry.listAllModels().map((m: any) => ({
          id: `${m.provider}:${m.id}`,
          name: m.name,
          provider: m.provider,
          ...(m.supportsVision ? { supportsVision: true } : {}),
        }))
      : [];

    // Check platform key and fetch account info (non-blocking on failure)
    const platformKey = config.platformKey;
    let account: AvaAccountInfo | null = null;
    if (platformKey) {
      try {
        const res = await this.platformApiFetch('/account-info', platformKey);
        if (res.ok && res.data) {
          account = {
            email: res.data.email,
            name: res.data.name ?? null,
            tier: res.data.tier,
            usage: res.data.usage ?? null,
          };
          // Cache user identity for system prompt
          this.cachedUserName = res.data.name || res.data.email?.split('@')[0];
          this.cachedIsAdmin = res.data.tier === 'admin';
        }
      } catch {
        // Network error — account info unavailable but key is still valid
      }
    }

    return {
      providerKeys,
      settings,
      platformKeyConnected: Boolean(platformKey),
      account,
      models,
      activeModel: this.activeModelDef
        ? `${this.activeModelDef.provider}:${this.activeModelDef.id}`
        : null,
    };
  }

  async saveProviderKey(provider: 'deepseek' | 'kimi' | 'qwen', apiKey: string): Promise<void> {
    if (this.isRunning) {
      this.client?.notifyDashboardError('Cannot change providers while Ava is working.');
      return;
    }

    const core = await getCore();
    if (!this.configManager) {
      this.configManager = new core.ConfigManager();
      await this.configManager.load();
    }
    const config = await this.configManager.load();
    (config.providers as any)[provider] = { apiKey };
    await this.configManager.save();

    await this.reloadProviders();
  }

  async removeProviderKey(provider: 'deepseek' | 'kimi' | 'qwen'): Promise<void> {
    if (this.isRunning) {
      this.client?.notifyDashboardError('Cannot change providers while Ava is working.');
      return;
    }

    const core = await getCore();
    if (!this.configManager) {
      this.configManager = new core.ConfigManager();
      await this.configManager.load();
    }
    const config = await this.configManager.load();
    delete (config.providers as any)[provider];

    // Clear active model if it belonged to this provider
    if (config.activeModel && config.activeModel.startsWith(provider + ':')) {
      config.activeModel = '';
    }
    await this.configManager.save();

    await this.reloadProviders();
  }

  async savePreferences(settings: AvaDashboardSettings): Promise<void> {
    const core = await getCore();
    if (!this.configManager) {
      this.configManager = new core.ConfigManager();
      await this.configManager.load();
    }
    const config = await this.configManager.load();
    (config as any).preferences = {
      ...config.preferences,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      language: settings.language,
      completionsProvider: settings.completionsProvider,
    };
    await this.configManager.save();

    // Update permission mode on tool registry if active
    if (this.toolRegistry) {
      this.toolRegistry.setPermissionMode(settings.permissionMode);
    }
  }

  async connectPlatformAccount(key: string): Promise<boolean> {
    if (!key.startsWith('sk-ava-')) {
      this.client?.notifyDashboardError('Invalid key format. Keys start with sk-ava-');
      return false;
    }

    const res = await this.platformApiFetch('/account-info', key);
    if (!res.ok) {
      this.client?.notifyDashboardError('Could not verify key. Check it is correct and try again.');
      return false;
    }

    // Cache user identity for system prompt
    if (res.data) {
      this.cachedUserName = res.data.name || res.data.email?.split('@')[0];
      this.cachedIsAdmin = res.data.tier === 'admin';
    }

    const core = await getCore();
    if (!this.configManager) {
      this.configManager = new core.ConfigManager();
      await this.configManager.load();
    }
    const config = await this.configManager.load();
    config.platformKey = key;
    await this.configManager.save();

    // Reload providers so the platform provider is registered and agent is set up
    await this.reloadProviders();

    const account: AvaAccountInfo = {
      email: res.data.email,
      name: res.data.name ?? null,
      tier: res.data.tier,
      usage: res.data.usage ?? null,
    };

    this.client?.notifyPlatformAccountChanged(true, account);
    return true;
  }

  async disconnectPlatformAccount(): Promise<void> {
    const core = await getCore();
    if (!this.configManager) {
      this.configManager = new core.ConfigManager();
      await this.configManager.load();
    }
    const config = await this.configManager.load();
    delete config.platformKey;
    await this.configManager.save();

    // Reload providers so the platform provider is removed
    await this.reloadProviders();

    this.client?.notifyPlatformAccountChanged(false, null);
  }

  // ── Editor + Completion integration ────────────────────────────────────────

  async readFile(filePath: string): Promise<string | null> {
    try {
      const { readFile: rf } = await import('node:fs/promises');
      return await rf(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async getInlineCompletion(request: AvaInlineCompletionRequest): Promise<string | null> {
    if (!this.configManager) return null;

    try {
      const config = await this.configManager.load();
      const selectedProvider = (config.preferences as any)?.completionsProvider ?? 'deepseek';
      if (selectedProvider === 'none') return null;

      // Resolve provider config — FIM endpoint varies by provider
      const providerConfig = config.providers[selectedProvider];
      const apiKey = providerConfig?.apiKey;
      if (!apiKey) return null;

      let baseUrl: string;
      let endpoint: string;
      let model: string;

      switch (selectedProvider) {
        case 'deepseek':
          baseUrl = providerConfig.baseUrl || 'https://api.deepseek.com';
          endpoint = '/beta/completions';
          model = 'deepseek-chat';
          break;
        case 'qwen':
          baseUrl = providerConfig.baseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
          endpoint = '/completions';
          model = 'qwen-coder-plus';
          break;
        default:
          // Unsupported provider for FIM — fall back to deepseek
          const dsConfig = config.providers.deepseek;
          if (!dsConfig?.apiKey) return null;
          baseUrl = dsConfig.baseUrl || 'https://api.deepseek.com';
          endpoint = '/beta/completions';
          model = 'deepseek-chat';
          break;
      }

      const body = JSON.stringify({
        model,
        prompt: request.prefix,
        suffix: request.suffix,
        max_tokens: request.maxTokens ?? 128,
        temperature: 0,
        stop: ['\n\n', '\r\n\r\n'],
      });

      return await this.httpPost(`${baseUrl}${endpoint}`, apiKey, body);
    } catch {
      return null;
    }
  }

  // ── Smart context (Phase 3) ──────────────────────────────────────────────────

  async sendMessageWithContext(text: string, mode: AvaMode, context: AvaFileContext, attachments?: AvaAttachment[]): Promise<void> {
    // Build enriched message with file context prepended
    const parts: string[] = [];

    if (context.activeFile) {
      const f = context.activeFile;
      parts.push(`[Active File: ${f.path} (${f.language})]`);
      if (f.selection) {
        parts.push(`Selected code:\n\`\`\`${f.language}\n${f.selection}\n\`\`\``);
      }
      // Include file content (truncate if huge)
      const content = f.content.length > 10_000
        ? f.content.slice(0, 10_000) + '\n... (truncated)'
        : f.content;
      parts.push(`File content:\n\`\`\`${f.language}\n${content}\n\`\`\``);
    }

    if (context.openTabs && context.openTabs.length > 0) {
      const tabList = context.openTabs.map(t => t.path).join(', ');
      parts.push(`[Open tabs: ${tabList}]`);
    }

    if (context.pinnedFiles) {
      for (const pf of context.pinnedFiles) {
        const content = pf.content.length > 5_000
          ? pf.content.slice(0, 5_000) + '\n... (truncated)'
          : pf.content;
        parts.push(`[Pinned: ${pf.path} (${pf.language})]\n\`\`\`${pf.language}\n${content}\n\`\`\``);
      }
    }

    const enrichedText = parts.length > 0
      ? parts.join('\n\n') + '\n\n' + text
      : text;

    // If we have image attachments, send as ContentPart[]
    if (attachments && attachments.length > 0) {
      return this.sendMessageWithImages(enrichedText, mode, attachments);
    }

    // Delegate to the existing sendMessage logic
    return this.sendMessage(enrichedText, mode);
  }

  // ── Project detection (Phase 3) ──────────────────────────────────────────────

  async detectProject(): Promise<AvaProjectInfo | null> {
    return detectProject(this.getCwd());
  }

  // ── Usage tracking (Phase 4) ──────────────────────────────────────────────────

  async getUsageSummary(): Promise<AvaUsageSummary> {
    return this.usageTracker.getSummary();
  }

  // ── Provider health (Phase 4) ────────────────────────────────────────────────

  async checkProviderHealth(): Promise<AvaProviderHealth[]> {
    if (!this.providerRegistry) return [];

    const results: AvaProviderHealth[] = [];
    const providerNames = ['deepseek', 'kimi', 'qwen'] as const;

    for (const name of providerNames) {
      const provider = this.providerRegistry.get(name);
      if (!provider) continue;

      const start = Date.now();
      try {
        // Minimal completion to validate connectivity + key validity
        const models = provider.listModels();
        if (models.length === 0) continue;
        await provider.createCompletion({
          model: models[0].id,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        } as any);

        results.push({
          provider: name,
          healthy: true,
          latencyMs: Date.now() - start,
        });
      } catch (err: any) {
        results.push({
          provider: name,
          healthy: false,
          latencyMs: Date.now() - start,
          error: (err?.message || String(err)).slice(0, 100),
        });
      }
    }

    this.client?.notifyProviderHealth(results);
    return results;
  }

  // ── Workspace templates (Phase 4) ────────────────────────────────────────────

  async getTemplates(): Promise<AvaProjectTemplate[]> {
    return BUILTIN_TEMPLATES;
  }

  async createFromTemplate(templateId: string, targetDir: string, projectName: string): Promise<void> {
    const template = BUILTIN_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      this.client?.notifyError(`Template not found: ${templateId}`);
      return;
    }

    const { mkdir, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');

    const projectDir = path.join(targetDir, projectName);
    await mkdir(projectDir, { recursive: true });

    for (const file of template.files) {
      const filePath = path.join(projectDir, file.path);
      const dir = path.dirname(filePath);
      await mkdir(dir, { recursive: true });

      // Replace {{PROJECT_NAME}} placeholder in file content
      const content = file.content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
      await writeFile(filePath, content, 'utf-8');
    }
  }

  // ── Session history (Phase 5) ──────────────────────────────────────────────────

  async getHistory(filterByProject?: boolean): Promise<AvaHistoryEntry[]> {
    if (!this.historyManager) return [];
    const entries = await this.historyManager.listConversations(filterByProject ?? true);
    const results: AvaHistoryEntry[] = [];
    for (const entry of entries) {
      const record = await this.historyManager.resumeConversation(entry.id);
      results.push({
        id: entry.id,
        title: entry.title,
        updatedAt: entry.updatedAt,
        createdAt: record?.createdAt ?? entry.updatedAt,
        pinned: entry.pinned,
        projectPath: entry.projectPath,
        messageCount: record ? record.messages.filter((m: any) => m.role !== 'system').length : 0,
      });
    }
    return results;
  }

  async searchHistory(query: string): Promise<AvaHistoryEntry[]> {
    if (!this.historyManager) return [];
    const entries = await this.historyManager.searchConversations(query);
    const results: AvaHistoryEntry[] = [];
    for (const entry of entries) {
      const record = await this.historyManager.resumeConversation(entry.id);
      results.push({
        id: entry.id,
        title: entry.title,
        updatedAt: entry.updatedAt,
        createdAt: record?.createdAt ?? entry.updatedAt,
        pinned: entry.pinned,
        projectPath: entry.projectPath,
        messageCount: record ? record.messages.filter((m: any) => m.role !== 'system').length : 0,
      });
    }
    return results;
  }

  async loadConversation(id: string): Promise<void> {
    if (!this.historyManager) return;

    // Save current conversation before switching
    if (this.conversation) {
      await this.historyManager.saveConversation(this.conversation);
    }

    const record = await this.historyManager.resumeConversation(id);
    if (!record) {
      this.client?.notifyError('Conversation not found.', 'history');
      return;
    }

    const core = await getCore();
    this.conversation = new core.Conversation(record.id);
    this.conversation.setMessages(record.messages);
    this.conversation.setSystemPrompt(await this.buildSystemPrompt());
    this.sessionAllowedTools.clear();
    this.sessionAllowAll = false;

    const replayMessages = this.buildReplayMessages(record.messages);
    this.client?.notifyConversationLoaded(record.id, record.title, replayMessages);
  }

  async deleteConversation(id: string): Promise<boolean> {
    if (!this.historyManager) return false;
    const result = await this.historyManager.deleteConversation(id);
    if (result) this.client?.notifyHistoryChanged();
    return result;
  }

  async renameConversation(id: string, newTitle: string): Promise<boolean> {
    if (!this.historyManager) return false;
    const result = await this.historyManager.renameConversation(id, newTitle);
    if (result) this.client?.notifyHistoryChanged();
    return result;
  }

  async pinConversation(id: string, pinned: boolean): Promise<boolean> {
    if (!this.historyManager) return false;
    const result = await this.historyManager.pinConversation(id, pinned);
    if (result) this.client?.notifyHistoryChanged();
    return result;
  }

  async exportConversation(id: string, format: 'json' | 'markdown'): Promise<string | null> {
    if (!this.historyManager) return null;
    return this.historyManager.exportConversation(id, format);
  }

  async importConversation(jsonData: string): Promise<string | null> {
    if (!this.historyManager) return null;

    try {
      const record = JSON.parse(jsonData);

      // Validate basic structure
      if (!record.messages || !Array.isArray(record.messages)) {
        this.client?.notifyError('Invalid session file: missing messages array.');
        return null;
      }

      // Generate fresh UUID to prevent collisions
      const newId = crypto.randomUUID();
      const core = await getCore();
      const conversation = new core.Conversation(newId);
      conversation.setMessages(record.messages);

      // Save with original metadata but new ID
      await this.historyManager.saveConversation(conversation);

      // Update the saved record's title if one was provided
      if (record.title) {
        await this.historyManager.renameConversation(newId, record.title);
      }

      this.client?.notifyHistoryChanged();
      return newId;
    } catch {
      this.client?.notifyError('Failed to import session: invalid JSON.');
      return null;
    }
  }

  async getReplayMessages(id: string): Promise<AvaReplayMessage[]> {
    if (!this.historyManager) return [];
    const record = await this.historyManager.resumeConversation(id);
    if (!record) return [];
    return this.buildReplayMessages(record.messages);
  }

  private buildReplayMessages(messages: any[]): AvaReplayMessage[] {
    const result: AvaReplayMessage[] = [];
    // Build a map of tool_call_id → result content for pairing
    const toolResults = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.tool_call_id) {
        const content = typeof msg.content === 'string' ? msg.content : '';
        toolResults.set(msg.tool_call_id, content.slice(0, 2000));
      }
    }

    let index = 0;
    for (const msg of messages) {
      if (msg.role === 'system') continue;
      if (msg.role === 'tool') continue; // tool results are attached to assistant messages

      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
          : msg.content ?? '';

      const replay: AvaReplayMessage = {
        index,
        role: msg.role,
        content,
      };

      // Attach thinking content for assistant messages
      if (msg.role === 'assistant' && msg.reasoning_content) {
        replay.thinking = msg.reasoning_content;
      }

      // Attach tool calls with their results
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        replay.toolCalls = msg.tool_calls.map((tc: any) => ({
          name: tc.function?.name ?? tc.name ?? 'unknown',
          arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? {}),
          result: toolResults.get(tc.id),
        }));
      }

      result.push(replay);
      index++;
    }

    return result;
  }

  // ── Git integration (Phase 3) ────────────────────────────────────────────────

  async getGitStagedDiff(): Promise<string | null> {
    return this.execGit(['diff', '--cached']);
  }

  async getGitWorkingDiff(): Promise<string | null> {
    return this.execGit(['diff']);
  }

  async getGitBranch(): Promise<string | null> {
    return this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  async getGitLog(count?: number): Promise<string | null> {
    return this.execGit(['log', '--oneline', `-${count ?? 20}`]);
  }

  private execGit(args: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      execFile('git', args, { cwd: this.getCwd(), timeout: 30_000, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
          resolve(null);
          return;
        }
        let output = stdout || '';
        if (stderr) output += (output ? '\n' : '') + stderr;
        resolve(output.trim() || null);
      });
    });
  }

  private httpPost(urlStr: string, apiKey: string, body: string): Promise<string | null> {
    return new Promise((resolve) => {
      const url = new URL(urlStr);
      const req = https.request(
        {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk: string) => (raw += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(raw);
              resolve(data.choices?.[0]?.text ?? null);
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on('error', () => resolve(null));
      req.write(body);
      req.end();
    });
  }

  private httpPostRaw(urlStr: string, apiKey: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const req = https.request(
        {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 15_000,
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk: string) => (raw += chunk));
          res.on('end', () => {
            if ((res.statusCode ?? 0) >= 400) {
              reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
            } else {
              resolve(raw);
            }
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
      req.write(body);
      req.end();
    });
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private platformApiFetch(path: string, platformKey: string): Promise<{ ok: boolean; status: number; data: any }> {
    return new Promise((resolve) => {
      const url = new URL(PLATFORM_API + path);
      const req = https.request(
        {
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${platformKey}`,
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk: string) => (raw += chunk));
          res.on('end', () => {
            try {
              resolve({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0, data: JSON.parse(raw) });
            } catch {
              resolve({ ok: (res.statusCode ?? 0) < 400, status: res.statusCode ?? 0, data: raw });
            }
          });
        },
      );
      req.on('error', () => resolve({ ok: false, status: 0, data: null }));
      req.end();
    });
  }

  private async tryFallback(messages: any[], onEvent: (event: any) => void, signal: AbortSignal): Promise<boolean> {
    if (!this.providerRegistry || !this.activeModelDef) return false;

    const currentProvider = this.activeModelDef.provider;
    const providerNames = ['deepseek', 'kimi', 'qwen'] as const;

    for (const name of providerNames) {
      if (name === currentProvider) continue;
      const provider = this.providerRegistry.get(name);
      if (!provider) continue;

      const models = provider.listModels();
      if (models.length === 0) continue;

      try {
        const core = await getCore();
        const fallbackAgent = new core.Agent({
          provider,
          model: models[0],
          toolRegistry: this.toolRegistry!,
          cwd: this.getCwd(),
        });

        this.client?.notifyProviderFallback(currentProvider, name);

        const updatedMessages = await fallbackAgent.run(messages, onEvent, signal);
        this.conversation?.setMessages(updatedMessages);

        if (this.historyManager && this.conversation) {
          await this.historyManager.saveConversation(this.conversation);
        }

        return true;
      } catch {
        // This fallback also failed — try next
        continue;
      }
    }

    return false;
  }

  private async reloadProviders(): Promise<void> {
    const core = await getCore();
    const config = await this.configManager!.load();

    // Re-create provider registry from scratch
    this.providerRegistry = new core.ProviderRegistry();
    const providerNames = ['deepseek', 'kimi', 'qwen'] as const;
    for (const name of providerNames) {
      const settings = config.providers[name];
      if (settings?.apiKey) {
        try {
          this.providerRegistry.register(name, { apiKey: settings.apiKey, baseUrl: settings.baseUrl });
        } catch (err) {
          console.error(`[ava-agent] Provider ${name} failed to register:`, err);
        }
      }
    }

    // Register platform provider if key exists
    if (config.platformKey) {
      try {
        const platformProvider = new core.PlatformProvider({ apiKey: config.platformKey });
        this.providerRegistry.registerCustom('platform', platformProvider);
      } catch (err) {
        console.error('[ava-agent] Platform provider failed to register:', err);
      }
    }

    // Resolve active model or auto-select first available
    let resolved = config.activeModel
      ? this.providerRegistry.resolveModel(config.activeModel)
      : undefined;

    if (!resolved) {
      const allModels = this.providerRegistry.listAllModels();
      if (allModels.length > 0) {
        const first = allModels[0];
        resolved = this.providerRegistry.resolveModel(`${first.provider}:${first.id}`) ?? undefined;
        if (resolved) {
          await this.configManager!.set('activeModel', `${first.provider}:${first.id}`);
          await this.configManager!.save();
        }
      }
    }

    if (resolved) {
      await this.setupAgent(core, resolved.provider, resolved.model);
    } else {
      this.agent = undefined;
      this.activeModelDef = undefined;
    }

    // Build refreshed state
    const models = this.providerRegistry.listAllModels().map((m: any) => ({
      id: `${m.provider}:${m.id}`,
      name: m.name,
      provider: m.provider,
      ...(m.supportsVision ? { supportsVision: true } : {}),
    }));

    const activeModel = this.activeModelDef
      ? `${this.activeModelDef.provider}:${this.activeModelDef.id}`
      : null;

    const providerKeys: AvaProviderKeyStatus = {
      deepseek: Boolean(config.providers.deepseek?.apiKey),
      kimi: Boolean(config.providers.kimi?.apiKey),
      qwen: Boolean(config.providers.qwen?.apiKey),
    };

    // Fire notifications — both panels sync through the shared client
    this.client?.notifyProviderKeysChanged(providerKeys);
    this.client?.notifyModelsRefreshed(models, activeModel, !activeModel);
  }

  private async setupAgent(core: CoreModule, provider: any, model: any): Promise<void> {
    this.toolRegistry = new core.ToolRegistry();
    this.toolRegistry.registerBuiltins();
    this.toolRegistry.setPermissionMode('balanced');

    this.toolRegistry.setConfirmationHandler(
      (toolName: string, args: Record<string, unknown>) => this.requestConfirmation(toolName, args),
    );

    this.activeModelDef = model;

    if (!this.conversation) {
      this.conversation = new core.Conversation();
      this.conversation.setSystemPrompt(await this.buildSystemPrompt());
    }

    this.agent = new core.Agent({
      provider,
      model,
      toolRegistry: this.toolRegistry,
      cwd: this.getCwd(),
      sharedState: { memoryManager: this.memoryManager },
    });
  }

  private async buildSystemPrompt(): Promise<string> {
    if (!_core) return '';

    // Load project instructions from .ava/instructions.md
    const projectRoot = _core.detectProjectRoot(this.getCwd());
    let projectInstructions: string | undefined;
    if (projectRoot) {
      projectInstructions = (await _core.loadProjectInstructions(projectRoot)) ?? undefined;
    }

    // Load persistent memory (pass project instructions as context for episodic retrieval)
    const memory = (await this.memoryManager?.loadAll(projectInstructions)) || undefined;

    return _core.buildSystemPrompt({
      cwd: this.getCwd(),
      platform: process.platform,
      shell: 'bash',
      permissionMode: 'balanced',
      supportsVision: this.activeModelDef?.supportsVision,
      projectInstructions,
      memory,
      userName: this.cachedUserName,
      isAdmin: this.cachedIsAdmin,
    });
  }

  private requestConfirmation(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<boolean | string> {
    // Auto-approve if in session allow list (never skip present_plan or ask_user)
    if (toolName !== 'present_plan' && toolName !== 'ask_user'
      && (this.sessionAllowAll || this.sessionAllowedTools.has(toolName))) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const confirmationId = crypto.randomUUID();
      this.pendingConfirmations.set(confirmationId, { resolve, toolName });

      this.client?.notifyToolConfirmationRequest(
        confirmationId,
        toolName,
        args,
        this.formatToolSummary(toolName, args),
        toolName === 'ask_user',
      );
    });
  }

  private applyModePrefix(text: string, mode: AvaMode): string {
    switch (mode) {
      case 'plan':
        return `[Plan Mode] Analyze the codebase and create a structured plan for the following request. You may read files and search the codebase to understand context. Do NOT write files, edit files, or execute commands — only output a detailed plan.\n\n${text}`;
      case 'chat':
        return `[Chat Mode] Respond conversationally. Do not use any tools — just discuss, explain, or brainstorm.\n\n${text}`;
      case 'security':
        return _core
          ? _core.getSecurityModePrefix(text || 'Perform a comprehensive security audit of this project.')
          : text;
      default:
        return text;
    }
  }

  private formatToolSummary(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
      case 'bash':
        return `Execute: ${String(args.command ?? '').slice(0, 100)}`;
      case 'file_write':
        return `Write to ${args.file_path}`;
      case 'file_edit':
        return `Edit ${args.file_path}`;
      case 'present_plan':
        return `Plan: ${String(args.title ?? 'Untitled')}`;
      case 'ask_user':
        return String(args.question ?? 'Question');
      case 'list_directory':
        return `List ${args.path}`;
      case 'web_search':
        return `Search: ${String(args.query ?? '').slice(0, 80)}`;
      case 'git_status':
        return `git ${args.command}${args.args ? ' ' + String(args.args).slice(0, 60) : ''}`;
      case 'http_request':
        return `${args.method ?? 'GET'} ${String(args.url ?? '').slice(0, 80)}`;
      default:
        return `${toolName}: ${JSON.stringify(args).slice(0, 100)}`;
    }
  }
}
