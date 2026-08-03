// One active (held) note: an AudioBufferSourceNode with optional loop region plus its own
// per-voice GainNode, feeding the owning instrument's volume node (spec 2026-08-03 §8).
// Raw Web Audio by design — see the tone.js decision in the spec.
//
// Lifecycle: constructed = sounding. `release()` ramps the voice's gain to zero over the
// instrument's release time and stops the source at the end of the ramp; `releaseAt()` is
// the sample-accurate variant used by song playback (duration known at start time);
// `stop()` is the immediate teardown path (page unload, instrument disposal, voice
// stealing). All three are idempotent and safe to combine — the earliest wins.

import type { LoopRegion } from '$lib/games/types';

export type VoiceOptions = {
  context: BaseAudioContext;
  buffer: AudioBuffer;
  destination: AudioNode;
  playbackRate: number;
  /** Loop region in seconds; null/undefined = play the sample one-shot (no loop). */
  loop?: LoopRegion | null;
  /** Release ramp length in seconds. */
  release: number;
  /** Start delay in seconds from now. */
  delay?: number;
};

export class Voice {
  private readonly context: BaseAudioContext;
  private readonly source: AudioBufferSourceNode;
  private readonly gain: GainNode;
  private readonly releaseS: number;
  /** Context time the voice started (or will start) sounding at. */
  readonly startedAt: number;
  private releaseScheduledAt: number | null = null;
  private disposed = false;

  constructor(options: VoiceOptions) {
    this.context = options.context;
    this.releaseS = options.release;
    this.gain = options.context.createGain();
    this.gain.gain.value = 1;
    this.source = options.context.createBufferSource();
    this.source.buffer = options.buffer;
    this.source.playbackRate.value = options.playbackRate;
    if (options.loop) {
      this.source.loop = true;
      this.source.loopStart = options.loop.start;
      this.source.loopEnd = options.loop.end;
    }
    this.source.connect(this.gain);
    this.gain.connect(options.destination);
    this.startedAt = options.context.currentTime + (options.delay ?? 0);
    this.source.start(options.delay ? this.startedAt : undefined);
    this.source.addEventListener('ended', this.dispose, { once: true });
  }

  get isReleased() {
    return this.releaseScheduledAt !== null;
  }

  get isDisposed() {
    return this.disposed;
  }

  /** Release now (live key-up). */
  release = () => {
    this.releaseAt(this.context.currentTime);
  };

  /** Release at an absolute context time — sample-accurate scheduling for playback. Never before the voice has started. */
  releaseAt = (when: number) => {
    if (this.disposed) return;
    const at = Math.max(when, this.startedAt, this.context.currentTime);
    // A stop/blur may need to bring a future song-playback release forward. Later
    // requests remain no-ops, preserving idempotence for repeated key-up events.
    if (this.releaseScheduledAt !== null && this.releaseScheduledAt <= at) return;
    this.releaseScheduledAt = at;
    this.gain.gain.cancelScheduledValues(at);
    this.gain.gain.setValueAtTime(this.gain.gain.value, at);
    this.gain.gain.linearRampToValueAtTime(0, at + this.releaseS);
    try {
      this.source.stop(at + this.releaseS);
    } catch {
      // QUIRK: stop() throws if the source somehow never started; the ended handler
      // still runs the teardown, so swallowing is safe.
    }
  };

  /** Immediate hard stop + disconnect (teardown / voice stealing). */
  stop = () => {
    if (this.disposed) return;
    try {
      this.source.stop();
    } catch {
      // see releaseAt
    }
    this.dispose();
  };

  private dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.source.removeEventListener('ended', this.dispose);
    this.source.disconnect();
    this.gain.disconnect();
  };
}
