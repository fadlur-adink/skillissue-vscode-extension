# SKILLISSUE — PROJECT KNOWLEDGE BASE

**Generated:** 2026-09-05T06:42:58Z
**Commit:** 8484718
**Branch:** main

## OVERVIEW

VS Code extension that watches builds/tests/lints (tasks + integrated-terminal commands) and pops a laughing-cat WebView with sound on failure. TypeScript, strict, plain `tsc` → CommonJS `out/`, zero runtime deps, no bundler.

Canonical design doc: `docs/ARCHITECTURE.md` (source of truth — read before structural changes). Contributor guide: `CONTRIBUTING.md`.

## STRUCTURE

```
src/
├── extension.ts      # composition root — activate() wires everything; deactivate() empty
├── constants.ts      # command IDs, channel/config names (keep in sync with package.json)
├── core/             # pure domain model: operations, outcomes, events, tracker
├── detection/        # VS Code task/terminal events → domain events (see src/detection/AGENTS.md)
├── policy/           # pure shouldReact() decision
├── reaction/         # WebView meme presentation (see src/reaction/AGENTS.md)
├── orchestration/    # pure detection → policy → reaction loop
├── config/           # typed settings; single getConfiguration reader
├── logging/          # Logger contract + OutputChannel sink
├── audio/            # native OS audio player (child_process)
└── test/             # unit/ (pure, no vscode) + integration/ (real VS Code host)
assets/               # meme media — NOT MIT-licensed (see NOTES)
out/                  # compiled output, gitignored
```

Ignore: `.codegraph/` (symlink to external index), `.omo/` (agent state), `out/`, `node_modules/`.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Wire a new module | `src/extension.ts` | composition root owns ALL wiring |
| Change reaction decision logic | `src/policy/reactionPolicy.ts` | pure; returns `{react, reason}` |
| Track repeat failures | `src/core/workflowTracker.ts` | keyed `source::workspace::name` |
| Add/change a setting | `package.json` contributes + `src/config/settings.ts` | never touch policy contract |
| Detect a new signal source | `src/detection/` | new detector + wire in extension.ts |
| Change meme look/behavior | `src/reaction/` | markup pure in `reactionView.ts` |
| Human-readable failure text | `src/core/describe.ts` | consumers never parse terminal text |
| Audio playback | `src/audio/nativeSoundPlayer.ts` | WAV only on native path |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `activate()` | fn | `src/extension.ts:30` | composition root; builds logger → config → sound → controller → orchestrator → detectors |
| `SkillIssueOrchestrator` | class | `src/orchestration/skillIssueOrchestrator.ts:46` | the loop; `handleEvent()` NEVER throws |
| `WorkflowTracker` | class | `src/core/workflowTracker.ts:39` | consecutive-failure facts per logical op |
| `shouldReact()` | fn | `src/policy/reactionPolicy.ts:42` | pure decision; ANDed filters, `exclude` = veto |
| `TaskDetector` | class | `src/detection/taskDetector.ts:20` | Tasks API exitCode → domain events |
| `TerminalExecutionDetector` | class | `src/detection/terminalDetector.ts:53` | shell-execution API via defensive shim |
| `CatReactionController` | class | `src/reaction/catReactionController.ts` | owns the single WebviewPanel |
| `buildReactionHtml()` | fn | `src/reaction/reactionView.ts` | pure document: CSP + nonce + escaping |
| `SkillIssueConfig` | class | `src/config/skillIssueConfig.ts:16` | ONLY reader of `getConfiguration` |
| `NativeSoundPlayer` | class | `src/audio/nativeSoundPlayer.ts:94` | OS player spawn chain; `play()` never throws |
| `ReactionSink` | iface | `src/reaction/reactionRequest.ts` | decoupling seam; faked in tests |

## CONVENTIONS

- **Layering: outer → inner, never reverse.** Only `extension.ts` + named adapters import `vscode` (`detection/*Detector`, `config/skillIssueConfig`, `reaction/catReactionController`, `logging/outputChannelLogger`). Everything else is pure.
- **Pure core / thin adapter split everywhere** — mapping, settings, markup, sound-command selection. This is what makes unit tests run offline.
- **Log through `Logger`, never `console.*`** (`no-console: warn`).
- **Strict TS**: `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch` are compile errors. Explicit return types NOT required (`explicit-function-return-type: off`) — don't add them.
- **camelCase filenames**; tests mirror source paths: `src/core/x.ts` ↔ `src/test/unit/core/x.test.ts`.
- **Tests**: Mocha BDD (`describe`/`it`) both tiers + `node:assert/strict`. Unit tier never imports `vscode`. Tests run against compiled `out/` JS — compile first.
- Settings pulled **per use** (per event / per reaction) so config changes apply live, no reload.
- No Prettier/EditorConfig — formatting is not machine-enforced.
- Every disposable (listener, timer, panel, channel) pushed onto `context.subscriptions`; no module-level mutable state.

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER alter the developer's workflow** — no touching exit codes, stdout/stderr, args, task execution. Strictly observational.
- **NEVER let a SkillIssue error escape** — every entry point try/catch + log. `handleEvent()` and `play()` never throw.
- **NEVER import `vscode` in pure modules** (`core/`, `policy/`, `orchestration/`, `audio/`, `reaction/reactionView|reactionRequest|reactionAssets`, `detection/*Mapping`, `config/settings`, `logging/logger`).
- **NEVER parse terminal text** — outcome = exit code only.
- **NEVER use raw `file://` in the WebView** — `asWebviewUri()` within `localResourceRoots` (assets/ only). Sole exception: native audio backend plays WAV from disk.
- **NEVER guess classification** — ambiguous tools (`next`, `vite`, `node`) → `Unknown`; code-less ending → `unknown`, never `cancelled`.
- **NEVER call `getConfiguration` outside `SkillIssueConfig`**; never expose internal `reactOnFailure`.
- **NEVER add the per-run id to `operationKey`** (`source::workspace::name` only — repeat detection depends on it).
- include/exclude matching is **case-insensitive substring**, never regex/glob.

## COMMANDS

```bash
npm install                 # Node 22.x required (dev tooling)
npm run compile             # tsc → out/
npm run watch               # tsc -watch (default VS Code build task)
npm run lint                # eslint flat config
npm test                    # pretest (compile+lint) → unit + integration
npm run test:unit           # mocha, out/test/unit (needs prior compile)
npm run test:integration    # vscode-test; needs display → xvfb-run -a on headless
npm run package             # vsce package → skillissue-<version>.vsix
code --install-extension skillissue-0.0.1.vsix
```

Debug: F5 ("Run Extension") → run `SkillIssue: Preview Reaction` in the dev host.

## NOTES

- `@types/vscode` pinned exact `1.90.0` (≤ engine) — newer APIs unreachable. `onDidEndTerminalShellExecution` is reached via structural shim + `typeof` guard in `terminalDetector.ts`; do NOT raise the engine.
- Dev Node 22 vs runtime Node 20 (`@types/node: ^20`) — don't use Node >20 APIs in extension code.
- `.vscode-test.mjs` MUST keep `mocha.ui: 'bdd'` — test-cli defaults to TDD, breaks everything with `describe is not defined`.
- `@vscode/test-electron` must stay an explicit devDependency — test-cli doesn't install it transitively.
- Don't force Mocha 12 via `overrides` (breaks runner); ESLint pinned 9.x until typescript-eslint supports 10.
- Activation is `onStartupFinished`, not `*` — must be active before tasks run, but lazy.
- Native audio backend needs WAV (`paplay` can't decode MP3); WebView backend uses MP3.
- Terminal detection requires shell integration active; otherwise detector no-ops (`available === false`). Ordinary commands (git/ls/grep) are filtered by `commandMapping.ts`.
- **Media rights**: cat GIF/MP3/WAV/PNG are third-party, NOT MIT — must be cleared/replaced before Marketplace publish. `icon.png` is original. Not published yet.
- Watch-mode failures that never terminate the process are invisible (no end event) — documented limitation, don't "fix" by parsing output.
