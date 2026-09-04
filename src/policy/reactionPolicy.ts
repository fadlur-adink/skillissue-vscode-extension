import { Operation } from '../core/operation';
import { isCancelled, isFailure, isUnknown, OperationOutcome } from '../core/outcome';
import { ReactionPolicySettings } from './policySettings';

/**
 * The reaction policy: given what happened, decide *whether it matters*.
 *
 * Pure and deterministic — the same input plus settings always yields the same
 * decision. It knows nothing about cats, GIFs, audio, WebViews or how the outcome
 * was detected. Detection reports facts; this module judges them; the reaction
 * system (Phase 4/5) acts on the verdict.
 */

/** Everything the policy needs to decide, independent of any detection source. */
export interface PolicyInput {
  readonly operation: Operation;
  readonly outcome: OperationOutcome;
  /**
   * Consecutive-failure count for this operation, as reported by the tracker:
   * `1` for a first failure, `>1` for a repeat, `0` when not a failure.
   */
  readonly consecutiveFailures: number;
}

/** The deterministic answer to "should SkillIssue react?". */
export interface ReactionDecision {
  readonly react: boolean;
  /** Short, human-readable explanation — handy for logs and tests. */
  readonly reason: string;
}

const react = (reason: string): ReactionDecision => ({ react: true, reason });
const skip = (reason: string): ReactionDecision => ({ react: false, reason });

/**
 * Decides whether a completed operation deserves a SkillIssue reaction.
 *
 * Filters are ANDed and evaluated in a fixed order; `exclude` is an absolute
 * veto. The evaluation order only affects which `reason` is reported first — it
 * never changes the final boolean, since a reaction requires passing every check.
 */
export function shouldReact(
  input: PolicyInput,
  settings: ReactionPolicySettings,
): ReactionDecision {
  const { operation, outcome, consecutiveFailures } = input;

  if (!settings.enabled) {
    return skip('SkillIssue is disabled');
  }

  if (!isFailureLike(outcome, settings)) {
    return skip(`outcome is ${outcome.kind}`);
  }

  if (matchesAnyPattern(operation.name, settings.exclude)) {
    return skip(`"${operation.name}" is excluded`);
  }

  if (settings.include.length > 0 && !matchesAnyPattern(operation.name, settings.include)) {
    return skip(`"${operation.name}" is not in the include list`);
  }

  if (settings.monitoredKinds.length > 0 && !settings.monitoredKinds.includes(operation.kind)) {
    return skip(`operation kind "${operation.kind}" is not monitored`);
  }

  if (settings.repeatedFailures === 'first-only' && consecutiveFailures > 1) {
    return skip(`repeat failure #${consecutiveFailures} suppressed`);
  }

  return react(`failure of "${operation.name}"`);
}

/** True when the outcome counts as a failure under the current settings. */
function isFailureLike(outcome: OperationOutcome, settings: ReactionPolicySettings): boolean {
  if (isFailure(outcome)) {
    return settings.reactOnFailure;
  }
  if (isCancelled(outcome)) {
    return settings.treatCancellationAsFailure;
  }
  if (isUnknown(outcome)) {
    return settings.treatUnknownAsFailure;
  }
  return false; // success
}

/**
 * Case-insensitive substring match of `value` against any non-empty pattern.
 *
 * Substring matching (rather than regex/glob) keeps the setting predictable and
 * approachable for names like "npm: test" or "eslint".
 */
export function matchesAnyPattern(value: string, patterns: readonly string[]): boolean {
  const haystack = value.toLowerCase();
  return patterns.some(
    (pattern) => pattern.length > 0 && haystack.includes(pattern.toLowerCase()),
  );
}
