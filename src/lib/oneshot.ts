// ── One-shot jobs on the sidecar's Node ─────────────────────────────────────
//
// Some Node work has to happen before a chat sidecar exists — someone with no
// key yet never starts one. The sidecar bundle has a `--oneshot` mode for
// that: it reads ONE JSON command on stdin, writes ONE JSON line, and exits
// (see the top of sidecar/index.mjs). Payloads go over stdin, never argv, so a
// key being tested is not visible in the process list.

import { Command } from '@tauri-apps/plugin-shell';
import { resolveResource } from '@tauri-apps/api/path';

const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost';

async function scriptPath(): Promise<string> {
  return isDev ? '../sidecar/index.mjs' : resolveResource('resources/sidecar-bundle.mjs');
}

export async function runOneshot<T = unknown>(job: Record<string, unknown>, timeoutMs = 60_000): Promise<T> {
  const script = await scriptPath();
  const command = isDev
    ? Command.create('run-node', [script, '--oneshot'])
    : Command.sidecar('binaries/node', [script, '--oneshot']);
  let out = '';
  command.stdout.on('data', (line: string) => { out += line; });
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => {
      finish(() => reject(new Error('The background job did not answer in time.')));
      void child?.kill().catch(() => {});
    }, timeoutMs);
    let child: Awaited<ReturnType<typeof command.spawn>> | null = null;
    command.on('close', () => {
      finish(() => {
        // The answer is the LAST JSON line; anything before it is Node noise.
        const line = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('{')).pop();
        try {
          const parsed = JSON.parse(line || '');
          if (parsed.ok) resolve(parsed as T);
          else reject(new Error(parsed.error || 'The background job failed.'));
        } catch {
          reject(new Error('The background job gave no answer.'));
        }
      });
    });
    command.on('error', (err: string) => finish(() => reject(new Error(err))));
    command.spawn()
      .then(async (c) => { child = c; await c.write(JSON.stringify(job) + '\n'); })
      .catch((err) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))));
  });
}

export interface KeyTestResult {
  status: 'valid' | 'invalid' | 'unverified';
  message?: string;
}

/** Test a pasted key against its provider (core testProviderKey). */
export async function testProviderKey(provider: string, apiKey: string): Promise<KeyTestResult> {
  const r = await runOneshot<{ result: KeyTestResult }>({ cmd: 'test_provider_key', provider, apiKey }, 45_000);
  return r.result;
}
