import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { createNoopLogger } from '../../logging/logger';
import { CatReactionController } from '../../reaction/catReactionController';
import { createReactionRequest } from '../../reaction/reactionRequest';

/** `publisher.name` as declared in package.json. */
const EXTENSION_ID = 'skillissue.skillissue';

/**
 * Lifecycle coverage for the reaction WebView controller.
 *
 * These run inside VS Code, so `createWebviewPanel`, `asWebviewUri` and the
 * local-resource roots are real. They verify the controller can open, reuse and
 * dispose a panel safely and never throws — the "opened, reused, disposed
 * safely" completion criterion. The markup itself (CSP, escaping, theming, the
 * GIF/audio choreography) is covered exhaustively by the pure unit tests in
 * `reaction/reactionView`.
 */
describe('CatReactionController (integration)', () => {
  const extensionUri = (): vscode.Uri => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!extension) {
      throw new Error(`Extension "${EXTENSION_ID}" was not found in the host`);
    }
    return extension.extensionUri;
  };

  it('opens, reuses and disposes a panel without throwing', () => {
    const controller = new CatReactionController(extensionUri(), createNoopLogger(), () => ({
      durationMs: 0,
    }));
    assert.doesNotThrow(() => controller.react(createReactionRequest('first')));
    // A second reaction while open reuses the same panel rather than stacking.
    assert.doesNotThrow(() => controller.react(createReactionRequest('second')));
    assert.doesNotThrow(() => controller.dispose());
  });

  it('reacts with no request at all', () => {
    const controller = new CatReactionController(extensionUri(), createNoopLogger(), () => ({
      durationMs: 0,
    }));
    assert.doesNotThrow(() => controller.react());
    controller.dispose();
  });

  it('is safe to dispose more than once', () => {
    const controller = new CatReactionController(extensionUri(), createNoopLogger());
    controller.react();
    controller.dispose();
    assert.doesNotThrow(() => controller.dispose());
  });

  it('ignores react() after disposal', () => {
    const controller = new CatReactionController(extensionUri(), createNoopLogger());
    controller.dispose();
    assert.doesNotThrow(() => controller.react(createReactionRequest('after dispose')));
  });
});
