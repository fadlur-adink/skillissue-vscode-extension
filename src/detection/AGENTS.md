# Detection — VS Code events → domain events

## OVERVIEW

Two thin `vscode` adapters (`taskDetector`, `terminalDetector`) subscribe to Task and shell-execution events, delegate all decision logic to pure mapping modules, and re-emit `WorkflowEvent`s through `EventEmitter`s.

## WHERE TO LOOK

| File | Role |
|------|------|
| `taskDetector.ts` | Tasks API adapter; `onDidStartTaskProcess`/`onDidEndTaskProcess` → domain events |
| `taskMapping.ts` | pure: `outcomeFromExitCode`, `classifyTaskKind`, `buildTaskInfo`, `buildTaskOperation`, `kindFromScriptName` |
| `terminalDetector.ts` | shell-execution API adapter via local structural shim + `typeof === 'function'` guard |
| `commandMapping.ts` | pure: `classifyCommandLine`, `terminalWorkflowEvent`, `summarizeCommand` |
| `../test/unit/detection/{taskMapping,commandMapping}.test.ts` | pure classifier/outcome coverage |
| `../test/integration/{detection,terminalDetection,endToEnd}.test.ts` | adapter lifecycle + full loop |

## CONVENTIONS

- **Pure / adapter split.** `taskMapping.ts` and `commandMapping.ts` import nothing from `vscode`; they operate on a structural `TaskSnapshot` and a plain command-line string so they unit-test offline. The detectors only extract fields and manage listener lifecycle.
- **Outcome comes from the exit code, nothing else.** `outcomeFromExitCode`: `0` → `success`, non-zero → `failure(code)`, `undefined`/`null` → `unknown`. No terminal text is read.
- **Classification is structured-metadata-driven, strongest-first.** `classifyTaskKind` consults `definition.type` → `group` → `problemMatchers` → `source` → bounded tool-token heuristic, taking the first confident hit. `npm`/`pnpm`/`yarn` are refined by `kindFromScriptName`.
- **Shared script-name heuristic.** `commandMapping.ts` imports `kindFromScriptName` so `npm test` typed in a terminal classifies exactly like an npm task.
- **Noise control in the terminal.** Only build/test/lint/compile-looking commands classify; everything else is `Unknown` and `terminalWorkflowEvent` returns `undefined` so the detector emits nothing.
- **Reuse the outcome helper across detectors.** Both paths map exit codes through `outcomeFromExitCode`; terminal exit codes are read defensively (`toExitCode`: non-finite/`NaN` → `undefined`).

## ANTI-PATTERNS

- **Don't raise the `@types/vscode` pin for `onDidEndTerminalShellExecution`.** It post-dates 1.90; use the local structural shim + `typeof === 'function'` guard so the feature degrades to a no-op instead of throwing.
- **Don't emit events for `Unknown` terminal commands.** `terminalWorkflowEvent` returning `undefined` is the stay-silent contract; callers must not re-check the kind.
- **Don't classify dev servers.** `next dev`/`vite` without `build` are `Unknown`; a long-running server never reports a meaningful end exit code and reacting to it is noise (`SUBCOMMAND_TOOLS`).
- **Don't guess code-less endings.** A task ending without an exit code is `unknown`, never `cancelled` (VS Code does not reliably distinguish user cancellation).
- **Don't force-classify ambiguous tools.** `next`, `vite`, `node` are deliberately not mapped by the generic token heuristic.

## NOTES

- **Disposal clears in-flight state.** `TaskDetector.dispose()` disposes the emitter + both listeners and `inFlight.clear()`; `TerminalExecutionDetector.dispose()` splices its disposables. Both are safe to dispose more than once (covered by integration tests).
- **Start-miss fallback.** `TaskDetector.handleEnd` reconstructs the operation if the start event was missed (extension activated mid-task).
- **Terminal detection is a progressive enhancement.** It reports `available === false` and no-ops without shell integration; `isEnabled` reads `workflows.detectTerminalCommands` per event (wired in `extension.ts`).
- **Tests never execute a real terminal command.** The shell-execution end event only fires with shell integration active, which is environment-dependent and would flake. Classification is covered by pure unit tests; the full event→policy→reaction loop by `endToEnd.test.ts`.
