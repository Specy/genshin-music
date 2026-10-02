// One active (held) note: an AudioBufferSourceNode with optional loop region plus its own
// per-voice GainNode, feeding the owning instrument's volume node (spec 2026-08-03 §8).
// Raw Web Audio by design — see the tone.js decision in the spec.
//
// Lifecycle: constructed = sounding. What note-off does is the loopMode (standard
// sampler semantics — SFZ loop_mode): 'loop-continuous' keeps looping and fades out
// over `release`; 'loop-sustain' stops wrapping and crossfades into a second source
// playing out the remainder of the pass from the exact playhead phase into the
// sample's natural tail. Releases are NEVER deferred to a loop boundary — like every
// sampler, note-off acts immediately from wherever the playhead is (the Instrument
// enforces any authored `minLength` by releasing at a later time; the Voice itself
// knows no minimum). `releaseAt()` is
// the sample-accurate variant used by song playback (the loop-sustain phase is
// deterministic, so even future releases schedule exactly). `fadeOut()` skips the
// tail for playback stop/retrigger, while `stop()` is immediate teardown (page
// unload, disposal, voice stealing). Release scheduling is idempotent and safe to
// bring forward — the earliest request wins.

import type { LoopRegion, SustainLoopMode } from '$lib/games/types';

export type VoiceOptions = {
  context: BaseAudioContext;
  buffer: AudioBuffer;
  destination: AudioNode;
  playbackRate: number;
  /** Loop region in seconds; null/undefined = play the sample one-shot (no loop). */
  loop?: LoopRegion | null;
  /**
   * Note-off behavior (default 'loop-continuous'). 'one-shot' never reaches Voice —
   * the Instrument routes it to the plain one-shot play() path.
   */
  loopMode?: Exclude<SustainLoopMode, 'one-shot'>;
  /** Fade at the end of the natural release tail; ALSO the loop-continuous fade-out length. */
  release: number;
  /** Sustain-to-release crossfade length in seconds (default 20 ms). */
  crossfade?: number;
  /**
   * Absolute AudioContext time to start sounding at; undefined or already past starts
   * now. Absolute rather than a relative delay because committed playback must land
   * exactly on the transport's audio-clock grid — a delay measured from "now" re-reads
   * currentTime at call time, which jitters the seams between scheduler top-ups
   * (ADR-0006).
   */
  at?: number;
  /**
   * Seconds of the NOTE already elapsed when this voice starts (resuming playback
   * mid-note): audio begins at the buffer position the playhead would have reached
   * by holding for `skip` seconds — through the attack, wrapped inside the loop
   * once past it. Expressed in note time; the buffer offset scales by playbackRate.
   * The start is spliced in over `crossfade` seconds — a hard start at an arbitrary
   * mid-waveform amplitude would click.
   */
  skip?: number;
  /** Notify the owning Instrument when this voice has fully torn down. */
  onDispose?: (voice: Voice) => void;
};

export class Voice {
  private readonly context: BaseAudioContext;
  private readonly buffer: AudioBuffer;
  private readonly destination: AudioNode;
  private readonly playbackRate: number;
  private readonly loop: LoopRegion | null;
  private readonly loopMode: Exclude<SustainLoopMode, 'one-shot'>;
  private readonly source: AudioBufferSourceNode;
  private readonly gain: GainNode;
  private readonly releaseS: number;
  private readonly crossfadeS: number;
  private releaseSource: AudioBufferSourceNode | null = null;
  private releaseGain: GainNode | null = null;
  private readonly onDispose: ((voice: Voice) => void) | undefined;
  /** Buffer position (seconds) the source starts at — 0 unless `skip` resumed mid-note. */
  private readonly initialPosition: number;
  /** End time of the skipped-start ramp-in, or null when no ramp was scheduled. */
  private readonly rampInEndAt: number | null;
  /** Context time the voice started (or will start) sounding at. */
  readonly startedAt: number;
  private releaseScheduledAt: number | null = null;
  private disposed = false;

  constructor(options: VoiceOptions) {
    this.context = options.context;
    this.buffer = options.buffer;
    this.destination = options.destination;
    this.onDispose = options.onDispose;
    //instrument metadata is authored data — sanitize before it reaches Web Audio, where
    //negative/NaN values throw or produce browser-dependent behavior
    this.releaseS = Number.isFinite(options.release)
      ? Math.min(60, Math.max(0, options.release))
      : 0.1;
    const crossfade = options.crossfade;
    this.crossfadeS =
      typeof crossfade === 'number' && Number.isFinite(crossfade)
        ? Math.min(0.1, Math.max(0, crossfade))
        : 0.02;
    this.gain = options.context.createGain();
    this.gain.gain.value = 1;
    this.source = options.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.playbackRate =
      Number.isFinite(options.playbackRate) && options.playbackRate > 0 ? options.playbackRate : 1;
    this.source.playbackRate.value = this.playbackRate;
    this.loop = Voice.sanitizeLoop(options.loop, this.buffer.duration);
    this.loopMode = options.loopMode ?? 'loop-continuous';
    if (this.loop) {
      this.source.loop = true;
      this.source.loopStart = this.loop.start;
      this.source.loopEnd = this.loop.end;
    }
    this.source.connect(this.gain);
    this.gain.connect(this.destination);
    const requestedSkip = options.skip;
    const skip =
      typeof requestedSkip === 'number' && Number.isFinite(requestedSkip) && requestedSkip > 0
        ? requestedSkip
        : 0;
    // Where the playhead would be after holding for `skip` seconds — the same mapping
    // sourcePositionAt uses live, so a later loop-sustain release still splices exactly.
    // On a loopless sample a skip past the end clamps there: born ended, plays nothing.
    this.initialPosition = Math.min(
      this.positionAfter(skip * this.playbackRate),
      this.buffer.duration
    );
    const requestedAt = options.at;
    // A past (or absent/non-finite) `at` clamps to now: source.start() would play it
    // immediately anyway, and a startedAt before the true start would misplace the
    // phase math in sourcePositionAt and the pre-start checks in releaseAt/fadeOut.
    this.startedAt =
      typeof requestedAt === 'number' &&
      Number.isFinite(requestedAt) &&
      requestedAt > options.context.currentTime
        ? requestedAt
        : options.context.currentTime;
    const scheduledAhead = this.startedAt > options.context.currentTime;
    if (this.initialPosition > 0 && this.crossfadeS > 0) {
      // A resumed start lands on an arbitrary waveform amplitude; stepping there
      // from silence clicks. Ramp in over the same short crossfade the release tail
      // uses for its splice (identical problem, opposite direction). fadeSustainAt
      // anchors later fades with rampInValueAt, never the scheduling-time .value —
      // which this automation would make stale.
      this.rampInEndAt = this.startedAt + this.crossfadeS;
      this.gain.gain.setValueAtTime(0, this.startedAt);
      this.gain.gain.linearRampToValueAtTime(1, this.rampInEndAt);
    } else {
      this.rampInEndAt = null;
    }
    if (this.initialPosition > 0) {
      this.source.start(this.startedAt, this.initialPosition);
    } else {
      this.source.start(scheduledAhead ? this.startedAt : undefined);
    }
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

  /**
   * Release at an absolute context time — sample-accurate scheduling for playback.
   * Never before the voice has started; otherwise the release acts exactly when
   * requested, mid-loop wherever the playhead is (standard sampler behavior).
   */
  releaseAt = (when: number) => {
    if (this.disposed) return;
    const at = Math.max(when, this.startedAt, this.context.currentTime);
    // A stop/blur may need to bring a future song-playback release forward. Later
    // requests remain no-ops, preserving idempotence for repeated key-up events.
    if (this.releaseScheduledAt !== null && this.releaseScheduledAt <= at) return;
    if (this.releaseScheduledAt !== null) this.cancelReleaseTail();
    this.releaseScheduledAt = at;
    // loop-continuous (and loopless voices): keep playing as-is under a `release`-
    // seconds fade — the loop wraps freely until the fade silences it.
    if (this.loopMode !== 'loop-sustain' || !this.startReleaseTail(at)) {
      this.fadeSustainAt(at, this.releaseS);
    }
  };

  /** Fade the entire logical voice without spawning a release tail (playback stop). */
  fadeOut = (duration = this.releaseS) => {
    if (this.disposed) return;
    // A source committed to a future start must be cancelled, not faded from that time;
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

  /**
   * Buffer position after `played` seconds of source-domain progress (already scaled
   * by playbackRate): linear until the first pass reaches loop.end, wrapped inside
   * the loop region from then on — exactly how the AudioBufferSourceNode advances.
   */
  private positionAfter(played: number): number {
    const loop = this.loop;
    if (!loop || played < loop.end) return played; // still in the attack or first pass
    return loop.start + ((played - loop.end) % (loop.end - loop.start));
  }

  /**
   * The looping source's exact sample position at context time `at` — deterministic
   * (start position, start time, rate and loop bounds are all fixed), which is what
   * lets a FUTURE loop-sustain release schedule its play-out sample-accurately with
   * no timers.
   */
  private sourcePositionAt(at: number): number {
    return this.positionAfter(
      this.initialPosition + Math.max(0, at - this.startedAt) * this.playbackRate
    );
  }

  /**
   * loop-sustain note-off: stop wrapping and play out the rest of the sample from
   * the exact playhead phase (SFZ loop_mode=loop_sustain — the remainder of the
   * current pass, then past loop.end into the natural tail; a tap released in the
   * attack simply plays the file front to back). Implemented as a second, unlooped
   * source spliced in with a short crossfade of identical content, because a
   * future `source.loop = false` cannot be scheduled on the audio timeline.
   * Returns false when no audible tail would remain.
   */
  private startReleaseTail(at: number): boolean {
    if (!this.loop) return false;
    const position = this.sourcePositionAt(at);
    const tailDuration = (this.buffer.duration - position) / this.playbackRate;
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

    source.start(at, position);
    this.stopSource(source, endAt);
    this.fadeSustainAt(at, crossfadeS);
    return true;
  }

  /** Gain the skipped-start ramp-in reaches at `at` — 1 once complete or when no ramp exists. */
  private rampInValueAt(at: number): number {
    if (this.rampInEndAt === null || at >= this.rampInEndAt) return 1;
    if (at <= this.startedAt) return 0;
    return (at - this.startedAt) / (this.rampInEndAt - this.startedAt);
  }

  private fadeSustainAt(at: number, duration: number) {
    // The anchor must be the gain's value AT the fade time, computed from the only
    // automation ever scheduled before a release (the ramp-in). Reading .value at
    // scheduling time instead would anchor a zero-delay resumed note at 0 and hard-cut
    // it at its release point; the computed anchor is also seamless mid-ramp.
    this.fadeParam(this.gain.gain, at, duration, this.rampInValueAt(at));
    this.stopSource(this.source, at + duration);
  }

  private fadeParam(param: AudioParam, at: number, duration: number, anchor = param.value) {
    // Preserve the instantaneous value if fadeOut interrupts an in-progress or
    // future automation curve. Safari gained cancelAndHoldAtTime later than the
    // other automation methods, so retain a compatible fallback.
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
    else param.cancelScheduledValues(at);
    // ALWAYS anchor the ramp with an explicit event at `at`. A linearRamp with no
    // preceding event has no defined start point: browsers interpolate from the
    // last event or from scheduling time — for a release scheduled seconds ahead
    // (Composer spanned notes) that fades the gain across the WHOLE note, then
    // resurrects to a full-volume tail at the end. cancelAndHoldAtTime inserts no
    // hold event when the param was never automated, so it alone cannot anchor.
    param.setValueAtTime(anchor, at);
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
    this.onDispose?.(this);
  };
}
