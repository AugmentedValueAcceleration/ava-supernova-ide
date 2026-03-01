# Ava | Supernova IDE — Roadmap

> Goal: The best open-source AI-powered IDE that's equally great without AI.
> Design principle: Handle everything we can for the user. No setup headaches,
> no config files to edit, no terminal commands needed. Works out of the box
> for beginners and power users alike.

---

## Phase 1 — Solid Foundation (IDE works great without AI)

These make Ava a real IDE, not just a text editor. A user who never touches the
AI panel should still prefer this over downloading VS Code from scratch.

### 1.1 Bundle Essential Language Support
**Why first:** Without this, there's no autocomplete, no hover docs, no
go-to-definition. It's the single biggest gap.

- [x] Create `plugins/` directory with pre-bundled VS Code extensions
- [x] TypeScript/JavaScript language server (built-in via vscode.typescript-language-features)
- [x] Python (ms-python from Open VSX)
- [x] HTML/CSS/JSON language support
- [x] Markdown preview
- [ ] Auto-detect project type on open and suggest missing language extensions *(deferred to Phase 3.1)*
- [ ] Show a non-intrusive banner: "Python project detected — install Python support?" *(deferred to Phase 3.1)*

### 1.2 First-Launch Onboarding Wizard
**Why second:** New users need a guided setup, not a blank screen.

- [x] Full-screen welcome flow on very first launch (not the welcome tab)
- [x] Step 1: Pick theme (Light / Dark / System)
- [x] Step 2: Pick font size (Small / Medium / Large — preview live)
- [x] Step 3: Connect an AI provider key (or skip — "I'll set this up later")
- [x] Step 4: Open a folder or clone a repo
- [x] Save a flag so it only shows once (`~/.ava-ide/onboarding-complete`)
- [x] Keep it under 4 steps — respect the user's time

### 1.3 Sane Default Settings
**Why:** Users shouldn't have to hunt through settings to get a good experience.

- [x] Font: `'Cascadia Code', 'Fira Code', 'Consolas', monospace'` with ligatures on
- [x] Font size: 14px
- [x] Tab size: 2 (web) / 4 (python) — auto-detect from `.editorconfig` or project type
- [x] Word wrap: on
- [x] Minimap: off (clean look, users can enable)
- [x] Bracket pair colorization: on
- [x] Auto-save: after 1 second delay
- [x] Format on save: on (if formatter available)
- [x] Smooth scrolling: on
- [x] Cursor blinking: smooth
- [x] Line numbers: on
- [x] Indent guides: on
- [x] Breadcrumbs: on
- [x] Git decorations in file tree: on

### 1.4 Keyboard Shortcuts
**Why:** Power users expect shortcuts. New users discover features through them.

- [x] `Ctrl+Shift+A` — Toggle Ava chat panel
- [x] `Ctrl+Shift+D` — Toggle Dashboard / settings
- [x] `Ctrl+Shift+P` — Command palette (already built-in, verify it works)
- [x] `Ctrl+\`` — Toggle terminal (already built-in, verify)
- [x] `Ctrl+B` — Toggle sidebar (already built-in, verify)
- [x] `Ctrl+Shift+N` — New Ava chat
- [x] Register all Ava commands in command palette with clear names
- [x] Show keyboard shortcut hints in tooltips

### 1.5 Theme System
**Why:** People care deeply about how their editor looks. Ugly = abandoned.

- [x] Ship 2 polished built-in themes: Ava Dark (default) and Ava Light
- [x] Ava Dark: deep charcoal background, indigo accents, easy on the eyes
- [x] Ava Light: clean white/grey, same indigo accents
- [x] Theme picker accessible from welcome page + status bar + command palette
- [x] Open VSX marketplace available for community themes
- [x] Ensure all Ava UI (chat, dashboard, welcome) respects theme colors

---

## Phase 2 — AI Integration Polish (AI features feel native)

The agent works. Now make it feel like it's part of the editor, not bolted on.

### 2.1 Editor Context Menu — "Ask Ava"
**Why first in Phase 2:** This is how most users will discover AI features.

- [x] Right-click selected code → "Ask Ava" submenu:
  - "Explain this code"
  - "Find bugs in selection"
  - "Refactor this"
  - "Write tests for this"
  - "Add comments"
- [x] Sends selected code + file context to Ava chat in the right mode
- [x] Works with no selection too (sends current file)
- [x] Keyboard shortcut: `Ctrl+Shift+I` — Quick ask with selection

### 2.2 Status Bar Integration
**Why:** Users need at-a-glance info without opening panels.

- [x] Left side: Active AI model name (click to switch)
- [x] Left side: Connection status indicator (green dot / red dot / grey when AI off)
- [x] Right side: Token usage for current session (click to see breakdown)
- [x] Right side: Current mode badge (Code / Plan / Chat / Security)
- [x] All items clickable — open relevant panel or picker

### 2.3 Live Editor Integration
**Why:** When Ava edits files, users need to see it happen, not just trust it.

- [x] When `file_write` / `file_edit` tool runs → open the file in editor
- [x] Show inline diff decorations (green = added, red = removed)
- [x] "Accept" / "Reject" commands for each file's changes
- [x] Accept All / Reject All commands (via command palette)
- [x] Undo all Ava changes with one command: "Ava: Undo Last Changes"
- [x] File tree badge showing which files Ava modified (indigo "A" badge)

### 2.4 Terminal Integration
**Why:** When Ava runs shell commands, users should see it transparently.

- [x] `bash` tool output appears in a dedicated "Ava Terminal" tab
- [x] Visually distinct from user's terminal (subtle indigo border or header)
- [x] User can see commands running in real-time (streaming via tool_call_partial events)
- [x] Option to run Ava's commands in user's existing terminal instead

### 2.5 Inline Completions (Tab-to-Accept)
**Why:** This is the #1 feature that makes AI IDEs sticky. Non-negotiable.

- [x] As user types, request completions from active AI provider
- [x] Show ghost text (greyed out) ahead of cursor
- [x] `Tab` to accept, `Esc` to dismiss
- [x] Debounce requests (300ms after last keystroke)
- [x] Cache recent completions to reduce API calls
- [x] Respect user setting: can be turned off entirely
- [ ] Works with any provider that supports completion/FIM endpoints *(deferred to Phase 4.1 — only DeepSeek has FIM today)*

---

## Phase 3 — Smart Features (IDE understands your project)

### 3.1 Project Detection & Auto-Configuration
**Why:** Users shouldn't have to configure anything per-project.

- [x] Detect project type on folder open:
  - `package.json` → Node.js/TypeScript
  - `requirements.txt` / `pyproject.toml` → Python
  - `go.mod` → Go
  - `Cargo.toml` → Rust
  - `pom.xml` / `build.gradle` → Java
  - `.sln` / `.csproj` → C#/.NET
- [x] Auto-suggest relevant extensions from Open VSX
- [x] Auto-configure formatter (Prettier for JS/TS, Black for Python, etc.)
- [x] Auto-detect and respect `.editorconfig`
- [x] Set appropriate tab size, line endings, file associations

### 3.2 Smart File Context for Ava
**Why:** Ava gives better answers when it knows what you're working on.

- [x] Automatically include current file in Ava context
- [x] Include open editor tabs as additional context
- [x] Respect `.ava/instructions.md` for project-specific AI instructions
- [x] Show "Context" indicator in chat — user sees what Ava can see
- [x] Let user pin/unpin files from Ava's context
- [ ] Workspace indexing for codebase-wide questions (async, non-blocking) *(deferred to Phase 4 — requires significant async indexing infrastructure)*

### 3.3 Problems Panel Integration
**Why:** When Ava finds issues, show them where developers expect.

- [x] Ava's code review findings appear in Problems panel (Ctrl+Shift+M)
- [x] Click a problem → jumps to the line in editor
- [x] Quick fix action: "Fix with Ava" on any problem
- [x] Diagnostics from language servers and Ava coexist cleanly (separate owner: 'ava-agent')

### 3.4 Git-Aware AI
**Why:** Most coding happens in the context of version control.

- [x] "Ava: Write Commit Message" — analyzes staged changes, writes message
- [x] "Ava: Explain This Diff" — explains working directory changes
- [x] "Ava: Review My Changes" — security + code review before push
- [x] PR description generation (branch, log, diff → PR description)
- [x] Merge conflict assistance — "Ava: Resolve Conflict" (detects `<<<<<<<` markers)

---

## Phase 4 — Power User Features

### 4.1 Multi-Provider Management
**Why:** Users want to use different models for different tasks.

- [ ] Per-task model routing: fast model for completions, strong model for refactoring
- [ ] Cost estimate before running expensive operations
- [ ] Usage dashboard: tokens spent per provider, per day, per project
- [ ] Automatic fallback: if primary provider is down, try secondary
- [ ] Provider health indicator in status bar

### 4.2 Workspace Templates
**Why:** Getting started with a new project should be one click.

- [ ] "New Project" wizard in welcome page
- [ ] Templates: React, Next.js, Python Flask, Python FastAPI, Node.js API, Rust CLI
- [ ] Each template includes: project files, recommended extensions, `.ava/instructions.md`
- [ ] "Ava: Scaffold a project" — describe what you want, Ava creates the structure
- [ ] Template marketplace (community-contributed, future)

### 4.3 Snippets & Code Actions
**Why:** Reduce repetitive typing for common patterns.

- [ ] Ship language-aware snippets (React components, Python classes, etc.)
- [ ] "Ava: Generate Snippet" — describe a pattern, save as reusable snippet
- [ ] Code actions (lightbulb menu) include Ava suggestions alongside LSP suggestions
- [ ] Quick fixes powered by AI when language server has no suggestion

### 4.4 Collaboration Features (Future)
**Why:** Real-world development is collaborative.

- [ ] Share Ava conversation as a link (for team debugging)
- [ ] Export chat to Markdown
- [ ] Session replay — review what Ava did step by step
- [ ] Multi-cursor collaboration (LiveShare-style, long-term goal)

---

## Phase 5 — Platform & Ecosystem

### 5.1 Extension Recommendations Engine
**Why:** Help users discover tools they didn't know they needed.

- [ ] Curated "Ava Picks" section in extension marketplace
- [ ] Project-aware recommendations (detect framework, suggest extensions)
- [ ] "Popular with Ava users" category
- [ ] One-click extension pack installs (e.g., "Web Development Pack")

### 5.2 Settings Sync
**Why:** Users work on multiple machines.

- [ ] Sync settings, keybindings, extensions, themes across machines
- [ ] Tied to Ava platform account (optional)
- [ ] Selective sync — choose what to sync
- [ ] Import/export settings as JSON file (offline option)

### 5.3 Browser Version
**Why:** Not everyone can install desktop apps (Chromebooks, tablets, work machines).

- [ ] `browser-app` already exists in the codebase — needs polish
- [ ] Same features as desktop (minus native file system — use virtual FS)
- [ ] Hosted version on ava-supernova.com (future)
- [ ] PWA support for offline-capable browser IDE

### 5.4 Plugin / Tool Marketplace
**Why:** Community-driven ecosystem is what makes platforms last.

- [ ] Custom Ava tools published by community (npm packages)
- [ ] Tool browser inside Dashboard panel
- [ ] Verified / community badges
- [ ] Tool permissions system (what can a community tool access?)

---

## Cross-Cutting Concerns (Apply Throughout)

### Accessibility
- [ ] Full keyboard navigation — every feature reachable without mouse
- [ ] Screen reader support (ARIA labels on all Ava UI)
- [ ] High contrast theme option
- [ ] Respect OS-level font scaling and reduced motion settings
- [ ] Color-blind friendly: never rely on color alone for status

### Performance
- [ ] Cold start under 3 seconds on average hardware
- [ ] AI requests never block the editor — all async
- [ ] Lazy-load extensions and panels (don't load Ava backend until panel opened)
- [ ] Memory usage under 500MB with a medium project open
- [ ] Cache aggressively: completions, workspace index, extension data

### Error Handling
- [ ] Never show raw stack traces to users
- [ ] Friendly error messages with clear next steps
- [ ] "Something went wrong" → "Couldn't connect to DeepSeek. Check your API key in Settings."
- [ ] Network errors: retry silently once, then notify politely
- [ ] Crash recovery: restore open files and chat history on restart

### Documentation
- [ ] In-app help: `F1` or `?` icon in panels shows contextual help
- [ ] Tooltips on every button and icon
- [ ] First-time hints: subtle pointers for new users ("Try right-clicking code for AI actions")
- [ ] Keyboard shortcut cheat sheet: `Ctrl+K Ctrl+S` (standard VS Code binding)

---

## Implementation Order Summary

| Order | Item | Effort | Impact |
|-------|------|--------|--------|
| 1 | Bundle language support (1.1) | Medium | Critical — makes it a real IDE |
| 2 | Default settings (1.3) | Small | High — instant quality feel |
| 3 | Keyboard shortcuts (1.4) | Small | High — power user retention |
| 4 | Theme system (1.5) | Medium | High — visual identity |
| 5 | First-launch onboarding (1.2) | Medium | High — first impression |
| 6 | Editor context menu (2.1) | Medium | High — AI discoverability |
| 7 | Status bar (2.2) | Small | Medium — polish |
| 8 | Live editor integration (2.3) | Large | Critical — trust in AI |
| 9 | Terminal integration (2.4) | Medium | Medium — transparency |
| 10 | Inline completions (2.5) | Large | Critical — daily driver feature |
| 11 | Project detection (3.1) | Medium | High — zero-config experience |
| 12 | Smart file context (3.2) | Medium | High — better AI responses |
| 13 | Problems panel (3.3) | Small | Medium — native feel |
| 14 | Git-aware AI (3.4) | Medium | High — real workflow integration |
| 15 | Multi-provider management (4.1) | Medium | Medium — power users |
| 16 | Workspace templates (4.2) | Medium | Medium — onboarding |
| 17 | Snippets & code actions (4.3) | Medium | Medium — productivity |
| 18 | Collaboration (4.4) | Large | Medium — future |
| 19 | Extension recommendations (5.1) | Small | Medium — ecosystem |
| 20 | Settings sync (5.2) | Medium | Medium — multi-machine |
| 21 | Browser version (5.3) | Large | High — reach |
| 22 | Tool marketplace (5.4) | Large | High — ecosystem |

---

*Last updated: 2026-03-01*
*This is a living document. Items will be checked off and reprioritized as we build.*
