import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { SkillIssueConfig } from '../../config/skillIssueConfig';
import { createNoopLogger } from '../../logging/logger';

/**
 * Integration coverage for the VS Code-backed settings adapter.
 *
 * The pure mapping and validation rules are exhaustively unit tested in
 * `config/settings`; what genuinely needs VS Code is the wiring around
 * `workspace.getConfiguration('skillissue')` and `onDidChangeConfiguration`.
 * These tests assert the *contract* (types, ranges, the internal
 * `reactOnFailure` invariant, live reload) rather than specific user values, so
 * a developer's own settings can never make the suite flaky. Writes go to the
 * **Global** target, which `@vscode/test-cli` isolates in a throwaway
 * `--user-data-dir` (`.vscode-test/user-data`), so a developer's real settings
 * are never touched; the override is cleared again in a `finally`.
 */
describe('SkillIssueConfig (integration)', () => {
  it('reads typed, validated settings from the real configuration API', () => {
    const config = new SkillIssueConfig(createNoopLogger());
    const settings = config.read();

    assert.equal(typeof settings.soundEnabled, 'boolean');
    assert.equal(typeof settings.volume, 'number');
    assert.equal(typeof settings.durationMs, 'number');
    assert.equal(typeof settings.cooldownMs, 'number');

    // Validation invariants hold whatever the user has configured.
    assert.ok(settings.volume >= 0 && settings.volume <= 1, 'volume stays within [0, 1]');
    assert.ok(settings.durationMs >= 0, 'duration is never negative');
    assert.ok(settings.cooldownMs >= 0, 'cooldown is never negative');
    assert.ok(Array.isArray(settings.policy.monitoredKinds));
    // Not user-exposed: SkillIssue always reacts to failures when enabled.
    assert.equal(settings.policy.reactOnFailure, true);

    config.dispose();
  });

  it('exposes a change event and is safe to dispose more than once', () => {
    const config = new SkillIssueConfig(createNoopLogger());
    assert.equal(typeof config.onDidChange, 'function');
    config.dispose();
    assert.doesNotThrow(() => config.dispose());
  });

  it('reloads and fires onDidChange when a setting is edited live', async () => {
    const config = new SkillIssueConfig(createNoopLogger());
    const workspaceConfig = vscode.workspace.getConfiguration('skillissue');
    const original = workspaceConfig.get('sound.volume');
    // Pick a value that differs from the current one so the change always fires.
    const next = original === 0.5 ? 0.75 : 0.5;

    const changed = new Promise<void>((resolve) => {
      const subscription = config.onDidChange(() => {
        subscription.dispose();
        resolve();
      });
    });

    try {
      await workspaceConfig.update(
        'sound.volume',
        next,
        vscode.ConfigurationTarget.Global,
      );
      await changed;
      assert.equal(config.read().volume, next);
    } finally {
      // Clear the override (back to the contributed default) and tear down.
      await workspaceConfig.update(
        'sound.volume',
        undefined,
        vscode.ConfigurationTarget.Global,
      );
      config.dispose();
    }
  });
});
