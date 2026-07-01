#!/usr/bin/env node

/**
 * Ava Supernova IDE — Node.js Sidecar
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
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';

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

// Health subpath — gives the sidecar a Node-fs HealthPlanStore for the
// agent's health_plan_* tools. Same files the renderer reads/writes via
// the Tauri-fs store, so Ava-driven and UI-driven plans share storage.
let healthCore;
try {
  healthCore = await import('@ava/core/health');
} catch {
  const healthPath = join(__dirname, '..', '..', 'core', 'dist', 'health', 'index.js');
  healthCore = await import(`file://${healthPath.replace(/\\/g, '/')}`);
}

// Desktop subpath — the five-persona conductor (runDesktopTrajectory) lives
// here. Drives Desktop Automation Mode turns instead of the regular agent loop.
let desktopCore;
try {
  desktopCore = await import('@ava/core/desktop');
} catch {
  const desktopPath = join(__dirname, '..', '..', 'core', 'dist', 'desktop', 'index.js');
  desktopCore = await import(`file://${desktopPath.replace(/\\/g, '/')}`);
}
const { NodeHealthPlanStore } = healthCore;

// Learning subpath — pure progression derivation + the system-prompt context
// formatter, shared with the extension so both build identical Teach context.
let learningCore;
try {
  learningCore = await import('@ava/core/learning');
} catch {
  const learningPath = join(__dirname, '..', '..', 'core', 'dist', 'learning', 'index.js');
  learningCore = await import(`file://${learningPath.replace(/\\/g, '/')}`);
}
const { deriveProgression, formatLearnerContext } = learningCore;

const {
  Agent,
  Conversation,
  ToolRegistry,
  ProviderRegistry,
  PlatformProvider,
  GenericProvider,
  listOpenAICompatibleModels,
  MemoryManager,
  TaskManager,
  migrateGlobalTasksToSubfolder,
  JournalManager,
  CheckpointManager,
  HistoryManager,
  buildSystemPrompt,
  buildPersonalityPrefix,
  loadPersonality,
  getHealthRoomPrefix,
  getTeachModePrefix,
  HEALTH_PROFILE_FIELDS,
  humaniseSlug,
  summariseCookingTime,
  AVA_HOME,
  PlatformMemorySync,
  ProviderHealthTracker,
  ResilientProvider,
  Conductor,
  AutoCoordinator,
  IntentClassifier,
  MemoryAgent,
  ProjectIndexer,
  BriefingEngine,
  detectProjectRoot,
  loadProjectInstructions,
  setLocale,
  resolveLocale,
  installDatasetConsumer,
  trackUiGeneration,
  emitGenerationUserAction,
  BudgetTracker,
  exportEncryptedBackup,
  importEncryptedBackup,
  gatherBundle,
  haltIntent,
  createEmbeddingServiceFromConfig,
  loadMachineRules,
  appendMachineRule,
} = core;

// Install the dataset capture consumer once at sidecar boot. No-op for
// any user who hasn't opted in via ~/.ava/datasets/config.json — defaults
// are all-off, so this just opens the subscription. When the user toggles
// capture on from the IDE Settings page, events start landing without a
// sidecar restart (consumer reads config every 30s).
if (typeof installDatasetConsumer === 'function') {
  try { installDatasetConsumer(); } catch { /* ignore */ }
}

// ── Creative Studio dataset capture (Phase 3) ────────────────────────────────
// The IDE renderer generates via the platform API directly (outside any agent
// trajectory), and the dataset consumer lives here in the sidecar — so the
// renderer can't emit. It sends us two commands: 'creative_generation' (after a
// generation finishes) and 'creative_user_action' (kept/retried/discarded). We
// emit the shape-only events through core, keeping an assetId → completeEventId
// map so a later action links back to the generation. Best-effort; capture must
// never break generation.
const creativeGenLinks = new Map();
async function handleCreativeGeneration(data) {
  if (typeof trackUiGeneration !== 'function') return;
  try {
    const { completeEventId } = await trackUiGeneration(
      {
        type: data.genType,
        model: data.model || 'unknown',
        prompt: data.prompt || '',
        paramsSummary: data.paramsSummary || '',
        surface: 'ide',
      },
      async (tracker) => {
        if (data.success === false) tracker.fail(data.error || 'generation failed');
        else tracker.complete();
      },
    );
    if (data.assetId && completeEventId) creativeGenLinks.set(data.assetId, completeEventId);
  } catch { /* dataset capture must never break the sidecar */ }
}
function handleCreativeUserAction(data) {
  if (typeof emitGenerationUserAction !== 'function') return;
  try {
    const cid = creativeGenLinks.get(data.assetId);
    if (cid) emitGenerationUserAction({ completeEventId: cid, action: data.action, surface: 'ide' });
  } catch { /* non-fatal */ }
}

// ─── State ──────────────────────────────────────────────────────────────────

let agent = null;
let conductor = null;
let autoCoordinator = null;
let conversation = null;
// Conversation history → the SAME account-scoped ~/.ava/users/<id>/history/*.json
// files the extension + CLI write, via core's HistoryManager. So a user who
// switches extension → IDE picks up their conversations with zero effort.
let historyManager = null;
let toolRegistry = null;
let memoryManager = null;
let journalManager = null;
// Init lifecycle — flips true at the start of handleInit, false on
// completion or failure. handleMessage uses this to distinguish "init
// in flight, please wait" from "no init was ever attempted, real
// error" so a fast user click after spawn doesn't hit a misleading
// "Not initialized" error.
let initInFlight = false;
let taskManager = null;
let memoryAgentInstance = null;
let currentAbort = null;
let currentMode = 'work';
let isRunning = false;
// Second conversation thread — the focused "Ava Health & Fitness" room. Same
// agent + memory + tools as the main chat, but its own message history so
// health planning never lands in the main thread. The IDE's chat surfaces
// filter by `activeLane` (stamped on every emitted event). One run pipeline
// (the isRunning guard) → no concurrency, so a scalar lane is safe.
let healthConversation = null;
// Learning room — the focused "Ava Teach" lane. Unlike Health (one thread),
// each course owns its own conversation thread so progress + chat history are
// scoped per course (mirrors the extension's AvaViewProvider.learningConversations).
// Keyed by courseId, or '__lobby__' for the no-active-course landing thread.
const learningConversations = new Map();
const LEARNING_LOBBY_KEY = '__lobby__';
let activeLane = 'main';

// Bracket tags the core agent's detectModeFromMessages() looks for at the
// start of a user message to apply MODE_ALLOWED_TOOLS. Without this prefix
// the agent ships ALL ~70 tool schemas every turn — fine for Qwen, but
// Mistral (Aurora) spirals on tool-stuffed prompts. Prepending the tag
// lets the agent shrink the schema list to the per-mode allowlist.
const MODE_PREFIX_TAG = {
  write:      '[Write Mode]',
  plan:       '[Plan Mode]',
  chat:       '[Chat Mode]',
  brainstorm: '[Brainstorm Mode]',
  teach:      '[Teach Mode]',
  security:   '[Security Audit Mode]',
  desktop:    '[Desktop Automation Mode]',
};

// Strip the mode tag + any leaked [Desktop state] / [What Ava knows] prefix
// blocks from a desktop message, leaving the clean user intent — so stored
// procedural memories and recall queries aren't polluted with scaffolding.
function cleanDesktopTask(content) {
  return String(content || '')
    .replace(/^\s*\[Desktop Automation Mode\]\s*/i, '')
    .replace(/^\s*\[What Ava knows about this machine\][\s\S]*?\n\n/i, '')
    .replace(/^\s*\[Desktop state\][\s\S]*?\n\n/i, '')
    .trim();
}

// Module-scoped so the handleMessage finally block can auto-close the
// Ava browser at end of turn. Toggled by the browserBridge inside
// handleInit.
let browserLaunched = false;

/** Map<confirmId, { resolve: Function }> */
const pendingConfirmations = new Map();

/** Map<requestId, { resolve: Function, reject: Function }> for desktop automation requests */
const pendingDesktop = new Map();
let desktopRequestId = 0;

// ─── Secret working set ─────────────────────────────────────────────────────
//
// Session-lived in-memory store for granted secret values. Keyed by the
// opaque id that `secret_request` hands back to Ava as `{{secret:<id>}}`.
// When a tool's args contain a handle, the argsPreprocessor below
// substitutes the real value at execute time — the value never enters
// Ava's tool args, reasoning, or chat history. Cleared on chat reset.
//
// Persistence (OS keychain) is a separate follow-up feature; for now
// every session starts empty and the user re-enters values if needed.
const secretWorkingSet = new Map(); // Map<id, { label: string, value: string }>
const pendingSecretGrants = new Map(); // Map<grantId, { resolve, label }>

function clearSecretWorkingSet() {
  secretWorkingSet.clear();
}

async function requestSecretGrant(label, reason) {
  const grantId = crypto.randomUUID().slice(0, 8);
  return new Promise((resolve) => {
    pendingSecretGrants.set(grantId, { resolve, label });
    emit({
      event: 'secret_grant_request',
      grantId,
      label,
      reason: reason || '',
    });
  });
}

function handleSecretGrantResponse(data) {
  const pending = pendingSecretGrants.get(data.grantId);
  if (!pending) return;
  pendingSecretGrants.delete(data.grantId);
  if (data.deny || typeof data.value !== 'string' || data.value.length === 0) {
    pending.resolve(null);
    return;
  }
  const id = crypto.randomUUID();
  secretWorkingSet.set(id, { label: pending.label, value: data.value });
  pending.resolve({ id, label: pending.label });
}

// Recursively replace `{{secret:<id>}}` tokens in strings with the
// working-set value for that id. Non-string / non-object values
// pass through. Unknown ids are left as the literal handle (safer
// than throwing — the downstream tool will then see a placeholder
// it can surface meaningfully rather than an unhelpful exception).
function substituteSecretHandles(args) {
  const HANDLE_RE = /\{\{secret:([^}\s]+)\}\}/g;
  const walk = (v) => {
    if (typeof v === 'string') {
      return v.replace(HANDLE_RE, (match, id) => {
        const entry = secretWorkingSet.get(id);
        return entry ? entry.value : match;
      });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(args);
}

/**
 * Send a desktop automation command to Tauri frontend and wait for the
 * response. The frontend calls the Tauri Rust command and sends back the
 * result.
 */
// Per-action timeout envelopes. Browser lifecycle actions are cold-start
// heavy: browser_launch spawns node + imports Playwright (~100MB of JS),
// and the first navigate boots Chromium itself — on a loaded machine that
// chain legitimately takes 20-40s. A flat 15s made the sidecar give up while
// the launch was still succeeding underneath it. Quick UIA actions keep the
// tight envelope so a genuinely-hung action still fails fast.
const DESKTOP_TIMEOUTS = {
  browser_launch: 60000,
  browser_send: 45000,   // navigate/snapshot ride this — page loads + first Chromium boot
  browser_close: 20000,
};

function desktopRequest(action, args = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `du_${++desktopRequestId}`;
    const timeoutMs = DESKTOP_TIMEOUTS[action] ?? 15000;
    const timeout = setTimeout(() => {
      pendingDesktop.delete(requestId);
      reject(new Error(`Desktop automation request timed out: ${action}`));
    }, timeoutMs);

    pendingDesktop.set(requestId, {
      resolve: (result) => { clearTimeout(timeout); resolve(result); },
      reject: (err) => { clearTimeout(timeout); reject(err); },
    });

    emit({ event: 'desktop_request', requestId, action, ...args });
  });
}

/** Input bridge — text + key, plus coordinate click for the vision lane
 *  (UIA name-based targeting stays the primary path; coordinates are only
 *  used when an element was grounded visually). */
const inputBridge = {
  async typeText(text) { await desktopRequest('type_text', { text }); },
  async keyPress(key) { await desktopRequest('key_press', { key }); },
  async click(x, y) { await desktopRequest('click', { x, y }); },
};

/**
 * Vision bridge (Phase C3) — visual grounding for windows the accessibility
 * tree and DOM can't see. Cloud lane: screenshot → Holo (H Company, OpenAI-
 * compatible) → {x,y} in [0,1000] → screen pixels. The user's perception
 * setting gates everything: 'off' = never capture; the local lane lands when
 * the packaged small models ship. A screenshot ONLY leaves the machine on
 * the cloud lane the user explicitly enabled.
 */
const visionBridge = {
  // Modes are CONSENT, not preference (decision 2026-06-10 — vision is FREE
  // on every lane):
  //   'off'   — never capture the screen.
  //   'local' — Private: on-device model ONLY. Never falls through to cloud;
  //             a screenshot leaving the machine under "Private" would be a
  //             broken promise, not a fallback.
  //   'cloud' — Fast: user's own H Company key if present, else the free
  //             platform proxy (signed-in).
  isAvailable() {
    const ss = globalThis._sharedState || {};
    const mode = ss.desktopVisionMode || 'off';
    if (mode === 'off') return false;
    if (mode === 'local') return !!ss.localVisionEndpoint; // set when the on-device model is installed
    return !!(ss.hcompanyApiKey || ss.platformKey);
  },
  async localize(targetDescription) {
    const ss = globalThis._sharedState || {};
    if (!this.isAvailable()) return null;
    const shot = await desktopRequest('capture_screen');
    const { image, width, height } = shot?.data ?? shot ?? {};
    if (!image) return null;

    // Normalized [0,1000] from the ONE lane the user consented to.
    const mode = ss.desktopVisionMode || 'off';
    let norm = null;
    if (mode === 'local') {
      norm = await holoLocalizeLocal(ss.localVisionEndpoint, image, targetDescription);
    } else if (ss.hcompanyApiKey) {
      norm = await holoLocalizeDirect(ss.hcompanyApiKey, image, targetDescription);
    } else {
      norm = await holoLocalizePlatform(ss.platformKey, image, targetDescription);
    }
    if (!norm) return null;
    return {
      x: Math.round((norm.x / 1000) * (width || 0)),
      y: Math.round((norm.y / 1000) * (height || 0)),
    };
  },
};

/**
 * Private-lane engine management. When the user picks Private and the model
 * is installed, the sidecar runs llama-server on localhost and registers the
 * endpoint. Idempotent; killed with the sidecar so nothing lingers.
 */
let localVisionProc = null;
async function ensureLocalVisionServer() {
  const ss = globalThis._sharedState || {};
  if (ss.localVisionEndpoint) return ss.localVisionEndpoint;
  const { existsSync } = await import('node:fs');
  const { spawn } = await import('node:child_process');
  const model = join(AVA_HOME, 'models', 'holo-3.1-08b-Q4_K_M.gguf');
  const mmproj = join(AVA_HOME, 'models', 'mmproj-holo-3.1-08b-f16.gguf');
  const bin = join(AVA_HOME, 'bin', 'llama-server.exe');
  if (!existsSync(model) || !existsSync(mmproj) || !existsSync(bin)) return null;
  const port = 8123;
  localVisionProc = spawn(bin, [
    '-m', model, '--mmproj', mmproj,
    '--port', String(port), '--host', '127.0.0.1', '-c', '8192', '--jinja',
  ], { stdio: 'ignore', detached: false });
  localVisionProc.on('exit', () => {
    localVisionProc = null;
    if (globalThis._sharedState) globalThis._sharedState.localVisionEndpoint = null;
  });
  // Wait for the model to load (~15-30s on first start).
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 45; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) {
        ss.localVisionEndpoint = base;
        emit({ event: 'info', message: 'Private vision: on-device model loaded.' });
        return base;
      }
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  emit({ event: 'info', message: 'Private vision: local engine failed to start.' });
  try { localVisionProc?.kill(); } catch { /* already dead */ }
  return null;
}
process.on('exit', () => { try { localVisionProc?.kill(); } catch { /* gone */ } });

// Where the packaged model files are hosted. Overridable for testing;
// the public host is decided by the operator (publishing is held) — until
// it exists the download button reports an honest error instead of working
// by accident.
const LOCAL_VISION_BASE_URL = process.env.AVA_VISION_MODEL_BASE
  || 'https://github.com/AugmentedValueAcceleration/ava-models/releases/download/holo-vision-v1';
const LOCAL_VISION_FILES = [
  { name: 'holo-3.1-08b-Q4_K_M.gguf', bytes: 673_000_000 },
  { name: 'mmproj-holo-3.1-08b-f16.gguf', bytes: 207_000_000 },
];

/** One-time Private-lane model download with progress events. */
async function handleDownloadLocalVisionModel() {
  const { mkdir, rename } = await import('node:fs/promises');
  const { createWriteStream, existsSync } = await import('node:fs');
  const dir = join(AVA_HOME, 'models');
  await mkdir(dir, { recursive: true });
  const totalBytes = LOCAL_VISION_FILES.reduce((s, f) => s + f.bytes, 0);
  let doneBytes = 0;
  try {
    for (const f of LOCAL_VISION_FILES) {
      const dest = join(dir, f.name);
      if (existsSync(dest)) { doneBytes += f.bytes; continue; }
      const resp = await fetch(`${LOCAL_VISION_BASE_URL}/${f.name}`);
      if (!resp.ok || !resp.body) throw new Error(`download failed (${resp.status}) for ${f.name}`);
      const tmp = `${dest}.part`;
      const out = createWriteStream(tmp);
      const reader = resp.body.getReader();
      let lastPct = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out.write(Buffer.from(value));
        doneBytes += value.byteLength;
        const pct = Math.min(99, Math.floor((doneBytes / totalBytes) * 100));
        if (pct !== lastPct) { lastPct = pct; emit({ event: 'local_vision_download_progress', pct }); }
      }
      await new Promise((res, rej) => out.end((err) => err ? rej(err) : res()));
      await rename(tmp, dest);
    }
    emit({ event: 'local_vision_download_done' });
    emit({ event: 'info', message: 'Private vision: model downloaded and installed.' });
    // If the user is already on Private, bring the engine up now.
    if ((globalThis._sharedState?.desktopVisionMode || 'off') === 'local') {
      ensureLocalVisionServer().catch(() => {});
    }
  } catch (err) {
    emit({ event: 'local_vision_download_error', message: err?.message || String(err) });
  }
}

/** Private lane — on-device llama-server (OpenAI-compatible), localhost only. */
async function holoLocalizeLocal(endpoint, imageB64, targetDescription) {
  const resp = await fetch(`${endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'holo',
      max_tokens: 128,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } },
          { type: 'text', text: `Localize this element on the screenshot: ${targetDescription}\nReturn ONLY the coordinates as JSON {"x": <0-1000>, "y": <0-1000>} (normalized to the image). No prose.` },
        ],
      }],
    }),
  });
  if (!resp.ok) throw new Error(`Local vision failed (${resp.status})`);
  const data = await resp.json();
  return parseHoloCoords(data?.choices?.[0]?.message?.content);
}

/** Tolerant coordinate parse: {"x":512,"y":340} | Click(512, 340) | (512, 340) */
function parseHoloCoords(text) {
  const m = String(text ?? '').match(/"x"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"y"\s*:\s*(\d+(?:\.\d+)?)/)
    || String(text ?? '').match(/\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  if (!m) return null;
  const x = Number(m[1]); const y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** BYOK lane — the user's own H Company key, straight to the API. */
async function holoLocalizeDirect(apiKey, imageB64, targetDescription) {
  const resp = await fetch('https://api.hcompany.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'holo3-1-35b-a3b',
      max_tokens: 128,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } },
          { type: 'text', text: `Localize this element on the screenshot: ${targetDescription}\nReturn ONLY the coordinates as JSON {"x": <0-1000>, "y": <0-1000>} (normalized to the image). No prose.` },
        ],
      }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Holo vision request failed (${resp.status}): ${errText.slice(0, 160)}`);
  }
  const data = await resp.json();
  return parseHoloCoords(data?.choices?.[0]?.message?.content);
}

/** Platform free lane — signed-in users, no key, no charge. */
async function holoLocalizePlatform(platformKey, imageB64, targetDescription) {
  const resp = await fetch('https://ava-supernova.com/api/desktop/vision', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${platformKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageB64, target: targetDescription }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Platform vision request failed (${resp.status}): ${errText.slice(0, 160)}`);
  }
  const data = await resp.json();
  return data?.found ? { x: Number(data.x), y: Number(data.y) } : null;
}

/** App launcher bridge — narrow scoped replacement for `bash` in desktop mode. */
const appLauncherBridge = {
  async launch(app) {
    const result = await desktopRequest('launch_app', { name: app });
    return result.data;
  },
};

/** UI Automation bridge — structured element detection */
const uiaBridge = {
  async listElements() {
    const result = await desktopRequest('list_ui_elements');
    return result.data;
  },
  async findElement(name) {
    const result = await desktopRequest('find_ui_element', { name });
    return result.data;
  },
  async clickElement(name) {
    const result = await desktopRequest('click_element', { name });
    return result.data;
  },
  async focusWindow(name) {
    const result = await desktopRequest('focus_window', { name });
    return result.data;
  },
  async foregroundWindowTitle() {
    const result = await desktopRequest('get_foreground_window_title');
    return typeof result?.data === 'string' ? result.data : '';
  },
  async listWindows() {
    const result = await desktopRequest('list_windows');
    return Array.isArray(result?.data) ? result.data : [];
  },
};

/**
 * Snapshot current desktop state for injection into the model's context
 * at the start of a desktop-mode turn. Gives Ava real eyes instead of
 * making her guess. Short timeout + swallowed errors — a failed capture
 * must never block the agent from running.
 *
 * Returns an empty string on failure, which callers detect to skip the
 * inject entirely rather than pollute context with noise.
 */
async function captureDesktopContext() {
  try {
    const [title, elementsRaw, windowsRaw] = await Promise.all([
      uiaBridge.foregroundWindowTitle().catch(() => ''),
      uiaBridge.listElements().catch(() => []),
      uiaBridge.listWindows().catch(() => []),
    ]);
    const windows = Array.isArray(windowsRaw) ? windowsRaw : [];

    const elements = Array.isArray(elementsRaw) ? elementsRaw : [];
    // Trim to the highest-signal subset: interactable controls, named
    // elements, first ones encountered in tree order. The full list can
    // easily be 50+ entries which wastes context.
    const isInteresting = (e) => {
      if (!e) return false;
      const ct = String(e.control_type || '').toLowerCase();
      if (ct.includes('group') || ct.includes('pane') || ct === 'custom') return false;
      return Boolean(e.name);
    };
    const interesting = elements.filter(isInteresting).slice(0, 12);

    if (!title && interesting.length === 0 && windows.length === 0) return '';

    const lines = [];
    if (title) lines.push(`Foreground window: "${title}"`);
    if (interesting.length > 0) {
      const bits = interesting.map((e) => `${e.control_type}: "${e.name}"`);
      lines.push(`Visible controls: ${bits.join(' · ')}`);
    }
    // Other open top-level windows — so Ava reuses an existing one (focus/restore)
    // instead of relaunching, and knows what's still open after a task finishes.
    const otherWindows = windows
      .filter((w) => w && w.title && w.title !== title)
      .slice(0, 15)
      .map((w) => `"${w.title}"${w.minimized ? ' (minimised)' : ''}`);
    if (otherWindows.length > 0) {
      lines.push(`Other open windows (reuse with desktop_focus_window instead of relaunching): ${otherWindows.join(', ')}`);
    }
    return `[Desktop state] ${lines.join(' — ')}`;
  } catch {
    return '';
  }
}

// ─── NDJSON I/O ─────────────────────────────────────────────────────────────

function emit(event) {
  // Stamp the lane of the in-flight turn so the IDE's two chat surfaces (main
  // chat + the Ava Health room) each render only their own stream. Default
  // 'main', so existing behaviour is unchanged; the health surface opts in by
  // filtering for lane === 'health'. Additive — non-chat consumers ignore it.
  if (event && event.lane === undefined) event.lane = activeLane;
  // All output goes to stdout as single-line JSON
  process.stdout.write(JSON.stringify(event) + '\n');
}

function emitError(message) {
  emit({ event: 'error', message });
}

// ── Account-scoped data root ─────────────────────────────────────────────────
// All per-account data (health, memory, journal, tasks) lives under
// ~/.ava/users/<id>/ so the sidecar reads AND writes the SAME files as the
// extension and the IDE webview — one source of truth per account on a machine.
// Resolved once at startup from the platform key; falls back to AVA_HOME (BYOK /
// no account) so local-only users keep the flat layout. Machine assets (models,
// bin, the shared config, backups) stay at AVA_HOME, not here.
let ACCOUNT_ROOT = AVA_HOME;
async function resolveAccountRoot(platformKey) {
  if (!platformKey) return;
  try {
    const res = await fetch('https://ava-supernova.com/api/account-info', {
      headers: { Authorization: `Bearer ${platformKey}`, 'User-Agent': 'ava-ide-sidecar' },
    });
    if (!res.ok) return;
    const d = await res.json();
    if (d?.id) ACCOUNT_ROOT = join(AVA_HOME, 'users', String(d.id));
  } catch { /* keep AVA_HOME — local-only fallback */ }
}

/** Compact summary of the local health + general profiles for the Health Room
 *  prefix (mirrors the extension's getHealthProfileSummary). Body basics come
 *  from general.json; goals/constraints/schedule from health/profile.json.
 *  Returns undefined when essentially empty so the room asks for the gaps. */
function getHealthProfileSummary() {
  try {
    let p = null;
    let g = null;
    try { p = JSON.parse(readFileSync(join(ACCOUNT_ROOT, 'health', 'profile.json'), 'utf-8')); } catch { /* none */ }
    try { g = JSON.parse(readFileSync(join(ACCOUNT_ROOT, 'general.json'), 'utf-8')); } catch { /* none */ }
    const sex = g?.sex ?? p?.body?.sex;
    const dob = g?.date_of_birth ?? p?.body?.date_of_birth;
    const heightCm = g?.height_cm ?? p?.body?.height_cm;
    const weightKg = g?.weight_kg ?? p?.body?.weight_kg;
    const lines = [];
    if (p?.goals?.primary) lines.push(`Primary goal: ${String(p.goals.primary).replace(/_/g, ' ')}`);
    if (p?.goals?.weekly_focus) lines.push(`This week's focus: ${p.goals.weekly_focus}`);
    if (sex) lines.push(`Sex: ${sex}`);
    if (dob) {
      const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
      if (age > 0 && age < 130) lines.push(`Age: ${age}`);
    }
    if (heightCm) lines.push(`Height: ${heightCm} cm`);
    if (weightKg) lines.push(`Weight: ${weightKg} kg`);
    if (p?.constraints?.allergens?.length) lines.push(`Allergens: ${p.constraints.allergens.join(', ')}`);
    if (p?.constraints?.dietary?.length) lines.push(`Dietary preferences: ${p.constraints.dietary.join(', ')}`);
    if (p?.constraints?.injuries?.length) lines.push(`Injuries / limitations: ${p.constraints.injuries.join(', ')}`);
    if (p?.constraints?.equipment_available?.length) lines.push(`Equipment available: ${p.constraints.equipment_available.join(', ')}`);
    if (p?.constraints?.minutes_per_day_target) lines.push(`Time budget per day: ${p.constraints.minutes_per_day_target} minutes`);
    const tw = p?.schedule?.training_window;
    if (tw?.start && tw?.end) lines.push(`Training window: ${tw.start}–${tw.end}`);
    const mt = p?.schedule?.meal_times;
    if (mt && (mt.breakfast || mt.lunch || mt.dinner)) {
      const parts = [mt.breakfast && `breakfast ${mt.breakfast}`, mt.lunch && `lunch ${mt.lunch}`, mt.dinner && `dinner ${mt.dinner}`].filter(Boolean);
      if (parts.length) lines.push(`Meal times: ${parts.join(', ')}`);
    }
    const cookLine = summariseCookingTime(p?.schedule?.cooking_time);
    if (cookLine) lines.push(cookLine);
    if (p?.food?.likes?.length) lines.push(`Food likes: ${p.food.likes.join(', ')}`);
    if (p?.food?.dislikes?.length) lines.push(`Food dislikes (keep out of plans): ${p.food.dislikes.join(', ')}`);
    if (p?.food?.cuisines?.length) lines.push(`Favourite cuisines: ${p.food.cuisines.join(', ')}`);
    return lines.length ? lines.join('\n') : undefined;
  } catch {
    return undefined;
  }
}

/** Compact summary of the user's current (non-archived) plans for the Health
 *  Room prefix, so Ava knows what exists and can EDIT it with health_plan_update_day
 *  instead of only building new ones. Returns undefined when there are none. */
function getHealthPlansSummary() {
  try {
    const dir = join(ACCOUNT_ROOT, 'health', 'plans');
    let files;
    try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return undefined; }
    const lines = [];
    for (const f of files) {
      let p;
      try { p = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
      if (!p || p.schema_version !== 1 || p.status === 'archived') continue;
      const days = Array.isArray(p.days) ? p.days : [];
      const dayBits = days.map((d) => {
        const bits = [`day ${d.day_index}`, d.kind || 'rest'];
        if (d.title) bits.push(d.title);
        const t = Array.isArray(d.training) ? d.training.length : 0;
        const m = Array.isArray(d.meals) ? d.meals.length : 0;
        if (t) bits.push(`${t} exercise${t === 1 ? '' : 's'}`);
        if (m) bits.push(`${m} meal${m === 1 ? '' : 's'}`);
        return bits.join(' · ');
      });
      const started = p.start_date ? `, started ${p.start_date}` : '';
      lines.push(`- "${p.title}" (${p.type}, ${p.status}${started}, ${days.length} days) — id: ${p.id}\n  ${dayBits.join('\n  ')}`);
    }
    return lines.length ? lines.join('\n') : undefined;
  } catch {
    return undefined;
  }
}

/** Learning-room context for the Teach prefix — the learner's active courses,
 *  full course list and skills profile (earned + self-listed). Reads the same
 *  learning.json / learner.json the learning tools write, then defers to the
 *  shared core formatter so the IDE and extension build identical context.
 *  Returns undefined when there's nothing to inject. */
function getLearningContext() {
  try {
    if (typeof formatLearnerContext !== 'function') return undefined;
    let store;
    try { store = JSON.parse(readFileSync(join(ACCOUNT_ROOT, 'learning.json'), 'utf-8')); } catch { return undefined; }
    let selfSkills = [];
    try {
      const learner = JSON.parse(readFileSync(join(ACCOUNT_ROOT, 'learner.json'), 'utf-8'));
      if (Array.isArray(learner?.self?.skills)) selfSkills = learner.self.skills;
    } catch { /* no learner profile yet */ }
    return formatLearnerContext(store, selfSkills);
  } catch {
    return undefined;
  }
}

// ── Profile-fill (health_profile_ask) ────────────────────────────────────────
// Mirror of the extension's AvaViewProvider flow. The card payload + save both
// resolve the field shape from the shared core HEALTH_PROFILE_FIELDS registry,
// so "what Ava asks", "what the card renders", and "where it saves" never drift.
const generalProfilePath = () => join(ACCOUNT_ROOT, 'general.json');
const healthProfilePath = () => join(ACCOUNT_ROOT, 'health', 'profile.json');

function readJsonFile(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}
function emptyGeneralProfile() {
  return { schema_version: 1, updated_at: null, display_name: null, sex: null, date_of_birth: null, height_cm: null, weight_kg: null, body_fat_pct: null, units: 'metric' };
}
function emptyHealthProfileObj() {
  return {
    schema_version: 1, updated_at: null,
    goals: { primary: null, weekly_focus: null },
    constraints: { allergens: [], dietary: [], injuries: [], equipment_available: [], minutes_per_day_target: null },
    food: { likes: [], dislikes: [], cuisines: [] },
    schedule: { training_window: { start: null, end: null }, meal_times: { breakfast: null, lunch: null, dinner: null }, sleep_target: { bedtime: null, wake: null } },
  };
}
function getByPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setByPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}
// Normalise the cooking-time grid: keep only valid day keys ('0'–'6') and tiers
// ('15'|'30'|'60'|'60+'), and drop days where every meal is unset.
const COOK_TIER_SET = new Set(['15', '30', '60', '60+']);
function coerceCookingGrid(raw) {
  const out = {};
  const byDay = raw?.by_day;
  if (byDay && typeof byDay === 'object') {
    for (const key of Object.keys(byDay)) {
      if (!/^[0-6]$/.test(key)) continue;
      const d = byDay[key] ?? {};
      const tier = (v) => (typeof v === 'string' && COOK_TIER_SET.has(v) ? v : null);
      const day = { breakfast: tier(d.breakfast), lunch: tier(d.lunch), dinner: tier(d.dinner) };
      if (day.breakfast || day.lunch || day.dinner) out[key] = day;
    }
  }
  return { by_day: out };
}
function coerceProfileFieldValue(def, raw) {
  switch (def.control) {
    case 'number': {
      if (raw === '' || raw == null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'multiselect':
      return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
    case 'cooking_grid':
      return coerceCookingGrid(raw);
    case 'text': {
      if (def.asArray) {
        const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('\n') : '';
        return s.split('\n').map((x) => x.trim()).filter(Boolean);
      }
      return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    }
    default: // select, date
      return typeof raw === 'string' && raw ? raw : null;
  }
}
function describeProfileValue(def, value) {
  if (value == null || (Array.isArray(value) && value.length === 0)) return 'none';
  if (def.control === 'cooking_grid') {
    const s = summariseCookingTime(value);
    return s ? s.replace(/^Cooking time[^:]*:\s*/, '').replace(/\.$/, '') : 'none';
  }
  if (Array.isArray(value)) return value.map((v) => humaniseSlug(String(v))).join(', ');
  if (def.control === 'number' && def.unit) return `${value} ${def.unit}`;
  if (def.control === 'select') return humaniseSlug(String(value));
  return String(value);
}
/** Build the confirm-card payload for a health_profile_ask: field id, Ava's
 *  question, and the current saved value (so the card pre-selects). */
function buildProfileFieldPayload(args) {
  const field = typeof args?.field === 'string' ? args.field : '';
  const def = HEALTH_PROFILE_FIELDS?.[field];
  if (!def) return undefined;
  const question = typeof args?.question === 'string' ? args.question : '';
  let currentValue;
  try {
    const store = def.target === 'general' ? readJsonFile(generalProfilePath()) : readJsonFile(healthProfilePath());
    if (store) currentValue = getByPath(store, def.path);
  } catch { /* default empty */ }
  return { field, question, currentValue };
}
/** Save one profile field's answer to general.json / health/profile.json and
 *  re-emit the updated profile so the IDE profile pages refresh. Returns a short
 *  confirmation for Ava. */
function applyProfileField(field, rawValue) {
  const def = HEALTH_PROFILE_FIELDS?.[field];
  if (!def) return `Couldn't save — unknown field "${field}".`;
  const value = coerceProfileFieldValue(def, rawValue);
  const label = field.replace(/_/g, ' ');
  try {
    if (def.target === 'general') {
      const g = readJsonFile(generalProfilePath()) ?? emptyGeneralProfile();
      setByPath(g, def.path, value);
      g.updated_at = new Date().toISOString();
      mkdirSync(ACCOUNT_ROOT, { recursive: true });
      writeFileSync(generalProfilePath(), JSON.stringify(g, null, 2), 'utf-8');
      emit({ event: 'general_profile_saved', profile: g });
    } else {
      const h = readJsonFile(healthProfilePath()) ?? emptyHealthProfileObj();
      setByPath(h, def.path, value);
      h.updated_at = new Date().toISOString();
      mkdirSync(join(ACCOUNT_ROOT, 'health'), { recursive: true });
      writeFileSync(healthProfilePath(), JSON.stringify(h, null, 2), 'utf-8');
      emit({ event: 'health_profile_saved', profile: h });
    }
  } catch (err) {
    return `Tried to save ${label} but hit an error: ${err?.message || err}.`;
  }
  return `Saved ${label}: ${describeProfileValue(def, value)}.`;
}

/** Create a task the user accepted from a task_suggest card. Global scope,
 *  source 'ava' (she proposed it, they accepted). Returns a confirmation. */
async function createSuggestedTask(p) {
  if (!taskManager) return 'Task manager unavailable.';
  const title = String(p?.title ?? '').trim();
  if (!title) return 'No task title.';
  try {
    await taskManager.addTask({
      title,
      description: p.description,
      priority: p.priority ?? 'medium',
      category: p.category ?? 'personal',
      dueDate: p.due_date,
      dueTime: p.due_time,
      reminderLead: p.reminder_lead,
      recurrence: p.recurrence ?? 'none',
      subtasks: Array.isArray(p.subtasks) ? p.subtasks.map((t) => ({ id: crypto.randomUUID(), title: t, done: false })) : undefined,
      scope: 'global',
      source: 'ava',
    });
  } catch (err) {
    return `Tried to add "${title}" but hit an error: ${err?.message || err}.`;
  }
  return `Added "${title}" to their tasks.`;
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
  initInFlight = true;
  try {
    // If this init replaces an existing session (project / conversation
    // switch from the IDE front-end), reflect the OUTGOING conversation into
    // memory before we tear it down. Fire-and-forget; the outgoing memory
    // agent holds its own memoryManager, so facts land in the project that's
    // ending — not the one we're opening. No-op on first init (no prior
    // conversation).
    if (memoryAgentInstance && conversation) {
      Promise.resolve(memoryAgentInstance.reflectOnSession(conversation.getMessages(), conversation.id)).catch(() => {});
    }
    const config = data.config || {};
    // SECURITY: cwd must be a specific project folder, never fallback to home directory.
    // If no folder is set, use the process cwd (where the sidecar was launched from).
    const path = await import('path');
    let cwd = (config.cwd && config.cwd !== '.' && config.cwd !== '~') ? config.cwd : process.cwd();
    cwd = path.default.resolve(cwd);
    if (cwd.includes('..')) { cwd = process.cwd(); }
    // Change Node.js working directory so relative paths resolve correctly
    try { process.chdir(cwd); } catch { /* non-fatal */ }
    const projectRoot = detectProjectRoot(cwd) ?? undefined;
    // Stash for the audit security lens (out-of-workspace detection) — the
    // get_audit_log handler runs outside this scope.
    globalThis.__avaProjectRoot = projectRoot ?? cwd;
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

    // Register local / custom OpenAI-compatible provider — Ollama, LM Studio,
    // vLLM, or anything else speaking the OpenAI Chat Completions API. The
    // user supplies baseUrl + modelName via the IDE Settings page, persisted
    // to localStorage and passed through here on init.
    // Enabled-model list from Detect; fall back to the single manual name.
    let localModelIds = Array.isArray(config.local?.models)
      ? config.local.models.filter((m) => typeof m === 'string' && m.trim())
      : [];
    if (localModelIds.length === 0 && config.local?.modelName) localModelIds = [config.local.modelName];

    if (config.local?.baseUrl && localModelIds.length > 0) {
      try {
        // A custom display label only applies to a single registered model;
        // a detected library shows each model by its own id.
        const singleLabel = config.local.modelLabel && localModelIds.length === 1 ? config.local.modelLabel : undefined;
        const localModels = localModelIds.map((id) => ({
          id,
          name: singleLabel || id,
          provider: 'generic',
          contextWindow: 32000,
          maxOutputTokens: 4096,
          supportsToolCalls: true,
          supportsStreaming: true,
        }));
        const localProvider = new GenericProvider({
          apiKey: config.local.apiKey || 'local',
          baseUrl: config.local.baseUrl,
          models: localModels,
        });
        providerRegistry.registerCustom('generic', localProvider);
        emit({ event: 'info', message: `Local provider registered: ${localModelIds.length} model(s) @ ${config.local.baseUrl}` });
      } catch (err) {
        emit({ event: 'info', message: `Local provider error: ${err.message}` });
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
    let activeModel = config.activeModel || 'platform:qwen3.5-flash';
    emit({ event: 'info', message: `Resolving model: ${activeModel}` });
    let resolved = providerRegistry.resolveModel(activeModel);

    // If BYOK model not found, try platform models
    if (!resolved && config.platformKey) {
      const platformFallbacks = ['platform:qwen3.5-flash', 'platform:qwen3.5-omni-flash', 'platform:qwen3.5-omni-plus', 'platform:qwen3.5-plus'];
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
    toolRegistry.registerBuiltins();
    toolRegistry.setPermissionMode(config.permissionMode || 'balanced');

    // ── Desktop Automation Mode — Tools live in @ava/core ───────────────
    // The desktop_* and browser_* tool classes are registered by
    // toolRegistry.registerBuiltins() above. They call into the Tauri
    // layer via the providers on sharedState (uiaProvider, inputProvider,
    // browserProvider). Nothing is registered inline here.
    //
    // Schema visibility per mode is enforced inside agent.ts: when the
    // user message has a [Desktop Automation Mode] prefix, the agent
    // applies MODE_ALLOWED_TOOLS.desktop; when no prefix is present
    // (default work / code turns), the agent applies DESKTOP_ONLY_TOOLS
    // as a deny-list so desktop_* / browser_* never leak into a coding
    // turn the operator never asked to spread to the desktop.
    //
    // DELETED (replaced by core tools): browser_navigate, browser_snapshot,
    // browser_click, browser_type, browser_close, desktop_list_elements,
    // desktop_click_by_name, desktop_type, desktop_key_press,
    // desktop_focus_window. Also deleted: desktop_screenshot and
    // desktop_click_xy — spec §2 classifies pixel-based targeting as a
    // failure mode; the pivot uses UIA tree + Playwright DOM exclusively.

    // Browser bridge — fulfils the @ava/core BrowserProvider contract by
    // round-tripping through the IDE frontend via desktopRequest, which
    // calls the Rust browser_launch + browser_send Tauri commands. The
    // Playwright worker (src-tauri/resources/browser-worker.mjs) handles
    // the actual navigate/snapshot/click/type/close operations.
    //
    // NOTE: `browserLaunched` lives at module scope so handleMessage's
    // finally block can auto-close at end of turn.
    async function ensureBrowser() {
      if (browserLaunched) return;
      try {
        await desktopRequest('browser_launch');
        browserLaunched = true;
      } catch (launchErr) {
        const msg = String(launchErr.message || launchErr);
        if (/already running/i.test(msg)) {
          browserLaunched = true;
          return;
        }
        throw new Error(
          `browser_launch failed: ${msg}. The Ava browser worker could not start — ` +
          `check that Playwright is installed and the Tauri dev server has picked up the latest Rust changes.`
        );
      }
    }
    async function browserSend(action, params) {
      await ensureBrowser();
      const res = await desktopRequest('browser_send', { browserAction: action, params });
      const payload = res?.data ?? res?.result ?? res;
      if (payload && typeof payload === 'object' && payload.ok === false) {
        // Stale-state recovery: if the worker reports a dead browser (user
        // closed Chromium, crash, disconnect), fully reset both sidecar and
        // Rust state and retry once. Without this, every second browser task
        // would fail and Ava would have to restart the session manually.
        const errMsg = String(payload.error || '');
        if (/browser has been closed|not connected|disconnected|launch first/i.test(errMsg)) {
          try { await desktopRequest('browser_close'); } catch {}
          browserLaunched = false;
          await ensureBrowser();
          const retry = await desktopRequest('browser_send', { browserAction: action, params });
          const retryPayload = retry?.data ?? retry?.result ?? retry;
          if (retryPayload && typeof retryPayload === 'object' && retryPayload.ok === false) {
            throw new Error(retryPayload.error || `browser ${action} failed after reset`);
          }
          return retryPayload?.result ?? retryPayload;
        }
        throw new Error(errMsg || `browser ${action} returned ok:false`);
      }
      return payload?.result ?? payload;
    }
    const browserBridge = {
      async navigate(url) {
        const result = await browserSend('navigate', { url });
        return { url: result?.url ?? url, title: result?.title ?? '' };
      },
      async snapshot() {
        // The worker returns { title, url, links[], buttons[], inputs[] };
        // flatten into our typed BrowserSnapshot shape.
        const raw = await browserSend('snapshot', {});
        const elements = [];
        for (const l of raw?.links || []) {
          elements.push({ tag: 'link', selector: l.selector, text: l.text, href: l.href });
        }
        for (const b of raw?.buttons || []) {
          elements.push({ tag: 'button', selector: b.selector, text: b.text });
        }
        for (const i of raw?.inputs || []) {
          elements.push({ tag: i.type === 'textarea' ? 'textarea' : 'input', selector: i.selector, placeholder: i.placeholder });
        }
        return { url: raw?.url ?? '', title: raw?.title ?? '', elements };
      },
      async click(selector) { await browserSend('click', { selector }); },
      async type(text, selector) { await browserSend('type', selector ? { text, selector } : { text }); },
      async key(key) { await browserSend('key', { key }); },
      async scroll(direction, amount) { await browserSend('scroll', { direction, amount }); },
      // Perception must only snapshot an ALREADY-open browser — snapshot()
      // would otherwise launch Chromium as a side effect of looking.
      isLive() { return browserLaunched; },
      async close() {
        try { await desktopRequest('browser_close'); }
        catch (err) {
          const msg = String(err.message || err);
          if (!/not running|already closed/i.test(msg)) throw err;
        }
        browserLaunched = false;
      },
    };

    // Confirmation handler — pauses and waits for IDE response
    // toolCallId is forwarded so the IDE frontend can attach the confirmation
    // card to the exact tool call instance, fixing the first-ask race where
    // the buttons rendered without working onClick handlers.
    toolRegistry.setConfirmationHandler(async (toolName, args, toolCallId) => {
      const id = crypto.randomUUID().slice(0, 8);
      const toolCategory = toolRegistry.getCategoryForTool(toolName);
      const extra = toolName === 'health_profile_ask' ? { profileField: buildProfileFieldPayload(args) } : {};
      emit({ event: 'confirm_required', id, toolCallId, toolName, toolCategory, args, ...extra });
      return new Promise((resolve) => {
        pendingConfirmations.set(id, { resolve, toolName });
      });
    });

    // Secret handle substitution — runs after user approval, before the
    // tool's execute(). Confirmation dialogs still see the opaque handle
    // (safe to display); the tool receives the real value. This is the
    // mechanism that makes `secret_request` useful end-to-end in the IDE.
    toolRegistry.setArgsPreprocessor((_toolName, args) => substituteSecretHandles(args));

    // Audit callback — log every tool execution to BOTH the in-memory
    // recent buffer (fast first-paint) AND the persistent JSONL log
    // at ~/.ava/audit-log.jsonl via @ava/core/audit. Same pattern the
    // extension uses, same on-disk file — sign-in agnostic, BYOK
    // friendly, never leaves the user's machine.
    const auditLog = [];
    let appendAuditEntry = null;
    try {
      const audit = await import('@ava/core/audit');
      appendAuditEntry = audit.appendEntry;
    } catch {
      // Optional dep — sidecar still works without persistence.
    }
    // Resolve the account-scoped health root before any health read/write, so
    // the sidecar shares the extension + webview's per-account files.
    await resolveAccountRoot(config.platformKey);
    toolRegistry.setAuditCallback((entry) => {
      auditLog.push(entry);
      if (auditLog.length > 500) auditLog.shift();
      if (appendAuditEntry) {
        try { appendAuditEntry(entry); } catch { /* never break a tool call on audit failure */ }
      }
    });
    globalThis.__avaAuditLog = auditLog;

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
      memoryManager = new MemoryManager({
        // Memory is FLAT, local-only — one store per machine at ~/.ava/memory/,
        // the SAME store the extension + CLI use. (Account-scoping memory was
        // pointless once cloud sync was removed, and it split the IDE off from
        // the extension's memory.)
        globalDir: AVA_HOME,
        projectRoot,
        // Opt-in local semantic recall — dormant until the IDE front-end sends
        // these prefs; off by default → keyword recall, no dependency.
        embeddingService: createEmbeddingServiceFromConfig({
          useLocalEmbeddings: config.useLocalEmbeddings,
          embeddingModel: config.embeddingModel,
          embeddingBaseUrl: config.embeddingBaseUrl,
        }),
      });
    } catch {
      memoryManager = null;
    }
    emit({ event: 'info', message: 'Memory manager created' });

    // Conversation history — account-scoped (ACCOUNT_ROOT/history), byte-identical
    // to the extension's HistoryManager so the files are cross-surface compatible.
    try {
      historyManager = new HistoryManager(projectRoot, ACCOUNT_ROOT);
      await historyManager.init();
    } catch {
      historyManager = null;
    }

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

    // Knowledge packs removed in v0.59.2. The 12 builtin domain packs
    // (marketing, finance, devops, game-development, etc.) added ~750-1000
    // tokens of static framework guidance per matched keyword — content
    // frontier models already cover from training. After the chat-tier
    // rebalance the silent injection started bumping ~1-credit chat
    // turns into the next bracket. Net: small lift, opaque cost.
    const knowledgeContext = undefined;

    // Stash args for rebuild on mode switch. The system prompt now varies
    // with currentMode (desktop mode injects an additional rules block
    // that doesn't apply in code mode), and the operator can toggle modes
    // mid-session via set_mode — when that happens we need to rebuild.
    const systemPromptArgs = {
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
      desktopMode: currentMode === 'desktop',
      // desktopPermissionLevel intentionally omitted at init — currentMode
      // at init is always 'work' so the desktop block isn't rendered yet,
      // and once the operator enters desktop mode the IDE pushes the level
      // via set_desktop_permission_level which triggers a rebuild with the
      // correct value. Avoids the temporal-dead-zone read of sharedState
      // (which is constructed further down in init).
    };
    globalThis._systemPromptArgs = systemPromptArgs;

    // Conversation + system prompt
    conversation = new Conversation();
    conversation.setSystemPrompt(buildSystemPrompt(systemPromptArgs));

    // Inject user identity so Ava knows who she's talking to. Stored as a
    // suffix on globalThis so rebuilds on mode switch can re-append it
    // without losing it.
    let userInfoSuffix = '';
    if (config.userName || config.userEmail) {
      const msgs = conversation.getMessages();
      const sysMsgContent = msgs[0]?.role === 'system' ? msgs[0].content : '';
      const userInfo = [
        config.userName ? `Name: ${config.userName}` : null,
        config.userEmail ? `Email: ${config.userEmail}` : null,
        config.userTier ? `Plan: ${config.userTier}` : null,
      ].filter(Boolean).join(' | ');
      userInfoSuffix = `\n\n[User: ${userInfo}]\nAddress the user by their name when appropriate.`;
      globalThis._systemPromptUserInfoSuffix = userInfoSuffix;
      conversation.setSystemPrompt(sysMsgContent + userInfoSuffix);
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

    // Warm-start: the sidecar deliberately doesn't BLOCK init on memory (the
    // graph can be large). Fulfil the original "load memory in the background"
    // intent here — once loaded, fold the Project Brain into the system prompt
    // so jumping into a project starts warm rather than blank. The first turn
    // may miss it; every turn after has it. Reads globalThis._systemPromptArgs
    // fresh so a mode switch that lands first is preserved, and bails if a
    // newer init has since swapped the conversation/manager out.
    if (memoryManager && conversation) {
      const mm = memoryManager;
      const conv = conversation;
      Promise.resolve(mm.loadAll?.(projectInstructions ?? undefined))
        .then(() => {
          if (conv !== conversation || mm !== memoryManager) return; // a newer init won
          const brief = mm.getProjectBrain?.()?.brief;
          if (brief && globalThis._systemPromptArgs) {
            const newArgs = { ...globalThis._systemPromptArgs, projectBrainBrief: brief };
            globalThis._systemPromptArgs = newArgs;
            const suffix = globalThis._systemPromptUserInfoSuffix || '';
            conversation.setSystemPrompt(buildSystemPrompt(newArgs) + suffix);
            emit({ event: 'info', message: 'Project Brain loaded into system prompt' });
          }
        })
        .catch(() => {});
    }

    // Journal manager (local-first, stored in ~/.ava/journal/)
    journalManager = new JournalManager({ globalDir: ACCOUNT_ROOT, projectRoot: cwd });

    // Task manager — required so AutoCoordinator's TaskExecutor can pick up
    // session tasks created by todo_write and dispatch a Builder per task.
    // Tasks live in a dedicated tasks/ subfolder (mirrors creative/) so the
    // panel's open-folder button has a clean target; migrate any legacy file.
    migrateGlobalTasksToSubfolder(ACCOUNT_ROOT);
    taskManager = new TaskManager({ globalDir: join(ACCOUNT_ROOT, 'tasks'), projectRoot: cwd });

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
      // Machine-global dir (AVA_HOME) — lets record_machine_rule persist a
      // standing rule to <AVA_HOME>/Decisions/machine-rules.md.
      globalDir: AVA_HOME,
      journalManager,
      taskManager,
      // Surface-injected health plan store — Node-fs impl pointed at
      // ~/.ava/health/plans/*.json, the same files the renderer's
      // Tauri-fs store reads/writes. See COMMAND_PALETTE_PLAN.md §10.
      healthPlanStore: new NodeHealthPlanStore({ baseDir: join(ACCOUNT_ROOT, 'health', 'plans') }),
      // Server-side plan generation — health_plan_create calls this when no
      // inline days are passed. Hits /api/health/generate/plan, which charges
      // the flat per-plan fee (single 5 credits/week, combined 10/week),
      // builds the whole plan from the exercise/recipe library, and returns days.
      generateHealthPlanDays: async (i) => {
        if (!config.platformKey) throw new Error('Sign in to your Ava account to generate a plan.');
        let profile = '';
        try {
          profile = JSON.stringify(JSON.parse(readFileSync(join(ACCOUNT_ROOT, 'health', 'profile.json'), 'utf-8'))).slice(0, 1500);
        } catch { /* no local profile — the server handles its absence */ }
        const res = await fetch('https://ava-supernova.com/api/health/generate/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.platformKey}` },
          body: JSON.stringify({ type: i.type, duration_days: i.duration_days, goal: i.goal, title: i.title, profile }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Plan generation failed (${res.status})`);
        return { days: data.days ?? [], credits_charged: data.credits_charged ?? 0 };
      },
      projectIndexer,
      platformKey: config.platformKey,
      qwenApiKey: config.providers?.qwen?.apiKey || process.env.QWEN_API_KEY,
      minimaxApiKey: config.providers?.minimax?.apiKey || process.env.MINIMAX_API_KEY,
      kimiApiKey: config.providers?.kimi?.apiKey || process.env.KIMI_API_KEY,
      deepseekApiKey: config.providers?.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY,
      mistralApiKey: config.providers?.mistral?.apiKey || process.env.MISTRAL_API_KEY,
      anthropicApiKey: config.providers?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY,
      activeModelId: resolved.model.id,
      // Desktop Automation — bridges to Tauri desktop commands. UIA tree
      // for element targeting, narrow app launcher (replaces bash), and
      // Playwright-backed browser via Tauri worker.
      inputProvider: inputBridge,
      uiaProvider: uiaBridge,
      appLauncherProvider: appLauncherBridge,
      browserProvider: browserBridge,
      // Phase C3 — visual grounding. Gated by desktopVisionMode ('off' until
      // the user opts in via the perception setting); cloud lane uses the
      // H Company key (BYOK config or HAI_API_KEY env).
      visionProvider: visionBridge,
      desktopVisionMode: config.desktopVisionMode || 'off',
      hcompanyApiKey: config.providers?.hcompany?.apiKey || process.env.HAI_API_KEY,
      // Desktop safety gate — the @ava/core tools call these on every
      // mutative action. Permission level and budget are read per call;
      // the approval handler emits a confirm_required NDJSON event and
      // awaits the IDE response, reusing the pendingConfirmations map
      // the generic ToolRegistry confirmation path already uses.
      desktopPermissionLevel: config.desktopPermissionLevel || 'ask',
      desktopPrivilegedOptIn: !!config.desktopPrivilegedOptIn,
      desktopBudget: BudgetTracker ? new BudgetTracker() : undefined,
      desktopApprovalHandler: async (toolName, args, classification) => {
        const id = crypto.randomUUID().slice(0, 8);
        emit({
          event: 'confirm_required',
          id,
          toolName,
          toolCategory: 'system',
          args,
          desktopClassification: {
            riskClass: classification.riskClass,
            reasons: classification.reasons,
            requiresSecretHandle: classification.requiresSecretHandle,
          },
        });
        return new Promise((resolve) => {
          pendingConfirmations.set(id, { resolve, toolName });
        });
      },
      desktopAutomationSettings: config.desktopAutomationSettings || undefined,
      // Creative asset cloud sync — gates generate_image / _music / _video /
      // _voice tools' post-write upload. Same formula as learningLocalOnly
      // in the VS Code extension: truthy when the user's Data Mode resolves
      // to local or they've explicitly turned off generation sync. The IDE
      // frontend computes this from its Data Mode state and passes it in
      // via the init config so the sidecar doesn't need to know anything
      // about localStorage / settings storage.
      generationLocalOnly: !!config.generationLocalOnly,
      learningLocalOnly: !!config.learningLocalOnly,
      clientSurface: 'ide',
    };

    // Memory Agent — curates briefs instead of raw memory dumps
    const qwenFlash = providerRegistry.resolveModel('platform:qwen3.5-flash')
      || providerRegistry.resolveModel('platform:qwen3.5-omni-flash')
      || providerRegistry.resolveModel('qwen:qwen3.5-flash');
    if (qwenFlash && memoryManager) {
      memoryAgentInstance = new MemoryAgent({
        memoryManager,
        provider: qwenFlash.provider,
        model: qwenFlash.model,
      });
      sharedState.memoryAgent = memoryAgentInstance;
      emit({ event: 'info', message: 'Memory Agent initialized on ' + qwenFlash.model.id });
    }

    // Intent Classifier — heuristic gate that nudges Ava toward worded
    // replies on conversational/ambiguous turns. Synchronous (no network
    // hop), so wiring it here costs nothing per turn and brings the IDE
    // to feature-parity with the extension's intent-shaped style notes.
    sharedState.intentClassifier = new IntentClassifier();

    // Vision bridge — a vision-capable model (Qwen Omni) used to describe
    // images when the active model is text-only (Supernova/DeepSeek, Aurora/
    // Mistral). The Agent only uses it when its own model can't see images.
    const visionResolved = providerRegistry.resolveModel('platform:qwen3.5-omni-plus')
      || providerRegistry.resolveModel('qwen:qwen3.5-omni-plus')
      || providerRegistry.resolveModel('platform:qwen3.5-omni-flash')
      || providerRegistry.resolveModel('qwen:qwen3.5-omni-flash');

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
      visionProvider: visionResolved?.provider,
      visionModel: visionResolved?.model,
      toolRegistry,
      cwd,
      sharedState,
      secretGranter: requestSecretGrant,
      surface: 'ide',
    });

    // Conductor (persona orchestration)
    conductor = new Conductor({
      provider,
      model: resolved.model,
      visionProvider: visionResolved?.provider,
      visionModel: visionResolved?.model,
      toolRegistry,
      cwd,
      sharedState,
      secretGranter: requestSecretGrant,
      surface: 'ide',
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
    globalThis._activeProvider = resolved.provider;

    emit({ event: 'ready', model: resolved.model.id, provider: resolved.provider.name });
  } catch (err) {
    emitError(`Init failed: ${err.message}`);
  } finally {
    initInFlight = false;
  }
}

// ── Desktop Automation conductor turn ──────────────────────────────────────
// In Desktop Automation Mode the turn is driven by the five-persona conductor
// (Scout → Planner → Actor → Verifier → Narrator) instead of the regular agent
// loop. Narrator lines stream as Ava's message (stream_start/delta/end → done);
// gated actions reuse the confirm_required card; the turn's abort signal (which
// the pause / Ctrl+Alt+K interrupt fires) stops it cleanly. isRunning /
// currentAbort are owned by the caller (handleMessage) and cleared on return.
async function runDesktopConductorTurn(task, signal, contextPrefix = '') {
  const provider = globalThis._activeProvider;
  const model = globalThis._currentModel;
  if (!provider || !model) {
    emitError('No model available for Desktop Automation Mode.');
    emit({ event: 'done', content: '' });
    return null;
  }

  // Fold Path B (standing rules + learned patterns) into the task the Planner
  // reasons over, so it obeys the machine's rules and reuses what worked. The
  // live screen state is NOT folded in — Scout re-captures it fresh each step.
  // CRITICAL framing: recalled memories describe PAST sessions. Without the
  // banner below, the Planner reads a recalled failure log as if it were the
  // current trajectory's history and declares "stuck" before acting (observed:
  // it cited the previous turn's steps as "three consecutive steps with no
  // progress" on step 1 of a fresh task).
  const cleanTask = cleanDesktopTask(task);
  const conductorTask = contextPrefix
    ? `[Notes from PREVIOUS sessions — background knowledge only. These are NOT steps of the current task. The current trajectory starts fresh: zero actions have been taken yet. Any element ids or selectors mentioned in these notes are EXPIRED snapshots — never reuse them; always target elements from the CURRENT screen list.]\n\n${contextPrefix}\n\n[Your task — starting now, from step 1]\n${cleanTask}`
    : cleanTask;

  const ss = globalThis._sharedState || {};
  const providers = {
    uia: ss.uiaProvider,
    input: ss.inputProvider,
    browser: ss.browserProvider,
    appLauncher: ss.appLauncherProvider,
    vision: ss.visionProvider,
  };

  // Planner + Verifier are one-shot completions on the active model.
  const callModel = async ({ systemPrompt, userContent }) => {
    const resp = await provider.createCompletion({
      model: model.id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }, signal);
    return {
      text: resp?.choices?.[0]?.message?.content ?? '',
      tokensIn: resp?.usage?.prompt_tokens ?? 0,
      tokensOut: resp?.usage?.completion_tokens ?? 0,
    };
  };

  // Reuse the existing confirm card + pendingConfirmations resolution.
  const requestApproval = ({ action, classification, element }) => {
    const id = crypto.randomUUID().slice(0, 8);
    emit({
      event: 'confirm_required',
      id,
      toolName: 'desktop_action',
      toolCategory: 'desktop',
      args: {
        kind: action.kind,
        // Non-targeted actions still deserve a subject on the card: navigate
        // shows its URL, launch its app, type its text, key its key.
        target: element?.name || action.target
          || String(action.params?.url ?? action.params?.app ?? action.params?.text ?? action.params?.key ?? ''),
        risk: classification.riskClass,
        reasoning: action.reasoning,
      },
    });
    return new Promise((resolve) => {
      pendingConfirmations.set(id, { resolve: (v) => resolve(!!v), toolName: 'desktop_action' });
    });
  };

  // Narrator lines + per-step lines stream as Ava's message content.
  let fullContent = '';
  const pushLine = (line) => {
    if (!line) return;
    const chunk = `${line}\n`;
    fullContent += chunk;
    emit({ event: 'stream_delta', content: chunk });
  };
  const conductorEmit = (ev) => {
    if (ev.type === 'narrate') pushLine(ev.line);
    else if (ev.type === 'step') {
      pushLine(ev.step?.userUpdate?.line);
      if (ev.header) emit({ event: 'desktop_budget', header: ev.header });
    } else if (ev.type === 'error') {
      emit({ event: 'agent_error', message: ev.message });
    }
  };

  emit({ event: 'stream_start' });

  // Chain approval — Watch and Ask confirm the TASK once, up front. NO mode
  // asks per step: mid-run approval cards steal foreground from the very
  // window being automated, breaking the trajectory they're gating. After
  // the chain is approved, reversible actions flow; irreversible actions
  // STILL confirm individually in EVERY mode — that gate never graduates.
  // Declining stops before anything is touched. Drive skips the upfront card.
  let permissionLevel = ss.desktopPermissionLevel ?? 'ask';
  if (permissionLevel !== 'drive') {
    const chainId = crypto.randomUUID().slice(0, 8);
    emit({
      event: 'confirm_required',
      id: chainId,
      toolName: 'desktop_action',
      toolCategory: 'desktop',
      args: {
        kind: 'run_task',
        target: cleanTask.slice(0, 160),
        risk: 'mutative-reversible',
        reasoning: 'Approve this desktop task as a whole — Ava then runs the steps without interrupting you. Anything irreversible (send, pay, delete…) will still ask individually.',
      },
    });
    const approved = await new Promise((resolve) => {
      pendingConfirmations.set(chainId, { resolve: (v) => resolve(!!v), toolName: 'desktop_action' });
    });
    if (!approved) {
      const declineMsg = 'Understood — leaving the desktop untouched.';
      emit({ event: 'stream_delta', content: declineMsg });
      emit({ event: 'stream_end' });
      emit({ event: 'done', content: declineMsg });
      return null;
    }
    permissionLevel = 'drive';
  }

  let trajectory = null;
  try {
    trajectory = await desktopCore.runDesktopTrajectory({
      task: conductorTask,
      permissionLevel,
      whitelist: Array.isArray(ss.desktopWhitelist) ? ss.desktopWhitelist : [],
      privilegedOptIn: !!ss.desktopPrivilegedOptIn,
      providers,
      callModel,
      requestApproval,
      emit: conductorEmit,
      signal,
      // Trace to a real file — the sidecar's stderr doesn't surface in the
      // Tauri dev output, so console.error alone leaves us blind on WHY a
      // trajectory chose what it chose. Fire-and-forget append; never blocks.
      log: (line) => {
        console.error(`[desktop-conductor] ${line}`);
        appendFile(join(AVA_HOME, 'desktop-conductor.log'), `${new Date().toISOString()} ${line}\n`).catch(() => {});
      },
    });
  } catch (err) {
    emit({ event: 'agent_error', message: err?.message || String(err) });
  }
  emit({ event: 'stream_end' });

  const finalContent = fullContent.trim() || 'Done.';
  emit({ event: 'done', content: finalContent });

  // Keep chat history coherent for the next turn (best-effort).
  try {
    conversation?.addUserMessage?.(cleanTask);
    conversation?.addAssistantMessage?.(finalContent);
  } catch { /* conversation API mismatch — non-fatal */ }

  return trajectory;
}

/**
 * Path B (distil) for the conductor — turn a completed trajectory into a
 * global 'pattern' memory: the action sequence, how each step verified, and
 * the outcome. Mirrors the agent-flow distil but reads ProposedAction steps
 * instead of tool_calls. Fail-safe — a distil error never breaks the turn.
 */
async function distilDesktopTrajectory(trajectory, rawContent) {
  if (!trajectory || !memoryManager || !Array.isArray(trajectory.steps) || trajectory.steps.length === 0) return;
  try {
    const cleanTask = cleanDesktopTask(rawContent);
    const launchStep = trajectory.steps.find(s => s.proposedAction?.kind === 'launch');
    const appName = launchStep?.proposedAction?.params?.app || 'the machine';
    // Memories must store INTENT, never selectors: element ids are snapshot-
    // scoped and recalling them poisons future runs (observed: the Planner
    // clicking a dead [data-ava-id] from memory while live elements sat in
    // front of it). Resolve to the element's human name; drop unresolvable
    // selector-ish targets entirely.
    const selectorLike = /^\[|^#|^\./i;
    const isSelectorish = (t) => selectorLike.test(t) || /data-ava-id|^web-\d+$|nth-of-type/i.test(t);
    const sequence = trajectory.steps.map((s, i) => {
      const a = s.proposedAction || {};
      const p = a.params || {};
      let target = a.target || p.app || p.text || p.key || p.url || '';
      if (target && isSelectorish(String(target))) {
        const el = (s.screenState?.elements || []).find((e) => e.id === a.target);
        target = (el?.name || '').trim() || 'an on-screen element';
      }
      const line = `${i + 1}. ${a.kind}${target ? ` → ${String(target).slice(0, 60)}` : ''}`;
      const ok = s.executionResult?.ok && s.verificationResult?.status === 'verified';
      if (!ok) {
        const reason = s.executionResult?.error || s.verificationResult?.deviation || s.verificationResult?.detail || s.verificationResult?.status || 'did not verify';
        return `${line}  ✗ ${String(reason).replace(/\s+/g, ' ').slice(0, 90)}`;
      }
      return `${line}  ✓`;
    }).join('\n');
    const anyFailed = trajectory.steps.some(s => !(s.executionResult?.ok && s.verificationResult?.status === 'verified'));
    const content = `**Desktop task:** ${cleanTask.slice(0, 200)}\n\n`
      + `**On this machine — what was tried and how it went:**\n${sequence}`
      + `\n\n_Outcome: ${trajectory.outcome}._`
      + (anyFailed ? `\n\n_✗ = tried and didn't verify; informative, not a hard rule — conditions change, so weigh it, don't blindly avoid it._` : '');
    await memoryManager.saveEntry({
      scope: 'global',
      category: 'pattern',
      layer: 'workflow',
      source: 'auto-extract',
      tags: ['desktop', String(appName).toLowerCase().slice(0, 40)],
      content,
    });
    emit({ event: 'info', message: `Learned the desktop steps for "${cleanTask.slice(0, 40)}" (${trajectory.steps.length} action${trajectory.steps.length === 1 ? '' : 's'}${anyFailed ? ', incl. failures' : ''})` });
  } catch (err) {
    emit({ event: 'info', message: `Desktop trajectory distil skipped: ${err.message}` });
  }
}

async function handleMessage(data) {
  // If a fresh sidecar process is still mid-init when the user fires
  // their first message, wait briefly for init to complete instead of
  // bailing with a misleading "Not initialized" error. Caps at 3s so
  // a genuinely-broken sidecar still surfaces the error rather than
  // hanging forever.
  if ((!agent || !conversation) && initInFlight) {
    const start = Date.now();
    while (initInFlight && (Date.now() - start) < 3000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!agent || !conversation) {
    emitError('Not initialized. Send "init" first.');
    return;
  }
  if (isRunning) {
    const halt = haltIntent(data.content);
    // "stop / abort / leave it" — emergency brake. Abort now, even mid-step.
    if (halt === 'stop') {
      handleCancel();
      emit({ event: 'stopped' });
      return;
    }
    // "wait / pause / hold on" — gentle hold: let the current step finish,
    // then stop cleanly at the next boundary (never mid-write). Graceful pause
    // is wired on the plain Agent; in team mode fall back to the hard stop.
    if (halt === 'pause') {
      if (!autoCoordinator && agent) {
        agent.requestPause();
        emit({ event: 'pause_requested' });
      } else {
        handleCancel();
        emit({ event: 'stopped' });
      }
      return;
    }
    // Otherwise it's added context — forward to whichever runner is currently
    // executing. AutoCoordinator routes to its active sub-agent (planning task
    // agent or current Builder); plain Agent queues into its own
    // pendingInterjections array, drained at the next step boundary so it
    // folds in without interrupting a mid-write.
    const runner = autoCoordinator || agent;
    if (runner) {
      runner.inject(data.content);
      emit({ event: 'injected' });
    }
    return;
  }

  isRunning = true;
  const abortController = new AbortController();
  currentAbort = abortController;

  // Lane swap — point the single run pipeline at the right conversation thread
  // for this turn. A health-room turn runs against the health thread (created
  // lazily, sharing the main system prompt) and is restored in the finally.
  // The isRunning guard guarantees no overlapping turn, so a pointer swap is
  // safe. activeLane (set here, cleared in finally) tags outbound events.
  const surface = data.surface === 'health' ? 'health'
    : data.surface === 'learning' ? 'learning'
    : 'main';
  activeLane = surface;
  const mainConversation = conversation;
  if (surface === 'health') {
    if (!healthConversation) {
      healthConversation = new Conversation();
      const sysMsg = conversation.getMessages().find(m => m.role === 'system');
      if (sysMsg) healthConversation.setSystemPrompt(typeof sysMsg.content === 'string' ? sysMsg.content : '');
    }
    conversation = healthConversation;
  } else if (surface === 'learning') {
    // Per-course thread: each course owns its own history so switching the
    // active course swaps the whole conversation. '__lobby__' is the
    // no-course-yet landing thread (adopted by the first course created).
    const courseKey = data.courseId || LEARNING_LOBBY_KEY;
    let lc = learningConversations.get(courseKey);
    if (!lc) {
      lc = new Conversation();
      const sysMsg = conversation.getMessages().find(m => m.role === 'system');
      if (sysMsg) lc.setSystemPrompt(typeof sysMsg.content === 'string' ? sysMsg.content : '');
      learningConversations.set(courseKey, lc);
    }
    conversation = lc;
  }

  // Clear any active desktop-trajectory plan AND the per-turn mutative
  // counter at the start of each new user turn. A fresh message may be a
  // follow-up that needs its own approval scope — we don't blanket-approve
  // reversible actions from the previous task. The 5 min TTL on the plan
  // object is a second belt-and-braces. The counter is what the gate uses
  // to enforce "plan first" on the 2nd+ mutative action of a turn.
  if (globalThis._sharedState) {
    globalThis._sharedState.desktopActivePlan = null;
    globalThis._sharedState.desktopMutativeActionsThisTurn = 0;
  }

  // Desktop-mode state snapshot — capture foreground window + visible
  // controls and prepend them to the user message as a [Desktop state]
  // block. Without this, Ava can't see what's already open and ends up
  // second-guessing herself across turns ("is Notepad already open? did
  // the user see the first result?") burning hundreds of thinking tokens
  // per turn on state she could just be told. Kept outside the main
  // try/catch so a UIA hiccup never blocks the agent.
  // Desktop Automation Mode is now driven by the five-persona conductor
  // (runDesktopConductorTurn), routed below inside the try block. The
  // conductor's Scout re-perceives the screen every step, so we do NOT take a
  // static state snapshot here for desktop — only the standing rules + learned
  // patterns (Path B, computed below) are folded into the conductor task.
  let desktopStatePrefix = '';

  // Reset the desktop budget per turn. The BudgetTracker caps (5-min wall-clock,
  // 30 steps, 500K tokens) are meant to bound a SINGLE task ("per-trajectory"),
  // but sharedState builds the tracker once at session start — so its wall-clock
  // measured TOTAL session age (idle time between turns included) and blocked
  // EVERY desktop action once the IDE had been open ~5 min (observed: 611s breach
  // on a 2-step task). A fresh tracker per desktop turn restores the intended
  // per-task budget. The safety gate reads state.desktopBudget dynamically, so
  // reassigning here propagates.
  if (currentMode === 'desktop' && BudgetTracker && globalThis._sharedState) {
    globalThis._sharedState.desktopBudget = new BudgetTracker();
  }

  // Path B (recall) — surface what Ava has LEARNED about this machine. Global
  // 'pattern' memories tagged 'desktop' are procedural know-how distilled from
  // past successful turns (see the distil block after the run). Injected as a
  // [What Ava knows about this machine] block beside the live [Desktop state],
  // so she reuses the path that worked instead of rediscovering it each time.
  // Fail-safe: any error here just means no recall block — never blocks a turn.
  let desktopMemoryPrefix = '';
  if (currentMode === 'desktop' && memoryManager && typeof data.content === 'string' && data.content.length > 3) {
    try {
      const learned = await memoryManager.recall({ query: cleanDesktopTask(data.content), scope: 'global', category: 'pattern', limit: 3 });
      const blocks = (learned || [])
        .filter(r => ((r.entry?.tags || r.tags || []).includes('desktop')))
        .map(r => (r.entry?.content || r.content || '').trim())
        .filter(Boolean);
      if (blocks.length > 0) {
        desktopMemoryPrefix = `[What Ava knows about this machine]\n${blocks.join('\n\n')}`;
        emit({ event: 'info', message: `Recalled ${blocks.length} learned desktop pattern${blocks.length === 1 ? '' : 's'} for this task` });
      }
    } catch (err) {
      emit({ event: 'info', message: `Desktop memory recall skipped: ${err.message}` });
    }
  }
  // Path B3 (recall) — standing machine RULES Ava must obey, from the machine-
  // global Decisions store (<AVA_HOME>/Decisions/machine-rules.md). Loaded first
  // so they frame the whole turn. These are constraints ("never auto-send"),
  // distinct from memory's how-to. Fail-safe — no rules file just means none.
  let desktopRulesPrefix = '';
  if (currentMode === 'desktop' && loadMachineRules) {
    try {
      const rules = await loadMachineRules(AVA_HOME);
      if (rules) desktopRulesPrefix = `[Standing rules for this machine — obey these]\n${rules}`;
    } catch { /* no rules — skip */ }
  }
  // Standing rules first (they frame everything), then learned how-to, then the
  // live screen state, then the task.
  const combinedDesktopPrefix = [desktopRulesPrefix, desktopMemoryPrefix, desktopStatePrefix].filter(Boolean).join('\n\n');

  // Mode-prefix tag — see MODE_PREFIX_TAG comment above. Empty for work
  // (no tag → agent defaults to work). When a desktop snapshot is also
  // being prepended, the mode tag goes FIRST so detectModeFromMessages
  // sees it on its `text.startsWith(...)` check.
  const modeTag = MODE_PREFIX_TAG[currentMode] || '';

  try {
    // ── Desktop Automation Mode → the five-persona conductor ──────────────
    // Desktop turns run the Scout→Planner→Actor→Verifier→Narrator wave
    // (runDesktopConductorTurn) instead of the regular agent loop. Path B
    // (standing rules + learned patterns — NOT the stale state snapshot;
    // Scout re-perceives each step) is folded into the conductor task, and
    // the resulting trajectory is distilled back into memory. The finally
    // block clears isRunning + auto-closes the browser, same as any turn.
    if (currentMode === 'desktop' && typeof data.content === 'string') {
      const conductorContext = [desktopRulesPrefix, desktopMemoryPrefix].filter(Boolean).join('\n\n');
      const trajectory = await runDesktopConductorTurn(data.content, abortController.signal, conductorContext);
      await distilDesktopTrajectory(trajectory, data.content);
      return; // finally handles cleanup
    }

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

    // Health room: wrap the user's message in the focused health briefing
    // (catalogue-first, profile-aware, safety rail). The prefix already carries
    // the [Health Room] tag the core agent reads for tool gating, so the
    // mode-tag path below stays empty for this lane.
    const effectiveContent = activeLane === 'health'
      ? getHealthRoomPrefix(typeof data.content === 'string' && data.content ? data.content : 'Help me with a plan.', getHealthProfileSummary(), getHealthPlansSummary())
      : activeLane === 'learning'
      ? getTeachModePrefix(typeof data.content === 'string' && data.content ? data.content : 'Teach me something.', getLearningContext())
      : data.content;

    // Build multimodal content if attachments are present (images, files)
    if (data.attachments && Array.isArray(data.attachments) && data.attachments.length > 0) {
      emit({ event: 'info', message: `Attachments received: ${data.attachments.length}` });
      // Warn user immediately if current model can't process images
      const hasImages = data.attachments.some(a => a.mimeType?.startsWith('image/'));
      const currentModel = globalThis._currentModel;
      if (hasImages && currentModel && !currentModel.supportsVision) {
        emit({ event: 'warning', message: `Your current model (${currentModel.name || currentModel.id}) doesn't support vision. Images will be ignored. Switch to a vision model like Qwen 3.7 Plus to analyse images.` });
      }
      const parts = [];
      const baseContent = combinedDesktopPrefix && effectiveContent
        ? `${combinedDesktopPrefix}\n\n${effectiveContent}`
        : effectiveContent;
      const prefixedContent = modeTag && baseContent
        ? `${modeTag} ${baseContent}`
        : baseContent;
      if (prefixedContent) parts.push({ type: 'text', text: prefixedContent });
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
      conversation.addUserMessage(parts.length > 0 ? parts : (prefixedContent ?? effectiveContent));
    } else {
      const baseContent = combinedDesktopPrefix && effectiveContent
        ? `${combinedDesktopPrefix}\n\n${effectiveContent}`
        : effectiveContent;
      const userContent = modeTag && baseContent
        ? `${modeTag} ${baseContent}`
        : baseContent;
      conversation.addUserMessage(userContent);
    }
    let messages = conversation.getMessages();

    // Per-turn memory brief (curated by Memory Agent) or raw recall fallback
    // Enhanced: detects ambiguous references and topic shifts for proactive recall
    if (memoryAgentInstance && data.content && data.content.length > 5) {
      try {
        // Detect ambiguous references — "that thing", "the issue", "what we discussed"
        // If found, enrich the query with recent conversation context for better recall
        const ambiguousPatterns = /\b(?:that (?:thing|issue|bug|problem|feature|idea)|what we (?:discussed|talked about|mentioned|decided)|remember (?:when|that|the)|as (?:we|I) (?:said|mentioned|discussed)|the (?:previous|earlier|last) (?:issue|conversation|discussion))\b/i;
        const hasAmbiguousRef = ambiguousPatterns.test(data.content);

        let briefQuery = data.content;
        if (hasAmbiguousRef) {
          // Enrich query with recent conversation context for disambiguation
          const recentMsgs = conversation.getMessages()
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-4)
            .map(m => typeof m.content === 'string' ? m.content.slice(0, 150) : '')
            .filter(Boolean)
            .join(' ');
          briefQuery = `${data.content} [Context: ${recentMsgs.slice(0, 400)}]`;
          emit({ event: 'info', message: 'Detected ambiguous reference — enriching memory recall with conversation context' });
        }

        // Detect topic shift — compare current message to last brief's topic
        // If the topic shifted significantly, force a fresh recall
        const conversationContext = hasAmbiguousRef ? briefQuery : undefined;
        const brief = await memoryAgentInstance.generateBrief(briefQuery, conversationContext);
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
          emit({ event: 'info', message: `Memory brief generated (${brief.consideredEntryCount} memories considered${hasAmbiguousRef ? ', disambiguation enriched' : ''})` });
        }
      } catch (err) {
        emit({ event: 'info', message: `Memory brief failed: ${err.message}` });
      }
    } else if (memoryManager && data.content && data.content.length > 5) {
      // Fallback pointer (no Memory Agent available). Previous code dumped
      // up to 5 memories verbatim (~1.5K chars) every turn — redundant with
      // the memory_recall tool. Now we just list the topic categories so Ava
      // knows what's available and reaches for memory_recall on demand.
      try {
        const memories = await memoryManager.recall({ query: data.content, limit: 5, scope: 'all' });
        if (memories && memories.length > 0) {
          const categories = [...new Set(
            memories.map(m => m.entry?.category || m.category || 'general')
          )];
          const currentMsgs = conversation.getMessages();
          currentMsgs.push({
            role: 'system',
            content: `[Memory pointer] ${memories.length} related memor${memories.length === 1 ? 'y' : 'ies'} found across: ${categories.join(', ')}. Call memory_recall with a specific query if relevant to the user's question.`,
          });
          conversation.setMessages(currentMsgs);
          messages = conversation.getMessages();
          emit({ event: 'info', message: `Memory pointer: ${memories.length} entries across ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}` });
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
              // Forward metadata so the front-end can act on it — e.g. open the
              // authored .md in the editor for a live document preview.
              metadata: agentEvent.metadata,
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
          case 'execution_start':
            emit({ event: 'execution_start', total: agentEvent.total });
            break;
          case 'task_start':
            emit({
              event: 'task_start',
              taskId: agentEvent.taskId,
              title: agentEvent.title,
              index: agentEvent.index,
              total: agentEvent.total,
            });
            break;
          case 'task_complete':
            emit({
              event: 'task_complete',
              taskId: agentEvent.taskId,
              title: agentEvent.title,
              summary: agentEvent.summary,
            });
            break;
          case 'task_blocked':
            emit({
              event: 'task_blocked',
              taskId: agentEvent.taskId,
              title: agentEvent.title,
              reason: agentEvent.reason,
            });
            break;
          case 'task_failed':
            emit({
              event: 'task_failed',
              taskId: agentEvent.taskId,
              title: agentEvent.title,
              error: agentEvent.error,
            });
            break;
          case 'execution_complete':
            emit({
              event: 'execution_complete',
              completed: agentEvent.completed,
              blocked: agentEvent.blocked,
              total: agentEvent.total,
            });
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

    // Persist the full conversation to the shared local history files (best-effort,
    // non-blocking) — same format + location the extension uses, so a user who
    // switches extension → IDE picks up right where they left off.
    if (historyManager && conversation) {
      historyManager.saveConversation(conversation).catch(() => { /* local-first, best-effort */ });
    }

    // Path B (distil) — after a desktop turn, capture the desktop_* action
    // sequence AND how each step went (worked / tried-but-failed), saved as a
    // global 'pattern' so the next similar task recalls the learned path —
    // including what NOT to do again (the compounding flywheel: learn from
    // failures, not just wins). Paired with the recall block before the run.
    // Fail-safe — a distil error never breaks the turn.
    if (currentMode === 'desktop' && memoryManager && typeof data.content === 'string') {
      try {
        // This turn's messages = everything after the last user message.
        const lastUserIdx = updated.map(m => m.role).lastIndexOf('user');
        const turnMsgs = lastUserIdx >= 0 ? updated.slice(lastUserIdx + 1) : updated;
        // Index tool results by call id so each action can be marked worked/failed.
        const resultById = {};
        for (const m of turnMsgs) {
          if (m.role === 'tool') {
            const id = m.tool_call_id || m.toolCallId;
            if (id) resultById[id] = typeof m.content === 'string' ? m.content : '';
          }
        }
        const steps = [];
        for (const m of turnMsgs) {
          if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
            for (const tc of m.tool_calls) {
              const name = tc.function?.name || '';
              if (name.startsWith('desktop_')) {
                let args = {};
                try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* keep {} */ }
                const result = resultById[tc.id] || '';
                // Tool result strings surface failures plainly — heuristic classify.
                const failed = /\b(fail|failed|error|errored|cannot|blocked|breach|denied|not permitted|no approved plan)\b/i.test(result);
                steps.push({ tool: name, args, failed, result });
              }
            }
          }
        }
        if (steps.length > 0) {
          const cleanTask = cleanDesktopTask(data.content);
          const appName = steps.find(s => s.tool === 'desktop_launch_app')?.args?.app || 'the machine';
          const sequence = steps.map((s, i) => {
            const a = s.args || {};
            const target = a.name || a.window || a.app || a.text || a.key || a.title || '';
            const line = `${i + 1}. ${s.tool.replace('desktop_', '')}${target ? ` → ${String(target).slice(0, 60)}` : ''}`;
            if (s.failed) {
              const reason = String(s.result).replace(/\s+/g, ' ').slice(0, 90);
              return `${line}  ✗ tried, failed: ${reason}`;
            }
            return `${line}  ✓`;
          }).join('\n');
          const anyFailed = steps.some((s) => s.failed);
          const content = `**Desktop task:** ${cleanTask.slice(0, 200)}\n\n`
            + `**On this machine — what was tried and how it went:**\n${sequence}`
            + (anyFailed ? `\n\n_✗ = tried and failed; informative, not a hard rule — conditions change, so weigh it, don't blindly avoid it._` : '');
          await memoryManager.saveEntry({
            scope: 'global',
            category: 'pattern',
            layer: 'workflow',
            source: 'auto-extract',
            tags: ['desktop', String(appName).toLowerCase().slice(0, 40)],
            content,
          });
          emit({ event: 'info', message: `Learned the desktop steps for "${cleanTask.slice(0, 40)}" (${steps.length} action${steps.length === 1 ? '' : 's'}${anyFailed ? ', incl. failures' : ''})` });
        }
      } catch (err) {
        emit({ event: 'info', message: `Desktop memory distil skipped: ${err.message}` });
      }
    }

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
    // Restore the main thread + lane after a room turn (health or learning).
    // The room thread keeps its appended messages (same object, still held in
    // healthConversation / learningConversations); only the active pointer flips
    // back so the main chat owns `conversation` again between turns.
    conversation = mainConversation;
    activeLane = 'main';

    // Auto-close the Ava browser at end of turn if Ava forgot.
    // Prompt-level "please call browser_close" is unreliable; the model
    // sometimes includes it in the plan and sometimes doesn't. Leaving
    // Chromium sitting on top of the IDE is always the wrong outcome —
    // Ava's browser is not the user's personal browser and has no
    // reason to persist between conversation turns. If the user wants
    // to keep browser state for a follow-up question, the stale-state
    // auto-recovery in browserSend handles the reopen transparently.
    if (browserLaunched) {
      try {
        await desktopRequest('browser_close');
        emit({ event: 'info', message: 'Ava browser auto-closed at end of turn.' });
      } catch { /* non-fatal — worker may already be dead */ }
      browserLaunched = false;
    }
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

/** Detect the models an OpenAI-compatible endpoint is serving (GET /models).
 *  Runs in the sidecar (Node) so localhost is reachable without the webview's
 *  CSP/CORS limits. Mirrors the extension host's detect path. */
async function detectLocalModels({ baseUrl, apiKey }) {
  if (!baseUrl) {
    emit({ event: 'local_models_detected', models: [], error: 'Enter a base URL first.' });
    return;
  }
  try {
    const models = await listOpenAICompatibleModels(String(baseUrl), apiKey ? String(apiKey) : undefined);
    emit({ event: 'local_models_detected', models });
  } catch (err) {
    emit({ event: 'local_models_detected', models: [], error: err?.message || 'Could not reach that endpoint.' });
  }
}

function handleConfirm(data) {
  const pending = pendingConfirmations.get(data.id);
  if (!pending) {
    emitError(`No pending confirmation: ${data.id}`);
    return;
  }
  pendingConfirmations.delete(data.id);

  // "Always Allow" — approve this category for the session
  if (data.approved && data.alwaysAllowCategory && toolRegistry && pending.toolName) {
    const category = toolRegistry.getCategoryForTool(pending.toolName);
    toolRegistry.approveCategory(category);
    toolRegistry.setCategoryPermission(category, 'auto');
  }

  // health_profile_ask — the response is JSON { field, value } or
  // { field, skipped }. Save the answer to the profile and hand Ava a
  // confirmation string (mirrors the extension's handleConfirmationResponse).
  if (pending.toolName === 'health_profile_ask') {
    if (data.approved !== false && data.response) {
      let parsed = null;
      try { parsed = JSON.parse(data.response); } catch { /* malformed */ }
      if (parsed?.skipped && typeof parsed.field === 'string') {
        pending.resolve(`User skipped ${String(parsed.field).replace(/_/g, ' ')} for now — move on, don't re-ask it.`);
      } else if (parsed && typeof parsed.field === 'string') {
        pending.resolve(applyProfileField(parsed.field, parsed.value));
      } else {
        pending.resolve(`User response: ${data.response}`);
      }
    } else {
      pending.resolve('User closed the profile question without answering — move on, don\'t re-ask it.');
    }
    return;
  }

  // task_suggest — the response is the (user-edited) task JSON on Add; a
  // dismiss comes through as not-approved. The task persists only on Add.
  if (pending.toolName === 'task_suggest') {
    if (data.approved !== false && data.response) {
      let parsed = null;
      try { parsed = JSON.parse(data.response); } catch { /* malformed */ }
      if (parsed?.title) {
        createSuggestedTask(parsed)
          .then((msg) => pending.resolve(msg))
          .catch(() => pending.resolve('Added the task to their list.'));
      } else {
        pending.resolve('User added the suggested task.');
      }
    } else {
      pending.resolve('User dismissed the task suggestion — don\'t re-suggest it.');
    }
    return;
  }

  if (data.response && typeof data.response === 'string') {
    // Free-text response (e.g., ask_user, present_plan approval)
    pending.resolve(data.response);
  } else {
    // Boolean approve/deny
    pending.resolve(data.approved !== false);
  }
}

function handleClear(data) {
  // Lane-aware: the Health room clears ONLY its own thread (drop the
  // healthConversation so the next health turn rebuilds it fresh); the main
  // chat is untouched. Default (no surface) clears the main conversation.
  if (data && data.surface === 'health') {
    if (healthConversation) {
      const messages = healthConversation.getMessages();
      const systemMsg = messages.find((m) => m.role === 'system');
      healthConversation.clear();
      if (systemMsg) healthConversation.setSystemPrompt(systemMsg.content);
    }
    emit({ event: 'cleared', lane: 'health' });
    return;
  }
  if (data && data.surface === 'learning') {
    // Drop only the targeted course's thread (by courseId, or the lobby) so the
    // next learning turn for that course rebuilds fresh. Other courses' threads
    // and the main chat are untouched.
    const courseKey = data.courseId || LEARNING_LOBBY_KEY;
    learningConversations.delete(courseKey);
    emit({ event: 'cleared', lane: 'learning' });
    return;
  }
  if (isRunning) {
    handleCancel();
  }
  if (conversation) {
    // End-of-session reflection over the outgoing conversation before it's
    // cleared — distils durable user/project facts the per-turn capture may
    // have missed. Fire-and-forget, off the hot path; the session is ending so
    // it can't loop back. No-op if the conversation has < 2 user turns.
    if (memoryAgentInstance) {
      Promise.resolve(memoryAgentInstance.reflectOnSession(conversation.getMessages(), conversation.id))
        .catch(() => {});
    }
    // Preserve system prompt, clear messages
    const messages = conversation.getMessages();
    const systemMsg = messages.find((m) => m.role === 'system');
    conversation.clear();
    if (systemMsg) {
      conversation.setSystemPrompt(systemMsg.content);
    }
  }
  // Clear secret working set on chat reset — session-lived only.
  clearSecretWorkingSet();
  emit({ event: 'cleared' });
}

function handleInject(data) {
  if (isRunning) {
    const runner = autoCoordinator || agent;
    if (runner) {
      runner.inject(data.content);
      emit({ event: 'injected' });
      return;
    }
  }
  emitError('Cannot inject — no active run.');
}

function handleSetDesktopVisionMode(data) {
  const VALID = new Set(['off', 'local', 'cloud']);
  const mode = VALID.has(data?.mode) ? data.mode : 'off';
  const sharedState = globalThis._sharedState || {};
  sharedState.desktopVisionMode = mode;
  emit({ event: 'desktop_vision_mode_changed', mode });
  // Private: bring the on-device engine up in the background so the first
  // look doesn't pay the ~20s model-load on top of inference.
  if (mode === 'local') {
    ensureLocalVisionServer().catch(() => { /* reported via info event */ });
  }
}

function handleSetDesktopPermissionLevel(data) {
  const VALID = new Set(['watch', 'ask', 'drive']);
  const level = VALID.has(data?.level) ? data.level : 'ask';
  const sharedState = globalThis._sharedState || {};
  const previousLevel = sharedState.desktopPermissionLevel ?? 'ask';
  sharedState.desktopPermissionLevel = level;
  emit({ event: 'desktop_permission_level_changed', level });

  // Rebuild the system prompt so the level description Ava reads matches
  // the level the operator just set. Without this, the prompt's
  // permission-level line would lag the actual gate behaviour by a turn,
  // which is exactly the kind of trust-boundary slip we're closing.
  if (
    conversation &&
    globalThis._systemPromptArgs &&
    currentMode === 'desktop' &&
    previousLevel !== level
  ) {
    const newArgs = {
      ...globalThis._systemPromptArgs,
      desktopPermissionLevel: level,
    };
    globalThis._systemPromptArgs = newArgs;
    const suffix = globalThis._systemPromptUserInfoSuffix || '';
    conversation.setSystemPrompt(buildSystemPrompt(newArgs) + suffix);
    emit({ event: 'info', message: `Desktop permission level → ${level}; system prompt rebuilt` });
  }
}

async function handleSetKnowledgePacks(_data) {
  // Knowledge packs removed in v0.59.2. Handler kept as a no-op so
  // older IDE builds that still send `set_knowledge_packs` to a fresh
  // sidecar don't crash — they just see no effect, which is correct.
}

function handleSetMode(data) {
  const previousMode = currentMode;
  currentMode = data.mode || 'work';
  emit({ event: 'mode_changed', mode: currentMode });

  // Rebuild the system prompt when crossing the desktop boundary so the
  // desktop-mode rules block is added on entry and removed on exit. Code
  // mode treating desktop tools as just-another-tool is exactly the
  // failure mode we're avoiding — Ava must know what mode she's in.
  const crossedDesktopBoundary =
    (previousMode === 'desktop') !== (currentMode === 'desktop');
  if (crossedDesktopBoundary && conversation && globalThis._systemPromptArgs) {
    const sharedState = globalThis._sharedState || {};
    const newArgs = {
      ...globalThis._systemPromptArgs,
      desktopMode: currentMode === 'desktop',
      desktopPermissionLevel: sharedState.desktopPermissionLevel,
    };
    globalThis._systemPromptArgs = newArgs;
    const suffix = globalThis._systemPromptUserInfoSuffix || '';
    conversation.setSystemPrompt(buildSystemPrompt(newArgs) + suffix);
    emit({ event: 'info', message: `System prompt rebuilt for ${currentMode} mode` });
  }
}

async function handleSetModel(data) {
  // Hot-swap the model without restarting the sidecar
  if (!data.model) { emitError('No model specified'); return; }

  try {
    const providerRegistry = globalThis._providerRegistry;
    if (!providerRegistry) { emitError('Not initialized'); return; }
    const cwd = globalThis._cwd || process.cwd();
    const sharedState = globalThis._sharedState || {};

    // Maestro / Supernova / Aurora orchestrated modes — all go through
    // AutoCoordinator. Supernova pins coordinator to DeepSeek V4 Pro and
    // runs Builder spawns on Qwen 3.6 Plus per the polyglot routing map.
    // Aurora pins coordinator to Mistral Large 3 with Mistral-only
    // resolution chain — never silently routes to a non-Mistral model
    // (the EU-stack guarantee). Maestro uses the default coordinator
    // priority ladder. Mirrors AvaViewProvider.setActiveModel in the
    // extension.
    if (data.model === 'auto' || data.model === 'supernova' || data.model === 'aurora') {
      const availableProviders = new Set();
      if (sharedState.platformKey) availableProviders.add('platform');
      if (sharedState.qwenApiKey) availableProviders.add('qwen');
      if (sharedState.minimaxApiKey) availableProviders.add('minimax');
      if (sharedState.kimiApiKey) availableProviders.add('kimi');
      if (sharedState.deepseekApiKey) availableProviders.add('deepseek');
      if (sharedState.mistralApiKey) availableProviders.add('mistral');
      if (sharedState.anthropicApiKey) availableProviders.add('anthropic');

      // Aurora's Mistral-only coordinator chain — try platform-managed
      // Large 3 first, then BYOK Mistral Large 3, then Small 4 fallback.
      // The first resolvable wins. Same chain as the extension.
      let preferredCoordinatorId;
      if (data.model === 'aurora') {
        const tries = [
          'platform:mistral-large-3-platform',
          'mistral:mistral-large-3',
          'mistral-large-3',
          'platform:mistral-small-4-platform',
          'mistral:mistral-small-4',
          'mistral-small-4',
        ];
        for (const id of tries) {
          if (providerRegistry.resolveModel(id)) {
            preferredCoordinatorId = id;
            break;
          }
        }
      } else if (data.model === 'supernova') {
        preferredCoordinatorId = 'platform:deepseek-v4-pro-platform';
      }

      autoCoordinator = AutoCoordinator.create({
        providerRegistry,
        toolRegistry,
        cwd,
        sharedState,
        availableProviders,
        platformKey: sharedState.platformKey,
        mode: data.model,
        preferredCoordinatorId,
      });

      const label = data.model === 'supernova'
        ? 'Supernova'
        : data.model === 'aurora'
          ? 'Aurora'
          : 'Maestro';
      if (autoCoordinator) {
        emit({ event: 'model_changed', model: data.model, provider: label });
      } else {
        emitError(`${label} unavailable — no providers found`);
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
    globalThis._activeProvider = resolved.provider;

    // Vision bridge for the newly-selected model (no-op if it sees images).
    const visionResolved = providerRegistry.resolveModel('platform:qwen3.5-omni-plus')
      || providerRegistry.resolveModel('qwen:qwen3.5-omni-plus')
      || providerRegistry.resolveModel('platform:qwen3.5-omni-flash')
      || providerRegistry.resolveModel('qwen:qwen3.5-omni-flash');

    agent = new Agent({
      provider: resolved.provider,
      model: resolved.model,
      visionProvider: visionResolved?.provider,
      visionModel: visionResolved?.model,
      toolRegistry,
      cwd,
      sharedState,
      secretGranter: requestSecretGrant,
      surface: 'ide',
    });

    conductor = new Conductor({
      provider: resolved.provider,
      model: resolved.model,
      visionProvider: visionResolved?.provider,
      visionModel: visionResolved?.model,
      toolRegistry,
      cwd,
      sharedState,
      secretGranter: requestSecretGrant,
      surface: 'ide',
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

// ── Conversation history (the shared ~/.ava/.../history/*.json files) ────────
// Read/manage the same account-scoped transcripts the extension writes. The
// renderer uses these to list + resume conversations instead of its old
// localStorage silo, so history carries across CLI / extension / IDE.
async function handleListHistory(data) {
  try {
    if (!historyManager) { emit({ event: 'history_list', conversations: [] }); return; }
    const conversations = data?.query
      ? await historyManager.searchConversations(String(data.query), false)
      : await historyManager.listConversations(false);
    emit({ event: 'history_list', conversations });
  } catch (err) {
    emit({ event: 'history_list', conversations: [], error: err?.message });
  }
}

async function handleLoadHistory(data) {
  try {
    if (!historyManager || !data?.id) { emit({ event: 'history_loaded', id: data?.id ?? null, record: null }); return; }
    const record = await historyManager.resumeConversation(String(data.id));
    emit({ event: 'history_loaded', id: data.id, record });
  } catch (err) {
    emit({ event: 'history_loaded', id: data?.id ?? null, record: null, error: err?.message });
  }
}

async function handleDeleteHistory(data) {
  try {
    if (historyManager && data?.id) await historyManager.deleteConversation(String(data.id));
    emit({ event: 'history_deleted', id: data?.id ?? null });
  } catch (err) {
    emit({ event: 'history_deleted', id: data?.id ?? null, error: err?.message });
  }
}

async function handleRenameHistory(data) {
  try {
    if (historyManager && data?.id) await historyManager.renameConversation(String(data.id), String(data.title || ''));
    emit({ event: 'history_renamed', id: data?.id ?? null, title: data?.title });
  } catch (err) {
    emit({ event: 'history_renamed', id: data?.id ?? null, error: err?.message });
  }
}

async function handlePinHistory(data) {
  try {
    if (historyManager && data?.id) await historyManager.pinConversation(String(data.id), !!data.pinned);
    emit({ event: 'history_pinned', id: data?.id ?? null, pinned: !!data?.pinned });
  } catch (err) {
    emit({ event: 'history_pinned', id: data?.id ?? null, error: err?.message });
  }
}

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
    case 'detect_local_models':
      detectLocalModels(data).catch((err) => emit({ event: 'local_models_detected', models: [], error: err?.message || 'detect failed' }));
      break;
    case 'secret_grant_response':
      handleSecretGrantResponse(data);
      break;
    case 'clear':
      handleClear(data);
      break;
    case 'list_history':
      handleListHistory(data).catch((err) => emit({ event: 'history_list', conversations: [], error: err?.message }));
      break;
    case 'load_history':
      handleLoadHistory(data).catch((err) => emit({ event: 'history_loaded', id: data?.id ?? null, record: null, error: err?.message }));
      break;
    case 'delete_history':
      handleDeleteHistory(data).catch(() => {});
      break;
    case 'rename_history':
      handleRenameHistory(data).catch(() => {});
      break;
    case 'pin_history':
      handlePinHistory(data).catch(() => {});
      break;
    case 'creative_generation':
      handleCreativeGeneration(data).catch(() => {});
      break;
    case 'creative_user_action':
      handleCreativeUserAction(data);
      break;
    case 'set_permission':
      if (toolRegistry && data.mode) {
        toolRegistry.setPermissionMode(data.mode);
        emit({ event: 'info', message: `Permission mode: ${data.mode}` });
      }
      break;
    case 'set_category_permission':
      if (toolRegistry && data.category && data.permission) {
        toolRegistry.setCategoryPermission(data.category, data.permission);
        emit({ event: 'info', message: `Category ${data.category}: ${data.permission}` });
      }
      break;
    case 'get_category_permissions':
      if (toolRegistry) {
        emit({ event: 'category_permissions', permissions: toolRegistry.getCategoryPermissions(), mode: toolRegistry.getPermissionMode() });
      }
      break;
    case 'get_audit_log': {
      // Read from the persistent JSONL store first — entries from
      // prior sessions surface in this view. Fall back to the live
      // in-memory buffer if the persistent read errors or is empty
      // (first run, fs error, etc.).
      let entries = [];
      let findings = [];
      try {
        const audit = await import('@ava/core/audit');
        entries = audit.readEntries({ limit: 1000 });
        // Verify file-mutation entries against disk, classify the security
        // lens, and detect nudge findings — all via the same shared engine the
        // extension uses so the two surfaces never drift.
        try { entries = audit.annotateIntegrity(entries); } catch { /* keep raw */ }
        try { entries = audit.annotateSecurity(entries, globalThis.__avaProjectRoot); } catch { /* keep */ }
        try { findings = audit.detectPatterns(entries); } catch { findings = []; }
      } catch { /* fall through */ }
      if (!entries || entries.length === 0) {
        entries = globalThis.__avaAuditLog || [];
      }
      emit({ event: 'audit_log', entries, findings });
      break;
    }
    case 'export_audit_log': {
      // Build the export bundle and send it back to the frontend; the
      // Tauri save dialog runs IDE-side (so the user sees a native
      // chooser) — sidecar's job is just to format the bytes.
      try {
        const audit = await import('@ava/core/audit');
        // Annotate integrity so the exported proof carries the disk-verified
        // verdicts, not just the recorded hashes.
        const entries = audit.annotateIntegrity(audit.readEntries({}));
        const bundle = audit.buildExport(entries, data?.format === 'json' ? 'json' : 'markdown');
        emit({ event: 'audit_export_ready', bundle });
      } catch (err) {
        emitError(`Audit export failed: ${err && err.message ? err.message : err}`);
      }
      break;
    }
    case 'export_backup': {
      // Data sovereignty — seal everything under ~/.ava with a passphrase.
      // Sidecar produces the opaque envelope; the IDE runs the Tauri save
      // dialog (mirrors export_audit_log).
      try {
        const envelope = await exportEncryptedBackup(AVA_HOME, data?.passphrase ?? '', { source: 'ide' });
        emit({ event: 'backup_ready', envelope });
      } catch (err) {
        emitError(`Backup failed: ${err && err.message ? err.message : err}`);
      }
      break;
    }
    case 'export_readable': {
      // Plain JSON snapshot so the user can SEE what's on their machine.
      try {
        const bundle = await gatherBundle(AVA_HOME, { source: 'ide' });
        emit({ event: 'readable_ready', json: JSON.stringify(bundle, null, 2) });
      } catch (err) {
        emitError(`Readable export failed: ${err && err.message ? err.message : err}`);
      }
      break;
    }
    case 'import_backup': {
      // Restore an encrypted .ava-backup into ~/.ava (safe-merge by default).
      try {
        const { result } = await importEncryptedBackup(AVA_HOME, data?.content ?? '', data?.passphrase ?? '', { overwrite: !!data?.overwrite });
        emit({ event: 'backup_imported', ok: true, written: result.written, skipped: result.skipped });
      } catch (err) {
        emit({ event: 'backup_imported', ok: false, message: err && err.message ? err.message : String(err) });
      }
      break;
    }
    case 'inject':
      handleInject(data);
      break;
    case 'set_mode':
      handleSetMode(data);
      break;
    case 'set_model':
      handleSetModel(data).catch((err) => emitError(err.message));
      break;
    case 'set_desktop_permission_level':
      handleSetDesktopPermissionLevel(data);
      break;
    case 'set_desktop_vision_mode':
      handleSetDesktopVisionMode(data);
      break;
    case 'download_local_vision_model':
      handleDownloadLocalVisionModel();
      break;
    case 'set_knowledge_packs':
      handleSetKnowledgePacks(data).catch((err) => emitError(err.message));
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
      emit({ event: 'memories', entries: [] });
      break;
    case 'get_memories': {
      // Authoritative memory list — straight from MemoryManager (the v3 graph,
      // both scopes), the SAME source the extension reads. Local-only; the
      // dashboard's old file-read of the legacy v2 memory.json under-reported.
      // The dashboard can open before/without a chat session, so the agent's
      // memoryManager may not exist yet — lazily build a read manager on the
      // flat store. Fetch each scope independently so a project-graph hiccup
      // can't zero out the global memories.
      if (!memoryManager) {
        try { memoryManager = new MemoryManager({ globalDir: AVA_HOME, projectRoot: cwd }); }
        catch { emit({ event: 'memories', entries: [] }); break; }
      }
      {
        const entries = [];
        try { for (const e of await memoryManager.getEntries('global')) entries.push({ ...e, scope: 'global' }); } catch { /* skip */ }
        try { for (const e of await memoryManager.getEntries('project')) entries.push({ ...e, scope: 'project' }); } catch { /* skip */ }
        emit({ event: 'memories', entries });
      }
      break;
    }
    case 'delete_memory': {
      if (memoryManager && data.id) {
        try {
          const scope = data.scope === 'project' ? 'project' : 'global';
          await memoryManager.deleteEntry(scope, data.id);
          emit({ event: 'memory_deleted', id: data.id });
        } catch (err) {
          emitError(`Failed to delete memory: ${err.message}`);
        }
      }
      break;
    }
    case 'desktop_response': {
      const pending = pendingDesktop.get(data.requestId);
      if (pending) {
        pendingDesktop.delete(data.requestId);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve({ data: data.result });
        }
      }
      break;
    }
    case 'update_desktop_automation_settings': {
      // Live update desktop automation settings from the UI
      if (agent?.sharedState) {
        agent.sharedState.desktopAutomationSettings = data.settings;
        emit({ event: 'info', message: 'Desktop automation settings updated' });
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
