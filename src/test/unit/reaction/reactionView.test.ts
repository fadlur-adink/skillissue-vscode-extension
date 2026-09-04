import * as assert from 'node:assert/strict';
import { buildReactionHtml, clampVolume, escapeHtml, ReactionViewModel } from '../../../reaction/reactionView';

describe('reaction/reactionView', () => {
  const model = (overrides: Partial<ReactionViewModel> = {}): ReactionViewModel => ({
    cspSource: 'https://file+.vscode-resource.vscode-cdn.net',
    nonce: 'TESTNONCE123',
    gifUri: 'https://cdn/assets/orange-cat-laughing.gif',
    audioUri: 'https://cdn/assets/cat-laughing-at-you.mp3',
    posterUri: 'https://cdn/assets/cat-laughing-cat-laughing-meme.png',
    headline: 'Skill Issue',
    detail: 'npm: test failed (exit code 1)',
    soundEnabled: true,
    volume: 1,
    ...overrides,
  });

  describe('document & security', () => {
    it('emits a standalone document', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /^<!DOCTYPE html>/);
      assert.match(html, /<html lang="en">/);
      assert.match(html, /<\/html>\s*$/);
    });

    it('locks the CSP down to the webview origin with a nonce', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /http-equiv="Content-Security-Policy"/);
      assert.match(html, /default-src 'none'/);
      assert.match(html, /script-src 'nonce-TESTNONCE123'/);
      assert.match(html, /style-src 'nonce-TESTNONCE123'/);
    });

    it('authorises the inline style and script with the same nonce', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /<style nonce="TESTNONCE123">/);
      assert.match(html, /<script nonce="TESTNONCE123">/);
    });
  });

  describe('media', () => {
    it('renders the GIF as the centrepiece with a reduced-motion poster', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /<img id="cat"[^>]*src="https:\/\/cdn\/assets\/orange-cat-laughing\.gif"/);
      assert.match(html, /data-poster="https:\/\/cdn\/assets\/cat-laughing-cat-laughing-meme\.png"/);
      assert.match(html, /alt="An orange cat laughing"/);
    });

    it('renders the audio element when sound is enabled', () => {
      const html = buildReactionHtml(model({ soundEnabled: true }));
      assert.match(html, /<audio id="laugh" src="https:\/\/cdn\/assets\/cat-laughing-at-you\.mp3"/);
      assert.match(html, /data-volume="1"/);
    });

    it('renders the configured volume onto the audio element', () => {
      const html = buildReactionHtml(model({ soundEnabled: true, volume: 0.35 }));
      assert.match(html, /data-volume="0.35"/);
    });

    it('clamps an out-of-range volume before it reaches the markup', () => {
      assert.match(buildReactionHtml(model({ volume: 4 })), /data-volume="1"/);
      assert.match(buildReactionHtml(model({ volume: -2 })), /data-volume="0"/);
    });

    it('omits the audio element entirely when sound is disabled', () => {
      const html = buildReactionHtml(model({ soundEnabled: false }));
      assert.equal(html.includes('<audio'), false);
    });
  });

  describe('content & accessibility', () => {
    it('shows the headline in the title and heading and the detail as text', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /<title>Skill Issue<\/title>/);
      assert.match(html, /<h1>Skill Issue<span id="repeat" class="repeat" hidden><\/span><\/h1>/);
      assert.match(html, /npm: test failed \(exit code 1\)/);
    });

    it('marks the card as a polite live region with a dismiss control', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /role="status" aria-live="polite"/);
      assert.match(html, /<button id="close"[^>]*>Dismiss<\/button>/);
    });

    it('keeps the sound-blocked note and play button hidden by default', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /<p id="sound-off" class="note" hidden>/);
      assert.match(html, /<button id="play-sound" type="button" hidden>/);
    });
  });

  describe('click-anywhere sound unlock', () => {
    it('invites a single click with a clearer hint', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /Click anywhere to play the laugh/);
    });

    it('makes the whole card a one-click target for the laugh when sound is on', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /\.card\.clickable \{ cursor: pointer; \}/);
      assert.match(html, /card\.addEventListener\('click'/);
      assert.match(html, /closest\('button'\)/);
    });
  });

  describe('sound looping & idle persistence', () => {
    it('plays the laugh a fixed number of times per reaction', () => {
      const html = buildReactionHtml(model({ soundEnabled: true }));
      assert.match(html, /data-loops="2"/);
      assert.match(html, /function replayLoop\(\)/);
      assert.match(html, /addEventListener\('ended', replayLoop\)/);
    });

    it('keeps the panel in a subtle idle state so a one-time unlock persists', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /id="idle-hint"/);
      assert.match(html, /\.card\.is-idle/);
      assert.match(html, /msg\.command === 'idle'/);
      assert.match(html, /function setIdle\(\)/);
    });
  });

  describe('escaping', () => {
    it('neutralises HTML injected through the detail', () => {
      const html = buildReactionHtml(model({ detail: '<script>alert(1)</script>' }));
      assert.equal(html.includes('<script>alert(1)</script>'), false);
      assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    });

    it('neutralises HTML injected through the headline', () => {
      const html = buildReactionHtml(model({ headline: '<img src=x onerror=alert(1)>' }));
      assert.equal(html.includes('<img src=x onerror=alert(1)>'), false);
      assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    });
  });

  describe('repeat acknowledgment & dismissal', () => {
    it('hides the repeat badge for a first/standalone reaction', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /<span id="repeat" class="repeat" hidden><\/span>/);
    });

    it('shows a ×N badge when the reaction represents a streak', () => {
      const html = buildReactionHtml(model({ repeatCount: 3 }));
      assert.match(html, /<span id="repeat" class="repeat">×3<\/span>/);
    });

    it('treats a repeatCount of 1 as no repeat', () => {
      const html = buildReactionHtml(model({ repeatCount: 1 }));
      assert.match(html, /<span id="repeat" class="repeat" hidden><\/span>/);
    });

    it('updates the badge from react messages and dismisses on Escape', () => {
      const html = buildReactionHtml(model());
      assert.match(html, /function setRepeat\(count\)/);
      assert.match(html, /react\(msg\.message, msg\.count\)/);
      assert.match(html, /event\.key === 'Escape'/);
    });
  });

  describe('escapeHtml', () => {
    it('escapes every HTML-significant character', () => {
      assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
    });

    it('leaves ordinary text untouched', () => {
      assert.equal(escapeHtml('npm: test failed (exit code 1)'), 'npm: test failed (exit code 1)');
    });

    it('escapes an empty string to an empty string', () => {
      assert.equal(escapeHtml(''), '');
    });
  });

  describe('clampVolume', () => {
    it('clamps to the [0, 1] range', () => {
      assert.equal(clampVolume(2), 1);
      assert.equal(clampVolume(-1), 0);
      assert.equal(clampVolume(0.6), 0.6);
    });

    it('defaults to 1 for a non-finite value', () => {
      assert.equal(clampVolume(Number.NaN), 1);
      assert.equal(clampVolume(Number.POSITIVE_INFINITY), 1);
    });
  });
});
