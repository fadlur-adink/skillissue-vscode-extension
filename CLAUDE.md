# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SkillIssue — a VS Code extension that observes builds/tests/lints (tasks, integrated-terminal commands, and vscode-jest Testing UI reports) and, on failure, pops a laughing-cat WebView with sound. TypeScript (strict), plain `tsc` → CommonJS in `out/`, zero runtime dependencies, no bundler. Desktop-only extension host.

## Commands

```bash
npm install                 # dev Node 22.x
npm run compile             # tsc → out/
npm run watch               # tsc --watch
npm run lint                # eslint flat config (eslint.config.mjs)
npm test                    # compile + lint + unit + integration
npm run test:unit           # mocha over out/test/unit — requires prior `npm run compile`
npm run test:integration    # vscode-test in a real VS Code host; headless: xvfb-run -a npm run test:integration
npm run package             # vsce package → skillissue-<version>.vsix
```

Run a single unit test file (after compiling):

```bash
npx mocha out/test/unit/policy/reactionPolicy.test.js
```

Debug: F5 ("Run Extension") opens the Extension Development Host; run `SkillIssue: Preview Reaction` there.

## Architecture

Strict inward layering: **outer layers may import inner layers, never the reverse**. Only `extension.ts` (composition root, owns ALL wiring) and the named adapters import `vscode`: `detection/taskDetector`, `detection/terminalDetector`, `detection/jestResultDetector`, `config/skillIssueConfig`, `reaction/catReactionController`, `logging/outputChannelLogger`. Everything else is pure and unit-testable offline.

Pipeline: **detection → policy → reaction**, driven by the orchestrator.

- `src/core/` — pure domain model: operations, outcomes, events, `WorkflowTracker` (consecutive-failure tracking keyed `source::workspace::name` — never add the per-run id to that key).
- `src/detection/` — thin adapters over Tasks, shell-execution events, and vscode-jest's structured Test Explorer reports; decision logic lives in pure mapping modules (`taskMapping.ts`, `commandMapping.ts`, `jestResultMapping.ts`). Task/terminal outcomes come from exit codes and Jest outcomes from JSON fields — never terminal/Testing Output text. Ambiguous tools (`next`, `vite`, `node`) and dev servers classify as `Unknown` and emit nothing. See `src/detection/AGENTS.md`.
- `src/policy/` — pure `shouldReact()` decision: ANDed filters, `exclude` is a veto, include/exclude matching is case-insensitive substring (never regex/glob).
- `src/orchestration/` — pure detection→policy→reaction loop; `SkillIssueOrchestrator.handleEvent()` never throws.
- `src/reaction/` — WebView presentation. `reactionView.ts` is a pure markup function (CSP + per-render nonce + `escapeHtml` on every dynamic value); `catReactionController.ts` owns the single reused panel; sound is injected (`playSystemSound`), never imported. Asset names come only from `REACTION_ASSETS` in `reactionAssets.ts` (parity test enforces it). See `src/reaction/AGENTS.md`.
- `src/config/` — `SkillIssueConfig` is the ONLY reader of `getConfiguration`; settings are read per use so changes apply live without reload.
- `src/audio/` — native OS player (`NativeSoundPlayer`) spawns OS audio via `child_process`; `play()` never throws. Native backend needs WAV; WebView backend uses MP3.

Two runtime contexts, never conflated: extension host (full Node + `vscode` API) and the sandboxed WebView (no Node, no file access, `postMessage` only; `localResourceRoots` = `assets/` via `asWebviewUri`, never raw `file://`).

`docs/ARCHITECTURE.md` is the canonical design doc — read it before structural changes. Module-level knowledge bases: root `AGENTS.md`, `src/detection/AGENTS.md`, `src/reaction/AGENTS.md`.

## Conventions and hard rules

- **Two invariants override everything**: SkillIssue is strictly observational (never alter exit codes, stdout/stderr, args, task execution), and a SkillIssue error must never escape (every entry point try/catches and logs; `handleEvent()` and `play()` never throw).
- **Never import `vscode` in pure modules** (`core/`, `policy/`, `orchestration/`, `audio/`, `reaction/reactionView|reactionRequest|reactionAssets`, `detection/*Mapping`, `config/settings`, `logging/logger`). This is what keeps unit tests offline.
- Log through `Logger`, never `console.*` (`no-console: warn`).
- Every disposable (listener, timer, panel, channel) goes onto `context.subscriptions`; no module-level mutable state.
- Tests: Mocha BDD (`describe`/`it`) + `node:assert/strict` in both tiers, run against compiled `out/` JS — compile first. Unit tier never imports `vscode`; tests mirror source paths (`src/core/x.ts` ↔ `src/test/unit/core/x.test.ts`).
- camelCase filenames. Explicit return types are NOT required (`explicit-function-return-type: off`) — don't add them. No Prettier/EditorConfig — formatting is not machine-enforced.

## Pitfalls

- `@types/vscode` pinned exact `1.90.0` (≤ engine) — do NOT raise it. `onDidEndTerminalShellExecution` post-dates 1.90 and is reached via a structural shim + `typeof` guard in `terminalDetector.ts`; it no-ops when unavailable.
- Dev Node 22 vs runtime Node 20 (`@types/node: ^20`) — no Node >20 APIs in extension code.
- `.vscode-test.mjs` must keep `mocha.ui: 'bdd'` — test-cli defaults to TDD and everything fails with `describe is not defined`.
- `@vscode/test-electron` must stay an explicit devDependency — test-cli doesn't install it transitively. Don't force Mocha 12 via `overrides` (breaks the runner).
- Terminal detection needs shell integration active; without it the detector reports `available === false` and no-ops. Integration tests never execute a real terminal command (environment-dependent, would flake).
- Watch-mode commands that never terminate the process are invisible (no end event) — a documented limitation; don't "fix" by parsing output.
- Cat GIF/MP3/WAV/PNG in `assets/` are third-party, NOT MIT — must be cleared/replaced before Marketplace publish (not published yet). `icon.png` is original.
- Ignore `.codegraph/` (symlink to external index) and `.omo/` (agent state).
