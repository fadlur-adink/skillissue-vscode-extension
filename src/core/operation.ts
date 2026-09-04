/**
 * The domain representation of a single development operation — a test run, a
 * build, a lint pass, a VS Code task, a package-manager script, and so on.
 *
 * Pure value types plus small factories. Detection layers (Phase 2) construct
 * these; policy (Phase 3) and reaction (Phase 4/5) layers consume them. There is
 * deliberately **no `vscode` dependency** here.
 */

/** Semantic category of what an operation *does* (independent of how it ran). */
export enum OperationKind {
  Test = 'test',
  Build = 'build',
  Compile = 'compile',
  Lint = 'lint',
  Script = 'script',
  Unknown = 'unknown',
}

/** Which execution path a detection layer observed the operation on. */
export type OperationSource = 'task' | 'terminal' | 'unknown';

export interface Operation {
  /** Unique id for this specific run (assigned by the detection layer). */
  readonly id: string;
  /** Human-readable label, e.g. the task name or command line. */
  readonly name: string;
  readonly kind: OperationKind;
  readonly source: OperationSource;
  /** Optional workspace folder the operation belongs to (name or fsPath). */
  readonly workspaceFolder?: string;
  /** Epoch milliseconds when the operation started. */
  readonly startedAt: number;
}

/** Constructor input for {@link createOperation}; optional fields get defaults. */
export interface OperationInit {
  readonly id: string;
  readonly name: string;
  readonly startedAt: number;
  readonly kind?: OperationKind;
  readonly source?: OperationSource;
  readonly workspaceFolder?: string;
}

/** Builds an {@link Operation}, applying sensible defaults. */
export function createOperation(init: OperationInit): Operation {
  const base: Operation = {
    id: init.id,
    name: init.name,
    startedAt: init.startedAt,
    kind: init.kind ?? OperationKind.Unknown,
    source: init.source ?? 'unknown',
  };
  return init.workspaceFolder === undefined
    ? base
    : { ...base, workspaceFolder: init.workspaceFolder };
}

/**
 * A stable identity for "the same logical operation" across separate runs, used
 * to reason about repeated failures. It deliberately **excludes** the per-run
 * `id` so that reruns of the same task/command collapse onto one key.
 */
export function operationKey(operation: Operation): string {
  return [operation.source, operation.workspaceFolder ?? '', operation.name].join('::');
}
