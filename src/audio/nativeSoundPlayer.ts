import { ChildProcess, spawn } from 'node:child_process';
import { Logger } from '../logging/logger';

/**
 * Background sound via the operating system's own audio player.
 *
 * SkillIssue's WebView audio is subject to Chromium's autoplay policy, so it can
 * need a user click to unlock. This module sidesteps that entirely: the extension
 * host is plain Node, which has no autoplay restriction, so we simply spawn a
 * native player (`afplay`, `paplay`, PowerShell's `SoundPlayer`, …). The sound
 * then plays in the background — no WebView, no click, even when VS Code is not
 * focused.
 *
 * Two pieces, kept separate so the risky part stays testable:
 * - {@link soundCommandCandidates} is **pure**: platform + file + volume → an
 *   ordered list of player commands. Unit-tested without spawning anything.
 * - {@link NativeSoundPlayer} owns the `child_process` boundary. Every failure
 *   (missing player, spawn error, killed process) is contained and logged — a meme
 *   must never surface as a workflow failure.
 */

/** A concrete player invocation: a command plus its argument vector. */
export interface SoundCommand {
  readonly command: string;
  readonly args: readonly string[];
}

/** Clamps a linear volume to `[0, 1]`, defaulting to 1 when not finite. */
function clampVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
}

/** Escapes a path for safe embedding in a single-quoted PowerShell string. */
function escapePowerShell(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Ordered, best-first player candidates for a platform. Each encodes the file
 * path and, where the player supports it, the volume. Returns an empty list for
 * platforms we do not recognise, so we never spawn something unexpected.
 *
 * A **WAV** file is expected: it is the one format every candidate below plays
 * (`afplay`, `aplay`, `paplay`, PowerShell `SoundPlayer`), which is exactly why
 * the bundled asset ships as WAV rather than the MP3 the WebView uses.
 */
export function soundCommandCandidates(
  platform: NodeJS.Platform,
  filePath: string,
  volume: number,
): SoundCommand[] {
  const v = clampVolume(volume);
  const percent = Math.round(v * 100);
  switch (platform) {
    case 'darwin':
      // Built into macOS; `-v` is a linear gain (0 silent … 1 normal).
      return [{ command: 'afplay', args: ['-v', v.toFixed(2), filePath] }];
    case 'win32':
      // System.Media.SoundPlayer ships with Windows PowerShell and plays WAV.
      return [
        {
          command: 'powershell',
          args: [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `(New-Object System.Media.SoundPlayer '${escapePowerShell(filePath)}').PlaySync()`,
          ],
        },
      ];
    case 'linux':
      // PulseAudio first (WSLg / desktop Linux); `--volume` is a linear integer
      // where 65536 == 100%. Then ALSA, then common general-purpose players.
      return [
        { command: 'paplay', args: ['--volume', String(Math.round(v * 65536)), filePath] },
        { command: 'aplay', args: [filePath] },
        { command: 'mpv', args: ['--no-video', `--volume=${percent}`, filePath] },
        { command: 'ffplay', args: ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath] },
      ];
    default:
      // Unknown platform: do not guess a command.
      return [];
  }
}

/**
 * Plays a sound file through the best available native player, in the background.
 *
 * Safe by construction: {@link NativeSoundPlayer.play} never throws, a missing
 * player falls through to the next candidate, and {@link NativeSoundPlayer.cancel}
 * / {@link NativeSoundPlayer.dispose} stop in-flight playback. The clip is played
 * `loops` times back-to-back for a longer, more noticeable laugh.
 */
export class NativeSoundPlayer {
  private current: ChildProcess | undefined;
  /** Bumped on every cancel/play so stale async callbacks are ignored. */
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly logger: Logger,
    private readonly resolveFile: () => string | undefined,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  /**
   * Starts background playback. Contained: any problem is logged, never thrown.
   *
   * `onFinish` fires exactly once when playback is over — after the final loop,
   * or immediately when nothing could be played (no file, no player) — so callers
   * can synchronise UI with the sound without polling. It never fires for a
   * superseded or cancelled playback.
   */
  play(volume = 1, loops = 2, onFinish?: () => void): void {
    if (this.disposed) {
      return;
    }
    const file = this.resolveFile();
    if (!file) {
      this.logger.debug('System audio skipped: no sound file configured');
      onFinish?.();
      return;
    }
    const candidates = soundCommandCandidates(this.platform, file, volume);
    if (candidates.length === 0) {
      this.logger.debug(`System audio skipped: no player for platform "${this.platform}"`);
      onFinish?.();
      return;
    }
    // Starting a new sound supersedes any still-playing one.
    this.cancel();
    this.run(candidates, 0, Math.max(1, Math.floor(loops)), this.generation, onFinish);
  }

  private run(
    candidates: SoundCommand[],
    index: number,
    remaining: number,
    generation: number,
    onFinish?: () => void,
  ): void {
    if (this.disposed || generation !== this.generation) {
      return;
    }
    if (remaining <= 0 || index >= candidates.length) {
      // Every loop played (or every player failed) — the sound is over either way.
      onFinish?.();
      return;
    }
    const candidate = candidates[index];
    let child: ChildProcess;
    try {
      child = spawn(candidate.command, [...candidate.args], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch (error) {
      this.logger.debug(`System audio: spawn("${candidate.command}") threw — ${String(error)}`);
      this.run(candidates, index + 1, remaining, generation, onFinish);
      return;
    }

    this.current = child;
    let errored = false;
    child.once('error', (error) => {
      errored = true;
      if (generation !== this.generation) {
        return;
      }
      if (this.current === child) {
        this.current = undefined;
      }
      // Almost always ENOENT (the player is not installed) — try the next one.
      this.logger.debug(`System audio: "${candidate.command}" unavailable — ${String(error)}`);
      this.run(candidates, index + 1, remaining, generation, onFinish);
    });
    child.once('close', () => {
      if (errored || generation !== this.generation) {
        return;
      }
      if (this.current === child) {
        this.current = undefined;
      }
      // This player worked — replay it for the remaining loops.
      this.run(candidates, index, remaining - 1, generation, onFinish);
    });
  }

  /** Stops in-flight playback and cancels any queued loops. Safe at any time. */
  cancel(): void {
    this.generation += 1;
    const child = this.current;
    this.current = undefined;
    if (child) {
      try {
        child.kill();
      } catch {
        // Killing an already-exited process is not worth surfacing.
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}
