import { t } from './i18n';

/**
 * Status-line description of a running tool — "Editing src/player.ts" rather
 * than "Reading file...".
 *
 * The IDE has always kept its status alive through a tool call (the EXTENSION
 * was the one that hid it), but it only ever said which KIND of thing was
 * happening, while the arguments naming the actual file sat unused on the same
 * event.
 *
 * Specific is the point. For someone new to this, watching
 * "Reading package.json → Editing src/player.ts → Running npm test" IS the
 * loop being taught, out in the open. A spinner teaches nothing, and neither
 * does "Reading file...".
 *
 * Mirrors packages/extension/webview-ui/src/lib/tool-label.ts. The two
 * surfaces have separate i18n stacks so the code cannot be shared outright,
 * but the WORDING should not drift — if you add a tool here, add it there.
 *
 * Matches INTERNAL tool names (file_read, file_write, file_edit), not the
 * short names the model sees (read, write, edit). ToolRegistry resolves
 * model-facing aliases to the canonical identity before any bookkeeping, so
 * events carry the internal name.
 */
export function toolStatusLabel(
  toolName: string | undefined,
  args: Record<string, unknown> | undefined,
): string {
  if (!toolName) return '';

  const a = args || {};
  const file = shortenPath(a.file_path as string | undefined);
  const pattern = a.pattern as string | undefined;
  const command = a.command as string | undefined;
  const query = a.query as string | undefined;
  const dir = shortenPath(a.path as string | undefined);

  switch (toolName) {
    case 'file_read':
      return file ? t('dash.chat.status.tool.read_file', { file })
                  : t('dash.chat.status.tool.file_read');
    case 'file_write':
      return file ? t('dash.chat.status.tool.write_file', { file })
                  : t('dash.chat.status.tool.file_write');
    case 'file_edit':
      return file ? t('dash.chat.status.tool.edit_file', { file })
                  : t('dash.chat.status.tool.file_write');
    case 'bash':
      return command ? t('dash.chat.status.tool.run_cmd', { command: truncate(command, 60) })
                     : t('dash.chat.status.tool.bash');
    case 'grep':
    case 'find_symbol':
      return pattern ? t('dash.chat.status.tool.search_for', { pattern: `/${pattern}/` })
                     : t('dash.chat.status.tool.grep');
    case 'glob':
      return pattern ? t('dash.chat.status.tool.find_files', { pattern })
                     : t('dash.chat.status.tool.glob');
    case 'list_directory':
      return dir ? t('dash.chat.status.tool.list_path', { file: dir })
                 : t('dash.chat.status.tool.glob');
    case 'web_search':
      return query ? t('dash.chat.status.tool.web_for', { query: truncate(query, 50) })
                   : t('dash.chat.status.tool.web_search');

    // No useful argument to name — the generic line is already the whole truth.
    case 'git_status':
    case 'git_diff':
      return t('dash.chat.status.tool.git');
    case 'memory_recall':
      return t('dash.chat.status.tool.memory_recall');
    case 'memory_save':
      return t('dash.chat.status.tool.memory_save');
    case 'test_run':
      return t('dash.chat.status.tool.test_run');
    case 'analyze_architecture':
      return t('dash.chat.status.tool.architecture');
    case 'project_index':
      return t('dash.chat.status.tool.project_index');
    default:
      return `Using ${toolName}...`;
  }
}

function shortenPath(p: string | undefined): string {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length <= 2 ? p : parts.slice(-2).join('/');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
