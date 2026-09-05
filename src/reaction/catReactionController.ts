import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { Logger } from '../logging/logger';
import { REACTION_ASSET_DIR, REACTION_ASSETS } from './reactionAssets';
import { ReactionRequest, ReactionSink } from './reactionRequest';
import { buildReactionHtml } from './reactionView';

/**
 * Owns the single reaction WebView and shows the laughing cat on demand.
 *
 * This is the VS Code-facing half of the reaction experience. It receives a
 * {@link ReactionRequest} — it never inspects output and never decides *whether*
 * to react (that is the policy's job). All markup generation lives in the pure
 * `reactionView` module; this class only resolves assets to secure webview URIs,
 * manages the panel lifecycle (create → reuse → dispose) and contains every
 * error so a meme can never break the developer's workflow.
 *
 * Lifecycle rules:
 * - At most **one** panel exists. A new reaction while it is open **reuses** it
 *   (reveal + replay) instead of stacking panels.
 * - After `durationMs` — and never before the laugh has finished playing — the
 *   reaction quiets down. With the `webview` audio backend the panel is kept
 *   alive in a subtle idle state so its one-time audio unlock survives for later
 *   failures; otherwise — the default `system` backend plays in the background —
 *   it simply auto-dismisses. Reacting again re-shows the cat. Closing the panel
 *   by any route also stops the background laugh.
 * - Assets are exposed only through `asWebviewUri` within `localResourceRoots`.
 */
export class CatReactionController implements vscode.Disposable, ReactionSink {
  private panel: vscode.WebviewPanel | undefined;
  private readonly panelDisposables: vscode.Disposable[] = [];
  private dismissTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingMessage = '';
  private pendingCount = 1;
  private idle = false;
  private disposed = false;
  private soundFinished = true;
  private dismissTimerElapsed = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly logger: Logger,
    private readonly getOptions: () => ReactionOptions = () => ({}),
    /**
     * Plays the laugh through a native OS audio player (the `system` backend).
     * Injected so this class stays free of `child_process`. The player must call
     * `onFinish` once the sound is over (including when nothing could play); the
     * default no-op reports finished immediately so the panel can still settle.
     */
    private readonly playSystemSound: (volume: number, onFinish: () => void) => void = (
      _volume,
      onFinish,
    ) => onFinish(),
    /**
     * Stops the native player (the `system` backend). Called when the panel goes
     * away so the background laugh never outlives the visible cat; a no-op by
     * default. Contained like everything else here — it must never throw.
     */
    private readonly stopSystemSound: () => void = () => {},
  ) {}

  /** Shows (or reuses the panel to show) the reaction for a request. */
  react(request: ReactionRequest = {}): void {
    if (this.disposed) {
      return;
    }
    this.pendingMessage = request.message ?? '';
    this.pendingCount = request.repeatCount ?? 1;
    try {
      const options = this.getOptions();
      // Reset the settle conditions before any callback can fire: the player may
      // invoke `onFinish` synchronously when nothing can be played.
      this.soundFinished = !(options.soundEnabled ?? true);
      this.dismissTimerElapsed = false;
      const panel = this.ensurePanel();
      panel.reveal(this.viewColumn, true);
      this.idle = false; // a fresh reaction wakes a panel that was quietly idling
      // If the webview is already live this plays immediately; if it is (re)loading
      // the message is re-sent by the `ready` handshake in handleWebviewMessage.
      void panel.webview.postMessage(this.reactionMessage());
      // Background audio: the `system` backend plays through a native OS player,
      // independent of the WebView — no click-to-unlock, works while unfocused.
      if (this.usesSystemAudio(options)) {
        this.playSystemSound(options.volume ?? 1, () => this.handleSoundFinished());
      }
      this.scheduleDismiss();
    } catch (error) {
      // A meme failure must never surface as a workflow failure.
      this.logger.error('Failed to show the SkillIssue reaction', error);
    }
  }

  /**
   * Closes the current panel (if any) so the next reaction rebuilds it with fresh
   * presentation settings. Called on configuration change; safe at any time.
   */
  refresh(): void {
    if (this.disposed) {
      return;
    }
    this.panel?.dispose();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.clearDismissTimer();
    const panel = this.panel;
    this.panel = undefined;
    for (const disposable of this.panelDisposables.splice(0)) {
      disposable.dispose();
    }
    panel?.dispose();
  }

  private get viewColumn(): vscode.ViewColumn {
    return this.getOptions().viewColumn ?? vscode.ViewColumn.Active;
  }

  /** True when sound should come from a native OS player (background, no click). */
  private usesSystemAudio(options: ReactionOptions): boolean {
    return (options.soundEnabled ?? true) && (options.soundBackend ?? 'system') === 'system';
  }

  /** True when the WebView itself should carry the `<audio>` element. */
  private usesWebViewAudio(options: ReactionOptions): boolean {
    return (options.soundEnabled ?? true) && (options.soundBackend ?? 'system') === 'webview';
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) {
      return this.panel;
    }
    const panel = vscode.window.createWebviewPanel(
      REACTION_VIEW_TYPE,
      REACTION_PANEL_TITLE,
      { viewColumn: this.viewColumn, preserveFocus: true },
      {
        enableScripts: true,
        // Only the `webview` audio backend benefits from retaining the document (to
        // preserve its one-time audio unlock across hide/show). The default `system`
        // backend needs no such state, so avoid the extra memory cost.
        retainContextWhenHidden: this.usesWebViewAudio(this.getOptions()),
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, REACTION_ASSET_DIR)],
      },
    );
    panel.webview.html = this.renderHtml(panel.webview);
    this.panelDisposables.push(
      panel.onDidDispose(() => this.handlePanelDisposed()),
      panel.webview.onDidReceiveMessage((message) => this.handleWebviewMessage(message, panel)),
    );
    this.panel = panel;
    this.idle = false;
    this.logger.debug('Reaction webview created');
    return panel;
  }

  private renderHtml(webview: vscode.Webview): string {
    const options = this.getOptions();
    const assetRoot = vscode.Uri.joinPath(this.extensionUri, REACTION_ASSET_DIR);
    const toUri = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, file)).toString();
    return buildReactionHtml({
      cspSource: webview.cspSource,
      nonce: crypto.randomBytes(24).toString('hex'),
      gifUri: toUri(REACTION_ASSETS.gif),
      audioUri: toUri(REACTION_ASSETS.audio),
      posterUri: toUri(REACTION_ASSETS.poster),
      headline: options.headline ?? DEFAULT_HEADLINE,
      detail: this.pendingMessage,
      // The WebView only carries audio in the `webview` backend; with the native
      // `system` backend the panel is a silent visual and the OS plays the sound.
      soundEnabled: this.usesWebViewAudio(options),
      volume: options.volume ?? 1,
      repeatCount: this.pendingCount,
    });
  }

  /** The `react` payload sent to the webview (also re-sent on the ready handshake). */
  private reactionMessage(): { command: string; message: string; count: number } {
    return { command: 'react', message: this.pendingMessage, count: this.pendingCount };
  }

  private handleWebviewMessage(message: unknown, panel: vscode.WebviewPanel): void {
    if (!isWebviewMessage(message)) {
      return;
    }
    if (message.command === 'ready') {
      if (this.idle) {
        // We were idling when the (retained) view reloaded — restore the quiet
        // state rather than replaying a stale failure.
        void panel.webview.postMessage({ command: 'idle' });
      } else {
        // The view just (re)loaded — deliver the current reaction reliably.
        void panel.webview.postMessage(this.reactionMessage());
      }
    } else if (message.command === 'idle') {
      // A retained view came back while we were idling; note it so the next
      // `ready` handshake restores the quiet state instead of replaying.
      this.idle = true;
    } else if (message.command === 'soundEnded') {
      // The webview backend reports when its <audio> has finished every loop.
      this.handleSoundFinished();
    } else if (message.command === 'close') {
      panel.dispose();
    }
  }

  private handleSoundFinished(): void {
    this.soundFinished = true;
    this.maybeSettle();
  }

  /**
   * Settles the reaction once it is safe to do so: the dismiss timer must have
   * elapsed AND the laugh must have finished, so the cat never hides while the
   * sound is still playing (and a missing/unplayable sound can't trap the panel).
   * The `webview` backend quiets to idle; the `system` backend disposes.
   */
  private maybeSettle(): void {
    if (this.disposed || !this.dismissTimerElapsed || !this.soundFinished || !this.panel) {
      return;
    }
    if (this.usesWebViewAudio(this.getOptions())) {
      if (!this.idle) {
        this.idle = true;
        void this.panel.webview.postMessage({ command: 'idle' });
      }
    } else {
      this.panel.dispose();
    }
  }

  private handlePanelDisposed(): void {
    this.clearDismissTimer();
    this.panel = undefined;
    for (const disposable of this.panelDisposables.splice(0)) {
      disposable.dispose();
    }
    try {
      this.stopSystemSound();
    } catch (error) {
      this.logger.error('Failed to stop the system sound', error);
    }
    this.logger.debug('Reaction webview disposed');
  }

  /**
   * After `durationMs` the reaction quiets down — but never before the laugh has
   * finished playing, so the cat stays visible exactly as long as the sound. The
   * timer only marks the minimum display time; the actual settle happens in
   * {@link maybeSettle} once both conditions hold. With the `webview` audio
   * backend the panel is kept alive in an idle state (rather than destroyed) so
   * Chromium's one-time audio unlock survives into every future failure. The
   * default `system` backend plays in the background, so there is nothing to
   * preserve and the panel simply disposes. Either way the developer can close it
   * via Dismiss, Escape or the tab's ×.
   */
  private scheduleDismiss(): void {
    this.clearDismissTimer();
    const options = this.getOptions();
    const duration = options.durationMs ?? DEFAULT_DURATION_MS;
    if (duration <= 0) {
      return; // 0 (or negative) keeps the reaction showing until dismissed.
    }
    this.dismissTimer = setTimeout(() => {
      this.dismissTimer = undefined;
      this.dismissTimerElapsed = true;
      this.maybeSettle();
    }, duration);
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer !== undefined) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }
  }
}

/** Options controlling how the reaction is presented. */
export interface ReactionOptions {
  /** When false the meme is silent (no `<audio>` element is rendered). */
  readonly soundEnabled?: boolean;
  /**
   * Where the laugh comes from: `'system'` (a native OS player, in the background
   * — the default) or `'webview'` (the panel's own `<audio>`, which may need one
   * click to unlock). Ignored when {@link ReactionOptions.soundEnabled} is false.
   */
  readonly soundBackend?: 'system' | 'webview';
  /** Audio volume in `[0, 1]`. Defaults to 1. */
  readonly volume?: number;
  /** Milliseconds before auto-dismiss; `<= 0` keeps it until dismissed. */
  readonly durationMs?: number;
  /** Editor column the panel opens in. Defaults to the active column. */
  readonly viewColumn?: vscode.ViewColumn;
  /** Heading shown above the cat. Defaults to "Skill Issue". */
  readonly headline?: string;
}

/** `WebviewPanel.viewType` for the reaction panel. */
const REACTION_VIEW_TYPE = 'skillissue.reaction';
/** Tab title for the reaction panel. */
const REACTION_PANEL_TITLE = 'SkillIssue';
/** Default heading rendered above the cat. */
const DEFAULT_HEADLINE = 'Skill Issue';
/** Default time the panel stays visible before auto-dismissing. */
const DEFAULT_DURATION_MS = 5000;

/** Shape of messages the webview posts back to the host. */
interface WebviewMessage {
  readonly command: string;
}

/** Runtime guard for messages received from the webview. */
function isWebviewMessage(value: unknown): value is WebviewMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as WebviewMessage).command === 'string'
  );
}
