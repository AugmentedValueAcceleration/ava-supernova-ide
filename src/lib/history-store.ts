// Local-first conversation history for the IDE — READ side.
//
// Conversations live in the SAME account-scoped files the extension + CLI +
// @ava/core's HistoryManager write: ~/.ava/users/<id>/history/<id>.json (or
// ~/.ava/history for BYOK/no-account). The IDE sidecar writes them; this reads
// them directly via the Tauri fs plugin — the same reliable, network-free path
// learning-store.ts / task-store.ts use — so the History tab shows a user's
// conversations across CLI / extension / IDE with zero effort, no sidecar
// round-trip, no account network fetch.

import { readTextFile, readDir, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
import { accountRoot } from './account-scope';

const historyDir = async (): Promise<string> => `${await accountRoot()}/history`;

export interface HistoryListItem {
  id: string;
  title: string;
  updatedAt: string;
  pinned?: boolean;
  projectPath?: string;
  /** Count of the conversational turns (user + assistant) — the card's "N messages". */
  messageCount: number;
  /** First assistant reply, for the card preview line. */
  preview: string;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((b: any) => b?.type === 'text').map((b: any) => b.text || '').join('');
  return '';
}

/** List conversations (metadata only), newest first. Local-first: returns an
 *  empty list (not an error) when the folder is missing/unreadable. */
export async function readHistoryList(): Promise<HistoryListItem[]> {
  try {
    const dir = await historyDir();
    const entries = await readDir(dir, { baseDir: BaseDirectory.Home });
    const items: HistoryListItem[] = [];
    for (const e of entries) {
      if (e.isDirectory || !e.name?.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(await readTextFile(`${dir}/${e.name}`, { baseDir: BaseDirectory.Home }));
        if (rec?.id && Array.isArray(rec.messages)) {
          const msgs = rec.messages as any[];
          const firstAva = msgs.find((m) => m.role === 'assistant');
          items.push({
            id: rec.id,
            title: rec.title || 'Untitled',
            updatedAt: rec.updatedAt || rec.createdAt || '',
            pinned: rec.pinned,
            projectPath: rec.projectPath,
            messageCount: msgs.filter((m) => m.role === 'user' || m.role === 'assistant').length,
            preview: firstAva ? textOf(firstAva.content).slice(0, 120) : '',
          });
        }
      } catch { /* skip an unreadable transcript */ }
    }
    items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return items;
  } catch {
    return [];
  }
}

/** Read a full conversation record (core-message format) for loading into chat. */
export async function readHistoryConversation(id: string): Promise<{ id: string; title: string; messages: unknown[] } | null> {
  try {
    const dir = await historyDir();
    return JSON.parse(await readTextFile(`${dir}/${id}.json`, { baseDir: BaseDirectory.Home }));
  } catch {
    return null;
  }
}

/** Delete a conversation file from the shared local store. */
export async function deleteHistoryConversation(id: string): Promise<void> {
  try {
    const dir = await historyDir();
    await remove(`${dir}/${id}.json`, { baseDir: BaseDirectory.Home });
  } catch { /* already gone */ }
}
