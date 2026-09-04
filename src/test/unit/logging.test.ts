import * as assert from 'node:assert/strict';
import { createNoopLogger, formatLogLine, LogLevel } from '../../logging/logger';

/**
 * Unit tests for the pure logging primitives.
 *
 * These run with plain Mocha (no VS Code required), which is exactly the point:
 * logic that does not depend on the `vscode` API must be testable in isolation.
 */
describe('logging', () => {
  describe('formatLogLine', () => {
    it('renders an ISO timestamp, the upper-cased level and the message', () => {
      const line = formatLogLine(LogLevel.Info, 'hello', new Date('2024-01-02T03:04:05.678Z'));
      assert.equal(line, '[2024-01-02T03:04:05.678Z] [INFO] hello');
    });

    it('upper-cases every level', () => {
      const at = new Date('2024-01-02T03:04:05.678Z');
      assert.match(formatLogLine(LogLevel.Debug, 'd', at), /\[DEBUG\]/);
      assert.match(formatLogLine(LogLevel.Warn, 'w', at), /\[WARN\]/);
      assert.match(formatLogLine(LogLevel.Error, 'e', at), /\[ERROR\]/);
    });
  });

  describe('createNoopLogger', () => {
    it('accepts every call (including errors) without throwing', () => {
      const logger = createNoopLogger();
      assert.doesNotThrow(() => {
        logger.debug('d');
        logger.info('i');
        logger.warn('w');
        logger.error('e', new Error('boom'));
      });
    });
  });
});
