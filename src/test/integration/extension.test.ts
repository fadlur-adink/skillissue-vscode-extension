import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { ABOUT_COMMAND_ID, PREVIEW_REACTION_COMMAND_ID } from '../../constants';

/** `publisher.name` as declared in package.json. */
const EXTENSION_ID = 'skillissue.skillissue';

/**
 * Integration tests.
 *
 * These execute inside a real VS Code instance (via `@vscode/test-cli`) and
 * verify the extension loads, activates and contributes what the manifest
 * promises. They intentionally do not depend on any developer workflow.
 */
describe('SkillIssue extension', () => {
  it('is present in the Extension Development Host', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!extension) {
      throw new Error(`Extension "${EXTENSION_ID}" was not found in the host`);
    }
    assert.ok(extension);
  });

  it('activates successfully', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!extension) {
      throw new Error(`Extension "${EXTENSION_ID}" was not found in the host`);
    }
    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  it('registers the About command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes(ABOUT_COMMAND_ID),
      `expected "${ABOUT_COMMAND_ID}" to be registered`,
    );
  });

  it('registers the preview reaction command', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes(PREVIEW_REACTION_COMMAND_ID),
      `expected "${PREVIEW_REACTION_COMMAND_ID}" to be registered`,
    );
  });
});
