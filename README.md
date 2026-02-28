# Ava | Supernova IDE

Agent-first development environment built on [Eclipse Theia](https://theia-ide.org/).

## Architecture

- **electron-app** — Desktop application (Electron + Theia)
- **browser-app** — Web application (Theia in browser)
- **extensions/ava-agent** — @ava/core integration, agent panel, tool approvals
- **extensions/ava-branding** — Custom theme, branding, UI overrides

## Prerequisites

- Node.js >= 20
- Yarn 1.x (`npm install -g yarn`)

## Setup

```bash
yarn install
yarn build
```

## Run (Desktop)

```bash
yarn start
```

## Run (Browser)

```bash
yarn start:browser
```

## Why Theia?

- Full VS Code extension compatibility via Open VSX
- Monaco editor (same engine as VS Code)
- Built-in terminal, file tree, Git, settings, keybindings
- Apache 2.0 licensed — fully open, no vendor lock-in
- @ava/core runs directly in the Node.js backend — no sidecar needed

## License

Apache 2.0
