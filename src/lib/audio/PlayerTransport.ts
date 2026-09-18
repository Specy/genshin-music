import * as workerTimers from 'worker-timers';
import { type TransportClock, type TransportTimer, TRANSPORT_HORIZON_S } from './ComposerTransport';

// worker-timers rather than window.setTimeout, for the same reason Metronome.ts, Utilities.ts's
// delay() and ComposerTransport.ts use it: the timer lives in a Worker and keeps firing at full
// rate in a backgrounded or throttled tab. Load-bearing, not a nicety - the player is the surface
// people leave running while they read a sheet in another tab, and a wake clamped to ~1/s would
// drain the committed horizon between wakes and stall both the audio and the note cursor.
const defaultTimer: TransportTimer = {
  setTimeout: workerTimers.setTimeout,
  clearTimeout: workerTimers.clearTimeout,
};

/**
 * How far in the future an anchored run begins sounding, in seconds - the same reason as
 * Metronome's START_MARGIN_S and ComposerTransport's TRANSPORT_START_MARGIN_S: audio committed at
 * exactly currentTime is at the mercy of whatever the main thread does next. The player passes its
 * own, longer margin (the metronome lead-in), so this is only the floor a caller gets by default.
 */
export const PLAYER_TRANSPORT_START_MARGIN_S = 0.05;

/** One entry of a run's timeline: everything the transport needs to know about an event. */
export type PlayerTimelineEvent = {
  /** Plan-relative onset in seconds, on the song's own time base (see PlayerTimeline). */
  atS: number;
};

/**
 * The whole of a run, fixed before it starts.
 *
 * `events` must be sorted by `atS` and may repeat a time: a chord is several events sharing one
 * boundary, and every one of them sounds at it. `finishS` is the audio-true end - the last event's
 * onset plus whatever it keeps sounding for - on the same time base as `atS`.
 */
export type PlayerTimeline = {
  events: readonly PlayerTimelineEvent[];
  finishS: number;
};

/**
 * Everything the transport knows about the outside. It owns TIME only: what an event contains,
 * which instrument sounds it, and retracting committed-but-unstarted audio on stop all stay with
 * the caller.
 */
export interface PlayerTransportCallbacks {
  /**
   * Hand event `index` to the instruments, committed to start at the absolute audio time
   * `atAudioTime`. Called at most once per event per run, and always with a time in the future -
   * an event the audio clock has already passed is skipped rather than fired late.
   */
  commitEvent(index: number, atAudioTime: number): void;
  /**
   * The cursor REACHED event `index` - its audio is starting now, which is the moment every
   * UI consequence of the note belongs to. Fired for every event in order, the anchor event
   * included (unlike ComposerTransport, which withholds it: there the anchor is a column the
   * caller selected before asking to play from it, while here it is a note nobody has announced
   * and the first thing a listener hears). `atAudioTime` is the exact boundary from the transport
   * grid, not the later clock time a delayed worker callback happened to report it at.
   */
  onSounding(index: number, atAudioTime: number): void;
  /** The run reached `finishS` with every event sounded. The transport is stopped by then. */
  onFinished(): void;
}

/**
 * The player's playback transport: one clock, two meanings of "ahead" (ADR-0009, adopting
 * ADR-0006's pattern).
 *
 * ComposerTransport's lean sibling. Same idioms - an absolute anchored grid, sleeps aimed at the
 * next boundary rather than accumulated intervals, a commit watermark that runs a horizon ahead of
 * the sounding cursor and that nothing outside may observe - over a flat sorted event timeline
 * instead of a column grid. Two positions advance over the events:
 *
 * - The SOUNDING cursor: the event the listener is hearing right now. It advances exactly at each
 *   event's audio-clock boundary and is the only position the outside ever sees (onSounding).
 * - The COMMIT watermark: how far ahead event audio has been handed to the audio clock. It runs up
 *   to TRANSPORT_HORIZON_S ahead of the clock and never stops short of the next sounding boundary,
 *   and it is purely internal.
 *
 * DELIBERATELY NO delayOffset, for the reason Metronome.ts's class docstring warns about
 * ("DELIBERATELY NOT the delayOffset idiom..."): measuring wall-clock overshoot and shortening the
 * next wait corrects when we WAKE while still timing the sound from the main thread. Here a late
 * wake self-corrects for free - the next sleep is computed from the absolute boundary - and the
 * audio went out ahead of time anyway.
 *
 * DELIBERATELY NO resync-on-mutation either, and that absence is the design rather than an
 * omission. A player run's song is immutable while it plays: there are no note edits, no roster
 * changes, no tempo edits, and a speed change or a seek stops the run and anchors a fresh one. So
 * there is no "the song changed under a running transport" case to rebuild a committed window for,
 * which is what keeps this class a fraction of ComposerTransport's size - no old-grid start map, no
 * pending-anchor recreation, no two-phase catch-up. Do not add one back without a mutation that
 * genuinely needs it.
 *
 * The transport never touches audio. commitEvent hands notes out; retracting
 * committed-but-unstarted events on stop is the caller's job, through the instruments'
 * cancellation registries.
 */
export class PlayerTransport {
  private readonly clock: TransportClock;
  private readonly callbacks: PlayerTransportCallbacks;
  private readonly timer: TransportTimer;

  private running = false;
  private events: readonly PlayerTimelineEvent[] = [];
  /** Plan time of the anchor event, and the absolute audio time it sounds at: the whole grid. */
  private anchorPlanS = 0;
  private anchorAudioS = 0;
  /** Absolute audio time the run ends at - the last event's sound, not its onset. */
  private finishAudioS = 0;
  /** Next event to sound. Everything before it has already been handed to onSounding. */
  private nextIndex = 0;
  /** Next event to commit - the watermark that makes each commit happen exactly once. */
  private commitIndex = 0;
  private pendingWake: number | null = null;

  constructor(
    clock: TransportClock,
    callbacks: PlayerTransportCallbacks,
    timer: TransportTimer = defaultTimer
  ) {
    this.clock = clock;
    this.callbacks = callbacks;
    this.timer = timer;
  }

  /** True between an anchor() and the matching stop()/onFinished(). */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Absolute audio-clock time the anchor event sounds at, or null while stopped. Read back rather
   * than recomputed by the caller: notes resumed mid-span have to land on exactly this instant,
   * and a second `clock.now() + margin` would land a hair beside it.
   */
  get anchorAudioTime(): number | null {
    return this.running ? this.anchorAudioS : null;
  }

  /**
   * Start a run: event `fromIndex` of `timeline` begins sounding at clock.now() + marginS, and
   * every later event follows on the timeline's own spacing. The pending wake is cleared up front
   * so a re-anchor cannot leave the old grid's timer alive beside the new one.
   *
   * Events BEFORE `fromIndex` stay in the list and are simply never reached - a caller that sliced
   * a song at a note keeps the notes before it addressable (they are what a mid-span resume is
   * looked up in) without a second array.
   *
   * An empty timeline, or a `fromIndex` outside [0, events.length), leaves the transport STOPPED
   * and fires nothing - not onFinished. Nothing sounded, so the audio-true end never happened, and
   * reporting one would run the caller's end-of-song routine synchronously from inside anchor(), a
   * re-entrancy no other path has: every real callback fires from a wake.
   */
  anchor(
    timeline: PlayerTimeline,
    fromIndex: number,
    marginS: number = PLAYER_TRANSPORT_START_MARGIN_S
  ): void {
    this.clearPendingWake();
    const { events } = timeline;
    if (fromIndex < 0 || fromIndex > events.length - 1) {
      this.running = false;
      return;
    }
    this.running = true;
    this.events = events;
    this.anchorPlanS = events[fromIndex].atS;
    this.anchorAudioS = this.clock.now() + marginS;
    // A finish before the last onset would end the run while an event still had to sound; clamp
    // rather than trust it, so a caller's arithmetic mistake cannot truncate the song.
    const lastOnsetS = events[events.length - 1].atS;
    const finishS =
      Number.isFinite(timeline.finishS) && timeline.finishS > lastOnsetS
        ? timeline.finishS
        : lastOnsetS;
    this.finishAudioS = this.audioTimeOf(finishS);
    this.nextIndex = fromIndex;
    this.commitIndex = fromIndex;
    this.topUp();
    this.armSleep();
  }

  /**
   * Stops advancing and touches no audio. Cancelling the ~1 s of committed sound is the caller's
   * job, and it is not optional bookkeeping: an uncancelled stop leaks the whole window as runaway
   * notes (ADR-0006's rationale, unchanged here).
   */
  stop(): void {
    this.running = false;
    this.clearPendingWake();
  }

  /** Where an event on the timeline's time base sounds on the audio clock. */
  private audioTimeOf(planS: number): number {
    return this.anchorAudioS + (planS - this.anchorPlanS);
  }

  /**
   * The single loop: advance the sounding cursor across every boundary the audio clock has passed,
   * then top the committed window back up and re-arm. One loop rather than a cursor process beside
   * a scheduler process, so the two positions cannot drift apart - both are read off the same grid
   * within the same wake.
   *
   * A wake arriving BEFORE the next boundary advances nothing and simply re-arms: the while
   * condition is itself the staleness guard. After a stall (throttled tab, suspended context) the
   * loop reports every missed event in order, so consumers see a contiguous history rather than a
   * jump - the cursor is position, not sound, and it must land where the audio actually is.
   */
  private onWake(): void {
    if (!this.running) return;
    const now = this.clock.now();
    const sounding: { index: number; at: number }[] = [];
    while (this.nextIndex < this.events.length) {
      const at = this.audioTimeOf(this.events[this.nextIndex].atS);
      if (now < at) break;
      sounding.push({ index: this.nextIndex, at });
      this.nextIndex++;
    }
    // A stall can carry the cursor past the watermark. Those events never had audio scheduled and
    // cannot be repaired retroactively; move the growing edge with the cursor so topUp() looks at
    // the future instead of walking a backlog it would only skip.
    if (this.commitIndex < this.nextIndex) this.commitIndex = this.nextIndex;
    const finished = this.nextIndex >= this.events.length && now >= this.finishAudioS;
    // Audio before UI: after a stall the horizon may be completely drained. Restore the FUTURE
    // window before handing arbitrary work to onSounding consumers.
    if (!finished) this.topUp();
    for (const event of sounding) {
      if (!this.running) return;
      this.callbacks.onSounding(event.index, event.at);
    }
    if (!this.running) return;
    if (finished) {
      this.running = false;
      this.clearPendingWake();
      this.callbacks.onFinished();
      return;
    }
    this.armSleep();
  }

  /**
   * Advance the commit watermark until the window satisfies BOTH bounds: committed at least a
   * horizon out, and never stopping short of the next sounding boundary.
   *
   * The second bound is TIME-based rather than a count of events, unlike ComposerTransport's
   * TRANSPORT_MIN_COMMIT_AHEAD: a chord is several events at one instant, so "two events ahead"
   * says nothing about how much time is covered - three notes of one chord would satisfy a count
   * of two while committing zero seconds of margin. Committing every event up to and including the
   * next boundary is what the floor actually needs to guarantee, so that is what it asks for.
   */
  private topUp(): void {
    const now = this.clock.now();
    const horizonEdge = now + TRANSPORT_HORIZON_S;
    const nextBoundaryS =
      this.nextIndex < this.events.length ? this.events[this.nextIndex].atS : -Infinity;
    while (this.commitIndex < this.events.length) {
      const event = this.events[this.commitIndex];
      const at = this.audioTimeOf(event.atS);
      if (at >= horizonEdge && event.atS > nextBoundaryS) break;
      this.commitIndex++;
      // A commit at or before currentTime is already too late for reliable Web Audio scheduling,
      // and firing it would play a past note immediately. Advance only the watermark in that case:
      // the wake loop still reports the event's sounding moment, while later events can be
      // committed safely instead of the whole window staying dry.
      if (at <= now) continue;
      this.callbacks.commitEvent(this.commitIndex - 1, at);
    }
  }

  /**
   * One sleep, aimed at the absolute next boundary - the next event, or the finish once every
   * event has sounded - clamped at 0 so a boundary already in the past wakes immediately. Sleeps
   * are DERIVED from the grid on the audio clock, so a late wake self-corrects: the next sleep is
   * computed from the absolute boundary, never from an accumulated interval, which is why there is
   * no delayOffset here (see the class docstring and Metronome.ts's warning). The timer decides
   * only WHEN TO LOOK; the audio was committed ahead of it and cannot be moved by a late wake.
   */
  private armSleep(): void {
    this.clearPendingWake();
    const target =
      this.nextIndex < this.events.length
        ? this.audioTimeOf(this.events[this.nextIndex].atS)
        : this.finishAudioS;
    const remainingMs = (target - this.clock.now()) * 1000;
    // A non-finite boundary (a song carrying a NaN onset) would make every comparison in the wake
    // loop false, so the cursor stops advancing. Sleeping a horizon rather than 0 in that case
    // makes it a stall instead of a spin: the loop keeps looking, and it cannot burn a core.
    const ms = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : TRANSPORT_HORIZON_S * 1000;
    this.pendingWake = this.timer.setTimeout(() => this.onWake(), ms);
  }

  private clearPendingWake(): void {
    if (this.pendingWake !== null) {
      this.timer.clearTimeout(this.pendingWake);
      this.pendingWake = null;
    }
  }
}
