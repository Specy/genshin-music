// The one output stage every audible path ends in: a limiter in front of the destination.
//
// Web Audio sums in floating point and only clamps at the destination, so a dense passage never
// clips INSIDE the graph, only on the way out. One limiter there covers every instrument, voice
// and the reverb return however many notes are sounding, which is what lets each instrument keep
// only a little headroom (Instrument's FULL_VOLUME_GAIN) instead of being turned down for the
// worst case.
//
//   input -> DynamicsCompressor -> makeup cancel -> soft clip -> output -> fader -> destination
//
// - The compressor does the limiting. Measured in Chromium (2026-10-23) on a dense Lyre stream
//   driven 12 dB past a level that already clips: not one sample over full scale. The attack is
//   what decides that - the spec's 3 ms default lets every transient through.
// - The spec has the compressor apply its own makeup gain, (1 / fullRangeGain) ^ 0.6, which
//   would make everything louder whether or not it is limiting. A fixed gain cancels it, so audio
//   below the threshold passes through unchanged.
// - A stock compressor is not a brickwall: driven a further 6 dB, its transients still overshoot
//   by about a dB. The soft clip takes what is left, and is an identity below SOFT_CLIP_KNEE.
// - The fader sits at unity except around a renderer restart (see fadeMasterBus). It is past
//   `output`, so a recording tapping the bus never captures that dip.
//
// Stock nodes rather than an AudioWorklet, deliberately: the bus carries every sound the app
// makes, so it has to exist synchronously with its context and survive the iOS recovery ladder,
// and a worklet is an async per-context install that is one more thing to fail there.
//
// The compressor delays everything by its fixed ~6 ms lookahead, which is the price of seeing a
// transient before it passes.

const THRESHOLD_DB = -3;
const RATIO = 20;
const ATTACK_S = 0.001;
const RELEASE_S = 0.15;
/** Linear level the soft clip starts bending at; below it the curve is an exact identity. */
const SOFT_CLIP_KNEE = 0.9;
/** Input span the soft clip curve covers (+12 dBFS); a power of two, so the scaling is exact. */
const SOFT_CLIP_RANGE = 4;
/** Odd, so an input of exactly 0 lands on a curve point instead of between two. */
const SOFT_CLIP_POINTS = 2 ** 12 + 1;

/**
 * Audio time a freshly built bus needs before it passes sound untouched. The compressor starts
 * from a reset state that reads as full gain reduction and releases out of it like any other
 * duck, so a note on the very first frame came out up to 19 dB down for ~150 ms (measured in
 * Chromium, 2026-10-23); 200 ms of silence first was enough. Live playback never meets it - the
 * bus is built long before the first note - but an offline render starts its song on frame 0,
 * so OfflineSongRenderer leads in by this much and cuts it off again.
 */
export const MASTER_BUS_WARMUP_S = 0.25;

/** The compressor's level at 0 dBFS in, which is what the spec derives its makeup gain from. */
const FULL_RANGE_GAIN_DB = THRESHOLD_DB - THRESHOLD_DB / RATIO;
const MAKEUP_CANCEL = 10 ** ((0.6 * FULL_RANGE_GAIN_DB) / 20);

/**
 * How long fadeMasterBus takes, in s. Long enough that cutting a waveform this way is no longer a
 * click, short enough that the dip it leaves reads as one.
 */
export const MASTER_BUS_FADE_S = 0.02;

export type MasterBus = {
  /** What audible paths connect to. */
  input: AudioNode;
  /** Already wired to the destination; a recorder taps it to capture what the speakers get. */
  output: AudioNode;
};

const buses = new WeakMap<BaseAudioContext, MasterBus & { fader: GainNode }>();
let softClipCurve: Float32Array<ArrayBuffer> | null = null;

/**
 * The master bus of `context`, built on first use. One per context, so a rebuilt live context
 * and every offline render each get their own while sharing exactly the same settings.
 */
export function masterBusOf(context: BaseAudioContext): MasterBus {
  const existing = buses.get(context);
  if (existing) return existing;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = THRESHOLD_DB;
  compressor.knee.value = 0;
  compressor.ratio.value = RATIO;
  compressor.attack.value = ATTACK_S;
  compressor.release.value = RELEASE_S;
  // A WaveShaper reads its input as [-1, 1] and clamps outside it, so it is fed scaled down and
  // its curve scales back up - folded into the makeup cancel rather than costing another node.
  const scale = context.createGain();
  scale.gain.value = MAKEUP_CANCEL / SOFT_CLIP_RANGE;
  const softClip = context.createWaveShaper();
  softClip.curve = softClipCurve ??= buildSoftClipCurve();
  const fader = context.createGain();

  compressor.connect(scale);
  scale.connect(softClip);
  softClip.connect(fader);
  fader.connect(context.destination);
  const bus = { input: compressor, output: softClip, fader };
  buses.set(context, bus);
  return bus;
}

/**
 * Fade what the speakers get from `context` out to silence, or back in from it, over
 * MASTER_BUS_FADE_S of audio time. Returns false when the context has no bus yet, which means it
 * has nothing audible to fade.
 *
 * For AudioProvider's renderer restart: suspend() stops the output mid-waveform and resume()
 * starts it again the same way, and each of those is a click. Fading in always starts from
 * silence rather than from the gain's current value, so it also covers a context that was not
 * rendering when the fade out was scheduled and so never played it.
 */
export function fadeMasterBus(context: BaseAudioContext, direction: 'out' | 'in'): boolean {
  const gain = buses.get(context)?.fader.gain;
  if (!gain) return false;
  const now = context.currentTime;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(direction === 'out' ? gain.value : 0, now);
  gain.linearRampToValueAtTime(direction === 'out' ? 0 : 1, now + MASTER_BUS_FADE_S);
  return true;
}

/**
 * Identity up to the knee, then a tanh bend that meets it with slope 1 and saturates at full
 * scale, never past it. Far enough out the tanh rounds to exactly 1 in float32, so the ends are
 * flat - which only input already ~2 dB over full scale AFTER the compressor ever reaches.
 */
function buildSoftClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(SOFT_CLIP_POINTS);
  const headroom = 1 - SOFT_CLIP_KNEE;
  for (let i = 0; i < SOFT_CLIP_POINTS; i++) {
    const x = ((2 * i) / (SOFT_CLIP_POINTS - 1) - 1) * SOFT_CLIP_RANGE;
    const magnitude = Math.abs(x);
    curve[i] =
      magnitude <= SOFT_CLIP_KNEE
        ? x
        : Math.sign(x) *
          (SOFT_CLIP_KNEE + headroom * Math.tanh((magnitude - SOFT_CLIP_KNEE) / headroom));
  }
  return curve;
}
