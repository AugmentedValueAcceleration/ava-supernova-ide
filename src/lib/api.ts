const PLATFORM_URL = 'https://ava-supernova.com/api';

export function getPlatformKey(): string | null {
  try { return localStorage.getItem('ava-ide-platform-key') || null; } catch { return null; }
}

export function getStoredEmail(): string | null {
  try { return localStorage.getItem('ava-ide-email') || null; } catch { return null; }
}

export function getStoredTier(): string | null {
  try { return localStorage.getItem('ava-ide-tier') || null; } catch { return null; }
}

export function isConnected(): boolean {
  const key = getPlatformKey();
  return !!key && key.startsWith('sk-ava-');
}

export async function apiFetch(path: string, options?: RequestInit) {
  const key = getPlatformKey();
  if (!key) throw new Error('Not connected');
  const res = await fetch(`${PLATFORM_URL}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export function apiStreamUrl(path: string): string {
  return `${PLATFORM_URL}${path}`;
}

export async function validateKey(key: string): Promise<{ valid: boolean; email?: string; tier?: string; error?: string }> {
  try {
    const res = await fetch(`${PLATFORM_URL}/account-info`, {
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      return { valid: false, error: 'Invalid API key' };
    }
    const data = await res.json();
    return { valid: true, email: data.email, tier: data.tier || data.plan || 'free' };
  } catch {
    return { valid: false, error: 'Could not reach platform' };
  }
}
