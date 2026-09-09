import { watch, FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { basename, join } from 'node:path';
import * as vscode from 'vscode';
import { WorkflowEvent } from '../core/events';
import { Logger } from '../logging/logger';
import {
  JestResultSnapshot,
  JestWorkspace,
  jestResultWorkflowEvent,
  workspaceForJestResultFile,
} from './jestResultMapping';

const JEST_RESULT_FILE = /^jest_runner_\w*\.json$/;
const READ_RETRY_DELAYS_MS = [20, 60, 150] as const;

/**
 * Observes the structured JSON reports produced by `orta.vscode-jest` runs.
 *
 * VS Code's stable API does not let one extension observe another extension's
 * TestRun results, and vscode-jest does not export a result API. Its runner does,
 * however, persist Jest's `--json --outputFile` report in the OS temp directory.
 * This adapter watches only that known file family and delegates all result logic
 * to the pure mapping module; it never parses the Testing Output text.
 */
export class JestResultDetector implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<WorkflowEvent>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];
  private readonly fileStates = new Map<string, string>();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private readonly userId = getUserId();
  private watcher: FSWatcher | undefined;
  private runCounter = 0;

  readonly onWorkflowEvent: vscode.Event<WorkflowEvent> = this.emitter.event;

  constructor(
    private readonly logger: Logger,
    private readonly isEnabled: () => boolean,
  ) {
    try {
      this.watcher = watch(tmpdir(), { persistent: false }, (_eventType, filename) => {
        this.handleChange(filename);
      });
      this.watcher.on('error', (error) => {
        this.logger.error('Jest result watcher failed', error);
      });
      this.logger.debug(`JestResultDetector watching ${tmpdir()} for vscode-jest reports`);
    } catch (error) {
      this.logger.error('Failed to watch for vscode-jest result reports', error);
    }
  }

  private handleChange(filename: string | Buffer | null): void {
    try {
      if (!this.isEnabled() || filename === null) {
        return;
      }
      const name = basename(filename.toString());
      if (!JEST_RESULT_FILE.test(name)) {
        return;
      }
      const previous = this.pending.get(name);
      if (previous !== undefined) {
        clearTimeout(previous);
      }
      this.scheduleRead(name, 0);
    } catch (error) {
      this.logger.error('Failed to handle Jest result file change', error);
    }
  }

  private scheduleRead(filename: string, attempt: number): void {
    const delay = READ_RETRY_DELAYS_MS[attempt] ?? READ_RETRY_DELAYS_MS.at(-1) ?? 0;
    const timer = setTimeout(() => {
      this.pending.delete(filename);
      void this.readResult(filename, attempt);
    }, delay);
    this.pending.set(filename, timer);
  }

  private async readResult(filename: string, attempt: number): Promise<void> {
    try {
      const reportText = await readFile(join(tmpdir(), filename), 'utf8');
      if (this.fileStates.get(filename) === reportText) {
        return;
      }
      const parsed: unknown = JSON.parse(reportText);
      if (!isJestResult(parsed)) {
        this.logger.debug(`Ignoring malformed Jest result report: ${filename}`);
        return;
      }

      const workspaces = vscode.workspace.workspaceFolders?.map(toWorkspace) ?? [];
      const workspace = workspaceForJestResultFile(filename, workspaces, this.userId);
      if (workspace === undefined) {
        this.logger.debug(`Ignoring Jest result outside the current workspace: ${filename}`);
        return;
      }

      this.fileStates.set(filename, reportText);
      const event = jestResultWorkflowEvent({
        runId: `test-explorer-${++this.runCounter}`,
        report: parsed,
        observedAt: Date.now(),
        workspace,
      });
      this.logger.debug(`Jest Test Explorer run ended: ${event.operation.name}`);
      this.emitter.fire(event);
    } catch (error) {
      if (attempt + 1 < READ_RETRY_DELAYS_MS.length && isTransientReadError(error)) {
        this.scheduleRead(filename, attempt + 1);
        return;
      }
      this.logger.error(`Failed to read Jest result report: ${filename}`, error);
    }
  }

  dispose(): void {
    this.watcher?.close();
    this.watcher = undefined;
    for (const timer of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
    this.fileStates.clear();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}

function toWorkspace(folder: vscode.WorkspaceFolder): JestWorkspace {
  return { name: folder.name, fsPath: folder.uri.fsPath };
}

function isJestResult(value: unknown): value is JestResultSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const result = value as Record<string, unknown>;
  return (
    typeof result.success === 'boolean' &&
    typeof result.numTotalTests === 'number' &&
    Array.isArray(result.testResults)
  );
}

function isTransientReadError(error: unknown): boolean {
  if (error instanceof SyntaxError) {
    return true;
  }
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { readonly code?: unknown }).code;
  return code === 'ENOENT' || code === 'EBUSY' || code === 'EACCES';
}

function getUserId(): string {
  try {
    const user = userInfo();
    if (user.uid >= 0) {
      return String(user.uid);
    }
    if (user.username.length > 0) {
      return user.username;
    }
  } catch {
    // Match vscode-jest's fallback when the OS user cannot be read.
  }
  return 'unknown';
}
