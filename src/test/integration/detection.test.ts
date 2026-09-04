import * as assert from 'node:assert/strict';
import { TaskDetector } from '../../detection/taskDetector';
import { createNoopLogger } from '../../logging/logger';

/**
 * Lifecycle coverage for the VS Code-facing detector.
 *
 * These run inside VS Code (so `vscode.tasks` is real). They intentionally avoid
 * executing an actual task here — the end-to-end "run a real failing task →
 * observe a failure → react" coverage lives in `endToEnd.test.ts`. The detector's
 * *decision* logic (exit code → outcome, classification) is covered exhaustively
 * by the pure unit tests in `detection/taskMapping`.
 */
describe('TaskDetector (integration)', () => {
  it('exposes an event and disposes cleanly', () => {
    const detector = new TaskDetector(createNoopLogger());
    assert.equal(typeof detector.onWorkflowEvent, 'function');
    assert.doesNotThrow(() => detector.dispose());
  });

  it('is safe to dispose more than once', () => {
    const detector = new TaskDetector(createNoopLogger());
    detector.dispose();
    assert.doesNotThrow(() => detector.dispose());
  });

  it('allows subscribing and unsubscribing before disposal', () => {
    const detector = new TaskDetector(createNoopLogger());
    const subscription = detector.onWorkflowEvent(() => undefined);
    assert.doesNotThrow(() => subscription.dispose());
    detector.dispose();
  });
});
