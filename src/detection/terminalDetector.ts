import * as vscode from 'vscode';
import { WorkflowEvent } from '../core/events';
import { Logger } from '../logging/logger';
import { terminalWorkflowEvent } from './commandMapping';

/**
 * Minimal structural shim for the VS Code Terminal Shell Execution API.
 *
 * `window.onDidEndTerminalShellExecution` is newer than this extension's pinned
 * `@types/vscode` (1.90), so it is not in the compile-time type surface. Rather
 * than raise the engine requirement, the detector reaches the API through this
 * locally-scoped shim plus a runtime feature check. That keeps the whole feature
 * a progressive enhancement: on a VS Code without the API (or without shell
 * integration active) the detector simply never fires and never throws.
 *
 * Only the fields SkillIssue reads are declared, and every one is optional/loose
 * so an unexpected runtime shape degrades to "ignore this event" instead of
 * crashing — a meme must never become a workflow failure.
 */
interface TerminalCommandLineShim {
  readonly value?: unknown;
}
interface TerminalExecutionShim {
  readonly commandLine?: TerminalCommandLineShim;
}
interface TerminalShellExecutionEndEventShim {
  readonly execution?: TerminalExecutionShim;
  readonly exitCode?: unknown;
}
interface TerminalShellExecutionApiShim {
  readonly onDidEndTerminalShellExecution?: (
    listener: (event: TerminalShellExecutionEndEventShim) => unknown,
  ) => vscode.Disposable;
}

/**
 * Observes commands run in the integrated terminal and translates the ones that
 * look like a build / test / lint / compile into SkillIssue domain events.
 *
 * This is the terminal counterpart to {@link TaskDetector}: a command typed into
 * a terminal is not a VS Code task, so the Tasks API never reports it. Like the
 * task detector it is strictly observational — it only subscribes to a VS Code
 * event and never influences the command, its exit code, or its output. All
 * classification lives in the pure `commandMapping` module; this class only wires
 * the (defensively accessed) VS Code event to it and manages listener lifecycle.
 *
 * Two guards keep the terminal from becoming a source of noise:
 * - the event only fires when shell integration is active, so detection silently
 *   no-ops otherwise;
 * - `commandMapping` filters out ordinary commands (`ls`, `git`, `grep`, …), so
 *   only real build/test/lint/compile runs are ever emitted.
 */
export class TerminalExecutionDetector implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<WorkflowEvent>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];
  private runCounter = 0;

  /** Fires for every recognised terminal command that finished. */
  readonly onWorkflowEvent: vscode.Event<WorkflowEvent> = this.emitter.event;

  /** Whether the host VS Code exposes the Terminal Shell Execution API. */
  readonly available: boolean;

  constructor(
    private readonly logger: Logger,
    private readonly isEnabled: () => boolean = () => true,
  ) {
    const api = vscode.window as unknown as TerminalShellExecutionApiShim;
    if (typeof api.onDidEndTerminalShellExecution === 'function') {
      this.available = true;
      this.disposables.push(
        api.onDidEndTerminalShellExecution((event) => this.handleEnd(event)),
      );
      this.logger.debug('TerminalExecutionDetector subscribed to terminal shell execution');
    } else {
      this.available = false;
      this.logger.debug(
        'TerminalExecutionDetector disabled: onDidEndTerminalShellExecution is unavailable',
      );
    }
  }

  private handleEnd(event: TerminalShellExecutionEndEventShim): void {
    try {
      if (!this.isEnabled()) {
        return;
      }
      const commandLine = event.execution?.commandLine?.value;
      if (typeof commandLine !== 'string' || commandLine.trim().length === 0) {
        return;
      }
      const workflowEvent = terminalWorkflowEvent(
        commandLine,
        toExitCode(event.exitCode),
        `terminal-${++this.runCounter}`,
        Date.now(),
      );
      if (workflowEvent === undefined) {
        return; // not a build/test/lint/compile — ordinary shell noise
      }
      this.logger.debug(`Terminal command observed: ${commandLine.trim()}`);
      this.emitter.fire(workflowEvent);
    } catch (error) {
      // Never let a SkillIssue bug interfere with the developer's terminal.
      this.logger.error('Failed to handle terminal shell execution', error);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}

/** Reads the reported exit code defensively; anything non-numeric is undefined. */
function toExitCode(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
