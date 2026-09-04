import * as assert from 'node:assert/strict';
import { createOperation, Operation, OperationKind } from '../../../core/operation';
import { cancelled, failure, OperationOutcome, success, unknown } from '../../../core/outcome';
import {
  matchesAnyPattern,
  PolicyInput,
  shouldReact,
} from '../../../policy/reactionPolicy';
import { withPolicySettings } from '../../../policy/policySettings';

describe('policy/reactionPolicy', () => {
  const makeOp = (name = 'npm: test', kind = OperationKind.Test): Operation =>
    createOperation({ id: 'run-1', name, startedAt: 0, source: 'task', kind });

  const input = (
    outcome: OperationOutcome,
    consecutiveFailures = 1,
    operation: Operation = makeOp(),
  ): PolicyInput => ({ operation, outcome, consecutiveFailures });

  describe('master switch', () => {
    it('never reacts when disabled, even for a real failure', () => {
      const decision = shouldReact(input(failure(1)), withPolicySettings({ enabled: false }));
      assert.equal(decision.react, false);
      assert.match(decision.reason, /disabled/i);
    });

    it('reacts to a plain failure with the default settings', () => {
      const decision = shouldReact(input(failure(1)), withPolicySettings());
      assert.equal(decision.react, true);
    });
  });

  describe('outcome filtering', () => {
    it('does not react to success', () => {
      const decision = shouldReact(input(success(), 0), withPolicySettings());
      assert.equal(decision.react, false);
      assert.match(decision.reason, /success/);
    });

    it('honours reactOnFailure=false for a failure outcome', () => {
      const decision = shouldReact(input(failure(1)), withPolicySettings({ reactOnFailure: false }));
      assert.equal(decision.react, false);
    });

    it('treats cancellation as failure only when configured', () => {
      assert.equal(shouldReact(input(cancelled()), withPolicySettings()).react, false);
      assert.equal(
        shouldReact(input(cancelled()), withPolicySettings({ treatCancellationAsFailure: true }))
          .react,
        true,
      );
    });

    it('treats unknown as failure only when configured', () => {
      assert.equal(shouldReact(input(unknown('no exit code')), withPolicySettings()).react, false);
      assert.equal(
        shouldReact(input(unknown('no exit code')), withPolicySettings({ treatUnknownAsFailure: true }))
          .react,
        true,
      );
    });
  });

  describe('include / exclude', () => {
    it('excludes by case-insensitive substring', () => {
      const decision = shouldReact(
        input(failure(1), 1, makeOp('npm: lint')),
        withPolicySettings({ exclude: ['LINT'] }),
      );
      assert.equal(decision.react, false);
      assert.match(decision.reason, /excluded/);
    });

    it('lets exclude veto a name that would otherwise be included', () => {
      const decision = shouldReact(
        input(failure(1), 1, makeOp('npm: test --watch')),
        withPolicySettings({ include: ['test'], exclude: ['watch'] }),
      );
      assert.equal(decision.react, false);
      assert.match(decision.reason, /excluded/);
    });

    it('reacts only to names in a non-empty include list', () => {
      const settings = withPolicySettings({ include: ['test'] });
      assert.equal(shouldReact(input(failure(1), 1, makeOp('npm: test')), settings).react, true);
      assert.equal(shouldReact(input(failure(1), 1, makeOp('npm: build')), settings).react, false);
    });

    it('allows everything when the include list is empty', () => {
      const settings = withPolicySettings({ include: [] });
      assert.equal(shouldReact(input(failure(1), 1, makeOp('anything')), settings).react, true);
    });
  });

  describe('monitored kinds', () => {
    it('skips operations whose kind is not monitored', () => {
      const decision = shouldReact(
        input(failure(1), 1, makeOp('npm: build', OperationKind.Build)),
        withPolicySettings({ monitoredKinds: [OperationKind.Test] }),
      );
      assert.equal(decision.react, false);
      assert.match(decision.reason, /not monitored/);
    });

    it('reacts when the kind is monitored', () => {
      const decision = shouldReact(
        input(failure(1), 1, makeOp('npm: test', OperationKind.Test)),
        withPolicySettings({ monitoredKinds: [OperationKind.Test, OperationKind.Lint] }),
      );
      assert.equal(decision.react, true);
    });

    it('monitors all kinds when the list is empty', () => {
      const decision = shouldReact(
        input(failure(1), 1, makeOp('weird', OperationKind.Unknown)),
        withPolicySettings({ monitoredKinds: [] }),
      );
      assert.equal(decision.react, true);
    });
  });

  describe('repeated failures', () => {
    it('suppresses repeats under first-only', () => {
      const settings = withPolicySettings({ repeatedFailures: 'first-only' });
      assert.equal(shouldReact(input(failure(1), 1), settings).react, true);
      const repeat = shouldReact(input(failure(1), 2), settings);
      assert.equal(repeat.react, false);
      assert.match(repeat.reason, /repeat failure #2/i);
    });

    it('reacts to every failure under always', () => {
      const settings = withPolicySettings({ repeatedFailures: 'always' });
      assert.equal(shouldReact(input(failure(1), 1), settings).react, true);
      assert.equal(shouldReact(input(failure(1), 5), settings).react, true);
    });
  });

  describe('determinism', () => {
    it('returns an identical decision for identical input and settings', () => {
      const settings = withPolicySettings({ include: ['test'], repeatedFailures: 'first-only' });
      const a = shouldReact(input(failure(2), 1), settings);
      const b = shouldReact(input(failure(2), 1), settings);
      assert.deepEqual(a, b);
    });

    it('always supplies a non-empty reason', () => {
      assert.ok(shouldReact(input(failure(1)), withPolicySettings()).reason.length > 0);
      assert.ok(shouldReact(input(success(), 0), withPolicySettings()).reason.length > 0);
    });
  });

  describe('matchesAnyPattern', () => {
    it('matches case-insensitively as a substring', () => {
      assert.equal(matchesAnyPattern('npm: TEST', ['test']), true);
      assert.equal(matchesAnyPattern('npm: test', ['TEST']), true);
      assert.equal(matchesAnyPattern('eslint --fix', ['lint']), true);
    });

    it('never matches when there is no pattern', () => {
      assert.equal(matchesAnyPattern('npm: test', []), false);
    });

    it('ignores empty patterns so they do not match everything', () => {
      assert.equal(matchesAnyPattern('npm: test', ['']), false);
      assert.equal(matchesAnyPattern('npm: test', ['', 'test']), true);
    });

    it('returns false when nothing matches', () => {
      assert.equal(matchesAnyPattern('npm: build', ['test', 'lint']), false);
    });
  });
});
