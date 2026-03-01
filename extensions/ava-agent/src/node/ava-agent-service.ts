/**
 * Backend service for the Ava agent panel.
 * Runs in Node.js, orchestrates @ava/core (Agent, providers, tools, config).
 * Communicates with the frontend widget via JSON-RPC notifications.
 */
import { injectable } from '@theia/core/shared/inversify';
import * as crypto from 'node:crypto';
import * as https from 'node:https';
import {
  IAvaAgentService,
  IAvaAgentClient,
  AvaInitState,
  AvaMode,
  AvaAccountInfo,
  AvaDashboardState,
  AvaDashboardSettings,
  AvaProviderKeyStatus,
} from '../common/ava-agent-protocol';

const PLATFORM_API = 'https://ava-supernova.com/api';

// @ava/core is ESM — use dynamic import hidden from webpack's static analysis.
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
type CoreModule = typeof import('@ava/core');
let _core: CoreModule | null = null;
async function getCore(): Promise<CoreModule> {
  if (!_core) {
    _core = await dynamicImport('@ava/core');
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

  // Run state
  private isRunning = false;
  private runAbortController: AbortController | undefined;
  private pendingConfirmations = new Map<string, { resolve: (result: boolean | string) => void; toolName: string }>();
  private sessionAllowedTools = new Set<string>();
  private sessionAllowAll = false;

  setClient(client: IAvaAgentClient | undefined): void {
    this.client = client;
  }

  // ── IAvaAgentService implementation ─────────────────────────────────────────

  async initialize(): Promise<AvaInitState> {
    const core = await getCore();

    // Load config from ~/.ava/config.json (same as CLI)
    this.configManager = new core.ConfigManager();
    const config = await this.configManager.load();

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

    // Resolve active model
    const activeModelId = config.activeModel || '';
    const resolved = this.providerRegistry.resolveModel(activeModelId);

    if (resolved) {
      this.setupAgent(core, resolved.provider, resolved.model);
    }

    // Initialize history
    const projectRoot = core.detectProjectRoot(process.cwd()) ?? undefined;
    this.historyManager = new core.HistoryManager(projectRoot);
    this.historyManager.init();

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
        case 'tool_call_end':
          this.client?.notifyToolCallEnd(event.toolCall.id, event.result, event.success);
          break;
        case 'usage':
          this.client?.notifyUsage({
            prompt_tokens: event.usage.prompt_tokens,
            completion_tokens: event.usage.completion_tokens,
            total_tokens: event.usage.total_tokens,
            cost: event.cost,
          });
          break;
        case 'error': {
          const msg = event.error?.humanMessage || event.error?.message || String(event.error);
          this.client?.notifyError(msg);
          break;
        }
        case 'context_truncated':
          this.client?.notifyError(
            `Context window full — ${event.droppedCount} older messages were dropped.`,
            'context_truncated',
            'Start a new chat for best results.',
          );
          break;
        case 'done':
          this.client?.notifyDone();
          break;
      }
    };

    try {
      const updatedMessages = await this.agent.run(
        this.conversation.getMessages(),
        onEvent,
        this.runAbortController.signal,
      );
      this.conversation.setMessages(updatedMessages);

      if (this.historyManager) {
        await this.historyManager.saveConversation(this.conversation);
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
        const msg = error?.humanMessage || error?.message || String(error);
        this.client?.notifyError(msg);
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
    this.setupAgent(core, resolved.provider, resolved.model);

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
    this.conversation.setSystemPrompt(this.buildSystemPrompt());
    this.sessionAllowedTools.clear();
    this.sessionAllowAll = false;

    this.client?.notifyChatCleared();
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
    };

    const models = this.providerRegistry
      ? this.providerRegistry.listAllModels().map((m: any) => ({
          id: `${m.provider}:${m.id}`,
          name: m.name,
          provider: m.provider,
          ...(m.supportsVision ? { supportsVision: true } : {}),
        }))
      : [];

    // Fetch account info if platform key is stored
    let account: AvaAccountInfo | null = null;
    const platformKey = (config as any).platformKey;
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
        }
        // If key is invalid, account stays null — user sees connect page
      } catch {
        // Network error — silently ignore, account stays null
      }
    }

    return {
      providerKeys,
      settings,
      platformKeyConnected: Boolean(account),
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
    config.preferences = {
      ...config.preferences,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      language: settings.language,
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

    const core = await getCore();
    if (!this.configManager) {
      this.configManager = new core.ConfigManager();
      await this.configManager.load();
    }
    const config = await this.configManager.load();
    (config as any).platformKey = key;
    await this.configManager.save();

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
    delete (config as any).platformKey;
    await this.configManager.save();
    this.client?.notifyPlatformAccountChanged(false, null);
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
      this.setupAgent(core, resolved.provider, resolved.model);
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

  private setupAgent(core: CoreModule, provider: any, model: any): void {
    this.toolRegistry = new core.ToolRegistry();
    this.toolRegistry.registerBuiltins();
    this.toolRegistry.setPermissionMode('balanced');

    this.toolRegistry.setConfirmationHandler(
      (toolName: string, args: Record<string, unknown>) => this.requestConfirmation(toolName, args),
    );

    this.activeModelDef = model;

    if (!this.conversation) {
      this.conversation = new core.Conversation();
      this.conversation.setSystemPrompt(this.buildSystemPrompt());
    }

    this.agent = new core.Agent({
      provider,
      model,
      toolRegistry: this.toolRegistry,
      cwd: process.cwd(),
    });
  }

  private buildSystemPrompt(): string {
    // This will be called after getCore() has been called at least once
    if (!_core) return '';
    return _core.buildSystemPrompt({
      cwd: process.cwd(),
      platform: process.platform,
      shell: 'bash',
      permissionMode: 'balanced',
      supportsVision: this.activeModelDef?.supportsVision,
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
