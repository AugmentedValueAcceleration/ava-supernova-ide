// IDE-side Data Mode helper — mirror of the extension's host module.
// The toggle UI lives in the IDE dashboard ('ava-data-mode' in
// localStorage, written by the mode button in the chat header) and
// every cloud-persisting save site reads through this module before
// hitting apiFetch. Keeps gating logic in one place so audits line up
// with the extension.

export type DataMode = 'local' | 'cloud' | 'both';

const KEY = 'ava-data-mode';

export function getDataMode(): DataMode {
  const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
  if (raw === 'cloud' || raw === 'both' || raw === 'local') return raw;
  return 'local';
}

export function setDataMode(mode: DataMode): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, mode);
}

export function includesLocal(): boolean {
  const m = getDataMode();
  return m === 'local' || m === 'both';
}

export function includesCloud(): boolean {
  const m = getDataMode();
  return m === 'cloud' || m === 'both';
}
