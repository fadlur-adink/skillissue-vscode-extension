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
 * - The panel auto-dismisses after `durationMs`; reacting again resets the timer.
 * - Assets are exposed only through `asWebviewUri` within `localResourceRoots`.
 */
export class CatReactionController implements vscode.Disposable, ReactionSink {
  private panel: vscode.WebviewPanel | undefined;
  private readonly panelDisposables: vscode.Disposable[] = [];
  private dismissTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingMessage = '';
  private pendingCount = 1;
  private disposed = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly logger: Logger,
    private readonly getOptions: () => ReactionOptions = () => ({}),
  ) {}

  /** Shows (or reuses the panel to show) the reaction for a request. */
  react(request: ReactionRequest = {}): void {
    if (this.disposed) {
      return;
    }
    this.pendingMessage = request.message ?? '';
    this.pendingCount = request.repeatCount ?? 1;
    try {
      const panel = this.ensurePanel();
      panel.reveal(this.viewColumn, true);
      // If the webview is already live this plays immediately; if it is (re)loading
      // the message is re-sent by the `ready` handshake in handleWebviewMessage.
      void panel.webview.postMessage(this.reactionMessage());
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
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, REACTION_ASSET_DIR)],
      },
    );
    panel.webview.html = this.renderHtml(panel.webview);
    this.panelDisposables.push(
      panel.onDidDispose(() => this.handlePanelDisposed()),
      panel.webview.onDidReceiveMessage((message) => this.handleWebviewMessage(message, panel)),
    );
    this.panel = panel;
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
      soundEnabled: options.soundEnabled ?? true,
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
      // The view just (re)loaded — deliver the current reaction reliably.
      void panel.webview.postMessage(this.reactionMessage());
    } else if (message.command === 'close') {
      panel.dispose();
    }
  }

  private handlePanelDisposed(): void {
    this.clearDismissTimer();
    this.panel = undefined;
    for (const disposable of this.panelDisposables.splice(0)) {
      disposable.dispose();
    }
    this.logger.debug('Reaction webview disposed');
  }

  private scheduleDismiss(): void {
    this.clearDismissTimer();
    const duration = this.getOptions().durationMs ?? DEFAULT_DURATION_MS;
    if (duration <= 0) {
      return; // 0 (or negative) keeps the panel until dismissed manually.
    }
    this.dismissTimer = setTimeout(() => {
      this.dismissTimer = undefined;
      this.panel?.dispose();
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
