import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { TerminalExecutionDetector } from '../../detection/terminalDetector';
import { createNoopLogger } from '../../logging/logger';

/**
 * Lifecycle + feature-detection coverage for the integrated-terminal detector.
 *
 * These run inside VS Code, so `vscode.window` is the real API surface the
 * detector reaches through its defensive shim. Like `detection.test.ts`, they
 * deliberately avoid *executing* a real terminal command: the shell-execution end
 * event only fires when shell integration is active, which is environment-
 * dependent and would make the suite flaky. The classification that decides
 * *which* commands matter is covered exhaustively by the pure unit tests in
 * `detection/commandMapping`, and the full loop (event → policy → reaction) is
 * proven by `endToEnd.test.ts`. What is uniquely verified here is that the
 * detector's runtime feature check agrees with the real host and that its
 * listener lifecycle is safe.
 */
describe('TerminalExecutionDetector (integration)', () => {
  /** Whether the real host actually exposes the Terminal Shell Execution API. */
  const hostHasApi = (): boolean => {
    const api = vscode.window as unknown as { onDidEndTerminalShellExecution?: unknown };
    return typeof api.onDidEndTerminalShellExecution === 'function';
  };

  it('constructs against the real vscode.window without throwing', () => {
    assert.doesNotThrow(() => new TerminalExecutionDetector(createNoopLogger()).dispose());
  });

  it('reports availability that mirrors the real host API', () => {
    const detector = new TerminalExecutionDetector(createNoopLogger());
    try {
      assert.equal(typeof detector.available, 'boolean');
      assert.equal(
        detector.available,
        hostHasApi(),
        'the runtime feature check must agree with the host it runs on',
      );
    } finally {
      detector.dispose();
    }
  });

  it('exposes an event and disposes cleanly', () => {
    const detector = new TerminalExecutionDetector(createNoopLogger());
    assert.equal(typeof detector.onWorkflowEvent, 'function');
    assert.doesNotThrow(() => detector.dispose());
  });

  it('is safe to dispose more than once', () => {
    const detector = new TerminalExecutionDetector(createNoopLogger());
    detector.dispose();
    assert.doesNotThrow(() => detector.dispose());
  });

  it('allows subscribing and unsubscribing before disposal', () => {
    const detector = new TerminalExecutionDetector(createNoopLogger());
    const subscription = detector.onWorkflowEvent(() => undefined);
    assert.doesNotThrow(() => subscription.dispose());
    detector.dispose();
  });

  it('honours a disabled gate without changing its lifecycle', () => {
    const detector = new TerminalExecutionDetector(createNoopLogger(), () => false);
    assert.equal(typeof detector.onWorkflowEvent, 'function');
    assert.doesNotThrow(() => detector.dispose());
  });
});
