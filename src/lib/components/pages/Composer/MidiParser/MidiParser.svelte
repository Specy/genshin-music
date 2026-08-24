<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { base } from '$app/paths';
  import { BASE_LAYER_LIMIT, PITCHES } from '$core/sharedConfig';
  import type { Pitch } from '$lib/games/types';
  import { basicPitchLoader } from '$lib/audio/BasicPitchLoader';
  import { logger } from '$stores/LoggerStore.svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import { importMidiTracks, playableIdsOf, suggestOffset } from '$core/Songs/midiImport';
  import { basepointOffset } from '$core/Songs/noteIds';
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
  import { buildMidiTrackRoster, type CustomTrack } from './midiTrackRoster';
  import NumericalInput from './NumericalInput.svelte';
  import MidiStatsTable from './MidiStatsTable.svelte';
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
    initialFile = null,
  }: {
    data: {
      selectedColumn: number;
    };
    functions: {
      changeMidiVisibility: (override: boolean) => void;
      loadSong: (song: ComposedSong, options?: { preview?: boolean }) => void;
    };
    /**
     * A file that already made the app open this screen (dropped on a menu that can't parse it):
     * parsed on mount so the user isn't asked to pick the same file twice. Read once at mount -
     * this component is mounted/unmounted with the modal, so "opened again" means a fresh mount.
     */
    initialFile?: File | null;
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
  let warnedOfExperimental = false;
  // Parsing audio/video can outlive this import session by several seconds. A closed importer must
  // never install that stale result over the song after the lock has gone (or over a newer import).
  let componentAlive = true;

  onDestroy(() => {
    componentAlive = false;
    logger.hidePill();
  });

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
        if (!componentAlive) return;
        return await parseAudioToMidi(audio, name);
      } else if (isAudioFormat(name)) {
        const audio = await extractAudio(file);
        if (!componentAlive) return;
        return await parseAudioToMidi(audio, name);
      } else {
        const midi = new MidiConstructor(file.data as ArrayBuffer);
        if (componentAlive) return mandleMidiFile(midi, name);
      }
    } catch (e) {
      if (!componentAlive) return;
      console.error(e);
      logger.hidePill();
      logger.error(t('logs:error_opening_file'));
    }
  }

  // The handed-over file goes through handleFile untouched, i.e. the exact path a manual pick
  // takes: FilePicker(as="buffer") hands over the file's ArrayBuffer plus the File itself, which
  // is what tells midi from audio from video below (by name, not by content).
  onMount(() => {
    const file = initialFile;
    if (!file) return;
    void (async () => {
      try {
        const data = await file.arrayBuffer();
        if (!componentAlive) return;
        await handleFile([{ data, file }]);
      } catch (e) {
        if (!componentAlive) return;
        console.error(e);
        logger.error(t('logs:error_opening_file'));
      }
    })();
  });

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
    logger.showPill(`${t('composer:midi_parser.detecting_notes')}...`, { spinner: true });
    const { BasicPitch, noteFramesToTime, outputToNotesPoly } = await basicPitchLoader();
    if (!componentAlive) return;
    const basicPitch = new BasicPitch(model);
    const mono = audio.getChannelData(0);
    await basicPitch.evaluateModel(
      mono,
      (f, o) => {
        frames.push(...f);
        onsets.push(...o);
      },
      (progress) => {
        if (!componentAlive) return;
        logger.showPill(
          `${t('composer:midi_parser.detecting_notes')}: ${Math.floor(progress * 100)}%...`,
          { spinner: true }
        );
      }
    );
    if (!componentAlive) return;
    logger.showPill(t('composer:midi_parser.converting_audio_to_midi'), { spinner: true });
    await delay(300);
    if (!componentAlive) return;
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
    if (!componentAlive) return;
    logger.hidePill();
    mandleMidiFile(midi, name);
  }

  // QUIRK: mandleMidiFile (not handleMidiFile) is an intentional preserved typo.
  function mandleMidiFile(midi: Midi, name: string) {
    if (!componentAlive) return;
    try {
      const midiBpm = midi.header.tempos[0]?.bpm;
      const key = midi.header.keySignatures[0]?.key;
      //Only the instrument configuration comes from metadata, and only when the file is one of
      //ours. Everything musical below — tempo, placement, note lengths — is still read off the
      //MIDI itself, so importing our own export exercises the same code a foreign file does.
      importedMetadata = decodeMidiMetadata(midi.header.meta ?? []);
      tracks = buildMidiTrackRoster(midi.tracks, importedMetadata?.instruments ?? null);
      fileName = name;
      //round, not floor: this is the inverse of toMidi's setTempo(bpm / 4), and the tempo
      //survives serialization as an integer microseconds-per-quarter, so the value coming
      //back can sit a hair under the original and lose a whole bpm to truncation
      bpm = Math.round(midiBpm * 4) || 220;
      offset = 0;
      //`pitch` is the Basepoint the imported song will carry, so it rides in the metadata
      //alongside the rest of the instrument config. The key signature is still preferred when a
      //foreign file supplies one. Since ADR-0007 it also decides what the emitted notes ARE (the
      //snapped nominals are lifted by it), which is why convertMidi below is re-run on any change.
      pitch = PITCHES.find((candidate) => candidate === key) ?? importedMetadata?.pitch ?? 'C';
      //a file whose every track was filtered out above has nothing to convert, and both the track
      //list and the summary table are gated on `tracks.length` - without this the screen would
      //show the filename and then say nothing at all, which reads as a broken importer
      if (tracks.length === 0) return logger.warn(t('composer:midi_parser.there_are_no_notes'));
      if (tracks.length > BASE_LAYER_LIMIT) warnTrackLimit();
      convertMidi();
    } catch (e) {
      console.error(e);
      logger.error(t('composer:midi_parser.error_is_file_midi'));
    }
  }

  function convertMidi() {
    const selectedTracks = tracks.filter((track) => track.selected);
    for (const track of tracks) {
      track.numberOfAccidentals = 0;
      track.outOfRangeBounds.lower = 0;
      track.outOfRangeBounds.upper = 0;
    }
    if (selectedTracks.length === 0) {
      accidentals = 0;
      totalNotes = 0;
      outOfRange = 0;
      merged = 0;
      return logger.warn(t('composer:midi_parser.there_are_no_notes'));
    }

    // The selected set IS the generated roster. Its file-order position is therefore both the
    // import layer and the destination song layer; no state from the open composer participates.
    const layers = selectedTracks.map((track) => track.instrument);
    const result = importMidiTracks(
      selectedTracks.map((track, layer) => ({
        notes: track.track.notes,
        layer,
        localOffset: track.localOffset,
        maxScaling: track.maxScaling,
      })),
      {
        bpm,
        offset,
        includeAccidentals,
        //the Basepoint the song below is given: the importer takes it off every incoming number
        //and puts it back on every emitted one (ADR-0007), so the two must be the same value
        pitch,
        //the layers themselves, not a capability flag derived from them: the importer needs each
        //layer's instrument to know what a snapped nominal sounds there, and reads the sustain
        //capability off the same config — nothing here knows which game is loaded
        layers,
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
    song.instruments = layers.map((instrument) => instrument.clone());
    song.pitch = pitch;
    if (importedMetadata) song.reverb = importedMetadata.reverb;
    const lastColumn = data.selectedColumn;
    song.selected = lastColumn < song.columns.length ? lastColumn : 0;
    if (song.columns.length === 0) {
      return logger.warn(t('composer:midi_parser.there_are_no_notes'));
    }
    if (!componentAlive) return;
    functions.loadSong(song, { preview: true });
    accidentals = result.accidentals;
    totalNotes = result.totalNotes;
    outOfRange = result.outOfRange;
    merged = result.merged;
  }

  function warnTrackLimit() {
    logger.warn(
      t('composer:cant_add_more_than_n_layers', {
        max_layers: BASE_LAYER_LIMIT,
      })
    );
  }

  function editTrack(index: number, update: Partial<CustomTrack>) {
    const track = tracks[index];
    if (!track) return;
    if (
      update.selected === true &&
      !track.selected &&
      tracks.filter((candidate) => candidate.selected).length >= BASE_LAYER_LIMIT
    ) {
      return warnTrackLimit();
    }
    Object.assign(track, update);
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
      for (const id of playableIdsOf(track.instrument.name)) playable.add(id);
    }
    //scored in GRID space, which is where the importer snaps: the Basepoint comes off there
    //first, so it has to come off here too or the suggestion optimises a shift of the wrong
    //notes. The offset it answers is still in the file's own space — the reduction cancels.
    const suggestion = suggestOffset(
      notes.map(({ midi }) => ({ midi: midi - basepointOffset(pitch) })),
      playable
    );
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
    pitch = value;
    //the Basepoint is an input to the CONVERSION now, not just a playback label the composer
    //keeps beside it: re-run so the preview the user is looking at is the song they would load
    if (tracks.length > 0) convertMidi();
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
    <Row align="center" style="width:100%">
      <FilePicker onPick={handleFile} as="buffer">
        <button class="midi-btn" style="{midiInputsStyle};white-space:nowrap">
          {t('composer:midi_parser.open_midi_audio_file')}
        </button>
      </FilePicker>
      <div style="margin:0 0.5rem;{fileName ? '' : 'opacity:0.6'}" class="text-ellipsis">
        {fileName || t('composer:midi_parser.no_file_selected')}
      </div>
      <button
        class="midi-btn"
        style="margin-left:auto;{midiInputsStyle}"
        onclick={() => functions.changeMidiVisibility(false)}
      >
        {t('common:close')}
      </button>
    </Row>

    <fieldset class={['midi-section', tracks.length === 0 && 'midi-section-disabled']}>
      <legend>{t('composer:midi_parser.import_settings')}</legend>
      <Column gap="0.3rem" style="width:100%">
        <Row justify="between" align="center">
          <div style="margin-right:0.5rem">{t('composer:midi_parser.tempo_bpm')}:</div>
          <NumericalInput value={bpm} onChange={changeBpm} delay={600} step={5} />
        </Row>
        <Row justify="between" align="center">
          <div class="row flex-centered">
            <span style="margin-right:0.5rem"
              >{t('composer:midi_parser.global_note_offset')}:
            </span>
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
            <NumericalInput value={offset} onChange={changeOffset} delay={600} step={1} />
          </Row>
        </Row>
        <Row justify="between" align="center">
          <div style="margin-right:0.5rem">{t('composer:midi_parser.base_pitch')}:</div>
          <PitchSelect
            style="width:5rem;{midiInputsStyle}"
            selected={pitch}
            onChange={changePitch}
          />
        </Row>
        <Row justify="between" align="center">
          <div style="margin-right:0.5rem">{t('composer:midi_parser.include_accidentals')}:</div>
          <Switch
            checked={includeAccidentals}
            onchange={toggleAccidentals}
            styleOuter={midiInputsStyle}
          />
        </Row>
      </Column>
    </fieldset>
    {#if tracks.length > 0}
      <fieldset class="midi-section">
        <legend>{t('composer:midi_parser.track_settings')}</legend>
        <Column style="width:100%">
          {#each tracks as track, i (i)}
            <TrackInfo data={track} index={i} onChange={editTrack} />
          {/each}
        </Column>
      </fieldset>
      <MidiStatsTable notes={totalNotes} {accidentals} {outOfRange} />
      {#if merged > 0}
        <Row justify="between" align="center" style="width:100%">
          <div>{t('composer:midi_parser.merged_notes')}:</div>
          <div>{merged}</div>
        </Row>
      {/if}
    {/if}
  </Column>
</DecoratedCard>

<style>
  /* A real fieldset/legend: the browser breaks the border under the title on its own, which no
     background-matched overlay can do over this card - it is translucent (.floating-midi). */
  .midi-section {
    width: 100%;
    margin: 0;
    padding: 0.2rem 0.6rem 0.5rem;
    border: solid 0.1rem var(--secondary);
    border-radius: 0.3rem;
    min-inline-size: min-content;
  }

  .midi-section legend {
    padding: 0 0.3rem;
    font-weight: bold;
  }

  /* No file yet: the settings are inert, and they LOOK it. The cursor lives on the fieldset -
     which keeps its pointer events - because a pointer-events:none element shows no cursor at
     all; only the content below it is made unreachable. */
  .midi-section-disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .midi-section-disabled > :global(*) {
    pointer-events: none;
  }

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
