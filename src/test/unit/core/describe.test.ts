import * as assert from 'node:assert/strict';
import { describeOperationOutcome } from '../../../core/describe';
import { createOperation, OperationKind } from '../../../core/operation';
import { cancelled, failure, success, unknown } from '../../../core/outcome';

describe('core/describe', () => {
  const op = createOperation({
    id: '1',
    name: 'npm test',
    startedAt: 0,
    kind: OperationKind.Test,
    source: 'terminal',
  });

  it('describes success', () => {
    assert.equal(describeOperationOutcome(op, success()), 'npm test succeeded');
  });

  it('describes failure with and without an exit code', () => {
    assert.equal(describeOperationOutcome(op, failure()), 'npm test failed');
    assert.equal(describeOperationOutcome(op, failure(2)), 'npm test failed (exit code 2)');
  });

  it('describes cancellation', () => {
    assert.equal(describeOperationOutcome(op, cancelled()), 'npm test was cancelled');
  });

  it('describes unknown results with and without a reason', () => {
    assert.equal(
      describeOperationOutcome(op, unknown()),
      'npm test finished with an unknown result',
    );
    assert.equal(
      describeOperationOutcome(op, unknown('no exit code exposed')),
      'npm test finished with an unknown result (no exit code exposed)',
    );
  });
});
