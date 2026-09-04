import * as vscode from 'vscode';
import { SkillIssueConfig } from './config/skillIssueConfig';
import {
  ABOUT_COMMAND_ID,
  ABOUT_MESSAGE,
  OUTPUT_CHANNEL_NAME,
  PREVIEW_REACTION_COMMAND_ID,
} from './constants';
import { describeOperationOutcome } from './core/describe';
import { isCompletedEvent } from './core/events';
import { isFailure } from './core/outcome';
import { TaskDetector } from './detection/taskDetector';
import { createOutputChannelLogger } from './logging/outputChannelLogger';
import { SkillIssueOrchestrator } from './orchestration/skillIssueOrchestrator';
import { CatReactionController } from './reaction/catReactionController';
import { createReactionRequest } from './reaction/reactionRequest';

/**
 * Called by VS Code when the extension is activated.
 *
 * This is the composition root: it builds the shared logger and the workflow
 * detector, wires them together and registers every disposable on
 * `context.subscriptions`. As of Phase 2 detected outcomes are only *logged* —
 * the reaction policy (Phase 3) and the meme UI (Phase 4) will subscribe to the
 * same detector events without changing this wiring.
 */
export function activate(context: vscode.ExtensionContext): void {
  const logger = createOutputChannelLogger(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(logger);

  // Phase 6 — user settings. The single reader of VS Code configuration; it maps
  // raw values through the pure settings model and refreshes live on change, so
  // editing a setting takes effect on the next reaction without a rebuild.
  const config = new SkillIssueConfig(logger);
  context.subscriptions.push(config);

  logger.info('Activating SkillIssue…');

  context.subscriptions.push(
    vscode.commands.registerCommand(ABOUT_COMMAND_ID, () => {
      logger.debug(`${ABOUT_COMMAND_ID} invoked`);
      void vscode.window.showInformationMessage(ABOUT_MESSAGE);
    }),
  );

  // Phase 4 — the reaction experience (the cat). Isolated from detection: it only
  // knows how to *present* a reaction when handed a request. The preview command
  // triggers it directly so the UI can be exercised without a real failure.
  // Phase 6 — presentation settings (sound, volume, duration) are pulled live
  // from configuration per reaction, so changes apply without a reload.
  const reaction = new CatReactionController(context.extensionUri, logger, () => {
    const settings = config.read();
    return {
      soundEnabled: settings.soundEnabled,
      volume: settings.volume,
      durationMs: settings.durationMs,
    };
  });
  context.subscriptions.push(reaction);
  // A settings change may alter the rendered markup (e.g. sound on/off), so close
  // any open panel; the next reaction rebuilds it with the fresh settings.
  context.subscriptions.push(config.onDidChange(() => reaction.refresh()));
  context.subscriptions.push(
    vscode.commands.registerCommand(PREVIEW_REACTION_COMMAND_ID, () => {
      logger.debug(`${PREVIEW_REACTION_COMMAND_ID} invoked`);
      reaction.react(
        createReactionRequest('Preview — this is how SkillIssue reacts to a failure.'),
      );
    }),
  );

  // Phase 5 — the loop: detection → policy → reaction. The orchestrator is pure;
  // this composition root owns the VS Code subscription and feeds events in.
  // Phase 6 — `getSettings`/`getCooldownMs` are backed by live configuration, so
  // the policy and the cooldown respond to user changes without a reload.
  const orchestrator = new SkillIssueOrchestrator({
    getSettings: () => config.read().policy,
    getCooldownMs: () => config.read().cooldownMs,
    sink: reaction,
    logger,
  });

  // Phase 2 — observe developer workflows. The detector only reports what
  // happened; the orchestrator decides whether it deserves a cat.
  const detector = new TaskDetector(logger);
  context.subscriptions.push(detector);
  context.subscriptions.push(
    detector.onWorkflowEvent((event) => {
      // Observation log: record what happened (successes included).
      if (isCompletedEvent(event)) {
        const description = describeOperationOutcome(event.operation, event.outcome);
        if (isFailure(event.outcome)) {
          logger.warn(description);
        } else {
          logger.info(description);
        }
      }
      // The loop: judge (policy) and react (cat). Contained — never throws.
      orchestrator.handleEvent(event);
    }),
  );

  logger.info('SkillIssue activated.');
}

/**
 * Called by VS Code when the extension is deactivated.
 *
 * Everything registered via `context.subscriptions` is disposed automatically,
 * so there is nothing to tear down manually yet.
 */
export function deactivate(): void {
  // Intentionally empty: disposables are owned by `context.subscriptions`.
}
