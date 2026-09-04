import { operationCompleted, WorkflowEvent } from '../core/events';
import { createOperation, OperationKind } from '../core/operation';
import { kindFromScriptName, outcomeFromExitCode } from './taskMapping';

/**
 * Pure translation from an integrated-terminal command line into SkillIssue
 * domain values.
 *
 * This is the terminal counterpart to `taskMapping.ts`. It exists because a
 * command typed into the integrated terminal is **not** a VS Code task, so the
 * Tasks API never sees it. Everything here is free of any `vscode` import so it
 * can be unit tested directly; the VS Code wiring lives in `terminalDetector.ts`.
 *
 * The guiding rule is *noise control*. A terminal runs thousands of commands
 * (`ls`, `cd`, `grep`, `git status`, …) whose non-zero exit codes are ordinary
 * and never a "skill issue". Classification is therefore deliberately
 * conservative: only commands that clearly look like a build / test / lint /
 * compile are recognised. Everything else resolves to
 * {@link OperationKind.Unknown}, and {@link terminalWorkflowEvent} returns
 * `undefined` for those so the detector stays silent.
 */

/** Package managers whose significant argument is a semantic script name. */
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/** Words that introduce a package-manager script name (`npm run build`). */
const RUN_WORDS = new Set(['run', 'run-script', 'r']);

/** Prefixes that wrap the real command; skipped before classifying the tool. */
const WRAPPERS = new Set(['sudo', 'env', 'time', 'nohup', 'command', 'npx', 'dlx']);

/** Standalone test runners. */
const TEST_TOOLS = new Set([
  'jest',
  'vitest',
  'mocha',
  'karma',
  'ava',
  'cypress',
  'playwright',
  'pytest',
]);

/** Standalone linters. */
const LINT_TOOLS = new Set(['eslint', 'tslint', 'stylelint', 'biome', 'ruff', 'rubocop']);

/** Standalone type checkers / compilers. */
const COMPILE_TOOLS = new Set(['tsc', 'vue-tsc', 'mypy', 'pyright']);

/** Standalone build tools. */
const BUILD_TOOLS = new Set([
  'webpack',
  'rollup',
  'parcel',
  'esbuild',
  'turbo',
  'make',
  'cmake',
  'gradle',
  'gradlew',
  'mvn',
  'mvnw',
  'msbuild',
]);

/**
 * Tools that only count as a build/test/lint when followed by a specific
 * subcommand. `next build` is a build, but `next dev` is a long-running dev
 * server we deliberately ignore (it never "finishes" with a meaningful exit
 * code, and reacting to it would be noise).
 */
const SUBCOMMAND_TOOLS: Readonly<Record<string, Readonly<Record<string, OperationKind>>>> = {
  next: { build: OperationKind.Build },
  nuxt: { build: OperationKind.Build },
  vite: { build: OperationKind.Build },
  astro: { build: OperationKind.Build },
  ng: { build: OperationKind.Build, test: OperationKind.Test },
  dotnet: { build: OperationKind.Build, test: OperationKind.Test },
  flutter: { build: OperationKind.Build, test: OperationKind.Test },
  cargo: { build: OperationKind.Build, test: OperationKind.Test, clippy: OperationKind.Lint },
  go: { build: OperationKind.Build, test: OperationKind.Test, vet: OperationKind.Lint },
};

/**
 * Classifies a raw terminal command line into an {@link OperationKind}.
 *
 * Environment assignments (`NODE_ENV=production …`) and wrappers (`sudo`, `env`,
 * `npx`, …) are skipped so the real tool token is found. Unrecognised commands
 * resolve to {@link OperationKind.Unknown}, which callers treat as "stay silent".
 */
export function classifyCommandLine(commandLine: string): OperationKind {
  const tokens = splitCommand(commandLine);
  const start = firstSignificantIndex(tokens);
  if (start >= tokens.length) {
    return OperationKind.Unknown;
  }
  return classifyTool(tokens.slice(start).map(normalizeToken));
}

/**
 * Builds the completed {@link WorkflowEvent} for a terminal command, or
 * `undefined` when the command is not a recognised build/test/lint/compile.
 * Returning `undefined` for ordinary shell noise is how the detector stays
 * silent without the caller needing to re-check the kind.
 *
 * `startedAt` is set to `finishedAt` because the terminal shell-execution API
 * only reports the end of a command, not its start; nothing downstream depends
 * on a real duration.
 */
export function terminalWorkflowEvent(
  commandLine: string,
  exitCode: number | undefined,
  runId: string,
  finishedAt: number,
): WorkflowEvent | undefined {
  const kind = classifyCommandLine(commandLine);
  if (kind === OperationKind.Unknown) {
    return undefined;
  }
  const operation = createOperation({
    id: runId,
    name: summarizeCommand(commandLine),
    startedAt: finishedAt,
    kind,
    source: 'terminal',
  });
  return operationCompleted(operation, outcomeFromExitCode(exitCode), finishedAt);
}

/**
 * Collapses a command line to a single-line label for display, truncating with an
 * ellipsis when it exceeds `maxLength`. Used as the operation `name`, which is
 * what the reaction message and the repeated-failure key are built from.
 */
export function summarizeCommand(commandLine: string, maxLength = 100): string {
  const collapsed = commandLine.trim().replace(/\s+/g, ' ');
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Index of the first token that is neither an env assignment nor a wrapper. */
function firstSignificantIndex(tokens: readonly string[]): number {
  let index = 0;
  for (const token of tokens) {
    if (!isEnvAssignment(token) && !WRAPPERS.has(normalizeToken(token))) {
      break;
    }
    index += 1;
  }
  return index;
}

/** Classifies from the significant tokens, whose first entry is the tool. */
function classifyTool(tokens: readonly string[]): OperationKind {
  const tool = tokenAt(tokens, 0);
  if (tool.length === 0) {
    return OperationKind.Unknown;
  }
  if (PACKAGE_MANAGERS.has(tool)) {
    return kindFromPackageManager(tokens);
  }
  if (TEST_TOOLS.has(tool)) {
    return OperationKind.Test;
  }
  if (LINT_TOOLS.has(tool)) {
    return OperationKind.Lint;
  }
  if (COMPILE_TOOLS.has(tool)) {
    return OperationKind.Compile;
  }
  if (BUILD_TOOLS.has(tool)) {
    return OperationKind.Build;
  }
  const subcommands = SUBCOMMAND_TOOLS[tool];
  if (subcommands) {
    return subcommands[tokenAt(tokens, 1)] ?? OperationKind.Unknown;
  }
  return OperationKind.Unknown;
}

/** Classifies `npm run build` / `yarn test` / `pnpm lint` from the script name. */
function kindFromPackageManager(tokens: readonly string[]): OperationKind {
  let index = 1;
  if (RUN_WORDS.has(tokenAt(tokens, index))) {
    index += 1;
  }
  return kindFromScriptName(tokenAt(tokens, index)) ?? OperationKind.Unknown;
}

/** Splits a command line on whitespace into non-empty tokens. */
function splitCommand(commandLine: string): string[] {
  return commandLine
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/** Reads a token by index without assuming `noUncheckedIndexedAccess`. */
function tokenAt(tokens: readonly string[], index: number): string {
  return tokens[index] ?? '';
}

/** Reduces a token to its lowercase basename without a known script extension. */
function normalizeToken(token: string): string {
  if (token.length === 0) {
    return '';
  }
  const base = token.split(/[\\/]/).pop() ?? token;
  return base.toLowerCase().replace(/\.(js|cjs|mjs|cmd|bat|exe|sh|ts|ps1)$/, '');
}

/** True for `KEY=value` environment-assignment prefixes. */
function isEnvAssignment(token: string): boolean {
  return /^[a-z_][a-z0-9_]*=/i.test(token);
}
