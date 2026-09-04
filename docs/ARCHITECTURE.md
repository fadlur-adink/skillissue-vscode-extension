# SkillIssue — Architecture & Decisions

This document records the architectural decisions established in **Phase 0** so
that later phases build on them instead of rediscovering them. It is a living
document: when a phase reveals a new VS Code constraint or forces a design
change, the discovery is recorded here.

---

## 1. What SkillIssue is

A VS Code extension that observes a developer's workflow (tests, TypeScript
compilation, linting, builds, npm/pnpm/yarn scripts, VS Code tasks) and, **when
an operation fails**, reacts with a laughing-cat meme and sound.

Two invariants override every other decision:

1. **SkillIssue is observational.** It must never alter exit codes, stdout,
   stderr, command arguments or task execution behaviour. A failing command must
   behave exactly as it would with SkillIssue uninstalled.
2. **A meme failure must never become a workflow failure.** Any error inside
   SkillIssue (WebView, audio, parsing, disposal) is contained and logged; it
   can never break the developer's command.

---

## 2. Runtime environments

The extension spans two distinct runtime contexts that must not be conflated:

| Context | What runs there | Capabilities | Constraints |
| ------- | --------------- | ------------ | ----------- |
| **Extension Host** | `src/**` compiled to `out/**`, loaded via `package.json → main` | Full Node.js + the `vscode` API (tasks, terminals, commands, configuration, WebView *creation*) | Long-running process; must manage listener/disposable lifecycles carefully |
| **WebView** | HTML/CSS/JS shown inside a VS Code panel | DOM, `<img>`, `<audio>`, animation | Sandboxed: **no** Node, **no** direct `vscode` API, no arbitrary local file access; talks to the host only via `postMessage` |

Consequences:

* Failure detection, policy and orchestration live in the **Extension Host**.
* The meme presentation lives in the **WebView**.
* The two communicate only through message passing; the WebView never inspects
  terminal output and never decides *whether* to react.

### Desktop-only for now

SkillIssue targets the **desktop** Extension Host (`main`, not `browser`). It
relies on `vscode.tasks`, local WebView media and an `OutputChannel`. A web
extension build is out of scope and would require bundling plus a different
media/loading strategy. This is a deliberate constraint, not an oversight.

---

## 3. Module boundaries (target layering)

The design follows a strict inward dependency rule: **outer layers may depend on
inner layers, never the reverse.** Only the outermost layer imports `vscode`.

```text
        ┌──────────────────────────────────────────────┐
        │  extension.ts  (VS Code composition root)     │  ← the only place that
        └───────────────┬──────────────────────────────┘    wires everything up
                        │ depends on
   ┌────────────────────┼─────────────────────────────┐
   │                    │                             │
┌──▼─────────┐   ┌───────▼───────┐   ┌────────────────▼───────────────┐
│ detection/ │   │   policy/     │   │           reaction/            │
│ VS Code    │   │ decide if an  │   │ orchestrate + WebView (cat UI) │
│ events →   │   │ outcome       │   │                                │
│ domain     │   │ deserves a    │   │                                │
│ events     │   │ reaction      │   │                                │
└──┬─────────┘   └───────┬───────┘   └────────────────┬───────────────┘
   │                     │                            │
   └─────────┬───────────┴──────────────┬─────────────┘
             │ depend on                │
        ┌────▼──────────────────────────▼────┐
        │  core/  (domain model, no vscode)   │
        │  config/ (typed settings access)    │
        │  logging/ (logger contract)         │
        └─────────────────────────────────────┘
```

Planned modules (introduced by their owning phase — **not** stubbed early):

| Module | Phase | Responsibility | Imports `vscode`? |
| ------ | ----- | -------------- | ----------------- |
| `logging/` | 0 | Logger contract (pure) + OutputChannel sink | Contract: no. Sink: yes |
| `core/` | 1 | Domain model: operations, outcomes (success/failure/cancelled/unknown), events | **No** |
| `detection/` | 2 | Translate VS Code task/terminal events into `core` domain events | Yes |
| `policy/` | 3 | Decide whether an outcome deserves a reaction, given configuration | **No** (pure) |
| `reaction/` | 4 | Present the meme (WebView markup + panel controller); expose the `ReactionSink` seam | Controller: yes. Markup: no |
| `orchestration/` | 5 | Connect detection → policy → reaction in one pure, contained loop | **No** |
| `config/` | 6 | Centralised, typed access to user settings | Yes |

**Rule of thumb:** if a piece of logic can be expressed without `vscode`, it goes
in a pure module (`core/`, `policy/`) so it can be unit tested in isolation.

### Core domain model (Phase 1 — implemented)

`src/core/` is pure TypeScript (no `vscode` import) and fully unit tested:

| File | Provides |
| ---- | -------- |
| `outcome.ts` | `OutcomeKind` + the `OperationOutcome` union (`success` / `failure(exitCode?)` / `cancelled` / `unknown(reason?)`) with factories and type-guard predicates |
| `operation.ts` | `OperationKind`, `OperationSource` (`task`/`terminal`/`unknown`), the `Operation` value type, `createOperation()` and `operationKey()` |
| `events.ts` | `OperationStarted` / `OperationCompleted` lifecycle events (+ guards) |
| `describe.ts` | `describeOperationOutcome()` → a meaningful string ("npm test failed (exit code 1)") so no consumer ever parses terminal text |
| `workflowTracker.ts` | `WorkflowTracker`: pure per-operation state exposing consecutive-failure counts and repeat detection |

Two decisions later phases rely on:

* **`operationKey` excludes the per-run `id`** (it is `source::workspace::name`),
  so reruns of the same task/command map to one logical operation — this is what
  makes "repeated failures" meaningful.
* **`consecutiveFailures` increments on failure and resets on any non-failure**
  (success, cancelled or unknown). The tracker only *reports* this fact; deciding
  whether a repeat should trigger or suppress a reaction is the policy's job
  (Phase 3).

### Failure detection (Phase 2 — implemented)

`src/detection/` translates VS Code workflow events into `core` domain events.

* **Signal chosen: the Tasks API.** `vscode.tasks.onDidStartTaskProcess` /
  `onDidEndTaskProcess` are used because `TaskProcessEndEvent.exitCode` is the
  strongest, least ambiguous completion signal VS Code exposes. Terminal *text*
  is never parsed.
* **Split for testability.** `taskMapping.ts` is pure (`outcomeFromExitCode`,
  `classifyTaskKind`, `buildTaskOperation`) and exhaustively unit tested;
  `taskDetector.ts` is the thin `vscode` adapter that subscribes, correlates a
  run's start/end by `TaskExecution` identity, and re-emits `WorkflowEvent`s
  through a `vscode.EventEmitter`.
* **Observational guarantee.** The detector only listens; it never changes a
  task's execution, arguments, output or exit code. Every handler is wrapped in
  try/catch and logs — a SkillIssue bug can never break the developer's task.
* **Lifecycle.** All listeners and the emitter are `Disposable` and owned by the
  detector, which is pushed onto `context.subscriptions`; in-flight runs are
  cleared on disposal.
* **Exit code → outcome:** `0` → success, non-zero → failure(code),
  `undefined` → unknown (see limitations below).

Known limitations (deliberately surfaced, not hidden):

* **Cancellation is not distinguishable from other code-less endings.** When a
  task ends without an exit code the Tasks API gives no reliable "user
  cancelled" flag, so it maps to `unknown`, not `cancelled`.
* **Ad-hoc integrated-terminal commands are not detected yet.** Commands typed
  directly into a terminal are not VS Code *tasks* and never flow through the
  Tasks API. Detecting them reliably needs terminal shell-integration exit codes
  (a newer API than the 1.90 baseline) and remains out of scope after Phase 7 (see
  §9 and the Phase 7 subsection).
* **End-to-end task detection is validated manually in Phase 2** (run a task in
  the Extension Development Host and watch the `SkillIssue` Output channel);
  automated end-to-end coverage of the whole loop now lives in the integration
  suite (`endToEnd.test.ts`, added in Phase 11 — see §7).

### Reaction policy (Phase 3 — implemented)

`src/policy/` answers one question deterministically: **given what happened and
the current configuration, should SkillIssue react?** It is pure TypeScript (no
`vscode` import) and exhaustively unit tested.

| File | Provides |
| ---- | -------- |
| `policySettings.ts` | The `ReactionPolicySettings` contract, `RepeatedFailurePolicy` (`always` / `first-only`), `createDefaultPolicySettings()` and `withPolicySettings(overrides)` |
| `reactionPolicy.ts` | `shouldReact(input, settings) → { react, reason }` and the `matchesAnyPattern()` helper |

Design decisions later phases rely on:

* **Detection reports facts; policy judges them.** `shouldReact` consumes a
  `PolicyInput` (`operation`, `outcome`, `consecutiveFailures`) — never a VS Code
  event — so the policy is testable with hand-built inputs and independent of how
  the outcome was detected.
* **Filters are ANDed; `exclude` is an absolute veto.** A reaction requires
  passing every check in order: enabled → failure-like outcome → not excluded →
  in the include list (if any) → kind monitored (if any) → repeat rule. The
  evaluation order only affects which `reason` is reported first, never the final
  boolean, since a reaction must clear every gate.
* **"Failure-like" is configurable, not hardcoded.** A real failure reacts when
  `reactOnFailure`; cancellation and unknown outcomes react only when
  `treatCancellationAsFailure` / `treatUnknownAsFailure` are enabled (both **off**
  by default, so a code-less task ending does not spam a cat).
* **Defaults are deliberately conservative:** enabled, react on real failures,
  monitor all kinds, empty include/exclude, react on every failure — i.e. "laugh
  at genuine failures, stay quiet otherwise".
* **`include`/`exclude` use case-insensitive substring matching**, not regex or
  glob, so names like `npm: test` stay predictable and approachable. Empty
  patterns are ignored so they never accidentally match everything.
* **The settings contract is separate from its source.** Phase 6 maps VS Code
  settings onto `ReactionPolicySettings`; the policy only ever sees the plain
  data type, so the settings *source* can change without touching the logic.

Every decision (react **or** skip) carries a `reason` string, so the reaction
layer (Phase 5) and the logs can always explain *why* SkillIssue did or did not
laugh — there are no silent decisions.

### Reaction UI (Phase 4 — implemented)

`src/reaction/` is the meme's face: a single, isolated WebView that presents the
laughing cat and sound when handed a reaction request. It is split so the markup
stays pure and only a thin adapter touches `vscode`.

| File | Provides | Imports `vscode`? |
| ---- | -------- | ----------------- |
| `reactionRequest.ts` | `ReactionRequest` — the *only* thing the UI may know (a pre-computed `message`); the decoupling boundary from detection | **No** |
| `reactionAssets.ts` | `REACTION_ASSETS` — canonical bundled file names (GIF / audio / poster), one source of truth for packaging **and** tests | **No** |
| `reactionView.ts` | `buildReactionHtml(model)` + `escapeHtml()` — the complete, self-contained document (CSP, theming, a11y, GIF/audio script) | **No** |
| `catReactionController.ts` | `CatReactionController` — owns the single `WebviewPanel`, resolves asset URIs, drives create/reuse/dispose, contains every error | Yes |

Design decisions later phases rely on:

* **Presentation is pure; only the adapter touches `vscode`.** `buildReactionHtml`
  is a pure function of a `ReactionViewModel` (resolved URIs, CSP source, nonce,
  text, sound flag), so the whole document — security, escaping, theming,
  accessibility, media choreography — is unit tested without VS Code.
* **The UI never decides.** It receives a `ReactionRequest` and renders it; it
  never sees an exit code, terminal text or policy verdict. Turning a policy
  decision into a request is Phase 5. This keeps the *receiving a reaction* vs
  *deciding to react* boundary explicit, exactly as the plan requires.
* **Secure by construction.** A strict CSP (`default-src 'none'`) allows
  resources only from `webview.cspSource`; the inline `<style>`/`<script>` are
  authorised by a per-render cryptographic **nonce**; every dynamic string passes
  `escapeHtml`, so a task name can never inject markup. Assets are exposed only
  via `asWebviewUri` inside `localResourceRoots` — never a raw `file://` path.
* **One panel, reused.** At most a single `WebviewPanel` exists; reacting while it
  is open **reveals and replays** it instead of stacking tabs. A `ready` handshake
  from the view removes the load/reload race, so a reaction sent to a
  still-loading webview is never lost.
* **GIF + audio together, honest when audio can't play.** Each reaction restarts
  the GIF and plays the sound. Because Chromium may block programmatic audio
  without a user gesture, a rejected `play()` reveals a "Play sound" control and
  a note rather than failing silently or throwing.
* **Themed and accessible.** Colours come from VS Code's `--vscode-*` variables so
  it matches light/dark/high-contrast. The card is a polite `aria-live` region,
  the image has alt text, controls are keyboard-focusable, and
  `prefers-reduced-motion` swaps the animated GIF for the static poster and
  disables the entrance animation.
* **Auto-dismiss + safe disposal.** The panel closes itself after a default
  duration (re-triggering resets the timer), is fully `Disposable`, clears its
  timer and listeners on teardown and is safe to dispose repeatedly. Every entry
  point is wrapped in try/catch + logging — a meme failure can never break the
  developer's workflow.
* **Triggerable independently.** The `SkillIssue: Preview Reaction` command
  (`skillissue.previewReaction`) shows the cat on demand, satisfying "can be
  triggered independently from the rest of the system" without any detection.

### Orchestration loop (Phase 5 — implemented)

`src/orchestration/skillIssueOrchestrator.ts` is where the product loop becomes
real: **detection → policy → reaction.** It is pure TypeScript (no `vscode`) and
fully unit tested.

```text
detector ─WorkflowEvent─▶ orchestrator.handleEvent(event)
                                 │  record in WorkflowTracker (consecutive failures)
                                 │  shouldReact(input, settings)   ← policy (Phase 3)
                                 ▼
                     react?  ─ no ─▶ log + stop (a success stays silent)
                        │ yes
                        ▼
            sink.react(describe(operation, outcome))  ─▶ CatReactionController
```

Design decisions:

* **Pure and injectable.** The orchestrator depends only on `core`, `policy`, the
  `ReactionSink` seam and a `Logger` — never on `vscode`, the concrete detector or
  the controller. `extension.ts` (the composition root) owns the VS Code event
  subscription and calls `handleEvent`; that is what makes the whole loop
  unit-testable with a fake sink and hand-built settings.
* **`ReactionSink` is the decoupling seam.** Defined beside `ReactionRequest`
  (pure), it is satisfied structurally by `CatReactionController` in production and
  by a recording fake in tests. The loop never imports the WebView.
* **The tracker feeds the policy.** Each completion is recorded to obtain the
  accurate `consecutiveFailures`, which drives the policy's repeat rule — so
  "first-only" suppression and per-operation isolation work end to end.
* **Settings are pulled per event.** `getSettings()` is consulted on every
  decision, so a configuration change (Phase 6) takes effect immediately with no
  rewiring; Phase 5 supplies `createDefaultPolicySettings()`.
* **Containment is the contract.** The whole handler is wrapped in `try/catch`; a
  throwing sink (WebView/audio/UI failure) is logged, never rethrown. A meme
  failure cannot become a workflow failure — verified by test.

Robustness against the situations Phase 5 calls out:

| Situation | How it is handled |
| --------- | ----------------- |
| Multiple / rapid consecutive failures | Tracker counts them; policy `first-only` can suppress repeats; the controller **reuses** one panel and resets its dismiss timer (no stacking) |
| Concurrent tasks | Detector correlates by `TaskExecution`; tracker keys by `source::workspace::name`, so operations stay independent |
| Task cancellation | Maps to `cancelled`; reacts only if `treatCancellationAsFailure` is enabled |
| Extension reload / shutdown | All listeners, the panel and its timer are `Disposable` on `context.subscriptions`; re-activation rewires cleanly |
| WebView disposal | Controller clears `panel`/timer/listeners on `onDidDispose`; the next reaction recreates it |
| Audio / UI failure | WebView reveals a "Play sound" fallback; any host-side error is contained by the controller and the orchestrator |

End-to-end verification (run a real failing task in the Extension Development
Host and see the cat) is a manual step for this phase; automated end-to-end
coverage of the whole loop now exists in the integration suite
(`endToEnd.test.ts`, added in Phase 11 — see §7).

### User configuration (Phase 6 — implemented)

`src/config/` gives SkillIssue a single, live, typed view of the user's settings.
It follows the same pure/adapter split as the rest of the codebase.

| File | Provides | Imports `vscode`? |
| ---- | -------- | ----------------- |
| `settings.ts` | The pure mapping `toSkillIssueSettings(raw)` (coerce, clamp, validate loosely-typed JSON), `SkillIssueSettings`, and the defaults | **No** |
| `skillIssueConfig.ts` | `SkillIssueConfig` — the **only** reader of `workspace.getConfiguration`; caches typed settings, refreshes on `onDidChangeConfiguration`, fires `onDidChange` | Yes |

Design decisions:

* **Interpretation is pure; only the reader touches `vscode`.** VS Code hands back
  loosely-typed, hand-editable JSON, so `settings.ts` treats every raw value as
  `unknown` and coerces/clamps it into a strongly-typed `SkillIssueSettings`
  (volume clamped to `[0,1]`, durations never negative, invalid operation kinds
  dropped, blank list entries trimmed). All defaults and validation rules are unit
  tested without VS Code.
* **Settings are organised by user intent**, not internal variables: `enabled`,
  `sound.enabled`, `sound.volume`, `reaction.durationSeconds`,
  `reaction.cooldownSeconds`, `workflows.monitoredKinds` / `include` / `exclude` /
  `treatCancellationAsFailure` / `treatUnknownAsFailure`, and `repeatedFailures`.
  The internal `reactOnFailure` flag is deliberately **not** exposed — `enabled`
  is the master switch.
* **One centralised reader.** `SkillIssueConfig` is the single place that calls
  `getConfiguration('skillissue')`; every consumer pulls typed settings from it, so
  configuration is never scattered across features.
* **Changes apply live, without a rebuild or reload.** The config caches the typed
  result and re-reads on `onDidChangeConfiguration` (filtered by
  `affectsConfiguration`). Consumers pull per use, so a change is immediate:
  * the orchestrator reads `policy` and `cooldownMs` **per event**;
  * the controller reads `soundEnabled` / `volume` / `durationMs` **per reaction**
    through a provider;
  * a settings change also calls `reaction.refresh()`, closing any open panel so
    the next reaction rebuilds its markup with the fresh sound/volume settings.
* **The Phase 3 contract is unchanged.** `settings.ts` produces the exact
  `ReactionPolicySettings` the policy already consumes, so wiring real
  configuration in Phase 6 required **no** change to the policy or the
  orchestrator's decision logic — only to `extension.ts`, which now supplies
  `config.read().policy` instead of the defaults.

### Robust failure detection (Phase 7 — implemented)

Phase 7 hardens detection for realistic JavaScript/TypeScript workflows (Jest,
`tsc`, Next.js, ESLint, npm/pnpm/yarn scripts, VS Code tasks) **without** a giant
hardcoded command list. The guiding principle from the plan: *care primarily about
execution outcome, and use the information VS Code already exposes.*

* **Outcome first.** Whether SkillIssue reacts is still decided by the process
  **exit code** (`onDidEndTaskProcess.exitCode`) via `outcomeFromExitCode` — never
  by parsing terminal text, so it is independent of shell, locale or project
  layout. `0` → success, non-zero → failure(code), code-less → `unknown`.
* **Kind is metadata, not a gate.** `OperationKind` only matters when a user
  narrows `monitoredKinds`; the default monitors every kind. A mis-classification
  can therefore never suppress a reaction out of the box, and an unrecognised task
  safely resolves to `Unknown`.
* **Classification uses VS Code's own structured signals, strongest-first.**
  `classifyTaskKind` consults, in order: `definition.type` (provider type — `tsc`,
  `eslint`, `npm`, `gulp`…), the task **`group`** (`test`/`build`/`rebuild`/`clean`
  — VS Code's own semantic label), the attached **`problemMatchers`** (`$tsc`,
  `$eslint`, `$jest`…), the provider **`source`** (`npm`, `TypeScript`, `gulp`…),
  and finally a **small, bounded** tool-token heuristic (whole-token matches for
  `jest`, `eslint`, `tsc`, `webpack`…). No signal → `Unknown`.
* **Package-manager tasks are refined by script name.** For `npm`/`pnpm`/`yarn`
  tasks the semantic script name (`test`, `build`, `lint`, `typecheck`) picks the
  kind; anything else stays the generic `Script`. This uses the script the provider
  already exposes, not the full command line.
* **Ambiguity is refused, not guessed.** Tools that double as dev servers (`next`,
  `vite`, `node`) are intentionally **not** force-classified — they resolve to
  `Unknown` rather than a wrong `Build`, keeping behaviour predictable.

Edge cases investigated and how each is handled (gracefully, and documented where
VS Code cannot support more):

| Edge case | Handling |
| --------- | -------- |
| Command returns non-zero intentionally | Indistinguishable from failure by design; the user excludes it by name (`workflows.exclude`) or narrows `monitoredKinds`. Documented, not guessed. |
| Cancelled task | The Tasks API exposes no reliable "cancelled" flag; a code-less ending maps to `unknown` and does **not** react unless `treatCancellationAsFailure` is enabled. |
| Background task / long-running dev server | Observed like any task; a code-less termination maps to `unknown` (no reaction by default). Watch-mode errors that never terminate the process produce no end event and are therefore not detected — documented limitation. |
| Compound tasks / dependencies | VS Code runs each sub-task as its own process, so each fires its own start/end and is judged independently on its own exit code. |
| Multiple simultaneous tasks | Correlated by `TaskExecution` identity and keyed by `source::workspace::name`, so concurrent runs never cross-contaminate. |
| Task reruns | A rerun is a fresh process with its own exit code; `operationKey` excludes the per-run id, so the tracker treats it as the same logical operation (repeat rules apply). |
| Shell differences (sh/bash/pwsh/zsh) | Only the exit code is consumed, never shell-specific output, so behaviour does not depend on the shell. |
| Windows / macOS / Linux | No platform-specific parsing; the token heuristic strips path separators (`/` and `\`) and executable extensions (`.cmd`, `.bat`, `.exe`). |
| Ad-hoc terminal commands (not tasks) | Still **not** detected — they never flow through the Tasks API, and shell-integration exit codes need an API newer than the 1.90 baseline. Documented limitation, not papered over. |

### Meme experience polish (Phase 8 — implemented)

Phase 8 is a UX pass with one rule: **funny, never disruptive** — “LOL, my build
failed and the cat laughed”, not “WHY IS THIS THING TAKING OVER MY SCREEN?”. The
experience was evaluated against timing, animation, sound, hierarchy, size,
positioning, dismissal, repeats and “can I keep working?”. Decisions:

* **It never takes focus.** The panel is created and revealed with
  `preserveFocus: true`, so the developer's cursor stays exactly where it was —
  they can keep typing immediately. The cat is glanceable, not modal.
* **It gets out of the way.** A single centered card (max 440px, GIF max 300px)
  auto-dismisses after `reaction.durationSeconds` (default 5s; `0` keeps it until
  dismissed). Re-triggering resets the timer rather than stacking panels.
* **One panel, reused.** At most one reaction panel exists; a repeat failure
  reveals and replays it instead of opening another tab, so failures never pile up
  visually.
* **Repeats are acknowledged, not spammed.** The orchestrator threads the tracker's
  `consecutiveFailures` through the `ReactionRequest` seam and the view shows a
  subtle “×N” badge for a streak (N ≥ 2). A run of failures reads as a deliberate
  running gag (“Skill Issue ×3”) rather than a stuck meme. For tighter control the
  `reaction.cooldownSeconds` and `repeatedFailures: first-only` settings (Phase 6)
  dial the frequency down.
* **Sound is honest and bounded.** Audio plays at `sound.volume` (default full,
  configurable down to mute) and can be silenced entirely with `sound.enabled`. If
  Chromium blocks the gesture-less `play()`, a “Play sound” control and a note
  appear instead of failing silently.
* **Animation respects the user.** `prefers-reduced-motion` swaps the animated GIF
  for the static poster and disables the entrance pop; otherwise the GIF restarts
  from frame 0 on each reaction.
* **Dismissal is effortless.** A Dismiss button, the panel's own tab close, the
  auto-dismiss timer, and now the **Escape** key (when the panel has focus) all
  wave the cat away.
* **No new visual complexity.** The polish reuses the existing assets and layout;
  the only addition is the small repeat badge — nothing that competes with the joke
  or the developer's work.

### Testing & reliability (Phase 9 — implemented)

Phase 9 hardened the suite into something that actually runs and catches
regressions, and closed two latent defects that had left the integration tier
silently non-functional.

* **Behaviour over implementation.** Tests assert observable outcomes — an exit
  code becomes the right `OperationOutcome`, a failure streak threads its `×N`
  count into the view, a throwing `ReactionSink` never propagates out of the
  orchestrator — not that a particular private method was called. The two hard
  invariants (strictly observational; a meme failure never becomes a workflow
  failure) are covered directly by the orchestration error-containment tests.
* **Detection extraction is now pure.** The task → `TaskInfo` mapping
  (`buildTaskInfo`, `commandFromDefinition`, `workspaceFolderName`) moved out of
  the `vscode` adapter into `detection/taskMapping`, behind a VS Code-free
  `TaskSnapshot` structural type. `TaskDetector.toTaskInfo` is now a one-line
  delegation, so field extraction is unit-testable offline and the adapter stays
  thin.
* **Integration runner fixed.** Two defects made every integration test throw
  `describe is not defined`: `@vscode/test-cli` needs the companion
  `@vscode/test-electron` package installed by the *consumer* (it is a dev-, not
  runtime, dependency of the CLI), and the CLI defaults its Mocha runner to the
  **tdd** UI while SkillIssue's tests are written **bdd**. `.vscode-test.mjs` now
  pins `ui: 'bdd'`. Both tiers are green: **143 unit + 14 integration**.
* **VS Code-specific wiring is covered for real.** Inside a live Extension
  Development Host the suite verifies activation + contributed commands, the
  WebView panel open/reuse/dispose lifecycle, detector subscription/disposal
  safety, and `SkillIssueConfig` reading typed settings and reloading live on
  `onDidChangeConfiguration` (writing to the isolated **Global** target that
  `@vscode/test-cli` sandboxes in a throwaway `--user-data-dir`).

### Production readiness (Phase 10 — implemented)

Phase 10 turned the working prototype into something that can be packaged and
installed, and reviewed it end-to-end for publishing.

* **It packages and installs.** `vsce package` (wired to `npm run package`)
  produces `skillissue-0.0.1.vsix` — **30 files, ~4 MB** — verified to install
  cleanly into a throwaway VS Code profile (`code --install-extension` →
  `skillissue.skillissue@0.0.1`). The VSIX ships only the compiled `out/` code,
  the media and the store metadata; `.vscodeignore` keeps `src/`, tests, source
  maps, `docs/`, `.tsbuildinfo` and the dev plan out.
* **Size is dominated by the meme.** The 3 MB laughing-cat GIF is ~75% of the
  VSIX and the 1024×1024 original icon another ~0.8 MB. That is inherent to a
  media-first novelty extension; the shipped JavaScript is ~70 KB total. (The icon
  could be downscaled to ~100 KB with an image tool if size ever matters.)
* **A real store icon.** `assets/icon.png` is **original generated artwork** (not
  the copyrighted meme photo), wired through the manifest `icon` field, so the
  Extensions view and Marketplace show a proper logo.
* **Manifest reviewed.** No unnecessary permissions; activation stays
  `onStartupFinished` (lazy, but early enough to observe tasks — see §4); zero
  runtime dependencies; one `contributes.configuration` schema and two commands.
  No `repository` is declared yet (packaging uses `--allow-missing-repository`),
  so the README's internal references are plain text rather than relative links
  that would break in the packaged listing.
* **Licensing is honest.** The code is MIT; the bundled cat-meme GIF/MP3/PNG are
  third-party media of unclear provenance, documented in the README as requiring
  rights clearance (or replacement) before any public publish. `CHANGELOG.md`
  follows Keep-a-Changelog.

### Final product review (Phase 11 — implemented)

Phase 11 was a pre-publish review of the whole extension — every source file and
the complete reaction lifecycle — looking for anything that would make it feel
unreliable, annoying, fragile or unfinished. The production code needed no
changes: the layering, disposal ordering, timer cleanup, error containment and
WebView security (strict CSP, per-render nonce, HTML escaping and
`localResourceRoots`) all held up under review.

* **The lifecycle is verified against its edge cases.** Repeated failures (the
  `×N` streak badge and `first-only` suppression), concurrent operations (keyed
  `source::workspace::name`), cancellation, the cooldown gate, live config
  changes, disabling SkillIssue and muting audio each have deterministic unit
  tests; panel open/reuse/dispose, dispose-after-dispose and react-after-dispose
  are covered inside a real VS Code host.
* **One genuine gap was closed.** `detection.test.ts` had long promised an
  end-to-end test "added in Phase 9" that never actually existed. Phase 11 added
  `endToEnd.test.ts`: it executes a real `ShellExecution('exit 3')` task in the
  Extension Development Host and asserts the failure flows through
  detector → policy → reaction into exactly one reaction naming the task and its
  real exit code. It is the strongest assertion in the suite — the core promise
  proven against the live Tasks API rather than a mock (~0.6 s, stable across
  runs), taking the integration tier to **15**.
* **No scope creep.** The review corrected the stale promise and added the
  missing coverage; it introduced no new features.

---

## 4. Extension lifecycle & composition

* `activate()` is the **composition root**: it constructs the logger, the
  configuration reader (`SkillIssueConfig`), the reaction controller
  (`CatReactionController`, reading presentation settings live from config), the
  pure orchestrator (`SkillIssueOrchestrator`, wired with the controller as its
  `ReactionSink` and config-backed settings/cooldown providers) and the detector —
  then subscribes the detector's events to the orchestrator, refreshes the
  reaction on a settings change, and pushes every disposable into
  `context.subscriptions`.
* Everything that owns a listener, timer, WebView or channel is
  **`Disposable`** and registered for automatic teardown. No module keeps global
  mutable state.
* `deactivate()` stays empty while all resources are owned by
  `context.subscriptions`.

### Activation timing

* The extension must be active **before** a task runs in order to observe it, so
  as of **Phase 2** it declares `activationEvents: ["onStartupFinished"]`. This
  activates lazily (after startup, not on `*`) while still being early enough to
  catch workflows. The contributed `skillissue.about` command additionally gets
  an implicit `onCommand` activation.
* Detection is passive: activation only registers listeners; nothing runs until
  the developer triggers a task.

---

## 5. Media packaging

Product media (cat GIF, laughing audio, poster PNG) and the original store
`icon.png` live in `assets/` and are shipped inside the VSIX. `.vscodeignore`
excludes development-only files (sources, tests, configs, source maps,
`.tsbuildinfo`, `assets/Prompt.md`) but keeps the media.

WebView media is exposed through `Webview.asWebviewUri(...)` with a
`localResourceRoots` restriction — never a raw `file://` path. Implemented in
Phase 4: `CatReactionController` limits the resource roots to `assets/` and
resolves the GIF, audio and poster through `asWebviewUri`.

---

## 6. Configuration strategy

* User-facing settings are contributed via `package.json →
  contributes.configuration` and read through a single centralised `config/`
  module (implemented in Phase 6), never scattered across features.
* Settings are designed around **user intent** (enabled, sound, volume,
  duration, monitored workflows, include/exclude, cooldown) rather than internal
  variables; the internal `reactOnFailure` flag is not exposed.
* Changing settings does not require a rebuild: `SkillIssueConfig` reacts to
  `onDidChangeConfiguration`, and consumers pull the typed settings per use, so a
  change takes effect on the next reaction. See the Phase 6 subsection in §3.

---

## 7. Testing strategy

Two tiers, chosen so most behaviour is verifiable **without** a real developer
workflow. As of Phase 11 both run green: **143 unit + 15 integration** tests.

1. **Unit tests** (`src/test/unit/**`, Mocha, `.mocharc.json`) — pure logic,
   **no `vscode` import**. Fast, offline, deterministic. This is where `core/`,
   `policy/`, `config/` mapping, `reaction/` markup, `orchestration/` and the
   `detection/taskMapping` extraction + classification are covered.
2. **Integration tests** (`src/test/integration/**`, `@vscode/test-cli` +
   `@vscode/test-electron`, `.vscode-test.mjs`) — run inside a real VS Code
   Extension Development Host; cover activation and contributed commands, the
   WebView panel lifecycle, detector subscription/disposal, live settings reload
   against the actual API, and — in `endToEnd.test.ts` — a real failing task
   driven through the entire detection → policy → reaction loop.

Both tiers use Mocha's **BDD** interface (`describe`/`it`) and Node's built-in
`node:assert/strict`, avoiding an extra assertion dependency. Note that
`@vscode/test-cli` defaults its runner to the **tdd** UI, so `.vscode-test.mjs`
pins `ui: 'bdd'`; without it every integration test fails to load.

Integration tests download VS Code on first run and need a display; on headless
CI they should run under `xvfb-run`. They write only to the isolated
`--user-data-dir` that `@vscode/test-cli` provisions, never a developer's real
settings.

---

## 8. Toolchain & version alignment (decided Phase 0)

| Concern | Decision | Rationale |
| ------- | -------- | --------- |
| VS Code engine | `^1.90.0` | Broad, still-supported baseline; bundles Node 20 |
| `@types/vscode` | `1.90.0` (exact) | Types pinned **≤ engine** so we cannot accidentally use newer APIs |
| Node (development) | **22.x LTS** | `@vscode/test-cli` requires Node ≥ 22; compile/unit tests also work on Node ≥ 20.9 |
| Node (extension runtime) | **20.x** | VS Code 1.90 bundles Node 20; the extension runs on this, not on the dev Node |
| `@types/node` | `^20` | Typed for the **oldest supported runtime** (VS Code 1.90 → Node 20) so no newer API leaks in |
| Test framework | Mocha `11.x` | Single deduped copy shared by the unit suite and `@vscode/test-cli` |
| Integration runner | `@vscode/test-cli` `0.0.15` | Modern, config-driven in-VS Code test runner |
| ↳ runner companion | `@vscode/test-electron` `^3` | Downloads/launches VS Code for the CLI; a *dev* dep of the CLI, so the consumer must install it (added Phase 9) |
| Packaging | `@vscode/vsce` | Official VSIX packager (`npm run package`); dev-only (added Phase 10) |
| TypeScript | `5.9.x` | Mature, stable line (not the bleeding-edge major) |
| Module system | CommonJS (`module: commonjs`) | Simplest, most compatible for a tsc-built desktop extension |
| Linting | ESLint 9 + `typescript-eslint` 8, flat config | Current stable, well-supported combination |
| Bundler | **None** (plain `tsc`) | Keeps the dependency footprint minimal; revisit only if Phase 10 needs it |

**Strict TypeScript** is enabled (`strict`, `noUnusedLocals`,
`noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`).

### Dependency & advisory posture

* **Zero runtime dependencies.** Everything in `package.json` is a
  `devDependency`; the packaged VSIX ships no third-party Node code.
* **Integration tests need `@vscode/test-electron`.** `@vscode/test-cli` declares
  it as a *devDependency*, which npm does not install transitively, so it is
  listed explicitly here (added in Phase 9). Without it `vscode-test` cannot
  resolve a runner and fails before VS Code ever launches.
* `npm audit` currently reports advisories in Mocha's own leaf deps (`diff`,
  `serialize-javascript`). These are **dev-only**, are excluded from the VSIX,
  and have no exploit path inside a test runner (they concern parsing untrusted
  patches / serializing untrusted functions). They will be cleared by moving to
  Mocha 12 once `@vscode/test-cli` supports it — do **not** force that today
  with risky `overrides` that could break the integration runner.
* ESLint is pinned to **9.x** because `typescript-eslint` 8.x does not yet
  support ESLint 10. Bump both together when that changes.

---

## 9. Discovered constraints & limitations

This section accumulates real VS Code limitations discovered during
implementation (Phase 2 onward). Known-ahead-of-time items:

* **Terminal text is not a reliable success signal.** Confirmed in Phase 2:
  SkillIssue uses the Tasks API's `exitCode` instead of parsing terminal output.
* **Not every execution path exposes an exit code.** Ad-hoc integrated-terminal
  commands are not tasks and are not detected; a code-less task ending maps to
  `unknown` rather than a guessed result. Phase 7 confirmed task *classification*
  is solvable from VS Code's structured metadata, but terminal-typed commands still
  need shell-integration exit codes (an API newer than the 1.90 baseline), so they
  remain a documented limitation rather than something papered over.
* **Background/watch tasks only report on process end.** A dev server that keeps
  running and prints errors without exiting produces no `onDidEndTaskProcess`, so
  in-watch failures are not observed. Confirmed in Phase 7 and documented rather
  than simulated from terminal text.
* **WebViews are sandboxed.** They cannot read the filesystem or use Node, which
  is why media must be served via `asWebviewUri`.
* **No true overlay above the workbench.** Extensions cannot draw a z-layer over
  the VS Code UI, so the reaction is a `WebviewPanel` (a centered, themed,
  auto-dismissing card) rather than a floating overlay. Confirmed in Phase 4.
* **WebView audio autoplay can be gesture-gated.** Chromium may reject a
  programmatic `audio.play()` without user interaction; Phase 4 handles the
  rejection by revealing an explicit "Play sound" control instead of failing.
* **Integration tests need a real desktop session.** `@vscode/test-cli`
  downloads VS Code and launches Electron, which requires a display and a
  writable temp/user-data directory. They cannot run in a fully
  sandboxed/headless environment without a virtual framebuffer (`xvfb-run`) and
  a writable `/tmp`. Unit tests have no such requirement.

---

## 10. Design principles carried forward

* Clear boundaries between VS Code integration and application logic.
* Small, cohesive modules; explicit state; predictable lifecycle.
* Configuration-driven behaviour; graceful degradation.
* No speculative abstractions, no unnecessary dependencies, no network calls,
  no telemetry. SkillIssue stays a local extension.
* The core loop must remain understandable at a glance:
  **Failure → SkillIssue → laughing cat.**
