import * as assert from 'node:assert/strict';
import { operationCompleted, operationStarted } from '../../../core/events';
import { createOperation, OperationKind } from '../../../core/operation';
import { cancelled, failure, success } from '../../../core/outcome';
import { WorkflowTracker } from '../../../core/workflowTracker';
import { createNoopLogger, Logger } from '../../../logging/logger';
import { SkillIssueOrchestrator } from '../../../orchestration/skillIssueOrchestrator';
import { withPolicySettings } from '../../../policy/policySettings';
import { ReactionRequest, ReactionSink } from '../../../reaction/reactionRequest';

/** Records every reaction request so tests can assert on the loop's output. */
class RecordingSink implements ReactionSink {
  readonly requests: ReactionRequest[] = [];
  react(request: ReactionRequest): void {
    this.requests.push(request);
  }
}

/** Simulates a WebView/audio/UI failure to prove the loop contains it. */
class ThrowingSink implements ReactionSink {
  react(): void {
    throw new Error('webview exploded');
  }
}

describe('orchestration/skillIssueOrchestrator', () => {
  const makeOp = (id: string, name = 'npm: test', kind = OperationKind.Test) =>
    createOperation({ id, name, startedAt: 0, source: 'task', kind });

  const makeLoop = (settings = withPolicySettings()) => {
    const sink = new RecordingSink();
    const orchestrator = new SkillIssueOrchestrator({
      getSettings: () => settings,
      sink,
      logger: createNoopLogger(),
    });
    return { orchestrator, sink };
  };

  it('reacts to a failure with a message describing the outcome', () => {
    const { orchestrator, sink } = makeLoop();
    orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 10));
    assert.equal(sink.requests.length, 1);
    assert.equal(sink.requests[0]?.message, 'npm: test failed (exit code 1)');
  });

  it('stays silent on success', () => {
    const { orchestrator, sink } = makeLoop();
    orchestrator.handleEvent(operationCompleted(makeOp('1'), success(), 10));
    assert.equal(sink.requests.length, 0);
  });

  it('ignores started events (there is no outcome to judge)', () => {
    const { orchestrator, sink } = makeLoop();
    orchestrator.handleEvent(operationStarted(makeOp('1')));
    assert.equal(sink.requests.length, 0);
  });

  it('honours the exclude veto from the policy', () => {
    const { orchestrator, sink } = makeLoop(withPolicySettings({ exclude: ['test'] }));
    orchestrator.handleEvent(operationCompleted(makeOp('1', 'npm: test'), failure(1), 10));
    assert.equal(sink.requests.length, 0);
  });

  it('suppresses repeat failures under first-only', () => {
    const { orchestrator, sink } = makeLoop(withPolicySettings({ repeatedFailures: 'first-only' }));
    orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 10));
    orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 20));
    orchestrator.handleEvent(operationCompleted(makeOp('3'), failure(1), 30));
    assert.equal(sink.requests.length, 1, 'only the first of a streak reacts');
  });

  it('reacts to every failure under always', () => {
    const { orchestrator, sink } = makeLoop(withPolicySettings({ repeatedFailures: 'always' }));
    orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 10));
    orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 20));
    orchestrator.handleEvent(operationCompleted(makeOp('3'), failure(1), 30));
    assert.equal(sink.requests.length, 3);
  });

  it('threads the consecutive-failure count into the reaction request', () => {
    const { orchestrator, sink } = makeLoop(withPolicySettings({ repeatedFailures: 'always' }));
    orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 10));
    orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 20));
    orchestrator.handleEvent(operationCompleted(makeOp('3'), failure(1), 30));
    assert.equal(sink.requests[0]?.repeatCount, undefined, 'the first failure is not a repeat');
    assert.equal(sink.requests[1]?.repeatCount, 2);
    assert.equal(sink.requests[2]?.repeatCount, 3);
  });

  it('restarts the streak after a success, so a later failure reacts again', () => {
    const { orchestrator, sink } = makeLoop(withPolicySettings({ repeatedFailures: 'first-only' }));
    orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 10));
    orchestrator.handleEvent(operationCompleted(makeOp('2'), success(), 20));
    orchestrator.handleEvent(operationCompleted(makeOp('3'), failure(1), 30));
    assert.equal(sink.requests.length, 2);
  });

  it('tracks concurrent operations independently', () => {
    const { orchestrator, sink } = makeLoop(withPolicySettings({ repeatedFailures: 'first-only' }));
    orchestrator.handleEvent(operationCompleted(makeOp('1', 'npm: test'), failure(1), 10));
    orchestrator.handleEvent(
      operationCompleted(makeOp('2', 'npm: build', OperationKind.Build), failure(1), 20),
    );
    assert.equal(sink.requests.length, 2, 'each distinct operation gets its own first reaction');
  });

  it('does not react to cancellation unless configured to', () => {
    const silent = makeLoop();
    silent.orchestrator.handleEvent(operationCompleted(makeOp('1'), cancelled(), 10));
    assert.equal(silent.sink.requests.length, 0);

    const reactive = makeLoop(withPolicySettings({ treatCancellationAsFailure: true }));
    reactive.orchestrator.handleEvent(operationCompleted(makeOp('1'), cancelled(), 10));
    assert.equal(reactive.sink.requests.length, 1);
  });

  it('re-reads the settings for every event', () => {
    let enabled = true;
    const sink = new RecordingSink();
    const orchestrator = new SkillIssueOrchestrator({
      getSettings: () => withPolicySettings({ enabled }),
      sink,
      logger: createNoopLogger(),
    });
    orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 10));
    enabled = false;
    orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 20));
    assert.equal(sink.requests.length, 1, 'the second failure is skipped once disabled');
  });

  it('contains a throwing sink so the loop never propagates an error', () => {
    const errors: string[] = [];
    const logger: Logger = {
      debug(): void {},
      info(): void {},
      warn(): void {},
      error(message: string): void {
        errors.push(message);
      },
    };
    const orchestrator = new SkillIssueOrchestrator({
      getSettings: () => withPolicySettings(),
      sink: new ThrowingSink(),
      logger,
    });
    assert.doesNotThrow(() =>
      orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 10)),
    );
    assert.equal(errors.length, 1, 'the failure is logged, not rethrown');
  });

  it('reset() clears repeat-failure history', () => {
    const sink = new RecordingSink();
    const orchestrator = new SkillIssueOrchestrator({
      getSettings: () => withPolicySettings({ repeatedFailures: 'first-only' }),
      sink,
      logger: createNoopLogger(),
      tracker: new WorkflowTracker(),
    });
    orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 10));
    orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 20));
    assert.equal(sink.requests.length, 1);
    orchestrator.reset();
    orchestrator.handleEvent(operationCompleted(makeOp('3'), failure(1), 30));
    assert.equal(sink.requests.length, 2, 'after reset the next failure counts as first again');
  });

  describe('cooldown', () => {
    const makeCooledLoop = (cooldownMs: number) => {
      const sink = new RecordingSink();
      const orchestrator = new SkillIssueOrchestrator({
        getSettings: () => withPolicySettings({ repeatedFailures: 'always' }),
        getCooldownMs: () => cooldownMs,
        sink,
        logger: createNoopLogger(),
      });
      return { orchestrator, sink };
    };

    it('suppresses a reaction that lands inside the cooldown window', () => {
      const { orchestrator, sink } = makeCooledLoop(1000);
      orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 1000));
      orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 1500));
      assert.equal(sink.requests.length, 1, 'the second failure is only 500ms later');
    });

    it('reacts again once the cooldown window has elapsed', () => {
      const { orchestrator, sink } = makeCooledLoop(1000);
      orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 1000));
      orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 2500));
      assert.equal(sink.requests.length, 2, '1500ms later the cooldown has passed');
    });

    it('reacts at exactly the cooldown boundary', () => {
      const { orchestrator, sink } = makeCooledLoop(1000);
      orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 1000));
      orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 2000));
      assert.equal(sink.requests.length, 2, 'finishedAt - lastReactionAt === cooldownMs is allowed');
    });

    it('treats a cooldown of 0 as disabled', () => {
      const { orchestrator, sink } = makeCooledLoop(0);
      orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 1000));
      orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 1000));
      assert.equal(sink.requests.length, 2);
    });

    it('reset() clears the cooldown history', () => {
      const { orchestrator, sink } = makeCooledLoop(5000);
      orchestrator.handleEvent(operationCompleted(makeOp('1'), failure(1), 1000));
      orchestrator.reset();
      orchestrator.handleEvent(operationCompleted(makeOp('2'), failure(1), 1200));
      assert.equal(sink.requests.length, 2, 'reset forgets the last reaction time');
    });
  });
});
