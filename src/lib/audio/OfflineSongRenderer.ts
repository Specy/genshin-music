// Render a RecordedSong to an AudioBuffer on an OfflineAudioContext, by rebuilding the SAME
// graph live playback builds and driving the SAME Instrument engine — one code path, so an
// export cannot drift from what the composer and the player sound like. A composed song is
// rendered as `composedSong.toRecordedSong(0)`: the caller passes the 0, because the default
// offset prepends 100 ms of leading silence to every note.
//
// Split in two on purpose: `planSongRender` is pure data (no audio at all) and answers every
// musical question — which tracks sound, at what Basepoint, whether a note presses or plays,
// where each one lands — while `renderSongToAudioBuffer` only builds nodes and schedules what
// the plan already decided. jsdom ships no OfflineAudioContext, so the planner is the half the
// test suite can hold, and it is the half that can be wrong about a song.

import { base } from '$app/paths';
import type { Pitch } from '$core/legacyConfig';
import type { RecordedSong } from '$core/Songs/RecordedSong';
import { isTrackAudible } from '$core/Songs/SongClasses';
import type { InstrumentName } from '$core/types';
import { fetchAudioBuffer, Instrument } from '$lib/audio/Instrument.svelte';

/** CD rate, stereo: what a downloadable wav is expected to be, and what the plan renders at. */
const SAMPLE_RATE = 44100;
const CHANNEL_COUNT = 2;
/** Reverb make-up gain — the same value the live provider puts between convolver and destination. */
const REVERB_GAIN = 2.5;
/** Slack over the computed tail, for the seams (crossfades, final safety fades) inside a Voice. */
const TAIL_MARGIN_S = 0.25;
/** Floor on any render, so an all-muted song still yields a valid (tiny, silent) buffer. */
const MIN_RENDER_S = 0.1;
/** Breathing room kept after the last audible sample, so a trim can never clip a decay. */
const TRIM_TAIL_S = 0.1;
/** ~-80 dBFS: below this a sample is dither-level, not sound. */
const SILENCE_THRESHOLD = 1e-4;
/** Song-time distance between render suspensions — the progress ticks, and the only cancel point. */
const PROGRESS_CHECKPOINT_S = 2;

/** Where a track's volume node lands, exactly as the live surfaces route it. */
export type RenderDestination = 'reverb' | 'end';

export type PlannedTrack = {
  trackIndex: number;
  instrument: InstrumentName;
  volume: number;
  /** Effective Basepoint: the track's own override, else the song's. */
  pitch: Pitch;
  /** Solo set + own Mute, derived over the whole roster; an inaudible track contributes no events. */
  audible: boolean;
  destination: RenderDestination;
};

export type PlannedEvent = {
  trackIndex: number;
  /** Note Number — absolute, Basepoint included, which is what the engine's API is keyed by. */
  id: number;
  /** Absolute context time in seconds. */
  atS: number;
  /** 'press' holds for `durationMs` then releases; 'play' is the one-shot/tap trigger. */
  kind: 'press' | 'play';
  /** Only on 'press': the RecordedNote's own duration, in the milliseconds the engine expects. */
  durationMs?: number;
};

export type SongRenderPlan = {
  sampleRate: number;
  channelCount: number;
  tracks: PlannedTrack[];
  events: PlannedEvent[];
  /** Seconds at which the last audible note stops being asked to sound (onset + duration). */
  lastNoteEndS: number;
  /** Some audible track routes to reverb — the executor builds the chain only then. */
  usesReverb: boolean;
};

/** The parts of the length bound that are unknown until the samples are decoded. */
export type RenderTailBounds = {
  /** Longest decoded sample held by an audible instrument. */
  maxBufferS: number;
  /** Longest note-off tail one can add after its release point: minLength floor + release fade. */
  maxReleaseS: number;
  /** Impulse-response length; counted only when the plan actually routes something to reverb. */
  irS: number;
};

/**
 * Everything the render needs to know about the song, and nothing about audio.
 *
 * The per-note branch is the live surfaces' own: a note with a duration on an instrument that
 * Sustains is a press with that duration, anything else is a plain trigger. `toRecordedSong`
 * writes duration 0 for a span-1 note (the pre-sustain one-shot behavior), so a composer tap
 * reaches the engine here as exactly the tap it is.
 *
 * A Note Number the track's instrument cannot voice at its Basepoint is a Stranded Note. It is
 * planned like any other and answered with silence by `pressNote`/`play`, which is what the
 * live surfaces do too — a second strandedness check here would be a second place to get the
 * rule wrong.
 */
export function planSongRender(song: RecordedSong): SongRenderPlan {
  const tracks: PlannedTrack[] = song.instruments.map((data, trackIndex) => ({
    trackIndex,
    instrument: data.name,
    volume: data.volume,
    pitch: data.pitch || song.pitch,
    audible: isTrackAudible(song.instruments, trackIndex),
    // `??`, never `||`: reverbOverride is a tri-state where `false` is a real answer (this
    // track dry inside a wet song), and only `null` means "follow the song".
    destination: (data.reverbOverride ?? song.reverb) ? 'reverb' : 'end',
  }));
  // Sustain is a capability read off config, and Instrument's constructor touches no audio —
  // so the plan asks the real engine what it would do rather than restating its rule here.
  const supportsSustain = tracks.map(
    (track) => track.audible && new Instrument(track.instrument).supportsSustain
  );
  const events: PlannedEvent[] = [];
  let lastNoteEndS = 0;
  for (const note of song.notes) {
    const track = tracks[note.trackIndex];
    // A note whose track has no roster entry sounds nowhere: a live surface indexes its loaded
    // engines by trackIndex and returns on a miss, so the render answers it the same way.
    if (!track?.audible) continue;
    const atS = note.time / 1000;
    events.push(
      note.duration > 0 && supportsSustain[note.trackIndex]
        ? {
            trackIndex: note.trackIndex,
            id: note.id,
            atS,
            kind: 'press',
            durationMs: note.duration,
          }
        : { trackIndex: note.trackIndex, id: note.id, atS, kind: 'play' }
    );
    lastNoteEndS = Math.max(lastNoteEndS, (note.time + note.duration) / 1000);
  }
  return {
    sampleRate: SAMPLE_RATE,
    channelCount: CHANNEL_COUNT,
    tracks,
    events,
    lastNoteEndS,
    usesReverb: tracks.some((track) => track.audible && track.destination === 'reverb'),
  };
}

/**
 * How long the render must be, in seconds — deliberately generous, and deliberately NOT a
 * re-derivation of Voice's envelopes. A non-sustaining trigger rings for the whole remaining
 * sample however short the note is, and a loop-sustain release plays the natural tail out, so
 * the honest bound is "the longest sample an audible instrument holds, plus the longest tail
 * its note-off can add". Overshooting costs nothing: `trimTrailingSilence` cuts the dead air
 * back off afterwards, which is what lets this stay a bound instead of a prediction.
 *
 * A Basepoint can only shorten a sample, never stretch it: `getPitchChanger` is 2^(n/12) over
 * a non-negative semitone count, so playback rate is at least 1.
 *
 * The impulse response counts only when something is actually routed through the convolver —
 * gated here rather than at the call site so a caller handing over a measured IR length for a
 * dry song cannot silently pay for a reverb tail that no node will produce.
 */
export function renderLengthS(plan: SongRenderPlan, bounds: RenderTailBounds): number {
  const lengthS =
    plan.lastNoteEndS +
    bounds.maxBufferS +
    bounds.maxReleaseS +
    (plan.usesReverb ? bounds.irS : 0) +
    TAIL_MARGIN_S;
  return Number.isFinite(lengthS) ? Math.max(MIN_RENDER_S, lengthS) : MIN_RENDER_S;
}

/** Rejection of a render the caller asked to stop; distinguishable from a real failure. */
export class SongRenderCancelledError extends Error {
  constructor() {
    super('Song render cancelled');
    this.name = 'SongRenderCancelledError';
  }
}

export type SongRenderOptions = {
  /** Fraction of song time rendered so far, 0..1; fired once more at 1 when the buffer is ready. */
  onProgress?: (fraction: number) => void;
  /**
   * AbortSignal rather than a bespoke handle: the UI's Cancel already has one shape for this,
   * and it composes with whatever else the calling page wants to tear down at the same time.
   */
  signal?: AbortSignal;
};

/**
 * Render `song` and hand back the trimmed buffer. Rejects with `SongRenderCancelledError` when
 * the signal aborts (see the checkpoint comment for what "cancel" can and cannot mean here).
 */
export async function renderSongToAudioBuffer(
  song: RecordedSong,
  options: SongRenderOptions = {}
): Promise<AudioBuffer> {
  const { onProgress, signal } = options;
  if (signal?.aborted) throw new SongRenderCancelledError();
  const plan = planSongRender(song);

  // The cancel machinery is armed before the first await, so a Cancel pressed during the
  // sample fetch is seen by the checks after each one rather than waiting for the render.
  let cancelled = false;
  let rejectCancelled: ((reason: unknown) => void) | null = null;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancelled = reject;
  });
  const onAbort = () => {
    cancelled = true;
    rejectCancelled?.(new SongRenderCancelledError());
  };
  // Defused immediately: until the Promise.race below subscribes, an abort during the load
  // phase would reject `cancellation` with no handler attached — control flow is already
  // covered by the `cancelled` checks, but the orphaned rejection would still fire the host's
  // unhandledrejection reporting. The race still observes the rejection; a promise can have
  // both consumers.
  cancellation.catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });
  /** Everything this render owns, so one teardown in the `finally` covers every exit path. */
  const owned: Instrument[] = [];

  try {
    // MEASURE PASS. An OfflineAudioContext's length is fixed at construction, but the tail
    // bound needs the decoded sample durations — so the samples are decoded first, on a
    // one-frame context that exists only to decode. Doing it twice is cheap by construction:
    // Instrument pools its decoded buffers by name and an AudioBuffer belongs to no context,
    // so the render pass below reuses these very buffers (and reuses the app's own, when a
    // live surface already loaded the instrument). Both contexts run at SAMPLE_RATE, which is
    // what makes that reuse sound right — decodeAudioData resamples to the context it
    // decoded on.
    const probe = new OfflineAudioContext(plan.channelCount, 1, plan.sampleRate);
    const probeInstruments = await loadPlannedInstruments(probe, plan, owned);
    const impulseResponse = plan.usesReverb
      ? await fetchAudioBuffer(`${base}/assets/audio/reverb4.wav`, probe).catch(() => null)
      : null;
    if (cancelled) throw new SongRenderCancelledError();
    const measured = [...probeInstruments.values()];
    const bounds: RenderTailBounds = {
      maxBufferS: measured.reduce(
        (longest, instrument) =>
          instrument.buffers.reduce((max, buffer) => Math.max(max, buffer.duration), longest),
        0
      ),
      // release and minLength are validated finite and non-negative where the game registry
      // normalizes an instrument's meta.json, so this sum needs no sanitizing of its own.
      maxReleaseS: measured.reduce((longest, instrument) => {
        const sustain = instrument.sustainConfig;
        return sustain ? Math.max(longest, (sustain.minLength ?? 0) + sustain.release) : longest;
      }, 0),
      irS: impulseResponse?.duration ?? 0,
    };

    const lengthS = renderLengthS(plan, bounds);
    const context = new OfflineAudioContext(
      plan.channelCount,
      Math.max(1, Math.ceil(lengthS * plan.sampleRate)),
      plan.sampleRate
    );
    const instruments = await loadPlannedInstruments(context, plan, owned);
    if (cancelled) throw new SongRenderCancelledError();

    // The live graph, rebuilt: one volume node per track, and one shared
    // ConvolverNode(IR) -> GainNode -> destination chain that reverb-routed tracks feed.
    let reverbInput: AudioNode | null = null;
    if (impulseResponse) {
      const convolver = context.createConvolver();
      convolver.buffer = impulseResponse;
      const reverbVolume = context.createGain();
      reverbVolume.gain.value = REVERB_GAIN;
      convolver.connect(reverbVolume);
      reverbVolume.connect(context.destination);
      reverbInput = convolver;
    }
    plan.tracks.forEach((track) => {
      // No convolver means the impulse response failed to load: a reverb-routed track still
      // sounds, dry, which is the fallback the live provider takes for the same reason.
      instruments
        .get(track.trackIndex)
        ?.connect(
          track.destination === 'reverb' && reverbInput ? reverbInput : context.destination
        );
    });

    // Every event is committed ahead of currentTime 0, so the render inherits the COMPOSER's
    // committed-playback semantics: Instrument skips both the same-button retrigger choke and
    // the 64-voice steal for a press scheduled ahead of now, and no note is silently dropped.
    // A dense song can therefore render FULLER than the live player sounds. That is the
    // deliberate answer for an export — the file is the song, not a performance of it under a
    // voice budget. (A note at time 0 is not "ahead" and does take the choke/steal path; it
    // finds nothing to cut, since a render registers no live press for it to choke or steal.)
    for (const event of plan.events) {
      const instrument = instruments.get(event.trackIndex);
      const track = plan.tracks[event.trackIndex];
      if (!instrument || !track) continue;
      if (event.kind === 'press') {
        instrument.pressNote(event.id, track.pitch, {
          at: event.atS,
          durationMs: event.durationMs,
        });
      } else {
        instrument.play(event.id, track.pitch, event.atS);
      }
    }

    // startRendering() has no abort of its own, so these suspensions are the only real cancel
    // there is: the renderer parks at each one, and a cancelled render is simply never
    // resumed — leaving an orphaned context that goes away with the last reference to it when
    // this function throws. Where suspend is unavailable the abort still rejects at once and
    // the finished render is discarded: a wasted render, but never a stuck promise.
    if (typeof context.suspend === 'function') {
      for (let at = PROGRESS_CHECKPOINT_S; at < lengthS; at += PROGRESS_CHECKPOINT_S) {
        const fraction = at / lengthS;
        void context.suspend(at).then(
          () => {
            if (cancelled) return;
            onProgress?.(fraction);
            void context.resume();
          },
          () => {
            // A suspension the renderer has already passed is rejected: there is nothing to
            // report for a checkpoint that never happened, and the render must not stall.
          }
        );
      }
    }

    const rendered = await Promise.race([context.startRendering(), cancellation]);
    onProgress?.(1);
    return trimTrailingSilence(rendered);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // Safe while the pool holds the same arrays: dispose reassigns `buffers`, never mutates it.
    owned.forEach((instrument) => instrument.dispose());
  }
}

/**
 * One loaded, volume-set engine per AUDIBLE track, keyed by its track index — a silent track
 * gets no entry, so an inaudible instrument is never fetched or decoded at all. Each engine is
 * registered in `owned` as it is created, so a cancellation between two loads still has one
 * list to tear down.
 */
async function loadPlannedInstruments(
  context: BaseAudioContext,
  plan: SongRenderPlan,
  owned: Instrument[]
): Promise<Map<number, Instrument>> {
  const loaded = new Map<number, Instrument>();
  await Promise.all(
    plan.tracks.map(async (track) => {
      if (!track.audible) return;
      const instrument = new Instrument(track.instrument);
      owned.push(instrument);
      await instrument.load(context);
      instrument.changeVolume(track.volume);
      loaded.set(track.trackIndex, instrument);
    })
  );
  return loaded;
}

/**
 * Cut the dead air the generous length bound leaves at the end, keeping TRIM_TAIL_S of it so a
 * decay can never be clipped. This is the other half of not re-deriving envelopes: the bound
 * overshoots on purpose and the measurement of what actually sounded happens here, on the
 * rendered samples. A wholly silent render (every track muted) is returned honestly, as the
 * shortest valid buffer, rather than padded into sounding like something went out.
 */
function trimTrailingSilence(rendered: AudioBuffer): AudioBuffer {
  const minLength = Math.min(
    rendered.length,
    Math.max(1, Math.ceil(MIN_RENDER_S * rendered.sampleRate))
  );
  let last = -1;
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    const samples = rendered.getChannelData(channel);
    // Stops at `last`: a later non-silent sample found on another channel already decides the
    // end, so the rest of this channel cannot move it.
    for (let i = samples.length - 1; i > last; i--) {
      if (Math.abs(samples[i]) > SILENCE_THRESHOLD) {
        last = i;
        break;
      }
    }
  }
  const sounded = last === -1 ? 0 : last + 1 + Math.round(TRIM_TAIL_S * rendered.sampleRate);
  const length = Math.min(rendered.length, Math.max(minLength, sounded));
  if (length >= rendered.length) return rendered;
  const trimmed = new AudioBuffer({
    length,
    numberOfChannels: rendered.numberOfChannels,
    sampleRate: rendered.sampleRate,
  });
  for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
    trimmed.copyToChannel(rendered.getChannelData(channel).subarray(0, length), channel);
  }
  return trimmed;
}
