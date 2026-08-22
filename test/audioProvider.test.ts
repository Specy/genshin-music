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
