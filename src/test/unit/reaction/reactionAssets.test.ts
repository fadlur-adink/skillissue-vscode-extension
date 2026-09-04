import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REACTION_ASSET_DIR, REACTION_ASSETS } from '../../../reaction/reactionAssets';

/**
 * Ties the declared asset names to the files that actually ship.
 *
 * The compiled suite runs from `out/test/unit/reaction`, so the repository root
 * is four levels up. If a media file is ever renamed without updating
 * `reactionAssets.ts`, these checks fail loudly here rather than the WebView
 * silently 404-ing at runtime.
 */
describe('reaction/reactionAssets', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const assetPath = (file: string): string => path.join(repoRoot, REACTION_ASSET_DIR, file);

  it('lives in the bundled assets directory', () => {
    assert.equal(REACTION_ASSET_DIR, 'assets');
    assert.ok(fs.existsSync(path.join(repoRoot, REACTION_ASSET_DIR)));
  });

  it('names the shipped media exactly', () => {
    assert.equal(REACTION_ASSETS.gif, 'orange-cat-laughing.gif');
    assert.equal(REACTION_ASSETS.audio, 'cat-laughing-at-you.mp3');
    assert.equal(REACTION_ASSETS.audioWav, 'cat-laughing-at-you.wav');
    assert.equal(REACTION_ASSETS.poster, 'cat-laughing-cat-laughing-meme.png');
  });

  for (const [role, file] of Object.entries(REACTION_ASSETS)) {
    it(`bundles a real file for the "${role}" asset`, () => {
      const full = assetPath(file);
      assert.ok(fs.existsSync(full), `missing asset: ${full}`);
      assert.ok(fs.statSync(full).size > 0, `asset is empty: ${full}`);
    });
  }
});
