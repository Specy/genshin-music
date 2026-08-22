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
  private stateListenerAttached = false;
  private disposeLifecycle: (() => void) | null = null;
  private disarmGesture: (() => void) | null = null;
  /** Wall-clock time of the last rebuild, for REBUILD_COOLDOWN_MS. */
  private lastRebuildAt = 0;
  private teardownSubscribers = new Set<() => void>();
  private rebuiltSubscribers = new Set<(context: AudioContext) => void>();

  constructor(timings: Partial<AudioRecoveryTimings> = {}) {
    // Injectable for the same reason Metronome takes a MetronomeTimer: the recovery ladder is
    // made of real waits, and a test should not spend 180 ms per clock probe.
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
  }

  private loadReverb = (): Promise<void> => {
    this.reverbLoading = new Promise((resolve) => {
      fetch(`${base}/assets/audio/reverb4.wav`)
        .then((r) => r.arrayBuffer())
        .then((b) => {
          if (this.audioContext) {
            this.audioContext.decodeAudioData(b, (impulse_response) => {
              const convolver = this.audioContext!.createConvolver();
              const gainNode = this.audioContext!.createGain();
              gainNode.gain.value = 2.5;
              convolver.buffer = impulse_response;
              convolver.connect(gainNode);
              gainNode.connect(this.audioContext!.destination);
              this.reverbNode = convolver;
              this.reverbVolumeNode = gainNode;
              this.reverbLoading = null;
              resolve();
            });
          }
        })
        .catch((e) => {
          console.error(e);
          this.reverbLoading = null;
          resolve();
        });
    });
    return this.reverbLoading;
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
    this.hasBeenRunning = true;
    return context;
  };
  waitReverb = async (): Promise<void> => {
    if (this.reverbLoading) {
      await this.reverbLoading;
    }
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
    await this.loadReverb();
    this.setAudioDestinations();
    return this;
  };

  /**
   * Watch the context's own state. Nothing did before, which is why an interruption was
   * invisible to the app and why nothing ever retried once a play request had failed.
   */
  observeContext = (context: AudioContext) => {
    if (this.stateListenerAttached || typeof context.addEventListener !== 'function') return;
    this.stateListenerAttached = true;
    this.contextState = stateOf(context);
    this.hasBeenRunning ||= this.contextState === 'running';
    context.addEventListener('statechange', () => {
      const previous = this.contextState;
      this.contextState = stateOf(context);
      this.hasBeenRunning ||= this.contextState === 'running';
      // BOTH directions. Entering is obvious; LEAVING is the dangerous one, because that is the
      // moment WebKit 263627 hands back a context whose state says `running` and whose clock
      // never moves again.
      if (previous === 'interrupted' || this.contextState === 'interrupted') {
        this.clockSuspect = true;
      }
    });
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
      // Fires on the way out too, and a hidden page is the one moment recovery must not run.
      if (document.visibilityState !== 'visible') return;
      // Set BEFORE recovering, so the probe in ensureRunning runs on this pass: coming back
      // from the background is the exact event after which the clock cannot be trusted.
      this.clockSuspect = true;
      this.armGestureRecovery();
      // A context that has never run is waiting for its first user activation, not broken:
      // resuming it here would only produce a rejected promise and a warning on every tab
      // switch. The gesture arm above is what unlocks that one.
      if (this.hasBeenRunning) void this.recoverAudioContext();
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('pageshow', onForeground);
    this.disposeLifecycle = () => {
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('pageshow', onForeground);
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
        // Re-arm while it is still not running: a context that needs an activation we did not
        // get should keep getting the next one, rather than going quiet after one attempt.
        if (this.audioContext && stateOf(this.audioContext) !== 'running') {
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
    await this.restartRenderer(context);
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
   * has stopped while its state still reads `running` (WebKit 263627). Never throws: it is a
   * repair attempt, and whether it worked is answered by the clock, not by these promises.
   */
  private restartRenderer = async (context: AudioContext) => {
    try {
      await withTimeout(context.suspend(), this.timings.callTimeoutMs, 'suspend');
      await withTimeout(context.resume(), this.timings.callTimeoutMs, 'resume');
    } catch (error) {
      console.warn('Audio renderer restart failed', error);
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
    this.lastRebuildAt = now;

    // Read the graph BEFORE tearing it down: after re-homing, an instrument's endNode is a
    // different object, so the routing has to be carried across by owner rather than by node.
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
    this.recorder = null;
    this.isRecording = false;
    // Best effort: a context that has stopped rendering is exactly the kind that can refuse to
    // close, and holding up the replacement to find out helps nobody.
    await withTimeout(previous.close(), this.timings.callTimeoutMs, 'close').catch(() => {});

    this.stateListenerAttached = false;
    this.audioContext =
      // @ts-expect-error window.webkitAudioContext (legacy Safari prefix) not in Window type definitions
      new (window.AudioContext || window.webkitAudioContext)();
    const context = this.audioContext;
    this.observeContext(context);
    // The pooled buffers were decoded by the context we just closed and are unusable now.
    Instrument.clearPool();
    this.recorder = new AudioRecorder(context);
    await this.loadReverb();

    for (const { instrument, to } of routing) {
      await instrument.rehome(context);
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
    if (reverbVolumeNode && audioContext) {
      reverbVolumeNode.disconnect();
      reverbVolumeNode.connect(this.audioContext!.destination);
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
