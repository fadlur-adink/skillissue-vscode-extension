import { OperationKind } from '../core/operation';

/** How repeated consecutive failures of the same operation are treated. */
export type RepeatedFailurePolicy = 'always' | 'first-only';

/**
 * The reaction policy's configuration contract.
 *
 * This is a plain data type with **no `vscode` dependency**. Phase 6 maps VS Code
 * settings onto it; here we only define the shape, the defaults, and the logic
 * that consumes it. Keeping the contract separate means the policy is testable
 * with hand-built settings and the settings *source* can change independently.
 */
export interface ReactionPolicySettings {
  /** Master switch — when false, SkillIssue never reacts. */
  readonly enabled: boolean;
  /** Operation kinds to monitor; empty means "all kinds". */
  readonly monitoredKinds: readonly OperationKind[];
  /** React when an operation fails with a non-zero exit code. */
  readonly reactOnFailure: boolean;
  /** Treat a cancelled operation as failure-worthy. */
  readonly treatCancellationAsFailure: boolean;
  /** Treat an unknown/unavailable result as failure-worthy. */
  readonly treatUnknownAsFailure: boolean;
  /** Case-insensitive name substrings that must match (allowlist); empty = allow all. */
  readonly include: readonly string[];
  /** Case-insensitive name substrings that veto a reaction; excludes win over includes. */
  readonly exclude: readonly string[];
  /** How repeated consecutive failures are treated. */
  readonly repeatedFailures: RepeatedFailurePolicy;
}

/** Sensible out-of-the-box defaults: react to real failures, stay quiet otherwise. */
export function createDefaultPolicySettings(): ReactionPolicySettings {
  return {
    enabled: true,
    monitoredKinds: [],
    reactOnFailure: true,
    treatCancellationAsFailure: false,
    treatUnknownAsFailure: false,
    include: [],
    exclude: [],
    repeatedFailures: 'always',
  };
}

/**
 * Merges partial overrides onto the defaults.
 *
 * Used by the config layer (Phase 6) and by tests to tweak a single field without
 * restating the whole object.
 */
export function withPolicySettings(
  overrides: Partial<ReactionPolicySettings> = {},
): ReactionPolicySettings {
  return { ...createDefaultPolicySettings(), ...overrides };
}
