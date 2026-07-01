# Desktop Automation — Build Plan

**Status:** approved direction (research/talk done 2026-06-08). This is the build plan. IDE-only feature.
**Thesis:** the agent OpenClaw should have been — power **+** trust **+** memory. Ava operates the whole machine (native via UIA, web via Playwright-Chromium, visual via Holo vision), learns your workflows, stays local + gated.
**Testing rule:** every phase ships testable in the IDE dev app and must be hammered before the next phase starts. No phase is "done" until it works on the operator's screen.

---

## Architecture (target)

```
COGNITION   Ava (coordinator) + 5-persona conductor: Scout→Planner→Actor→Verifier→Narrator
MEMORY      procedural ("how to export in App X") · preferences · decisions folder  (read before / write after)
PERCEPTION  3-tier, merged → one ScreenState:
            1) Accessibility tree (UIA; Mac AX/Linux AT-SPI later) — fast, exact, private, no model, any machine
            2) Playwright DOM — the built-in Chromium browser, now wired in as the web/Electron tier
            3) Holo3.1 vision — blind-spot fallback (canvas/games/custom); local llama.cpp / cloud free-tier
ACTION      enigo, by-NAME not pixel: click · type · key · focus · launch  (+ scroll · drag · right-click)
SECURITY    plan-approve gate · watch/ask/drive dial · secret handles · no-shell launch · local-first · kill-switch
```

---

## Open decisions (operator confirms — Claude's recommendation in **bold**)

1. **Build order** → **brain-first: A → B → C**. Lights up the standout (memory) with zero new deps; vision waits on the H Company answers anyway.
2. **"Drive" autonomy ceiling** → **capped unattended run (e.g. N steps / M minutes) + heartbeat + Ctrl+Alt+K kill-switch**; conservative default, configurable. High-stakes actions never auto.
3. **Cross-platform** → **Windows-perfect first, then Mac AX**. UIA exists today; Mac is a whole second bridge. Vision tier is already OS-agnostic, so it's the bridge when we get there.
4. **Prompt-injection "screen-said-so" check** → **include a lightweight version**: instructions that originate from observed screen/web/email content (not the user) get flagged + confirmed before any irreversible action.

## Verify hands-on before Phase C (the H Company asks)
- Holo3.1 publishes `mmproj` for the small 0.8B / 4B sizes.
- llama.cpp loads Holo's mmproj cleanly (Ollama had crashes on this family).
- Real grounding latency on a typical machine (target ~1s).
(These are the email asks to H Company — Phase C is gated on the answers; A and B are not.)

---

## Phases

### Phase A — Light up the conductor (the brain)  · no new deps
Replace the single-agent desktop loop with the **designed-but-dormant** 5-persona conductor (specs already exist in `packages/core/src/tools/desktop/personas.ts`).
- Build a `DesktopConductor` that orchestrates Scout (perceive) → Planner (plan → `desktop_plan_approve`) → Actor (execute via action tools) → Verifier (re-read the tree, confirm the action did what was expected) → Narrator (explain to the user).
- Wire it into the desktop-mode loop in `packages/ide/sidecar/index.mjs` (today it just runs the regular Agent on the `[Desktop Automation Mode]` prefix).
- Keep the existing plan-approve gating + watch/ask/drive dial.
- **Test (dev app):** a multi-step task — "open Notepad, type a note, save as test.txt" — runs through the conductor with per-step verify; a deliberately wrong step is caught by the Verifier and retried/surfaced.

### Phase B — Memory + decisions (the moat)  · no new deps
Make automation **stateful**.
- **Before acting:** Scout/Planner call `memory_recall` + read the decisions folder for relevant procedural knowledge + standing decisions.
- **After acting:** a reflection step distills the successful trajectory into **procedural memory** (the click-path, keyed app→task) and appends consequential calls to the **decisions folder**.
- Define the procedural-memory schema (app · task · steps · last-verified).
- **Test (dev app):** run a task twice — second run recalls the path and is faster/surer; confirm memory + decisions entries are written and re-read.

### Phase C — Complete the perception chain (the eyes)  · GATED on the verify items
- Build the **merge layer**: unify whatever tiers fired into one ranked `ScreenState` (today UIA is the only source; no merge exists).
- Wire the **Playwright DOM tier** into the chain (it exists as `browser_snapshot` but is a silo — connect it).
- Add the **Holo3.1 vision tier**: local llama.cpp runner (native binary + mmproj, no Python) + cloud free-tier fallback + a **capability probe** that picks the lane (GPU→4B · weak→0.8B/cloud · none→graceful degrade), user-overridable.
- **Test (dev app):** a canvas / custom-rendered app where UIA is blind → vision localizes and clicks; weak-machine path falls back cleanly.

### Phase D — Fill the action primitives (the hands)  · small
- Wrap the existing `InputProvider` methods as tools: **scroll, drag, right-click** (interfaces exist, never exposed).
- **Test (dev app):** a drag-drop, a right-click context menu, a scroll-to-find.

### Phase E — Cross-platform  · later, decision-gated
- Mac AX / Linux AT-SPI accessibility tier (enigo already cross-platform for input; Holo vision already OS-agnostic).
- Only after Windows is excellent.

---

## Cross-cutting: security (the anti-OpenClaw spine)
Carried through every phase — no listening service, first-party auditable tools only, local-first perception (screen never leaves the machine), plan-approve caps blast radius, secret handles, no-shell launch, the prompt-injection check (decision 4), kill-switch. See [[project_desktop_automation_vision]].

## BYOK note
Desktop automation is **free for everyone, BYOK included** — their model (their key) + local Holo (open, $0) + accessibility tree (free) = $0 to the platform, full capability to the user.

---

## Appendix — C3 vision layer: what transfers from UI-Voyager (Tencent)
Reference for the PERCEPTION tier-3 (Holo vision) + the learn-from-failure loop. Source: UI-Voyager, arXiv 2603.24533 (Tencent Hunyuan, self-evolving GUI agent).

**What UI-Voyager is:** a **4B** VL model (Qwen3-VL-4B) that hits **81% on AndroidWorld — above the 80% human baseline**, beating 235B models. Pure **pixel grounding** (`click(x,y)` from raw screenshots, no a11y tree), single forward pass per step. The win is not a big model — it's one training trick.

**The crown jewel — GRSD (Group Relative Self-Distillation), = our compounding-memory flywheel for GUI actions:**
1. Run each task many times → keep **both** successful and failed trajectories.
2. Find the **fork point** — the step where a success and a failure were in the *same screen state* (matched via **SSIM on grayscale thumbnails**) but took *different actions*.
3. Train example: `[failed run history] → [correct action from the successful run]`.
4. Fine-tune. Converts "task failed" into "THIS step was wrong, here's the right click" — dense, surgical supervision.

**What transfers to Ava C3 (we can't fine-tune — BYOK, no own model yet — so run it at RUNTIME via retrieval):**
1. **Runtime fork-point memory (the differentiator).** On action failure store `(screen-state → action → outcome)`; on a successful retry store the correction. At inference retrieve *"last time this screen looked like X, clicking Y failed and Z worked."* Same learning signal, no fine-tune — our memory system doing GRSD's job. Feeds the procedural-memory tier already in the architecture above.
2. **SSIM state-matching — steal verbatim.** Grayscale-thumbnail + hash-prefilter + SSIM = cheap, model-free "have I seen this screen before?" Powers the retrieval above + dedup. No LLM.
3. **A small VL grounding model is enough.** 4B beat 235B → Holo tier-3 can be small/cheap/local, not frontier. Fits $0-to-platform.
4. **Build the action verifier first — ours beats theirs.** Their success signal is a rule-based `adb` state check; on Windows the **UIA tree** is a richer "did that action do what I expected?" than adb. The verifier is what *feeds* the failure loop.

**What NOT to copy:** not pure-pixel grounding (they skip a11y because Android's is weak; Windows UIA is rich — our **UIA-first, vision-fallback** hybrid is stronger for desktop; C3 vision is only the fallback for canvas/game/custom UIs). Not their offline SFT loop (needs a training pipeline + reward env we don't have — the runtime-retrieval version gets ~80% of the value at ~0% infra).

**C3 shape:** `UIA-first → if element not exposed → small VL grounds click(x,y) → verify via UIA state change → on failure store the fork; on next similar state retrieve the learned correction.`
