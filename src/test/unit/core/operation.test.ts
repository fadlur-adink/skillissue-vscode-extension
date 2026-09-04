import * as assert from 'node:assert/strict';
import { createOperation, OperationKind, operationKey } from '../../../core/operation';

describe('core/operation', () => {
  it('createOperation applies defaults for kind and source', () => {
    const op = createOperation({ id: '1', name: 'build', startedAt: 1000 });
    assert.equal(op.kind, OperationKind.Unknown);
    assert.equal(op.source, 'unknown');
    assert.equal('workspaceFolder' in op, false, 'omitted workspaceFolder should not be present');
  });

  it('createOperation preserves every provided value', () => {
    const op = createOperation({
      id: 'run-42',
      name: 'npm test',
      startedAt: 5,
      kind: OperationKind.Test,
      source: 'terminal',
      workspaceFolder: 'repo',
    });
    assert.deepEqual(op, {
      id: 'run-42',
      name: 'npm test',
      startedAt: 5,
      kind: OperationKind.Test,
      source: 'terminal',
      workspaceFolder: 'repo',
    });
  });

  it('operationKey ignores the per-run id so reruns collapse together', () => {
    const a = createOperation({ id: '1', name: 'tsc', startedAt: 1, source: 'task' });
    const b = createOperation({ id: '2', name: 'tsc', startedAt: 2, source: 'task' });
    assert.equal(operationKey(a), operationKey(b));
  });

  it('operationKey differs by name, source and workspace folder', () => {
    const base = { id: 'x', startedAt: 0 };
    const keys = [
      operationKey(createOperation({ ...base, name: 'a', source: 'task' })),
      operationKey(createOperation({ ...base, name: 'b', source: 'task' })),
      operationKey(createOperation({ ...base, name: 'a', source: 'terminal' })),
      operationKey(createOperation({ ...base, name: 'a', source: 'task', workspaceFolder: 'w' })),
    ];
    assert.equal(new Set(keys).size, 4, 'expected all four keys to be distinct');
  });
});
