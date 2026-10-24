// Tail trimming for one-shot samples (trimSilentTail.ts): pure Float32 DSP on real signals, like
// loopCrossfade.test.ts. What is held here is the promise the user asked for: the cut is never
// audible - nothing removed or faded is louder than the gate, and the sound never stops abruptly.
import { describe, expect, it } from 'vitest';
import { TAIL_FADE_S, TAIL_GATE_DB, trimSilentTail } from '../src/lib/audio/trimSilentTail';

const RATE = 48000;
const GATE = 10 ** (TAIL_GATE_DB / 20);
const FADE = Math.round(TAIL_FADE_S * RATE);

/** A plucked note: a sine decaying 30 dB per second, then `silenceS` of noise far under the gate. */
function pluck(seconds = 3, silenceS = 1, peak = 0.6) {
  const data = new Float32Array(Math.round((seconds + silenceS) * RATE));
  let seed = 1;
  for (let i = 0; i < data.length; i++) {
    const t = i / RATE;
    seed = (seed * 16807) % 2147483647;
    const noise = (seed / 2147483647 - 0.5) * peak * 1e-5;
    data[i] = t < seconds ? peak * 10 ** ((-30 * t) / 20) * Math.sin(2 * Math.PI * 440 * t) : noise;
  }
  return data;
}

/** The gate as the trim sees it: relative to the peak the samples actually reach. */
function gateOf(...channels: Float32Array[]) {
  let peak = 0;
  for (const channel of channels) for (const v of channel) peak = Math.max(peak, Math.abs(v));
  return peak * GATE;
}

function lastAbove(data: Float32Array, level: number) {
  for (let i = data.length - 1; i >= 0; i--) if (Math.abs(data[i]) >= level) return i;
  return -1;
}

describe('trimSilentTail', { timeout: 30_000 }, () => {
  it('cuts a decayed tail one fade after the last sample above the gate', () => {
    const data = pluck();
    const original = data.slice();
    const length = trimSilentTail([data], RATE);
    // 30 dB/s reaches -60 dB at 2 s, so roughly the last 2 s go
    expect(length).toBe(lastAbove(original, gateOf(original)) + 1 + FADE);
    expect(length! / RATE).toBeGreaterThan(1.9);
    expect(length! / RATE).toBeLessThan(2.2);
  });

  it('changes nothing by more than the gate level, anywhere: the bound on any click it could cause', () => {
    const data = pluck();
    const original = data.slice();
    const length = trimSilentTail([data], RATE)!;
    let worst = 0;
    // inside the kept buffer, faded samples differ from the original...
    for (let i = 0; i < length; i++) worst = Math.max(worst, Math.abs(data[i] - original[i]));
    // ...and everything past the cut is dropped outright
    for (let i = length; i < original.length; i++) worst = Math.max(worst, Math.abs(original[i]));
    expect(worst).toBeLessThan(0.6 * GATE);
  });

  it('leaves everything up to the last loud sample untouched and fades out to an exact zero', () => {
    const data = pluck();
    const original = data.slice();
    const length = trimSilentTail([data], RATE)!;
    const fadeStart = length - FADE;
    for (let i = 0; i < fadeStart; i++) expect(data[i]).toBe(original[i]);
    expect(Math.abs(data[length - 1])).toBe(0);
    // a fade, not a cut: never louder than the original, and its gain only ever falls
    let previousGain = 1;
    for (let i = fadeStart; i < length; i++) {
      expect(Math.abs(data[i])).toBeLessThanOrEqual(Math.abs(original[i]));
      if (original[i] !== 0) {
        const gain = data[i] / original[i];
        expect(gain).toBeLessThanOrEqual(previousGain + 1e-6);
        previousGain = gain;
      }
    }
  });

  it('keeps a late swell and everything before it', () => {
    const data = pluck();
    const swellAt = Math.round(3.5 * RATE);
    data[swellAt] = 0.6 * GATE * 2;
    const length = trimSilentTail([data], RATE);
    expect(length).toBe(swellAt + 1 + FADE);
  });

  it('cuts every channel at the same point, decided by whichever rings longest', () => {
    const left = pluck(1.5, 2.5);
    const right = pluck(3, 1);
    const gate = gateOf(left, right);
    const lastLoudRight = lastAbove(right, gate);
    expect(lastAbove(left, gate)).toBeLessThan(lastLoudRight);
    const length = trimSilentTail([left, right], RATE)!;
    expect(length).toBe(lastLoudRight + 1 + FADE);
    expect(Math.abs(left[length - 1])).toBe(0);
    expect(Math.abs(right[length - 1])).toBe(0);
  });

  it('is relative to the sample, so a quiet sample keeps its quiet tail', () => {
    const quiet = pluck(3, 1, 0.01);
    const loud = pluck(3, 1, 0.6);
    expect(trimSilentTail([quiet], RATE)).toBe(trimSilentTail([loud], RATE));
  });

  it('leaves silence and samples that ring to their last fade alone', () => {
    const silent = new Float32Array(RATE);
    expect(trimSilentTail([silent], RATE)).toBeNull();
    const ringing = pluck(1, 0);
    const original = ringing.slice();
    expect(trimSilentTail([ringing], RATE)).toBeNull();
    expect(ringing).toEqual(original);
    expect(trimSilentTail([], RATE)).toBeNull();
  });
});
