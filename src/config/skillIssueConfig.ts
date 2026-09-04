import * as vscode from 'vscode';
import { CONFIG_SECTION } from '../constants';
import { Logger } from '../logging/logger';
import { RawSkillIssueSettings, SkillIssueSettings, toSkillIssueSettings } from './settings';

/**
 * Centralised, live access to SkillIssue's user settings.
 *
 * This is the **only** module that reads `vscode.workspace.getConfiguration`. It
 * maps raw values through the pure `settings.ts` (defaults + validation), caches
 * the result and refreshes on `onDidChangeConfiguration`, so editing a setting in
 * VS Code takes effect on the next reaction — no rebuild, no reload. Consumers
 * pull typed settings via {@link SkillIssueConfig.read} and may subscribe to
 * {@link SkillIssueConfig.onDidChange}.
 */
export class SkillIssueConfig implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<SkillIssueSettings>();
  private readonly disposables: vscode.Disposable[] = [this.emitter];
  private current: SkillIssueSettings;

  /** Fires with the fresh settings whenever any `skillissue.*` setting changes. */
  readonly onDidChange: vscode.Event<SkillIssueSettings> = this.emitter.event;

  constructor(private readonly logger: Logger) {
    this.current = this.readFromWorkspace();
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(CONFIG_SECTION)) {
          return;
        }
        this.current = this.readFromWorkspace();
        this.logger.debug('SkillIssue settings reloaded');
        this.emitter.fire(this.current);
      }),
    );
  }

  /** The current typed settings (cached; refreshed on configuration change). */
  read(): SkillIssueSettings {
    return this.current;
  }

  private readFromWorkspace(): SkillIssueSettings {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const raw: RawSkillIssueSettings = {
      enabled: config.get('enabled'),
      soundEnabled: config.get('sound.enabled'),
      volume: config.get('sound.volume'),
      soundBackend: config.get('sound.backend'),
      durationSeconds: config.get('reaction.durationSeconds'),
      cooldownSeconds: config.get('reaction.cooldownSeconds'),
      monitoredKinds: config.get('workflows.monitoredKinds'),
      include: config.get('workflows.include'),
      exclude: config.get('workflows.exclude'),
      repeatedFailures: config.get('repeatedFailures'),
      treatCancellationAsFailure: config.get('workflows.treatCancellationAsFailure'),
      treatUnknownAsFailure: config.get('workflows.treatUnknownAsFailure'),
      detectTerminalCommands: config.get('workflows.detectTerminalCommands'),
    };
    return toSkillIssueSettings(raw);
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
