import { base } from '$app/paths';
import { fetchAudioBuffer } from './Instrument.svelte';
import * as workerTimers from 'worker-timers';

/**
 * The wake timer the scheduler polls on, injectable so a test can drive it from a manual clock.
 * worker-timers runs its timer inside a real Worker, which jsdom does not provide - calling it
 * there throws `ReferenceError: Worker is not defined`, so a test cannot use the default.
 */
export interface MetronomeTimer {
  setInterval(handler: () => void, timeout: number): number;
  clearInterval(id: number): void;
}

// worker-timers rather than window.setInterval, for the same reason Utilities.ts's delay() uses
// it (see the comment there): its timer lives in a Worker and so keeps firing at full rate in a
// backgrounded or throttled tab. The scheduler below survives a late wake by design, but a tab
// clamped to ~1/s would repeatedly leave it with nothing queued between wakes.
const defaultTimer: MetronomeTimer = {
  setInterval: workerTimers.setInterval,
  clearInterval: workerTimers.clearInterval,
};

/**
 * How far ahead of the audio clock beats are committed, in seconds.
 *
 * INTERPRETATION of the request for "1/2 notes ahead": the horizon is two beats, CLAMPED to
 * [0.1 s, 1 s]. The clamps exist because the bpm setting admits the whole range [0, 10000]
 * (BaseSettings.ts) - unclamped, 1 BPM would commit two minutes of clicks that stop() would then
 * have to cancel, and 10000 BPM would ask for a 1.5 ms timer.
 *
 * So "one to two beats queued" is what the clamps deliver only between roughly 120 and 1200 bpm.
 * Below 120 the 1 s cap binds and fewer are queued - below 60 the next beat can lie beyond the
 * horizon entirely, so there are stretches with none queued at all - and above 1200 the 0.1 s
 * floor commits more than two. Stated because 40 bpm is an ordinary practice tempo, not an
 * exotic input.
 *
 * The property that holds across the whole range, and the only one accuracy needs, is that a beat
 * is committed at least LOOKAHEAD_MIN_S before it sounds - which is why the floor exists and why
 * WAKE_MAX_MS is bounded by it below.
 */
const LOOKAHEAD_MIN_S = 0.1;
const LOOKAHEAD_MAX_S = 1;

/**
 * How often the scheduler wakes to look, in ms: a quarter of a beat, clamped.
 *
 * This timer has NO timing role. It only decides how often we ask "is anything due?" - the beats
 * themselves are placed on the AudioContext clock, so a wake may be late by up to
 * (lookahead - wake interval) without any beat being affected. WAKE_MAX_MS is at most
 * LOOKAHEAD_MIN_S * 1000, so the window a wake covers is never shorter than the gap between two
 * wakes.
 */
const WAKE_MIN_MS = 25;
const WAKE_MAX_MS = 100;

/**
 * How far in the future the first beat of a run is placed, in seconds. Small enough that the
 * click still feels like it happened on the button press, large enough that it is scheduled in
 * the FUTURE rather than at "now" - a beat placed at exactly currentTime is at the mercy of
 * whatever the main thread does next, which is the whole defect this scheduler removes.
 */
export const METRONOME_START_MARGIN_MS = 50;
const START_MARGIN_S = METRONOME_START_MARGIN_MS / 1000;

/**
 * How long after its start time a beat is kept in the cancellation queue, in seconds. Only a
 * beat that has not started yet can be cancelled, so dropping an older one costs nothing; the
 * 'ended' listener normally removes an entry, and this bound keeps the queue finite over a long
 * session even if an 'ended' event never arrives.
 */
const BEAT_RETENTION_S = 1;

type ScheduledBeat = {
  source: AudioBufferSourceNode;
  /** The absolute AudioContext time this beat was committed to sound at. */
  at: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lookaheadSeconds(period: number) {
  return clamp(2 * period, LOOKAHEAD_MIN_S, LOOKAHEAD_MAX_S);
}

function wakeIntervalMs(period: number) {
  // A bpm of 0 gives an infinite period, which clamps to WAKE_MAX_MS; a NaN period survives
  // clamp as NaN, which the `||` turns into WAKE_MAX_MS. Either way the scheduler keeps waking
  // at a sane rate and simply queues nothing until a usable bpm arrives.
  return clamp((period * 1000) / 4, WAKE_MIN_MS, WAKE_MAX_MS) || WAKE_MAX_MS;
}

/**
 * A lookahead metronome scheduler.
 *
 * The wake timer decides only WHEN TO LOOK; every beat is placed on the AudioContext clock with
 * an absolute `source.start(when)`, so the Web Audio thread does the timing and main-thread
 * jitter (a Pixi draw, a Svelte flush, a GC pause) cannot move a click. Beat times come from a
 * generated grid, `anchorTime + (beatIndex - anchorBeat) * period` - a multiply from an anchor
 * rather than a running sum - so nothing is ever measured and no error can accumulate over a
 * long session. "Error tracking" is therefore an observable (`lastMargin`, `minMargin`,
 * `missedBeats`) rather than a correction term: a margin of <= 0 means the audio clock had
 * already passed the beat, which is the only genuine failure this design admits.
 *
 * DELIBERATELY NOT the `delayOffset` idiom the player's song loop ran on until ADR-0009 moved it
 * onto this pattern too. That measures wall-clock overshoot and shortens the next wait by it,
 * which corrects when we WAKE but still fires the sound from the main thread whenever it gets
 * around to it. Porting it here would preserve the audible per-click jitter being fixed. Do not
 * reintroduce it.
 */
export class Metronome {
  emptyBuffer: AudioBuffer | null = null;
  bpm: number;
  beats: number = 4;
  volume: number = 50;
  indicatorBuffer: AudioBuffer | null = null;
  crochetBuffer: AudioBuffer | null = null;
  volumeNode: GainNode | null = null;
  audioContext: AudioContext | null = null;

  /** Seconds between the last beat's scheduled time and the audio clock when it was committed. */
  lastMargin: number = 0;
  /** The smallest margin seen since the current run started. <= 0 means a beat was late. */
  minMargin: number = Infinity;
  /** Beats the scheduler slept through and dropped rather than firing retroactively. */
  missedBeats: number = 0;

  private timer: MetronomeTimer;
  private timerId: number | null = null;
  private scheduled: ScheduledBeat[] = [];
  private beatIndex: number = 0;
  private anchorBeat: number = 0;
  private anchorTime: number = 0;
  private accentAnchorBeat: number = 0;
  private accentBeats: number = 0;
  private period: number = 0;
  private wakeMs: number = WAKE_MAX_MS;

  constructor(bpm?: number, timer: MetronomeTimer = defaultTimer) {
    this.bpm = bpm ?? 220;
    this.timer = timer;
  }

  /** True while the wake timer is installed, i.e. between a start() and the matching stop(). */
  get running(): boolean {
    return this.timerId !== null;
  }

  init(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.volumeNode = audioContext.createGain();
    this.loadBuffers();
    // Straight to destination, not through AudioProvider's node registry - so the metronome gets
    // no reverb, and AudioProvider.startRecording() (which wires only registered nodes and the
    // reverb bus into the recorder) does not capture it. Preserved deliberately.
    this.volumeNode.connect(this.audioContext.destination);
    this.changeVolume(this.volume);
  }

  destroy() {
    this.stop();
    // Drop the queue too, not just cancel it: stop() deliberately keeps entries that are already
    // sounding, and after a destroy those reference a context the caller is about to close. A
    // later cancelPendingBeats would compare their old-clock times against a fresh context's
    // currentTime, decide they are still ahead, and call stop() on a dead node.
    this.scheduled = [];
    this.volumeNode?.disconnect();
    // Terminal, and the reference has to go with the disconnect: start() only ever bailed on a
    // missing audioContext, so after a destroy it would install a wake timer, report `running`,
    // and connect every beat to a gain node with no route to the destination - a metronome whose
    // button reads ON and that is silent forever. init() recreates the node.
    this.volumeNode = null;
  }

  changeVolume(volume: number) {
    this.volume = volume;
    if (!this.volumeNode) return;
    // Every scheduled beat is connected to this one shared gain node, so a volume change reaches
    // beats that are already committed to the audio clock. That is a reason to keep the single
    // shared gain rather than moving to a gain per beat. Volume is not a transport control: it
    // must never cancel the queue, not even at 0.
    this.volumeNode.gain.value = volume / 100;
  }

  async loadBuffers() {
    if (!this.audioContext) return;
    this.emptyBuffer = this.audioContext.createBuffer(
      2,
      this.audioContext.sampleRate,
      this.audioContext.sampleRate
    );
    const promises = [
      fetchAudioBuffer(`${base}/assets/audio/MetronomeSFX/bar.mp3`, this.audioContext).catch(
        () => this.emptyBuffer
      ),
      fetchAudioBuffer(`${base}/assets/audio/MetronomeSFX/quarter.mp3`, this.audioContext).catch(
        () => this.emptyBuffer
      ),
    ];
    const result = await Promise.all(promises);
    this.indicatorBuffer = result[0];
    this.crochetBuffer = result[1];
  }

  start(firstBeatDelayMs = METRONOME_START_MARGIN_MS) {
    // Idempotent on the TIMER HANDLE, not on a boolean. The previous implementation guarded a
    // `while (running)` loop on a flag that stop() cleared while an awaited delay was still
    // pending: a stop() immediately followed by a start() left the parked loop to resume beside
    // the new one, giving two independent tick trains from one double-click of the toggle.
    if (this.timerId !== null) return;
    const ctx = this.audioContext;
    // Both, not just the context: destroy() leaves the context in place and drops the gain node,
    // and starting onto a disconnected output is the silent-but-running state described there.
    // Refusing keeps `running` honest, which is what toggleMetronome reads its button back from.
    if (!ctx || !this.volumeNode) return;
    this.period = this.beatPeriod();
    this.beatIndex = 0;
    this.anchorBeat = 0;
    // Beat zero must remain in the future: scheduleDueBeats deliberately drops times at/before
    // `now` as missed beats. Non-finite input would poison the anchor and silence the run, so the
    // optional transport lead-in may only extend (never erase) the scheduler's safe margin.
    const safeFirstBeatDelayMs = Number.isFinite(firstBeatDelayMs)
      ? Math.max(METRONOME_START_MARGIN_MS, firstBeatDelayMs)
      : METRONOME_START_MARGIN_MS;
    this.anchorTime = ctx.currentTime + safeFirstBeatDelayMs / 1000;
    this.accentAnchorBeat = 0;
    this.accentBeats = this.beats;
    this.lastMargin = 0;
    this.minMargin = Infinity;
    this.missedBeats = 0;
    this.wakeMs = wakeIntervalMs(this.period);
    this.scheduleDueBeats();
    this.timerId = this.timer.setInterval(() => this.scheduleDueBeats(), this.wakeMs);
  }

  stop() {
    if (this.timerId !== null) {
      this.timer.clearInterval(this.timerId);
      this.timerId = null;
    }
    // Without this the metronome would keep clicking for a whole lookahead after the user turned
    // it off, because those beats are already committed to the audio clock.
    this.cancelPendingBeats();
  }

  /**
   * Start a fresh beat grid even when the metronome is already running.
   *
   * `start()` is deliberately idempotent, while changing bpm preserves the next committed beat
   * and the current bar phase. Transport boundaries (record/play/restart) need the opposite: cancel
   * the old lookahead queue and make the next click beat zero of a newly anchored run. A caller may
   * provide a longer first-beat delay when another transport has a known preparation window.
   */
  restart(firstBeatDelayMs = METRONOME_START_MARGIN_MS) {
    this.stop();
    this.start(firstBeatDelayMs);
  }

  toggle() {
    if (this.running) {
      this.stop();
    } else {
      this.start();
    }
  }

  /** Seconds per beat, or a non-finite value when bpm is 0 - see scheduleDueBeats's guard. */
  private beatPeriod(): number {
    return 60 / this.bpm;
  }

  /** The ideal time of a beat: a multiply from the anchor, never a running sum. */
  private beatTime(beatIndex: number): number {
    return this.anchorTime + (beatIndex - this.anchorBeat) * this.period;
  }

  private isAccent(beatIndex: number): boolean {
    // `accentBeats` and NOT the live `beats`, even though syncAccent keeps them equal by the time
    // scheduleDueBeats calls this. They are one pair with `accentAnchorBeat` - the meter the bar
    // is currently being counted in - and reading them together is what lets syncAccent ask
    // whether a beat was a downbeat UNDER THE METER IT WAS SCHEDULED WITH, before it installs the
    // new one. `beats` is a [0, 16] number setting, so 0 is reachable from the UI; the old code
    // did `currentTick % 0`, which is NaN, so the accent silently never fired.
    if (!(this.accentBeats > 0)) return false;
    // Normalised because syncPeriod's `beatIndex -= cancelled` can rewind the index below an
    // accent anchor taken before it, and a phase reads better as a non-negative number. It is not
    // a behaviour fix: for the `=== 0` question below the bare `%` decides identically, since JS
    // gives `-4 % 4` the value -0 and `-0 === 0`.
    const phase = (beatIndex - this.accentAnchorBeat) % this.accentBeats;
    return (phase + this.accentBeats) % this.accentBeats === 0;
  }

  /**
   * Silences every beat that has not started sounding yet, and returns how many there were.
   *
   * A beat whose start time is still in the future is silenced by `stop()` with no argument -
   * that means "stop at currentTime", and a stop time earlier than the start time means the
   * source never sounds at all. A beat that is ALREADY sounding is deliberately left alone:
   * cutting a sample mid-waveform clicks, and stopping "the scheduled notes" is about the queue,
   * not about the click the user can already hear.
   */
  private cancelPendingBeats(): number {
    const ctx = this.audioContext;
    if (!ctx) return 0;
    const now = ctx.currentTime;
    const keep: ScheduledBeat[] = [];
    let cancelled = 0;
    for (const beat of this.scheduled) {
      if (beat.at > now) {
        // Safe because entries are pushed only after start() has been called on them - stop()
        // on a source that was never started throws InvalidStateError.
        beat.source.stop();
        beat.source.disconnect();
        cancelled++;
      } else {
        keep.push(beat);
      }
    }
    this.scheduled = keep;
    return cancelled;
  }

  /**
   * Picks up a bpm written straight onto the field (Player.svelte and zen-keyboard both assign
   * `metronome.bpm = ...`) and re-anchors the grid onto the new period.
   *
   * CHOICE: beats already committed are cancelled and re-scheduled rather than left to play out.
   * Lookahead buys accuracy by committing beats early, and the price is that a tempo change would
   * otherwise go unheard for up to a lookahead; cancelling buys that back. `beatIndex` is rewound
   * by the number cancelled - those are the tail of the queue - so the bar phase keeps counting
   * the beats that actually sound. The new grid is anchored ON the earliest of those cancelled
   * beats, which is therefore re-committed unmoved; the new spacing starts after it.
   */
  private syncPeriod(now: number) {
    const period = this.beatPeriod();
    if (period === this.period) return;
    // Read BEFORE the cancel, and it is the EARLIEST beat still ahead of the audio clock. Taken
    // after the cancel, `scheduled` holds only beats already in the past, and an anchor derived
    // from those is really an anchor on `now`: a run of changes (the bpm spinner fires one per
    // click of its +/- button) then re-based the grid on every change, so the clicks came at the
    // rate the button was pressed, and above ~300 bpm - where a wake interval is shorter than
    // START_MARGIN_S - each change cancelled the beat the previous one had injected and the
    // metronome went silent for as long as the changes kept coming.
    const nextCommitted = this.scheduled.reduce<number | null>(
      (earliest, beat) =>
        beat.at > now && (earliest === null || beat.at < earliest) ? beat.at : earliest,
      null
    );
    const cancelled = this.cancelPendingBeats();
    this.beatIndex -= cancelled;
    this.period = period;
    this.anchorBeat = this.beatIndex;
    // The beat that was about to sound keeps its time - it is re-committed at exactly the same
    // place and the new spacing starts after it. That makes the anchor a FIXED POINT under
    // repeated changes: a second change re-derives the same beat, so no change can push the next
    // click further out, and a tempo change can never move the click that is about to happen.
    this.anchorTime = nextCommitted ?? now + START_MARGIN_S;
    const wakeMs = wakeIntervalMs(period);
    if (wakeMs !== this.wakeMs && this.timerId !== null) {
      // Re-arming from inside the interval's own callback is fine - the handle is cleared first.
      this.timer.clearInterval(this.timerId);
      this.timerId = this.timer.setInterval(() => this.scheduleDueBeats(), wakeMs);
    }
    this.wakeMs = wakeMs;
  }

  /**
   * Picks up a `beats` written straight onto the field. Changing the meter restarts the bar from
   * the first beat not yet committed: the accent is chosen at SCHEDULE time, up to a lookahead
   * before it sounds, so beats already queued keep the accent they were given.
   *
   * EXCEPT when the last beat already committed was itself a downbeat under the old meter. Then
   * starting the new bar on the very next beat sounds two accents back to back - at 240 bpm the
   * pair is a quarter of a second apart - so the new bar is counted FROM that downbeat instead.
   * Whether it happens at all depends on where in the lookahead the change lands, which is what
   * made it intermittent.
   */
  private syncAccent() {
    if (this.beats === this.accentBeats) return;
    // Asked under the OLD meter, so before `accentBeats` is updated.
    const previousWasAccent = this.beatIndex > 0 && this.isAccent(this.beatIndex - 1);
    this.accentBeats = this.beats;
    this.accentAnchorBeat = previousWasAccent ? this.beatIndex - 1 : this.beatIndex;
  }

  private scheduleDueBeats() {
    const ctx = this.audioContext;
    if (!ctx) return;
    // One snapshot of the audio clock for the whole wake, so every decision below agrees.
    const now = ctx.currentTime;
    this.scheduled = this.scheduled.filter((beat) => beat.at > now - BEAT_RETENTION_S);
    this.syncPeriod(now);
    this.syncAccent();
    const period = this.period;
    // A bpm of 0 is reachable from the UI (threshold [0, 10000], and an emptied input reads as
    // 0), which made the old loop await `60000 / 0` = Infinity. Queue nothing until it is usable.
    if (!Number.isFinite(period) || period <= 0) return;
    let nextBeatTime = this.beatTime(this.beatIndex);
    // CATCH-UP. If the wake was late enough that beats are already due, DROP them instead of
    // scheduling them: Web Audio plays a start time in the past immediately, so committing the
    // backlog would fire it all in one burst. Advancing beatIndex by the true count keeps the bar
    // phase correct, so the next accent still lands where the grid says it should. Math.max(1,
    // ...) guarantees progress when a beat falls exactly on `now`, which would otherwise be
    // scheduled at "immediately" - the very thing this scheduler exists to avoid.
    if (nextBeatTime <= now) {
      const missed = Math.max(1, Math.ceil((now - nextBeatTime) / period));
      this.beatIndex += missed;
      this.missedBeats += missed;
      nextBeatTime = this.beatTime(this.beatIndex);
    }
    const horizon = now + lookaheadSeconds(period);
    while (nextBeatTime <= horizon) {
      this.scheduleBeat(ctx, now, nextBeatTime, this.isAccent(this.beatIndex));
      this.beatIndex++;
      nextBeatTime = this.beatTime(this.beatIndex);
    }
  }

  private scheduleBeat(ctx: AudioContext, now: number, when: number, accent: boolean) {
    this.lastMargin = when - now;
    this.minMargin = Math.min(this.minMargin, this.lastMargin);
    // NOTE: the field names and the file names disagree here - loadBuffers() puts bar.mp3 in
    // indicatorBuffer and quarter.mp3 in crochetBuffer, so the file called "quarter" is what
    // sounds on the downbeat. Inherited, and preserved exactly: which of the two is wrong is a
    // sound decision, not a timing one.
    const buffer = accent ? this.crochetBuffer : this.indicatorBuffer;
    // The buffers load asynchronously, so an early beat may have no sound. Only the SOUND is
    // skipped: the caller advances beatIndex whether this returns here or not, so the bar phase
    // does not depend on when the fetch landed. The old tick() returned ahead of its own
    // `currentTick++`, which left the downbeat falling wherever the network happened to put it.
    if (!buffer || !this.volumeNode) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.volumeNode);
    // The absolute AudioContext time, not 0. `start(when)` is sample-accurate, so the only thing
    // asked of the wake timer is that it be EARLY, never that it be on time.
    source.start(when);
    const entry: ScheduledBeat = { source, at: when };
    this.scheduled.push(entry);
    const handleEnd = () => {
      const index = this.scheduled.indexOf(entry);
      if (index !== -1) this.scheduled.splice(index, 1);
      source.disconnect();
    };
    source.addEventListener('ended', handleEnd, { once: true });
  }
}

export const metronome = new Metronome();
