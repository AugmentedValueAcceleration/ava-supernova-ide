import * as React from '@theia/core/shared/react';

export interface AvaDocsBrowserProps {
  onBack: () => void;
}

type TabId =
  | 'getting-started'
  | 'choosing-model'
  | 'models'
  | 'tools'
  | 'memory'
  | 'commands'
  | 'modes'
  | 'permissions'
  | 'configuration'
  | 'project-context'
  | 'languages'
  | 'shortcuts';

const TABS: { id: TabId; label: string }[] = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'choosing-model', label: 'Choosing Your Model' },
  { id: 'models', label: 'Models' },
  { id: 'tools', label: 'Tools' },
  { id: 'memory', label: 'Memory' },
  { id: 'commands', label: 'Commands' },
  { id: 'modes', label: 'Modes' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'project-context', label: 'Project Context' },
  { id: 'languages', label: 'Languages' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts' },
];

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  backBtn: {
    padding: '5px 10px',
    border: '1px solid var(--theia-input-border)',
    borderRadius: '5px',
    background: 'transparent',
    color: 'var(--theia-foreground)',
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '12px',
  },
  title: {
    fontWeight: 600 as const,
    fontSize: '13px',
    color: 'var(--theia-foreground)',
    flex: 1,
  },
  tabBar: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--theia-panel-border)',
    flexShrink: 0 as const,
  },
  tabBtn: (active: boolean) => ({
    padding: '4px 10px',
    borderRadius: '5px',
    background: active ? 'var(--ava-accent, #A855F7)' : 'transparent',
    color: active ? '#fff' : 'var(--theia-foreground)',
    border: active ? 'none' : '1px solid var(--theia-input-border)',
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '11px',
    fontWeight: active ? 600 : 400,
    opacity: active ? 1 : 0.7,
  }),
  platformBar: {
    display: 'flex',
    gap: '4px',
    margin: '8px 0',
  },
  platformBtn: (active: boolean) => ({
    padding: '3px 10px',
    borderRadius: '4px',
    background: active ? 'var(--ava-accent, #A855F7)' : 'var(--theia-editorWidget-background)',
    color: active ? '#fff' : 'var(--theia-foreground)',
    border: '1px solid var(--theia-input-border)',
    cursor: 'pointer',
    fontFamily: 'var(--theia-ui-font-family)',
    fontSize: '11px',
  }),
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
    fontSize: '13px',
    lineHeight: '1.6',
    color: 'var(--theia-foreground)',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600 as const,
    color: 'var(--ava-accent, #A855F7)',
    marginBottom: '8px',
    paddingBottom: '4px',
    borderBottom: '1px solid var(--theia-panel-border)',
  },
  h3: {
    fontSize: '13px',
    fontWeight: 600 as const,
    marginTop: '12px',
    marginBottom: '6px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px',
    marginBottom: '8px',
  },
  th: {
    textAlign: 'left' as const,
    padding: '6px 10px',
    borderBottom: '1px solid var(--theia-panel-border)',
    background: 'var(--theia-editorWidget-background)',
    fontSize: '10px',
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--ava-accent, #A855F7)',
  },
  td: {
    padding: '5px 10px',
    borderBottom: '1px solid var(--theia-panel-border)',
  },
  tdMuted: {
    padding: '5px 10px',
    borderBottom: '1px solid var(--theia-panel-border)',
    opacity: 0.6,
  },
  code: {
    fontFamily: 'var(--theia-editor-font-family, monospace)',
    fontSize: '11px',
    background: 'var(--theia-editorWidget-background)',
    padding: '1px 5px',
    borderRadius: '3px',
    border: '1px solid var(--theia-panel-border)',
  },
  card: {
    background: 'var(--theia-editorWidget-background)',
    border: '1px solid var(--theia-panel-border)',
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '8px',
  },
  cardTitle: {
    fontSize: '12px',
    fontWeight: 600 as const,
    color: 'var(--ava-accent, #A855F7)',
    marginBottom: '4px',
  },
  cardText: {
    fontSize: '12px',
    opacity: 0.7,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '8px',
    marginBottom: '8px',
  },
  badge: (type: 'safe' | 'write' | 'dangerous') => {
    const colors = { safe: '#065f46', write: '#92400e', dangerous: '#991b1b' };
    const text = { safe: '#6ee7b7', write: '#fcd34d', dangerous: '#fca5a5' };
    return {
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 10,
      fontSize: '10px',
      fontWeight: 600 as const,
      background: colors[type],
      color: text[type],
    };
  },
  muted: {
    fontSize: '11px',
    opacity: 0.5,
  },
  pre: {
    background: 'var(--theia-editorWidget-background)',
    border: '1px solid var(--theia-panel-border)',
    borderRadius: '6px',
    padding: '10px 12px',
    overflow: 'auto' as const,
    fontFamily: 'var(--theia-editor-font-family, monospace)',
    fontSize: '11px',
    lineHeight: '1.5',
    margin: '8px 0',
  },
  ul: {
    paddingLeft: '18px',
    margin: '6px 0',
    fontSize: '12px',
  },
};

export const AvaDocsBrowser: React.FC<AvaDocsBrowserProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = React.useState<TabId>('getting-started');
  const [platform, setPlatform] = React.useState<'vscode' | 'cli' | 'ide'>('vscode');

  return (
    <div style={s.container}>
      <div style={s.toolbar}>
        <button style={s.backBtn} onClick={onBack}>Back</button>
        <span style={s.title}>Documentation</span>
      </div>

      <div style={s.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            style={s.tabBtn(activeTab === tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={s.content}>

        {/* Getting Started */}
        {activeTab === 'getting-started' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Getting Started</div>
            <p style={{ marginBottom: '8px', opacity: 0.7, fontSize: '12px' }}>
              Choose your platform to get up and running with Ava in minutes.
            </p>
            <div style={s.platformBar}>
              <button style={s.platformBtn(platform === 'vscode')} onClick={() => setPlatform('vscode')}>VS Code</button>
              <button style={s.platformBtn(platform === 'cli')} onClick={() => setPlatform('cli')}>CLI</button>
              <button style={s.platformBtn(platform === 'ide')} onClick={() => setPlatform('ide')}>IDE</button>
            </div>

            {platform === 'vscode' && (
              <div>
                <div style={s.card}>
                  <div style={s.cardTitle}>1. Install the Extension</div>
                  <div style={s.cardText}>
                    Search for <strong>Ava Supernova</strong> in the VS Code Extensions Marketplace, or install from the <span style={s.code}>.vsix</span> file.
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>2. Add Your API Key</div>
                  <div style={s.cardText}>
                    Open the Ava sidebar and go to Settings. Add an API key from any supported provider (DeepSeek, Moonshot AI, Zhipu AI, Mistral, Anthropic, etc).
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>3. Select a Model</div>
                  <div style={s.cardText}>
                    Choose a model from the model selector at the top of the chat panel. We recommend <strong>Kimi K2.5</strong> or <strong>GLM-5</strong> for agentic coding.
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>4. Start Chatting</div>
                  <div style={s.cardText}>
                    Type your request in the chat input. Ava will read your code, create plans, write files, and run commands to complete your task.
                  </div>
                </div>
              </div>
            )}

            {platform === 'cli' && (
              <div>
                <div style={s.card}>
                  <div style={s.cardTitle}>1. Install the CLI</div>
                  <div style={s.cardText}>
                    <pre style={s.pre}>npm install -g @ava/cli</pre>
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>2. Run Ava</div>
                  <div style={s.cardText}>
                    Open a terminal and run <span style={s.code}>ava</span>. The setup wizard will guide you through initial configuration.
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>3. Add Providers</div>
                  <div style={s.cardText}>
                    Use <span style={s.code}>/provider</span> to configure your API keys. You can add multiple providers and switch between them.
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>4. Start Coding</div>
                  <div style={s.cardText}>
                    Navigate to your project directory and start giving Ava instructions. It has full access to your codebase tools.
                  </div>
                </div>
              </div>
            )}

            {platform === 'ide' && (
              <div>
                <div style={s.card}>
                  <div style={s.cardTitle}>1. Download the Installer</div>
                  <div style={s.cardText}>
                    Download the Ava Supernova IDE installer for your platform from the <strong>GitHub Releases</strong> page.
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>2. Install</div>
                  <div style={s.cardText}>
                    Run the installer and follow the prompts. The IDE includes all dependencies bundled.
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>3. Configure Providers</div>
                  <div style={s.cardText}>
                    Open the Dashboard (<kbd style={{ background: 'var(--theia-editorWidget-background)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--theia-panel-border)', fontSize: '11px' }}>Ctrl+Shift+D</kbd>) and add your API keys for the providers you want to use.
                  </div>
                </div>
                <div style={s.card}>
                  <div style={s.cardTitle}>4. Open a Project</div>
                  <div style={s.cardText}>
                    Use File &gt; Open Folder to open your project, then start chatting with Ava in the sidebar panel.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Choosing Your Model */}
        {activeTab === 'choosing-model' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Choosing Your Model</div>
            <p style={{ marginBottom: '12px', opacity: 0.7, fontSize: '12px' }}>
              Not sure which model to pick? Here are our recommendations by use case.
            </p>
            <div style={s.cardGrid}>
              <div style={s.card}>
                <div style={s.cardTitle}>Best for Agentic Coding</div>
                <div style={s.cardText}>
                  <strong>Kimi K2.5</strong> — 76.8% SWE-Bench, best multi-step tool calling<br />
                  <strong>GLM-5</strong> — 77.8% SWE-Bench, best tool-call reliability
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Best Value</div>
                <div style={s.cardText}>
                  <strong>DeepSeek V3.2</strong> — $0.14 / $0.28 per 1M tokens<br />
                  <strong>GLM-4.5 Flash</strong> — Free
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Best Reasoning</div>
                <div style={s.cardText}>
                  <strong>DeepSeek R1</strong> — $0.14 / $2.19 per 1M tokens, extended thinking
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Frontier Intelligence</div>
                <div style={s.cardText}>
                  <strong>Claude Opus 4.6</strong> — $15 / $75, most capable<br />
                  <strong>Claude Sonnet 4.6</strong> — $3 / $15, best speed/capability balance
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Best for Code</div>
                <div style={s.cardText}>
                  <strong>Codestral</strong> — $0.30 / $0.90, code-focused 256K context<br />
                  <strong>Devstral 2</strong> — $0.10 / $0.30, agentic coding specialist
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Best Long Context</div>
                <div style={s.cardText}>
                  <strong>Qwen 3.5 Plus</strong> — $0.40 / $1.20, 256K context<br />
                  <strong>Mistral Large 3</strong> — $2 / $6, flagship general-purpose
                </div>
              </div>
            </div>
            <p style={s.muted}>Prices shown as input / output per 1M tokens. All models work with your own API keys.</p>
          </div>
        )}

        {/* Models */}
        {activeTab === 'models' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Supported Models</div>
            <p style={{ marginBottom: '8px', opacity: 0.7, fontSize: '12px' }}>
              All models work on every plan. Use our managed service or bring your own API keys.
            </p>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Provider</th>
                  <th style={s.th}>Model</th>
                  <th style={s.th}>Highlights</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Cost / 1M tokens</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.map((m, i) => (
                  <tr key={i}>
                    <td style={s.tdMuted}>{m.provider}</td>
                    <td style={{ ...s.td, fontWeight: 500 }}>{m.model}</td>
                    <td style={s.tdMuted}>{m.highlights}</td>
                    <td style={{ ...s.tdMuted, textAlign: 'right', fontFamily: 'monospace', fontSize: '11px' }}>{m.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={s.muted}>Pricing is approximate. You can also connect to locally hosted models via Ollama, LM Studio, or any standard API format endpoint.</p>
          </div>
        )}

        {/* Tools */}
        {activeTab === 'tools' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Built-in Tools (24)</div>
            {TOOL_GROUPS.map(group => (
              <div key={group.title}>
                <div style={s.h3}>{group.title}</div>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Tool</th>
                      <th style={s.th}>Description</th>
                      <th style={{ ...s.th, textAlign: 'center' }}>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.tools.map((t, i) => (
                      <tr key={i}>
                        <td style={s.td}><span style={s.code}>{t.name}</span></td>
                        <td style={s.tdMuted}>{t.desc}</td>
                        <td style={{ ...s.td, textAlign: 'center' }}><span style={s.badge(t.risk)}>{t.risk}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <p style={s.muted}>The agent runs up to 50 iterations per request, deciding which tools to use, executing them, reading results, and continuing.</p>
          </div>
        )}

        {/* Memory */}
        {activeTab === 'memory' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Memory System</div>
            <p style={{ marginBottom: '8px', opacity: 0.7, fontSize: '12px' }}>
              Ava has persistent memory that survives across sessions. Memories are stored locally and optionally synced to the cloud with a platform account.
            </p>
            <div style={s.cardGrid}>
              <div style={s.card}>
                <div style={s.cardTitle}>Global Memory</div>
                <div style={s.cardText}>Preferences and knowledge across all projects. Stored at <span style={s.code}>~/.ava/memory.md</span>.</div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Project Memory</div>
                <div style={s.cardText}>Project-specific context. Stored at <span style={s.code}>.ava/memory.md</span> in your project root.</div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Semantic Search</div>
                <div style={s.cardText}>Relevant memories are automatically retrieved at session start using vector embeddings.</div>
              </div>
              <div style={s.card}>
                <div style={s.cardTitle}>Cloud Sync</div>
                <div style={s.cardText}>With a platform account, memories sync across machines and are viewable in the dashboard.</div>
              </div>
            </div>
            <div style={s.card}>
              <div style={s.cardTitle}>How It Works</div>
              <ul style={s.ul}>
                <li>Ask Ava to remember something and it saves via <span style={s.code}>memory_save</span></li>
                <li>Memories load automatically into each new session</li>
                <li>Use <span style={s.code}>memory_recall</span> to search stored knowledge mid-conversation</li>
                <li>You have full control — view, edit, and delete memories in the Dashboard or locally</li>
              </ul>
            </div>
          </div>
        )}

        {/* Commands */}
        {activeTab === 'commands' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Commands</div>
            <p style={{ marginBottom: '8px', opacity: 0.7, fontSize: '12px' }}>
              Type these commands in the chat input. Available in both the CLI and extension.
            </p>
            <div style={s.h3}>General</div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Command</th>
                  <th style={s.th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {COMMANDS_GENERAL.map((c, i) => (
                  <tr key={i}>
                    <td style={s.td}><span style={s.code}>{c.cmd}</span></td>
                    <td style={s.tdMuted}>{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={s.h3}>History</div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Command</th>
                  <th style={s.th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {COMMANDS_HISTORY.map((c, i) => (
                  <tr key={i}>
                    <td style={s.td}><span style={s.code}>{c.cmd}</span></td>
                    <td style={s.tdMuted}>{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modes */}
        {activeTab === 'modes' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Modes</div>
            <div style={s.cardGrid}>
              {MODES.map((m, i) => (
                <div key={i} style={s.card}>
                  <div style={s.cardTitle}>{m.name}</div>
                  <div style={s.cardText}>{m.desc}</div>
                </div>
              ))}
            </div>
            <p style={s.muted}>Switch modes from the mode bar at the bottom of the chat.</p>
          </div>
        )}

        {/* Permissions */}
        {activeTab === 'permissions' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Permission Modes</div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Mode</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>File Reads</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>File Writes</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Shell Commands</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ ...s.td, fontWeight: 500 }}>Strict</td>
                  <td style={{ ...s.td, textAlign: 'center' }}><span style={s.badge('safe')}>auto</span></td>
                  <td style={{ ...s.td, textAlign: 'center' }}>Confirm</td>
                  <td style={{ ...s.td, textAlign: 'center' }}>Confirm</td>
                </tr>
                <tr>
                  <td style={{ ...s.td, fontWeight: 500 }}>Balanced</td>
                  <td style={{ ...s.td, textAlign: 'center' }}><span style={s.badge('safe')}>auto</span></td>
                  <td style={{ ...s.td, textAlign: 'center' }}><span style={s.badge('safe')}>auto</span></td>
                  <td style={{ ...s.td, textAlign: 'center' }}>Confirm</td>
                </tr>
                <tr>
                  <td style={{ ...s.td, fontWeight: 500 }}>Autonomous</td>
                  <td style={{ ...s.td, textAlign: 'center' }}><span style={s.badge('safe')}>auto</span></td>
                  <td style={{ ...s.td, textAlign: 'center' }}><span style={s.badge('safe')}>auto</span></td>
                  <td style={{ ...s.td, textAlign: 'center' }}><span style={s.badge('safe')}>auto</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Configuration */}
        {activeTab === 'configuration' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Configuration</div>
            <div style={s.h3}>Settings</div>
            <p style={{ marginBottom: '8px', opacity: 0.7, fontSize: '12px' }}>
              Open the Dashboard (<kbd style={{ background: 'var(--theia-editorWidget-background)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--theia-panel-border)', fontSize: '11px' }}>Ctrl+Shift+D</kbd>) to configure providers, preferences, and your account.
            </p>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Setting</th>
                  <th style={s.th}>Description</th>
                  <th style={s.th}>Default</th>
                </tr>
              </thead>
              <tbody>
                {SETTINGS.map((st, i) => (
                  <tr key={i}>
                    <td style={{ ...s.td, fontWeight: 500 }}>{st.name}</td>
                    <td style={s.tdMuted}>{st.desc}</td>
                    <td style={s.tdMuted}>{st.def}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Project Context */}
        {activeTab === 'project-context' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Project Context</div>
            <p style={{ marginBottom: '8px', opacity: 0.7, fontSize: '12px' }}>
              Create a <span style={s.code}>.ava/instructions.md</span> file in your project root to give Ava persistent knowledge about your codebase.
            </p>
            <div style={s.card}>
              <div style={s.cardTitle}>What to include</div>
              <ul style={s.ul}>
                <li>Project architecture overview</li>
                <li>Coding conventions and style preferences</li>
                <li>Key file locations and patterns</li>
                <li>Anything you'd tell a new team member</li>
              </ul>
            </div>
          </div>
        )}

        {/* Languages */}
        {activeTab === 'languages' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Language Support</div>
            <p style={{ marginBottom: '8px', opacity: 0.7, fontSize: '12px' }}>
              Ava supports <strong>20 languages</strong> for both the UI and model responses:
            </p>
            <div style={s.card}>
              <div style={s.cardText}>
                English, Chinese (Simplified &amp; Traditional), Japanese, Korean, Spanish, Portuguese, French, German, Russian, Arabic, Hindi, Vietnamese, Thai, Turkish, Italian, Polish, Ukrainian, Dutch, Indonesian
              </div>
            </div>
          </div>
        )}

        {/* Shortcuts */}
        {activeTab === 'shortcuts' && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Keyboard Shortcuts</div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Shortcut</th>
                  <th style={s.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {SHORTCUTS.map((sc, i) => (
                  <tr key={i}>
                    <td style={s.td}>{sc.keys}</td>
                    <td style={s.tdMuted}>{sc.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '16px 0', borderTop: '1px solid var(--theia-panel-border)' }}>
          <p style={s.muted}>Ava | Supernova v0.4.13 — Apache License 2.0</p>
          <p style={{ ...s.muted, marginTop: '2px' }}>Built with purpose. Agentic coding for everyone.</p>
        </div>
      </div>
    </div>
  );
};

// -- Static data --------------------------------------------------------------

const MODELS = [
  { provider: 'Anthropic', model: 'Claude Opus 4.6', highlights: 'Most capable, vision, 200K context', cost: '$15.00 / $75.00' },
  { provider: 'Anthropic', model: 'Claude Sonnet 4.6', highlights: 'Best balance of speed and capability', cost: '$3.00 / $15.00' },
  { provider: 'Anthropic', model: 'Claude Haiku 4.5', highlights: 'Fast and affordable, vision', cost: '$0.80 / $4.00' },
  { provider: 'DeepSeek', model: 'DeepSeek V3', highlights: 'Best price/performance', cost: '$0.14 / $0.28' },
  { provider: 'DeepSeek', model: 'DeepSeek R1', highlights: 'Extended thinking, reasoning', cost: '$0.14 / $2.19' },
  { provider: 'Moonshot AI', model: 'Kimi K2.5', highlights: 'Best multi-step tool calling', cost: '$0.60 / $2.00' },
  { provider: 'Moonshot AI', model: 'Moonshot V1 128K', highlights: 'Long context', cost: '$2.00 / $5.00' },
  { provider: 'Zhipu AI', model: 'GLM-5', highlights: 'Best tool-call reliability, vision', cost: '$0.70 / $0.70' },
  { provider: 'Zhipu AI', model: 'GLM-4.7', highlights: 'Fast, affordable coding', cost: '$0.25 / $0.25' },
  { provider: 'Zhipu AI', model: 'GLM-4 Flash', highlights: 'Free tier available', cost: 'Free' },
  { provider: 'Alibaba', model: 'Qwen 3.5 Plus', highlights: 'Vision, thinking, 256K context', cost: '$0.40 / $1.20' },
  { provider: 'Alibaba', model: 'Qwen Turbo', highlights: 'Fast, up to 1M context', cost: '$0.05 / $0.20' },
  { provider: 'Mistral AI', model: 'Mistral Large 3', highlights: 'Flagship general-purpose', cost: '$2.00 / $6.00' },
  { provider: 'Mistral AI', model: 'Codestral', highlights: 'Code-focused, 256K context', cost: '$0.30 / $0.90' },
  { provider: 'Mistral AI', model: 'Devstral 2', highlights: 'Agentic coding specialist', cost: '$0.10 / $0.30' },
];

type Risk = 'safe' | 'write' | 'dangerous';

const TOOL_GROUPS = [
  {
    title: 'Reading & Searching',
    tools: [
      { name: 'file_read', desc: 'Read files with line numbers. Supports offset and limit for large files.', risk: 'safe' as Risk },
      { name: 'glob', desc: 'Find files matching glob patterns (e.g. **/*.ts).', risk: 'safe' as Risk },
      { name: 'grep', desc: 'Search file contents with regex. Filter by file pattern.', risk: 'safe' as Risk },
      { name: 'list_directory', desc: 'List directory contents with file sizes and types.', risk: 'safe' as Risk },
      { name: 'git_status', desc: 'Read-only git commands (status, diff, log, branch, show).', risk: 'safe' as Risk },
      { name: 'git_diff', desc: 'View detailed diffs between commits, branches, or working tree.', risk: 'safe' as Risk },
      { name: 'project_index', desc: 'Index the project structure for intelligent code navigation.', risk: 'safe' as Risk },
      { name: 'find_symbol', desc: 'Find symbols (functions, classes, variables) across the codebase.', risk: 'safe' as Risk },
    ],
  },
  {
    title: 'Writing & Editing',
    tools: [
      { name: 'file_write', desc: 'Create or overwrite files. Auto-creates parent directories.', risk: 'write' as Risk },
      { name: 'file_edit', desc: 'Exact string replacement. Supports single or global replace.', risk: 'write' as Risk },
      { name: 'bash', desc: 'Execute shell commands with configurable timeout.', risk: 'dangerous' as Risk },
      { name: 'rollback', desc: 'Undo file changes made during the current session.', risk: 'write' as Risk },
    ],
  },
  {
    title: 'Research & Browser',
    tools: [
      { name: 'web_search', desc: 'Search the web via DuckDuckGo. No API key required.', risk: 'safe' as Risk },
      { name: 'http_request', desc: 'Make HTTP requests (GET, POST, PUT, DELETE).', risk: 'write' as Risk },
      { name: 'browser', desc: 'Open and interact with web pages using a headless browser.', risk: 'write' as Risk },
      { name: 'screenshot', desc: 'Capture screenshots of the current screen or a URL.', risk: 'safe' as Risk },
      { name: 'database_query', desc: 'Run read-only SQL queries against configured databases.', risk: 'safe' as Risk },
      { name: 'docs_lookup', desc: 'Search Ava\'s own documentation to help with features, setup, and troubleshooting.', risk: 'safe' as Risk },
    ],
  },
  {
    title: 'Memory',
    tools: [
      { name: 'memory_save', desc: 'Save knowledge to persistent memory (global or project scope).', risk: 'write' as Risk },
      { name: 'memory_recall', desc: 'Search memories by keyword. Finds relevant stored knowledge.', risk: 'safe' as Risk },
    ],
  },
  {
    title: 'Support',
    tools: [
      { name: 'support_request', desc: 'Submit a support ticket to the Ava team. Requires email, subject, and message.', risk: 'write' as Risk },
    ],
  },
  {
    title: 'Collaboration',
    tools: [
      { name: 'present_plan', desc: 'Present a structured plan for your approval.', risk: 'safe' as Risk },
      { name: 'todo_write', desc: 'Track task progress with a structured to-do list.', risk: 'safe' as Risk },
      { name: 'ask_user', desc: 'Ask you a question mid-task and wait for a response.', risk: 'safe' as Risk },
    ],
  },
];

const MODES = [
  { name: 'Code Mode', desc: 'Full agent with all 24 tools. Reads, writes, searches, and executes across your codebase.' },
  { name: 'Plan Mode', desc: 'Read-only analysis. Reads your code and creates plans without modifying anything.' },
  { name: 'Chat Mode', desc: 'Conversation only. No tools, just discussion about code, architecture, or ideas.' },
  { name: 'Security Mode', desc: 'AI-powered OWASP-aligned security audit. Scans your project for vulnerabilities.' },
];

const SETTINGS = [
  { name: 'Active Model', desc: 'The model Ava uses for responses', def: '(none)' },
  { name: 'Temperature', desc: 'Sampling temperature (0\u20132)', def: '0.7' },
  { name: 'Language', desc: 'UI and response language', def: 'Auto-detect' },
  { name: 'Permission Mode', desc: 'Tool approval behaviour', def: 'Strict' },
  { name: 'Max Tokens', desc: 'Maximum output tokens per response', def: '8192' },
  { name: 'Auto Memory', desc: 'Enable/disable automatic memory persistence', def: 'Enabled' },
  { name: 'Stream Responses', desc: 'Enable/disable streaming output', def: 'Enabled' },
];

const COMMANDS_GENERAL = [
  { cmd: '/help', desc: 'Show available commands and usage information' },
  { cmd: '/model', desc: 'Switch the active model' },
  { cmd: '/clear', desc: 'Clear the current conversation' },
  { cmd: '/provider', desc: 'Manage API providers and keys' },
  { cmd: '/permission', desc: 'Change the permission mode (strict, balanced, autonomous)' },
  { cmd: '/tools', desc: 'List all available tools and their status' },
  { cmd: '/retry', desc: 'Retry the last failed request' },
  { cmd: '/init', desc: 'Create a .ava/instructions.md project context file' },
  { cmd: '/exit', desc: 'Exit the CLI session' },
];

const COMMANDS_HISTORY = [
  { cmd: '/history', desc: 'Browse past conversation sessions' },
  { cmd: '/resume', desc: 'Resume a previous conversation' },
  { cmd: '/search', desc: 'Search across conversation history' },
  { cmd: '/delete', desc: 'Delete a conversation from history' },
  { cmd: '/rename', desc: 'Rename a conversation session' },
  { cmd: '/pin', desc: 'Pin a conversation for quick access' },
  { cmd: '/unpin', desc: 'Unpin a conversation' },
  { cmd: '/export', desc: 'Export a conversation to Markdown or JSON' },
];

const SHORTCUTS = [
  { keys: 'Ctrl+Shift+A', action: 'Open Ava Chat' },
  { keys: 'Ctrl+Shift+D', action: 'Open Dashboard' },
  { keys: 'Ctrl+Shift+H', action: 'Session History' },
  { keys: 'Ctrl+Shift+N', action: 'New Chat' },
  { keys: 'Enter', action: 'Send message' },
  { keys: 'Shift+Enter', action: 'New line in message' },
];
