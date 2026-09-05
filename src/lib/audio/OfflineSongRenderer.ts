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
//
// That split is also why the player anchors its live transport on this same plan (ADR-0009):
// what a song sounds like is decided once, here, and an export can no longer disagree with the
// performance it was taken from.

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
/**
 * How far ahead of the render clock a note may be committed — the offline peer of the ~1s live
 * horizon ADR-0006 gives the composer, kept larger because a render's top-ups are the progress
 * checkpoints rather than a per-column loop. Must stay comfortably ABOVE PROGRESS_CHECKPOINT_S:
 * that inequality is what keeps every committed event strictly ahead of the parked clock, which
 * the invariant in `renderSongToAudioBuffer` explains and depends on.
 */
const LEAD_S = 5;

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
  /**
   * Which note of `song.notes` this event came from. The render itself never needs it — live
   * playback does (ADR-0009): the player's sheet cursor, chunk position and keyboard flash are
   * all keyed by a note's index in the song, so the plan carries the way back to it rather than
   * making the caller re-derive the mapping and get it wrong on a song with muted tracks.
   */
  noteIndex: number;
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
  for (const [noteIndex, note] of song.notes.entries()) {
    const track = tracks[note.trackIndex];
    // A note whose track has no roster entry sounds nowhere: a live surface indexes its loaded
    // engines by trackIndex and returns on a miss, so the render answers it the same way.
    if (!track?.audible) continue;
    const atS = note.time / 1000;
    events.push(
      note.duration > 0 && supportsSustain[note.trackIndex]
        ? {
            trackIndex: note.trackIndex,
            noteIndex,
            id: note.id,
            atS,
            kind: 'press',
            durationMs: note.duration,
          }
        : { trackIndex: note.trackIndex, noteIndex, id: note.id, atS, kind: 'play' }
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

    // The window pointer walks the event list once, so an out-of-order event would be stranded
    // behind it. A RecordedSong's notes are time-ordered and the plan preserves that, but a
    // hand-edited file is still a file — one comparison pass says whether that held, and only a
    // song that failed it pays for a sorted copy.
    const events = plan.events.every((event, i) => i === 0 || plan.events[i - 1].atS <= event.atS)
      ? plan.events
      : [...plan.events].sort((a, b) => a.atS - b.atS);
    let nextEvent = 0;
    /** Commit every remaining event that starts before `untilS`; the pointer only moves forward. */
    const commitBefore = (untilS: number) => {
      for (; nextEvent < events.length && events[nextEvent].atS < untilS; nextEvent++) {
        const event = events[nextEvent];
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
    };

    // startRendering() has no abort of its own, so these suspensions are the only real cancel
    // there is: the renderer parks at each one, and a cancelled render is simply never
    // resumed — leaving an orphaned context that goes away with the last reference to it when
    // this function throws. Where suspend is unavailable the abort still rejects at once and
    // the finished render is discarded: a wasted render, but never a stuck promise.
    //
    // They are also where the next slice of the song is committed. An OfflineAudioContext
    // visits every connected node on every 128-frame quantum — a source waiting on a future
    // start included — so committing a whole song before startRendering costs (node count ×
    // duration) and makes a long dense song render at roughly the speed of listening to it.
    // A moving window is the same trade ADR-0006 makes live, for the same reason.
    //
    // INVARIANT: every event committed at a checkpoint must start STRICTLY after that
    // checkpoint's clock time. `pressNote`/`play` skip the same-button choke and the 64-voice
    // steal only for `at > now`; an event committed AT the parked clock would run that steal
    // against voices genuinely sounding mid-song and cut them. LEAD_S > PROGRESS_CHECKPOINT_S
    // makes it structural rather than hoped-for: the batch at checkpoint `t` begins where the
    // previous one stopped, at `t - PROGRESS_CHECKPOINT_S + LEAD_S`, which clears `t` by
    // LEAD_S - PROGRESS_CHECKPOINT_S seconds — far more than the up-to-one-quantum rounding
    // suspend applies to its own time. Do not narrow that margin.
    const canSuspend = typeof context.suspend === 'function';
    if (canSuspend) {
      for (let at = PROGRESS_CHECKPOINT_S; at < lengthS; at += PROGRESS_CHECKPOINT_S) {
        const fraction = at / lengthS;
        void context.suspend(at).then(
          () => {
            if (cancelled) return;
            commitBefore(at + LEAD_S);
            onProgress?.(fraction);
            void context.resume();
          },
          () => {
            // A suspension the renderer has already passed is rejected: there is nothing to
            // report for a checkpoint that never happened, and the render must not stall. The
            // pointer simply stays put, so the next checkpoint commits the wider batch.
          }
        );
      }
    }
    // The t=0 batch is the one place a note can land ON the clock rather than ahead of it, and
    // that is unchanged and deliberate: notes at exactly 0 take the choke/steal path and find
    // empty registries, since a render holds no live press to choke or steal. Everything after
    // it is committed ahead of the clock, so the render keeps the COMPOSER's committed-playback
    // semantics — no note silently dropped under a voice budget, and a dense song rendering
    // FULLER than the live player sounds. That is the right answer for an export: the file is
    // the song, not a performance of it.
    //
    // Without suspend there is no later moment to commit from, so the whole song goes in
    // up-front exactly as it used to: still correct, just slow on a long dense song.
    //
    // Nothing trims the window's trailing edge here, and nothing needs to: the main thread sits
    // idle while startRendering runs, so each Voice's and one-shot's 'ended' handler fires
    // mid-render and disconnects the nodes that have finished sounding.
    commitBefore(canSuspend ? LEAD_S : Infinity);

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
