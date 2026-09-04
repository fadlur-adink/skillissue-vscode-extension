import * as vscode from 'vscode';
import { formatLogLine, Logger, LogLevel } from './logger';

/**
 * A {@link Logger} backed by a VS Code {@link vscode.OutputChannel}.
 *
 * The returned object is also {@link vscode.Disposable}; callers should push it
 * into `context.subscriptions` so the channel is closed when the extension
 * deactivates.
 *
 * @param name Title of the output channel shown in VS Code's Output view.
 */
export function createOutputChannelLogger(name: string): Logger & vscode.Disposable {
  const channel = vscode.window.createOutputChannel(name);

  const write = (level: LogLevel, message: string, error?: unknown): void => {
    const line = formatLogLine(level, message, new Date());
    channel.appendLine(error === undefined ? line : `${line} — ${describeError(error)}`);
  };

  return {
    debug: (message) => write(LogLevel.Debug, message),
    info: (message) => write(LogLevel.Info, message),
    warn: (message) => write(LogLevel.Warn, message),
    error: (message, error) => write(LogLevel.Error, message, error),
    dispose: () => channel.dispose(),
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}
