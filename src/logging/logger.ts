/**
 * Logging primitives shared across SkillIssue.
 *
 * This module is intentionally free of any `vscode` import so that it can be
 * used by pure application logic and exercised by unit tests that run outside
 * of the VS Code Extension Host. The VS Code-backed implementation lives in
 * `outputChannelLogger.ts`.
 */

/** Severity levels, ordered from least to most severe. */
export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

/**
 * The minimal logging contract used throughout the extension.
 *
 * Keeping this as an interface (rather than depending on a concrete VS Code
 * type) lets application logic accept a logger without coupling to the UI.
 */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

/**
 * A logger that silently discards everything.
 *
 * Useful as a safe default in tests and for code paths that must never depend
 * on a real output sink being present.
 */
export function createNoopLogger(): Logger {
  return {
    debug(): void {},
    info(): void {},
    warn(): void {},
    error(): void {},
  };
}

/**
 * Formats a single, deterministic log line.
 *
 * Exposed separately from the sink so the exact format can be unit tested
 * without spinning up VS Code.
 */
export function formatLogLine(level: LogLevel, message: string, timestamp: Date): string {
  return `[${timestamp.toISOString()}] [${level.toUpperCase()}] ${message}`;
}
