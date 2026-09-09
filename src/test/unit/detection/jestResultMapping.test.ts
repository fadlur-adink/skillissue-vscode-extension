import * as assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { OutcomeKind } from '../../../core/outcome';
import {
  JestResultSnapshot,
  jestResultOutcome,
  jestResultWorkflowEvent,
  sanitizeFileSuffix,
  workspaceForJestResult,
  workspaceForJestResultFile,
} from '../../../detection/jestResultMapping';

const workspacePath = resolve('work', 'app');
const failedReport: JestResultSnapshot = {
  success: false,
  startTime: 100,
  numFailedTests: 1,
  numFailedTestSuites: 1,
  numTotalTests: 1,
  testResults: [{ name: join(workspacePath, 'src', 'example.test.ts'), endTime: 250 }],
};

describe('detection/jestResultMapping', () => {
  describe('jestResultOutcome', () => {
    it('maps a failed Jest report to failure', () => {
      assert.equal(jestResultOutcome(failedReport).kind, OutcomeKind.Failure);
    });

    it('maps runtime suite errors to failure even when success is missing', () => {
      assert.equal(
        jestResultOutcome({ numRuntimeErrorTestSuites: 1 }).kind,
        OutcomeKind.Failure,
      );
    });

    it('maps successful and interrupted reports', () => {
      assert.equal(jestResultOutcome({ success: true }).kind, OutcomeKind.Success);
      assert.equal(
        jestResultOutcome({ success: false, wasInterrupted: true }).kind,
        OutcomeKind.Cancelled,
      );
    });

    it('does not guess when no final result is exposed', () => {
      assert.equal(jestResultOutcome({ testResults: [] }).kind, OutcomeKind.Unknown);
    });
  });

  describe('jestResultWorkflowEvent', () => {
    it('builds a completed test-explorer event for one suite', () => {
      const event = jestResultWorkflowEvent({
        runId: 'run-1',
        report: failedReport,
        observedAt: 300,
        workspace: { name: 'app', fsPath: workspacePath },
      });

      assert.equal(event.type, 'completed');
      assert.equal(event.operation.id, 'run-1');
      assert.equal(event.operation.name, `Jest: ${join('src', 'example.test.ts')}`);
      assert.equal(event.operation.kind, 'test');
      assert.equal(event.operation.source, 'testExplorer');
      assert.equal(event.operation.workspaceFolder, 'app');
      assert.equal(event.operation.startedAt, 100);
      assert.equal(event.finishedAt, 250);
      assert.equal(event.outcome.kind, OutcomeKind.Failure);
    });

    it('summarizes multi-suite reports and falls back to observation time', () => {
      const event = jestResultWorkflowEvent({
        runId: 'run-2',
        report: {
          success: true,
          testResults: [{ name: '/a/one.test.ts' }, { name: '/a/two.test.ts' }],
        },
        observedAt: 500,
      });

      assert.equal(event.operation.name, 'Jest: 2 test suites');
      assert.equal(event.operation.startedAt, 500);
      assert.equal(event.finishedAt, 500);
    });

    it('does not derive outcomes from arbitrary output text', () => {
      const event = jestResultWorkflowEvent({
        runId: 'run-3',
        report: { testResults: [], output: 'Test Suites: 1 failed' } as JestResultSnapshot,
        observedAt: 700,
      });
      assert.equal(event.outcome.kind, OutcomeKind.Unknown);
    });
  });

  describe('workspace matching', () => {
    it('selects the most specific workspace containing a suite path', () => {
      const workspace = workspaceForJestResult(failedReport, [
        { name: 'root', fsPath: resolve('work') },
        { name: 'app', fsPath: workspacePath },
      ]);
      assert.equal(workspace?.name, 'app');
    });

    it('does not match a sibling path with the same prefix', () => {
      const workspace = workspaceForJestResult(
        { success: false, testResults: [{ name: join(resolve('work'), 'application', 'x.test.ts') }] },
        [{ name: 'app', fsPath: workspacePath }],
      );
      assert.equal(workspace, undefined);
    });

    it('matches vscode-jest report filenames, including its second queue', () => {
      const workspaces = [{ name: 'fincen-fe', fsPath: '/work/fincen-fe' }];
      assert.equal(
        workspaceForJestResultFile('jest_runner_fincen_fe_1000.json', workspaces, '1000')?.name,
        'fincen-fe',
      );
      assert.equal(
        workspaceForJestResultFile('jest_runner_fincen_fe_1000_2.json', workspaces, '1000')?.name,
        'fincen-fe',
      );
    });

    it('rejects report files belonging to a different workspace or user', () => {
      const workspaces = [{ name: 'app', fsPath: '/work/app' }];
      assert.equal(
        workspaceForJestResultFile('jest_runner_other_1000.json', workspaces, '1000'),
        undefined,
      );
      assert.equal(
        workspaceForJestResultFile('jest_runner_app_2000.json', workspaces, '1000'),
        undefined,
      );
    });

    it('sanitizes suffixes exactly like vscode-jest', () => {
      assert.equal(sanitizeFileSuffix('My App_1000'), 'my_app_1000');
    });
  });
});
