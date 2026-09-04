import * as assert from 'node:assert/strict';
import { isCompletedEvent } from '../../../core/events';
import { OperationKind } from '../../../core/operation';
import { OutcomeKind } from '../../../core/outcome';
import {
  classifyCommandLine,
  summarizeCommand,
  terminalWorkflowEvent,
} from '../../../detection/commandMapping';

describe('detection/commandMapping', () => {
  describe('classifyCommandLine — package managers', () => {
    it('classifies a script by its semantic name', () => {
      assert.equal(classifyCommandLine('yarn build'), OperationKind.Build);
      assert.equal(classifyCommandLine('npm test'), OperationKind.Test);
      assert.equal(classifyCommandLine('pnpm lint'), OperationKind.Lint);
      assert.equal(classifyCommandLine('bun test'), OperationKind.Test);
      assert.equal(classifyCommandLine('yarn build:prod'), OperationKind.Build);
    });

    it('sees through the run/run-script word', () => {
      assert.equal(classifyCommandLine('npm run build'), OperationKind.Build);
      assert.equal(classifyCommandLine('npm run-script typecheck'), OperationKind.Compile);
      assert.equal(classifyCommandLine('pnpm r test'), OperationKind.Test);
    });

    it('stays silent on package management and dev servers', () => {
      assert.equal(classifyCommandLine('npm install'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('yarn add left-pad'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('yarn dev'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('npm start'), OperationKind.Unknown);
    });
  });

  describe('classifyCommandLine — standalone tools', () => {
    it('recognises test, lint, compile and build tools', () => {
      assert.equal(classifyCommandLine('jest'), OperationKind.Test);
      assert.equal(classifyCommandLine('vitest run'), OperationKind.Test);
      assert.equal(classifyCommandLine('eslint .'), OperationKind.Lint);
      assert.equal(classifyCommandLine('tsc --noEmit'), OperationKind.Compile);
      assert.equal(classifyCommandLine('make'), OperationKind.Build);
      assert.equal(classifyCommandLine('webpack'), OperationKind.Build);
    });

    it('recognises a tool invoked by path', () => {
      assert.equal(classifyCommandLine('./node_modules/.bin/tsc'), OperationKind.Compile);
      assert.equal(classifyCommandLine('node_modules/.bin/eslint src'), OperationKind.Lint);
    });
  });

  describe('classifyCommandLine — subcommand tools', () => {
    it('classifies only the meaningful subcommand', () => {
      assert.equal(classifyCommandLine('next build'), OperationKind.Build);
      assert.equal(classifyCommandLine('vite build'), OperationKind.Build);
      assert.equal(classifyCommandLine('cargo test'), OperationKind.Test);
      assert.equal(classifyCommandLine('cargo clippy'), OperationKind.Lint);
      assert.equal(classifyCommandLine('go build'), OperationKind.Build);
      assert.equal(classifyCommandLine('go vet'), OperationKind.Lint);
    });

    it('ignores dev servers and non-finishing subcommands', () => {
      assert.equal(classifyCommandLine('next dev'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('vite'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('go run .'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('cargo run'), OperationKind.Unknown);
    });
  });

  describe('classifyCommandLine — wrappers & environment prefixes', () => {
    it('skips env assignments and wrappers to find the real tool', () => {
      assert.equal(classifyCommandLine('NODE_ENV=production next build'), OperationKind.Build);
      assert.equal(classifyCommandLine('sudo yarn build'), OperationKind.Build);
      assert.equal(classifyCommandLine('npx jest'), OperationKind.Test);
      assert.equal(classifyCommandLine('npx tsc'), OperationKind.Compile);
      assert.equal(classifyCommandLine('env CI=true npm test'), OperationKind.Test);
    });
  });

  describe('classifyCommandLine — ordinary shell noise', () => {
    it('never classifies day-to-day commands', () => {
      assert.equal(classifyCommandLine('ls -la'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('grep foo bar.txt'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('git status'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('cd src'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('echo hi'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('cat package.json'), OperationKind.Unknown);
    });

    it('is Unknown for an empty or wrapper-only line', () => {
      assert.equal(classifyCommandLine(''), OperationKind.Unknown);
      assert.equal(classifyCommandLine('   '), OperationKind.Unknown);
      assert.equal(classifyCommandLine('FOO=bar'), OperationKind.Unknown);
      assert.equal(classifyCommandLine('npx'), OperationKind.Unknown);
    });
  });

  describe('summarizeCommand', () => {
    it('leaves a short command untouched', () => {
      assert.equal(summarizeCommand('yarn build'), 'yarn build');
    });

    it('collapses surrounding and repeated whitespace', () => {
      assert.equal(summarizeCommand('  yarn    build  '), 'yarn build');
    });

    it('truncates with an ellipsis at an explicit max length', () => {
      assert.equal(summarizeCommand('yarn build --verbose', 10), 'yarn buil…');
    });

    it('truncates at the default 100 characters', () => {
      const summary = summarizeCommand(`next build ${'x'.repeat(120)}`);
      assert.equal(summary.length, 100);
      assert.match(summary, /^next build /);
      assert.match(summary, /…$/);
    });
  });

  describe('terminalWorkflowEvent', () => {
    it('returns undefined for shell noise so the detector stays silent', () => {
      assert.equal(terminalWorkflowEvent('ls -la', 1, 'run-1', 1000), undefined);
      assert.equal(terminalWorkflowEvent('git status', 128, 'run-2', 1000), undefined);
      assert.equal(terminalWorkflowEvent('yarn dev', 0, 'run-3', 1000), undefined);
    });

    it('builds a completed failure event for a recognised command', () => {
      const event = terminalWorkflowEvent('yarn build', 1, 'run-9', 5000);
      if (!event || !isCompletedEvent(event)) {
        throw new Error('expected a completed event');
      }
      assert.equal(event.operation.kind, OperationKind.Build);
      assert.equal(event.operation.source, 'terminal');
      assert.equal(event.operation.id, 'run-9');
      assert.equal(event.operation.name, 'yarn build');
      assert.equal(event.finishedAt, 5000);
      if (event.outcome.kind !== OutcomeKind.Failure) {
        throw new Error('expected a failure outcome');
      }
      assert.equal(event.outcome.exitCode, 1);
    });

    it('reports success for a zero exit code', () => {
      const event = terminalWorkflowEvent('npm test', 0, 'run-10', 6000);
      if (!event || !isCompletedEvent(event)) {
        throw new Error('expected a completed event');
      }
      assert.equal(event.outcome.kind, OutcomeKind.Success);
    });

    it('reports unknown (never a guessed cancellation) when no exit code arrives', () => {
      const event = terminalWorkflowEvent('next build', undefined, 'run-11', 7000);
      if (!event || !isCompletedEvent(event)) {
        throw new Error('expected a completed event');
      }
      assert.equal(event.outcome.kind, OutcomeKind.Unknown);
    });

    it('uses the summarized command as the operation name', () => {
      const event = terminalWorkflowEvent('  next   build  ', 2, 'run-12', 8000);
      if (!event || !isCompletedEvent(event)) {
        throw new Error('expected a completed event');
      }
      assert.equal(event.operation.name, 'next build');
    });
  });
});
