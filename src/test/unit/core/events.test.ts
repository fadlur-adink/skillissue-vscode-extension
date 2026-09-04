import * as assert from 'node:assert/strict';
import {
  isCompletedEvent,
  isStartedEvent,
  operationCompleted,
  operationStarted,
} from '../../../core/events';
import { createOperation } from '../../../core/operation';
import { failure } from '../../../core/outcome';

describe('core/events', () => {
  const op = createOperation({ id: '1', name: 'build', startedAt: 0 });

  it('operationStarted builds a started event', () => {
    assert.deepEqual(operationStarted(op), { type: 'started', operation: op });
  });

  it('operationCompleted carries the outcome and finish time', () => {
    const event = operationCompleted(op, failure(1), 99);
    assert.equal(event.type, 'completed');
    assert.equal(event.finishedAt, 99);
    assert.deepEqual(event.outcome, failure(1));
    assert.equal(event.operation, op);
  });

  it('type guards discriminate started from completed', () => {
    const started = operationStarted(op);
    const completed = operationCompleted(op, failure(1), 1);
    assert.equal(isStartedEvent(started), true);
    assert.equal(isCompletedEvent(started), false);
    assert.equal(isStartedEvent(completed), false);
    assert.equal(isCompletedEvent(completed), true);
  });
});
