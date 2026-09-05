import { base } from '$app/paths';
import AudioRecorder from '$lib/audio/AudioRecorder';
import { Instrument } from '$lib/audio/Instrument.svelte';

export type AppAudioNode = {
  node: AudioNode;
  to: AudioDestination | null;
};
type AudioDestination = 'reverb' | 'end';

/**
 * WebKit's non-standard fourth AudioContextState.
 *
 * `interrupted` means the USER AGENT paused the context for something outside the page's
 * control - the app was backgrounded, the screen locked, a call came in, another app took the
 * audio session. Only Safari has it, which is the entire reason the "audio dies after
 * minimising and never comes back" bug is iOS-only.
 *
 * It is NOT a slower `suspended`, and the difference is the whole point:
 *  - `suspended` is ours to undo. `resume()` fixes it.
 *  - `interrupted` is the UA's to undo. `resume()` REJECTS while an interruption is active,
 *    and calling it from `suspended` during one rejects AND drops the context into
 *    `interrupted`. So the naive `if (state !== 'running') resume()` does not merely fail to
 *    help - it can be what pushes a recoverable context into the stuck state.
 *
 * Leaving `interrupted` is the UA's decision, so the only correct move is to WAIT for it.
 */
type WebkitAudioContextState = AudioContextState | 'interrupted';

/**
 * How long a `resume()`/`suspend()` call is given before we stop waiting on it.
 *
 * WebKit 281566: `AudioContext.resume()` can never settle at all - neither resolve nor reject -
 * when the page was suspended in the background. Both `ensureRunning` call sites `await` it
 * before setting up a run, so an un-timeboxed call leaves the composer with `playbackStarting`
 * true forever and every later play request short-circuited by its own generation guard. A
 * timeout is not a denial: what it means is "stop believing this promise", after which the
 * clock probe below gives the honest answer.
 */
const CALL_TIMEOUT_MS = 3_000;

/**
 * How long WebKit is given to lift an interruption on its own before we force the issue.
 *
 * The normal path is that it lifts within a frame or two of the page becoming visible, so this
 * is a ceiling on the pathological case (web-audio-api#2585: stuck in `interrupted` with the
 * page in the foreground), not a latency anyone pays.
 */
const INTERRUPTION_WAIT_MS = 1_500;

/** How often the interruption wait re-reads `context.state`, in ms. */
const STATE_POLL_MS = 50;

/**
 * How long the audio clock is watched to decide whether it is actually advancing, in ms.
 *
 * Long enough that a healthy context moves by many render quanta, short enough to sit in front
 * of a play request. A frozen clock is frozen EXACTLY, so the comparison needs no epsilon.
 */
const CLOCK_PROBE_MS = 180;

export type AudioRecoveryTimings = {
  callTimeoutMs: number;
  interruptionWaitMs: number;
  statePollMs: number;
  clockProbeMs: number;
};

const DEFAULT_TIMINGS: AudioRecoveryTimings = {
  callTimeoutMs: CALL_TIMEOUT_MS,
  interruptionWaitMs: INTERRUPTION_WAIT_MS,
  statePollMs: STATE_POLL_MS,
  clockProbeMs: CLOCK_PROBE_MS,
};

/**
 * Shortest gap between two context rebuilds, in ms.
 *
 * A rebuild re-decodes every sample in the app, so it is a last resort and must never become a
 * loop: if a replacement context is born broken too, the fault is environmental (no output
 * device, an audio session the page cannot get) and building a third one will not help.
 */
const REBUILD_COOLDOWN_MS = 30_000;

/** Gestures that re-arm a recovery attempt - see AudioProviderClass.armGestureRecovery. */
const GESTURE_EVENTS = ['pointerdown', 'touchend', 'keydown'] as const;

/** Distinguishes "the promise never settled" from "the browser said no". */
export class AudioContextTimeoutError extends Error {
  constructor(call: string) {
    super(`AudioContext.${call}() did not settle in time`);
    this.name = 'AudioContextTimeoutError';
  }
}

function sleep(ms: number): Promise<void> {
  // Plain setTimeout, deliberately, and not Utilities' worker-timers `delay`: every wait in
  // this file happens while the page is in the FOREGROUND (that is when recovery runs), so
  // background throttling has nothing to bite on, and a Worker-backed timer is unavailable in
  // the jsdom suite that covers this ladder.
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, call: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AudioContextTimeoutError(call)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** `context.state` widened to admit WebKit's `interrupted`, which the DOM types omit. */
function stateOf(context: AudioContext): WebkitAudioContextState {
  return context.state as WebkitAudioContextState;
}

export class AudioProviderClass {
  audioContext: AudioContext | null = null;
  reverbNode: ConvolverNode | null = null;
  reverbVolumeNode: GainNode | null = null;
  defaultDestination: AudioDestination = 'end';
  nodes: AppAudioNode[] = [];
  recorder: AudioRecorder | null = null;
  isRecording: boolean = false;
  reverbLoading: Promise<void> | null = null;

  /** Last state seen on the shared context. Observational - `interrupted` never appears otherwise. */
  contextState: WebkitAudioContextState | 'uninitialized' = 'uninitialized';

  private timings: AudioRecoveryTimings;
  /**
   * True while nothing has yet CONFIRMED that the audio clock is moving.
   *
   * Set by anything that could have left the renderer silently broken (an interruption in
   * either direction, a return to the foreground) and cleared only by a probe that watches
   * `currentTime` actually advance - never by the state alone. WebKit 263627 is exactly a
   * context reporting `running` with a frozen `currentTime`, and since ADR-0006/ADR-0009 made
   * `currentTime` the only clock in this app, that state passes every guard we have while
   * making playback silent and the playhead immobile.
   */
  private clockSuspect = false;
  /**
   * Whether the context has ever reached `running`. Distinguishes "broken and worth repairing"
   * from "never unlocked yet", which look identical from the state alone and want opposite
   * treatment: the second is just waiting for its first user activation.
   */
  private hasBeenRunning = false;
  private recovery: Promise<void> | null = null;
  /** Tail of the ensureRunning chain - see there for why the ladder may not run concurrently. */
  private ensureQueue: Promise<void> | null = null;
  /** The state listener follows the published context and is removed before an old one closes. */
  private observedContext: AudioContext | null = null;
  private disposeContextState: (() => void) | null = null;
  private disposeLifecycle: (() => void) | null = null;
  private disarmGesture: (() => void) | null = null;
  /**
   * Set when the page has actually been hidden, and consumed by the next ladder walk.
   *
   * WebKit 276687: after a spell in the background the context can report `running` with a
   * currentTime that keeps incrementing, and still produce no sound - so neither the state nor
   * the clock probe can detect it, and the only known cure is a suspend()/resume() cycle. The
   * bug report notes it does not occur when the context WAS suspended and resumed across the
   * background transition, which is exactly what this forces on the way back.
   *
   * The cost is a renderer stop/start on every return to the foreground, which is a brief gap if
   * audio happens to be playing at that moment. That is the whole trade: an occasional hiccup on
   * tab-return against audio that is silently dead until the app is restarted. Not narrowed to
   * WebKit, because "output is silently broken" has no feature test and sniffing the UA would be
   * a worse guess than paying the cost everywhere.
   */
  private rendererCycleDue = false;
  /** Wall-clock time of the last rebuild, for REBUILD_COOLDOWN_MS. */
  private lastRebuildAt = 0;
  private teardownSubscribers = new Set<() => void>();
  private rebuiltSubscribers = new Set<(context: AudioContext) => void>();

  constructor(timings: Partial<AudioRecoveryTimings> = {}) {
    // Injectable for the same reason Metronome takes a MetronomeTimer: the recovery ladder is
    // made of real waits, and a test should not spend 180 ms per clock probe.
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
  }

  private loadReverb = (context: AudioContext): Promise<void> => {
    // Capture the context rather than repeatedly reading this.audioContext inside the async
    // chain. An init-time decode can still be in flight when a rebuild publishes a replacement;
    // that old completion must not create half of its graph on each context or overwrite the
    // replacement's reverb nodes.
    const loading = fetch(`${base}/assets/audio/reverb4.wav`)
      .then((r) => r.arrayBuffer())
      // The CALLBACK form decides this, matching the "dont change any of this, safari bug" note
      // on Instrument.fetchAudioBuffer. The promise-returning overload is the newer half of the
      // API and the older WebKit this whole file exists for returns undefined from it - so
      // chaining onto the return value is both how the impulse response silently comes back
      // undefined and, here, a TypeError on `undefined.catch`.
      .then(
        (buffer) =>
          new Promise<AudioBuffer>((resolve, reject) => {
            const decoding = context.decodeAudioData(buffer, resolve, reject);
            // Undefined on exactly those engines. On the ones that DO return a promise it
            // rejects alongside the error callback, so it needs an observer of its own or the
            // same failure surfaces a second time as an unhandled rejection.
            void (decoding as Promise<AudioBuffer> | undefined)?.catch(() => {});
          })
      )
      .then((impulseResponse) => {
        if (this.audioContext !== context) return;
        const convolver = context.createConvolver();
        const gainNode = context.createGain();
        gainNode.gain.value = 2.5;
        convolver.buffer = impulseResponse;
        convolver.connect(gainNode);
        gainNode.connect(context.destination);
        this.reverbNode = convolver;
        this.reverbVolumeNode = gainNode;
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (this.reverbLoading === loading) this.reverbLoading = null;
      });
    this.reverbLoading = loading;
    return loading;
  };
  getAudioContext = (): AudioContext => {
    if (!this.audioContext) {
      // @ts-expect-error window.webkitAudioContext (legacy Safari prefix) not in Window type definitions
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.observeContext(this.audioContext);
    }
    return this.audioContext;
  };
  /**
   * Make the shared audio clock advance before a transport is anchored to it.
   *
   * Browsers are allowed to create an AudioContext in the suspended state when construction
   * happens outside a user activation. Composer playback uses currentTime as its only clock, so
   * anchoring before resume would leave both playback and audio export waiting forever on a
   * timestamp the context can never reach. Keep the resume promise visible to callers so they can
   * guard play/stop races while it is pending.
   *
   * THE LADDER, in the order a broken iOS context has to be walked back up:
   *  1. `interrupted` - wait it out, never resume() into it (see WebkitAudioContextState).
   *  2. still interrupted with the page in the foreground - stuck; restart the renderer.
   *  3. `suspended` - the ordinary unlock; resume(), timeboxed against WebKit 281566.
   *  4. clock suspect - probe `currentTime`, and restart the renderer if it is frozen.
   *
   * It throws when the context is still not running at the end, which is deliberate: an honest
   * failed play request is strictly better than anchoring a transport on a dead clock, where
   * the playhead freezes, nothing sounds, and `isPlaying` stays true with no error anywhere.
   *
   * SERIALISED, because the repairs on rungs 2 and 4 are suspend()/resume() pairs and two of
   * those interleaved can settle on `suspended` - a context this call just switched off. The
   * collision is not exotic: returning to the foreground starts a recovery, and pressing play a
   * moment later is exactly what the user does next. A first call still reaches `resume()`
   * synchronously, so a caller can hold the returned promise as a start-in-progress guard.
   */
  ensureRunning = (): Promise<AudioContext> => {
    const run = this.ensureQueue
      ? this.ensureQueue.then(
          () => this.walkLadder(),
          () => this.walkLadder()
        )
      : this.walkLadder();
    const tail = run.then(
      () => {},
      () => {}
    );
    this.ensureQueue = tail;
    // Released once nothing is waiting behind it, so the ordinary case keeps the direct path
    // above rather than accumulating a chain that never empties over a long session.
    void tail.finally(() => {
      if (this.ensureQueue === tail) this.ensureQueue = null;
    });
    return run;
  };

  private walkLadder = async (attempt = 0): Promise<AudioContext> => {
    let context = this.getAudioContext();
    this.observeContext(context);

    if (stateOf(context) === 'interrupted') await this.waitOutInterruption(context);

    if (stateOf(context) === 'suspended') {
      try {
        await withTimeout(context.resume(), this.timings.callTimeoutMs, 'resume');
      } catch (error) {
        if (stateOf(context) === 'interrupted') {
          // resume() during an active interruption rejects AND moves the context here. That is
          // the transition the old one-liner tripped over on every post-background play.
          await this.waitOutInterruption(context);
        } else if (!(error instanceof AudioContextTimeoutError)) {
          // A genuine denial (no user activation yet, autoplay policy): the caller aborting its
          // pending start is the right response, so this still propagates as it always did.
          throw error;
        }
      }
    }

    // Before the probe, because the probe cannot see this failure: the clock is advancing.
    if (this.rendererCycleDue) {
      if (stateOf(context) === 'running') {
        const restarted = await this.restartRenderer(context);
        if (!restarted) {
          // This flag is the ONLY evidence for WebKit's advancing-clock-but-silent failure, so
          // falling through to the clock probe would launder a failed repair into success: the
          // clock is advancing, that is the whole point of the failure.
          //
          // But this must not simply throw either. The commonest way to get here is a resume()
          // that never settles (WebKit 281566) on the very path the cycle is armed for - which
          // ALSO leaves the context suspended, so the next walk skips this block on the state
          // gate and can never reach the rebuild below. That is a livelock in which the one
          // repair capable of fixing the context is unreachable precisely because the context
          // is broken. Escalate straight to it instead.
          const rebuilt = await this.rebuildContext();
          if (!rebuilt) {
            this.clockSuspect = true;
            throw new Error('Audio renderer could not be restarted');
          }
          // The replacement has never been backgrounded, so it owes no cycle.
          this.rendererCycleDue = false;
          if (attempt < 1) return this.walkLadder(attempt + 1);
          context = rebuilt;
        }
        this.rendererCycleDue = false;
      }
    }

    if (this.clockSuspect) {
      const live = await this.verifyClock(context);
      // The rebuild rung replaces the context wholesale, which makes every reading taken above
      // stale. Walk the ladder once more on the replacement rather than reasoning about the
      // object we just closed; `attempt` keeps that from becoming a loop, and the rebuild's own
      // cooldown means the second pass cannot reach that rung again.
      if (live !== context) {
        if (attempt < 1) return this.walkLadder(attempt + 1);
        // Unreachable while the cooldown holds, and not worth trusting it to: judge the context
        // that is actually live rather than the one that was closed out from under us.
        context = live;
      }
    }

    if (stateOf(context) !== 'running') {
      throw new Error(`Audio context is "${stateOf(context)}" and could not be resumed`);
    }
    if (this.clockSuspect) {
      // Every repair was tried and the clock still does not move - commonly because the rebuild
      // rung was inside its cooldown. Reporting success here would hand a caller a `running`
      // context whose currentTime never arrives, which is the exact silent freeze this ladder
      // exists to prevent; the flag stays set so the next gesture tries again.
      throw new Error('Audio context clock is not advancing');
    }
    this.hasBeenRunning = true;
    return context;
  };
  waitReverb = async (): Promise<void> => {
    // A rebuild can replace the load being awaited. Continue until the CURRENT context's load,
    // rather than merely the promise that happened to be current on entry, has finished.
    while (this.reverbLoading) await this.reverbLoading;
  };
  init = async () => {
    this.audioContext =
      // @ts-expect-error window.webkitAudioContext (legacy Safari prefix) not in Window type definitions
      this.audioContext ?? new (window.AudioContext || window.webkitAudioContext)();
    this.observeContext(this.audioContext);
    this.installLifecycleRecovery();
    // Armed from the start, not only after an interruption: a context built here - during
    // onMount, with no user activation anywhere near it - is born suspended on iOS, and the
    // free-play surfaces below never call ensureRunning to unlock it.
    this.armGestureRecovery();
    this.recorder = new AudioRecorder(this.audioContext);
    await this.loadReverb(this.audioContext);
    this.setAudioDestinations();
    return this;
  };

  /**
   * Watch the context's own state. Nothing did before, which is why an interruption was
   * invisible to the app and why nothing ever retried once a play request had failed.
   */
  observeContext = (context: AudioContext) => {
    if (this.observedContext === context) return;
    this.disposeContextState?.();
    this.disposeContextState = null;
    this.observedContext = context;
    this.contextState = stateOf(context);
    this.hasBeenRunning ||= this.contextState === 'running';
    if (typeof context.addEventListener !== 'function') return;
    const onStateChange = () => {
      // A close() that timed out can emit its final event after a replacement was published.
      // Never let that retired context overwrite the state observed for the live one.
      if (this.audioContext !== context) return;
      const previous = this.contextState;
      this.contextState = stateOf(context);
      this.hasBeenRunning ||= this.contextState === 'running';
      // BOTH directions. Entering is obvious; LEAVING is the dangerous one, because that is the
      // moment WebKit 263627 hands back a context whose state says `running` and whose clock
      // never moves again.
      if (previous === 'interrupted' || this.contextState === 'interrupted') {
        this.clockSuspect = true;
      }
    };
    context.addEventListener('statechange', onStateChange);
    this.disposeContextState = () => {
      context.removeEventListener?.('statechange', onStateChange);
      if (this.observedContext === context) this.observedContext = null;
    };
  };

  /**
   * Resume the shared context when the app comes back to the foreground.
   *
   * Chrome and Firefox do this themselves, which is why the app got away without it for as long
   * as it has; WebKit 263627 is precisely "not consistently resumed when page is brought to
   * foreground". `pageshow` covers the bfcache restore that `visibilitychange` does not fire for.
   */
  installLifecycleRecovery = () => {
    if (this.disposeLifecycle || typeof document === 'undefined') return;
    const onForeground = () => {
      // Fires on the way out too, and a hidden page is the one moment recovery must not run -
      // but it IS the moment to remember that a background transition happened at all.
      if (document.visibilityState !== 'visible') {
        this.rendererCycleDue = true;
        return;
      }
      // Set BEFORE recovering, so the probe in ensureRunning runs on this pass: coming back
      // from the background is the exact event after which the clock cannot be trusted.
      this.clockSuspect = true;
      this.armGestureRecovery();
      // A context that has never run is waiting for its first user activation, not broken:
      // resuming it here would only produce a rejected promise and a warning on every tab
      // switch. The gesture arm above is what unlocks that one.
      if (this.hasBeenRunning) void this.recoverAudioContext();
    };
    // A bfcache restore is by definition a return from hidden, and does not always come with a
    // visibilitychange pair, so it arms the cycle itself.
    const onPageShow = (event: PageTransitionEvent) => {
      // `pageshow` also fires for an ordinary initial navigation. Only a persisted document is
      // returning from the back-forward cache without the hidden visibility event that normally
      // arms the cycle; treating first load as a restore makes the first iOS gesture pay an
      // unnecessary resume -> suspend -> resume sequence.
      if (!event.persisted) return;
      this.rendererCycleDue = true;
      onForeground();
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('pageshow', onPageShow);
    this.disposeLifecycle = () => {
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('pageshow', onPageShow);
    };
  };

  /**
   * Try again on the next user gesture.
   *
   * Two reasons, either of which alone would justify it. WebKit sometimes only lets a context
   * back to `running` under a user activation, so the foreground attempt above can be too
   * early. And the free-play surfaces - zen-keyboard, and PlayerKeyboard's handleClick - never
   * call ensureRunning at all: a tap goes straight to Instrument.play(), so this is the ONLY
   * recovery those paths get.
   *
   * Capture-phase and passive: this observes gestures, it never consumes one.
   */
  armGestureRecovery = () => {
    if (this.disarmGesture || typeof document === 'undefined') return;
    const options = { passive: true, capture: true } as const;
    const onGesture = () => {
      this.disarmGesture?.();
      void this.recoverAudioContext().then(() => {
        // Re-arm while it is still not running OR still not ticking: a context that needs an
        // activation we did not get, or whose rebuild was refused by the cooldown, should keep
        // getting the next gesture rather than going quiet after one attempt.
        if (this.audioContext && (stateOf(this.audioContext) !== 'running' || this.clockSuspect)) {
          this.armGestureRecovery();
        }
      });
    };
    for (const type of GESTURE_EVENTS) document.addEventListener(type, onGesture, options);
    this.disarmGesture = () => {
      this.disarmGesture = null;
      for (const type of GESTURE_EVENTS) document.removeEventListener(type, onGesture, options);
    };
  };

  /**
   * Best-effort walk up the ladder, for the callers that have no run to abort - the lifecycle
   * and gesture hooks. Deduplicated, because a return to the foreground fires several of them
   * at once and each one costs a clock probe.
   */
  recoverAudioContext = (): Promise<void> => {
    if (this.recovery) return this.recovery;
    if (!this.audioContext) return Promise.resolve();
    const run = (async () => {
      try {
        await this.ensureRunning();
      } catch (error) {
        // Not console.error: this is a speculative attempt on a page the user may not even be
        // trying to play on, and AppInit routes console.error into the visible log store.
        console.warn('Could not restore the audio context', error);
      }
    })();
    this.recovery = run.finally(() => {
      this.recovery = null;
    });
    return this.recovery;
  };

  /**
   * Wait for the UA to lift an interruption, then force the issue if it never does.
   *
   * No resume() here, deliberately - see WebkitAudioContextState for why calling it is worse
   * than doing nothing. Both an event listener and a poll: WebKit does fire `statechange`, but
   * the failures this guards against are exactly the ones where it might not, and a missed
   * event would hang a play request for the whole timeout.
   */
  private waitOutInterruption = async (context: AudioContext) => {
    this.clockSuspect = true;
    await this.waitForStateChange(context);
    if (stateOf(context) !== 'interrupted') return;
    // Stuck (web-audio-api#2585): the page is in the foreground and the interruption was never
    // lifted. suspend() is documented to resolve even while one is active, and the pair is the
    // only lever anyone has found that moves a wedged context (WebKit 263627).
    const restarted = await this.restartRenderer(context);
    // If this interruption came from a background transition, the successful pair just paid the
    // renderer-cycle debt too. Leaving it armed would immediately suspend/resume a second time.
    if (restarted) this.rendererCycleDue = false;
  };

  private waitForStateChange = (context: AudioContext): Promise<void> => {
    if (stateOf(context) !== 'interrupted') return Promise.resolve();
    return new Promise((resolve) => {
      const onChange = () => {
        if (stateOf(context) === 'interrupted') return;
        finish();
      };
      const finish = () => {
        clearInterval(poll);
        clearTimeout(timer);
        context.removeEventListener?.('statechange', onChange);
        resolve();
      };
      context.addEventListener?.('statechange', onChange);
      const poll = setInterval(onChange, this.timings.statePollMs);
      const timer = setTimeout(finish, this.timings.interruptionWaitMs);
    });
  };

  /**
   * The suspend()/resume() pair that is the only known way back from a context whose renderer
   * has stopped while its state still reads `running` (WebKit 263627). Returns whether the whole
   * pair completed and left the context running. Most callers can still judge the result by the
   * clock; the post-background renderer-cycle path cannot, because its failure mode has a live
   * clock and silent output, so it must retain this explicit success signal.
   */
  private restartRenderer = async (context: AudioContext): Promise<boolean> => {
    try {
      await withTimeout(context.suspend(), this.timings.callTimeoutMs, 'suspend');
      await withTimeout(context.resume(), this.timings.callTimeoutMs, 'resume');
      return stateOf(context) === 'running';
    } catch (error) {
      console.warn('Audio renderer restart failed', error);
      return false;
    }
  };

  /**
   * Clear `clockSuspect` only once `currentTime` has been SEEN to advance, escalating while it
   * has not: first a renderer restart, then a whole new context. Returns the context that is
   * live at the end, which is a DIFFERENT object when the rebuild rung ran.
   */
  private verifyClock = async (context: AudioContext): Promise<AudioContext> => {
    if (await this.isClockAdvancing(context)) {
      this.clockSuspect = false;
      return context;
    }
    await this.restartRenderer(context);
    if (await this.isClockAdvancing(context)) {
      this.clockSuspect = false;
      return context;
    }
    // Nothing short of a new context fixes this one. The commonest cause is a sample rate that
    // changed under us while the page was away - iOS switches the hardware rate when headphones
    // or a Bluetooth device connect, and a context built at the old rate is simply finished.
    const rebuilt = await this.rebuildContext();
    if (!rebuilt) return context;
    this.clockSuspect = !(await this.isClockAdvancing(rebuilt));
    return rebuilt;
  };

  /**
   * Subscribe to the rebuild rung. `teardown` runs while the outgoing context is still OPEN -
   * the only moment its nodes can be stopped without throwing - and `rebuilt` once the
   * replacement is live. AppInit uses the pair to re-init the metronome, which owns a gain node
   * and a queue of committed beats that AudioProvider's own node registry never sees.
   */
  onContextTeardown = (handler: () => void): (() => void) => {
    this.teardownSubscribers.add(handler);
    return () => this.teardownSubscribers.delete(handler);
  };

  onContextRebuilt = (handler: (context: AudioContext) => void): (() => void) => {
    this.rebuiltSubscribers.add(handler);
    return () => this.rebuiltSubscribers.delete(handler);
  };

  /**
   * Replace the shared context outright and re-home everything hanging off it.
   *
   * The last rung, and the only one that survives a sample-rate change. It is expensive - every
   * sample in the app is re-decoded, because an AudioBuffer belongs to the context that decoded
   * it - so it is rate-limited and never runs speculatively.
   *
   * ORDER MATTERS. Everything that has to touch the outgoing context (stopping committed
   * one-shots, releasing sounding voices, disconnecting nodes) happens BEFORE it is closed,
   * because those same calls throw on a closed context. Reverb, recorder and every instrument
   * are then rebuilt against the replacement, and each instrument is reconnected to the
   * destination it had - a layer that was dry must not come back wet.
   *
   * Returns the new context, or null when it declined (too soon, or no context to replace).
   */
  rebuildContext = async (): Promise<AudioContext | null> => {
    const previous = this.audioContext;
    if (!previous || typeof window === 'undefined') return null;
    const now = Date.now();
    if (this.lastRebuildAt && now - this.lastRebuildAt < REBUILD_COOLDOWN_MS) return null;

    // Acquire a replacement BEFORE changing any live state. Construction can fail transiently
    // on iOS (especially while a wedged previous context still owns the hardware). The old code
    // discovered that only after detaching every instrument, deleting the recorder and closing
    // the old context, then restored a pointer to an object whose whole graph was gone and barred
    // another attempt for the cooldown. A failed acquisition must be a true no-op.
    let context: AudioContext;
    try {
      context =
        // @ts-expect-error window.webkitAudioContext (legacy Safari prefix) not in Window type definitions
        new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Could not build a replacement audio context', error);
      return null;
    }
    // Rate-limit completed acquisitions, not failed attempts which changed nothing.
    this.lastRebuildAt = now;

    // Read the graph BEFORE tearing it down: after re-homing, an instrument's endNode is a
    // different object, so the routing has to be carried across by owner rather than by node.
    // Retire the old context for load purposes FIRST: anything decoding against it right now
    // must discard its result rather than land after the close (see Instrument's CONTEXT_EPOCH).
    Instrument.beginContextEpoch();
    const instruments = Instrument.liveInstruments();
    const routing = instruments.map((instrument) => ({
      instrument,
      to: this.nodes.find((entry) => entry.node === instrument.endNode)?.to ?? null,
    }));

    this.teardownSubscribers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        console.warn('Audio context teardown subscriber failed', error);
      }
    });
    for (const { instrument } of routing) instrument.detachFromContext();
    this.nodes.forEach((entry) => entry.node.disconnect());
    this.nodes = [];
    this.reverbNode = null;
    this.reverbVolumeNode = null;
    // An in-flight recording cannot survive the context it was capturing, and by this point it
    // has been recording a dead renderer anyway. Release its stream node explicitly rather than
    // dropping the reference and leaving it attached to a context about to be closed.
    this.recorder?.delete();
    this.recorder = null;
    this.isRecording = false;

    // The old sample pool must be retired before the replacement is published. Once published,
    // reactive Player/Composer work is free to start a load synchronously against it, and that
    // load must neither see old-context buffers nor be erased by a later clearPool().
    Instrument.clearPool();
    this.audioContext = context;
    this.observeContext(context);
    try {
      this.recorder = new AudioRecorder(context);
    } catch (error) {
      // Recording is optional; losing it must not abort re-homing the actual audio graph.
      console.warn('Could not build an audio recorder for the replacement context', error);
    }

    // Start replacement work immediately, before the first yield. In particular, every routed
    // instrument now owns a new-context gain node before an old in-flight load can settle and
    // hand its owner control again. The old close runs alongside decoding and is timeboxed: a
    // context that stopped rendering is exactly the kind that can refuse to close.
    const reverbLoading = this.loadReverb(context);
    const rehomes = routing.map(({ instrument }) => instrument.rehome(context));
    try {
      await withTimeout(previous.close(), this.timings.callTimeoutMs, 'close');
    } catch {
      /* a context that will not close is still being replaced */
    }
    await reverbLoading;
    await Promise.all(rehomes);

    for (const { instrument, to } of routing) {
      this.connect(instrument.endNode, to === null ? null : to === 'reverb');
    }
    this.setAudioDestinations();

    // A brand-new context is born suspended outside a user activation, exactly as at startup.
    if (stateOf(context) === 'suspended') {
      await withTimeout(context.resume(), this.timings.callTimeoutMs, 'resume').catch(() => {});
    }
    this.rebuiltSubscribers.forEach((handler) => {
      try {
        handler(context);
      } catch (error) {
        console.warn('Audio context rebuild subscriber failed', error);
      }
    });
    return context;
  };

  private isClockAdvancing = async (context: AudioContext): Promise<boolean> => {
    const before = context.currentTime;
    await sleep(this.timings.clockProbeMs);
    return context.currentTime > before;
  };

  connect = (node: AudioNode | null, reverbOverride: boolean | null) => {
    if (!node) return this;
    // A node belongs to the context that created it, and cross-context connect() throws. This
    // catches whatever the rebuild's epoch token did not: a caller still holding an engine's
    // pre-rebuild endNode has nothing useful to register, and refusing is better than either
    // throwing at it or filing a dead node that setAudioDestinations will keep re-wiring.
    if (this.audioContext && node.context && node.context !== this.audioContext) {
      console.warn('Refusing to connect an audio node from a retired context');
      return this;
    }
    // An owner whose pre-rebuild load was invalidated can resume while rehome() is still decoding
    // and connect the replacement gain first. Rebuild connects it again when decoding finishes;
    // update that one registry entry instead of retaining duplicate routes for the same node.
    const existing = this.nodes.find((entry) => entry.node === node);
    if (existing) {
      existing.to = reverbOverride === null ? null : reverbOverride ? 'reverb' : 'end';
      this.setNodeDestination(existing);
      return this;
    }
    this.nodes.push({
      node,
      to: reverbOverride === null ? null : reverbOverride ? 'reverb' : 'end',
    });
    this.setAudioDestinations();
    return this;
  };

  destroy = () => {
    this.disposeLifecycle?.();
    this.disposeLifecycle = null;
    this.disposeContextState?.();
    this.disposeContextState = null;
    this.observedContext = null;
    this.disarmGesture?.();
    this.nodes.forEach((node) => node.node.disconnect());
    this.nodes = [];
    this.recorder = null;
    this.reverbNode = null;
    this.reverbVolumeNode = null;
  };

  clear = () => {
    this.nodes.forEach((node) => node.node.disconnect());
    this.nodes = [];
    return this;
  };

  disconnect = (node: AudioNode | null) => {
    if (!node) return this;
    this.nodes = this.nodes.filter((n) => n.node !== node);
    node.disconnect();
    return this;
  };

  setReverb = (hasReverb: boolean) => {
    this.defaultDestination = hasReverb ? 'reverb' : 'end';
    this.setAudioDestinations();
    return this;
  };
  setReverbOfNode = (_node: AudioNode | null, hasReverb: boolean | null) => {
    const node = this.nodes.find((n) => n.node === _node);
    if (!node) return undefined;
    node.to = hasReverb === null ? null : hasReverb ? 'reverb' : 'end';
    this.setNodeDestination(node);
    return node;
  };

  startRecording = () => {
    const { recorder, nodes, reverbVolumeNode } = this;
    if (!recorder || !recorder.node) return;
    if (reverbVolumeNode) reverbVolumeNode.connect(recorder.node);
    for (const node of nodes) {
      const dest = node.to ?? this.defaultDestination;
      if (dest === 'end') {
        node.node.connect(recorder.node);
      }
    }
    this.isRecording = true;
    recorder.start();
    return this;
  };

  stopRecording = async () => {
    const { recorder, reverbVolumeNode, audioContext } = this;
    if (!recorder) return;
    const recording = await recorder.stop();
    // A rebuild can replace all three while MediaRecorder is asynchronously delivering its final
    // dataavailable event. The captured blob is still valid, but reconnecting an old reverb node
    // to the new context would throw a cross-context InvalidAccessError.
    if (this.recorder !== recorder || this.audioContext !== audioContext) return recording;
    if (reverbVolumeNode && audioContext) {
      reverbVolumeNode.disconnect();
      reverbVolumeNode.connect(audioContext.destination);
    }
    this.isRecording = false;
    this.setAudioDestinations();
    return recording;
  };
  now = () => {
    return this.audioContext?.currentTime ?? 0;
  };
  nowMs = () => {
    return (this.audioContext?.currentTime ?? 0) * 1000;
  };
  setAudioDestinations = async () => {
    this.nodes.forEach((node) => {
      this.setNodeDestination(node);
    });
    return this;
  };

  setNodeDestination(node: AppAudioNode) {
    node.node.disconnect();
    const dest = node.to ?? this.defaultDestination;
    if (dest === 'reverb') {
      if (!this.reverbNode) {
        console.warn("Couldn't connect to reverb");
        if (this.audioContext) node.node.connect(this.audioContext.destination);
      } else {
        node.node.connect(this.reverbNode);
      }
    } else {
      if (this.audioContext) node.node.connect(this.audioContext.destination);
    }
  }
}

export const AudioProvider = new AudioProviderClass();
