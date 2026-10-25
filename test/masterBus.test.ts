// The master bus (MasterBus.ts): the limiter every audible path ends in. jsdom has no Web Audio,
// so what is held here is the wiring and the numbers; how the real compressor behaves on real
// samples was measured in Chromium and is recorded in that file's header.
import { describe, expect, it, vi } from 'vitest';
import { fadeMasterBus, MASTER_BUS_FADE_S, masterBusOf } from '../src/lib/audio/MasterBus';

function fakeContext() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const context = {
    currentTime: 0,
    destination: node(),
    createDynamicsCompressor: vi.fn(() => ({
      ...node(),
      threshold: { value: -24 },
      knee: { value: 30 },
      ratio: { value: 12 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
    })),
    createGain: vi.fn(() => ({
      ...node(),
      gain: {
        value: 1,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
    })),
    createWaveShaper: vi.fn(() => ({ ...node(), curve: null as Float32Array | null })),
  };
  return context;
}

function busOf(context: ReturnType<typeof fakeContext>) {
  const bus = masterBusOf(context as unknown as BaseAudioContext);
  const compressor = context.createDynamicsCompressor.mock.results[0].value;
  const scale = context.createGain.mock.results[0].value;
  const softClip = context.createWaveShaper.mock.results[0].value;
  const fader = context.createGain.mock.results[1].value;
  return { bus, compressor, scale, softClip, fader };
}

/** What the soft clip outputs for `x`, read the way a WaveShaperNode reads its curve. */
function shape(curve: Float32Array, scaleGain: number, x: number) {
  const u = Math.max(-1, Math.min(1, x * scaleGain));
  const v = ((curve.length - 1) / 2) * (u + 1);
  const k = Math.min(curve.length - 2, Math.floor(v));
  const f = v - k;
  return (1 - f) * curve[k] + f * curve[k + 1];
}

describe('masterBusOf', () => {
  it('builds one bus per context and wires compressor -> scale -> soft clip -> fader -> destination', () => {
    const context = fakeContext();
    const { bus, compressor, scale, softClip, fader } = busOf(context);
    expect(masterBusOf(context as unknown as BaseAudioContext)).toBe(bus);
    expect(context.createDynamicsCompressor).toHaveBeenCalledOnce();
    expect(bus.input).toBe(compressor);
    expect(bus.output).toBe(softClip);
    expect(compressor.connect).toHaveBeenCalledWith(scale);
    expect(scale.connect).toHaveBeenCalledWith(softClip);
    expect(softClip.connect).toHaveBeenCalledWith(fader);
    expect(fader.connect).toHaveBeenCalledWith(context.destination);
    expect(fader.gain.value).toBe(1);

    const other = fakeContext();
    expect(masterBusOf(other as unknown as BaseAudioContext)).not.toBe(bus);
  });

  it('limits hard and fast: no knee, the maximum ratio, and an attack under the 3 ms default', () => {
    const { compressor } = busOf(fakeContext());
    expect(compressor.knee.value).toBe(0);
    expect(compressor.ratio.value).toBe(20);
    expect(compressor.attack.value).toBeLessThan(0.003);
    expect(compressor.threshold.value).toBeLessThan(0);
  });

  /**
   * The bus from the compressor onwards, fed the level the compressor produces BEFORE the spec's
   * automatic makeup gain, (1 / fullRangeGain) ^ 0.6, which the real node then multiplies in.
   */
  function afterCompressor() {
    const { compressor, scale, softClip } = busOf(fakeContext());
    const threshold = compressor.threshold.value;
    const fullRangeDb = threshold - threshold / compressor.ratio.value;
    const makeup = (1 / 10 ** (fullRangeDb / 20)) ** 0.6;
    return (x: number) => shape(softClip.curve!, scale.gain.value, x * makeup);
  }

  it("cancels the spec's automatic makeup gain, so audio below the knee passes unchanged", () => {
    const bus = afterCompressor();
    for (const x of [0, 0.01, -0.25, 0.5, -0.6, 0.85, -0.85]) expect(bus(x)).toBeCloseTo(x, 6);
  });

  it('bends what the compressor lets through and never goes past full scale', () => {
    const bus = afterCompressor();
    // The overshoot a stock compressor still lets past at extreme overload is about a dB.
    const overshoot = 10 ** (1 / 20);
    expect(bus(overshoot)).toBeLessThan(1);
    expect(bus(overshoot)).toBeGreaterThan(bus(1));
    expect(bus(1)).toBeLessThan(1);
    expect(bus(1)).toBeGreaterThan(0.9);
    expect(bus(-overshoot)).toBeCloseTo(-bus(overshoot), 6);
    expect(Math.abs(bus(100))).toBeLessThanOrEqual(1);
    expect(Math.abs(bus(-100))).toBeLessThanOrEqual(1);
  });

  it('builds a monotonic curve with an exact zero at its centre', () => {
    const { softClip } = busOf(fakeContext());
    const curve: Float32Array = softClip.curve!;
    expect(curve.length % 2).toBe(1);
    expect(curve[(curve.length - 1) / 2]).toBe(0);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      expect(Math.abs(curve[i])).toBeLessThanOrEqual(1);
    }
  });
});

describe('fadeMasterBus', () => {
  it('fades the speakers out from where the gain is, and back in from silence', () => {
    const context = fakeContext();
    const { fader } = busOf(context);
    const gain = fader.gain;
    context.currentTime = 2;
    gain.value = 0.7;

    expect(fadeMasterBus(context as unknown as BaseAudioContext, 'out')).toBe(true);
    expect(gain.cancelScheduledValues).toHaveBeenLastCalledWith(2);
    expect(gain.setValueAtTime).toHaveBeenLastCalledWith(0.7, 2);
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 2 + MASTER_BUS_FADE_S);

    // A context that was not rendering never played the fade out, so the gain may still read
    // full: fading in must not start from there.
    context.currentTime = 3;
    fadeMasterBus(context as unknown as BaseAudioContext, 'in');
    expect(gain.cancelScheduledValues).toHaveBeenLastCalledWith(3);
    expect(gain.setValueAtTime).toHaveBeenLastCalledWith(0, 3);
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 3 + MASTER_BUS_FADE_S);
  });

  it('leaves a context without a bus alone, and never builds one', () => {
    const context = fakeContext();
    expect(fadeMasterBus(context as unknown as BaseAudioContext, 'out')).toBe(false);
    expect(context.createGain).not.toHaveBeenCalled();
  });
});
