# Ava | Supernova IDE

The standalone AI-native development environment. Built with Tauri v2, React 19, and a Node.js sidecar running `@ava/core` locally. Full 54-tool access, all 6 modes, 24 specialist personas — no VS Code required.

## Features

### Chat with Full AI Power
- **Local mode** — Node.js sidecar runs @ava/core with all 60 tools, 6 modes, 24 personas, 5-layer memory
- **Cloud mode** — Platform API with managed tokens, usage tracking, billing
- **Toggle freely** — switch between Local and Cloud from the chat header
- **Model picker** — Qwen 3.6 Plus, MiniMax M2.7, DeepSeek, Kimi, Zhipu, Mistral + BYOK
- **Auto Mode** — routes every task to the best model automatically
- **Mode selector** — Work (>>), Plan (::), Chat (..), Teach (??), Security (!!), Brainstorm (**)

### Collapsible Tasks Panel
- **Ava tab** — live session tasks from `todo_write` with progress bar, auto-opens when Ava creates tasks
- **My Tasks tab** — personal daily tasks from the platform API with toggle completion
- **Resizable** — drag the left edge (200-500px)
- **Inline TodoCard** — checklist renders inside chat messages

### 16 Dashboard Pages
Command Centre, Ava Chat, Memory, Tasks, Journal, Learning, Library, Personality, Cloud Sync, Usage, Billing, Settings, Connections, Support, Documentation, Release Notes

### Command Centre
Weather, statistics, latest news (10 categories), today's tasks, journal preview, learning progress, memory count, latest release — all in one view.

### Media in Chat
- Inline images from tool results (generate_image, screenshot, remove_background)
- File cards for created documents (.docx, .xlsx, .pptx, .pdf)
- Paste, drag-drop, and attach images
- Custom avatars for user and AI (synced to Supabase)

### Platform-Tagged Release Notes
Colour-coded tabs — Core (blue), Extension (purple), IDE (green), Companion (orange). Shows ecosystem velocity at a glance.

### Token Usage Bar
Visual token balance below the chat header — depletes in real-time as tokens are used. Colour-coded thresholds (purple → yellow → red).

### Live Chat Support
Chat-based support with Ava first-line triage. Conversation list, message history, 10-second polling. No tickets, no forms — just ask.

### Tick Engine
Background awareness every 2 minutes — checks token balance, support messages, and surfaces findings only when they matter.

### Session Stats
Live token usage, messages, tool calls, and model breakdown — synced across Usage, Command Centre, and chat header in real-time.

### Sidebar
Organised into sections (Workspace, Personalise, Account, Help) with collapsible groups, active page highlight, and persistent state.

### Bottom Panel
Terminal, Ava CLI, Problems, Output, Debug Console — resizable with tab switching.

## Architecture

```
Tauri v2 (Rust)
├── React 19 + Vite (frontend)
│   ├── App.tsx — layout, routing, state
│   ├── components/
│   │   ├── DashboardPages.tsx — all 16 pages
│   │   ├── IdeTasksPanel.tsx — collapsible task sidebar
│   │   ├── Sidebar.tsx — sectioned navigation
│   │   ├── EditorArea.tsx — tab bar + page renderer
│   │   ├── BottomPanel.tsx — terminal + Ava CLI
│   │   ├── ActivityBar.tsx — icon sidebar
│   │   ├── StatusBar.tsx — mode badge + info
│   │   └── TitleBar.tsx — custom window controls
│   └── lib/
│       ├── api.ts — platform API + session stats
│       └── sidecar.ts — Node.js sidecar manager
├── sidecar/
│   └── index.mjs — @ava/core agent runner (NDJSON protocol)
└── src-tauri/
    ├── src/main.rs — Tauri entry point
    └── tauri.conf.json — window config, shell plugin
```

## Development

```bash
# From monorepo root
pnpm install
pnpm --filter @ava/core run build

# Start IDE dev mode
cd packages/ide
pnpm tauri dev
```

Requires:
- **Rust toolchain** (rustup)
- **Node.js** 20+ (for sidecar)
- **pnpm** 10+

## Tech Stack

- **Tauri v2** — Rust backend, WebView2 frontend
- **React 19** — UI framework
- **Vite 7** — Dev server + HMR
- **@ava/core** — Agent engine (tools, personas, memory, providers)
- **Supabase** — Cloud database, auth, storage
- **Catppuccin Mocha** — Dark theme colour palette

## Links

- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=ava-supernova.ava-supernova)
- [Companion App](https://www.ava-supernova-companion.com)
- [Web Platform](https://ava-supernova.com)
- [GitHub](https://github.com/AugmentedValueAcceleration)

## License

Apache-2.0
