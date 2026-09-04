import { OperationCompleted } from './events';
import { Operation, operationKey } from './operation';
import { isFailure, OperationOutcome } from './outcome';

/** Aggregated, per-operation facts the rest of the app can reason about. */
export interface OperationStats {
  readonly key: string;
  readonly totalRuns: number;
  readonly consecutiveFailures: number;
  readonly lastOutcome?: OperationOutcome;
}

/** Returned by {@link WorkflowTracker.record} after a completion is observed. */
export interface RecordedCompletion {
  readonly key: string;
  readonly consecutiveFailures: number;
  /** True when this failure directly follows another failure of the same op. */
  readonly isRepeatFailure: boolean;
}

interface MutableStats {
  totalRuns: number;
  consecutiveFailures: number;
  lastOutcome: OperationOutcome;
}

/**
 * Remembers completed operations so SkillIssue can reason about *repeated*
 * failures.
 *
 * This is pure, explicit state: an instance owned by the extension, never a
 * module-level global. It reports **facts only** — deciding whether a repeated
 * failure should trigger (or suppress) a reaction belongs to the policy layer
 * (Phase 3), not here.
 *
 * Definition: `consecutiveFailures` increments on each {@link OutcomeKind.Failure}
 * and resets to `0` on any non-failure outcome (success, cancelled or unknown).
 */
export class WorkflowTracker {
  private readonly stats = new Map<string, MutableStats>();

  /** Records a completion and reports the updated repeat-failure facts. */
  record(event: OperationCompleted): RecordedCompletion {
    const key = operationKey(event.operation);
    const previous = this.stats.get(key);
    const failed = isFailure(event.outcome);
    const consecutiveFailures = failed ? (previous?.consecutiveFailures ?? 0) + 1 : 0;
    const totalRuns = (previous?.totalRuns ?? 0) + 1;

    this.stats.set(key, { totalRuns, consecutiveFailures, lastOutcome: event.outcome });

    return { key, consecutiveFailures, isRepeatFailure: failed && consecutiveFailures > 1 };
  }

  /** Snapshot of what is known about an operation, or `undefined` if unseen. */
  getStats(operation: Operation): OperationStats | undefined {
    const key = operationKey(operation);
    const entry = this.stats.get(key);
    return entry === undefined ? undefined : { key, ...entry };
  }

  /** Current consecutive-failure count for an operation (`0` if unseen). */
  getConsecutiveFailures(operation: Operation): number {
    return this.stats.get(operationKey(operation))?.consecutiveFailures ?? 0;
  }

  /** Forgets all tracked state. */
  reset(): void {
    this.stats.clear();
  }
}
