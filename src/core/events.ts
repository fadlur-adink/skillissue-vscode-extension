import { Operation } from './operation';
import { OperationOutcome } from './outcome';

/**
 * Lifecycle events produced by a detection layer and consumed by the rest of
 * SkillIssue. Modelling them explicitly keeps "something happened" separate from
 * "something failed and deserves a reaction".
 */

/** Emitted when an operation begins. */
export interface OperationStarted {
  readonly type: 'started';
  readonly operation: Operation;
}

/** Emitted when an operation finishes with a known (or unknown) outcome. */
export interface OperationCompleted {
  readonly type: 'completed';
  readonly operation: Operation;
  readonly outcome: OperationOutcome;
  /** Epoch milliseconds when the operation finished. */
  readonly finishedAt: number;
}

/** Any workflow lifecycle event. */
export type WorkflowEvent = OperationStarted | OperationCompleted;

export function operationStarted(operation: Operation): OperationStarted {
  return { type: 'started', operation };
}

export function operationCompleted(
  operation: Operation,
  outcome: OperationOutcome,
  finishedAt: number,
): OperationCompleted {
  return { type: 'completed', operation, outcome, finishedAt };
}

export function isCompletedEvent(event: WorkflowEvent): event is OperationCompleted {
  return event.type === 'completed';
}

export function isStartedEvent(event: WorkflowEvent): event is OperationStarted {
  return event.type === 'started';
}
