import * as assert from 'node:assert/strict';
import {
  cancelled,
  failure,
  isCancelled,
  isFailure,
  isSuccess,
  isUnknown,
  OutcomeKind,
  success,
  unknown,
} from '../../../core/outcome';

describe('core/outcome', () => {
  it('success() has the Success kind only', () => {
    assert.deepEqual(success(), { kind: OutcomeKind.Success });
  });

  it('failure() omits exitCode when none is given', () => {
    assert.deepEqual(failure(), { kind: OutcomeKind.Failure });
  });

  it('failure(exitCode) keeps the code, including a meaningful 0', () => {
    assert.deepEqual(failure(1), { kind: OutcomeKind.Failure, exitCode: 1 });
    assert.deepEqual(failure(0), { kind: OutcomeKind.Failure, exitCode: 0 });
  });

  it('cancelled() has the Cancelled kind', () => {
    assert.deepEqual(cancelled(), { kind: OutcomeKind.Cancelled });
  });

  it('unknown() optionally carries a reason', () => {
    assert.deepEqual(unknown(), { kind: OutcomeKind.Unknown });
    assert.deepEqual(unknown('no exit code'), {
      kind: OutcomeKind.Unknown,
      reason: 'no exit code',
    });
  });

  it('each predicate matches exactly one kind', () => {
    const outcomes = [success(), failure(2), cancelled(), unknown('x')];
    const predicates = [isSuccess, isFailure, isCancelled, isUnknown];
    outcomes.forEach((outcome, i) => {
      predicates.forEach((predicate, j) => {
        assert.equal(predicate(outcome), i === j, `predicate #${j} on outcome #${i}`);
      });
    });
  });

  it('isFailure narrows the type so exitCode is accessible', () => {
    const outcome = failure(3);
    if (!isFailure(outcome)) {
      throw new Error('expected a failure outcome');
    }
    assert.equal(outcome.exitCode, 3);
  });
});
