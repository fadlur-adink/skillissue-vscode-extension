import * as assert from 'node:assert/strict';
import { NativeSoundPlayer, soundCommandCandidates } from '../../../audio/nativeSoundPlayer';
import { createNoopLogger } from '../../../logging/logger';

/**
 * Covers the native (background) audio backend.
 *
 * The command selection is pure, so it is asserted directly for each platform and
 * volume. The {@link NativeSoundPlayer} tests deliberately never trigger real
 * playback: they use an unrecognised platform (no candidates) or an absent file, so
 * `play()` short-circuits before `spawn`. That keeps the suite silent and
 * side-effect free while still proving the player is a safe, contained no-op.
 */
describe('audio/nativeSoundPlayer', () => {
  const FILE = '/ext/assets/cat-laughing-at-you.wav';

  describe('soundCommandCandidates', () => {
    it('uses afplay with a linear volume on macOS', () => {
      const [cmd] = soundCommandCandidates('darwin', FILE, 1);
      assert.equal(cmd.command, 'afplay');
      assert.deepEqual([...cmd.args], ['-v', '1.00', FILE]);
    });

    it('scales the macOS volume and clamps out-of-range values', () => {
      assert.deepEqual([...soundCommandCandidates('darwin', FILE, 0.5)[0].args], ['-v', '0.50', FILE]);
      assert.deepEqual([...soundCommandCandidates('darwin', FILE, 5)[0].args], ['-v', '1.00', FILE]);
      assert.deepEqual([...soundCommandCandidates('darwin', FILE, -1)[0].args], ['-v', '0.00', FILE]);
    });

    it('uses PowerShell SoundPlayer on Windows and escapes quotes in the path', () => {
      const [cmd] = soundCommandCandidates('win32', FILE, 1);
      assert.equal(cmd.command, 'powershell');
      const script = cmd.args[cmd.args.length - 1];
      assert.match(script, /System\.Media\.SoundPlayer/);
      assert.match(script, /\.PlaySync\(\)/);
      assert.ok(script.includes(FILE));

      const quoted = soundCommandCandidates('win32', "/tmp/it's.wav", 1)[0];
      assert.ok(
        quoted.args[quoted.args.length - 1].includes("it''s.wav"),
        'a single quote must be doubled for PowerShell',
      );
    });

    it('prefers paplay, then aplay/mpv/ffplay on Linux', () => {
      const cmds = soundCommandCandidates('linux', FILE, 1);
      assert.deepEqual(cmds.map((c) => c.command), ['paplay', 'aplay', 'mpv', 'ffplay']);
      // paplay --volume is a linear integer where 65536 == 100%.
      assert.deepEqual([...cmds[0].args], ['--volume', '65536', FILE]);
      assert.deepEqual([...cmds[1].args], [FILE]);
    });

    it('maps volume onto the Linux players that support it', () => {
      const half = soundCommandCandidates('linux', FILE, 0.5);
      assert.deepEqual([...half[0].args], ['--volume', '32768', FILE]);
      assert.ok(half[2].args.includes('--volume=50'));
    });

    it('returns no candidates for an unrecognised platform', () => {
      assert.deepEqual(soundCommandCandidates('aix', FILE, 1), []);
    });
  });

  describe('NativeSoundPlayer (never spawns in tests)', () => {
    it('is a safe no-op when no sound file is configured', () => {
      const player = new NativeSoundPlayer(createNoopLogger(), () => undefined, 'linux');
      assert.doesNotThrow(() => player.play(1, 2));
      player.dispose();
    });

    it('is a safe no-op when the platform has no player', () => {
      const player = new NativeSoundPlayer(createNoopLogger(), () => FILE, 'aix');
      assert.doesNotThrow(() => player.play());
      player.dispose();
    });

    it('ignores play() after dispose and is safe to cancel/dispose repeatedly', () => {
      const player = new NativeSoundPlayer(createNoopLogger(), () => FILE, 'aix');
      player.dispose();
      assert.doesNotThrow(() => player.play());
      assert.doesNotThrow(() => player.cancel());
      assert.doesNotThrow(() => player.dispose());
    });

    it('fires onFinish immediately when no sound file is configured', () => {
      const player = new NativeSoundPlayer(createNoopLogger(), () => undefined, 'linux');
      let finished = 0;
      player.play(1, 2, () => {
        finished += 1;
      });
      assert.equal(finished, 1);
      player.dispose();
    });

    it('fires onFinish immediately when the platform has no player', () => {
      const player = new NativeSoundPlayer(createNoopLogger(), () => FILE, 'aix');
      let finished = 0;
      player.play(1, 2, () => {
        finished += 1;
      });
      assert.equal(finished, 1);
      player.dispose();
    });

    it('does not fire onFinish for a play() ignored after dispose', () => {
      const player = new NativeSoundPlayer(createNoopLogger(), () => FILE, 'aix');
      player.dispose();
      let finished = 0;
      player.play(1, 2, () => {
        finished += 1;
      });
      assert.equal(finished, 0);
    });
  });
});
