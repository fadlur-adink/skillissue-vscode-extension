import { basename, relative, resolve, sep } from 'node:path';
import { OperationCompleted, operationCompleted } from '../core/events';
import { createOperation, OperationKind } from '../core/operation';
import { cancelled, failure, success, unknown } from '../core/outcome';

/** The stable subset of Jest's JSON report consumed by SkillIssue. */
export interface JestResultSnapshot {
  readonly success?: unknown;
  readonly wasInterrupted?: unknown;
  readonly startTime?: unknown;
  readonly numFailedTests?: unknown;
  readonly numFailedTestSuites?: unknown;
  readonly numRuntimeErrorTestSuites?: unknown;
  readonly numTotalTests?: unknown;
  readonly testResults?: unknown;
}

export interface JestTestSuiteSnapshot {
  readonly name?: unknown;
  readonly endTime?: unknown;
}

export interface JestWorkspace {
  readonly name: string;
  readonly fsPath: string;
}

export interface JestResultInfo {
  readonly runId: string;
  readonly report: JestResultSnapshot;
  readonly observedAt: number;
  readonly workspace?: JestWorkspace;
}

/** Maps one complete Jest JSON report onto the shared workflow domain model. */
export function jestResultWorkflowEvent(info: JestResultInfo): OperationCompleted {
  const suites = testSuites(info.report.testResults);
  const operation = createOperation({
    id: info.runId,
    name: operationName(suites, info.workspace),
    kind: OperationKind.Test,
    source: 'testExplorer',
    workspaceFolder: info.workspace?.name,
    startedAt: finiteNumber(info.report.startTime) ?? info.observedAt,
  });

  return operationCompleted(
    operation,
    jestResultOutcome(info.report),
    finishedAt(suites, info.observedAt),
  );
}

export function jestResultOutcome(report: JestResultSnapshot) {
  if (report.wasInterrupted === true) {
    return cancelled();
  }

  const failed = [
    report.numFailedTests,
    report.numFailedTestSuites,
    report.numRuntimeErrorTestSuites,
  ].some((value) => (finiteNumber(value) ?? 0) > 0);

  if (failed || report.success === false) {
    return failure();
  }
  if (report.success === true) {
    return success();
  }
  return unknown('Jest report did not expose a final result');
}

/** Selects the current workspace represented by the report's suite paths. */
export function workspaceForJestResult(
  report: JestResultSnapshot,
  workspaces: readonly JestWorkspace[],
): JestWorkspace | undefined {
  const paths = testSuites(report.testResults)
    .map((suite) => (typeof suite.name === 'string' ? suite.name : undefined))
    .filter((name): name is string => name !== undefined);

  return [...workspaces]
    .sort((left, right) => right.fsPath.length - left.fsPath.length)
    .find((workspace) => paths.some((testPath) => isInsideWorkspace(testPath, workspace.fsPath)));
}

/** Matches vscode-jest's `jest_runner_<workspace>_<user>[_2].json` convention. */
export function workspaceForJestResultFile(
  filename: string,
  workspaces: readonly JestWorkspace[],
  userId: string,
): JestWorkspace | undefined {
  return workspaces.find((workspace) => {
    const suffix = sanitizeFileSuffix(`${workspace.name}_${userId}`);
    return filename === `jest_runner_${suffix}.json` || filename === `jest_runner_${suffix}_2.json`;
  });
}

export function sanitizeFileSuffix(value: string): string {
  return value.replace(/\W/g, '_').toLowerCase();
}

function operationName(
  suites: readonly JestTestSuiteSnapshot[],
  workspace: JestWorkspace | undefined,
): string {
  const paths = suites
    .map((suite) => (typeof suite.name === 'string' ? suite.name : undefined))
    .filter((name): name is string => name !== undefined);

  if (paths.length === 1) {
    const displayPath = workspace ? relative(workspace.fsPath, paths[0]) : basename(paths[0]);
    return `Jest: ${displayPath || basename(paths[0])}`;
  }
  if (paths.length > 1) {
    return `Jest: ${paths.length} test suites`;
  }
  return 'Jest test run';
}

function finishedAt(suites: readonly JestTestSuiteSnapshot[], fallback: number): number {
  const endTimes = suites
    .map((suite) => finiteNumber(suite.endTime))
    .filter((value): value is number => value !== undefined);
  return endTimes.length > 0 ? Math.max(...endTimes) : fallback;
}

function testSuites(value: unknown): readonly JestTestSuiteSnapshot[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JestTestSuiteSnapshot => isRecord(entry))
    : [];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isInsideWorkspace(filePath: string, workspacePath: string): boolean {
  const relativePath = relative(resolve(workspacePath), resolve(filePath));
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
