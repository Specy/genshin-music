// Trim the inaudible tail off a one-shot sample at load. A one-shot plays its whole buffer, and a
// sounding source costs render time until its last sample (about 2 ms of CPU per second of audio
// per voice, measured in Chromium 2026-10-23), so near-silence at the end of a file is paid for on
// every note. Some shipped samples carry plenty: at the gate below GrandPiano drops 30% of its
// length, Zither 19%, Old-Zither 15%, Lyre and Kalimba 12%.
//
// The cut must never be heard, and two rules see to it:
// - It only starts after the LAST sample, in any channel, that reaches TAIL_GATE_DB under the
//   sample's own peak. Per sample rather than an RMS window, so nothing dropped is louder than
//   the gate, and a late swell or second strike keeps everything up to it.
// - It never stops abruptly: the TAIL_FADE_S after that point fade out on a raised cosine, which
//   leaves and arrives with zero slope and ends on an exact zero.
// So the trimmed buffer differs from the original by at most the gate level, anywhere - which is
// also the loudest any click it could introduce can be.

/** How far under the sample's peak a tail counts as finished: the classic RT60 decay. */
export const TAIL_GATE_DB = -60;
/** Fade-out length after the last sample above the gate. */
export const TAIL_FADE_S = 0.1;

/**
 * Fade `channels` out after their last sample above the gate, in place, and return the length
 * the buffer should be cut to - or null when there is nothing to trim: silence (the placeholder
 * of a failed load), or a sample still above the gate within a fade of its end.
 */
export function trimSilentTail(channels: Float32Array[], sampleRate: number): number | null {
  const length = channels[0]?.length ?? 0;
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(channel[i]));
  }
  if (peak === 0) return null;
  const gate = peak * 10 ** (TAIL_GATE_DB / 20);
  let lastLoud = -1;
  for (const channel of channels) {
    for (let i = length - 1; i > lastLoud; i--) {
      if (Math.abs(channel[i]) >= gate) {
        lastLoud = i;
        break;
      }
    }
  }
  const fade = Math.round(TAIL_FADE_S * sampleRate);
  const cut = lastLoud + 1 + fade;
  if (fade <= 0 || cut >= length) return null;
  for (const channel of channels) {
    for (let i = 0; i < fade; i++) {
      // 1 just after the last loud sample, exactly 0 on the last one kept
      channel[lastLoud + 1 + i] *= 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / fade));
    }
  }
  return cut;
}
