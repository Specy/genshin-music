// Imports value data directly from $core/legacyConfig rather than $game - see that file's own
// header for the audio-engine-tier carve-out this file and MIDIProvider.ts are on.
// EXCEPTION (ADR-0003): the Shape registry is code, not adapter data — it rides on the
// GameDefinition itself, so `game` is imported for `game.shapes` (and game.id for the
// URL-locked audio path, which equals the old APP_NAME.toLowerCase()).
import { base } from '$app/paths';
import { game } from '$game';
import {
  DEFAULT_NOTE_ICON,
  DO_RE_MI_NOTE_SCALE,
  INSTRUMENTS,
  INSTRUMENTS_DATA,
  NOTE_SCALE,
  type NoteNameType,
  type Pitch,
  PITCH_TO_INDEX,
} from '$core/legacyConfig';
import { baseNoteText } from '$core/sharedConfig';
import type { InstrumentName, NoteStatus } from '$core/types';
import { capitalize, getPitchChanger } from '$core/utils/Utilities';
import type {
  InstrumentSustain,
  NoteImage,
  ShapeDefinition,
  SustainLoopMode,
} from '$lib/games/types';
import { shapeSlots } from '$lib/games/shapes/assignment';
import { basepointOffset, numberToButton } from '$core/Songs/noteIds';
import { Voice } from '$lib/audio/Voice';
import { crossfadeLoopRegion, DEFAULT_LOOP_CROSSFADE_S } from '$lib/audio/loopCrossfade';
import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
import type { KeyboardCode } from '$lib/providers/KeyboardProvider/KeyboardTypes';
import { keyBinds } from '$stores/KeybindsStore.svelte';
import { DEFAULT_ENG_KEYBOARD_MAP } from '$i18n/i18n';

type Layouts = {
  keyboard: string[];
  abc: string[];
  number: string[];
  playstation: string[];
  switch: string[];
};
// QUIRK: deliberately a plain Map, not SvelteMap - this is a module-level cache, not UI-observed
// state, so making it reactive would be pointless overhead.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const INSTRUMENT_BUFFER_POOL = new Map<InstrumentName, AudioBuffer[]>();

type ScheduledOneShot = {
  source: AudioBufferSourceNode;
  /** The absolute AudioContext time this one-shot was committed to sound at. */
  at: number;
};

//TODO refactor everything here

/**
 * The audio engine for one instrument.
 *
 * PUBLIC API IS KEYED BY NOTE NUMBER + BASEPOINT (ADR-0005 §4 under ADR-0007's axis):
 * `play(number, pitch)`, `pressNote(number, pitch)`, `getNoteByNumber(number, pitch)`,
 * `getButtonOfNumber(number, pitch)`. A Note Number is what songs, the keyboard surfaces and
 * every recording already carry, so callers never round-trip through a Button, and a number
 * this instrument cannot voice at this Basepoint (a Stranded Note) is simply silent instead
 * of needing a -1 guard at each call site.
 *
 * The resolution itself is NOT reimplemented here: it is `noteIds.numberToButton`, the same
 * function the composer canvas, the keyboard and the player resolve through. One rule, one
 * place — a second copy is exactly how an engine and a surface come to disagree about which
 * key a stored number means.
 *
 * `releaseNote(number)` takes NO Basepoint, deliberately: a held voice remembers the Button
 * it was pressed on (see heldVoices), so a Basepoint change under a held key releases the key
 * that is actually sounding rather than whichever one the new Basepoint would resolve to.
 *
 * Buttons survive only as PRIVATE STORAGE: the position of a note in the authored note list
 * indexes `notes`, `buffers` and `instrumentData.notes`. Where a button is drawn is neither
 * of those — it is the Shape's slot, resolved through the Shape's assignment (`this.slots`),
 * which is also where the Label Sets are read.
 */
export class Instrument {
  name: InstrumentName;
  volumeNode: GainNode | null = null;
  instrumentData: (typeof INSTRUMENTS_DATA)[InstrumentName];
  /** This instrument's notes in authored Button order — array position IS the Button. */
  notes: ObservableNote[] = [];
  layouts: Layouts = {
    keyboard: [],
    abc: [],
    playstation: [],
    number: [],
    switch: [],
  };
  buffers: AudioBuffer[] = [];
  isDeleted: boolean = false;
  isLoaded: boolean = false;
  audioContext: AudioContext | null = null;
  /** Sounding sustained voices (pruned opportunistically); engine state, never UI-observed. */
  private activeVoices: Voice[] = [];
  /**
   * Live (key-still-down) voice per NOTE NUMBER, for release-by-number — with the BUTTON it
   * was pressed on. The button is stored rather than re-resolved because release must act on
   * the key that is sounding: a Basepoint change (or an instrument swap) between press and
   * release would otherwise resolve the same number to a different button, and the minimum
   * note length would be read off a key the listener never pressed.
   */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- engine state, never UI-observed
  private heldVoices = new Map<number, { voice: Voice; button: number }>();
  /**
   * One-shots committed to a future audio-clock start (ADR-0006) — the retractable set
   * cancelScheduledAfter operates on. An immediately-started one-shot never enters: it
   * is already sounding, so there is nothing left to retract.
   */
  private scheduledOneShots: ScheduledOneShot[] = [];
  /**
   * Button -> the slot the Shape draws it at (ADR-0005 §2), which is also the entry of the
   * Shape's Label Sets that button wears. Identity for every shipped (grid) Shape.
   */
  private slots: readonly number[] = [];
  /** Maximum voices that are already sounding; future transport commits do not spend it early. */
  private static readonly MAX_VOICES = 64;
  /**
   * How long after its start time a committed one-shot is kept registered, in seconds.
   * Mirrors Metronome's BEAT_RETENTION_S: only a one-shot that has not started yet can
   * be cancelled, so dropping an older entry costs nothing; the 'ended' listener
   * normally removes an entry, and this bound keeps the registry finite over a long
   * session even if an 'ended' event never arrives.
   */
  private static readonly ONE_SHOT_RETENTION_S = 1;

  get endNode() {
    return this.volumeNode;
  }

  get sustainConfig():
    (InstrumentSustain & { loopMode: Exclude<SustainLoopMode, 'one-shot'> }) | null {
    const sustain = this.instrumentData.sustain;
    // 'one-shot' = "ignores note-off": behaviorally identical to omitting `sustain`,
    // so the whole sustain machinery (Voice, hold/duration UX, recorded durations)
    // stays off and pressNote takes the plain play() path.
    if (!sustain || sustain.loopMode === 'one-shot') return null;
    return sustain as InstrumentSustain & { loopMode: Exclude<SustainLoopMode, 'one-shot'> };
  }

  /** Whether this instrument responds to hold length (spec 2026-08-03: capability, per instrument). */
  get supportsSustain() {
    return this.sustainConfig !== null;
  }

  /** The instrument's Shape (ADR-0003) — keyboard surfaces render through this. */
  get shape(): ShapeDefinition {
    return game.shapes[this.instrumentData.shape];
  }

  static clearPool() {
    INSTRUMENT_BUFFER_POOL.clear();
  }

  constructor(name: InstrumentName = INSTRUMENTS[0]) {
    this.name = name;
    if (!INSTRUMENTS.includes(this.name)) this.name = INSTRUMENTS[0];
    this.instrumentData = INSTRUMENTS_DATA[this.name as keyof typeof INSTRUMENTS_DATA];
    // Label Sets ride on the Shape, not the instrument (ADR-0003).
    const labels = this.shape.labels;
    this.layouts = {
      keyboard: [...labels.keyboard],
      abc: [...labels.abc],
      playstation: [...labels.playstation],
      number: [...labels.number],
      switch: [...labels.switch],
    };
    for (const [i, configNote] of this.instrumentData.notes.entries()) {
      // URL-locked path (§5.3 / ADR-0003): game id = the old APP_NAME.toLowerCase().
      const url = `${base}/assets/audio/${game.id}/${this.name}/${configNote.file}`;
      const note = new ObservableNote(
        i,
        { keyboard: '' },
        url,
        configNote.baseNote,
        configNote.midi ?? 0,
        configNote.sounding
      );
      note.instrument = this.name;
      note.noteImage = configNote.icon;
      this.notes.push(note);
    }
    // The Shape says where each note sits; its Label Sets are indexed by that SLOT, not by
    // authored order (ADR-0005 §2). Identity for every shipped Shape, so `noteNames.keyboard`
    // is byte-identical to the old `layouts.keyboard[i]`.
    this.slots = shapeSlots(this.shape, this.notes);
    for (const [i, note] of this.notes.entries()) {
      note.noteNames = { keyboard: this.layouts.keyboard[this.slotOf(i)] };
    }
  }

  /** Where the Shape draws this Button — the index into every Label Set. */
  private slotOf = (button: number) => this.slots[button] ?? -1;

  /** The note bound to a keyboard label (a resolved keybind), null when this Shape has none. */
  getNoteFromCode = (code: string) => {
    const index = this.getNoteIndexFromCode(code);
    return index !== -1 ? this.notes[index] : null;
  };
  /** The note voicing a Note Number at this Basepoint, null when the number is stranded here. */
  getNoteByNumber = (number: number, pitch: Pitch): ObservableNote | null => {
    const button = this.getButtonOfNumber(number, pitch);
    return button === -1 ? null : (this.notes[button] ?? null);
  };
  /** Button voicing a Note Number at this Basepoint, -1 when the number is stranded here. */
  getButtonOfNumber = (number: number, pitch: Pitch) => {
    return numberToButton(this.name, pitch, number);
  };
  getNoteFromIndex = (index: number) => {
    return this.notes[index] ?? null;
  };
  /** Button bound to a keyboard label, -1 when unbound — prefer `getNoteFromCode`. */
  getNoteIndexFromCode = (code: string) => {
    const slot = this.layouts.keyboard.findIndex((e) => e === code);
    if (slot === -1) return -1;
    // the label lives at a SLOT; the button wearing it is the one the Shape put there
    return this.slots.indexOf(slot);
  };
  /**
   * The display text of a BUTTON in one naming mode. Label Sets are read at the button's
   * Shape slot, so the text always matches where the Shape drew it.
   * (The sheet visualizer deliberately calls this with Song-Grid slots on the default
   * instrument — identity there, unchanged by ADR-0005.)
   */
  getNoteText = (index: number, type: NoteNameType, pitch: Pitch) => {
    const layout = this.layouts;
    const slot = this.slotOf(index);
    try {
      if (type === 'Note name') {
        const baseNote = this.notes[index].baseNote;
        return baseNoteText(NOTE_SCALE, baseNote, PITCH_TO_INDEX.get(pitch) ?? 0);
      }
      if (type === 'Your Keyboard layout') {
        const key =
          keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[slot]) ?? layout.keyboard[slot];
        const res = KeyboardProvider.getTextOfCode(key as KeyboardCode) ?? key.replace('Key', '');
        return capitalize(res);
      }
      if (type === 'Keyboard layout') {
        const key =
          keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[slot]) ?? layout.keyboard[slot];
        const res = DEFAULT_ENG_KEYBOARD_MAP[key] ?? key.replace('Key', '');
        return capitalize(res);
      }
      if (type === 'Do Re Mi') {
        const baseNote = this.notes[index].baseNote;
        return baseNoteText(DO_RE_MI_NOTE_SCALE, baseNote, PITCH_TO_INDEX.get(pitch) ?? 0);
      }
      if (type === 'ABC') return layout.abc[slot];
      if (type === '1 2 3') return layout.number[slot];
      if (type === 'No Text') return '';
      if (type === 'Playstation') return layout.playstation[slot];
      if (type === 'Switch') return layout.switch[slot];
    } catch {
      // QUIRK: intentionally silent - swallows any index/lookup error without logging.
    }
    return '';
  };
  changeVolume = (amount: number) => {
    let newVolume = Number((amount / 135).toFixed(2));
    if (amount < 5) newVolume = 0;
    if (this.volumeNode) this.volumeNode.gain.value = newVolume;
  };

  /**
   * Trigger a Note Number at a Basepoint (ADR-0005 §4 / ADR-0007), immediately or committed
   * at the absolute AudioContext time `at`. A number this instrument cannot voice at this
   * Basepoint is silent. `pitch` decides BOTH the button and the playback rate, which is what
   * makes the same stored number sound its own pitch at every Basepoint.
   */
  play = (number: number, pitch: Pitch, at?: number) => {
    // A sustaining instrument has no meaningful whole-file one-shot: plain triggers
    // (composer previews and span-1 columns, recorded taps, VSRG hits, MIDI-setup
    // auditions) become a tap — press + immediate release, so the authored
    // minLength/release define the sound instead of the raw multi-second sample.
    if (this.supportsSustain) {
      this.pressNote(number, pitch, { at, durationMs: 0 });
      return;
    }
    if (this.isDeleted || !this.volumeNode || !this.audioContext) return;
    const button = this.getButtonOfNumber(number, pitch);
    if (button === -1) return;
    const now = this.audioContext.currentTime;
    // Lazy retention prune (Metronome's BEAT_RETENTION_S rationale): an entry this far
    // past its start time can no longer be cancelled, so dropping it costs nothing —
    // and an 'ended' that never arrives must not grow the registry over a long session.
    this.scheduledOneShots = this.scheduledOneShots.filter(
      (entry) => entry.at >= now - Instrument.ONE_SHOT_RETENTION_S
    );
    const pitchChanger = getPitchChanger(pitch);
    const player = this.audioContext.createBufferSource();
    player.buffer = this.buffers[button];
    player.connect(this.volumeNode);
    //player.detune.value = pitch * 100, pitch should be 0 indexed from C
    player.playbackRate.value = pitchChanger;
    // Only a FUTURE start is committed on the absolute audio clock and registered as
    // retractable (ADR-0006); anything else starts now and is fire-and-forget — it is
    // already sounding, and sounding audio always rings out.
    const entry = at !== undefined && at > now ? { source: player, at } : null;
    if (entry) {
      player.start(entry.at);
      this.scheduledOneShots.push(entry);
    } else {
      player.start();
    }

    const handleEnd = () => {
      player.stop();
      player.disconnect();
      if (entry) {
        const index = this.scheduledOneShots.indexOf(entry);
        if (index !== -1) this.scheduledOneShots.splice(index, 1);
      }
    };

    player.addEventListener('ended', handleEnd, { once: true });
  };

  /**
   * Press a Note Number at a Basepoint. Non-sustaining instruments take the exact one-shot
   * `play()` path (returns null). Sustaining instruments start a looped Voice that sounds
   * until `releaseNote(number)` — or self-releases after `durationMs` (song playback,
   * committed sample-accurately on the audio timeline: `at` is the absolute AudioContext
   * start time, and `durationMs` counts from it). `skipMs` resumes mid-note (playback started
   * inside a spanned note): audio picks up at the position the playhead would have
   * reached, and `durationMs` counts the REMAINING hold.
   * A number this instrument cannot voice at this Basepoint is silent (returns null).
   */
  pressNote = (
    number: number,
    pitch: Pitch,
    options?: { at?: number; durationMs?: number; skipMs?: number }
  ): Voice | null => {
    const sustain = this.sustainConfig;
    if (!sustain) {
      this.play(number, pitch, options?.at);
      return null;
    }
    if (this.isDeleted || !this.volumeNode || !this.audioContext) return null;
    const button = this.getButtonOfNumber(number, pitch);
    if (button === -1) return null;
    const buffer = this.buffers[button];
    if (!buffer) return null;
    const now = this.audioContext.currentTime;
    const requestedAt = options?.at;
    const scheduledAhead =
      typeof requestedAt === 'number' && Number.isFinite(requestedAt) && requestedAt > now;
    //same-note live retrigger: choke the previous sustain quickly instead of
    //layering its full release tail under the new attack. A future Composer commit
    //must not choke what the player is hearing NOW merely because it was scheduled
    //early; scheduled song voices also stay out of heldVoices below.
    if (!scheduledAhead) {
      const previous = this.heldVoices.get(number);
      if (previous) {
        this.heldVoices.delete(number);
        if (!previous.voice.isDisposed) previous.voice.choke();
      }
    }
    this.pruneVoices();
    if (!scheduledAhead) {
      let soundingCount = this.activeVoices.reduce(
        (count, voice) => count + (voice.startedAt <= now ? 1 : 0),
        0
      );
      while (soundingCount >= Instrument.MAX_VOICES) {
        const oldestSounding = this.activeVoices.findIndex((voice) => voice.startedAt <= now);
        if (oldestSounding === -1) break;
        // Oldest-first stealing keeps the newest notes audible. Committed future
        // voices neither trigger a present-time cut nor consume the sounding cap.
        this.activeVoices[oldestSounding].stop();
        soundingCount--;
      }
    }
    const voice = new Voice({
      context: this.audioContext,
      buffer,
      destination: this.volumeNode,
      playbackRate: getPitchChanger(pitch),
      // per-note loop override lives on the note itself (ADR-0003)
      loop: this.instrumentData.notes[button]?.loop ?? sustain.loop,
      loopMode: sustain.loopMode,
      release: sustain.release,
      crossfade: sustain.crossfade,
      at: options?.at,
      skip: options?.skipMs !== undefined ? options.skipMs / 1000 : undefined,
      onDispose: this.forgetVoice,
    });
    this.activeVoices.push(voice);
    if (options?.durationMs !== undefined) {
      // the note must sound at least minLength from ITS start — a resumed voice
      // (skipMs) already served that much of the note before this press
      const minRemainingMs = Math.max(0, this.minNoteMs(button) - (options.skipMs ?? 0));
      voice.releaseAt(voice.startedAt + Math.max(options.durationMs, minRemainingMs) / 1000);
    } else {
      this.heldVoices.set(number, { voice, button });
    }
    return voice;
  };

  /**
   * Minimum milliseconds a triggered note must sound before its release begins
   * (sustain.minLength with per-note override; 0 when unset) — the Instrument-level
   * tap guarantee: a very fast tap still plays this much, then the normal release.
   * Button-keyed: `instrumentData.notes` is private storage, indexed by authored position.
   */
  private minNoteMs = (button: number): number => {
    const sustain = this.sustainConfig;
    if (!sustain) return 0;
    const min = this.instrumentData.notes[button]?.minLength ?? sustain.minLength;
    return typeof min === 'number' && Number.isFinite(min) && min > 0 ? min * 1000 : 0;
  };

  /** Release the live voice held on a Note Number (no-op for one-shot instruments and unheld numbers). */
  releaseNote = (number: number) => {
    const held = this.heldVoices.get(number);
    if (!held) return;
    this.heldVoices.delete(number);
    // releaseAt clamps to "now" once the minimum has already elapsed, so held
    // notes released late act exactly on the key-up
    held.voice.releaseAt(held.voice.startedAt + this.minNoteMs(held.button) / 1000);
  };

  /**
   * Release only the LIVE held voices (key-still-down registry) — the missed-key-up
   * guard for blur/visibility loss. Scheduled playback voices are untouched so music
   * keeps playing in a background tab.
   */
  releaseHeldNotes = () => {
    this.heldVoices.forEach((held) =>
      held.voice.releaseAt(held.voice.startedAt + this.minNoteMs(held.button) / 1000)
    );
    this.heldVoices.clear();
  };

  /** Release everything sounding, live and scheduled — ramped (playback stop) or hard (teardown). */
  releaseAllNotes = (hard = false) => {
    this.heldVoices.clear();
    // Clear ownership before stopping: hard stop invokes the per-voice dispose callback,
    // which must not splice the array while this traversal is in progress.
    const voices = this.activeVoices;
    this.activeVoices = [];
    voices.forEach((voice) => (hard ? voice.stop() : voice.fadeOut()));
  };

  /**
   * Retract every committed-but-unstarted event whose start time is at or after `at`
   * (transport stop/resync, ADR-0006). Committed audio is retractable until it starts;
   * once sounding it always rings out — deleting a note never silences its in-flight
   * sound. heldVoices needs no handling: a scheduled voice is never held (only a live
   * no-durationMs press registers there — see the retrigger comment in pressNote), so
   * activeVoices covers every cancellable Voice.
   */
  cancelScheduledAfter = (at: number) => {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    const keptOneShots: ScheduledOneShot[] = [];
    for (const entry of this.scheduledOneShots) {
      // Equality with `now` is already sounding: currentTime is the audio renderer's
      // authoritative boundary, so only a strictly-future event remains retractable.
      if (entry.at > now && entry.at >= at) {
        // Safe: entries are pushed only after start() was called on them — stop() on a
        // never-started source throws InvalidStateError.
        entry.source.stop();
        entry.source.disconnect();
      } else {
        keptOneShots.push(entry);
      }
    }
    this.scheduledOneShots = keptOneShots;
    const keptVoices: Voice[] = [];
    // stop() synchronously invokes forgetVoice; iterate a snapshot so adjacent future
    // voices cannot be skipped as that callback removes them from the live registry.
    for (const voice of [...this.activeVoices]) {
      // Pre-start Voice.stop() is silent teardown, never a mid-waveform cut — the
      // source has not produced a sample yet (see Voice's fadeOut/stopSource).
      if (voice.startedAt > now && voice.startedAt >= at) voice.stop();
      else keptVoices.push(voice);
    }
    this.activeVoices = keptVoices;
  };

  private pruneVoices = () => {
    // A voice with a future release scheduled is still sounding and must continue to
    // count toward the cap (and remain available to releaseAllNotes on stop/blur).
    this.activeVoices = this.activeVoices.filter((voice) => !voice.isDisposed);
    for (const [number, held] of this.heldVoices) {
      if (held.voice.isDisposed) this.heldVoices.delete(number);
    }
  };

  /** Remove every registry reference as soon as a Voice reaches terminal teardown. */
  private forgetVoice = (voice: Voice) => {
    const index = this.activeVoices.indexOf(voice);
    if (index !== -1) this.activeVoices.splice(index, 1);
    for (const [number, held] of this.heldVoices) {
      if (held.voice === voice) this.heldVoices.delete(number);
    }
  };

  /** Bake each sustained note's loop-boundary crossfade into its decoded buffer (see loopCrossfade.ts). */
  private renderLoopCrossfades = () => {
    const sustain = this.sustainConfig;
    if (!sustain) return;
    const seconds = sustain.loopCrossfade ?? DEFAULT_LOOP_CROSSFADE_S;
    for (const [index, note] of this.instrumentData.notes.entries()) {
      const loop = note.loop ?? sustain.loop;
      const buffer = this.buffers[index];
      if (!loop || !buffer) continue;
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        crossfadeLoopRegion(buffer.getChannelData(channel), buffer.sampleRate, loop, seconds);
      }
    }
  };
  load = async (audioContext: AudioContext) => {
    this.audioContext = audioContext;
    this.volumeNode = audioContext.createGain();
    this.volumeNode.gain.value = 0.8;
    let loadedCorrectly = true;
    if (!INSTRUMENT_BUFFER_POOL.has(this.name)) {
      const emptyBuffer = this.audioContext.createBuffer(
        2,
        this.audioContext.sampleRate,
        this.audioContext.sampleRate
      );
      const requests: Promise<AudioBuffer>[] = this.notes.map((note) =>
        fetchAudioBuffer(note.url, audioContext).catch(() => {
          loadedCorrectly = false;
          return emptyBuffer;
        })
      );
      this.buffers = await Promise.all(requests);
      // Render loop-boundary crossfades once per decode, BEFORE pooling: pool hits
      // must reuse the processed buffers, never re-blend already-blended audio.
      this.renderLoopCrossfades();
      if (loadedCorrectly) INSTRUMENT_BUFFER_POOL.set(this.name, this.buffers);
    } else {
      this.buffers = INSTRUMENT_BUFFER_POOL.get(this.name)!;
    }
    this.isLoaded = true;
    return loadedCorrectly;
  };
  disconnect = (node?: AudioNode) => {
    if (node) return this.volumeNode?.disconnect(node);
    this.volumeNode?.disconnect();
  };
  connect = (node: AudioNode) => {
    this.volumeNode?.connect(node);
  };
  dispose = () => {
    this.releaseAllNotes(true);
    this.disconnect();
    this.isDeleted = true;
    this.buffers = [];
    this.volumeNode = null;
  };
}

export function fetchAudioBuffer(url: string, audioContext: AudioContext): Promise<AudioBuffer> {
  //dont change any of this, safari bug
  return new Promise((res, rej) => {
    fetch(url)
      .then((result) => result.arrayBuffer())
      .then((buffer) => {
        audioContext
          .decodeAudioData(buffer, res, (e) => {
            console.error(e);
            rej();
          })
          .catch((e) => {
            console.error(e);
            rej();
          });
      });
  });
}

interface NoteName {
  keyboard: string;
}

export type NoteDataState = {
  status: NoteStatus;
  delay: number;
  animationId: number;
  /** Practice-mode hold hint (ms) shown as a bar on the button; 0 = none. */
  holdMs: number;
  /**
   * Practice-mode release timer (ms): how much longer this *currently pressed* button should
   * be held, drawn as a ring outside the button so a fingertip can't cover it. 0 = no ring.
   */
  holdTimerMs: number;
  /** Bumped per press so the ring's CSS animation restarts on a re-press of the same button. */
  holdTimerId: number;
};

/**
 * One note of a loaded instrument: its identity, its display data, and the reactive
 * per-note UI state every keyboard surface mutates.
 *
 * It satisfies `ShapeNote` structurally (`id`, `baseNote`, `icon`), so a surface can hand
 * its own notes straight to a Shape and get these very objects back out of the `button`
 * snippet — per-note state is addressed through the object, never through a slot index.
 */
export class ObservableNote {
  /**
   * PRIVATE STORAGE (ADR-0005): this note's Button — its position in the instrument's
   * authored note list, which indexes `Instrument.notes`/`buffers`/`instrumentData.notes`.
   * It is NOT a screen position (that is the Shape's slot) and NOT a song identity (that is
   * `id`). No new external consumer: address notes by `id`, or by the object itself.
   */
  index: number;
  noteImage: NoteImage = DEFAULT_NOTE_ICON;
  midiNote: number;
  /**
   * This button's Sounding Pitch (ADR-0007) — its Note Number at Basepoint C. Derived and
   * validated at registry build; equal to `midiNote` for every button whose instrument is not
   * tuned away from its nominal grid, and for every Assigned Button by definition.
   */
  soundingNote: number;
  instrument: InstrumentName = INSTRUMENTS[0];
  noteNames: NoteName;
  url: string;
  /** Display label; free text on an Assigned Button (see InstrumentNote.baseNote). */
  baseNote: string = 'C';
  buffer: ArrayBuffer = new ArrayBuffer(8);
  // Treated as readonly by convention only - always mutated in place via setState()'s
  // Object.assign, never reassigned.
  data: NoteDataState = $state({
    status: '',
    delay: 0,
    animationId: 0,
    holdMs: 0,
    holdTimerMs: 0,
    holdTimerId: 0,
  });

  constructor(
    index: number,
    noteNames: NoteName,
    url: string,
    baseNote: string,
    midiNote: number,
    soundingNote: number = midiNote
  ) {
    this.index = index;
    this.noteNames = noteNames;
    this.url = url;
    this.baseNote = baseNote;
    this.midiNote = midiNote;
    this.soundingNote = soundingNote;
  }

  /** Nominal Id (ADR-0001) — the ShapeNote/grid-facing name of `midiNote`, never a song identity. */
  get id(): number {
    return this.midiNote;
  }

  /**
   * The Note Number pressing this button ENTERS at `pitch` (ADR-0007 §4) — what a keyboard
   * press hands to the engine, to a recording and to the song. Answered by the note rather
   * than by the surface so no surface has to reach for `index` (private storage) to get it.
   */
  numberAt(pitch: Pitch): number {
    return this.soundingNote + basepointOffset(pitch);
  }

  /** Glyph key — the ShapeNote-facing name of `noteImage`. */
  get icon(): NoteImage {
    return this.noteImage;
  }

  get status(): NoteStatus {
    return this.data.status;
  }

  setStatus(status: NoteStatus) {
    return this.setState({ status });
  }

  triggerAnimation(status?: NoteStatus) {
    this.setState({
      animationId: this.data.animationId + 1,
      status,
    });
  }

  setState(data: Partial<NoteDataState>) {
    Object.assign(this.data, data);
  }

  clone() {
    const obj = new ObservableNote(
      this.index,
      this.noteNames,
      this.url,
      this.baseNote,
      this.midiNote,
      this.soundingNote
    );
    obj.buffer = this.buffer;
    obj.noteImage = this.noteImage;
    obj.instrument = this.instrument;
    obj.setState(this.data);
    return obj;
  }
}
