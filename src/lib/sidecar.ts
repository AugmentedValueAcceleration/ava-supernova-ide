/**
 * Sidecar Manager — Spawns and communicates with the @ava/core Node.js sidecar.
 *
 * Uses @tauri-apps/plugin-shell to run a Node.js process that hosts the full
 * agent engine (54 tools, personas, memory) locally. Communication is NDJSON
 * over stdin (commands) / stdout (events).
 */

import { Command, type Child } from '@tauri-apps/plugin-shell';
import { resolveResource } from '@tauri-apps/api/path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SidecarConfig {
  providers: Record<string, { apiKey: string; baseUrl?: string }>;
  platformKey?: string;
  activeModel: string;
  cwd: string;
  mode?: string;
  permissionMode?: 'strict' | 'balanced' | 'autonomous';
  language?: string;
  autoMemory?: boolean;
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
  // stream events
  content?: string;
  // tool events
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: string;
  success?: boolean;
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
}

type EventListener = (event: SidecarEvent) => void;

// ─── Sidecar Manager ────────────────────────────────────────────────────────

export class SidecarManager {
  private child: Child | null = null;
  private listeners = new Map<string, Set<EventListener>>();
  private wildcardListeners = new Set<EventListener>();
  private ready = false;
  private sidecarPath: string = '';
  private isDev: boolean;

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

    // Listen for process close
    command.on('close', (data) => {
      this.child = null;
      this.ready = false;
      this.emitEvent('close', { event: 'close', message: `Sidecar exited (code ${data.code ?? 'unknown'})` });
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
  async sendMessage(content: string, attachments?: { name: string; dataUri: string; mimeType: string }[], history?: { role: string; text: string }[]): Promise<void> {
    await this.send({ cmd: 'message', content, attachments: attachments?.length ? attachments : undefined, history: history?.length ? history : undefined });
  }

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
  async confirm(id: string, approved: boolean, response?: string): Promise<void> {
    await this.send({ cmd: 'confirm', id, approved, response });
  }

  /**
   * Clear conversation (new chat).
   */
  async clear(): Promise<void> {
    await this.send({ cmd: 'clear' });
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
   * Switch model (hot-swap without restart).
   */
  async setModel(model: string): Promise<void> {
    await this.send({ cmd: 'set_model', model });
  }

  /**
   * Clear all memory in the sidecar and reset the memory manager.
   */
  async clearMemory(): Promise<void> {
    await this.send({ cmd: 'clear_memory' });
  }

  /**
   * Stop the sidecar process.
   */
  async stop(): Promise<void> {
    if (this.child) {
      try {
        await this.child.kill();
      } catch { /* already dead */ }
      this.child = null;
      this.ready = false;
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

  private emitEvent(type: string, event: SidecarEvent): void {
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
