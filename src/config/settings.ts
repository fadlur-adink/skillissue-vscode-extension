import { OperationKind } from '../core/operation';
import { ReactionPolicySettings, RepeatedFailurePolicy } from '../policy/policySettings';

/**
 * Pure settings model and mapping.
 *
 * VS Code hands configuration back as loosely-typed JSON that a user may also
 * have edited by hand, so this module treats every raw value as `unknown` and
 * coerces/clamps it into a strongly-typed {@link SkillIssueSettings}. Keeping the
 * mapping pure means the defaults and validation rules are unit-testable without
 * VS Code, and the `vscode`-backed reader (`skillIssueConfig.ts`) stays a thin
 * adapter. This is the single, centralised place settings are interpreted.
 */

/** The raw shape read from `workspace.getConfiguration('skillissue')`. */
export interface RawSkillIssueSettings {
  readonly enabled?: unknown;
  readonly soundEnabled?: unknown;
  readonly volume?: unknown;
  readonly durationSeconds?: unknown;
  readonly cooldownSeconds?: unknown;
  readonly monitoredKinds?: unknown;
  readonly include?: unknown;
  readonly exclude?: unknown;
  readonly repeatedFailures?: unknown;
  readonly treatCancellationAsFailure?: unknown;
  readonly treatUnknownAsFailure?: unknown;
  readonly detectTerminalCommands?: unknown;
}

/** The strongly-typed settings the rest of SkillIssue consumes. */
export interface SkillIssueSettings {
  /** Policy inputs for the reaction decision (Phase 3). */
  readonly policy: ReactionPolicySettings;
  /** Whether the laughing audio plays. */
  readonly soundEnabled: boolean;
  /** Audio volume in `[0, 1]`. */
  readonly volume: number;
  /** How long the panel stays visible (ms); `0` keeps it until dismissed. */
  readonly durationMs: number;
  /** Minimum spacing between reactions (ms); `0` disables the cooldown. */
  readonly cooldownMs: number;
  /** Whether to also detect build/test/lint commands typed in the integrated terminal. */
  readonly detectTerminalCommands: boolean;
}

/** Out-of-the-box defaults, expressed as the mapped result of empty raw input. */
export const DEFAULT_VOLUME = 1;
export const DEFAULT_DURATION_SECONDS = 5;
export const DEFAULT_COOLDOWN_SECONDS = 0;

/** Maps (and validates) raw configuration into typed settings. */
export function toSkillIssueSettings(raw: RawSkillIssueSettings): SkillIssueSettings {
  const volume = clamp(toNumber(raw.volume, DEFAULT_VOLUME), 0, 1);
  const durationSeconds = Math.max(0, toNumber(raw.durationSeconds, DEFAULT_DURATION_SECONDS));
  const cooldownSeconds = Math.max(0, toNumber(raw.cooldownSeconds, DEFAULT_COOLDOWN_SECONDS));

  const policy: ReactionPolicySettings = {
    enabled: toBoolean(raw.enabled, true),
    monitoredKinds: toOperationKinds(raw.monitoredKinds),
    // Not user-exposed: SkillIssue exists to react to failures, so this stays on.
    // `enabled` is the master switch; the toggles below refine *what counts*.
    reactOnFailure: true,
    treatCancellationAsFailure: toBoolean(raw.treatCancellationAsFailure, false),
    treatUnknownAsFailure: toBoolean(raw.treatUnknownAsFailure, false),
    include: toStringArray(raw.include),
    exclude: toStringArray(raw.exclude),
    repeatedFailures: toRepeatedFailurePolicy(raw.repeatedFailures),
  };

  return {
    policy,
    soundEnabled: toBoolean(raw.soundEnabled, true),
    volume,
    durationMs: Math.round(durationSeconds * 1000),
    cooldownMs: Math.round(cooldownSeconds * 1000),
    detectTerminalCommands: toBoolean(raw.detectTerminalCommands, true),
  };
}

/** The default settings (equivalent to the user changing nothing). */
export function createDefaultSkillIssueSettings(): SkillIssueSettings {
  return toSkillIssueSettings({});
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Trims strings, drops blanks and rejects non-arrays/non-strings. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Keeps only valid, de-duplicated {@link OperationKind} values. */
function toOperationKinds(value: unknown): OperationKind[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const valid = new Set<string>(Object.values(OperationKind));
  const kinds: OperationKind[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && valid.has(entry)) {
      const kind = entry as OperationKind;
      if (!kinds.includes(kind)) {
        kinds.push(kind);
      }
    }
  }
  return kinds;
}

function toRepeatedFailurePolicy(value: unknown): RepeatedFailurePolicy {
  return value === 'first-only' ? 'first-only' : 'always';
}
