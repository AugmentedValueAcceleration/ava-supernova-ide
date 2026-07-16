# Ava Supernova IDE

**The standalone AI-native development environment — Ava with her own home, and her own hands.**

A desktop application built with **Tauri v2** (Rust), **React 19**, and a **Node.js engine** running `@ava/core` locally. The full agent — 60+ tools, 7 modes, 24 specialist personas, 5-layer memory — with no browser and no VS Code required. And because it owns its whole stack, the IDE does the one thing the extension can't: **drive your entire machine.**

> **Local-first by default.** The engine runs on your machine; your data stays there unless you turn on cloud sync.

---

## What it is

- **A real IDE** — activity bar, file explorer, workspace search, git panel, editor area, terminal, and a bottom panel (Terminal · Ava CLI · Problems · Output · Debug Console).
- **Ava, native** — not a sidebar bolted onto someone else's editor. The agent is the centre of gravity.
- **Local or Cloud** — toggle from the chat header:
  - **Local mode** — a Node.js engine runs `@ava/core` on your machine with the full toolkit, personas, and memory.
  - **Cloud mode** — the platform API with managed credits and usage tracking.
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
| **Library** | Courses, generated assets, documents |
| **Health & Nutrition** | Exercises, recipes, and plans |
| **Creative Studio** | Images and video |
| **Memory** | Patterns, preferences, decisions |
| **History** | Credits, sessions, models |
| **Account** | Settings, billing, personalisation |
| **Help** | Support, releases, roadmap |

---

## The agent

Same engine as the CLI and the VS Code extension — so everything you learn in one surface carries to the others.

- **7 modes** — Code (`>>`), Plan (`::`), Chat (`..`), Teach (`??`), Security (`!!`), Brainstorm (`**`), Write (`<<`).
- **24 specialist personas** — complex tasks activate an internal team (Scout → Architect → Verifier → Sequencer → Challenger → Builder for code); simple tasks go direct.
- **Three fleets** — **Maestro** (Qwen ensemble, ships) and **Aurora** (EU-sovereign Mistral stack, ships) are live; **Supernova** (polyglot — DeepSeek V4 Pro coordinator + Qwen builders) runs on your own DeepSeek + Qwen keys, with the managed version in preview.
- **60+ tools**, plus the IDE-only desktop- and browser-automation tools described above.
- **Knowledge packs** — toggle domain expertise on/off in the chat bar; the system prompt rebuilds live, no restart.
- **20 languages, live** — the whole interface translates, not just the chat, and switches the moment you change language — no restart, and Ava's replies follow too. Pick your language right from the welcome flow. Dates format the way your language writes them.
- **5-layer memory** — local-first, curated by a dedicated Memory Agent so context stays lean.
- **Honesty gate** — completion/state claims are checked against the verifying tools run that turn; an unbacked claim is flagged rather than stated as fact. Always on, no off-switch.
- **Tick Engine** — background awareness every couple of minutes; surfaces tasks, token balance, and support messages only when they matter.
- **Live chat support** — Ava first-line triage, no tickets or forms.

---

## Architecture

```
Tauri v2 (Rust)
├── React 19 + Vite 7 (frontend)
│   ├── App.tsx            — layout, routing, state
│   ├── components/        — Sidebar, EditorArea, ActivityBar, BottomPanel, StatusBar, TitleBar …
│   └── lib/
│       ├── api.ts         — platform API + session stats
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
- **Supabase** — cloud database, auth, storage (for Cloud mode + opt-in sync)
- **Catppuccin Mocha** — dark theme palette

---

## Links

- [Website](https://ava-supernova.com)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=augmentedvalueacceleration.ava-supernova)
- [Companion App](https://companion.ava-supernova.com)
- [GitHub](https://github.com/AugmentedValueAcceleration/ava-supernova)
- [Release Notes](https://ava-supernova.com/releases)

## License

[Apache License 2.0](https://github.com/AugmentedValueAcceleration/ava-supernova/blob/production/LICENSE) — Copyright 2026 Augmented Value Acceleration
