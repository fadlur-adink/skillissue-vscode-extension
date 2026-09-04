import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { isCompletedEvent } from '../../core/events';
import { OutcomeKind } from '../../core/outcome';
import { TaskDetector } from '../../detection/taskDetector';
import { createNoopLogger } from '../../logging/logger';
import { SkillIssueOrchestrator } from '../../orchestration/skillIssueOrchestrator';
import { withPolicySettings } from '../../policy/policySettings';
import { ReactionRequest, ReactionSink } from '../../reaction/reactionRequest';

/** Records the reactions the loop produces so the test can assert on them. */
class RecordingSink implements ReactionSink {
  readonly requests: ReactionRequest[] = [];
  react(request: ReactionRequest): void {
    this.requests.push(request);
  }
}

/**
 * End-to-end proof of SkillIssue's core promise, inside a real VS Code host:
 * a genuinely failing task is observed by the detector, judged by the policy and
 * turned into a reaction — the whole **detection → policy → reaction** loop wired
 * to the live Tasks API rather than to mocks.
 *
 * `detection.test.ts` deliberately avoids executing a real task (it covers only
 * the detector's lifecycle); this is the test that runs one. A real
 * `ShellExecution('exit 3')` produces a deterministic non-zero exit code through
 * the exact `onDidEndTaskProcess` signal production relies on, so a green run
 * here means the shipped extension really does react to a failing task.
 */
describe('SkillIssue end-to-end (integration)', () => {
  it('runs a real failing task all the way through the loop into a reaction', async () => {
    const logger = createNoopLogger();
    const detector = new TaskDetector(logger);
    const sink = new RecordingSink();
    const orchestrator = new SkillIssueOrchestrator({
      // Out-of-the-box defaults: enabled, react on failure, monitor every kind.
      getSettings: () => withPolicySettings(),
      sink,
      logger,
    });

    // Route every detector event through the loop and resolve on the failure.
    let subscription: vscode.Disposable | undefined;
    const failed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('timed out waiting for the failing task to be observed')),
        20000,
      );
      subscription = detector.onWorkflowEvent((event) => {
        orchestrator.handleEvent(event);
        if (isCompletedEvent(event) && event.outcome.kind === OutcomeKind.Failure) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // A shell task that exits non-zero: deterministic across POSIX shells, and
    // scoped Global so it needs no open workspace (the integration host has none).
    const task = new vscode.Task(
      { type: 'shell' },
      vscode.TaskScope.Global,
      'skillissue-e2e',
      'skillissue',
      new vscode.ShellExecution('exit 3'),
    );

    try {
      await vscode.tasks.executeTask(task);
      await failed;
      assert.equal(sink.requests.length, 1, 'the failing task produced exactly one reaction');
      const message = sink.requests[0]?.message ?? '';
      assert.match(message, /skillissue-e2e/, 'the reaction names the failed task');
      assert.match(message, /exit code 3/, 'the reaction carries the real exit code');
    } finally {
      subscription?.dispose();
      detector.dispose();
    }
  });
});
