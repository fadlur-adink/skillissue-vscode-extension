import * as assert from 'node:assert/strict';
import { OperationKind } from '../../../core/operation';
import { OutcomeKind } from '../../../core/outcome';
import {
  buildTaskInfo,
  buildTaskOperation,
  classifyTaskKind,
  commandFromDefinition,
  outcomeFromExitCode,
  TaskInfo,
  workspaceFolderName,
} from '../../../detection/taskMapping';

describe('detection/taskMapping', () => {
  describe('outcomeFromExitCode', () => {
    it('maps exit code 0 to success', () => {
      assert.equal(outcomeFromExitCode(0).kind, OutcomeKind.Success);
    });

    it('maps a non-zero exit code to failure carrying the code', () => {
      const outcome = outcomeFromExitCode(3);
      if (outcome.kind !== OutcomeKind.Failure) {
        throw new Error('expected a failure outcome');
      }
      assert.equal(outcome.exitCode, 3);
    });

    it('maps a missing exit code to unknown (not a guessed cancellation)', () => {
      assert.equal(outcomeFromExitCode(undefined).kind, OutcomeKind.Unknown);
      assert.equal(outcomeFromExitCode(null).kind, OutcomeKind.Unknown);
    });
  });

  describe('classifyTaskKind', () => {
    const makeInfo = (overrides: Partial<TaskInfo>): TaskInfo => ({
      runId: 'task-1',
      name: 'task',
      startedAt: 0,
      ...overrides,
    });

    it('prefers a specific definition type (tsc, eslint, gulp)', () => {
      assert.equal(classifyTaskKind(makeInfo({ definitionType: 'tsc' })), OperationKind.Compile);
      assert.equal(classifyTaskKind(makeInfo({ definitionType: 'eslint' })), OperationKind.Lint);
      assert.equal(classifyTaskKind(makeInfo({ definitionType: 'gulp' })), OperationKind.Build);
    });

    it('refines package-manager tasks by their script name', () => {
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'npm', command: 'test' })),
        OperationKind.Test,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'npm', command: 'build' })),
        OperationKind.Build,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'npm', command: 'lint' })),
        OperationKind.Lint,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'npm', command: 'typecheck' })),
        OperationKind.Compile,
      );
    });

    it('falls back to Script for a package-manager task with a non-semantic script', () => {
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'npm', command: 'dev' })),
        OperationKind.Script,
      );
      assert.equal(classifyTaskKind(makeInfo({ definitionType: 'pnpm' })), OperationKind.Script);
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'yarn', command: 'start' })),
        OperationKind.Script,
      );
    });

    it('uses the VS Code task group when the definition type is generic', () => {
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', group: 'test' })),
        OperationKind.Test,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', group: 'build' })),
        OperationKind.Build,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'process', group: 'rebuild' })),
        OperationKind.Build,
      );
    });

    it('uses attached problem matchers as a tool hint', () => {
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', problemMatchers: ['$tsc'] })),
        OperationKind.Compile,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', problemMatchers: ['$eslint'] })),
        OperationKind.Lint,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', problemMatchers: ['$jest'] })),
        OperationKind.Test,
      );
    });

    it('uses the provider source as a signal', () => {
      assert.equal(classifyTaskKind(makeInfo({ source: 'TypeScript' })), OperationKind.Compile);
      assert.equal(
        classifyTaskKind(makeInfo({ source: 'npm', command: 'test:unit' })),
        OperationKind.Test,
      );
      assert.equal(classifyTaskKind(makeInfo({ source: 'gulp' })), OperationKind.Build);
    });

    it('classifies a shell command by its tool token as a last resort', () => {
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', command: 'npx jest --watch' })),
        OperationKind.Test,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'process', command: '/usr/local/bin/tsc' })),
        OperationKind.Compile,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', command: 'eslint src/' })),
        OperationKind.Lint,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', command: 'webpack --mode production' })),
        OperationKind.Build,
      );
    });

    it('does not guess for ambiguous dev-server tools', () => {
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', command: 'next dev' })),
        OperationKind.Unknown,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', command: 'vite' })),
        OperationKind.Unknown,
      );
    });

    it('never matches a tool name as a substring of another token', () => {
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', command: 'protest-tool' })),
        OperationKind.Unknown,
      );
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'shell', command: 'greatest' })),
        OperationKind.Unknown,
      );
    });

    it('gives a specific definition type priority over the group', () => {
      // The TypeScript provider files `tsc --build` under the Build group, but the
      // precise Compile kind is more useful for `monitoredKinds` filtering.
      assert.equal(
        classifyTaskKind(makeInfo({ definitionType: 'tsc', group: 'build' })),
        OperationKind.Compile,
      );
    });

    it('resolves to Unknown when no signal applies', () => {
      assert.equal(classifyTaskKind(makeInfo({ definitionType: 'shell' })), OperationKind.Unknown);
      assert.equal(classifyTaskKind(makeInfo({})), OperationKind.Unknown);
    });
  });

  describe('buildTaskOperation', () => {
    const info: TaskInfo = {
      runId: 'task-7',
      name: 'npm: test',
      definitionType: 'npm',
      workspaceFolder: 'api',
      startedAt: 123,
    };

    it('builds a task-sourced operation with the classified kind', () => {
      assert.deepEqual(buildTaskOperation(info), {
        id: 'task-7',
        name: 'npm: test',
        kind: OperationKind.Script,
        source: 'task',
        workspaceFolder: 'api',
        startedAt: 123,
      });
    });

    it('omits workspaceFolder when the task is not folder-scoped', () => {
      const op = buildTaskOperation({ ...info, workspaceFolder: undefined });
      assert.equal('workspaceFolder' in op, false);
    });
  });

  describe('buildTaskInfo', () => {
    it('extracts every field SkillIssue classifies from an npm-style task', () => {
      const info = buildTaskInfo(
        {
          name: 'npm: test',
          source: 'npm',
          isBackground: false,
          problemMatchers: ['$jest'],
          group: { id: 'test' },
          definition: { type: 'npm', script: 'test' },
          scope: { name: 'api' },
        },
        'task-42',
        1000,
      );
      assert.deepEqual(info, {
        runId: 'task-42',
        name: 'npm: test',
        definitionType: 'npm',
        group: 'test',
        source: 'npm',
        problemMatchers: ['$jest'],
        command: 'test',
        isBackground: false,
        workspaceFolder: 'api',
        startedAt: 1000,
      });
    });

    it('captures the background flag and group for a folder-less shell task', () => {
      const info = buildTaskInfo(
        {
          name: 'watch',
          isBackground: true,
          group: { id: 'build' },
          definition: { type: 'shell', command: 'tsc -w' },
        },
        'task-1',
        0,
      );
      assert.equal(info.isBackground, true);
      assert.equal(info.group, 'build');
      assert.equal(info.command, 'tsc -w');
      assert.equal(info.workspaceFolder, undefined);
    });
  });

  describe('commandFromDefinition', () => {
    it('prefers an explicit command over the script name', () => {
      assert.equal(
        commandFromDefinition({ type: 'shell', command: 'jest', script: 'test' }),
        'jest',
      );
    });

    it('falls back to the script name when there is no command', () => {
      assert.equal(commandFromDefinition({ type: 'npm', script: 'build' }), 'build');
    });

    it('ignores empty, non-string and absent values', () => {
      assert.equal(commandFromDefinition({ type: 'shell', command: '' }), undefined);
      assert.equal(commandFromDefinition({ type: 'shell', command: 42 }), undefined);
      assert.equal(commandFromDefinition({ type: 'shell' }), undefined);
      assert.equal(commandFromDefinition(undefined), undefined);
    });
  });

  describe('workspaceFolderName', () => {
    it('returns the folder name for a folder-scoped task', () => {
      assert.equal(workspaceFolderName({ name: 'api' }), 'api');
    });

    it('returns undefined for a numeric TaskScope', () => {
      assert.equal(workspaceFolderName(1), undefined);
      assert.equal(workspaceFolderName(2), undefined);
    });

    it('returns undefined when the task has no scope', () => {
      assert.equal(workspaceFolderName(undefined), undefined);
    });
  });
});
