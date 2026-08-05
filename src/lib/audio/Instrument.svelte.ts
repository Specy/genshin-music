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
import type { InstrumentName, NoteStatus } from '$core/types';
import { capitalize, getPitchChanger } from '$core/utils/Utilities';
import type {
  BaseNote,
  InstrumentSustain,
  NoteImage,
  ShapeDefinition,
  SustainLoopMode,
} from '$lib/games/types';
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

//TODO refactor everything here

export class Instrument {
  name: InstrumentName;
  volumeNode: GainNode | null = null;
  instrumentData: (typeof INSTRUMENTS_DATA)[InstrumentName];
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
  /** Live (key-still-down) voice per button, for release-by-button. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- engine state, never UI-observed
  private heldVoices = new Map<number, Voice>();
  private static readonly MAX_VOICES = 32;

  get endNode() {
    return this.volumeNode;
  }

  get sustainConfig(): (InstrumentSustain & { loopMode: Exclude<SustainLoopMode, 'one-shot'> }) | null {
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
      const noteName = this.layouts.keyboard[i];
      const noteNames = {
        keyboard: noteName,
      };
      // URL-locked path (§5.3 / ADR-0003): game id = the old APP_NAME.toLowerCase().
      const url = `${base}/assets/audio/${game.id}/${this.name}/${configNote.file}`;
      const note = new ObservableNote(i, noteNames, url, configNote.baseNote, configNote.midi ?? 0);
      note.instrument = this.name;
      note.noteImage = configNote.icon;
      this.notes.push(note);
    }
  }

  getNoteFromCode = (code: string) => {
    const index = this.getNoteIndexFromCode(code);
    return index !== -1 ? this.notes[index] : null;
  };
  /** Button playing a Note Id on this instrument, -1 when the id is stranded on it. */
  getButtonFromId = (id: number) => {
    return this.notes.findIndex((note) => note.midiNote === id);
  };
  getNoteFromIndex = (index: number) => {
    return this.notes[index] ?? null;
  };
  getNoteIndexFromCode = (code: string) => {
    return this.layouts.keyboard.findIndex((e) => e === code);
  };
  getNoteText = (index: number, type: NoteNameType, pitch: Pitch) => {
    const layout = this.layouts;
    try {
      if (type === 'Note name') {
        const baseNote = this.notes[index].baseNote;
        return NOTE_SCALE[baseNote][PITCH_TO_INDEX.get(pitch) ?? 0];
      }
      if (type === 'Your Keyboard layout') {
        const key =
          keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[index]) ?? layout.keyboard[index];
        const res = KeyboardProvider.getTextOfCode(key as KeyboardCode) ?? key.replace('Key', '');
        return capitalize(res);
      }
      if (type === 'Keyboard layout') {
        const key =
          keyBinds.getKeyOfShortcut('keyboard', layout.keyboard[index]) ?? layout.keyboard[index];
        const res = DEFAULT_ENG_KEYBOARD_MAP[key] ?? key.replace('Key', '');
        return capitalize(res);
      }
      if (type === 'Do Re Mi') {
        const baseNote = this.notes[index].baseNote;
        return DO_RE_MI_NOTE_SCALE[baseNote][PITCH_TO_INDEX.get(pitch) ?? 0];
      }
      if (type === 'ABC') return layout.abc[index];
      if (type === '1 2 3') return layout.number[index];
      if (type === 'No Text') return '';
      if (type === 'Playstation') return layout.playstation[index];
      if (type === 'Switch') return layout.switch[index];
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

  play = (note: number, pitch: Pitch, delay?: number) => {
    if (this.isDeleted || !this.volumeNode || !this.audioContext) return;
    const pitchChanger = getPitchChanger(pitch);
    const player = this.audioContext.createBufferSource();
    player.buffer = this.buffers[note];
    player.connect(this.volumeNode);
    //player.detune.value = pitch * 100, pitch should be 0 indexed from C
    player.playbackRate.value = pitchChanger;
    if (delay) {
      player.start(this.audioContext.currentTime + delay);
    } else {
      player.start();
    }

    function handleEnd() {
      player.stop();
      player.disconnect();
    }

    player.addEventListener('ended', handleEnd, { once: true });
  };

  /**
   * Press a button. Non-sustaining instruments take the exact one-shot `play()` path
   * (returns null). Sustaining instruments start a looped Voice that sounds until
   * `releaseNote(button)` — or self-releases after `durationMs` (song playback,
   * scheduled sample-accurately on the audio timeline at start).
   */
  pressNote = (
    button: number,
    pitch: Pitch,
    options?: { delay?: number; durationMs?: number }
  ): Voice | null => {
    const sustain = this.sustainConfig;
    if (!sustain) {
      this.play(button, pitch, options?.delay);
      return null;
    }
    if (this.isDeleted || !this.volumeNode || !this.audioContext) return null;
    const buffer = this.buffers[button];
    if (!buffer) return null;
    //same-button live retrigger: choke the previous sustain quickly instead of
    //layering its full release tail under the new attack. Scheduled Composer voices
    //are not in heldVoices, so same-note polyphony across tracks remains independent.
    const previous = this.heldVoices.get(button);
    if (previous) {
      this.heldVoices.delete(button);
      previous.choke();
    }
    this.pruneVoices();
    if (this.activeVoices.length >= Instrument.MAX_VOICES) {
      //oldest-first stealing keeps the newest notes audible on constrained devices
      this.activeVoices.shift()?.stop();
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
      delay: options?.delay,
    });
    this.activeVoices.push(voice);
    if (options?.durationMs !== undefined) {
      voice.releaseAt(voice.startedAt + options.durationMs / 1000);
    } else {
      this.heldVoices.set(button, voice);
    }
    return voice;
  };

  /** Release the live voice held on a button (no-op for one-shot instruments and unheld buttons). */
  releaseNote = (button: number) => {
    const voice = this.heldVoices.get(button);
    if (!voice) return;
    this.heldVoices.delete(button);
    voice.release();
  };

  /**
   * Release only the LIVE held voices (key-still-down registry) — the missed-key-up
   * guard for blur/visibility loss. Scheduled playback voices are untouched so music
   * keeps playing in a background tab.
   */
  releaseHeldNotes = () => {
    this.heldVoices.forEach((voice) => voice.release());
    this.heldVoices.clear();
  };

  /** Release everything sounding, live and scheduled — ramped (playback stop) or hard (teardown). */
  releaseAllNotes = (hard = false) => {
    this.heldVoices.clear();
    this.activeVoices.forEach((voice) => (hard ? voice.stop() : voice.fadeOut()));
    this.activeVoices = [];
  };

  private pruneVoices = () => {
    // A voice with a future release scheduled is still sounding and must continue to
    // count toward the cap (and remain available to releaseAllNotes on stop/blur).
    this.activeVoices = this.activeVoices.filter((voice) => !voice.isDisposed);
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
};

export class ObservableNote {
  index: number;
  noteImage: NoteImage = DEFAULT_NOTE_ICON;
  midiNote: number;
  instrument: InstrumentName = INSTRUMENTS[0];
  noteNames: NoteName;
  url: string;
  baseNote: BaseNote = 'C';
  buffer: ArrayBuffer = new ArrayBuffer(8);
  // Treated as readonly by convention only - always mutated in place via setState()'s
  // Object.assign, never reassigned.
  data: NoteDataState = $state({
    status: '',
    delay: 0,
    animationId: 0,
    holdMs: 0,
  });

  constructor(
    index: number,
    noteNames: NoteName,
    url: string,
    baseNote: BaseNote,
    midiNote: number
  ) {
    this.index = index;
    this.noteNames = noteNames;
    this.url = url;
    this.baseNote = baseNote;
    this.midiNote = midiNote;
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
      this.midiNote
    );
    obj.buffer = this.buffer;
    obj.noteImage = this.noteImage;
    obj.instrument = this.instrument;
    obj.setState(this.data);
    return obj;
  }
}
