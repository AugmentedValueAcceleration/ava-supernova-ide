/**
 * Dataset capture config bridge for the IDE.
 *
 * Reads/writes ~/.ava/datasets/config.json directly via the Tauri fs
 * plugin so the Settings page can edit the same file the sidecar's
 * dataset consumer reads. The config schema mirrors
 * packages/core/src/dataset/config.ts — kept in sync by hand because
 * the IDE's React bundle can't import node-only types.
 */

import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { homeDir } from '@tauri-apps/api/path';

export type AvaMode = 'work' | 'plan' | 'chat' | 'teach' | 'security' | 'brainstorm';

export type DatasetName =
  | 'tool-trajectories'
  | 'persona-handoffs'
  | 'verification-pairs'
  | 'auto-mode-classification'
  | 'error-recovery'
  | 'memory-operations'
  | 'continuation-recovery'
  | 'mode-transitions'
  | 'generation-effectiveness'
  | 'knowledge-pack-effectiveness';

export const ALL_AVA_MODES: AvaMode[] = ['work', 'plan', 'chat', 'teach', 'security', 'brainstorm'];

export const ALL_DATASETS: DatasetName[] = [
  'tool-trajectories', 'persona-handoffs', 'verification-pairs',
  'auto-mode-classification', 'error-recovery', 'memory-operations',
  'continuation-recovery', 'mode-transitions', 'generation-effectiveness',
  'knowledge-pack-effectiveness',
];

export interface DatasetConfig {
  enabled: boolean;
  capture_modes: AvaMode[];
  capture_datasets: DatasetName[];
  redact_patterns: string[];
  min_trajectory_length: number;
}

export const DEFAULT_DATASET_CONFIG: DatasetConfig = {
  enabled: false,
  capture_modes: [],
  capture_datasets: [],
  redact_patterns: [],
  min_trajectory_length: 1,
};

let cachedBase: string | null = null;
async function getBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  let home = await homeDir();
  // homeDir() returns no trailing separator on Windows (e.g. "C:\Users\stewa")
  // so a naive `${home}.ava/datasets` produces "C:\Users\stewa.ava/datasets"
  // — a forbidden path. Normalise with an explicit trailing slash.
  if (!home.endsWith('/') && !home.endsWith('\\')) home = `${home}/`;
  cachedBase = `${home}.ava/datasets`;
  return cachedBase;
}

async function getConfigPath(): Promise<string> {
  return `${await getBase()}/config.json`;
}

export async function loadDatasetConfig(): Promise<DatasetConfig> {
  try {
    const path = await getConfigPath();
    if (!(await exists(path))) return DEFAULT_DATASET_CONFIG;
    const raw = await readTextFile(path);
    return { ...DEFAULT_DATASET_CONFIG, ...JSON.parse(raw) } as DatasetConfig;
  } catch {
    return DEFAULT_DATASET_CONFIG;
  }
}

export async function saveDatasetConfig(config: DatasetConfig): Promise<void> {
  const base = await getBase();
  if (!(await exists(base))) await mkdir(base, { recursive: true });
  await writeTextFile(await getConfigPath(), JSON.stringify(config, null, 2));
}
