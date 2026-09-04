import * as assert from 'node:assert/strict';
import { OperationKind } from '../../../core/operation';
import {
  createDefaultPolicySettings,
  withPolicySettings,
} from '../../../policy/policySettings';

describe('policy/policySettings', () => {
  describe('createDefaultPolicySettings', () => {
    it('reacts to real failures but stays quiet for cancellations and unknowns', () => {
      const defaults = createDefaultPolicySettings();
      assert.equal(defaults.enabled, true);
      assert.equal(defaults.reactOnFailure, true);
      assert.equal(defaults.treatCancellationAsFailure, false);
      assert.equal(defaults.treatUnknownAsFailure, false);
    });

    it('monitors all kinds with empty include/exclude and reacts always', () => {
      const defaults = createDefaultPolicySettings();
      assert.deepEqual(defaults.monitoredKinds, []);
      assert.deepEqual(defaults.include, []);
      assert.deepEqual(defaults.exclude, []);
      assert.equal(defaults.repeatedFailures, 'always');
    });

    it('returns a fresh object each call so callers cannot mutate shared state', () => {
      const a = createDefaultPolicySettings();
      const b = createDefaultPolicySettings();
      assert.notEqual(a, b);
      assert.deepEqual(a, b);
    });
  });

  describe('withPolicySettings', () => {
    it('equals the defaults when given no overrides', () => {
      assert.deepEqual(withPolicySettings(), createDefaultPolicySettings());
      assert.deepEqual(withPolicySettings({}), createDefaultPolicySettings());
    });

    it('overrides a single field and keeps the rest at their defaults', () => {
      const settings = withPolicySettings({ enabled: false });
      assert.equal(settings.enabled, false);
      assert.equal(settings.reactOnFailure, true, 'untouched fields keep their default');
    });

    it('overrides several fields at once, including list values', () => {
      const settings = withPolicySettings({
        monitoredKinds: [OperationKind.Test],
        include: ['test'],
        exclude: ['watch'],
        repeatedFailures: 'first-only',
      });
      assert.deepEqual(settings.monitoredKinds, [OperationKind.Test]);
      assert.deepEqual(settings.include, ['test']);
      assert.deepEqual(settings.exclude, ['watch']);
      assert.equal(settings.repeatedFailures, 'first-only');
    });

    it('does not leak overrides into later default objects', () => {
      withPolicySettings({ enabled: false, include: ['x'] });
      const fresh = createDefaultPolicySettings();
      assert.equal(fresh.enabled, true);
      assert.deepEqual(fresh.include, []);
    });
  });
});
