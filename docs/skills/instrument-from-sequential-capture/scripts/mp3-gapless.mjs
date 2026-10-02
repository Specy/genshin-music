// Xing/Info gapless metadata for the MP3s this skill's tooling produces.
//
// `@breezystack/lamejs`'s Mp3Encoder emits bare audio frames and nothing else —
// no Xing/Info frame. That header is where an encoder records its lookahead, so
// without it a decoder cannot know to drop it and hands the lookahead back as
// leading silence: ENCDELAY (576) + DECDELAY (528) + 1 = 1105 samples = 25.06 ms
// at 44.1 kHz. Instrument.svelte.ts plays a decoded buffer from sample 0, so that
// silence is latency on every note attack.
//
// Prepending a correct Info frame fixes it without re-encoding — the audio frames
// stay byte-identical, and the decoder trims the lookahead itself. Verified
// against ffmpeg, Chromium's decodeAudioData and mpg123-decoder, which all agree.

// ------------------------------------------------------------------ constants
/** lamejs `Encoder.ENCDELAY` — samples of encoder lookahead ahead of sample 0. */
export const ENCDELAY = 576;
/** Every MP3 decoder adds this on top (lamejs `Encoder.DECDELAY` 528, + 1). */
export const DECDELAY = 529;
/** MPEG1 Layer III granule pair. */
export const SAMPLES_PER_FRAME = 1152;
/** What a decoder drops from the head once it can read the delay from the tag. */
export const TOTAL_DELAY = ENCDELAY + DECDELAY;

const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_L3_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MPEG1_RATES = [44100, 48000, 32000];
/** Version field: 0 = MPEG2.5, 2 = MPEG2, 3 = MPEG1 (1 is reserved). */
const RATES_BY_VERSION = { 0: [11025, 12000, 8000], 2: [22050, 24000, 16000], 3: MPEG1_RATES };
/** Side info is what sits between the header and the tag; 17 bytes for MPEG1 mono. */
const SIDE_INFO_MONO = 17;
/** "Info"/"Xing" + flags + frames + bytes + TOC — the LAME extension follows. */
const LAME_EXT_OFFSET = 4 + 4 + 4 + 4 + 100;
/** Offset of the packed 12-bit delay / 12-bit padding pair inside that extension. */
const DELAY_OFFSET = 21;

// -------------------------------------------------------------- frame walking
/** Byte length of an ID3v2 tag at the head of `buf`, or 0 when there is none. */
function id3Length(buf) {
  if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return 0;
  const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
  return 10 + size + (buf[5] & 0x10 ? 10 : 0);
}

/**
 * Walk the Layer III frames of `buf`. Only MPEG1 can be *written* here (that is
 * all lamejs emits), but every version is walked so the sky SFX samples — MPEG2
 * at 22.05 kHz, some behind an ID3v2 tag — are still read correctly rather than
 * looking like an untagged file that needs fixing.
 */
export function* mpegFrames(buf) {
  let i = id3Length(buf);
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const version = (buf[i + 1] >> 3) & 3;
    const layer = (buf[i + 1] >> 1) & 3; // 1 = Layer III
    const brIdx = (buf[i + 2] >> 4) & 0xf;
    const srIdx = (buf[i + 2] >> 2) & 3;
    const pad = (buf[i + 2] >> 1) & 1;
    if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 0xf || srIdx === 3) {
      i++;
      continue;
    }
    const mpeg1 = version === 3;
    const kbps = (mpeg1 ? MPEG1_L3_KBPS : MPEG2_L3_KBPS)[brIdx];
    const sampleRate = RATES_BY_VERSION[version][srIdx];
    const length = Math.floor(((mpeg1 ? 144 : 72) * kbps * 1000) / sampleRate) + pad;
    const mono = ((buf[i + 3] >> 6) & 3) === 3;
    yield {
      offset: i,
      length,
      mpeg1,
      mono,
      kbps,
      sampleRate,
      samples: mpeg1 ? SAMPLES_PER_FRAME : SAMPLES_PER_FRAME / 2,
      sideInfo: mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17,
    };
    i += length;
  }
}

/** True when `buf` already carries a Xing/Info frame, so tagging is a no-op. */
export function hasGaplessTag(buf) {
  const first = mpegFrames(buf).next();
  if (first.done) return false;
  const at = first.value.offset + 4 + first.value.sideInfo;
  const tag = buf.subarray(at, at + 4).toString('latin1');
  return tag === 'Xing' || tag === 'Info';
}

// ------------------------------------------------------------- frame building
/**
 * Build the silent leading frame that carries the Info tag. Everything outside
 * the header and the tag stays zero — zeroed side info decodes to silence, which
 * is what makes it safe for a decoder that ignores the tag to play this frame.
 */
function infoFrame({ frames, dataBytes, delay, padding, kbps, sampleRate }) {
  const brIdx = MPEG1_L3_KBPS.indexOf(kbps);
  const srIdx = MPEG1_RATES.indexOf(sampleRate);
  if (brIdx < 1) throw new Error(`unsupported MPEG1 Layer III bitrate: ${kbps} kbps`);
  if (srIdx < 0) throw new Error(`unsupported MPEG1 Layer III sample rate: ${sampleRate} Hz`);

  const length = Math.floor((144 * kbps * 1000) / sampleRate);
  const f = Buffer.alloc(length);
  // Same header the stream itself uses: MPEG1 Layer III, no CRC, mono, original.
  f[0] = 0xff;
  f[1] = 0xfb;
  f[2] = (brIdx << 4) | (srIdx << 2);
  f[3] = 0xc4;

  const tag = 4 + SIDE_INFO_MONO;
  f.write('Info', tag, 'latin1'); // "Info" rather than "Xing": this is CBR
  f.writeUInt32BE(0x0007, tag + 4); // flags: frame count | byte count | TOC
  f.writeUInt32BE(frames, tag + 8);
  f.writeUInt32BE(dataBytes + length, tag + 12);
  // TOC stays zeroed: seeking a one-shot instrument sample is not a thing, and a
  // decoder only consults it for VBR seeks.

  const ext = tag + LAME_EXT_OFFSET;
  f.write('LAME3.100', ext, 'latin1'); // decoders gate delay/padding on this string
  f[ext + 9] = 0x01; // tag revision 0, VBR method 1 = CBR
  f[ext + 20] = kbps > 255 ? 255 : kbps;
  f[ext + DELAY_OFFSET] = (delay >> 4) & 0xff;
  f[ext + DELAY_OFFSET + 1] = ((delay & 0xf) << 4) | ((padding >> 8) & 0xf);
  f[ext + DELAY_OFFSET + 2] = padding & 0xff;
  f.writeUInt32BE(dataBytes, ext + 28); // music length, tag frame excluded
  return f;
}

/**
 * Prepend a gapless Info frame to a bare lamejs bitstream.
 *
 * `pcmLength` is the sample count that went in; pass it and the decoder lands on
 * exactly those samples. Omit it (migrating a file whose source PCM is gone) and
 * the trailing padding is left at 0, which never truncates real audio — the tail
 * the encoder flushed is already inside the fade-out.
 *
 * Returns `buf` untouched when it is already tagged, so this is idempotent.
 */
export function withGaplessTag(buf, pcmLength = null, { kbps = 128, sampleRate = 44100 } = {}) {
  if (hasGaplessTag(buf)) return buf;
  let frames = 0;
  for (const f of mpegFrames(buf)) {
    if (!f.mpeg1) throw new Error('not an MPEG1 Layer III stream — nothing here writes those');
    frames++;
  }
  if (!frames) throw new Error('no Layer III frames found');

  // The two tag fields describe what the *encoder* added: delay + pcm + padding
  // fills the frames exactly. A decoder then drops delay + DECDELAY off the front
  // and padding - DECDELAY off the back, netting exactly the original samples —
  // so padding is measured against ENCDELAY alone, not TOTAL_DELAY.
  const decoded = frames * SAMPLES_PER_FRAME;
  const padding =
    pcmLength === null ? 0 : Math.max(0, Math.min(0xfff, decoded - pcmLength - ENCDELAY));
  const frame = infoFrame({
    frames,
    dataBytes: buf.length,
    delay: ENCDELAY,
    padding,
    kbps,
    sampleRate,
  });
  return Buffer.concat([frame, buf]);
}
