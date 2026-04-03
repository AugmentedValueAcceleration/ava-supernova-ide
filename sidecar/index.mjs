#!/usr/bin/env node

/**
 * Ava | Supernova IDE — Node.js Sidecar
 *
 * Runs @ava/core locally, communicating with the Tauri frontend
 * via NDJSON over stdin (commands) / stdout (events).
 *
 * Protocol:
 *   IDE → Sidecar:  { "cmd": "init"|"message"|"cancel"|"confirm"|"set_model"|"set_mode"|"clear"|"inject", ... }
 *   Sidecar → IDE:  { "event": "ready"|"stream_delta"|"tool_call_start"|..., ... }
 */

import { createInterface } from 'node:readline';
import { platform } from 'node:os';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// ─── Resolve @ava/core ──────────────────────────────────────────────────────
// In monorepo: workspace link. Standalone: relative path fallback.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from sidecar directory (dev) or next to the bundle (prod)
try {
  const envPath = join(__dirname, '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.replace(/\r/g, '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch { /* no .env file — that's fine */ }

let core;
try {
  core = await import('@ava/core');
} catch {
  // Fallback: resolve from monorepo structure (packages/ide/sidecar → packages/core/dist)
  const corePath = join(__dirname, '..', '..', 'core', 'dist', 'index.js');
  core = await import(`file://${corePath.replace(/\\/g, '/')}`);
}

const {
  Agent,
  Conversation,
  ToolRegistry,
  ProviderRegistry,
  PlatformProvider,
  MemoryManager,
  TaskManager,
  JournalManager,
  CheckpointManager,
  buildSystemPrompt,
  buildPersonalityPrefix,
  loadPersonality,
  AVA_HOME,
  PlatformMemorySync,
  ProviderHealthTracker,
  ResilientProvider,
  Conductor,
  AutoCoordinator,
  MemoryAgent,
  ProjectIndexer,
  BriefingEngine,
  detectProjectRoot,
  loadProjectInstructions,
  setLocale,
  resolveLocale,
} = core;

// ─── State ──────────────────────────────────────────────────────────────────

let agent = null;
let conductor = null;
let autoCoordinator = null;
let conversation = null;
let toolRegistry = null;
let memoryManager = null;
let journalManager = null;
let memoryAgentInstance = null;
let currentAbort = null;
let currentMode = 'work';
let isRunning = false;

/** Map<confirmId, { resolve: Function }> */
const pendingConfirmations = new Map();

/** Map<requestId, { resolve: Function, reject: Function }> for computer use requests */
const pendingComputerUse = new Map();
let computerUseRequestId = 0;

/**
 * Send a computer use command to Tauri frontend and wait for the response.
 * The frontend calls the Tauri Rust command and sends back the result.
 */
function computerUseRequest(action, args = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `cu_${++computerUseRequestId}`;
    const timeout = setTimeout(() => {
      pendingComputerUse.delete(requestId);
      reject(new Error(`Computer use request timed out: ${action}`));
    }, 15000); // 15s timeout for any single action

    pendingComputerUse.set(requestId, {
      resolve: (result) => { clearTimeout(timeout); resolve(result); },
      reject: (err) => { clearTimeout(timeout); reject(err); },
    });

    emit({ event: 'computer_use_request', requestId, action, ...args });
  });
}

/** Bridge providers for ComputerUseTool — delegates to Tauri via NDJSON */
const screenshotBridge = {
  async capture() {
    const result = await computerUseRequest('capture_screen');
    const data = result.data;
    // New format returns { image, width, height }
    if (data && typeof data === 'object' && data.image) {
      // Always update dimensions (monitors can change)
      const prevDims = screenshotDims;
      screenshotDims = { width: data.width, height: data.height };
      // Expose dimensions so computer-use tool can pass to Holo3
      screenshotBridge._lastDims = screenshotDims;
      if (!prevDims) {
        emit({ event: 'info', message: `Screenshot: ${data.width}x${data.height} pixels` });
      } else if (prevDims.width !== data.width || prevDims.height !== data.height) {
        emit({ event: 'info', message: `Screenshot resolution changed: ${data.width}x${data.height}` });
      }
      return data.image;
    }
    return data; // fallback: raw base64 string
  },
  async captureWindow(windowTitle) {
    const result = await computerUseRequest('capture_screen', { window: windowTitle });
    const data = result.data;
    if (data && typeof data === 'object' && data.image) return data.image;
    return data;
  },
};

/** DPI scale factor — screenshot pixels / logical screen pixels.
 *  Fetched fresh each action to handle monitor changes / docking. */
let dpiScaleCache = null;
let dpiScaleAge = 0;
const DPI_CACHE_TTL = 10_000; // Re-detect every 10 seconds
async function getDpiScale() {
  const now = Date.now();
  if (dpiScaleCache !== null && (now - dpiScaleAge) < DPI_CACHE_TTL) return dpiScaleCache;
  try {
    const result = await computerUseRequest('get_dpi_scale');
    const scale = (typeof result.data === 'number' && result.data > 0) ? result.data : null;
    if (scale) {
      if (dpiScaleCache !== null && dpiScaleCache !== scale) {
        emit({ event: 'info', message: `DPI scale changed: ${dpiScaleCache} → ${scale}` });
      }
      dpiScaleCache = scale;
      dpiScaleAge = now;
    } else if (dpiScaleCache === null) {
      // First call failed — detect from screenshot vs screen resolution
      dpiScaleCache = 1.0; // Safe default: assume 100% until proven otherwise
      dpiScaleAge = now;
      emit({ event: 'info', message: `DPI scale: 1.0 (detection failed, using safe default)` });
    }
  } catch {
    if (dpiScaleCache === null) {
      dpiScaleCache = 1.0;
      dpiScaleAge = now;
      emit({ event: 'info', message: `DPI scale: 1.0 (fallback)` });
    }
  }
  return dpiScaleCache;
}

/** Scale Holo3 coordinates (physical pixels) to logical coordinates for enigo */
async function scaleCoord(x, y) {
  const scale = await getDpiScale();
  return { x: Math.round(x / scale), y: Math.round(y / scale) };
}

/** First screenshot logs dimensions for coordinate calibration */
let screenshotDims = null;

/** Scale and clamp coordinates to screen bounds */
async function scaleAndClamp(x, y) {
  const scale = await getDpiScale();
  let sx = Math.round(x / scale);
  let sy = Math.round(y / scale);
  // Clamp to screen bounds if we know them
  if (screenshotDims) {
    const maxX = Math.round(screenshotDims.width / scale);
    const maxY = Math.round(screenshotDims.height / scale);
    sx = Math.max(0, Math.min(sx, maxX - 1));
    sy = Math.max(0, Math.min(sy, maxY - 1));
  }
  return { sx, sy, scale };
}

const inputBridge = {
  async click(x, y) {
    const { sx, sy, scale } = await scaleAndClamp(x, y);
    emit({ event: 'info', message: `Click: Holo3=(${x},${y}) → Screen=(${sx},${sy}) [DPI ${scale}]` });
    await computerUseRequest('click', { x: sx, y: sy });
  },
  async doubleClick(x, y) { const { sx, sy } = await scaleAndClamp(x, y); await computerUseRequest('double_click', { x: sx, y: sy }); },
  async rightClick(x, y) { const { sx, sy } = await scaleAndClamp(x, y); await computerUseRequest('right_click', { x: sx, y: sy }); },
  async typeText(text) { await computerUseRequest('type_text', { text }); },
  async keyPress(key) { await computerUseRequest('key_press', { key }); },
  async scroll(direction, amount) { await computerUseRequest('scroll', { direction, amount }); },
  async moveMouse(x, y) { const { sx, sy } = await scaleAndClamp(x, y); await computerUseRequest('move_mouse', { x: sx, y: sy }); },
  async drag(x, y, endX, endY) {
    const start = await scaleAndClamp(x, y);
    const end = await scaleAndClamp(endX, endY);
    await computerUseRequest('drag', { x: start.sx, y: start.sy, end_x: end.sx, end_y: end.sy });
  },
};

const windowBridge = {
  async getActiveWindow() {
    const result = await computerUseRequest('get_active_window');
    return result.data;
  },
};

/** UI Automation bridge — structured element detection */
const uiaBridge = {
  async listElements() {
    const result = await computerUseRequest('list_ui_elements');
    return result.data;
  },
  async findElement(name) {
    const result = await computerUseRequest('find_ui_element', { name });
    return result.data;
  },
  async clickElement(name) {
    const result = await computerUseRequest('click_element', { name });
    return result.data;
  },
  async focusWindow(name) {
    const result = await computerUseRequest('focus_window', { name });
    return result.data;
  },
};

// ─── NDJSON I/O ─────────────────────────────────────────────────────────────

function emit(event) {
  // All output goes to stdout as single-line JSON
  process.stdout.write(JSON.stringify(event) + '\n');
}

function emitError(message) {
  emit({ event: 'error', message });
}

// Prevent unhandled errors from crashing the sidecar
process.on('uncaughtException', (err) => {
  emitError(`Uncaught: ${err.message}`);
});
process.on('unhandledRejection', (err) => {
  emitError(`Unhandled rejection: ${err?.message || String(err)}`);
});

// ─── Command Handlers ───────────────────────────────────────────────────────

async function handleInit(data) {
  try {
    const config = data.config || {};
    let cwd = (config.cwd && config.cwd !== '.') ? config.cwd : (process.env.HOME || process.env.USERPROFILE || process.cwd());
    // Validate path — resolve to absolute, reject path traversal
    const path = await import('path');
    cwd = path.default.resolve(cwd);
    if (cwd.includes('..')) { cwd = process.env.HOME || process.env.USERPROFILE || process.cwd(); }
    // Change Node.js working directory so relative paths resolve correctly
    try { process.chdir(cwd); } catch { /* non-fatal */ }
    const projectRoot = detectProjectRoot(cwd) ?? undefined;
    currentMode = config.mode || 'work';

    // Register providers from BYOK keys
    const providerRegistry = new ProviderRegistry();
    const providerMap = { glm: 'zhipu' };

    if (config.providers) {
      for (const [name, settings] of Object.entries(config.providers)) {
        if (!settings?.apiKey) continue;
        try {
          const registryKey = providerMap[name] || name;
          providerRegistry.register(registryKey, settings);
        } catch {
          // Provider not implemented, skip
        }
      }
    }

    // Register platform provider when user has a platform key
    if (config.platformKey) {
      try {
        const platformProvider = new PlatformProvider({ apiKey: config.platformKey });
        providerRegistry.registerCustom('platform', platformProvider);
        emit({ event: 'info', message: `Platform provider registered, models: ${platformProvider.listModels().map(m => m.id).join(', ')}` });
      } catch (err) {
        emit({ event: 'info', message: `Platform provider error: ${err.message}` });
      }
    }

    // Resolve model — try BYOK first, then fall back to platform
    let activeModel = config.activeModel || 'platform:qwen3-omni-flash';
    emit({ event: 'info', message: `Resolving model: ${activeModel}` });
    let resolved = providerRegistry.resolveModel(activeModel);

    // If BYOK model not found, try platform models
    if (!resolved && config.platformKey) {
      const platformFallbacks = ['platform:qwen3-omni-flash', 'platform:qwen3.5-omni-plus', 'platform:qwen3.5-plus', 'platform:qwen-flash'];
      for (const fb of platformFallbacks) {
        resolved = providerRegistry.resolveModel(fb);
        if (resolved) { activeModel = fb; break; }
      }
    }

    if (!resolved) {
      emitError(`No provider available. Set BYOK keys or connect your platform account.`);
      return;
    }

    // Tools
    toolRegistry = new ToolRegistry();
    toolRegistry.registerBuiltins({
      exclude: ['screenshot'], // IDE uses Tauri capture_screen via computer_use tool instead
    });
    toolRegistry.setPermissionMode(config.permissionMode || 'balanced');

    // Confirmation handler — pauses and waits for IDE response
    toolRegistry.setConfirmationHandler(async (toolName, args) => {
      const id = crypto.randomUUID().slice(0, 8);
      emit({ event: 'confirm_required', id, toolName, args });
      return new Promise((resolve) => {
        pendingConfirmations.set(id, { resolve });
      });
    });

    // Memory
    let sync;
    if (config.platformKey) {
      const projectId = projectRoot
        ? createHash('sha256').update(projectRoot).digest('hex').slice(0, 16)
        : undefined;
      sync = new PlatformMemorySync('https://ava-supernova.com/api', config.platformKey, projectId);
    }

    // Load memory in background — don't block init
    let memory = null;
    let projectInstructions = null;
    try {
      memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot });
    } catch {
      memoryManager = null;
    }
    emit({ event: 'info', message: 'Memory manager created' });

    // Personality
    let personalityPrefix = '';
    try {
      const personality = await loadPersonality();
      if (personality) personalityPrefix = buildPersonalityPrefix(personality);
    } catch { /* no personality set */ }
    emit({ event: 'info', message: 'Personality loaded' });

    // Locale
    const language = resolveLocale(config.language ?? 'auto');
    await setLocale(language);
    emit({ event: 'info', message: 'Locale set' });

    // Load knowledge packs — auto-detected project context only
    // Self-knowledge is NOT injected into context (147KB = ~37K tokens).
    // Ava accesses her own code via the self_inspect tool instead.
    let knowledgeContext;
    try {
      const packSections = [];

      // Auto-detect game projects
      const { readdirSync } = await import('node:fs');
      const files = readdirSync(cwd).map(f => f.toLowerCase());
      const isGameProject = files.some(f =>
        f.endsWith('.uproject') || f === 'project.godot' ||
        (files.includes('content') && files.includes('source'))
      );
      if (isGameProject) {
        const gamePack = core.BUILTIN_PACKS?.find(p => p.id === 'game-development');
        if (gamePack) {
          const engine = files.some(f => f.endsWith('.uproject')) ? 'Unreal Engine (C++)'
            : files.includes('project.godot') ? 'Godot (GDScript)'
            : files.some(f => f.endsWith('.csproj')) ? 'Unity (C#)'
            : 'game engine';
          packSections.push(`## Active Knowledge Pack: Game Development\nDetected: ${engine}\n\n${gamePack.context}`);
        }
      }

      if (packSections.length > 0) {
        knowledgeContext = packSections.join('\n\n');
      }
    } catch { /* non-fatal */ }

    // Conversation + system prompt
    conversation = new Conversation();
    conversation.setSystemPrompt(
      buildSystemPrompt({
        cwd,
        platform: platform(),
        shell: process.env.SHELL ?? (process.platform === 'win32' ? 'bash' : '/bin/bash'),
        supportsVision: resolved.model.supportsVision,
        projectInstructions: projectInstructions ?? undefined,
        memory: memory || undefined,
        autoMemory: config.autoMemory ?? true,
        personality: personalityPrefix || undefined,
        language,
        knowledgeContext,
      })
    );

    // Inject user identity so Ava knows who she's talking to
    if (config.userName || config.userEmail) {
      const msgs = conversation.getMessages();
      const sysMsgContent = msgs[0]?.role === 'system' ? msgs[0].content : '';
      const userInfo = [
        config.userName ? `Name: ${config.userName}` : null,
        config.userEmail ? `Email: ${config.userEmail}` : null,
        config.userTier ? `Plan: ${config.userTier}` : null,
      ].filter(Boolean).join(' | ');
      conversation.setSystemPrompt(
        sysMsgContent + `\n\n[User: ${userInfo}]\nAddress the user by their name when appropriate.`
      );
    }

    // Inject working hours into the system prompt so Ava respects the user's schedule
    if (config.workingHours) {
      const { start, end } = config.workingHours;
      const fmt = (h) => `${String(h).padStart(2, '0')}:00`;
      const now = new Date().getHours();
      const isWorking = start <= end ? (now >= start && now < end) : (now >= start || now < end);
      const msgs = conversation.getMessages();
      const sysMsgContent = msgs[0]?.role === 'system' ? msgs[0].content : '';
      conversation.setSystemPrompt(
        sysMsgContent +
        `\n\n[User Working Hours: ${fmt(start)} — ${fmt(end)}]` +
        `\nCurrent time: ${fmt(now)}. User is ${isWorking ? 'currently working' : 'outside their set working hours'}.` +
        `\nNEVER suggest stopping, wrapping up, or taking breaks during working hours. The user decides when to stop.`
      );
    }

    // Journal manager (local-first, stored in ~/.ava/journal/)
    journalManager = new JournalManager({ globalDir: AVA_HOME, projectRoot: cwd });

    // Project indexer
    let projectIndexer = null;
    try {
      projectIndexer = new ProjectIndexer(cwd);
      await projectIndexer.scan();
      emit({ event: 'info', message: `Project indexed: ${projectIndexer.getIndex()?.framework?.name || 'unknown'} project` });
    } catch { /* non-fatal */ }

    // Shared state
    const sharedState = {
      memoryManager,
      journalManager,
      projectIndexer,
      platformKey: config.platformKey,
      qwenApiKey: config.providers?.qwen?.apiKey || process.env.QWEN_API_KEY,
      minimaxApiKey: config.providers?.minimax?.apiKey || process.env.MINIMAX_API_KEY,
      activeModelId: resolved.model.id,
      // Computer Use — bridges to Tauri desktop commands
      screenshotProvider: screenshotBridge,
      inputProvider: inputBridge,
      windowProvider: windowBridge,
      holoApiKey: process.env.HAI_API_KEY || config.holoApiKey,
      uiaProvider: uiaBridge,
      _debug_holo: !!(config.holoApiKey || process.env.HAI_API_KEY) ? 'BYOK' : (config.platformKey ? 'platform' : 'none'),
      computerUseSettings: config.computerUseSettings || undefined,
    };

    // Memory Agent — curates briefs instead of raw memory dumps
    const qwenFlash = providerRegistry.resolveModel('platform:qwen3-omni-flash')
      || providerRegistry.resolveModel('platform:qwen-flash')
      || providerRegistry.resolveModel('qwen:qwen3-omni-flash');
    if (qwenFlash && memoryManager) {
      memoryAgentInstance = new MemoryAgent({
        memoryManager,
        provider: qwenFlash.provider,
        model: qwenFlash.model,
      });
      sharedState.memoryAgent = memoryAgentInstance;
      emit({ event: 'info', message: 'Memory Agent initialized on ' + qwenFlash.model.id });
    }

    // Build resilient provider with fallback
    const healthTracker = new ProviderHealthTracker();
    const fallbackChain = providerRegistry.buildFallbackChain(activeModel);
    const provider = fallbackChain && fallbackChain.length > 1
      ? new ResilientProvider({
          primary: fallbackChain[0],
          fallbacks: fallbackChain.slice(1),
          healthTracker,
          onFallback: (from, to, err) => {
            emit({
              event: 'info',
              message: `Provider failover: ${from.provider.displayName} → ${to.provider.displayName} (${err.message})`,
            });
          },
        })
      : resolved.provider;

    // Agent
    agent = new Agent({
      provider,
      model: resolved.model,
      toolRegistry,
      cwd,
      sharedState,
    });

    // Conductor (persona orchestration)
    conductor = new Conductor({
      provider,
      model: resolved.model,
      toolRegistry,
      cwd,
      sharedState,
    });

    // Auto Mode — detect available providers
    const availableProviders = new Set();
    if (config.platformKey) availableProviders.add('platform');
    if (sharedState.qwenApiKey) availableProviders.add('qwen');
    if (sharedState.minimaxApiKey) availableProviders.add('minimax');
    if (config.providers?.kimi?.apiKey || process.env.KIMI_API_KEY) availableProviders.add('kimi');
    if (config.providers?.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY) availableProviders.add('deepseek');

    // Use static create() — picks Kimi K2.5 for platform, best available for BYOK
    if (availableProviders.size > 1 || availableProviders.has('platform')) {
      autoCoordinator = AutoCoordinator.create({
        providerRegistry,
        toolRegistry,
        cwd,
        sharedState,
        availableProviders,
        platformKey: config.platformKey,
      });
    }

    // Store for hot-swap model changes
    globalThis._providerRegistry = providerRegistry;
    globalThis._cwd = cwd;
    globalThis._sharedState = sharedState;
    globalThis._currentModel = resolved.model;

    emit({ event: 'info', message: `Holo3: ${sharedState._debug_holo}, key prefix: ${(sharedState.holoApiKey || '').slice(0, 6) || 'none'}` });
    emit({ event: 'ready', model: resolved.model.id, provider: resolved.provider.name });
  } catch (err) {
    emitError(`Init failed: ${err.message}`);
  }
}

async function handleMessage(data) {
  if (!agent || !conversation) {
    emitError('Not initialized. Send "init" first.');
    return;
  }
  if (isRunning) {
    // Inject as mid-run interjection instead of rejecting
    if (agent) {
      agent.inject(data.content);
      conversation?.addUserMessage(data.content);
      emit({ event: 'injected' });
    }
    return;
  }

  isRunning = true;
  const abortController = new AbortController();
  currentAbort = abortController;

  try {
    // Sync conversation from UI history if provided (ensures sidecar sees full chat window)
    if (data.history && Array.isArray(data.history) && data.history.length > 0) {
      const currentMessages = conversation.getMessages();
      const currentUserCount = currentMessages.filter(m => m.role === 'user').length;
      const historyUserCount = data.history.filter(m => m.role === 'user').length;
      // Only resync if the UI has more history than the sidecar (e.g. after model switch)
      if (historyUserCount > currentUserCount) {
        // Keep system message, rebuild from UI history
        const sysMsg = currentMessages.find(m => m.role === 'system');
        const rebuilt = [];
        if (sysMsg) rebuilt.push(sysMsg);
        for (const h of data.history) {
          if (h.text) rebuilt.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text });
        }
        conversation.setMessages(rebuilt);
      }
    }

    // Build multimodal content if attachments are present (images, files)
    if (data.attachments && Array.isArray(data.attachments) && data.attachments.length > 0) {
      emit({ event: 'info', message: `Attachments received: ${data.attachments.length}` });
      // Warn user immediately if current model can't process images
      const hasImages = data.attachments.some(a => a.mimeType?.startsWith('image/'));
      const currentModel = globalThis._currentModel;
      if (hasImages && currentModel && !currentModel.supportsVision) {
        emit({ event: 'warning', message: `Your current model (${currentModel.name || currentModel.id}) doesn't support vision. Images will be ignored. Switch to a vision model like Qwen 3.5 Plus or Qwen Omni Flash to analyse images.` });
      }
      const parts = [];
      if (data.content) parts.push({ type: 'text', text: data.content });
      for (const att of data.attachments) {
        if (att.mimeType?.startsWith('image/')) {
          let imageUrl = att.dataUri;
          // Handle file:// temp attachments — read back to data URI
          if (imageUrl?.startsWith('file://')) {
            try {
              const filePath = imageUrl.replace('file://', '');
              const { readFile } = await import('node:fs/promises');
              const bytes = await readFile(filePath);
              imageUrl = `data:${att.mimeType};base64,${bytes.toString('base64')}`;
              // Clean up temp file
              const { unlink } = await import('node:fs/promises');
              unlink(filePath).catch(() => {});
              emit({ event: 'info', message: `Image loaded from temp: ${att.name} (${Math.round(bytes.length / 1024)}KB)` });
            } catch (err) {
              emit({ event: 'info', message: `Failed to read temp image: ${err.message}` });
              continue;
            }
          }
          if (imageUrl) {
            parts.push({ type: 'image_url', image_url: { url: imageUrl } });
            emit({ event: 'info', message: `Image attached: ${att.name} (${att.mimeType})` });
          }
        }
      }
      conversation.addUserMessage(parts.length > 0 ? parts : data.content);
    } else {
      conversation.addUserMessage(data.content);
    }
    let messages = conversation.getMessages();

    // Per-turn memory brief (curated by Memory Agent) or raw recall fallback
    if (memoryAgentInstance && data.content && data.content.length > 5) {
      try {
        const brief = await memoryAgentInstance.generateBrief(data.content);
        if (brief.summary) {
          const topicList = brief.availableTopics.length > 0
            ? '\n\nAvailable memory topics (use memory_recall for detail): ' +
              brief.availableTopics.map(t => t.topic).join(', ')
            : '';
          const currentMsgs = conversation.getMessages();
          currentMsgs.push({
            role: 'system',
            content: `[Memory Brief]\n${brief.summary}${topicList}`,
          });
          conversation.setMessages(currentMsgs);
          messages = conversation.getMessages();
          emit({ event: 'info', message: `Memory brief generated (${brief.consideredEntryCount} memories considered)` });
        }
      } catch (err) {
        emit({ event: 'info', message: `Memory brief failed: ${err.message}` });
      }
    } else if (memoryManager && data.content && data.content.length > 5) {
      // Fallback: raw recall (no Memory Agent available)
      try {
        const memories = await memoryManager.recall({ query: data.content, limit: 5, scope: 'all' });
        if (memories && memories.length > 0) {
          const memoryContext = memories
            .map(m => `[${m.scope || 'global'}/${m.entry?.category || m.category || 'general'}] ${(m.entry?.content || m.content || '').slice(0, 300)}`)
            .join('\n');
          const currentMsgs = conversation.getMessages();
          currentMsgs.push({
            role: 'system',
            content: `[Relevant memories for this message]\n${memoryContext}\n\nUse these if relevant. Don't mention them unless asked about memory.`,
          });
          conversation.setMessages(currentMsgs);
          messages = conversation.getMessages();
          emit({ event: 'info', message: `Recalled ${memories.length} relevant memories` });
        }
      } catch (err) {
        emit({ event: 'info', message: `Memory recall failed: ${err.message}` });
      }
    }

    // Check if conductor orchestration is needed (plan, teach, security, brainstorm modes)
    let conductorContext = null;
    if (conductor && conductor.needsOrchestration(data.content, currentMode)) {
      emit({ event: 'orchestration_start', mode: currentMode });
      try {
        conductorContext = await conductor.orchestrate(
          data.content,
          currentMode,
          messages,
          (cEvent) => {
            emit({ event: 'conductor_event', ...cEvent });
          },
          abortController.signal,
        );
      } catch (err) {
        if (err.name !== 'AbortError') {
          emit({ event: 'conductor_error', message: err.message });
        }
      }
      emit({ event: 'orchestration_end' });
    }

    // If conductor produced context, inject it
    if (conductorContext?.synthesisPrompt) {
      messages = [
        ...messages,
        { role: 'user', content: conductorContext.synthesisPrompt },
      ];
    }

    // Run main agent loop (Auto Mode if available, otherwise direct agent)
    const runner = autoCoordinator || agent;
    const updated = await runner.run(
      messages,
      (agentEvent) => {
        // Forward all agent events to the IDE
        switch (agentEvent.type) {
          case 'stream_start':
            emit({ event: 'stream_start' });
            break;
          case 'stream_delta':
            emit({ event: 'stream_delta', content: agentEvent.content });
            break;
          case 'thinking_delta':
            emit({ event: 'thinking_delta', content: agentEvent.content });
            break;
          case 'stream_end':
            emit({ event: 'stream_end' });
            break;
          case 'tool_call_start':
            emit({
              event: 'tool_call_start',
              toolName: agentEvent.toolCall.function.name,
              args: safeParseArgs(agentEvent.toolCall.function.arguments),
              toolCallId: agentEvent.toolCall.id,
            });
            break;
          case 'tool_call_partial':
            // Check for Holo3 usage data embedded in tool output
            if (typeof agentEvent.data === 'string' && agentEvent.data.startsWith('__usage__:')) {
              try {
                const usageData = JSON.parse(agentEvent.data.slice(10));
                emit({ event: 'usage', usage: usageData, cost: 0 });
              } catch { /* ignore parse errors */ }
              break; // Don't forward the raw __usage__ line to the UI
            }
            emit({
              event: 'tool_call_partial',
              toolCallId: agentEvent.toolCallId,
              data: agentEvent.data,
            });
            break;
          case 'tool_call_end':
            emit({
              event: 'tool_call_end',
              toolName: agentEvent.toolCall.function.name,
              toolCallId: agentEvent.toolCall.id,
              result: truncateResult(agentEvent.result),
              success: agentEvent.success,
            });
            break;
          case 'usage':
            emit({
              event: 'usage',
              usage: agentEvent.usage,
              cost: agentEvent.cost,
            });
            break;
          case 'context_usage':
            emit({ event: 'context_usage', ...agentEvent.context });
            break;
          case 'context_compression_start':
            emit({ event: 'context_compression_start' });
            break;
          case 'context_compression_end':
            emit({
              event: 'context_compression_end',
              originalTokens: agentEvent.originalTokens,
              compressedTokens: agentEvent.compressedTokens,
            });
            break;
          case 'context_truncated':
            emit({ event: 'context_truncated', droppedCount: agentEvent.droppedCount });
            break;
          case 'error':
            emit({ event: 'agent_error', message: agentEvent.error.message });
            break;
          case 'auto_routing':
            emit({ event: 'auto_routing', category: agentEvent.category, model: agentEvent.model, reason: agentEvent.reason });
            break;
          case 'auto_agent_start':
            emit({ event: 'auto_agent_start', model: agentEvent.model });
            break;
          case 'auto_agent_end':
            emit({ event: 'auto_agent_end', model: agentEvent.model, summary: agentEvent.summary });
            break;
          case 'done':
            // Final message content
            emit({
              event: 'done',
              content: agentEvent.finalMessage.content || '',
            });
            break;
        }
      },
      abortController.signal,
    );

    conversation.setMessages(updated);

    // Auto-journal: every 5th user message, Ava writes a brief observation
    const userMsgCount = updated.filter(m => m.role === 'user').length;
    if (journalManager && userMsgCount > 0 && userMsgCount % 5 === 0) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const lastFew = updated.slice(-10).map(m => {
          const text = typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || '');
          return `[${m.role}] ${text.slice(0, 200)}`;
        }).join('\n');
        const observation = `Session observation (${userMsgCount} messages):\n${lastFew}`;
        await journalManager.appendAvaEntry(today, observation, ['auto', 'session']);
        emit({ event: 'info', message: 'Auto-journal: Ava observation saved' });
      } catch { /* non-critical */ }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      emit({ event: 'cancelled' });
    } else {
      emitError(`Message failed: ${err.message}`);
    }
  } finally {
    isRunning = false;
    currentAbort = null;
  }
}

function handleCancel() {
  if (currentAbort) {
    currentAbort.abort();
  }
  // Safety: ensure isRunning clears even if finally block hasn't fired yet
  setTimeout(() => {
    if (isRunning && !currentAbort) {
      isRunning = false;
    }
  }, 500);
}

async function handleInterrupt() {
  // Soft interrupt — stop current generation, then have Ava check in
  if (currentAbort) {
    currentAbort.abort();
  }

  // Wait for isRunning to clear
  await new Promise(resolve => {
    const check = () => { if (!isRunning) resolve(); else setTimeout(check, 50); };
    check();
  });

  // Inject an interrupt context and get Ava to respond naturally
  if (conversation) {
    const msgs = conversation.getMessages();
    // Add a system note about the interruption
    const sysContent = msgs[0]?.role === 'system' ? String(msgs[0].content) : '';
    conversation.setSystemPrompt(
      sysContent.replace(/\n\n\[INTERRUPT:[\s\S]*?\]/, '') +
      '\n\n[INTERRUPT: The user just interrupted you. They tapped the pause button to get your attention. ' +
      'Stop what you were doing, acknowledge the interruption politely, and ask what they need. ' +
      'Be warm — they interrupted because something is on their mind, not because you did anything wrong. ' +
      'Keep it brief — one or two sentences.]'
    );

    // Send a synthetic message to trigger Ava's response
    isRunning = true;
    currentAbort = new AbortController();
    try {
      conversation.addUserMessage('[User interrupted — wants your attention]');
      const updated = await agent.run(
        conversation.getMessages(),
        (agentEvent) => {
          switch (agentEvent.type) {
            case 'stream_start': emit({ event: 'stream_start' }); break;
            case 'stream_delta': emit({ event: 'stream_delta', content: agentEvent.content }); break;
            case 'stream_end': emit({ event: 'stream_end' }); break;
            default: break;
          }
        },
        currentAbort.signal,
      );
      conversation.setMessages(updated);

      const lastAssistant = updated.filter(m => m.role === 'assistant').pop();
      const content = typeof lastAssistant?.content === 'string' ? lastAssistant.content : '';
      emit({ event: 'done', content });
    } catch { /* interrupt response failed — not critical */ }
    finally {
      isRunning = false;
      currentAbort = null;
      // Clean up the interrupt note from system prompt
      const cleanMsgs = conversation.getMessages();
      const cleanSys = cleanMsgs[0]?.role === 'system' ? String(cleanMsgs[0].content) : '';
      conversation.setSystemPrompt(cleanSys.replace(/\n\n\[INTERRUPT:[\s\S]*?\]/, ''));
    }
  }
}

function handleConfirm(data) {
  const pending = pendingConfirmations.get(data.id);
  if (!pending) {
    emitError(`No pending confirmation: ${data.id}`);
    return;
  }
  pendingConfirmations.delete(data.id);

  if (data.response && typeof data.response === 'string') {
    // Free-text response (e.g., ask_user, present_plan approval)
    pending.resolve(data.response);
  } else {
    // Boolean approve/deny
    pending.resolve(data.approved !== false);
  }
}

function handleClear() {
  if (isRunning) {
    handleCancel();
  }
  if (conversation) {
    // Preserve system prompt, clear messages
    const messages = conversation.getMessages();
    const systemMsg = messages.find((m) => m.role === 'system');
    conversation.clear();
    if (systemMsg) {
      conversation.setSystemPrompt(systemMsg.content);
    }
  }
  emit({ event: 'cleared' });
}

function handleInject(data) {
  if (agent && isRunning) {
    agent.inject(data.content);
    emit({ event: 'injected' });
  } else {
    emitError('Cannot inject — no active run.');
  }
}

function handleSetMode(data) {
  currentMode = data.mode || 'work';
  emit({ event: 'mode_changed', mode: currentMode });
}

async function handleSetModel(data) {
  // Hot-swap the model without restarting the sidecar
  if (!data.model) { emitError('No model specified'); return; }

  try {
    const providerRegistry = globalThis._providerRegistry;
    if (!providerRegistry) { emitError('Not initialized'); return; }
    const cwd = globalThis._cwd || process.cwd();
    const sharedState = globalThis._sharedState || {};

    // Auto mode — use AutoCoordinator with correct coordinator model
    if (data.model === 'auto') {
      const availableProviders = new Set();
      if (sharedState.platformKey) availableProviders.add('platform');
      if (sharedState.qwenApiKey) availableProviders.add('qwen');
      if (sharedState.minimaxApiKey) availableProviders.add('minimax');
      if (sharedState.kimiApiKey) availableProviders.add('kimi');
      if (sharedState.deepseekApiKey) availableProviders.add('deepseek');

      autoCoordinator = AutoCoordinator.create({
        providerRegistry,
        toolRegistry,
        cwd,
        sharedState,
        availableProviders,
        platformKey: sharedState.platformKey,
      });

      if (autoCoordinator) {
        emit({ event: 'model_changed', model: 'auto', provider: 'auto' });
      } else {
        emitError('Auto mode unavailable — no providers found');
      }
      return;
    }

    // Specific model — resolve and switch
    let resolved = providerRegistry.resolveModel(data.model);
    if (!resolved) {
      // Try platform fallback
      resolved = providerRegistry.resolveModel(`platform:${data.model.split(':').pop()}`);
    }
    if (!resolved) { emitError(`Model not found: ${data.model}`); return; }

    sharedState.activeModelId = resolved.model.id;
    globalThis._currentModel = resolved.model;

    agent = new Agent({
      provider: resolved.provider,
      model: resolved.model,
      toolRegistry,
      cwd,
      sharedState,
    });

    conductor = new Conductor({
      provider: resolved.provider,
      model: resolved.model,
      toolRegistry,
      cwd,
      sharedState,
    });

    // Disable auto coordinator when specific model selected
    autoCoordinator = null;

    emit({ event: 'model_changed', model: resolved.model.id, provider: resolved.provider.name });
  } catch (err) {
    emitError(`Model switch failed: ${err.message}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeParseArgs(argsStr) {
  try {
    return typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
  } catch {
    return { raw: argsStr };
  }
}

function truncateResult(result) {
  if (!result) return '';
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  // Limit tool result size sent to IDE (full result stays in conversation)
  return str.length > 2000 ? str.slice(0, 2000) + '…' : str;
}

// ─── stdin Command Router ───────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  if (!line.trim()) return;

  let data;
  try {
    data = JSON.parse(line);
  } catch {
    emitError(`Invalid JSON: ${line.slice(0, 100)}`);
    return;
  }

  switch (data.cmd) {
    case 'init':
      await handleInit(data);
      break;
    case 'message':
      handleMessage(data).catch((err) => emitError(err.message));
      break;
    case 'cancel':
      handleCancel();
      break;
    case 'interrupt':
      handleInterrupt().catch((err) => emitError(err.message));
      break;
    case 'confirm':
      handleConfirm(data);
      break;
    case 'clear':
      handleClear();
      break;
    case 'set_permission':
      if (toolRegistry && data.mode) {
        toolRegistry.setPermissionMode(data.mode);
        emit({ event: 'info', message: `Permission mode: ${data.mode}` });
      }
      break;
    case 'inject':
      handleInject(data);
      break;
    case 'set_mode':
      handleSetMode(data);
      break;
    case 'set_model':
      handleSetModel(data).catch((err) => emitError(err.message));
      break;
    case 'clear_memory':
      if (memoryManager) {
        try {
          await memoryManager.clearEverything();
          memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot: cwd });
          emit({ event: 'info', message: 'Memory cleared and manager reset' });
        } catch (err) {
          emitError(`Failed to clear memory: ${err.message}`);
        }
      }
      break;
    case 'computer_use_response': {
      const pending = pendingComputerUse.get(data.requestId);
      if (pending) {
        pendingComputerUse.delete(data.requestId);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve({ data: data.result });
        }
      }
      break;
    }
    case 'update_computer_use_settings': {
      // Live update computer use settings from the UI
      if (agent?.sharedState) {
        agent.sharedState.computerUseSettings = data.settings;
        emit({ event: 'info', message: 'Computer use settings updated' });
      }
      break;
    }
    case 'set_cwd': {
      // Dynamic working directory update — called when user opens a new folder
      if (!data.cwd) { emitError('No cwd specified'); break; }
      try {
        const path = await import('path');
        let newCwd = path.default.resolve(data.cwd);
        if (newCwd.includes('..')) { emitError('Invalid cwd path'); break; }
        process.chdir(newCwd);
        globalThis._cwd = newCwd;

        // Update agent and conductor with new cwd
        if (agent) agent.setCwd(newCwd);
        if (conductor) conductor.setCwd(newCwd);

        // Re-detect project root for memory scoping
        const projectRoot = detectProjectRoot(newCwd) ?? undefined;
        if (memoryManager) {
          try {
            memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot });
            if (globalThis._sharedState) globalThis._sharedState.memoryManager = memoryManager;
          } catch { /* non-fatal */ }
        }

        // Re-index the new project
        try {
          const projectIndexer = new ProjectIndexer(newCwd);
          await projectIndexer.scan();
          if (globalThis._sharedState) globalThis._sharedState.projectIndexer = projectIndexer;
          emit({ event: 'info', message: `Re-indexed: ${projectIndexer.getIndex()?.framework?.name || 'unknown'} project in ${newCwd}` });
        } catch { /* non-fatal */ }

        emit({ event: 'cwd_changed', message: newCwd });
      } catch (err) {
        emitError(`Failed to change cwd: ${err.message}`);
      }
      break;
    }
    case 'set_working_hours':
      if (conversation && data.start != null && data.end != null) {
        const fmt = (h) => `${String(h).padStart(2, '0')}:00`;
        const now = new Date().getHours();
        const s = data.start, e = data.end;
        const isWorking = s <= e ? (now >= s && now < e) : (now >= s || now < e);
        const msgs = conversation.getMessages();
        const sysMsgContent = msgs[0]?.role === 'system' ? String(msgs[0].content) : '';
        // Strip old working hours block and append new one
        const cleaned = sysMsgContent.replace(/\n\n\[User Working Hours:[\s\S]*?The user decides when to stop\./, '');
        conversation.setSystemPrompt(
          cleaned +
          `\n\n[User Working Hours: ${fmt(s)} — ${fmt(e)}]` +
          `\nCurrent time: ${fmt(now)}. User is ${isWorking ? 'currently working' : 'outside their set working hours'}.` +
          `\nNEVER suggest stopping, wrapping up, or taking breaks during working hours. The user decides when to stop.`
        );
        emit({ event: 'info', message: `Working hours updated: ${fmt(s)} — ${fmt(e)}` });
      }
      break;
    default:
      emitError(`Unknown command: ${data.cmd}`);
  }
});

rl.on('close', () => {
  // Parent process closed stdin — exit cleanly
  process.exit(0);
});

// Signal readiness (process started)
emit({ event: 'started', pid: process.pid });
