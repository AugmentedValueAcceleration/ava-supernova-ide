/**
 * Sidecar Manager — Spawns and communicates with the @ava/core Node.js sidecar.
 *
 * Uses @tauri-apps/plugin-shell to run a Node.js process that hosts the full
 * agent engine (60+ tools, personas, memory) locally. Communication is NDJSON
 * over stdin (commands) / stdout (events).
 */

import { Command, type Child } from '@tauri-apps/plugin-shell';
import { resolveResource } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DesktopAutomationSettings {
  enabled: boolean;
  allowedApps: string[];
  permission: 'view_only' | 'navigate' | 'full' | 'restricted';
  confirmMode: 'every_action' | 'first_per_app' | 'session' | 'never';
  maxSteps: number;
  actionDelay: number;
  logActions: boolean;
  inactivityTimeout: number;
  blockDangerous: boolean;
}

export interface SidecarConfig {
  providers: Record<string, { apiKey: string; baseUrl?: string }>;
  platformKey?: string;
  desktopAutomationSettings?: DesktopAutomationSettings;
  activeModel: string;
  cwd: string;
  mode?: string;
  permissionMode?: 'strict' | 'balanced' | 'autonomous';
  language?: string;
  autoMemory?: boolean;
  /** Truthy when the user's Data Mode resolves to local, or they've
   *  explicitly disabled generation sync. Gates creative-asset cloud
   *  upload inside the generate_* tools (mirrors the VS Code
   *  extension's `generationLocalOnly` in setupAgent sharedState). */
  generationLocalOnly?: boolean;
  /** Same pattern for the learning_* sync path — Data Mode local or
   *  per-category pref off means no cloud push from the tools. */
  learningLocalOnly?: boolean;
  /**
   * Local / custom OpenAI-compatible provider — Ollama, LM Studio, vLLM,
   * or any other server that speaks the OpenAI Chat Completions API. The
   * IDE Settings UI writes baseUrl + modelName into localStorage and
   * forwards them here so the sidecar can register a 'generic' provider
   * with a model definition matching what the user has running locally.
   */
  local?: {
    baseUrl: string;
    modelName: string;
    apiKey?: string;
    modelLabel?: string;
  };
  /** Opt-in local semantic recall (mirror of the extension's
   *  preferences.useLocalEmbeddings). Off/undefined → keyword recall, no
   *  dependency. When true the sidecar embeds memories on `embeddingModel`
   *  via `embeddingBaseUrl` (Ollama's OpenAI-compatible endpoint). */
  useLocalEmbeddings?: boolean;
  embeddingModel?: string;
  embeddingBaseUrl?: string;
}

export interface SidecarToolCall {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

export interface SidecarUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface SidecarEvent {
  event: string;
  /** Conversation lane this event belongs to — 'health' for the Ava Health
   *  & Fitness room, 'learning' for the Learning room (per-course thread),
   *  'main'/undefined for the main chat. The IDE's chat surfaces filter on
   *  this so they never cross-render. */
  lane?: 'main' | 'health' | 'learning';
  // stream events
  content?: string;
  // tool events
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: string;
  success?: boolean;
  metadata?: Record<string, unknown>;
  data?: string;
  // confirmation
  id?: string;
  // usage
  usage?: SidecarUsage;
  cost?: number;
  // context
  used?: number;
  limit?: number;
  percent?: number;
  // errors
  message?: string;
  // init
  model?: string;
  provider?: string;
  pid?: number;
  // mode
  mode?: string;
  // orchestration
  originalTokens?: number;
  compressedTokens?: number;
  droppedCount?: number;
  // desktop automation IPC
  requestId?: string;
  action?: string;
  text?: string;
  key?: string;
  window?: string;
  name?: string;
  settings?: DesktopAutomationSettings;
  // browser automation — browser_send forwarding
  browserAction?: string;
  params?: Record<string, unknown>;
  // vision lane — coordinate click for visually-located elements
  x?: number;
  y?: number;
  // input primitives — scroll + drag
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  endX?: number;
  endY?: number;
  // visual preview (Phase 0D) — highlight box geometry + duration
  w?: number;
  h?: number;
  ms?: number;
  // floating approval card (Phase 0F-2)
  title?: string;
  // desktop safety gate — richer payload on confirm_required events
  toolCategory?: string;
  desktopClassification?: {
    riskClass: 'observational' | 'navigational' | 'mutative-reversible' | 'mutative-irreversible' | 'privileged';
    reasons: string[];
    requiresSecretHandle: boolean;
  };
  // secret_grant_request — companion to secret_request tool. Sidecar
  // emits this when Ava asks for a credential; frontend prompts the
  // user and sends a secret_grant_response back.
  grantId?: string;
  label?: string;
  reason?: string;
  // health_profile_ask — structured profile-field card (goal cards, chips,
  // number box). The room resolves the control from HEALTH_PROFILE_FIELDS.
  profileField?: { field: string; question: string; currentValue?: unknown };
  // general_profile_saved / health_profile_saved — Ava saved a profile field
  // via the fill card; the renderer can refresh the profile pages.
  profile?: Record<string, unknown>;
  // local_models_detected — response to detect_local_models (Custom Model card).
  models?: string[];
  error?: string;
}

type EventListener = (event: SidecarEvent) => void;

// ─── Sidecar Manager ────────────────────────────────────────────────────────

export class SidecarManager {
  private child: Child | null = null;
  private listeners = new Map<string, Set<EventListener>>();
  private wildcardListeners = new Set<EventListener>();
  // Turn-in-flight tracker — true between a turn's start and its terminal
  // event, across any lane. Lets callers (e.g. the room handoff seed) wait for
  // the sidecar to be idle before sending, so a programmatic send isn't
  // swallowed as an interjection into a still-running turn.
  private busy = false;
  private ready = false;
  private sidecarPath: string = '';
  private isDev: boolean;
  // Resilience state — captures the last config passed to start() so
  // we can re-run init verbatim when the child dies unexpectedly.
  // intentionalStop flips true around stop() calls so the close handler
  // knows the user asked for it (don't respawn) vs a crash (respawn).
  private lastConfig: SidecarConfig | null = null;
  private intentionalStop = false;
  private respawnAttempts = 0;
  private static MAX_RESPAWN_ATTEMPTS = 3;
  private static RESPAWN_DELAY_MS = 600;

  constructor(sidecarPath?: string) {
    // Detect dev vs production: dev uses localhost URL, production uses tauri://
    this.isDev = window.location.hostname === 'localhost';
    if (sidecarPath) this.sidecarPath = sidecarPath;
  }

  private async resolveSidecarPath(): Promise<string> {
    if (this.sidecarPath) return this.sidecarPath;
    if (this.isDev) {
      // Dev: use local sidecar script relative to src-tauri/
      this.sidecarPath = '../sidecar/index.mjs';
    } else {
      // Production: use bundled resource
      this.sidecarPath = await resolveResource('resources/sidecar-bundle.mjs');
    }
    return this.sidecarPath;
  }

  get isRunning(): boolean {
    return this.child !== null;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /**
   * Start the sidecar process and send init config.
   */
  async start(config: SidecarConfig): Promise<void> {
    if (this.child) {
      await this.stop();
    }

    // Cache the config for auto-respawn after an unexpected close. Stored
    // on every start() so a model swap or workspace change updates what
    // we'd re-init with.
    this.lastConfig = config;
    this.ready = false;

    // Resolve the sidecar script path
    const scriptPath = await this.resolveSidecarPath();

    // Spawn node with the sidecar script
    // Dev: system node via "run-node" command
    // Production: bundled node.exe via Tauri sidecar API
    const command = this.isDev
      ? Command.create('run-node', [scriptPath])
      : Command.sidecar('binaries/node', [scriptPath]);

    // Listen for stdout (NDJSON events)
    command.stdout.on('data', (line: string) => {
      if (!line.trim()) return;
      console.log('[sidecar →]', line);
      try {
        const event: SidecarEvent = JSON.parse(line);
        if (event.event === 'ready') {
          this.ready = true;
          // Reset the respawn budget — a successful re-init means
          // we got back to a healthy state, so the NEXT crash gets a
          // fresh 3-attempt allowance instead of starting partway used.
          this.respawnAttempts = 0;
        }
        // Handle desktop automation requests from sidecar — invoke Tauri commands
        if (event.event === 'desktop_request' && event.requestId && event.action) {
          this.handleDesktopRequest(event);
        }
        this.emitEvent(event.event, event);
      } catch {
        // Non-JSON output (e.g., Node.js warnings)
      }
    });

    // Listen for stderr (errors, warnings) — redact potential secrets
    command.stderr.on('data', (line: string) => {
      const redacted = line.replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***').replace(/Bearer [^\s]+/g, 'Bearer ***');
      console.warn('[sidecar stderr]', redacted);
      this.emitEvent('stderr', { event: 'stderr', message: redacted });
    });

    // Listen for process close. Distinguishes intentional (user clicked
    // stop / called stop() / start() called us during a deliberate
    // restart) from unexpected death (crash, OOM, OS sleep/wake) and
    // auto-respawns the latter using the cached lastConfig. Without
    // this, a sidecar crash silently leaves the IDE talking to nothing
    // until the next "Not initialized" surfaces — which is exactly the
    // failure mode the user reported.
    command.on('close', (data) => {
      this.child = null;
      this.ready = false;
      const intentional = this.intentionalStop;
      this.emitEvent('close', { event: 'close', message: `Sidecar exited (code ${data.code ?? 'unknown'})` });
      if (intentional || !this.lastConfig) return;
      if (this.respawnAttempts >= SidecarManager.MAX_RESPAWN_ATTEMPTS) {
        this.emitEvent('error', { event: 'error', message: 'Sidecar crashed and exceeded auto-respawn budget. Reload the IDE to restart it.' });
        return;
      }
      this.respawnAttempts++;
      const delay = SidecarManager.RESPAWN_DELAY_MS * Math.pow(2, this.respawnAttempts - 1);
      this.emitEvent('info', { event: 'info', message: `Sidecar died unexpectedly — auto-respawning (attempt ${this.respawnAttempts}/${SidecarManager.MAX_RESPAWN_ATTEMPTS}, in ${delay}ms)…` });
      setTimeout(() => {
        const cfg = this.lastConfig;
        if (!cfg) return;
        this.start(cfg).catch((err) => {
          this.emitEvent('error', { event: 'error', message: `Auto-respawn failed: ${err instanceof Error ? err.message : String(err)}` });
        });
      }, delay);
    });

    command.on('error', (err: string) => {
      console.error('[sidecar error]', err);
      this.emitEvent('error', { event: 'error', message: err });
    });

    // Spawn the process
    this.child = await command.spawn();

    // Send init command
    await this.send({ cmd: 'init', config });

    // Wait for "ready" event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sidecar init timeout (15s)'));
      }, 15000);

      const handler = (event: SidecarEvent) => {
        if (event.event === 'ready') {
          clearTimeout(timeout);
          this.off('ready', handler);
          resolve();
        }
      };
      this.on('ready', handler);

      // Also handle early errors
      const errHandler = (event: SidecarEvent) => {
        if (event.event === 'error' && !this.ready) {
          clearTimeout(timeout);
          this.off('error', errHandler);
          reject(new Error(event.message || 'Sidecar init error'));
        }
      };
      this.on('error', errHandler);
    });
  }

  /**
   * Send a chat message to the agent.
   */
  async sendMessage(content: string, attachments?: { name: string; dataUri: string; mimeType: string }[], history?: { role: string; text: string }[], surface?: 'main' | 'health' | 'learning', courseId?: string): Promise<void> {
    // For large attachments (images), write to temp files to avoid stdin buffer limits
    let processedAttachments = attachments;
    if (attachments?.length) {
      processedAttachments = [];
      for (const att of attachments) {
        if (att.dataUri && att.dataUri.length > 100_000) {
          // Large attachment — write to temp file, pass path
          try {
            const tempPath = `${await import('@tauri-apps/api/path').then(p => p.tempDir())}ava-attach-${Date.now()}-${att.name}`;
            const base64Data = att.dataUri.replace(/^data:[^;]+;base64,/, '');
            const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            await import('@tauri-apps/plugin-fs').then(fs => fs.writeFile(tempPath, bytes));
            processedAttachments.push({ ...att, dataUri: `file://${tempPath}`, _tempFile: true } as any);
          } catch {
            // Fallback: send inline (may fail for very large images)
            processedAttachments.push(att);
          }
        } else {
          processedAttachments.push(att);
        }
      }
    }
    await this.send({ cmd: 'message', content, attachments: processedAttachments?.length ? processedAttachments : undefined, history: history?.length ? history : undefined, surface, courseId });
  }

  // ── Conversation history (the shared ~/.ava/.../history/*.json files) ────────
  // The sidecar reads/writes the SAME account-scoped transcripts the extension
  // + CLI use, so history carries across surfaces. Request/response over the
  // event stream; resolves a safe fallback on timeout so the UI never hangs.
  private requestHistory<T>(cmd: string, respEvent: string, extra: Record<string, unknown>, pick: (e: any) => T, fallback: T): Promise<T> {
    return new Promise<T>((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const handler = (event: SidecarEvent) => {
        clearTimeout(timer);
        this.off(respEvent, handler);
        try { resolve(pick(event)); } catch { resolve(fallback); }
      };
      timer = setTimeout(() => { this.off(respEvent, handler); resolve(fallback); }, 6000);
      this.on(respEvent, handler);
      this.send({ cmd, ...extra }).catch(() => { clearTimeout(timer); this.off(respEvent, handler); resolve(fallback); });
    });
  }

  async listHistory(query?: string): Promise<Array<{ id: string; title: string; updatedAt: string; pinned?: boolean; projectPath?: string }>> {
    return this.requestHistory('list_history', 'history_list', query ? { query } : {}, (e) => e.conversations ?? [], []);
  }

  async loadHistory(id: string): Promise<{ id: string; title: string; messages: unknown[] } | null> {
    return this.requestHistory('load_history', 'history_loaded', { id }, (e) => e.record ?? null, null);
  }

  async deleteHistory(id: string): Promise<void> { await this.send({ cmd: 'delete_history', id }).catch(() => { /* best-effort */ }); }
  async renameHistory(id: string, title: string): Promise<void> { await this.send({ cmd: 'rename_history', id, title }).catch(() => { /* best-effort */ }); }
  async pinHistory(id: string, pinned: boolean): Promise<void> { await this.send({ cmd: 'pin_history', id, pinned }).catch(() => { /* best-effort */ }); }

  async setWorkingHours(start: number, end: number): Promise<void> {
    await this.send({ cmd: 'set_working_hours', start, end });
  }

  /**
   * Soft interrupt — pause generation and ask Ava to check in.
   */
  async interrupt(): Promise<void> {
    await this.send({ cmd: 'interrupt' });
  }

  /**
   * Hard cancel — kill the current agent run completely.
   */
  async cancel(): Promise<void> {
    await this.send({ cmd: 'cancel' });
  }

  /**
   * Respond to a tool confirmation request.
   */
  async confirm(id: string, approved: boolean, response?: string, alwaysAllowCategory?: boolean): Promise<void> {
    await this.send({ cmd: 'confirm', id, approved, response, alwaysAllowCategory });
  }

  /**
   * Ask the sidecar to list the models an OpenAI-compatible endpoint serves
   * (GET /models). The result comes back as a `local_models_detected` event
   * ({ models, error }) — subscribe via `on('local_models_detected', …)`.
   * Done sidecar-side so localhost is reachable without the webview's CSP.
   */
  async detectLocalModels(baseUrl: string, apiKey?: string): Promise<void> {
    await this.send({ cmd: 'detect_local_models', baseUrl, apiKey });
  }

  /**
   * Respond to a secret_request grant prompt. Either grants with the
   * provided value (session-lived, cleared on new chat) or denies.
   * The sidecar's secret working set is in-memory only; the raw value
   * leaves the IDE only at tool execute time, via the argsPreprocessor
   * substitution of `{{secret:<id>}}` handles.
   */
  async respondToSecretGrant(grantId: string, value: string | null): Promise<void> {
    if (value === null) {
      await this.send({ cmd: 'secret_grant_response', grantId, deny: true });
    } else {
      await this.send({ cmd: 'secret_grant_response', grantId, value });
    }
  }

  /**
   * Clear conversation (new chat). Pass surface:'health' to clear only the
   * Ava Health room thread, or surface:'learning' (+ courseId) to clear one
   * course's Learning thread — both leave the main chat untouched.
   */
  async clear(surface?: 'main' | 'health' | 'learning', courseId?: string): Promise<void> {
    await this.send({ cmd: 'clear', surface, courseId });
  }

  /**
   * Inject a message mid-run (user interjection).
   */
  async inject(content: string): Promise<void> {
    await this.send({ cmd: 'inject', content });
  }

  /**
   * Switch mode.
   */
  async setMode(mode: string): Promise<void> {
    await this.send({ cmd: 'set_mode', mode });
  }

  /**
   * Creative Studio dataset capture (Phase 3). The renderer generates via the
   * platform API directly, so it reports the generation to the sidecar (which
   * owns the dataset consumer). `assetId` links a later user action back to it.
   * Shape-only — never the prompt is stored, only a word-count signature in core.
   */
  async trackCreativeGeneration(opts: {
    assetId: string;
    genType: 'image' | 'music' | 'voice' | 'video';
    model: string;
    prompt: string;
    paramsSummary: string;
    success: boolean;
  }): Promise<void> {
    await this.send({ cmd: 'creative_generation', ...opts });
  }

  /** Report what the user did with a generated asset (kept/retried/discarded). */
  async creativeUserAction(assetId: string, action: 'kept' | 'retried' | 'discarded' | 'edited'): Promise<void> {
    await this.send({ cmd: 'creative_user_action', assetId, action });
  }

  /**
   * Switch model (hot-swap without restart).
   */
  async setModel(model: string): Promise<void> {
    await this.send({ cmd: 'set_model', model });
  }

  /**
   * Update the desktop permission level mid-session. Triggers a system
   * prompt rebuild on the sidecar so the level Ava reads matches the one
   * the operator set. 'watch' = approve the task once up front, then Ava
   * runs it; 'drive' = no up-front card; irreversibles always re-prompt
   * in both.
   */
  async setDesktopPermissionLevel(level: 'watch' | 'drive'): Promise<void> {
    await this.send({ cmd: 'set_desktop_permission_level', level });
  }

  /** Perception setting (Phase C3): off = never capture the screen; local =
   *  on-device vision only (Private); cloud = account/BYOK Holo (Fast). */
  async setDesktopVisionMode(mode: 'off' | 'local' | 'cloud'): Promise<void> {
    await this.send({ cmd: 'set_desktop_vision_mode', mode });
  }

  /** One-time download of the on-device vision model (Private lane).
   *  Progress arrives as local_vision_download_progress/_done/_error events. */
  async downloadLocalVisionModel(): Promise<void> {
    await this.send({ cmd: 'download_local_vision_model' });
  }

  /**
   * Update the enabled knowledge pack list mid-session. Triggers a
   * system prompt rebuild on the sidecar so Ava picks up newly-enabled
   * packs (or drops disabled ones) without a restart. Mirrors the
   * set_mode / set_desktop_permission_level pattern.
   */
  async setKnowledgePacks(packIds: string[]): Promise<void> {
    await this.send({ cmd: 'set_knowledge_packs', packIds });
  }

  /**
   * Ask the sidecar to format the audit log as a Markdown or JSON
   * bundle. The bundle comes back as an `audit_export_ready` event
   * carrying `{ filename, content, format, mimeType }` so the caller
   * can open a save dialog.
   */
  async exportAuditLog(format: 'markdown' | 'json'): Promise<void> {
    await this.send({ cmd: 'export_audit_log', format });
  }

  /**
   * Clear all memory in the sidecar and reset the memory manager.
   */
  async clearMemory(): Promise<void> {
    await this.send({ cmd: 'clear_memory' });
  }

  /** Authoritative memory list from the sidecar's MemoryManager (the v3 graph,
   *  global + project scopes) — the SAME source the extension reads. Resolves
   *  with the entries from the one-shot `memories` event. Local-only. */
  async getMemories(timeoutMs = 8000): Promise<any[]> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (entries: any[]) => { if (done) return; done = true; this.offAny(handler); clearTimeout(timer); resolve(entries); };
      const handler = (event: SidecarEvent) => {
        if (event.event === 'memories') finish(Array.isArray((event as any).entries) ? (event as any).entries : []);
      };
      const timer = setTimeout(() => finish([]), timeoutMs);
      this.onAny(handler);
      this.send({ cmd: 'get_memories' }).catch(() => finish([]));
    });
  }

  /** Delete one memory by id + scope, through the MemoryManager (keeps the v3
   *  graph authoritative). Local-only — never touches the cloud. */
  async deleteMemory(id: string | number, scope: 'global' | 'project'): Promise<void> {
    await this.send({ cmd: 'delete_memory', id, scope });
  }

  /** Data sovereignty — seal everything under ~/.ava. Result arrives as a
   *  `backup_ready` event carrying the envelope, for the Tauri save dialog. */
  async exportBackup(passphrase: string): Promise<void> {
    await this.send({ cmd: 'export_backup', passphrase });
  }

  /** Plain-JSON snapshot of local data. Arrives as a `readable_ready` event. */
  async exportReadable(): Promise<void> {
    await this.send({ cmd: 'export_readable' });
  }

  /** Restore an encrypted .ava-backup. Result arrives as `backup_imported`. */
  async importBackup(content: string, passphrase: string, overwrite?: boolean): Promise<void> {
    await this.send({ cmd: 'import_backup', content, passphrase, overwrite: !!overwrite });
  }

  /**
   * Update the sidecar's working directory when user opens a new project folder.
   */
  async setWorkingDirectory(cwd: string): Promise<void> {
    await this.send({ cmd: 'set_cwd', cwd });
  }

  async setPermission(mode: 'strict' | 'balanced' | 'autonomous' | 'custom'): Promise<void> {
    await this.send({ cmd: 'set_permission', mode });
  }

  async setCategoryPermission(category: string, permission: string): Promise<void> {
    await this.send({ cmd: 'set_category_permission', category, permission });
  }

  async getAuditLog(): Promise<void> {
    await this.send({ cmd: 'get_audit_log' });
  }

  async getCategoryPermissions(): Promise<void> {
    await this.send({ cmd: 'get_category_permissions' });
  }

  /**
   * Update desktop automation settings on the live sidecar.
   */
  async updateDesktopAutomationSettings(settings: DesktopAutomationSettings): Promise<void> {
    await this.send({ cmd: 'update_desktop_automation_settings', settings });
  }

  /**
   * Handle desktop_request from sidecar — invoke Tauri Rust commands for
   * UIA-based automation (no pixel coords) and browser automation.
   */
  private async handleDesktopRequest(event: SidecarEvent): Promise<void> {
    const { requestId, action } = event;
    try {
      let result: unknown;
      switch (action) {
        case 'type_text':
          await invoke('type_text', { text: event.text });
          result = 'ok';
          break;
        case 'key_press':
          await invoke('key_press', { key: event.key });
          result = 'ok';
          break;
        case 'list_ui_elements':
          result = await invoke('list_ui_elements');
          break;
        case 'get_foreground_window_title':
          result = await invoke('get_foreground_window_title');
          break;
        case 'list_windows':
          result = await invoke('list_windows');
          break;
        case 'find_ui_element':
          result = await invoke('find_ui_element', { name: event.name ?? event.text });
          break;
        case 'click_element':
          result = await invoke('click_element', { name: event.name ?? event.text });
          break;
        case 'focus_window':
          result = await invoke('focus_window', { name: event.name ?? event.text });
          break;
        // ── Vision lane (Phase C3) — screenshot for visual grounding +
        // coordinate click for visually-located elements.
        case 'capture_screen':
          result = await invoke('capture_screen');
          break;
        case 'click':
          result = await invoke('click', { x: event.x, y: event.y });
          break;
        case 'double_click':
          await invoke('double_click', { x: event.x, y: event.y });
          result = 'ok';
          break;
        case 'right_click':
          await invoke('right_click', { x: event.x, y: event.y });
          result = 'ok';
          break;
        case 'scroll':
          await invoke('scroll', { direction: event.direction, amount: event.amount });
          result = 'ok';
          break;
        case 'drag':
          await invoke('drag', { x: event.x, y: event.y, endX: event.endX, endY: event.endY });
          result = 'ok';
          break;
        // ── Visual preview (Phase 0D) — flash a click-through highlight box on
        // the target before Ava acts in Drive. Blocks ~ms; the click follows.
        case 'highlight_rect':
          await invoke('highlight_rect', {
            x: event.x, y: event.y, w: event.w, h: event.h, ms: event.ms,
          });
          result = 'ok';
          break;
        // ── Reveal the desktop (Phase 0E) — minimize all windows so desktop
        // icons become visible + clickable.
        case 'minimize_all':
          await invoke('minimize_all');
          result = 'ok';
          break;
        // ── Floating approval card (Phase 0F-2) — native always-on-top
        // Yes/No for mid-run irreversible confirms; the IDE stays minimized.
        case 'native_confirm':
          result = { approved: await invoke<boolean>('native_confirm', {
            title: event.title ?? 'Ava — approval needed',
            message: event.message ?? '',
          }) };
          break;

        // ── Browser automation — Playwright-backed headed Chromium driven
        // through Rust. Lives alongside UIA so the desktop agent can drive
        // either the OS or a visible browser inside the same loop.
        case 'launch_app':
          result = await invoke('launch_app', { name: event.name ?? event.text });
          break;
        case 'browser_launch':
          result = await invoke('browser_launch');
          break;
        case 'browser_send':
          result = await invoke('browser_send', {
            action: event.browserAction,
            params: event.params,
          });
          break;
        case 'browser_close':
          result = await invoke('browser_close');
          break;

        default:
          throw new Error(`Unknown desktop action: ${action}`);
      }
      await this.send({ cmd: 'desktop_response', requestId, result });
    } catch (err) {
      await this.send({
        cmd: 'desktop_response',
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Stop the sidecar process.
   */
  async stop(): Promise<void> {
    if (this.child) {
      // Tell the close handler this was deliberate so it doesn't trigger
      // the auto-respawn loop. Cleared in the close handler after read.
      this.intentionalStop = true;
      try {
        await this.child.kill();
      } catch { /* already dead */ }
      this.child = null;
      this.ready = false;
      // Reset the flag in case the close event lagged or never fires.
      setTimeout(() => { this.intentionalStop = false; }, 100);
    }
  }

  // ─── Event System ───────────────────────────────────────────────────────

  /**
   * Listen for a specific event type.
   */
  on(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Listen for ALL events (wildcard).
   */
  onAny(listener: EventListener): void {
    this.wildcardListeners.add(listener);
  }

  /**
   * Remove a listener.
   */
  off(event: string, listener: EventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  /**
   * Remove a wildcard listener.
   */
  offAny(listener: EventListener): void {
    this.wildcardListeners.delete(listener);
  }

  /**
   * Remove all listeners.
   */
  removeAllListeners(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private async send(data: Record<string, unknown>): Promise<void> {
    if (!this.child) {
      throw new Error('Sidecar not running');
    }
    const payload = JSON.stringify(data) + '\n';
    await this.child.write(payload);
  }

  /** Resolves once no turn is in flight (immediately if already idle). Used by
   *  programmatic sends (the room handoff seed) so they run as their own turn
   *  instead of being injected into a still-streaming one. Times out as a
   *  safety net if a terminal event never arrives. */
  waitForIdle(timeoutMs = 20000): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; this.wildcardListeners.delete(probe); clearTimeout(timer); resolve(); };
      const probe: EventListener = () => { if (!this.busy) finish(); };
      const timer = setTimeout(finish, timeoutMs);
      this.wildcardListeners.add(probe);
    });
  }

  private emitEvent(type: string, event: SidecarEvent): void {
    // Track turn lifecycle so waitForIdle() can tell when the sidecar is free.
    if (type === 'stream_start' || type === 'auto_agent_start' || type === 'orchestration_start') this.busy = true;
    else if (type === 'done' || type === 'stopped' || type === 'cancelled' || type === 'error') this.busy = false;
    // Typed listeners
    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const fn of listeners) {
        try { fn(event); } catch (err) { console.error('[sidecar listener error]', err); }
      }
    }
    // Wildcard listeners
    for (const fn of this.wildcardListeners) {
      try { fn(event); } catch (err) { console.error('[sidecar listener error]', err); }
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: SidecarManager | null = null;

export function getSidecar(): SidecarManager {
  if (!instance) {
    instance = new SidecarManager();
  }
  return instance;
}
