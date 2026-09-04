import { describeOperationOutcome } from '../core/describe';
import { isCompletedEvent, WorkflowEvent } from '../core/events';
import { WorkflowTracker } from '../core/workflowTracker';
import { Logger } from '../logging/logger';
import { ReactionPolicySettings } from '../policy/policySettings';
import { PolicyInput, shouldReact } from '../policy/reactionPolicy';
import { createReactionRequest, ReactionSink } from '../reaction/reactionRequest';

/** Collaborators the loop needs, all injected so it stays pure and testable. */
export interface OrchestratorDeps {
  /** Supplies the policy settings for each decision (Phase 6 backs this with config). */
  readonly getSettings: () => ReactionPolicySettings;
  /** Presents the reaction — the WebView controller in production, a fake in tests. */
  readonly sink: ReactionSink;
  /** Logs decisions and any contained errors. */
  readonly logger: Logger;
  /** Optional shared tracker; a private one is created when omitted. */
  readonly tracker?: WorkflowTracker;
  /**
   * Supplies the minimum spacing between reactions in milliseconds (`0` or
   * omitted disables the cooldown). Consulted per event, so a configuration
   * change (Phase 6) applies immediately.
   */
  readonly getCooldownMs?: () => number;
}

/**
 * The SkillIssue loop: **detection → policy → reaction.**
 *
 * It consumes domain {@link WorkflowEvent}s (never VS Code events), records them
 * in a {@link WorkflowTracker}, asks the pure policy whether the outcome deserves
 * a reaction and, when it does, hands a pre-computed message to a
 * {@link ReactionSink}. Nothing here imports `vscode`: the composition root
 * (`extension.ts`) owns the detector subscription and passes events in — which is
 * exactly what makes the whole loop unit-testable in isolation.
 *
 * Robustness is the point; this is where a failing build must never become a
 * broken workflow:
 * - every event is processed inside `try/catch` and any error is logged, never
 *   rethrown;
 * - a throwing {@link ReactionSink} (WebView/audio/UI failure) is contained;
 * - repeated and concurrent failures are tracked per logical operation, so the
 *   policy can suppress or allow repeats deterministically;
 * - `started` events carry no outcome and are ignored.
 */
export class SkillIssueOrchestrator {
  private readonly tracker: WorkflowTracker;
  /** `finishedAt` of the last reaction, used for the cooldown gate. */
  private lastReactionAt: number | undefined;

  constructor(private readonly deps: OrchestratorDeps) {
    this.tracker = deps.tracker ?? new WorkflowTracker();
  }

  /** Processes one detection event through the full loop. Never throws. */
  handleEvent(event: WorkflowEvent): void {
    try {
      if (!isCompletedEvent(event)) {
        return; // a started event has no outcome to judge
      }
      const { operation, outcome } = event;
      const recorded = this.tracker.record(event);
      const input: PolicyInput = {
        operation,
        outcome,
        consecutiveFailures: recorded.consecutiveFailures,
      };
      const decision = shouldReact(input, this.deps.getSettings());
      if (!decision.react) {
        this.deps.logger.debug(`SkillIssue did not react: ${decision.reason}`);
        return;
      }
      if (this.isCoolingDown(event.finishedAt)) {
        this.deps.logger.debug('SkillIssue did not react: cooldown is active');
        return;
      }
      this.lastReactionAt = event.finishedAt;
      this.deps.logger.info(`SkillIssue reacted: ${decision.reason}`);
      this.deps.sink.react(
        createReactionRequest(
          describeOperationOutcome(operation, outcome),
          recorded.consecutiveFailures,
        ),
      );
    } catch (error) {
      // A meme failure must never surface as a developer-workflow failure.
      this.deps.logger.error('SkillIssue reaction loop failed', error);
    }
  }

  /** True when a reaction happened too recently, per the configured cooldown. */
  private isCoolingDown(finishedAt: number): boolean {
    const cooldownMs = this.deps.getCooldownMs?.() ?? 0;
    if (cooldownMs <= 0 || this.lastReactionAt === undefined) {
      return false;
    }
    return finishedAt - this.lastReactionAt < cooldownMs;
  }

  /** Forgets repeat-failure and cooldown history (e.g. after a settings change). */
  reset(): void {
    this.tracker.reset();
    this.lastReactionAt = undefined;
  }
}
