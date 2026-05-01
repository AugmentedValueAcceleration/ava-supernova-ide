/**
 * Tool-header helper — maps a tool call (name + args) to a descriptive
 * (verb, target) pair. Mirrors the v0.39.0 extension helper.
 *
 * In the IDE this is used to render tool chips with readable labels
 * ("Edit packages/foo.ts" instead of "file_edit"). The existing IDE
 * tool-call shape doesn't store args as JSON — it stores them as a
 * Record — so this helper accepts both shapes.
 *
 * Aliases included so it works with canonical (file_write, file_read,
 * file_edit) and model-facing (write, read, edit) names alike.
 */

export interface ToolHeader {
  verb: string;
  target: string;
}

/**
 * Accepts args as either a JSON string or a plain object. Returns a
 * readable verb + target for rendering in the chat timeline.
 */
export function getToolHeader(name: string, args: Record<string, unknown> | string | undefined): ToolHeader {
  const a: Record<string, unknown> = typeof args === 'string'
    ? (() => { try { return JSON.parse(args); } catch { return {}; } })()
    : (args || {});

  const filePath = shortenPath(a.file_path as string | undefined);

  switch (name) {
    case 'file_read':
    case 'read':
      return { verb: 'Read', target: filePath || 'file' };
    case 'file_write':
    case 'write':
      return { verb: 'Write', target: filePath || 'file' };
    case 'file_edit':
    case 'edit':
      return { verb: 'Edit', target: filePath || 'file' };

    case 'glob':
      return { verb: 'Glob', target: truncate((a.pattern as string) || '...', 80) };
    case 'grep':
      return { verb: 'Grep', target: truncate((a.pattern as string) || '...', 80) };
    case 'list_directory':
      return { verb: 'List', target: shortenPath(a.path as string | undefined) || 'directory' };
    case 'find_symbol':
      return { verb: 'Find symbol', target: (a.name as string) || '' };
    case 'project_index':
      return { verb: 'Index project', target: '' };

    case 'bash':
      return { verb: 'Bash', target: truncate(((a.command as string) || '').split('\n')[0], 100) };

    case 'web_search':
      return { verb: 'Search', target: truncate((a.query as string) || '...', 80) };
    case 'http_request':
      return {
        verb: 'HTTP',
        target: `${(a.method as string) || 'GET'} ${truncate((a.url as string) || '', 80)}`.trim(),
      };
    case 'browser':
      return { verb: 'Browser', target: buildBrowserTarget(a) };

    case 'git_status':
      return { verb: 'Git', target: 'status' };
    case 'git_diff':
      return { verb: 'Git', target: 'diff' };
    case 'git_commit':
      return { verb: 'Git commit', target: truncate((a.message as string) || '', 80) };
    case 'git_create_pr':
      return { verb: 'Create PR', target: truncate((a.title as string) || '', 80) };
    case 'rollback':
      return { verb: 'Rollback', target: (a.target as string) || '' };

    case 'memory_save':
      return { verb: 'Save memory', target: (a.category as string) || (a.scope as string) || '' };
    case 'memory_recall':
      return { verb: 'Recall memory', target: truncate((a.query as string) || '', 80) };
    case 'memory_update':
      return { verb: 'Update memory', target: truncate((a.id as string) || (a.content as string) || '', 80) };
    case 'memory_delete':
      return { verb: 'Delete memory', target: truncate((a.id as string) || '', 80) };

    case 'screenshot':
      return { verb: 'Screenshot', target: 'screen' };
    case 'generate_image':
      return { verb: 'Generate image', target: truncate((a.prompt as string) || '', 80) };
    case 'generate_video':
      return { verb: 'Generate video', target: truncate((a.prompt as string) || '', 80) };
    case 'generate_music':
      return { verb: 'Generate music', target: truncate((a.prompt as string) || '', 80) };
    case 'generate_voice':
      return { verb: 'Generate voice', target: truncate((a.text as string) || '', 80) };
    case 'remove_background':
      return { verb: 'Remove background', target: '' };

    case 'present_plan':
      return { verb: 'Present plan', target: truncate((a.title as string) || '', 80) };
    case 'todo_write':
      return { verb: 'Update todos', target: '' };
    case 'task_manage':
      return { verb: 'Task', target: truncate((a.action as string) || '', 80) };
    case 'apply_plan':
      return { verb: 'Apply plan', target: '' };
    case 'ask_user':
      return { verb: 'Ask user', target: '' };
    case 'switch_mode':
      return { verb: 'Switch mode', target: (a.mode as string) || '' };

    case 'database_query':
      return { verb: 'Query', target: truncate((a.sql as string) || (a.query as string) || '', 80) };
    case 'document_manage':
      return { verb: 'Document', target: (a.action as string) || '' };
    case 'document_templates':
      return { verb: 'Document template', target: (a.name as string) || '' };
    case 'presentation_create':
      return { verb: 'Create presentation', target: truncate((a.title as string) || '', 80) };
    case 'email_draft':
      return { verb: 'Draft email', target: truncate((a.subject as string) || '', 80) };
    case 'report_generate':
      return { verb: 'Generate report', target: truncate((a.title as string) || '', 80) };

    case 'analyze_architecture':
      return { verb: 'Analyse architecture', target: '' };
    case 'audit_dependencies':
      return { verb: 'Audit dependencies', target: '' };
    case 'security':
      return { verb: 'Security audit', target: (a.action as string) || '' };
    case 'benchmark':
      return { verb: 'Benchmark', target: (a.target as string) || '' };

    case 'test_run':
      return { verb: 'Run tests', target: truncate((a.pattern as string) || '', 80) };
    case 'test_generate':
      return { verb: 'Generate tests', target: shortenPath(a.file_path as string | undefined) || '' };
    case 'doc_generate':
      return { verb: 'Generate docs', target: shortenPath(a.file_path as string | undefined) || '' };

    case 'debug_logs':
      return { verb: 'Debug logs', target: (a.query as string) || '' };
    case 'journal_write':
      return { verb: 'Journal', target: truncate((a.entry as string) || (a.title as string) || '', 80) };
    case 'learning':
      return { verb: 'Learning', target: (a.action as string) || '' };

    case 'docs_lookup':
      return { verb: 'Lookup docs', target: truncate((a.query as string) || '', 80) };
    case 'propose_tool':
      return { verb: 'Propose tool', target: truncate((a.name as string) || '', 80) };
    case 'self_inspect':
      return { verb: 'Self-inspect', target: (a.target as string) || '' };
    case 'release_notes':
      return { verb: 'Release notes', target: '' };
    case 'support_request':
      return { verb: 'Support request', target: '' };
    case 'get_datetime':
      return { verb: 'Time', target: '' };
    case 'detect_language':
      return { verb: 'Detect language', target: '' };

    case 'weather':
      return { verb: 'Weather', target: (a.location as string) || '' };
    case 'news':
      return { verb: 'News', target: truncate((a.query as string) || (a.category as string) || '', 80) };

    default:
      return { verb: capitalize(name.replace(/_/g, ' ')), target: '' };
  }
}

function buildBrowserTarget(args: Record<string, unknown>): string {
  const action = (args.action as string) || '';
  switch (action) {
    case 'navigate':
    case 'goto':
      return `navigate ${truncate((args.url as string) || '', 80)}`;
    case 'screenshot':
      return `screenshot${args.selector ? ` ${args.selector}` : ''}`;
    case 'click':
      return `click ${truncate((args.selector as string) || '', 60)}`;
    case 'fill':
      return `fill ${truncate((args.selector as string) || '', 60)}`;
    case 'extract':
      return `extract ${(args.selector as string) || 'page'}`;
    case 'evaluate':
      return 'evaluate JS';
    default:
      return action || 'browser';
  }
}

function shortenPath(p: string | undefined): string {
  if (!p) return '';
  const normalized = p.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts.length <= 3) return normalized;
  return '…/' + parts.slice(-3).join('/');
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
