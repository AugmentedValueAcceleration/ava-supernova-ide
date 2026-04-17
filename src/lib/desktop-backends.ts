// ─── IDE-side Backends for the Desktop Conductor ──────────────────────────
//
// Implements the interfaces declared in @ava/core/desktop:
//   - GroundingBackend × 3 (UIA, Playwright, OmniParser)
//   - ExecutorBackend × 2 (native via enigo + UIA, browser via Playwright)
//   - PersonaLLM (hits the platform /api/chat with response_format: json)
//
// All Tauri invocations happen here. The conductor stays transport-agnostic.

import { invoke } from '@tauri-apps/api/core';
import type {
  GroundingBackend,
  ExecutorBackend,
  ScreenElement,
  PersonaLLM,
} from '@ava/core';
import { getPlatformKey, apiStreamUrl } from './api';

// ── UIA grounding — native Windows apps ─────────────────────────────────

interface UIElementInfo {
  name: string;
  control_type: string;
  x: number; y: number;
  width: number; height: number;
  cx: number; cy: number;
}

export const uiaGrounding: GroundingBackend = {
  name: 'uia',
  async available() {
    // On non-Windows hosts the list_ui_elements command returns a string
    // error; treat that as unavailable without throwing.
    try {
      await invoke<UIElementInfo[]>('list_ui_elements');
      return true;
    } catch {
      return false;
    }
  },
  async capture() {
    const elements = await invoke<UIElementInfo[]>('list_ui_elements');
    return elements.map<ScreenElement>((e, i) => ({
      id: `uia-${i}`,
      kind: e.control_type || 'unknown',
      name: e.name,
      bbox: [e.x, e.y, e.width, e.height] as [number, number, number, number],
      source: 'uia',
      interactable: isInteractableControlType(e.control_type),
      sensitive: /password|secret|pin/i.test(e.name) || /password/i.test(e.control_type),
    }));
  },
};

function isInteractableControlType(ct: string): boolean {
  const t = ct.toLowerCase();
  return /button|link|menuitem|hyperlink|checkbox|radio|combobox|tab|list item|edit|document/.test(t);
}

// ── Playwright grounding — browser DOM via Rust-managed worker ─────────

interface PlaywrightSnapshot {
  id: string;
  ok: boolean;
  result?: {
    title: string;
    url: string;
    links: Array<{ text: string; href: string }>;
    buttons: Array<{ text: string; id: string; name: string }>;
    inputs: Array<{ type: string; name: string; placeholder: string }>;
  };
  error?: string;
}

export const playwrightGrounding: GroundingBackend = {
  name: 'playwright',
  async available() {
    // Available only when browser_launch has already been called.
    // We ping; if the worker isn't running the command errors.
    try {
      await invoke('browser_send', { action: 'ping' });
      return true;
    } catch {
      return false;
    }
  },
  async capture() {
    const res = await invoke<PlaywrightSnapshot>('browser_send', { action: 'snapshot' });
    if (!res.ok || !res.result) return [];
    const elements: ScreenElement[] = [];
    res.result.links.forEach((l, i) => elements.push({
      id: `pw-link-${i}`, kind: 'link', name: l.text,
      selector: `a:has-text(${JSON.stringify(l.text)})`,
      source: 'playwright', interactable: true, sensitive: false,
    }));
    res.result.buttons.forEach((b, i) => elements.push({
      id: `pw-btn-${i}`, kind: 'button', name: b.text || b.name || b.id,
      selector: b.id ? `#${b.id}` : `button:has-text(${JSON.stringify(b.text)})`,
      source: 'playwright', interactable: true, sensitive: false,
    }));
    res.result.inputs.forEach((inp, i) => elements.push({
      id: `pw-input-${i}`, kind: 'input', name: inp.placeholder || inp.name,
      selector: inp.name ? `input[name=${JSON.stringify(inp.name)}]` : `input:nth-of-type(${i + 1})`,
      source: 'playwright', interactable: true,
      sensitive: inp.type === 'password',
    }));
    return elements;
  },
};

// ── OmniParser grounding — platform endpoint ───────────────────────────

export function makeOmniParserGrounding(): GroundingBackend {
  return {
    name: 'omniparser',
    async available() {
      return Boolean(getPlatformKey());
    },
    async capture() {
      const key = getPlatformKey();
      if (!key) return [];
      const shot = await invoke<{ image: string; width: number; height: number }>('capture_screen');
      const dataUri = `data:image/png;base64,${shot.image}`;
      const res = await fetch(apiStreamUrl('/desktop/omniparser'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUri }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const elementsText = String(data.output?.elements ?? '');
      return elementsText
        .split('\n')
        .filter(line => line.startsWith('icon'))
        .slice(0, 50)
        .map<ScreenElement>((line, i) => ({
          id: `omni-${i}`,
          kind: line.includes("'type': 'icon'") ? 'icon' : 'text',
          name: extractContent(line),
          source: 'omniparser',
          interactable: line.includes('True'),
          sensitive: false,
        }));
    },
  };
}

function extractContent(line: string): string {
  const match = line.match(/'content': ['"]([^'"]*)['"]/);
  return match ? match[1]! : '';
}

// ── Native executor — enigo-backed Tauri commands ──────────────────────

async function clickByName(name: string): Promise<void> {
  await invoke('click_element', { name });
}

export const nativeExecutor: ExecutorBackend = {
  name: 'native',
  async click(target) { await clickByName(target); },
  async doubleClick(target) {
    const el = await invoke<UIElementInfo>('find_ui_element', { name: target });
    await invoke('double_click', { x: el.cx, y: el.cy });
  },
  async rightClick(target) {
    const el = await invoke<UIElementInfo>('find_ui_element', { name: target });
    await invoke('right_click', { x: el.cx, y: el.cy });
  },
  async type(target, text) {
    // Focus the field first via click, then type
    await clickByName(target).catch(() => { /* focus may already be there */ });
    await invoke('type_text', { text });
  },
  async keyPress(key) { await invoke('key_press', { key }); },
  async scroll(direction, amount) { await invoke('scroll', { direction, amount }); },
  async navigate() {
    throw new Error('Navigate is a browser action — use the Playwright executor');
  },
};

// ── Browser executor — via the Playwright worker ───────────────────────

export const browserExecutor: ExecutorBackend = {
  name: 'browser',
  async click(target) {
    const res = await invoke<{ ok: boolean; error?: string }>('browser_send', {
      action: 'click', params: { selector: target },
    });
    if (!res.ok) throw new Error(res.error ?? 'click failed');
  },
  async doubleClick(target) {
    // Playwright doesn't have a single dblclick in our worker yet — simulate
    await this.click(target); await this.click(target);
  },
  async rightClick(target) {
    // Not wired in the prototype worker; same fallback pattern
    await this.click(target);
  },
  async type(_target, text) {
    // The prototype worker types into the focused element, not a selector
    const res = await invoke<{ ok: boolean; error?: string }>('browser_send', {
      action: 'type', params: { text },
    });
    if (!res.ok) throw new Error(res.error ?? 'type failed');
  },
  async keyPress(key) {
    const res = await invoke<{ ok: boolean; error?: string }>('browser_send', {
      action: 'key', params: { key },
    });
    if (!res.ok) throw new Error(res.error ?? 'key failed');
  },
  async scroll(direction, amount) {
    const res = await invoke<{ ok: boolean; error?: string }>('browser_send', {
      action: 'scroll', params: { direction, amount },
    });
    if (!res.ok) throw new Error(res.error ?? 'scroll failed');
  },
  async navigate(url) {
    // Ensure the worker is launched; ignore error if already running
    await invoke('browser_launch').catch(() => { /* already up */ });
    const res = await invoke<{ ok: boolean; error?: string }>('browser_send', {
      action: 'navigate', params: { url },
    });
    if (!res.ok) throw new Error(res.error ?? 'navigate failed');
  },
};

// ── LLM client — platform /api/chat with JSON response ────────────────

export function makePlatformLLM(model: string = 'qwen3-6-plus'): PersonaLLM {
  return {
    async call(systemPrompt, userMessage) {
      const key = getPlatformKey();
      if (!key) throw new Error('No platform key — sign in first');

      const res = await fetch(apiStreamUrl('/chat'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`LLM call failed (${res.status}): ${body}`);
      }

      const data = await res.json();
      const output = data.choices?.[0]?.message?.content ?? '';
      const tokensUsed = (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);
      return { output, tokensUsed };
    },
  };
}
