// One active (held) note: an AudioBufferSourceNode with optional loop region plus its own
// per-voice GainNode, feeding the owning instrument's volume node (spec 2026-08-03 §8).
// Raw Web Audio by design — see the tone.js decision in the spec.
//
// Lifecycle: constructed = sounding. `release()` crossfades the sustain loop into a second
// source playing the sample's natural post-loop tail; `releaseAt()` is the sample-accurate
// variant used by song playback. `fadeOut()` skips the tail for playback stop/retrigger,
// while `stop()` is immediate teardown (page unload, disposal, voice stealing). Release
// scheduling is idempotent and safe to bring forward — the earliest request wins.

import type { LoopRegion } from '$lib/games/types';

export type VoiceOptions = {
  context: BaseAudioContext;
  buffer: AudioBuffer;
  destination: AudioNode;
  playbackRate: number;
  /** Loop region in seconds; null/undefined = play the sample one-shot (no loop). */
  loop?: LoopRegion | null;
  /** Fade length at the end of the natural release tail (and fallback fade length). */
  release: number;
  /** Sustain-to-release crossfade length in seconds (default 20 ms). */
  crossfade?: number;
  /** Start delay in seconds from now. */
  delay?: number;
};

export class Voice {
  private readonly context: BaseAudioContext;
  private readonly buffer: AudioBuffer;
  private readonly destination: AudioNode;
  private readonly playbackRate: number;
  private readonly loop: LoopRegion | null;
  private readonly source: AudioBufferSourceNode;
  private readonly gain: GainNode;
  private readonly releaseS: number;
  private readonly crossfadeS: number;
  private releaseSource: AudioBufferSourceNode | null = null;
  private releaseGain: GainNode | null = null;
  /** Context time the voice started (or will start) sounding at. */
  readonly startedAt: number;
  private releaseScheduledAt: number | null = null;
  private disposed = false;

  constructor(options: VoiceOptions) {
    this.context = options.context;
    this.buffer = options.buffer;
    this.destination = options.destination;
    //instrument metadata is authored data — sanitize before it reaches Web Audio, where
    //negative/NaN values throw or produce browser-dependent behavior
    this.releaseS = Number.isFinite(options.release)
      ? Math.min(60, Math.max(0, options.release))
      : 0.1;
    this.crossfadeS = Number.isFinite(options.crossfade)
      ? Math.min(0.1, Math.max(0, options.crossfade as number))
      : 0.02;
    this.gain = options.context.createGain();
    this.gain.gain.value = 1;
    this.source = options.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.playbackRate =
      Number.isFinite(options.playbackRate) && options.playbackRate > 0 ? options.playbackRate : 1;
    this.source.playbackRate.value = this.playbackRate;
    this.loop = Voice.sanitizeLoop(options.loop, this.buffer.duration);
    if (this.loop) {
      this.source.loop = true;
      this.source.loopStart = this.loop.start;
      this.source.loopEnd = this.loop.end;
    }
    this.source.connect(this.gain);
    this.gain.connect(this.destination);
    const delay =
      Number.isFinite(options.delay as number) && (options.delay as number) > 0
        ? (options.delay as number)
        : 0;
    this.startedAt = options.context.currentTime + delay;
    this.source.start(delay ? this.startedAt : undefined);
    this.source.addEventListener('ended', this.handleSustainEnded, { once: true });
  }

  /** A loop region is used only when its bounds are finite, ordered, and inside the sample; anything else falls back to one-shot playback (still audible, never invalid automation). */
  private static sanitizeLoop(
    loop: LoopRegion | null | undefined,
    bufferDuration: number
  ): LoopRegion | null {
    if (!loop) return null;
    if (!Number.isFinite(loop.start) || !Number.isFinite(loop.end)) return null;
    const start = Math.max(0, loop.start);
    const end =
      Number.isFinite(bufferDuration) && bufferDuration > 0
        ? Math.min(loop.end, bufferDuration)
        : loop.end;
    if (end <= start) return null;
    return { start, end };
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
    if (this.releaseScheduledAt !== null) this.cancelReleaseTail();
    this.releaseScheduledAt = at;
    if (!this.startReleaseTail(at)) this.fadeSustainAt(at, this.releaseS);
  };

  /** Fade the entire logical voice without spawning a release tail (playback stop). */
  fadeOut = (duration = this.releaseS) => {
    if (this.disposed) return;
    // A delayed source must be cancelled, not faded from its future start time;
    // otherwise pressing Stop before it starts would still produce a late attack.
    if (this.startedAt > this.context.currentTime) {
      this.stop();
      return;
    }
    const at = this.context.currentTime;
    const fadeS = Number.isFinite(duration) ? Math.max(0, duration) : this.releaseS;
    // A tail scheduled for the future must never start after a global stop/retrigger.
    if (this.releaseScheduledAt !== null && this.releaseScheduledAt > at) {
      this.cancelReleaseTail();
    }
    this.releaseScheduledAt =
      this.releaseScheduledAt === null ? at : Math.min(this.releaseScheduledAt, at);
    this.fadeParam(this.gain.gain, at, fadeS);
    this.stopSource(this.source, at + fadeS);
    if (this.releaseSource && this.releaseGain) {
      this.fadeParam(this.releaseGain.gain, at, fadeS);
      this.stopSource(this.releaseSource, at + fadeS);
    }
  };

  /** Short same-button choke: avoids a full-volume old voice under the new attack. */
  choke = () => {
    this.fadeOut(this.crossfadeS);
  };

  /** Immediate hard stop + disconnect (teardown / voice stealing). */
  stop = () => {
    if (this.disposed) return;
    this.stopSource(this.source);
    if (this.releaseSource) this.stopSource(this.releaseSource);
    this.dispose();
  };

  /** Crossfade to the source sample's post-loop tail; returns false when no tail exists. */
  private startReleaseTail(at: number): boolean {
    const loop = this.loop;
    if (!loop || loop.end >= this.buffer.duration) return false;
    const tailDuration = (this.buffer.duration - loop.end) / this.playbackRate;
    if (!Number.isFinite(tailDuration) || tailDuration <= 0) return false;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.buffer;
    source.playbackRate.value = this.playbackRate;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.destination);
    this.releaseSource = source;
    this.releaseGain = gain;
    source.addEventListener('ended', this.handleReleaseEnded, { once: true });

    const endAt = at + tailDuration;
    const crossfadeS = Math.min(this.crossfadeS, tailDuration);
    gain.gain.setValueAtTime(0, at);
    if (crossfadeS > 0) gain.gain.linearRampToValueAtTime(1, at + crossfadeS);
    else gain.gain.setValueAtTime(1, at);

    // Preserve the sample's natural tail, adding only a final safety fade so a
    // non-zero encoded last frame cannot click when the source ends.
    const finalFadeS = Math.min(this.releaseS, Math.max(0, tailDuration - crossfadeS));
    if (finalFadeS > 0) {
      const finalFadeAt = endAt - finalFadeS;
      if (finalFadeAt > at + crossfadeS) gain.gain.setValueAtTime(1, finalFadeAt);
      gain.gain.linearRampToValueAtTime(0, endAt);
    }

    source.start(at, loop.end);
    this.stopSource(source, endAt);
    this.fadeSustainAt(at, crossfadeS);
    return true;
  }

  private fadeSustainAt(at: number, duration: number) {
    this.fadeParam(this.gain.gain, at, duration);
    this.stopSource(this.source, at + duration);
  }

  private fadeParam(param: AudioParam, at: number, duration: number) {
    // Preserve the instantaneous value if fadeOut interrupts an in-progress or
    // future automation curve. Safari gained cancelAndHoldAtTime later than the
    // other automation methods, so retain a compatible fallback.
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
    else {
      const value = param.value;
      param.cancelScheduledValues(at);
      param.setValueAtTime(value, at);
    }
    param.linearRampToValueAtTime(0, at + duration);
  }

  private stopSource(source: AudioBufferSourceNode, when?: number) {
    try {
      source.stop(when);
    } catch {
      // Stopping an already-ended/not-yet-started source is harmless teardown.
    }
  }

  private cancelReleaseTail() {
    if (this.releaseSource) {
      this.releaseSource.removeEventListener('ended', this.handleReleaseEnded);
      this.stopSource(this.releaseSource);
      this.releaseSource.disconnect();
    }
    this.releaseGain?.disconnect();
    this.releaseSource = null;
    this.releaseGain = null;
  }

  private handleSustainEnded = () => {
    // During a tail crossfade the sustain source ending is only half of the voice;
    // keep the release source connected until its own natural end.
    if (this.releaseSource) {
      this.source.disconnect();
      this.gain.disconnect();
      return;
    }
    this.dispose();
  };

  private handleReleaseEnded = () => {
    this.dispose();
  };

  private dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.source.removeEventListener('ended', this.handleSustainEnded);
    this.releaseSource?.removeEventListener('ended', this.handleReleaseEnded);
    this.source.disconnect();
    this.gain.disconnect();
    this.releaseSource?.disconnect();
    this.releaseGain?.disconnect();
    this.releaseSource = null;
    this.releaseGain = null;
  };
}
