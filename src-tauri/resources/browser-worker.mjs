// Browser worker — Node subprocess that drives headed Chromium via Playwright.
// NDJSON over stdio: one command per line in, one response per line out.
// Ported from prototypes/browser-grounding/browser-worker.ts (Session 2) and
// bundled into the Tauri resources so Rust's browser_launch can spawn it.
//
// Protocol:
//   in:  {"id": "...", "action": "launch|navigate|snapshot|screenshot|click|type|key|close|ping", "params": {...}}
//   out: {"id": "...", "ok": true|false, "result"|"error": ..., "elapsedMs": N}

import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

let browser = null;
let context = null;
let page = null;

// Auto-launch at worker startup so `navigate` / `click` / `snapshot` can
// run immediately without requiring a separate 'launch' command. Rust's
// browser_launch only spawns the Node process — it never sent a 'launch'
// action, which is why the first navigate errored with "launch first".
//
// We also detect a dead browser (user X-closed Chromium, process crashed,
// Playwright lost connection) via isConnected() and relaunch transparently.
// Without this check, the second task after a close-and-reopen sees a
// stale Browser reference and fails with "browser has been closed."
async function ensureChromium() {
  if (browser && browser.isConnected && browser.isConnected()) return;
  // Stale or never-launched — clean any dangling refs and relaunch.
  if (page) { try { await page.close(); } catch {} page = null; }
  if (context) { try { await context.close(); } catch {} context = null; }
  if (browser) { try { await browser.close(); } catch {} browser = null; }
  browser = await chromium.launch({
    headless: false,
    // Maximised, and viewport:null below lets the page fill the real window
    // instead of a letterboxed 1280x800 — Ava's browser should look like a
    // browser, not a preview pane.
    args: ['--start-maximized', '--no-first-run', '--no-default-browser-check'],
  });
  context = await browser.newContext({ viewport: null });
  page = await context.newPage();
}

function send(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

function err(id, error, elapsedMs) {
  return {
    id,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    elapsedMs,
  };
}

async function handle(cmd) {
  const started = Date.now();
  const elapsed = () => Date.now() - started;

  try {
    switch (cmd.action) {
      case 'ping':
        return { id: cmd.id, ok: true, result: { pong: true }, elapsedMs: elapsed() };

      case 'launch': {
        await ensureChromium();
        return { id: cmd.id, ok: true, result: { version: browser.version() }, elapsedMs: elapsed() };
      }

      case 'navigate': {
        await ensureChromium();
        const url = String(cmd.params?.url ?? '');
        if (!url) throw new Error('params.url required');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        return { id: cmd.id, ok: true, result: { url: page.url(), title: await page.title() }, elapsedMs: elapsed() };
      }

      case 'snapshot': {
        await ensureChromium();
        // A click may have started a navigation — wait for the new document
        // before reading it, or the snapshot captures a half-loaded (often
        // empty) DOM. Best-effort: a page that never settles still snapshots.
        await page.waitForLoadState('domcontentloaded', { timeout: 8_000 }).catch(() => {});
        // Structured DOM snapshot Ava can reason about. Each element is
        // tagged with data-ava-id at capture time and the selector targets
        // that tag — exact and unambiguous. (The old `a:nth-of-type(i)`
        // selectors were wrong CSS: nth-of-type counts within the PARENT,
        // not the document, so they routinely pointed at nothing.)
        const snapshot = await page.evaluate(() => {
          const snip = (s, n = 120) => (s || '').trim().slice(0, n);
          let nextId = 0;
          const tag = (el) => {
            el.setAttribute('data-ava-id', String(nextId));
            return `[data-ava-id="${nextId++}"]`;
          };
          const links = Array.from(document.querySelectorAll('a'))
            .filter(a => snip(a.textContent))
            .slice(0, 30)
            .map(a => ({
              selector: tag(a),
              text: snip(a.textContent),
              href: a.getAttribute('href') ?? '',
            }));
          const buttons = Array.from(document.querySelectorAll('button'))
            .slice(0, 30)
            .map(b => ({
              selector: tag(b),
              text: snip(b.textContent),
              name: b.getAttribute('name') ?? '',
            }));
          const inputs = Array.from(document.querySelectorAll('input, textarea'))
            .slice(0, 30)
            .map(inp => ({
              selector: tag(inp),
              type: inp.getAttribute('type') ?? inp.tagName.toLowerCase(),
              name: inp.getAttribute('name') ?? '',
              placeholder: inp.getAttribute('placeholder') ?? '',
            }));
          return {
            title: document.title,
            url: window.location.href,
            headingCount: document.querySelectorAll('h1,h2,h3').length,
            links,
            buttons,
            inputs,
          };
        });
        return { id: cmd.id, ok: true, result: snapshot, elapsedMs: elapsed() };
      }

      case 'scroll': {
        await ensureChromium();
        const direction = String(cmd.params?.direction ?? 'down');
        const amount = Number(cmd.params?.amount) || 600;
        const [dx, dy] = direction === 'up' ? [0, -amount]
          : direction === 'left' ? [-amount, 0]
          : direction === 'right' ? [amount, 0]
          : [0, amount];
        await page.mouse.wheel(dx, dy);
        return { id: cmd.id, ok: true, result: { direction, amount }, elapsedMs: elapsed() };
      }

      case 'screenshot': {
        await ensureChromium();
        const outDir = String(cmd.params?.outDir ?? join(homedir(), '.ava', 'browser-screenshots'));
        await mkdir(outDir, { recursive: true });
        const path = join(outDir, `shot-${Date.now()}.png`);
        const buf = await page.screenshot({ path, fullPage: false });
        return { id: cmd.id, ok: true, result: { path, bytes: buf.length }, elapsedMs: elapsed() };
      }

      case 'click': {
        await ensureChromium();
        const selector = String(cmd.params?.selector ?? '');
        if (!selector) throw new Error('params.selector required');
        await page.click(selector, { timeout: 5_000 });
        return { id: cmd.id, ok: true, result: { selector }, elapsedMs: elapsed() };
      }

      case 'type': {
        await ensureChromium();
        const text = String(cmd.params?.text ?? '');
        const selector = cmd.params?.selector;
        if (selector) {
          await page.fill(String(selector), text, { timeout: 5_000 });
        } else {
          await page.keyboard.type(text);
        }
        return { id: cmd.id, ok: true, result: { typed: text.length }, elapsedMs: elapsed() };
      }

      case 'key': {
        await ensureChromium();
        const key = String(cmd.params?.key ?? '');
        if (!key) throw new Error('params.key required');
        await page.keyboard.press(key);
        return { id: cmd.id, ok: true, result: { key }, elapsedMs: elapsed() };
      }

      case 'scroll': {
        await ensureChromium();
        const direction = String(cmd.params?.direction ?? 'down');
        const amount = Number(cmd.params?.amount ?? 3) * 120;
        const dy = direction === 'up' ? -amount : amount;
        const dx = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
        await page.mouse.wheel(dx, dy);
        return { id: cmd.id, ok: true, result: { direction, amount }, elapsedMs: elapsed() };
      }

      case 'close': {
        if (page) { await page.close().catch(() => {}); page = null; }
        if (context) { await context.close().catch(() => {}); context = null; }
        if (browser) { await browser.close().catch(() => {}); browser = null; }
        return { id: cmd.id, ok: true, result: { closed: true }, elapsedMs: elapsed() };
      }

      default:
        return err(cmd.id, `unknown action: ${cmd.action}`, elapsed());
    }
  } catch (e) {
    return err(cmd.id, e, elapsed());
  }
}

async function main() {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let cmd;
    try {
      cmd = JSON.parse(line);
    } catch (e) {
      send({ id: 'parse-error', ok: false, error: `invalid JSON: ${String(e)}`, elapsedMs: 0 });
      continue;
    }
    const response = await handle(cmd);
    send(response);
    if (cmd.action === 'close') break;
  }
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`[browser-worker] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
