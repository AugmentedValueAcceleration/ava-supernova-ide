import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AvaProjectType, AvaProjectInfo } from '../common/ava-agent-protocol';

interface ExtensionSuggestion {
  id: string;
  name: string;
  reason: string;
}

interface ProjectProfile {
  type: AvaProjectType;
  extensions: ExtensionSuggestion[];
  formatter: string | null;
  tabSize: number;
}

const PROJECT_PROFILES: Record<string, ProjectProfile> = {
  node: {
    type: 'node',
    extensions: [
      { id: 'esbenp.prettier-vscode', name: 'Prettier', reason: 'Code formatter for JavaScript/TypeScript' },
    ],
    formatter: 'esbenp.prettier-vscode',
    tabSize: 2,
  },
  python: {
    type: 'python',
    extensions: [
      { id: 'ms-python.black-formatter', name: 'Black Formatter', reason: 'Code formatter for Python' },
    ],
    formatter: 'ms-python.black-formatter',
    tabSize: 4,
  },
  go: {
    type: 'go',
    extensions: [
      { id: 'golang.go', name: 'Go', reason: 'Go language support with gofmt' },
    ],
    formatter: null,
    tabSize: 4,
  },
  rust: {
    type: 'rust',
    extensions: [
      { id: 'rust-lang.rust-analyzer', name: 'rust-analyzer', reason: 'Rust language support with rustfmt' },
    ],
    formatter: null,
    tabSize: 4,
  },
  java: {
    type: 'java',
    extensions: [
      { id: 'redhat.java', name: 'Language Support for Java', reason: 'Java language support' },
    ],
    formatter: null,
    tabSize: 4,
  },
  csharp: {
    type: 'csharp',
    extensions: [
      { id: 'muhammad-sammy.csharp', name: 'C#', reason: 'C# language support' },
    ],
    formatter: null,
    tabSize: 4,
  },
};

/** Marker files checked in priority order. */
const MARKERS: Array<{ files: string[]; type: string }> = [
  { files: ['package.json'], type: 'node' },
  { files: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'], type: 'python' },
  { files: ['go.mod'], type: 'go' },
  { files: ['Cargo.toml'], type: 'rust' },
  { files: ['pom.xml', 'build.gradle', 'build.gradle.kts'], type: 'java' },
  { files: ['.sln'], type: 'csharp' },
];

/**
 * Detect project type from the filesystem and return configuration suggestions.
 */
export function detectProject(rootPath: string): AvaProjectInfo | null {
  let detectedType = 'unknown';

  // Check marker files
  for (const marker of MARKERS) {
    for (const file of marker.files) {
      // For .sln, check if any file matches the pattern
      if (file === '.sln') {
        try {
          const { readdirSync } = require('node:fs');
          const files = readdirSync(rootPath) as string[];
          if (files.some((f: string) => f.endsWith('.sln'))) {
            detectedType = marker.type;
            break;
          }
        } catch { /* ignore */ }
      } else if (existsSync(join(rootPath, file))) {
        detectedType = marker.type;
        break;
      }
    }
    if (detectedType !== 'unknown') break;
  }

  if (detectedType === 'unknown') return null;

  const profile = PROJECT_PROFILES[detectedType];
  if (!profile) return null;

  // Read .editorconfig if present
  let tabSize = profile.tabSize;
  let lineEndings: 'lf' | 'crlf' | 'auto' = 'auto';

  const editorConfigPath = join(rootPath, '.editorconfig');
  if (existsSync(editorConfigPath)) {
    try {
      const content = readFileSync(editorConfigPath, 'utf-8');
      const parsed = parseEditorConfig(content);
      if (parsed.indent_size) tabSize = parsed.indent_size;
      if (parsed.end_of_line === 'lf') lineEndings = 'lf';
      else if (parsed.end_of_line === 'crlf') lineEndings = 'crlf';
    } catch { /* ignore parse errors */ }
  }

  return {
    projectType: profile.type,
    rootPath,
    suggestedExtensions: profile.extensions,
    suggestedFormatter: profile.formatter,
    tabSize,
    lineEndings,
  };
}

/** Minimal .editorconfig parser — extracts values from the [*] section. */
function parseEditorConfig(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  let inGlobalSection = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    if (trimmed.startsWith('[')) {
      inGlobalSection = trimmed === '[*]';
      continue;
    }

    if (inGlobalSection) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
        const value = trimmed.slice(eqIdx + 1).trim().toLowerCase();
        if (key === 'indent_size' || key === 'tab_width') {
          const num = parseInt(value, 10);
          if (!isNaN(num)) result.indent_size = num;
        } else if (key === 'end_of_line') {
          result.end_of_line = value;
        } else if (key === 'indent_style') {
          result.indent_style = value;
        }
      }
    }
  }

  return result;
}
