/**
 * Canonical names of the bundled meme assets.
 *
 * This is the single source of truth shared by the WebView controller (which
 * resolves each file to a `webview.asWebviewUri`) and the unit tests (which
 * assert the names still match the files that actually ship in `assets/`). A
 * rename therefore fails loudly in tests instead of silently 404-ing inside the
 * WebView at runtime.
 */

/** Directory (relative to the extension root) that holds the shipped media. */
export const REACTION_ASSET_DIR = 'assets';

/** The individual media files, by role. */
export interface ReactionAssetFiles {
  /** Animated laughing cat shown as the centrepiece. */
  readonly gif: string;
  /** Laughing audio (MP3) played inside the WebView backend. */
  readonly audio: string;
  /** The same laugh as WAV, played by the native OS audio backend. */
  readonly audioWav: string;
  /** Static still used when the user prefers reduced motion. */
  readonly poster: string;
}

/** The concrete file names bundled under {@link REACTION_ASSET_DIR}. */
export const REACTION_ASSETS: ReactionAssetFiles = {
  gif: 'orange-cat-laughing.gif',
  audio: 'cat-laughing-at-you.mp3',
  audioWav: 'cat-laughing-at-you.wav',
  poster: 'cat-laughing-cat-laughing-meme.png',
};
