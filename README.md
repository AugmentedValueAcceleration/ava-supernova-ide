# Ava | Supernova IDE

Standalone AI coding IDE built on [Eclipse Theia](https://theia-ide.org/) with Ava deeply integrated. Full agentic coding in a dedicated desktop application — with **two free models that work instantly, no API key required**.

> Download the latest release from [GitHub Releases](https://github.com/AugmentedValueAcceleration/ava-supernova-ide/releases) or from [ava-supernova.com](https://ava-supernova.com).

## Features

- **Full Ava agent** — 45 tools, 15 models, 7 providers, smart memory v2, security scanning
- **Smart memory v2** — Structured entries, TF-IDF retrieval, branch scoping, auto-archival, credential blocking
- **Mid-task interjection** — Type while Ava is working to add context, corrections, or redirect — true collaborative flow
- **2 free models** — GLM-4.7 Flash and GLM-4.5 Flash work instantly with zero setup
- **VS Code extension compatibility** — Install extensions from Open VSX
- **Monaco editor** — Same editor engine as VS Code
- **Built-in terminal, file tree, Git, settings, keybindings**
- **`@ava/core` runs natively** — No sidecar process, direct Node.js backend integration
- **Privacy first** — API keys in OS keychain, conversations stored locally, no telemetry

## Architecture

```
packages/ide/
├── electron-app/          # Desktop application (Electron + Theia)
├── browser-app/           # Web application (Theia in browser)
└── extensions/
    ├── ava-agent/         # @ava/core integration, agent panel, tool approvals
    └── ava-branding/      # Custom theme, branding, UI overrides
```

## Prerequisites

- Node.js >= 20
- Yarn 1.x (`npm install -g yarn`)
- **Windows only:** Python 3.12+, VS Build Tools 2022

## Setup

```bash
yarn install
yarn build
```

### Windows Native Module Fix

Native modules (node-pty) need toolset patching on Windows:

```bash
node scripts/fix-native-builds.js
node ../node_modules/@theia/cli/bin/theia build --mode production
```

## Run

```bash
# Desktop
yarn start

# Browser
yarn start:browser
```

## Package (Desktop Installer)

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false yarn package:win
```

The installer is output to `electron-app/dist/`.

## Core Bundle

The IDE loads `@ava/core` from `electron-app/resources/ava-core.mjs`. After any core changes, rebuild:

```bash
npx esbuild packages/core/src/index.ts --bundle --format=esm --platform=node \
  --outfile=packages/ide/electron-app/resources/ava-core.mjs \
  --external:playwright --external:playwright-core --external:better-sqlite3 \
  --external:pg --external:mysql2 --external:screenshot-desktop
```

## Why Theia?

- Full VS Code extension compatibility via Open VSX
- Monaco editor — same editing experience as VS Code
- Apache 2.0 licensed — fully open, no vendor lock-in
- Native Electron integration — `@ava/core` runs directly in the backend
- Extensible architecture — custom extensions for agent panel, branding, tools

## License

[Apache License 2.0](../../LICENSE) — Copyright 2025-2026 Augmented Value Acceleration
