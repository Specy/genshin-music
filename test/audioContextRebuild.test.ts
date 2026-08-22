// The rebuild rung of AudioProvider's iOS recovery ladder (see that file's header): replacing the
// shared AudioContext outright and re-homing every engine onto it.
//
// jsdom has no Web Audio at all, so every context here is a stand-in - which is the same reason
// test/audioModels.test.ts never calls `.load()`. What is under test is the ORDER and the
// BOOKKEEPING of the rebuild (teardown before close, buffers re-decoded, routing carried across
// by owner rather than by node), none of which needs a real renderer to be wrong.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioProviderClass } from '../src/lib/providers/AudioProvider';
import { Instrument } from '../src/lib/audio/Instrument.svelte';
import { INSTRUMENTS } from './imports';

const FAST = { callTimeoutMs: 50, interruptionWaitMs: 20, statePollMs: 2, clockProbeMs: 2 };

type FakeState = 'suspended' | 'running' | 'interrupted' | 'closed';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
}

function fakeContext(initial: FakeState = 'suspended', options: { clockFrozen?: boolean } = {}) {
  const listeners = new Set<() => void>();
  let time = 0;
  const context = {
    state: initial as FakeState,
    sampleRate: 44100,
    destination: fakeNode(),
    closed: false,
    get currentTime() {
      if (!options.clockFrozen) time += 0.01;
      return time;
    },
    resume: vi.fn(async () => context.setState('running')),
    suspend: vi.fn(async () => {
      context.setState('suspended');
    }),
    close: vi.fn(async () => {
      context.closed = true;
      context.setState('closed');
    }),
    createGain: vi.fn(() => fakeNode()),
    createConvolver: vi.fn(() => ({ ...fakeNode(), buffer: null })),
    createMediaStreamDestination: vi.fn(() => ({ ...fakeNode(), stream: {} })),
    createBuffer: vi.fn((channels: number) => ({
      numberOfChannels: channels,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(128),
    })),
    decodeAudioData: vi.fn((_buffer: ArrayBuffer, success?: (b: unknown) => void) => {
      const decoded = { numberOfChannels: 2, sampleRate: 44100, getChannelData: () => new Float32Array(128) };
      success?.(decoded);
      return Promise.resolve(decoded);
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

type FakeContext = ReturnType<typeof fakeContext>;

/** Contexts the provider builds for itself, newest last. */
let built: FakeContext[] = [];

beforeEach(() => {
  built = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }))
  );
  // AudioRecorder reaches for one of these in its constructor; without a stand-in it takes the
  // polyfill branch and throws before the rebuild under test gets anywhere.
  vi.stubGlobal(
    'MediaRecorder',
    class {
      start() {}
      stop() {}
      addEventListener() {}
    }
  );
  vi.stubGlobal(
    'AudioContext',
    function AudioContextStub() {
      const context = fakeContext('suspended');
      built.push(context);
      return context;
    }
  );
  window.AudioContext = globalThis.AudioContext;
});

afterEach(() => {
  Instrument.clearPool();
  vi.unstubAllGlobals();
});

async function loadedInstrument(context: FakeContext) {
  const instrument = new Instrument(INSTRUMENTS[0]);
  await instrument.load(context as unknown as BaseAudioContext);
  return instrument;
}

describe('Instrument live registry', () => {
  it('registers an engine loaded against a live context and drops it on dispose', async () => {
    const instrument = await loadedInstrument(fakeContext('running'));
    expect(Instrument.liveInstruments()).toContain(instrument);
    instrument.dispose();
    expect(Instrument.liveInstruments()).not.toContain(instrument);
  });

  it('never registers an offline render engine', async () => {
    // An export renders on a throwaway OfflineAudioContext and finishes long before anything
    // could rebuild it; re-homing one mid-render would corrupt the render.
    const offline = { ...fakeContext('running'), startRendering: vi.fn() };
    const instrument = await loadedInstrument(offline as unknown as FakeContext);
    expect(Instrument.liveInstruments()).not.toContain(instrument);
    instrument.dispose();
  });

  it('carries the engine volume across a re-home', async () => {
    // load() always resets a fresh gain node to its 0.8 default, and a rebuild has no roster to
    // re-apply volumes from - so a muted layer would come back audible.
    const instrument = await loadedInstrument(fakeContext('running'));
    instrument.changeVolume(20);
    const before = instrument.endNode!.gain.value;

    const replacement = fakeContext('running');
    await instrument.rehome(replacement as unknown as BaseAudioContext);

    expect(instrument.endNode).not.toBe(null);
    expect(instrument.endNode!.gain.value).toBe(before);
    expect(instrument.isDeleted).toBe(false);
    expect(Instrument.liveInstruments()).toContain(instrument);
    instrument.dispose();
  });

  it('carries the volume even when the detach happened in an earlier pass', async () => {
    // The sequence rebuildContext actually runs: every engine is detached up front, while the
    // outgoing context can still be torn down safely, and re-homed only once the replacement
    // exists. Reading the level at re-home time finds no node and silently restores the 0.8
    // default - which is what a rehome()-only test does not notice.
    const instrument = await loadedInstrument(fakeContext('running'));
    instrument.changeVolume(20);
    const before = instrument.endNode!.gain.value;

    instrument.detachFromContext();
    expect(instrument.endNode).toBe(null);
    await instrument.rehome(fakeContext('running') as unknown as BaseAudioContext);

    expect(instrument.endNode!.gain.value).toBe(before);
    instrument.dispose();
  });
});

describe('AudioProvider.rebuildContext', () => {
  it('replaces the context, re-homes engines and restores their routing', async () => {
    const original = fakeContext('running');
    const provider = new AudioProviderClass(FAST);
    provider.audioContext = original as unknown as AudioContext;
    const instrument = await loadedInstrument(original);
    instrument.changeVolume(20);
    const quietened = instrument.endNode!.gain.value;
    const originalNode = instrument.endNode;
    // Routed dry while the default is wet: the rebuild must carry the per-node override, not
    // just reconnect everything to the current default.
    provider.setReverb(true);
    provider.connect(originalNode, false);

    const rebuilt = await provider.rebuildContext();

    expect(rebuilt).not.toBe(null);
    expect(rebuilt).toBe(built.at(-1));
    expect(original.close).toHaveBeenCalled();
    // A new gain node on the new context - the old one belonged to a context now closed.
    expect(instrument.endNode).not.toBe(originalNode);
    expect(instrument.isLoaded).toBe(true);
    const entry = provider.nodes.find((n) => n.node === instrument.endNode);
    expect(entry?.to).toBe('end');
    // End to end through the real two-pass sequence, not rehome() in isolation.
    expect(instrument.endNode!.gain.value).toBe(quietened);
    instrument.dispose();
  });

  it('tears subscribers down before the close and rebuilds them after', async () => {
    // Stopping a committed beat throws on a closed context, so the metronome's teardown has to
    // land while the outgoing context is still open.
    const original = fakeContext('running');
    const provider = new AudioProviderClass(FAST);
    provider.audioContext = original as unknown as AudioContext;
    const order: string[] = [];
    provider.onContextTeardown(() => order.push(original.closed ? 'teardown-after-close' : 'teardown'));
    provider.onContextRebuilt(() => order.push(original.closed ? 'rebuilt' : 'rebuilt-before-close'));

    await provider.rebuildContext();

    expect(order).toEqual(['teardown', 'rebuilt']);
  });

  it('re-decodes pooled buffers, which belonged to the closed context', async () => {
    const original = fakeContext('running');
    const provider = new AudioProviderClass(FAST);
    provider.audioContext = original as unknown as AudioContext;
    const instrument = await loadedInstrument(original);
    provider.connect(instrument.endNode, null);
    const decodedBefore = original.decodeAudioData.mock.calls.length;

    await provider.rebuildContext();

    const replacement = built.at(-1)!;
    // Not served from the pool: an AudioBuffer belongs to the context that decoded it.
    expect(replacement.decodeAudioData.mock.calls.length).toBeGreaterThan(0);
    expect(decodedBefore).toBeGreaterThan(0);
    expect(instrument.buffers.length).toBeGreaterThan(0);
    instrument.dispose();
  });

  it('refuses a second rebuild inside the cooldown', async () => {
    // A replacement born broken means the fault is environmental; a third context will not help,
    // and each attempt re-decodes every sample in the app.
    const provider = new AudioProviderClass(FAST);
    provider.audioContext = fakeContext('running') as unknown as AudioContext;

    expect(await provider.rebuildContext()).not.toBe(null);
    expect(await provider.rebuildContext()).toBe(null);
    expect(built.length).toBe(1);
  });

  it('does nothing when there is no context to replace', async () => {
    const provider = new AudioProviderClass(FAST);
    expect(await provider.rebuildContext()).toBe(null);
  });
});

describe('the ladder escalating to a rebuild', () => {
  it('rebuilds when a renderer restart leaves the clock frozen', async () => {
    // The residue WebKit 263627's suspend()/resume() workaround cannot reach: commonly a sample
    // rate that changed under us while the page was away.
    const original = fakeContext('running', { clockFrozen: true });
    const provider = new AudioProviderClass(FAST);
    provider.audioContext = original as unknown as AudioContext;
    provider.observeContext(provider.audioContext);
    original.setState('interrupted');
    original.setState('running');

    const live = await provider.ensureRunning();

    expect(original.suspend).toHaveBeenCalled();
    expect(original.close).toHaveBeenCalled();
    expect(live).toBe(built.at(-1));
    expect(live.state).toBe('running');
  });

  it('leaves a healthy context alone', async () => {
    const original = fakeContext('running');
    const provider = new AudioProviderClass(FAST);
    provider.audioContext = original as unknown as AudioContext;
    provider.observeContext(provider.audioContext);
    original.setState('interrupted');
    original.setState('running');

    await expect(provider.ensureRunning()).resolves.toBe(original);
    expect(original.close).not.toHaveBeenCalled();
    expect(built.length).toBe(0);
  });
});
