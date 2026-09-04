import * as assert from 'node:assert/strict';
import { operationCompleted } from '../../../core/events';
import { createOperation, Operation, OperationKind } from '../../../core/operation';
import { cancelled, failure, success, unknown } from '../../../core/outcome';
import { WorkflowTracker } from '../../../core/workflowTracker';

describe('core/workflowTracker', () => {
  const makeOp = (id: string, name = 'build'): Operation =>
    createOperation({ id, name, startedAt: 0, source: 'task', kind: OperationKind.Build });

  it('counts the first failure as 1 and not a repeat', () => {
    const tracker = new WorkflowTracker();
    const result = tracker.record(operationCompleted(makeOp('1'), failure(1), 10));
    assert.equal(result.consecutiveFailures, 1);
    assert.equal(result.isRepeatFailure, false);
  });

  it('counts consecutive failures and flags repeats', () => {
    const tracker = new WorkflowTracker();
    tracker.record(operationCompleted(makeOp('1'), failure(1), 10));
    const second = tracker.record(operationCompleted(makeOp('2'), failure(1), 20));
    const third = tracker.record(operationCompleted(makeOp('3'), failure(1), 30));
    assert.equal(second.consecutiveFailures, 2);
    assert.equal(second.isRepeatFailure, true);
    assert.equal(third.consecutiveFailures, 3);
    assert.equal(third.isRepeatFailure, true);
  });

  it('resets the streak on success', () => {
    const tracker = new WorkflowTracker();
    tracker.record(operationCompleted(makeOp('1'), failure(1), 10));
    tracker.record(operationCompleted(makeOp('2'), failure(1), 20));
    const afterSuccess = tracker.record(operationCompleted(makeOp('3'), success(), 30));
    assert.equal(afterSuccess.consecutiveFailures, 0);
    assert.equal(afterSuccess.isRepeatFailure, false);

    const nextFailure = tracker.record(operationCompleted(makeOp('4'), failure(1), 40));
    assert.equal(nextFailure.consecutiveFailures, 1, 'streak restarts from 1');
    assert.equal(nextFailure.isRepeatFailure, false);
  });

  it('resets the streak on cancelled and unknown outcomes', () => {
    const tracker = new WorkflowTracker();
    tracker.record(operationCompleted(makeOp('1'), failure(1), 10));
    assert.equal(
      tracker.record(operationCompleted(makeOp('2'), cancelled(), 20)).consecutiveFailures,
      0,
    );
    tracker.record(operationCompleted(makeOp('3'), failure(1), 30));
    assert.equal(
      tracker.record(operationCompleted(makeOp('4'), unknown('x'), 40)).consecutiveFailures,
      0,
    );
  });

  it('keeps distinct operations independent', () => {
    const tracker = new WorkflowTracker();
    tracker.record(operationCompleted(makeOp('1', 'build'), failure(1), 10));
    tracker.record(operationCompleted(makeOp('2', 'build'), failure(1), 20));

    const testResult = tracker.record(operationCompleted(makeOp('3', 'test'), failure(1), 30));
    assert.equal(testResult.consecutiveFailures, 1, 'a different operation starts its own streak');
    assert.equal(tracker.getConsecutiveFailures(makeOp('4', 'build')), 2);
    assert.equal(tracker.getConsecutiveFailures(makeOp('5', 'test')), 1);
  });

  it('tracks total runs and exposes the last outcome', () => {
    const tracker = new WorkflowTracker();
    tracker.record(operationCompleted(makeOp('1'), failure(1), 10));
    tracker.record(operationCompleted(makeOp('2'), success(), 20));

    const stats = tracker.getStats(makeOp('3'));
    if (!stats) {
      throw new Error('expected stats for a seen operation');
    }
    assert.equal(stats.totalRuns, 2);
    assert.equal(stats.consecutiveFailures, 0);
    assert.deepEqual(stats.lastOutcome, success());
  });

  it('reports nothing for an unseen operation', () => {
    const tracker = new WorkflowTracker();
    assert.equal(tracker.getStats(makeOp('1')), undefined);
    assert.equal(tracker.getConsecutiveFailures(makeOp('1')), 0);
  });

  it('reset() clears all tracked state', () => {
    const tracker = new WorkflowTracker();
    tracker.record(operationCompleted(makeOp('1'), failure(1), 10));
    tracker.reset();
    assert.equal(tracker.getStats(makeOp('2')), undefined);
    assert.equal(tracker.getConsecutiveFailures(makeOp('3')), 0);
  });
});
