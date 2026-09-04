import { createOperation, Operation, OperationKind } from '../core/operation';
import { failure, OperationOutcome, success, unknown } from '../core/outcome';

/**
 * Pure translation from VS Code task signals into SkillIssue domain values.
 *
 * Everything here is free of any `vscode` import so it can be unit tested
 * directly. The VS Code wiring lives in `taskDetector.ts`, which extracts a
 * {@link TaskInfo} from a real task and delegates all decisions to this module.
 */

/** A VS Code-free snapshot of the task fields the detector cares about. */
export interface TaskInfo {
  /** Correlation/unique id for this specific run. */
  readonly runId: string;
  /** The task's display name. */
  readonly name: string;
  /** `task.definition.type`, e.g. `"npm"`, `"shell"`, `"process"`, `"tsc"`. */
  readonly definitionType?: string;
  /** `task.group?.id` — VS Code's own grouping (`test` / `build` / `rebuild` / `clean`). */
  readonly group?: string;
  /** `task.source` — the provider origin, e.g. `"npm"`, `"TypeScript"`, `"gulp"`. */
  readonly source?: string;
  /** `task.problemMatchers`, e.g. `['$tsc']` / `['$eslint']` — a hint at the tool run. */
  readonly problemMatchers?: readonly string[];
  /** The command/script token from the definition (npm script name or shell executable). */
  readonly command?: string;
  /** `task.isBackground` — true for long-running tasks such as dev servers. */
  readonly isBackground?: boolean;
  /** Workspace folder name the task is scoped to, when applicable. */
  readonly workspaceFolder?: string;
  /** Epoch milliseconds when the task process started. */
  readonly startedAt: number;
}

/**
 * The structural slice of a VS Code `Task` that {@link buildTaskInfo} reads.
 *
 * Declaring it here — instead of importing `vscode.Task` — keeps this module free
 * of the VS Code API so the whole extraction is unit-testable offline. A real
 * `vscode.Task` satisfies this shape structurally, so the detector passes one
 * straight through with no cast and no coupling.
 */
export interface TaskSnapshot {
  readonly name: string;
  readonly source?: string;
  readonly isBackground?: boolean;
  readonly problemMatchers?: readonly string[];
  readonly group?: { readonly id?: string };
  readonly definition?: {
    readonly type?: string;
    readonly command?: unknown;
    readonly script?: unknown;
  };
  /** `task.scope`: a `WorkspaceFolder` (has a `name`) or a numeric `TaskScope`. */
  readonly scope?: { readonly name?: string } | number;
}

/**
 * Extracts the SkillIssue {@link TaskInfo} from a VS Code task.
 *
 * This is the single, pure place that knows which task fields matter; the
 * detector only supplies the run id and the start time. Everything read here is
 * structured metadata VS Code already exposes — no terminal text is parsed and no
 * command list is maintained.
 */
export function buildTaskInfo(task: TaskSnapshot, runId: string, startedAt: number): TaskInfo {
  return {
    runId,
    name: task.name,
    definitionType: task.definition?.type,
    group: task.group?.id,
    source: task.source,
    problemMatchers: task.problemMatchers,
    command: commandFromDefinition(task.definition),
    isBackground: task.isBackground,
    workspaceFolder: workspaceFolderName(task.scope),
    startedAt,
  };
}

/**
 * Reads the command/script token VS Code exposes on a task definition without
 * assuming a particular provider: npm-style tasks carry the script name under
 * `script`/`command`, shell and process tasks carry the executable under
 * `command`. The definition is loosely typed, so the value is validated as a
 * non-empty string and otherwise ignored (classification then fails to Unknown).
 */
export function commandFromDefinition(
  definition: TaskSnapshot['definition'],
): string | undefined {
  if (!definition) {
    return undefined;
  }
  const candidate: unknown = definition.command ?? definition.script;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

/** Extracts the workspace folder name from a task's scope, if it has one. */
export function workspaceFolderName(scope: TaskSnapshot['scope']): string | undefined {
  return scope !== undefined && typeof scope === 'object' ? scope.name : undefined;
}

/**
 * Maps a task process exit code to a domain {@link OperationOutcome}.
 *
 * The Tasks API reports `exitCode` as `number | undefined`. `undefined` means the
 * process ended without reporting a code (typically killed/terminated). VS Code
 * does **not** reliably distinguish a deliberate user cancellation from other
 * code-less endings, so those are surfaced honestly as `unknown` rather than
 * guessed at. (See ARCHITECTURE.md → discovered limitations.)
 */
export function outcomeFromExitCode(exitCode: number | undefined | null): OperationOutcome {
  if (exitCode === undefined || exitCode === null) {
    return unknown('task ended without an exit code');
  }
  return exitCode === 0 ? success() : failure(exitCode);
}

/**
 * Best-effort semantic classification of a task, driven by the structured
 * metadata VS Code **already exposes** — not a hardcoded list of command lines.
 *
 * Signals are consulted strongest-first and the first confident answer wins:
 *
 * 1. `definition.type` — the provider's own type (`tsc`, `eslint`, `npm`, `gulp`,
 *    …). Package-manager tasks are refined by their script name.
 * 2. `group` — VS Code's task grouping (`test` / `build` / `rebuild` / `clean`),
 *    chosen by the user or provider. This is the most reliable "what the user
 *    considers this task" signal and needs no command knowledge at all.
 * 3. `problemMatchers` — attached matchers (`$tsc`, `$eslint`, `$jest`, …) reveal
 *    which tool the task runs.
 * 4. `source` — the provider origin (`npm`, `TypeScript`, `gulp`, …).
 * 5. the command/script token — a **small, bounded** last-resort heuristic over
 *    well-known JS/TS tool names, matched as whole tokens to avoid false hits.
 *
 * Anything unrecognised resolves to {@link OperationKind.Unknown} rather than a
 * guess. SkillIssue cares primarily about the *outcome*; `kind` only matters when
 * a user narrows `monitoredKinds`, and failing to Unknown is safe because the
 * default policy monitors every kind. Ambiguous tools that double as dev servers
 * (`next`, `vite`, `node`) are deliberately **not** force-classified.
 */
export function classifyTaskKind(info: TaskInfo): OperationKind {
  return (
    kindFromDefinitionType(info) ??
    kindFromGroup(info.group) ??
    kindFromProblemMatchers(info.problemMatchers) ??
    kindFromSource(info.source, info.command) ??
    kindFromCommandToken(info.command) ??
    OperationKind.Unknown
  );
}

/** Package-manager task types whose script name refines the kind. */
const PACKAGE_MANAGER_TYPES = new Set(['npm', 'pnpm', 'yarn']);

function kindFromDefinitionType(info: TaskInfo): OperationKind | undefined {
  const type = info.definitionType?.toLowerCase();
  switch (type) {
    case 'tsc':
    case 'typescript':
      return OperationKind.Compile;
    case 'eslint':
      return OperationKind.Lint;
    case 'gulp':
    case 'grunt':
      return OperationKind.Build;
    default:
      break;
  }
  if (type !== undefined && PACKAGE_MANAGER_TYPES.has(type)) {
    // A package-manager task runs a script; classify from the (semantic) script
    // name and fall back to the generic Script kind when the name says nothing.
    return kindFromScriptName(info.command) ?? OperationKind.Script;
  }
  return undefined;
}

function kindFromGroup(group: string | undefined): OperationKind | undefined {
  switch (group?.toLowerCase()) {
    case 'test':
      return OperationKind.Test;
    case 'build':
    case 'rebuild':
    case 'clean':
      return OperationKind.Build;
    default:
      return undefined;
  }
}

function kindFromProblemMatchers(
  matchers: readonly string[] | undefined,
): OperationKind | undefined {
  if (!matchers || matchers.length === 0) {
    return undefined;
  }
  const tokens = tokenize(matchers.join(' '));
  if (matchesAny(tokens, ['tsc', 'tscheck', 'typescript'])) {
    return OperationKind.Compile;
  }
  if (matchesAny(tokens, ['eslint', 'stylelint', 'biome', 'tslint'])) {
    return OperationKind.Lint;
  }
  if (matchesAny(tokens, ['jest', 'vitest', 'mocha', 'karma'])) {
    return OperationKind.Test;
  }
  return undefined;
}

function kindFromSource(
  source: string | undefined,
  command: string | undefined,
): OperationKind | undefined {
  const value = source?.toLowerCase();
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  if (value.includes('typescript') || value === 'tsc') {
    return OperationKind.Compile;
  }
  if (value.includes('eslint')) {
    return OperationKind.Lint;
  }
  if (value.includes('gulp') || value.includes('grunt')) {
    return OperationKind.Build;
  }
  if (PACKAGE_MANAGER_TYPES.has(value)) {
    return kindFromScriptName(command) ?? OperationKind.Script;
  }
  return undefined;
}

/**
 * Classifies from an npm/pnpm/yarn **script name** (e.g. `test`, `build:prod`,
 * `lint`, `typecheck`). Script names are semantic by convention, so prefix/keyword
 * matching here is reliable and stays far from a list of command lines.
 */
function kindFromScriptName(script: string | undefined): OperationKind | undefined {
  const name = script?.trim().toLowerCase();
  if (!name) {
    return undefined;
  }
  if (name.startsWith('test') || name.startsWith('jest') || name.startsWith('vitest')) {
    return OperationKind.Test;
  }
  if (name.startsWith('lint') || name.startsWith('eslint')) {
    return OperationKind.Lint;
  }
  if (name.includes('typecheck') || name.includes('type-check') || name === 'tsc') {
    return OperationKind.Compile;
  }
  if (name.startsWith('build') || name.startsWith('compile')) {
    return OperationKind.Build;
  }
  return undefined;
}

/**
 * Last-resort classification from the executed command's tool token. Tokens are
 * matched whole (path- and extension-aware), so a substring can never cause a
 * false positive (e.g. `protest-tool` is not `test`).
 */
function kindFromCommandToken(command: string | undefined): OperationKind | undefined {
  const tokens = tokenize(command ?? '').map((token) =>
    token.replace(/\.(js|cjs|mjs|cmd|bat|exe|ts)$/, ''),
  );
  if (matchesAny(tokens, ['jest', 'vitest', 'mocha', 'karma', 'ava', 'cypress', 'playwright'])) {
    return OperationKind.Test;
  }
  if (matchesAny(tokens, ['eslint', 'tslint', 'stylelint', 'biome'])) {
    return OperationKind.Lint;
  }
  if (matchesAny(tokens, ['tsc'])) {
    return OperationKind.Compile;
  }
  if (matchesAny(tokens, ['webpack', 'rollup', 'parcel', 'esbuild', 'turbo'])) {
    return OperationKind.Build;
  }
  return undefined;
}

/** Splits on whitespace and path separators into lowercased alphanumeric tokens. */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[\s/\\]+/)
    .flatMap((part) => part.split(/[^a-z0-9]+/))
    .filter((token) => token.length > 0);
}

function matchesAny(tokens: readonly string[], needles: readonly string[]): boolean {
  return tokens.some((token) => needles.includes(token));
}

/** Builds the domain {@link Operation} for a task run. */
export function buildTaskOperation(info: TaskInfo): Operation {
  return createOperation({
    id: info.runId,
    name: info.name,
    startedAt: info.startedAt,
    kind: classifyTaskKind(info),
    source: 'task',
    workspaceFolder: info.workspaceFolder,
  });
}
