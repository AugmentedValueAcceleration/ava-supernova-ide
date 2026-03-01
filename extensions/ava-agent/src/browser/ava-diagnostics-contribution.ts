import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import URI from '@theia/core/lib/common/uri';
import { Diagnostic, DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import { AvaAgentClient } from './ava-agent-client';
import { AvaAgentService, IAvaAgentService } from '../common/ava-agent-protocol';
import { AvaAgentContribution } from './ava-agent-contribution';

const AVA_DIAGNOSTIC_OWNER = 'ava-agent';

interface ParsedFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  file: string;
  line: number;
  description: string;
}

export const AvaFixProblemCommand: Command = {
  id: 'ava.fixProblem',
  label: 'Ava: Fix This Problem',
  category: 'Ava',
};

@injectable()
export class AvaDiagnosticsContribution implements FrontendApplicationContribution, CommandContribution {

  @inject(AvaAgentClient) protected readonly client: AvaAgentClient;
  @inject(ProblemManager) protected readonly problemManager: ProblemManager;
  @inject(EditorManager) protected readonly editorManager: EditorManager;
  @inject(AvaAgentService) protected readonly service: IAvaAgentService;
  @inject(AvaAgentContribution) protected readonly agentContribution: AvaAgentContribution;

  private markedUris = new Set<string>();
  private wasStreaming = false;

  @postConstruct()
  protected init(): void {
    this.client.onStateChanged(state => {
      // Parse diagnostics when streaming ends
      if (this.wasStreaming && !state.isStreaming) {
        const last = state.messages[state.messages.length - 1];
        if (last?.role === 'assistant' && last.content) {
          this.parseAndSetDiagnostics(last.content);
        }
      }
      this.wasStreaming = state.isStreaming;

      // Clear diagnostics on new chat (messages become empty)
      if (state.messages.length === 0 && this.markedUris.size > 0) {
        this.clearAllDiagnostics();
      }
    });
  }

  async onStart(): Promise<void> {}

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(AvaFixProblemCommand, {
      execute: async () => {
        const editor = this.editorManager.currentEditor?.editor;
        if (!editor) return;

        const uri = editor.uri;
        const cursorLine = editor.cursor.line;

        // Find Ava-owned diagnostics at the cursor line
        const markers = this.problemManager.findMarkers({ uri, owner: AVA_DIAGNOSTIC_OWNER });
        const atLine = markers.filter(m => m.data.range.start.line === cursorLine);
        if (atLine.length === 0) return;

        const message = atLine.map(m => m.data.message).join('\n');
        const filePath = uri.path.toString();
        const language = editor.document.languageId;

        await this.agentContribution.openView({ activate: true });
        this.service.sendMessage(
          `Fix this issue in ${filePath}:${cursorLine + 1}: ${message}\n\nFile context:\n\`\`\`${language}\n${editor.document.getText()}\n\`\`\``,
          'code',
        );
      },
      isEnabled: () => {
        const editor = this.editorManager.currentEditor?.editor;
        if (!editor) return false;
        const markers = this.problemManager.findMarkers({ uri: editor.uri, owner: AVA_DIAGNOSTIC_OWNER });
        return markers.some(m => m.data.range.start.line === editor.cursor.line);
      },
    });
  }

  private parseAndSetDiagnostics(content: string): void {
    const findings = this.parseFindings(content);
    if (findings.length === 0) return;

    // Group by file
    const byFile = new Map<string, ParsedFinding[]>();
    for (const f of findings) {
      const existing = byFile.get(f.file) || [];
      existing.push(f);
      byFile.set(f.file, existing);
    }

    // Set diagnostics per file
    for (const [filePath, fileFindings] of byFile) {
      const uriStr = filePath.includes('://')
        ? filePath
        : `file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`;
      const uri = new URI(uriStr);

      const diagnostics: Diagnostic[] = fileFindings.map(f => ({
        range: {
          start: { line: Math.max(0, f.line - 1), character: 0 },
          end: { line: Math.max(0, f.line - 1), character: 999 },
        },
        severity: this.mapSeverity(f.severity),
        source: 'Ava',
        message: `[${f.severity}] ${f.title}: ${f.description}`,
      }));

      this.markedUris.add(uriStr);
      this.problemManager.setMarkers(uri, AVA_DIAGNOSTIC_OWNER, diagnostics);
    }
  }

  private parseFindings(content: string): ParsedFinding[] {
    const findings: ParsedFinding[] = [];
    // Match security audit output format:
    // ### [SEVERITY] Title
    // - **File**: path:line
    // - **Description**: text
    const regex = /###\s*\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]\s*(.+?)(?:\r?\n)([\s\S]*?)(?=###\s*\[|$)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const severity = match[1] as ParsedFinding['severity'];
      const title = match[2].trim();
      const body = match[3];

      const fileMatch = body.match(/\*\*File\*\*:\s*(.+?):(\d+)/);
      const descMatch = body.match(/\*\*Description\*\*:\s*(.+)/);

      if (fileMatch) {
        findings.push({
          severity,
          title,
          file: fileMatch[1].trim(),
          line: parseInt(fileMatch[2], 10),
          description: descMatch ? descMatch[1].trim() : title,
        });
      }
    }
    return findings;
  }

  private mapSeverity(severity: string): DiagnosticSeverity {
    switch (severity) {
      case 'CRITICAL': return DiagnosticSeverity.Error;
      case 'HIGH': return DiagnosticSeverity.Error;
      case 'MEDIUM': return DiagnosticSeverity.Warning;
      case 'LOW': return DiagnosticSeverity.Information;
      case 'INFO': return DiagnosticSeverity.Hint;
      default: return DiagnosticSeverity.Information;
    }
  }

  private clearAllDiagnostics(): void {
    for (const uriStr of this.markedUris) {
      this.problemManager.setMarkers(new URI(uriStr), AVA_DIAGNOSTIC_OWNER, []);
    }
    this.markedUris.clear();
  }
}
