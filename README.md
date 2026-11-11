# Ava Supernova IDE

**The standalone AI-native development environment — Ava with her own home, and her own hands.**

A desktop application built with **Tauri v2** (Rust), **React 19**, and a **Node.js engine** running `@ava/core` locally. The full agent — 100+ tools, 7 modes, 24 specialist personas, 5-layer memory — with no browser and no VS Code required. And because it owns its whole stack, the IDE does the one thing the extension can't: **drive your entire machine.**

> **Coming Q4 2026.** Free and open source. Your keys. Your machine. Your work.
>
> **Local-only.** The engine runs on your machine and your data stays there. Nothing is synced to a cloud.

---

## What it is

- **A real IDE** — activity bar, file explorer, workspace search, git panel, editor area, terminal, and a bottom panel (Terminal · Ava CLI · Problems · Output · Debug Console).
- **Ava, native** — not a sidebar bolted onto someone else's editor. The agent is the centre of gravity.
- **Runs on your machine** — a Node.js engine runs `@ava/core` locally with the full toolkit, personas, and memory, on your own provider keys or a local model. No account, no sign-in — free and open source.
- **Shares everything with the extension** — keys live in the operating system's keychain and everything about you (profile, personality, settings) in `~/.ava`, so the IDE and the VS Code extension know the same you. Enter a key once; both have it.
- **Owns desktop automation** — the standout capability that only a native app can offer (below).

---

## Desktop automation — Ava's hands

The IDE can operate your computer, not just your codebase. It's **opt-in, permissioned, and gated to Desktop mode** — Ava can't touch it from any other mode.

- **Native control (no screenshots needed)** — reads the OS accessibility tree (Windows UIA) and acts through it: list windows and elements, focus a window, click an element by name, type, press keys, launch apps.
- **Browser control** — drives a real Chromium window via Playwright: navigate, snapshot the DOM, click, type.
- **A real permission model** — choose the access level (view-only → navigate → full) and how often Ava confirms (every action / first per app / per session). Dangerous actions can be blocked outright, with step caps and inactivity timeouts.

Built on Rust (`enigo` for input, `uiautomation` for the UIA tree) behind Tauri's invoke bridge — so the automation is native and fast, and the agent never has to guess at pixels.

---

## Workspace

Ten focused areas in the sidebar, each with its own sub-pages:

| Area | What's inside |
|---|---|
| **Command Centre** | Your daily overview — weather, news, tasks, journal, learning, memory, session stats, latest release |
| **Chat** | Talk, build, create — the full agent, all 7 modes, fleet + model pickers |
| **Planner** | Tasks, journal, learning |
| **Library** | Courses, generated assets, documents — with folders, packs planned with Ava, and downloads ready for your game engine or a store |
| **Health & Nutrition** | Exercise and recipe catalogues, ready-made plans you place session by session, your plan calendar and past plans, your profile, and Ava herself |
| **Creative Studio** | Logos, icons, images, video and voiceovers, plus 2D work made in GIMP and 3D models built in Blender on your machine (brief first, every step saved), and brand kits linked to your projects — images, video and voice on your own Qwen key; logos, icons, GIMP, Blender and background removal on your machine, free |
| **Memory** | Patterns, preferences, decisions |
| **History** | Tokens, sessions, models |
| **Settings** | Keys, preferences, personalisation |
| **Help** | Support, releases, roadmap |

---

## The agent

Same engine as the CLI and the VS Code extension — so everything you learn in one surface carries to the others.

- **7 modes** — Code (`>>`), Plan (`::`), Chat (`..`), Teach (`??`), Security (`!!`), Brainstorm (`**`), Write (`<<`).
- **24 specialist personas** — complex tasks activate an internal team (Scout → Architect → Verifier → Sequencer → Challenger → Builder for code); simple tasks go direct.
- **Three fleets** — **Maestro** (Qwen — Qwen 3.8 Flash coordinates, Qwen 3.7 Plus builds; needs a Qwen key), **Supernova** (DeepSeek V4.1 Flash coordinates and builds, Qwen 3.8 Flash handles images; needs DeepSeek + Qwen keys) and **Aurora** (every model from Mistral, a European lab — Large 4 coordinates and builds, Small 4 handles chat; needs a Mistral key). Or pick any single model your keys reach.
- **100+ tools**, including the IDE-only desktop- and browser-automation tools described above.
- **Knowledge packs** — toggle domain expertise on/off in the chat bar; the system prompt rebuilds live, no restart.
- **20 languages, live** — the whole interface translates, not just the chat, and switches the moment you change language — no restart, and Ava's replies follow too. Pick your language right from the welcome flow. Dates format the way your language writes them.
- **5-layer memory** — local-first, curated by a dedicated Memory Agent so context stays lean.
- **Honesty gate** — completion/state claims are checked against the verifying tools run that turn; an unbacked claim is flagged rather than stated as fact. Always on, no off-switch.
- **Help when you need it** — our [Discord](https://discord.gg/bbtnKMW4rf) for questions, bugs and ideas, or email [support@avasupernova.com](mailto:support@avasupernova.com).

---

## Architecture

```
Tauri v2 (Rust)
├── React 19 + Vite 7 (frontend)
│   ├── App.tsx            — layout, routing, state
│   ├── components/        — Sidebar, EditorArea, ActivityBar, BottomPanel, StatusBar, TitleBar …
│   └── lib/
│       ├── api.ts         — local usage counters
│       └── sidecar.ts     — Node.js engine manager (NDJSON protocol)
├── sidecar/               — @ava/core agent runner
└── src-tauri/             — Rust backend (windowing, shell, desktop automation via enigo + uiautomation)
```

## Development

```bash
# From the monorepo root
pnpm install
pnpm --filter @ava/core run build

# Start the IDE in dev mode
cd packages/ide
pnpm tauri dev
```

**Requires:**
- **Rust toolchain** (rustup)
- **Node.js** 20+
- **pnpm** 10+

## Tech stack

- **Tauri v2** — Rust backend, native WebView frontend
- **React 19** + **Vite 7** — UI and dev server
- **@ava/core** — the agent engine (tools, personas, memory, providers)
- **Catppuccin Mocha** — dark theme palette

---

## Links

- [Website](https://avasupernova.com)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova)
- [GitHub](https://github.com/AugmentedValueAcceleration/ava-supernova)
- [Release Notes](https://avasupernova.com/releases)
- [Support Ava](https://avasupernova.com/support-ava) — Ava is free and kept that way by donations

## License

[Apache License 2.0](https://github.com/AugmentedValueAcceleration/ava-supernova/blob/production/LICENSE) — Copyright 2026 Augmented Value Acceleration
