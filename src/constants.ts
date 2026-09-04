/**
 * Small, shared constants.
 *
 * Command identifiers here must stay in sync with the `contributes.commands`
 * section of `package.json`. Centralising them avoids magic strings drifting
 * between the manifest, the activation code and the tests.
 */

/** Identifier of the "About SkillIssue" command (must match package.json). */
export const ABOUT_COMMAND_ID = 'skillissue.about';

/**
 * Identifier of the "preview the reaction" command (must match package.json).
 * It triggers the meme UI directly, independent of detection — proving the
 * reaction experience stands alone (Phase 4 completion criteria).
 */
export const PREVIEW_REACTION_COMMAND_ID = 'skillissue.previewReaction';

/** Title of the Output channel used for SkillIssue logging. */
export const OUTPUT_CHANNEL_NAME = 'SkillIssue';

/**
 * Configuration section — the `skillissue.*` settings namespace. Must match the
 * `contributes.configuration` property keys in package.json.
 */
export const CONFIG_SECTION = 'skillissue';

/** Human-readable blurb surfaced by the About command. */
export const ABOUT_MESSAGE =
  'SkillIssue — your code failed. The cat knows. The cat is laughing at you.';
