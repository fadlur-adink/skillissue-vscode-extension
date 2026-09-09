import * as assert from 'node:assert/strict';
import { JestResultDetector } from '../../detection/jestResultDetector';
import { createNoopLogger } from '../../logging/logger';

/** Lifecycle coverage; pure Jest result semantics live in the unit suite. */
describe('JestResultDetector (integration)', () => {
  it('constructs and disposes against the real host', () => {
    assert.doesNotThrow(() => new JestResultDetector(createNoopLogger(), () => true).dispose());
  });

  it('exposes an event and allows unsubscribing', () => {
    const detector = new JestResultDetector(createNoopLogger(), () => true);
    const subscription = detector.onWorkflowEvent(() => undefined);
    assert.doesNotThrow(() => subscription.dispose());
    detector.dispose();
  });

  it('is safe to dispose more than once', () => {
    const detector = new JestResultDetector(createNoopLogger(), () => false);
    detector.dispose();
    assert.doesNotThrow(() => detector.dispose());
  });
});
