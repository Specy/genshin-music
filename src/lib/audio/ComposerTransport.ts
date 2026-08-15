import * as workerTimers from 'worker-timers';

/**
 * The audio clock the transport runs on, in seconds, injectable so a test can drive it from a
 * manual value. The composer passes one wrapping AudioProvider's context
 * (`{ now: () => ctx.currentTime }`); there is no default because a clock the transport
 * invented itself would be a second source of time, and the whole design is that there is one.
 */
export interface TransportClock {
  now(): number;
}

/**
 * The wake timer, injectable for the same reason as Metronome's MetronomeTimer: the default
 * below is worker-timers, which runs inside a real Worker that jsdom does not provide - calling
 * it there throws `ReferenceError: Worker is not defined`, so a test cannot use it.
 */
export interface TransportTimer {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

// worker-timers rather than window.setTimeout, for the same reason Metronome.ts and
// Utilities.ts's delay() use it: its timer lives in a Worker and keeps firing at full rate in a
// backgrounded or throttled tab. Load-bearing here, not a nicety - syncTabs multi-tab playback
// leaves the sounding tab without focus, and a wake clamped to ~1/s would drain the committed
// horizon to nothing between wakes, stalling both the audio and the cursor every second.
const defaultTimer: TransportTimer = {
  setTimeout: workerTimers.setTimeout,
  clearTimeout: workerTimers.clearTimeout,
};

/**
 * How far ahead of the audio clock column audio is committed, in seconds.
 *
 * Fixed, not a setting: resync-on-mutation (see resync()) means in-window audio is never stale,
 * so the window's size is inaudible to the user and there is nothing left for the deleted
 * lookaheadTime setting to trade off. 1 s matches Metronome's LOOKAHEAD_MAX_S: wide enough that
 * a main-thread stall shorter than a second cannot let audio run dry, narrow enough that a
 * stop() cancels at most a second of committed sound.
 */
export const TRANSPORT_HORIZON_S = 1;

/**
 * How far in the future an anchored column begins sounding, in seconds. Same rationale as
 * Metronome's START_MARGIN_S: small enough that playback still feels like it started on the
 * press, large enough that the first column is committed in the FUTURE - audio committed at
 * exactly currentTime is at the mercy of whatever the main thread does next, which is the
 * defect this transport exists to remove.
 */
export const TRANSPORT_START_MARGIN_S = 0.05;

/**
 * The floor on how many columns past the sounding cursor stay committed, regardless of the
 * horizon. Gated on the horizon alone, a 1000 ms column at 60 bpm reaches its boundary exactly
 * as the window edge does and would be committed with zero margin - Metronome documents the
 * same starvation in its lookahead header ("below 60 the next beat can lie beyond the horizon
 * entirely"; it can afford to, a beat is droppable, a column of the song is not). The floor
 * guarantees every column is committed at least one full column before it sounds, at any tempo
 * the settings admit.
 */
export const TRANSPORT_MIN_COMMIT_AHEAD = 2;

/**
 * Substitute for a degenerate column duration, in seconds - see durS() for why the guard must
 * exist at all.
 */
const DURATION_FLOOR_S = 0.001;

/**
 * Everything the transport knows about the outside. It owns TIME only: what a column contains,
 * which instruments sound it, and cancelling committed-but-unstarted audio on stop/resync all
 * stay with the composer.
 */
export interface TransportCallbacks {
  /**
   * Real duration of column `index` in ms, honoring tempo changers, already Song.roundTime'd
   * by the caller - the transport sums what it is given and must agree with the song's own
   * arithmetic, so the rounding policy lives in exactly one place and it is not here.
   */
  columnDurationMs(index: number): number;
  columnCount(): number;
  /**
   * Hand column `index`'s notes to the instruments, committed to start at the absolute audio
   * time `atAudioTime`. Each index is called at most once per build of the committed window
   * (anchor/resync rebuild it), never twice within one.
   */
  commitColumn(index: number, atAudioTime: number): void;
  /**
   * The sounding cursor ENTERED column `index` - its audio is starting now. Fired for every
   * column the cursor passes, including every column a stall skipped over, in order; NOT fired
   * for the anchor column, which the caller selected itself before asking to play from it.
   */
  onSounding(index: number): void;
  /**
   * The LAST column finished sounding - the audio-true end of the song, about a horizon after
   * the final commitColumn went out. The transport is stopped by the time this fires.
   */
  onFinished(): void;
}

/**
 * The composer's playback transport: one clock, two meanings of "ahead" (ADR-0006).
 *
 * Metronome.ts's architectural sibling - the same lookahead-scheduler pattern, applied to a
 * song's columns instead of a uniform beat grid. Two positions advance over the columns:
 *
 * - The SOUNDING cursor: the column the listener is hearing right now. It advances exactly at
 *   each column's audio-clock boundary and is the only position the outside ever sees
 *   (`soundingColumn`, onSounding).
 * - The COMMIT watermark: how far ahead column audio has been handed to the audio clock. It
 *   runs up to TRANSPORT_HORIZON_S ahead of the clock and never fewer than
 *   TRANSPORT_MIN_COMMIT_AHEAD columns past the cursor, and it is purely internal - nothing
 *   outside the transport may observe it. Keeping it unobservable is what deletes the old
 *   compensation regime, where every consumer corrected for a model that ran one lookahead
 *   ahead of the ear.
 *
 * One loop (onWake) drives both, and each sleep is derived from the committed grid on the audio
 * clock, so cursor/audio drift is unrepresentable rather than corrected. Where Metronome's
 * ideal beat times are a multiply from an anchor, columns are heterogeneous (tempo changers),
 * so this grid is an anchored RUNNING SUM: anchor()/resync() fix a start time and every later
 * time is previous + duration. The property both grids share, and the one that matters, is that
 * a committed time is never re-derived from "now" - nothing is ever measured, so no timing
 * error can accumulate and top-up seams cannot jitter.
 *
 * DELIBERATELY NO delayOffset, for the reason Metronome.ts's class docstring warns about
 * ("DELIBERATELY NOT the delayOffset idiom..."): measuring wall-clock overshoot and shortening
 * the next wait corrects when we WAKE while still timing the work from the main thread. Here a
 * late wake self-corrects for free - the next sleep is computed from the absolute boundary, not
 * from an accumulated interval - and the audio was committed ahead of time anyway. Do not
 * "harmonise" this loop with the wall-clock idiom PlayerKeyboard.svelte still uses.
 *
 * The transport never touches audio. commitColumn hands notes out; retracting
 * committed-but-unstarted events on stop/resync is the composer's job, through the
 * instruments' cancellation registries.
 */
export class ComposerTransport {
  private readonly clock: TransportClock;
  private readonly callbacks: TransportCallbacks;
  private readonly timer: TransportTimer;

  private running = false;
  /** The sounding column. Meaningful only from the first anchor() on. */
  private cursor = 0;
  /** Absolute audio time the cursor's column began sounding. */
  private columnStartTime = 0;
  /** Absolute audio time the cursor's column ends: always columnStartTime + durS(cursor). */
  private nextBoundaryTime = 0;
  /** Last committed column - the idempotency watermark topUp() advances and resync() rewinds. */
  private committedThrough = -1;
  /** Absolute audio time column committedThrough + 1 starts - the running sum's growing edge. */
  private commitTime = 0;
  private pendingWake: number | null = null;

  constructor(
    clock: TransportClock,
    callbacks: TransportCallbacks,
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

  /** The column the listener is hearing right now (the Sounding Column of CONTEXT.md). */
  get soundingColumn(): number {
    return this.cursor;
  }

  /**
   * Start playback, or jump while already running - deliberately the same operation: column
   * `column` begins sounding at clock.now() + marginS and the committed window is rebuilt from
   * there. The pending wake is cleared up front so a jump cannot leave the old grid's timer
   * alive to fire beside the new one.
   *
   * Does NOT fire onSounding for the anchor column: the caller chose it and selected it before
   * asking to play from it, so echoing it back would only invite re-entrancy for a fact the
   * caller already acted on. onSounding means the CURSOR moved somewhere the caller didn't put it.
   *
   * An empty song, or a column outside [0, columnCount), leaves the transport STOPPED and fires
   * nothing - not onFinished. Nothing sounded, so the audio-true end of the song never
   * happened, and reporting one would run the caller's end-of-song routine synchronously from
   * inside anchor(), a re-entrancy no other path has: every real callback fires from a wake.
   */
  anchor(column: number, marginS: number = TRANSPORT_START_MARGIN_S): void {
    this.clearPendingWake();
    if (column < 0 || column > this.callbacks.columnCount() - 1) {
      this.running = false;
      return;
    }
    this.running = true;
    this.cursor = column;
    this.columnStartTime = this.clock.now() + marginS;
    this.nextBoundaryTime = this.columnStartTime + this.durS(column);
    // The watermark sits one BEFORE the anchor, so the first topUp() commits the anchor column
    // at columnStartTime through the same path as every other column - no special first-commit
    // seam whose times could disagree with the grid.
    this.committedThrough = column - 1;
    this.commitTime = this.columnStartTime;
    this.topUp();
    this.armSleep();
  }

  /**
   * The song changed under a running transport - note add/remove/span, bpm, tempo changer,
   * mute, instrument swap. The COMPOSER has already cancelled the instruments'
   * committed-but-unstarted events (the transport never touches audio), so the window past the
   * sounding column is gone and is rebuilt here from fresh durations: the sounding column's own
   * boundary is recomputed off its unchanged start (its duration may be what changed), the
   * watermark rewinds to the cursor, and topUp() recommits everything after it. Recommit-on-
   * mutation is what makes the horizon free - in-window audio is never stale, so a 1 s window
   * is indistinguishable from a 0 ms one from the user's point of view.
   *
   * The sounding column itself is NOT recommitted: its audio already started, and started audio
   * always rings out.
   *
   * A recomputed boundary already in the past (the column shrank under the cursor) is fine: the
   * re-armed sleep clamps to 0 and that wake's catch-up loop advances through whatever is now
   * due. No-op when not running - there is no window to rebuild.
   */
  resync(): void {
    if (!this.running) return;
    this.nextBoundaryTime = this.columnStartTime + this.durS(this.cursor);
    this.committedThrough = this.cursor;
    this.commitTime = this.nextBoundaryTime;
    this.topUp();
    this.armSleep();
  }

  /**
   * Stops advancing and touches no audio. Cancelling the ~1 s of committed sound is the
   * composer's job, and it is not optional bookkeeping: an uncancelled pause leaks the whole
   * window as runaway notes (ADR-0006).
   */
  stop(): void {
    this.running = false;
    this.clearPendingWake();
  }

  /**
   * The single loop: advance the sounding cursor across every boundary the audio clock has
   * passed, then top the committed window back up and re-arm. One loop rather than a cursor
   * process beside a scheduler process, so the two positions cannot drift apart - both are read
   * off the same grid within the same wake.
   *
   * A wake arriving BEFORE nextBoundaryTime advances nothing and simply re-arms: the while
   * condition is itself the staleness guard. A sleep armed before a resync()/anchor() re-aimed
   * the grid is normally clearTimeout'd, but one whose handler is already in flight lands here
   * anyway - it finds no boundary due under the NEW grid and re-arms onto it, harmlessly.
   *
   * After a stall (throttled tab, suspended context) the loop walks every missed boundary in
   * order, so each skipped column still gets its onSounding and consumers see a contiguous
   * cursor history. The opposite of Metronome's catch-up, which DROPS slept-through beats: a
   * missed click is gone, but the cursor is position, not sound, and it must land where the
   * audio actually is.
   */
  private onWake(): void {
    if (!this.running) return;
    while (this.running && this.clock.now() >= this.nextBoundaryTime) {
      this.cursor += 1;
      if (this.cursor > this.callbacks.columnCount() - 1) {
        // The last column's audio has fully elapsed - the audio-true end of the song, about a
        // horizon AFTER the final commit went out. Ending when commits run out would announce
        // the end a second before the listener hears it.
        this.running = false;
        this.callbacks.onFinished();
        return;
      }
      this.columnStartTime = this.nextBoundaryTime;
      this.nextBoundaryTime += this.durS(this.cursor);
      // Audio before UI: after a stall's catch-up the near-future commits are urgent - the
      // window may have drained to nothing - and onSounding runs arbitrary consumer work.
      this.topUp();
      this.callbacks.onSounding(this.cursor);
    }
    // Re-checked because onSounding may have called stop(): committing or re-arming after the
    // caller said stop would hand out audio the composer has no reason to expect.
    if (!this.running) return;
    this.topUp();
    this.armSleep();
  }

  /**
   * Advances the commit watermark until the window satisfies BOTH bounds: commitTime at least
   * a horizon out (fast tempos - many small columns fill the second), and at least
   * TRANSPORT_MIN_COMMIT_AHEAD columns past the cursor (slow tempos - see that constant for
   * the zero-margin starvation the floor exists to prevent).
   *
   * Commit times are the anchored running sum `commitTime += durS(next)`, never re-derived from
   * the clock, and the watermark makes each commit happen exactly once per build of the window
   * however many wakes look at it.
   */
  private topUp(): void {
    while (
      this.committedThrough + 1 <= this.callbacks.columnCount() - 1 &&
      (this.commitTime < this.clock.now() + TRANSPORT_HORIZON_S ||
        this.committedThrough < this.cursor + TRANSPORT_MIN_COMMIT_AHEAD)
    ) {
      const next = this.committedThrough + 1;
      this.callbacks.commitColumn(next, this.commitTime);
      this.commitTime += this.durS(next);
      this.committedThrough = next;
    }
  }

  /**
   * One sleep, aimed at the absolute next boundary: `(nextBoundaryTime - now) * 1000`, clamped
   * at 0 so a boundary already in the past wakes immediately. Sleeps are DERIVED from the
   * committed grid on the audio clock - a late wake self-corrects because the next sleep is
   * computed from the absolute boundary, not from an accumulated interval, which is why there
   * is no delayOffset here (see the class docstring and Metronome.ts's warning). The timer
   * decides only WHEN TO LOOK; the audio was committed ahead of it and cannot be moved by a
   * late wake.
   */
  private armSleep(): void {
    this.clearPendingWake();
    const ms = Math.max(0, (this.nextBoundaryTime - this.clock.now()) * 1000);
    this.pendingWake = this.timer.setTimeout(() => this.onWake(), ms);
  }

  private clearPendingWake(): void {
    if (this.pendingWake !== null) {
      this.timer.clearTimeout(this.pendingWake);
      this.pendingWake = null;
    }
  }

  /**
   * Column duration in seconds, floored to a small positive value when degenerate. The
   * durations come from a callback, and a clock must not wedge on a bad answer: a NaN or
   * infinite duration would poison every later time through the running sums - and no
   * comparison against NaN is ever true, so the wake loop would simply stop advancing forever -
   * while a zero or negative one would freeze nextBoundaryTime in place and let one wake's
   * catch-up loop churn the rest of the song out in a single burst.
   */
  private durS(index: number): number {
    const s = this.callbacks.columnDurationMs(index) / 1000;
    return Number.isFinite(s) && s > 0 ? s : DURATION_FLOOR_S;
  }
}
