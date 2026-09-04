/**
 * Outcome model for a development operation.
 *
 * These are pure domain types with **no `vscode` dependency**, so they can be
 * produced by any detection mechanism (Phase 2) and consumed by the policy and
 * reaction layers, and unit tested in isolation.
 */

/** The coarse result category of an operation. */
export enum OutcomeKind {
  Success = 'success',
  Failure = 'failure',
  Cancelled = 'cancelled',
  Unknown = 'unknown',
}

export interface SuccessOutcome {
  readonly kind: OutcomeKind.Success;
}

export interface FailureOutcome {
  readonly kind: OutcomeKind.Failure;
  /** Process/task exit code, when the execution path exposed one. */
  readonly exitCode?: number;
}

export interface CancelledOutcome {
  readonly kind: OutcomeKind.Cancelled;
}

export interface UnknownOutcome {
  readonly kind: OutcomeKind.Unknown;
  /** Why the result could not be determined (e.g. "no exit code exposed"). */
  readonly reason?: string;
}

/** Discriminated union describing how an operation finished. */
export type OperationOutcome =
  | SuccessOutcome
  | FailureOutcome
  | CancelledOutcome
  | UnknownOutcome;

export function success(): SuccessOutcome {
  return { kind: OutcomeKind.Success };
}

export function failure(exitCode?: number): FailureOutcome {
  return exitCode === undefined
    ? { kind: OutcomeKind.Failure }
    : { kind: OutcomeKind.Failure, exitCode };
}

export function cancelled(): CancelledOutcome {
  return { kind: OutcomeKind.Cancelled };
}

export function unknown(reason?: string): UnknownOutcome {
  return reason === undefined
    ? { kind: OutcomeKind.Unknown }
    : { kind: OutcomeKind.Unknown, reason };
}

export function isSuccess(outcome: OperationOutcome): outcome is SuccessOutcome {
  return outcome.kind === OutcomeKind.Success;
}

export function isFailure(outcome: OperationOutcome): outcome is FailureOutcome {
  return outcome.kind === OutcomeKind.Failure;
}

export function isCancelled(outcome: OperationOutcome): outcome is CancelledOutcome {
  return outcome.kind === OutcomeKind.Cancelled;
}

export function isUnknown(outcome: OperationOutcome): outcome is UnknownOutcome {
  return outcome.kind === OutcomeKind.Unknown;
}
