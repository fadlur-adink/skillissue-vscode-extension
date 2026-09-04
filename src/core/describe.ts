import { Operation } from './operation';
import { OperationOutcome, OutcomeKind } from './outcome';

/**
 * Renders a short, human-readable description of an operation's outcome, e.g.
 * `"npm test failed (exit code 1)"`.
 *
 * This is what lets downstream consumers — logs today, the reaction UI in
 * Phase 4 — receive a *meaningful* message ("the TypeScript task failed")
 * instead of having to inspect terminal output themselves. Pure function.
 */
export function describeOperationOutcome(operation: Operation, outcome: OperationOutcome): string {
  const { name } = operation;
  switch (outcome.kind) {
    case OutcomeKind.Success:
      return `${name} succeeded`;
    case OutcomeKind.Failure:
      return outcome.exitCode === undefined
        ? `${name} failed`
        : `${name} failed (exit code ${outcome.exitCode})`;
    case OutcomeKind.Cancelled:
      return `${name} was cancelled`;
    case OutcomeKind.Unknown:
      return outcome.reason === undefined
        ? `${name} finished with an unknown result`
        : `${name} finished with an unknown result (${outcome.reason})`;
  }
  // Unreachable while every OutcomeKind is handled above; kept as a graceful
  // fallback should a new outcome kind ever be added.
  return `${name} finished`;
}
