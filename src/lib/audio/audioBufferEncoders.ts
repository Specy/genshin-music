// Turn a rendered AudioBuffer into a downloadable file, through mediabunny.
//
// Every `import('mediabunny')` below sits INSIDE the function rather than at module scope: the
// muxers (and the mp3 encoder's LAME port) are only ever needed once a user has actually asked
// for a file, so a dynamic import keeps them in their own lazy chunk instead of on the critical
// path of every page load.

import type { AudioBufferSource, BufferTarget, Output, OutputFormat } from 'mediabunny';

/** 320 kbps: the top of the mp3 rate range, chosen so an export is not the lossy step. */
const MP3_BITRATE = 320e3;

/**
 * Latched, not re-asked per export: `registerMp3Encoder` installs a fallback encoder into
 * mediabunny's global registry, and doing that twice re-downloads nothing but does re-run the
 * registration for no gain. A failure is deliberately NOT latched, so the next export can retry.
 */
let mp3EncoderReady: Promise<void> | null = null;

async function ensureMp3Encoder(): Promise<void> {
  if (!mp3EncoderReady) {
    const registration = (async () => {
      const { canEncodeAudio } = await import('mediabunny');
      // A browser that encodes mp3 natively (WebCodecs) needs no polyfill, and registering one
      // anyway would replace that path with a JS implementation.
      if (await canEncodeAudio('mp3')) return;
      const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder');
      registerMp3Encoder();
    })();
    registration.catch(() => {
      mp3EncoderReady = null;
    });
    mp3EncoderReady = registration;
  }
  return mp3EncoderReady;
}

/**
 * The shape both encoders share: one audio track, one buffer, finalize, read the target. The
 * buffer is added after `start()` and the source closed before `finalize()` — that order is what
 * mediabunny's Output state machine accepts.
 */
async function encodeToBlob(
  output: Output<OutputFormat, BufferTarget>,
  source: AudioBufferSource,
  buffer: AudioBuffer,
  mimeType: string
): Promise<Blob> {
  output.addAudioTrack(source);
  await output.start();
  await source.add(buffer);
  source.close();
  await output.finalize();
  const encoded = output.target.buffer;
  // `BufferTarget.buffer` is typed nullable because it is only filled once the output finalizes;
  // a null here after the await would mean the muxer wrote nothing, which is a failure, not a
  // zero-length file.
  if (!encoded) throw new Error(`mediabunny finalized a ${mimeType} output with no buffer`);
  return new Blob([encoded], { type: mimeType });
}

export async function audioBufferToWavBlob(buffer: AudioBuffer): Promise<Blob> {
  const { AudioBufferSource, BufferTarget, Output, WavOutputFormat } = await import('mediabunny');
  return encodeToBlob(
    new Output({ format: new WavOutputFormat(), target: new BufferTarget() }),
    // 'pcm-s16' is mediabunny's id for 16-bit signed PCM: CD depth, which is what a .wav is
    // expected to be and what the offline render already produces at 44.1 kHz stereo.
    new AudioBufferSource({ codec: 'pcm-s16' }),
    buffer,
    'audio/wav'
  );
}

export async function audioBufferToMp3Blob(buffer: AudioBuffer): Promise<Blob> {
  await ensureMp3Encoder();
  const { AudioBufferSource, BufferTarget, Mp3OutputFormat, Output, Quality } =
    await import('mediabunny');
  return encodeToBlob(
    new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() }),
    // A Quality carrying an explicit bitrate, not the config's own `bitrate` field: that field
    // is deprecated in the installed mediabunny and forwards to exactly this.
    new AudioBufferSource({ codec: 'mp3', quality: new Quality({ bitrate: MP3_BITRATE }) }),
    buffer,
    'audio/mpeg'
  );
}
