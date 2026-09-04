import * as assert from 'node:assert/strict';
import { OperationKind } from '../../../core/operation';
import {
  createDefaultSkillIssueSettings,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_DURATION_SECONDS,
  toSkillIssueSettings,
} from '../../../config/settings';

describe('config/settings', () => {
  describe('defaults', () => {
    it('maps empty raw input to a good out-of-the-box experience', () => {
      const s = toSkillIssueSettings({});
      assert.equal(s.policy.enabled, true);
      assert.equal(s.policy.reactOnFailure, true);
      assert.equal(s.policy.treatCancellationAsFailure, false);
      assert.equal(s.policy.treatUnknownAsFailure, false);
      assert.deepEqual(s.policy.monitoredKinds, []);
      assert.deepEqual(s.policy.include, []);
      assert.deepEqual(s.policy.exclude, []);
      assert.equal(s.policy.repeatedFailures, 'always');
      assert.equal(s.soundEnabled, true);
      assert.equal(s.volume, 1);
      assert.equal(s.durationMs, DEFAULT_DURATION_SECONDS * 1000);
      assert.equal(s.cooldownMs, DEFAULT_COOLDOWN_SECONDS * 1000);
      assert.equal(s.detectTerminalCommands, true);
    });

    it('createDefaultSkillIssueSettings equals mapping empty input', () => {
      assert.deepEqual(createDefaultSkillIssueSettings(), toSkillIssueSettings({}));
    });
  });

  describe('booleans', () => {
    it('respects explicit booleans', () => {
      const s = toSkillIssueSettings({
        enabled: false,
        soundEnabled: false,
        treatCancellationAsFailure: true,
        treatUnknownAsFailure: true,
      });
      assert.equal(s.policy.enabled, false);
      assert.equal(s.soundEnabled, false);
      assert.equal(s.policy.treatCancellationAsFailure, true);
      assert.equal(s.policy.treatUnknownAsFailure, true);
    });

    it('falls back to the default for a non-boolean value', () => {
      const s = toSkillIssueSettings({ enabled: 'false', soundEnabled: 0 });
      assert.equal(s.policy.enabled, true, 'a string is not a boolean, so the default applies');
      assert.equal(s.soundEnabled, true);
    });
  });

  describe('detectTerminalCommands', () => {
    it('defaults to true', () => {
      assert.equal(toSkillIssueSettings({}).detectTerminalCommands, true);
    });

    it('respects an explicit false', () => {
      assert.equal(
        toSkillIssueSettings({ detectTerminalCommands: false }).detectTerminalCommands,
        false,
      );
    });

    it('falls back to true for a non-boolean value', () => {
      assert.equal(
        toSkillIssueSettings({ detectTerminalCommands: 'no' }).detectTerminalCommands,
        true,
      );
    });
  });

  describe('volume', () => {
    it('clamps to the [0, 1] range', () => {
      assert.equal(toSkillIssueSettings({ volume: 2 }).volume, 1);
      assert.equal(toSkillIssueSettings({ volume: -1 }).volume, 0);
      assert.equal(toSkillIssueSettings({ volume: 0.4 }).volume, 0.4);
    });

    it('falls back to 1 for a non-finite or non-number value', () => {
      assert.equal(toSkillIssueSettings({ volume: Number.NaN }).volume, 1);
      assert.equal(toSkillIssueSettings({ volume: 'loud' }).volume, 1);
    });
  });

  describe('duration & cooldown', () => {
    it('converts seconds to milliseconds', () => {
      const s = toSkillIssueSettings({ durationSeconds: 3, cooldownSeconds: 2 });
      assert.equal(s.durationMs, 3000);
      assert.equal(s.cooldownMs, 2000);
    });

    it('never goes below zero', () => {
      const s = toSkillIssueSettings({ durationSeconds: -5, cooldownSeconds: -1 });
      assert.equal(s.durationMs, 0);
      assert.equal(s.cooldownMs, 0);
    });

    it('falls back to defaults for non-number values', () => {
      const s = toSkillIssueSettings({ durationSeconds: 'x', cooldownSeconds: null });
      assert.equal(s.durationMs, DEFAULT_DURATION_SECONDS * 1000);
      assert.equal(s.cooldownMs, DEFAULT_COOLDOWN_SECONDS * 1000);
    });
  });

  describe('monitoredKinds', () => {
    it('keeps valid kinds and drops invalid ones', () => {
      const s = toSkillIssueSettings({ monitoredKinds: ['test', 'bogus', 'build'] });
      assert.deepEqual(s.policy.monitoredKinds, [OperationKind.Test, OperationKind.Build]);
    });

    it('de-duplicates repeated kinds', () => {
      const s = toSkillIssueSettings({ monitoredKinds: ['test', 'test'] });
      assert.deepEqual(s.policy.monitoredKinds, [OperationKind.Test]);
    });

    it('returns an empty list (meaning "all") for a non-array', () => {
      assert.deepEqual(toSkillIssueSettings({ monitoredKinds: 'test' }).policy.monitoredKinds, []);
    });
  });

  describe('include / exclude', () => {
    it('trims entries and drops blanks and non-strings', () => {
      const s = toSkillIssueSettings({ include: ['  test ', '', 42, 'build'] });
      assert.deepEqual(s.policy.include, ['test', 'build']);
    });

    it('returns an empty list for a non-array', () => {
      assert.deepEqual(toSkillIssueSettings({ exclude: 'test' }).policy.exclude, []);
    });
  });

  describe('repeatedFailures', () => {
    it('accepts first-only', () => {
      assert.equal(toSkillIssueSettings({ repeatedFailures: 'first-only' }).policy.repeatedFailures, 'first-only');
    });

    it('falls back to always for anything else', () => {
      assert.equal(toSkillIssueSettings({ repeatedFailures: 'sometimes' }).policy.repeatedFailures, 'always');
      assert.equal(toSkillIssueSettings({}).policy.repeatedFailures, 'always');
    });
  });

  it('never exposes reactOnFailure as configurable', () => {
    // Even with everything else disabled, a real failure stays reaction-worthy;
    // the master `enabled` switch is the user-facing control.
    const s = toSkillIssueSettings({ soundEnabled: false, monitoredKinds: [] });
    assert.equal(s.policy.reactOnFailure, true);
  });
});
