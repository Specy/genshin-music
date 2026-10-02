// Pre-rendered crossfade looping for sustained instruments. AudioBufferSourceNode
// loops by jumping loopEnd -> loopStart with no smoothing, so any mismatch in level
// or phase at the two points clicks on every wrap. The standard sampler fix (SFZ's
// loop_crossfade opcode, Kontakt's baked x-fades) blends the audio approaching
// loopEnd with the audio approaching loopStart so the wrap lands on content that
// already flows into the loop start. Rendering it into the decoded buffer once at
// load makes every wrap seamless at zero per-voice cost, and keeps hand-tuned loop
// points "good enough" instead of "sample-exact" — the practical requirement for
// using found/recorded open-source samples.

import type { LoopRegion } from '$lib/games/types';

/** Default pre-rendered loop-boundary crossfade (seconds) when sustain.loopCrossfade is unset. */
export const DEFAULT_LOOP_CROSSFADE_S = 0.05;

/**
 * Blend the last `seconds` before loop.end toward the matching audio before
 * loop.start (equal-power), in place. After it, the sample at loop.end - 1 equals
 * the sample at loop.start - 1, so the wrap continues the signal's own motion.
 * The first pass through [loop.end - seconds, loop.end) plays the blended audio
 * too — a mix of two nearby stretches of the same sustain, inaudible in practice.
 *
 * No-ops (rather than throwing) when the region can't support the fade: the blend
 * source range must exist before loop.start and must not overlap the written range.
 */
export function crossfadeLoopRegion(
  channel: Float32Array,
  sampleRate: number,
  loop: LoopRegion,
  seconds: number
): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  if (!Number.isFinite(loop.start) || !Number.isFinite(loop.end)) return;
  const startIdx = Math.round(loop.start * sampleRate);
  const endIdx = Math.round(loop.end * sampleRate);
  if (startIdx < 0 || endIdx <= startIdx || endIdx > channel.length) return;
  const n = Math.min(Math.round(seconds * sampleRate), startIdx, endIdx - startIdx);
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    // equal-power: keeps perceived level constant while the two stretches blend
    const w = ((i + 1) / n) * (Math.PI / 2);
    const dst = endIdx - n + i;
    const src = startIdx - n + i;
    channel[dst] = channel[dst] * Math.cos(w) + channel[src] * Math.sin(w);
  }
}
