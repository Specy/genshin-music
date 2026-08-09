<script module lang="ts">
  import type { Track } from '@tonejs/midi';

  export type CustomTrack = {
    track: Track;
    selected: boolean;
    layer: number;
    name: string;
    numberOfAccidentals: number;
    localOffset: number | null;
    maxScaling: number;
    outOfRangeBounds: {
      lower: number;
      upper: number;
    };
  };
</script>

<script lang="ts">
  import { base } from '$app/paths';
  import { PITCHES } from '$core/sharedConfig';
  import type { Pitch } from '$lib/games/types';
  import { basicPitchLoader } from '$lib/audio/BasicPitchLoader';
  import { logger } from '$stores/LoggerStore.svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import { type InstrumentData } from '$core/Songs/SongClasses';
  import {
    importMidiTracks,
    instrumentSupportsSustain,
    playableIdsOf,
    suggestOffset,
  } from '$core/Songs/midiImport';
  import { decodeMidiMetadata, type MidiMetadata } from '$core/Songs/midiMetadata';
  import { delay, isAudioFormat, isVideoFormat } from '$core/utils/Utilities';
  import { t } from '$i18n/binding.svelte';
  import FilePicker, { type FileElement } from '$cmp/inputs/FilePicker.svelte';
  import Switch from '$cmp/inputs/Switch.svelte';
  import PitchSelect from '$cmp/inputs/PitchSelect.svelte';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';
  import DecoratedCard from '$cmp/layout/DecoratedCard.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import TrackInfo from './TrackInfo.svelte';
  import NumericalInput from './NumericalInput.svelte';
  // Midi/Track stay type-only imports (erased, so nothing to resolve at runtime); the two
  // `new Midi(...)` calls below take the constructor from $core/Songs/midiConstructor, which is
  // where the reason lives - no static import of '@tonejs/midi' as a value works in every runtime
  // this app is evaluated in, and the default import that used to be here is what broke MIDI
  // import for users in the built app.
  import type { Midi } from '@tonejs/midi';
  import { Midi as MidiConstructor } from '$core/Songs/midiConstructor';

  let {
    data,
    functions,
  }: {
    data: {
      instruments: InstrumentData[];
      selectedColumn: number;
    };
    functions: {
      changeMidiVisibility: (override: boolean) => void;
      changePitch: (pitch: Pitch) => void;
      loadSong: (song: ComposedSong) => void;
    };
  } = $props();

  let fileName = $state('');
  let tracks: CustomTrack[] = $state([]);
  let bpm = $state(220);
  let offset = $state(0);
  let pitch: Pitch = $state('C');
  let accidentals = $state(0);
  let outOfRange = $state(0);
  let merged = $state(0);
  //instrument config recovered from one of our own exports; null for any foreign file
  let importedMetadata: MidiMetadata | null = $state(null);
  let totalNotes = $state(0);
  let includeAccidentals = $state(true);
  // QUIRK: ignoreEmptytracks (not ignoreEmptyTracks) is an intentional preserved typo.
  let ignoreEmptytracks = $state(false);
  let warnedOfExperimental = false;

  const midiInputsStyle = $derived(
    `background-color:${ThemeProvider.layer('primary', 0.2).toString()};color:${ThemeProvider.getText('primary').toString()}`
  );

  async function handleFile(files: FileElement<ArrayBuffer>[]) {
    try {
      if (files.length === 0) return;
      const file = files[0];
      const name = file.file.name;
      if (isVideoFormat(name)) {
        const audio = await extractAudio(file);
        parseAudioToMidi(audio, name);
      } else if (isAudioFormat(name)) {
        const audio = await extractAudio(file);
        parseAudioToMidi(audio, name);
      } else {
        const midi = new MidiConstructor(file.data as ArrayBuffer);
        return mandleMidiFile(midi, name);
      }
    } catch (e) {
      console.error(e);
      logger.hidePill();
      logger.error(t('logs:error_opening_file'));
    }
  }

  async function extractAudio(audio: FileElement<ArrayBuffer>): Promise<AudioBuffer> {
    const ctx = new AudioContext({
      sampleRate: 22050,
    });
    const buffer = (await new Promise((res, rej) => {
      ctx!.decodeAudioData(audio.data as ArrayBuffer, res, rej);
    })) as AudioBuffer;
    ctx.close();
    return buffer;
  }

  async function parseAudioToMidi(audio: AudioBuffer, name: string) {
    if (!warnedOfExperimental) logger.warn(t('composer:midi_parser.audio_conversion_warning'));
    warnedOfExperimental = true;
    const frames: number[][] = [];
    const onsets: number[][] = [];
    const model = `${base}/assets/audio-midi-model.json`;
    logger.showPill(`${t('composer:midi_parser.detecting_notes')}...`);
    const { BasicPitch, noteFramesToTime, outputToNotesPoly } = await basicPitchLoader();
    const basicPitch = new BasicPitch(model);
    const mono = audio.getChannelData(0);
    await basicPitch.evaluateModel(
      mono,
      (f, o) => {
        frames.push(...f);
        onsets.push(...o);
      },
      (progress) => {
        logger.showPill(
          `${t('composer:midi_parser.detecting_notes')}: ${Math.floor(progress * 100)}%...`
        );
      }
    );
    logger.showPill(t('composer:midi_parser.converting_audio_to_midi'));
    await delay(300);
    const notes = noteFramesToTime(
      outputToNotesPoly(
        frames, //frames
        onsets, //onsets
        0.5, //onsetThreshold
        0.3, //frameThreshold
        11, //minimumDuration
        true, //inferOnsets
        3000, //maxHz
        0, //minHz
        true //smooth
      )
    );
    const midi = new MidiConstructor();
    const track = midi.addTrack();
    notes.forEach((note) => {
      track.addNote({
        midi: note.pitchMidi,
        time: note.startTimeSeconds,
        duration: note.durationSeconds,
        velocity: note.amplitude,
      });
    });
    logger.hidePill();
    mandleMidiFile(midi, name);
  }

  // QUIRK: mandleMidiFile (not handleMidiFile) is an intentional preserved typo.
  function mandleMidiFile(midi: Midi, name: string) {
    try {
      const midiBpm = midi.header.tempos[0]?.bpm;
      const key = midi.header.keySignatures[0]?.key;
      //Only the instrument configuration comes from metadata, and only when the file is one of
      //ours. Everything musical below — tempo, placement, note lengths — is still read off the
      //MIDI itself, so importing our own export exercises the same code a foreign file does.
      importedMetadata = decodeMidiMetadata(midi.header.meta ?? []);
      tracks = midi.tracks.map((track, i) => {
        const customtrack: CustomTrack = {
          track,
          selected: true,
          //one track per layer where the song has the layers for it, instead of stacking
          //everything on layer 0 — two layers sounding the same id in one column used to
          //collide and lose a note to the dedupe, which is unrecoverable
          layer: Math.min(
            i,
            Math.max(0, (importedMetadata?.instruments ?? data.instruments).length - 1)
          ),
          name: track.name || `Track n.${i + 1}`,
          numberOfAccidentals: 0,
          maxScaling: 0,
          outOfRangeBounds: {
            lower: 0,
            upper: 0,
          },
          localOffset: null,
        };
        return customtrack;
      });
      fileName = name;
      //round, not floor: this is the inverse of toMidi's setTempo(bpm / 4), and the tempo
      //survives serialization as an integer microseconds-per-quarter, so the value coming
      //back can sit a hair under the original and lose a whole bpm to truncation
      bpm = Math.round(midiBpm * 4) || 220;
      offset = 0;
      //`pitch` is a playback setting here, not a transposition of the written notes, so it
      //rides in the metadata alongside the rest of the instrument config. The key signature is
      //still preferred when a foreign file supplies one.
      pitch = PITCHES.find((candidate) => candidate === key) ?? importedMetadata?.pitch ?? 'C';
      if (tracks.length) convertMidi();
    } catch (e) {
      console.error(e);
      logger.error(t('composer:midi_parser.error_is_file_midi'));
    }
  }

  function convertMidi() {
    const selectedTracks = tracks.filter((track) => track.selected);
    //the file's own layer roster when it is one of our exports, otherwise the layers the open
    //composer song already has — which is what this screen has always mapped tracks onto
    const layers = importedMetadata?.instruments ?? data.instruments;
    const result = importMidiTracks(
      selectedTracks.map((track) => ({
        notes: track.track.notes,
        layer: track.layer,
        localOffset: track.localOffset,
        maxScaling: track.maxScaling,
      })),
      {
        bpm,
        offset,
        includeAccidentals,
        //capability comes from instrument config, so a game gains sustained imports the
        //moment it gains a sustaining instrument — nothing here knows which game is loaded
        layerSustains: layers.map((ins) => instrumentSupportsSustain(ins.name)),
      }
    );
    selectedTracks.forEach((track, index) => {
      const stats = result.perTrack[index];
      track.numberOfAccidentals = stats.accidentals;
      track.outOfRangeBounds.lower = stats.outOfRangeLower;
      track.outOfRangeBounds.upper = stats.outOfRangeUpper;
    });
    const columns = result.columns;
    const song = new ComposedSong('Untitled');
    //initColumnsForConstruction, not a mutator: this song is being BUILT here and is handed to loadSong below,
    //so nothing is subscribed to it yet and there is no version to bump
    song.initColumnsForConstruction(columns);
    //enforce the no-overlap Duration invariant over the imported spans
    song.normalizeSpans();
    song.bpm = bpm;
    song.instruments = layers.map((ins) => ins.clone());
    song.pitch = pitch;
    if (importedMetadata) song.reverb = importedMetadata.reverb;
    const lastColumn = data.selectedColumn;
    song.selected = lastColumn < song.columns.length ? lastColumn : 0;
    if (song.columns.length === 0) {
      return logger.warn(t('composer:midi_parser.there_are_no_notes'));
    }
    functions.loadSong(song);
    accidentals = result.accidentals;
    totalNotes = result.totalNotes;
    outOfRange = result.outOfRange;
    merged = result.merged;
  }

  // data here shadows this component's own data prop - fine today since this function only
  // mutates tracks[index], but code added later that needs the outer prop would silently get
  // this local instead.
  function editTrack(index: number, data: Partial<CustomTrack>) {
    Object.assign(tracks[index], data);
    if (tracks.length > 0) convertMidi();
  }

  function suggestGlobalOffset() {
    const selected = tracks.filter((track) => track.selected);
    const notes = selected.flatMap((track) => track.track.notes.map((n) => ({ midi: n.midi })));
    if (notes.length === 0) {
      //reachable with every track deselected, and a button that does nothing at all reads as
      //broken rather than as "nothing to work on"
      return logger.warn(t('composer:midi_parser.there_are_no_notes'));
    }
    //score against the instruments the selected tracks actually land on, so a gapped layout
    //(Sky's Bells, its SFX sets) counts the notes it would strand rather than only the ones
    //the game-wide map rejects
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local accumulator, never UI-observed
    const playable = new Set<number>();
    for (const track of selected) {
      for (const id of playableIdsOf(data.instruments[track.layer]?.name ?? '')) playable.add(id);
    }
    const suggestion = suggestOffset(notes, playable);
    changeOffset(suggestion.offset);
    logger.success(
      t('composer:midi_parser.suggested_offset', {
        offset: `${suggestion.offset}`,
        accidentals: `${suggestion.accidentals}`,
        stranded: `${suggestion.stranded}`,
      })
    );
  }

  function changeOffset(value: number) {
    if (!Number.isInteger(value)) value = 0;
    if (offset === value) return;
    offset = value;
    if (tracks.length > 0) convertMidi();
  }

  function changePitch(value: Pitch) {
    functions.changePitch(value);
    pitch = value;
  }

  function toggleAccidentals() {
    includeAccidentals = !includeAccidentals;
    if (tracks.length > 0) convertMidi();
  }

  function changeBpm(value: number) {
    if (!Number.isInteger(value)) value = 0;
    if (bpm === value) return;
    bpm = value;
    if (tracks.length > 0) convertMidi();
  }
</script>

<DecoratedCard class="floating-midi" size="1.2rem" isRelative={false} offset="0.1rem">
  <Column class="floating-midi-content" gap="0.3rem">
    <Row class="separator-border" align="center" style="width:100%">
      <FilePicker onPick={handleFile} as="buffer">
        <button class="midi-btn" style="{midiInputsStyle};white-space:nowrap">
          {t('composer:midi_parser.open_midi_audio_file')}
        </button>
      </FilePicker>
      <div style="margin:0 0.5rem" class="text-ellipsis">
        {fileName}
      </div>
      <button
        class="midi-btn"
        style="margin-left:auto;{midiInputsStyle}"
        onclick={() => functions.changeMidiVisibility(false)}
      >
        {t('common:close')}
      </button>
    </Row>

    <Row justify="between" align="center">
      <div style="margin-right:0.5rem">{t('common:bpm')}:</div>
      <NumericalInput
        value={bpm}
        onChange={changeBpm}
        delay={600}
        style={midiInputsStyle}
        step={5}
      />
    </Row>
    <Row justify="between" align="center">
      <div class="row flex-centered">
        <span style="margin-right:0.5rem">{t('composer:midi_parser.global_note_offset')}: </span>
        <HelpTooltip buttonStyle="width:1.2rem;height:1.2rem">
          {t('composer:midi_parser.global_note_offset_description')}
        </HelpTooltip>
      </div>
      <Row align="center" style="gap:0.4rem">
        <button
          class="midi-suggest-button"
          disabled={tracks.length === 0}
          onclick={suggestGlobalOffset}
        >
          {t('composer:midi_parser.suggest_offset')}
        </button>
        <NumericalInput
          value={offset}
          onChange={changeOffset}
          delay={600}
          style={midiInputsStyle}
          step={1}
        />
      </Row>
    </Row>
    <Row justify="between" align="center">
      <div style="margin-right:0.5rem">{t('common:pitch')}:</div>
      <PitchSelect style="width:5rem;{midiInputsStyle}" selected={pitch} onChange={changePitch} />
    </Row>
    <Row justify="between" align="center">
      <Row align="center">
        <div style="margin-right:0.5rem">{t('composer:midi_parser.include_accidentals')}:</div>
        <Switch
          checked={includeAccidentals}
          onchange={toggleAccidentals}
          styleOuter={midiInputsStyle}
        />
      </Row>
      <Row align="center">
        <div style="margin-right:0.5rem">{t('composer:midi_parser.ignore_empty_tracks')}:</div>
        <Switch
          checked={ignoreEmptytracks}
          onchange={(b) => (ignoreEmptytracks = b)}
          styleOuter={midiInputsStyle}
        />
      </Row>
    </Row>
    {#if tracks.length > 0}
      <Column class="separator-border" style="width:100%">
        <Column style="width:100%">
          <div style="text-align:center">{t('composer:midi_parser.select_midi_tracks')}</div>
          {#each tracks as track, i (i)}
            {#if !(ignoreEmptytracks && track.track.notes.length === 0)}
              <TrackInfo
                data={track}
                instruments={data.instruments}
                index={i}
                onChange={editTrack}
              />
            {/if}
          {/each}
        </Column>
      </Column>
    {/if}
    {#if tracks.length > 0}
      <table>
        <tbody>
          <tr>
            <td>{t('composer:midi_parser.total_notes')}:</td>
            <td></td>
            <td>{totalNotes}</td>
          </tr>
          <tr>
            <td>{t('composer:midi_parser.accidentals')}:</td>
            <td></td>
            <td>{accidentals}</td>
          </tr>
          <tr>
            <td>{t('composer:midi_parser.out_of_range')}:</td>
            <td></td>
            <td>{outOfRange}</td>
          </tr>
          {#if merged > 0}
            <tr>
              <td>{t('composer:midi_parser.merged_notes')}:</td>
              <td></td>
              <td>{merged}</td>
            </tr>
          {/if}
        </tbody>
      </table>
    {/if}
  </Column>
</DecoratedCard>

<style>
  .midi-suggest-button {
    background-color: var(--primary);
    color: var(--primary-text);
    border: none;
    border-radius: 0.3rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .midi-suggest-button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
