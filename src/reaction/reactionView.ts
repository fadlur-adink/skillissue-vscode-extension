/**
 * Pure builder for the reaction WebView's HTML.
 *
 * This module has **no `vscode` dependency**: the controller resolves asset URIs
 * and hands them (plus a CSP source and nonce) to {@link buildReactionHtml}, which
 * returns a complete, self-contained document. Keeping it a pure function means
 * the markup — its security policy, escaping, theming, accessibility and the
 * GIF/audio choreography — is fully unit-testable outside VS Code.
 *
 * The view is intentionally dumb: it renders what it is given and reacts to
 * `react` messages. It never inspects output and never decides whether to react.
 */

/** Everything the WebView needs to render, pre-resolved by the host. */
export interface ReactionViewModel {
  /** `webview.cspSource` — the only origin the CSP allows resources from. */
  readonly cspSource: string;
  /** Per-render nonce authorising the inline `<style>`/`<script>`. */
  readonly nonce: string;
  /** Resolved webview URI of the animated cat. */
  readonly gifUri: string;
  /** Resolved webview URI of the laughing audio. */
  readonly audioUri: string;
  /** Resolved webview URI of the static still (reduced-motion fallback). */
  readonly posterUri: string;
  /** Large heading shown above the cat. */
  readonly headline: string;
  /** Pre-computed context line (may be empty). Displayed verbatim. */
  readonly detail: string;
  /** When false, no `<audio>` element is rendered and the meme is silent. */
  readonly soundEnabled: boolean;
  /** Audio volume in `[0, 1]`; clamped defensively before rendering. */
  readonly volume: number;
  /**
   * Consecutive failures this reaction represents (1 = first). Values above 1
   * render a subtle "×N" badge so a streak feels deliberate, not stuck. Optional:
   * omit for a first/standalone reaction.
   */
  readonly repeatCount?: number;
}

/**
 * Escapes a string for safe interpolation into HTML text and double-quoted
 * attribute values. Every dynamic value in the document passes through this, so
 * a task name like `<img onerror=…>` can never break out into markup.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Clamps a volume to the valid `[0, 1]` range, defaulting to 1 when invalid. */
export function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

/** Builds the complete reaction document for the given model. */
export function buildReactionHtml(model: ReactionViewModel): string {
  const csp = escapeHtml(model.cspSource);
  const nonce = escapeHtml(model.nonce);
  const gif = escapeHtml(model.gifUri);
  const poster = escapeHtml(model.posterUri);
  const headline = escapeHtml(model.headline);
  const detail = escapeHtml(model.detail);
  const volume = clampVolume(model.volume);
  const repeat =
    typeof model.repeatCount === 'number' && model.repeatCount > 1 ? model.repeatCount : 0;
  const repeatBadge =
    repeat > 1
      ? `<span id="repeat" class="repeat">×${repeat}</span>`
      : `<span id="repeat" class="repeat" hidden></span>`;
  const audioTag = model.soundEnabled
    ? `<audio id="laugh" src="${escapeHtml(model.audioUri)}" data-volume="${volume}" preload="auto"></audio>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${csp}; media-src ${csp}; font-src ${csp}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<title>${headline}</title>
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family, system-ui, -apple-system, "Segoe UI", sans-serif);
    font-size: var(--vscode-font-size, 13px);
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    width: 100%;
    max-width: 440px;
    padding: 22px;
    text-align: center;
    border: 1px solid var(--vscode-panel-border, transparent);
    border-radius: 12px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    animation: pop 200ms ease-out;
  }
  @keyframes pop {
    from { transform: scale(0.94); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .cat {
    display: block;
    width: 100%;
    max-width: 300px;
    height: auto;
    border-radius: 10px;
  }
  h1 {
    margin: 0;
    font-size: 1.7em;
    line-height: 1.1;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .repeat {
    margin-left: 6px;
    font-size: 0.55em;
    vertical-align: super;
    letter-spacing: 0;
    color: var(--vscode-descriptionForeground);
  }
  .detail {
    margin: 0;
    min-height: 1.3em;
    color: var(--vscode-descriptionForeground);
    word-break: break-word;
  }
  .note { margin: 0; font-size: 0.92em; color: var(--vscode-descriptionForeground); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  button {
    padding: 6px 14px;
    font: inherit;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  button.secondary {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
    border-color: var(--vscode-panel-border, currentColor);
  }
  [hidden] { display: none !important; }
  @media (prefers-reduced-motion: reduce) {
    .card { animation: none; }
  }
</style>
</head>
<body>
  <main class="card" role="status" aria-live="polite">
    <img id="cat" class="cat" src="${gif}" data-src="${gif}" data-poster="${poster}"
         alt="An orange cat laughing" />
    <h1>${headline}${repeatBadge}</h1>
    <p id="detail" class="detail">${detail}</p>
    <p id="sound-off" class="note" hidden>Sound could not start automatically.</p>
    <div class="actions">
      <button id="play-sound" type="button" hidden>Play sound</button>
      <button id="close" class="secondary" type="button">Dismiss</button>
    </div>
    ${audioTag}
  </main>
  <script nonce="${nonce}">
    (function () {
      var vscode = acquireVsCodeApi();
      var img = document.getElementById('cat');
      var audio = document.getElementById('laugh');
      var detail = document.getElementById('detail');
      var repeatBadge = document.getElementById('repeat');
      var soundOff = document.getElementById('sound-off');
      var playBtn = document.getElementById('play-sound');
      var closeBtn = document.getElementById('close');
      var reduceMotion = !!(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);

      // Reduced motion: show a static still instead of the animated GIF.
      if (reduceMotion && img) {
        img.src = img.getAttribute('data-poster') || img.src;
      }

      function restartGif() {
        if (!img || reduceMotion) { return; }
        var src = img.getAttribute('data-src');
        if (!src) { return; }
        img.removeAttribute('src');
        void img.offsetWidth; // force reflow so the animation replays from frame 0
        img.setAttribute('src', src);
      }

      function setSoundBlocked(blocked) {
        if (soundOff) { soundOff.hidden = !blocked; }
        if (playBtn) { playBtn.hidden = !blocked; }
      }

      function applyVolume() {
        if (!audio) { return; }
        var v = parseFloat(audio.getAttribute('data-volume'));
        audio.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
      }

      function playSound() {
        if (!audio) { return; }
        applyVolume();
        try {
          audio.currentTime = 0;
          var promise = audio.play();
          if (promise && typeof promise.then === 'function') {
            promise.then(function () { setSoundBlocked(false); },
                         function () { setSoundBlocked(true); });
          }
        } catch (err) {
          setSoundBlocked(true);
        }
      }

      function setRepeat(count) {
        if (!repeatBadge) { return; }
        var n = Number(count);
        if (Number.isFinite(n) && n > 1) {
          repeatBadge.textContent = '×' + n;
          repeatBadge.hidden = false;
        } else {
          repeatBadge.textContent = '';
          repeatBadge.hidden = true;
        }
      }

      function react(message, count) {
        if (typeof message === 'string' && detail) { detail.textContent = message; }
        setRepeat(count);
        restartGif();
        playSound();
      }

      window.addEventListener('message', function (event) {
        var msg = event.data;
        if (msg && msg.command === 'react') { react(msg.message, msg.count); }
      });

      if (playBtn) { playBtn.addEventListener('click', function () { playSound(); }); }
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          vscode.postMessage({ command: 'close' });
        });
      }
      // Escape waves the cat away when the panel has keyboard focus, so the
      // developer can dismiss it without reaching for the mouse.
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' || event.key === 'Esc') {
          vscode.postMessage({ command: 'close' });
        }
      });

      // Handshake: tell the host we are live so it (re)sends the reaction. This
      // avoids racing a postMessage against WebView load/reload.
      vscode.postMessage({ command: 'ready' });
    })();
  </script>
</body>
</html>
`;
}
