import { describe, expect, it, vi } from 'vitest';
import { AudioProviderClass, AudioContextTimeoutError } from '../src/lib/providers/AudioProvider';

/**
 * The recovery ladder is made of real waits, so every provider built here gets the timings
 * collapsed to something a test can afford. Only the ORDER of the ladder is under test - the
 * durations themselves are policy, not behaviour.
 */
const FAST = { callTimeoutMs: 50, interruptionWaitMs: 40, statePollMs: 2, clockProbeMs: 2 };

type FakeState = 'suspended' | 'running' | 'interrupted' | 'closed';

/**
 * A stand-in for WebKit's AudioContext, which is the only implementation that has the states
 * this ladder exists for. jsdom has no Web Audio at all, and the real browser cannot be made to
 * interrupt itself on demand.
 */
function fakeContext(
  initial: FakeState,
  options: { clockFrozen?: boolean; resumeTo?: FakeState } = {}
) {
  const listeners = new Set<() => void>();
  let time = 0;
  const context = {
    state: initial as FakeState,
    /** Advances on read unless the renderer is wedged - WebKit 263627's exact failure. */
    get currentTime() {
      if (!options.clockFrozen) time += 0.01;
      return time;
    },
    resume: vi.fn(async () => {
      // The interrupted contract: resume() rejects, and from `suspended` it also drops the
      // context INTO the interrupted state.
      if (context.state === 'interrupted') throw new Error('resume denied while interrupted');
      context.setState(options.resumeTo ?? 'running');
    }),
    suspend: vi.fn(async () => {
      context.setState('suspended');
      // The pair is a repair: a wedged renderer starts ticking again on the way back.
      options.clockFrozen = false;
    }),
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    setState(next: FakeState) {
      context.state = next;
      listeners.forEach((fn) => fn());
    },
  };
  return context;
}

function providerWith(context: ReturnType<typeof fakeContext>) {
  const provider = new AudioProviderClass(FAST);
  provider.audioContext = context as unknown as AudioContext;
  // What init() does for a context it created. Without it the provider never sees a state
  // transition, and the interruption bookkeeping below has nothing to hang on.
  provider.observeContext(provider.audioContext);
  return provider;
}

describe('AudioProvider.ensureRunning', () => {
  it('resumes a suspended shared context before resolving', async () => {
    let finishResume!: () => void;
    const context = fakeContext('suspended');
    context.resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishResume = () => {
            context.setState('running');
            resolve();
          };
        })
    );
    const provider = providerWith(context);

    let settled = false;
    const running = provider.ensureRunning().then((value) => {
      settled = true;
      return value;
    });

    expect(context.resume).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    finishResume();
    await expect(running).resolves.toBe(context);
  });

  it('does not resume an already-running context', async () => {
    const context = fakeContext('running');
    const provider = providerWith(context);

    await expect(provider.ensureRunning()).resolves.toBe(context);
    expect(context.resume).not.toHaveBeenCalled();
  });

  it('propagates a resume rejection so the caller can abort its pending start', async () => {
    const failure = new Error('resume denied');
    const context = fakeContext('suspended');
    context.resume = vi.fn().mockRejectedValue(failure);
    const provider = providerWith(context);

    await expect(provider.ensureRunning()).rejects.toBe(failure);
  });

  it('never calls resume() on an interrupted context, and waits for the UA to lift it', async () => {
    // The whole iOS bug in one test: resume() here rejects and can wedge the context, so the
    // ladder has to sit still until WebKit hands it back.
    const context = fakeContext('interrupted');
    const provider = providerWith(context);

    const running = provider.ensureRunning();
    expect(context.resume).not.toHaveBeenCalled();
    context.setState('running');

    await expect(running).resolves.toBe(context);
    expect(context.resume).not.toHaveBeenCalled();
  });

  it('restarts the renderer when an interruption is never lifted', async () => {
    // web-audio-api#2585: foregrounded, still interrupted, resume() powerless. suspend()+resume()
    // is the only lever left.
    const context = fakeContext('interrupted');
    const provider = providerWith(context);

    await expect(provider.ensureRunning()).resolves.toBe(context);
    expect(context.suspend).toHaveBeenCalled();
    expect(context.resume).toHaveBeenCalled();
    expect(context.state).toBe('running');
  });

  it('repairs a context that reports running while its clock is frozen', async () => {
    // WebKit 263627. Every state check in the app passes here; only the clock tells the truth.
    const context = fakeContext('running', { clockFrozen: true });
    const provider = providerWith(context);
    // An interruption came and went, which is what marks the clock as untrusted.
    context.setState('interrupted');
    context.setState('running');

    await expect(provider.ensureRunning()).resolves.toBe(context);
    expect(context.suspend).toHaveBeenCalled();
    expect(context.resume).toHaveBeenCalled();
  });

  it('does not probe the clock when no interruption has been seen', async () => {
    const context = fakeContext('running', { clockFrozen: true });
    const provider = providerWith(context);

    await expect(provider.ensureRunning()).resolves.toBe(context);
    // A frozen reading is only actionable after something could have broken the renderer;
    // otherwise every single play request would pay for a probe.
    expect(context.suspend).not.toHaveBeenCalled();
  });

  it('survives a resume() that never settles', async () => {
    // WebKit 281566: the context comes back but the promise neither resolves nor rejects.
    // Un-timeboxed, this is what left the composer with playbackStarting stuck true and every
    // later play request short-circuited by its own generation guard.
    const context = fakeContext('running');
    const provider = providerWith(context);
    context.setState('interrupted');
    context.setState('suspended');
    context.resume = vi.fn(() => {
      context.setState('running');
      return new Promise<void>(() => {});
    });

    await expect(provider.ensureRunning()).resolves.toBe(context);
    expect(context.resume).toHaveBeenCalled();
  });

  it('reports a context it could not bring back rather than handing over a dead clock', async () => {
    const context = fakeContext('suspended', { resumeTo: 'suspended' });
    const provider = providerWith(context);

    await expect(provider.ensureRunning()).rejects.toThrow(/"suspended"/);
  });
});

describe('AudioProvider foreground recovery', () => {
  it('resumes the context when the page becomes visible again', async () => {
    const context = fakeContext('running');
    const provider = providerWith(context);
    // Only a context that has run before is worth resuming unprompted.
    await provider.ensureRunning();
    provider.installLifecycleRecovery();
    context.setState('interrupted');

    document.dispatchEvent(new Event('visibilitychange'));
    context.setState('suspended');
    await provider.recoverAudioContext();

    expect(context.state).toBe('running');
    provider.destroy();
  });

  it('recovers on the next user gesture, which is all the free-play surfaces ever get', async () => {
    const context = fakeContext('suspended');
    const provider = providerWith(context);
    provider.armGestureRecovery();

    document.dispatchEvent(new Event('pointerdown'));
    await provider.recoverAudioContext();

    expect(context.resume).toHaveBeenCalled();
    expect(context.state).toBe('running');
    provider.destroy();
  });
});

describe('AudioContextTimeoutError', () => {
  it('is distinguishable from a browser denial', () => {
    expect(new AudioContextTimeoutError('resume')).toBeInstanceOf(Error);
    expect(new AudioContextTimeoutError('resume').name).toBe('AudioContextTimeoutError');
  });
});

describe('AudioProvider.ensureRunning serialisation', () => {
  it('never runs two renderer repairs at once', async () => {
    // Returning to the foreground starts a recovery; pressing play a moment later starts
    // another. Interleaved, their suspend()/resume() pairs can settle on `suspended` - audio
    // switched off by the very call that was meant to switch it back on.
    const context = fakeContext('running', { clockFrozen: true });
    const provider = providerWith(context);
    context.setState('interrupted');
    context.setState('running');

    let inFlight = 0;
    let overlapped = false;
    const suspend = context.suspend;
    context.suspend = vi.fn(async () => {
      overlapped ||= inFlight > 0;
      inFlight++;
      await suspend();
      inFlight--;
    });

    const [first, second] = await Promise.all([provider.ensureRunning(), provider.ensureRunning()]);

    expect(overlapped).toBe(false);
    expect(first).toBe(context);
    expect(second).toBe(context);
    expect(context.state).toBe('running');
  });

  it('lets a later attempt through after an earlier one failed', async () => {
    const context = fakeContext('suspended', { resumeTo: 'suspended' });
    const provider = providerWith(context);

    await expect(provider.ensureRunning()).rejects.toThrow();
    context.resume = vi.fn(async () => context.setState('running'));
    await expect(provider.ensureRunning()).resolves.toBe(context);
  });
});

describe('the failure no probe can see', () => {
  it('cycles the renderer once after a real background transition', async () => {
    // WebKit 276687: after time in the background the context reports `running`, currentTime
    // keeps incrementing, and no sound comes out. Neither the state nor the clock probe can
    // detect it - a suspend()/resume() pair is the only known cure, so a genuine hidden->visible
    // transition earns one unconditionally.
    const context = fakeContext('running');
    const provider = providerWith(context);
    await provider.ensureRunning();
    provider.installLifecycleRecovery();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await provider.recoverAudioContext();

    expect(context.suspend).toHaveBeenCalled();
    expect(context.state).toBe('running');
    provider.destroy();
  });

  it('does not cycle the renderer without one', async () => {
    // Every ordinary play request would otherwise pay for a renderer stop/start.
    const context = fakeContext('running');
    const provider = providerWith(context);

    await provider.ensureRunning();
    await provider.ensureRunning();

    expect(context.suspend).not.toHaveBeenCalled();
  });

  it('does not treat the initial pageshow as a background restore', async () => {
    // pageshow fires on normal navigation as well as bfcache restoration. Cycling here makes the
    // first iOS unlock gesture resume, suspend and resume a context which was never backgrounded.
    const context = fakeContext('running');
    const provider = providerWith(context);
    provider.installLifecycleRecovery();
    const pageShow = new Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: false });

    window.dispatchEvent(pageShow);
    await provider.recoverAudioContext();

    expect(context.suspend).not.toHaveBeenCalled();
    provider.destroy();
  });

  it('still cycles for a persisted bfcache pageshow', async () => {
    const context = fakeContext('running');
    const provider = providerWith(context);
    provider.installLifecycleRecovery();
    const pageShow = new Event('pageshow');
    Object.defineProperty(pageShow, 'persisted', { value: true });

    window.dispatchEvent(pageShow);
    await provider.recoverAudioContext();

    expect(context.suspend).toHaveBeenCalledOnce();
    expect(context.state).toBe('running');
    provider.destroy();
  });

  it('retains the cycle debt when suspend/resume did not complete', async () => {
    // The clock still advances in WebKit 276687, so losing this bit after a failed suspend would
    // make the ordinary clock probe certify silent output as healthy.
    const context = fakeContext('running');
    const provider = providerWith(context);
    provider.installLifecycleRecovery();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const workingSuspend = context.suspend;
    context.suspend = vi.fn().mockRejectedValue(new Error('activation required'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(provider.ensureRunning()).rejects.toThrow(/could not be restarted/);

    // A later activated attempt receives the same debt and actually performs the cycle.
    context.suspend = workingSuspend;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await expect(provider.ensureRunning()).resolves.toBe(context);
    expect(workingSuspend).toHaveBeenCalledOnce();
    provider.destroy();
    warn.mockRestore();
  });
});

describe('a context that could not be repaired', () => {
  it('reports failure rather than handing back a frozen clock', async () => {
    // The rebuild rung is inside its cooldown, so nothing else can be tried. Resolving here
    // would hand a caller a `running` context whose currentTime never arrives.
    const context = fakeContext('running', { clockFrozen: true });
    context.suspend = vi.fn(async () => context.setState('suspended'));
    const provider = providerWith(context);
    // No window.AudioContext stub in this file, so the rebuild rung cannot build a replacement.
    context.setState('interrupted');
    context.setState('running');

    await expect(provider.ensureRunning()).rejects.toThrow(/clock is not advancing/);
  });
});

describe('a forced cycle that cannot complete', () => {
  it('escalates to the rebuild rung instead of stranding the context', async () => {
    // The reachable shape of this: resume() never settles (WebKit 281566) on exactly the
    // post-background path the cycle is armed for. suspend() has already succeeded by then, so
    // the context is left SUSPENDED - and a later walk skips the cycle block on its state gate.
    // Throwing here would put the one repair that can fix this context permanently out of reach.
    const context = fakeContext('running');
    context.resume = vi.fn(() => new Promise<void>(() => {}));
    const replacement = fakeContext('running');
    const built: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })));
    vi.stubGlobal('MediaRecorder', class {
      state = 'inactive';
      start() {}
      stop() {}
      addEventListener() {}
    });
    vi.stubGlobal('AudioContext', function () {
      built.push(replacement);
      return replacement;
    });
    window.AudioContext = globalThis.AudioContext as never;

    const provider = providerWith(context);
    await provider.ensureRunning().catch(() => {});
    provider.installLifecycleRecovery();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    const live = await provider.ensureRunning();

    expect(context.suspend).toHaveBeenCalled();
    expect(built).toHaveLength(1);
    expect(live).toBe(replacement);
    provider.destroy();
    vi.unstubAllGlobals();
  });

  it('reports failure when no replacement can be built either', async () => {
    // Cooldown or a hostile environment: nothing left to try, and resolving would hand back a
    // context whose renderer was never restarted.
    const context = fakeContext('running');
    context.resume = vi.fn(() => new Promise<void>(() => {}));
    const provider = providerWith(context);
    provider.installLifecycleRecovery();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    await expect(provider.ensureRunning()).rejects.toThrow(/could not be restarted/);
    provider.destroy();
  });
});
