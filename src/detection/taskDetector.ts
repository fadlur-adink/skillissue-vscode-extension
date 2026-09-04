import * as vscode from 'vscode';
import { operationCompleted, operationStarted, WorkflowEvent } from '../core/events';
import { Operation } from '../core/operation';
import { Logger } from '../logging/logger';
import { buildTaskInfo, buildTaskOperation, outcomeFromExitCode, TaskInfo } from './taskMapping';

/**
 * Observes VS Code task executions and translates them into SkillIssue domain
 * events.
 *
 * The Tasks API is used because it provides the strongest completion signal VS
 * Code exposes: `onDidEndTaskProcess` reports the task process **exit code**.
 * Terminal *text* is deliberately not parsed (see ARCHITECTURE.md).
 *
 * This detector is strictly observational: it only subscribes to `vscode.tasks`
 * events and never influences how a task runs, its exit code, or its output. All
 * decision logic lives in the pure `taskMapping` module; this class only wires
 * VS Code events to it and manages listener lifecycle.
 */
export class TaskDetector implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<WorkflowEvent>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];
  private readonly inFlight = new Map<vscode.TaskExecution, Operation>();
  private runCounter = 0;

  /** Fires for every observed task lifecycle event (started / completed). */
  readonly onWorkflowEvent: vscode.Event<WorkflowEvent> = this.emitter.event;

  constructor(private readonly logger: Logger) {
    this.disposables.push(
      vscode.tasks.onDidStartTaskProcess((event) => this.handleStart(event)),
      vscode.tasks.onDidEndTaskProcess((event) => this.handleEnd(event)),
    );
    this.logger.debug('TaskDetector subscribed to vscode.tasks process events');
  }

  private handleStart(event: vscode.TaskProcessStartEvent): void {
    try {
      const info = this.toTaskInfo(event.execution);
      const operation = buildTaskOperation(info);
      this.inFlight.set(event.execution, operation);
      this.logger.debug(
        `Task started: ${operation.name} [kind=${operation.kind}` +
          `${info.isBackground ? ', background' : ''}]`,
      );
      this.emitter.fire(operationStarted(operation));
    } catch (error) {
      // Never let a SkillIssue bug interfere with the developer's task.
      this.logger.error('Failed to handle task start', error);
    }
  }

  private handleEnd(event: vscode.TaskProcessEndEvent): void {
    try {
      const started = this.inFlight.get(event.execution);
      this.inFlight.delete(event.execution);
      // Fall back to reconstructing the operation if we missed the start event
      // (e.g. the extension activated while a task was already running).
      const operation = started ?? buildTaskOperation(this.toTaskInfo(event.execution));
      const outcome = outcomeFromExitCode(event.exitCode);
      this.logger.debug(`Task ended: ${operation.name} (exitCode=${String(event.exitCode)})`);
      this.emitter.fire(operationCompleted(operation, outcome, Date.now()));
    } catch (error) {
      this.logger.error('Failed to handle task end', error);
    }
  }

  private toTaskInfo(execution: vscode.TaskExecution): TaskInfo {
    // The pure `buildTaskInfo` owns which task fields matter; the detector only
    // supplies the run id and start time. This keeps the extraction unit-testable
    // offline (see detection/taskMapping) and this class a thin VS Code adapter.
    return buildTaskInfo(execution.task, `task-${++this.runCounter}`, Date.now());
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.inFlight.clear();
  }
}
